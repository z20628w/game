"""原速拼接真实视频的循环边界与共享片尾；不生成静图动画，不写启用清单。"""
import argparse
import hashlib
import json
import os
import re
import subprocess
from fractions import Fraction
from itertools import islice
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
SLOTS = ('cold', 'warm', 'background')


def digest(file):
    value = hashlib.sha256()
    with Path(file).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def probe(file):
    process = subprocess.run([
        os.environ.get('FFPROBE_PATH', 'ffprobe'), '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration,size',
        '-of', 'json', str(file),
    ], check=True, capture_output=True, text=True, encoding='utf-8')
    info = json.loads(process.stdout)
    video = info['streams'][0]
    rate = Fraction(video['r_frame_rate'])
    frames = int(video['nb_frames'])
    return {'width': int(video['width']), 'height': int(video['height']), 'rate': str(rate),
            'fps': float(rate), 'frames': frames, 'durationMs': round(frames / float(rate) * 1000),
            'bytes': int(info['format']['size'])}


def frames(file):
    capture = cv2.VideoCapture(str(file))
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            yield frame
    finally:
        capture.release()


def sample(file, indices):
    selected = set(indices)
    result = {}
    for index, frame in enumerate(frames(file)):
        if index in selected:
            result[index] = frame
        if index >= max(selected):
            break
    if len(result) != len(selected):
        raise ValueError('输入视频解码帧数不足：' + str(file))
    return [result[index] for index in indices]


def difference(a, b):
    a = cv2.resize(a, (480, 270), interpolation=cv2.INTER_AREA).astype(np.float32)
    b = cv2.resize(b, (480, 270), interpolation=cv2.INTER_AREA).astype(np.float32)
    delta = np.abs(a - b).mean(axis=2)
    tiles = [delta[y:y + 45, x:x + 60].mean() for y in range(0, 270, 45) for x in range(0, 480, 60)]
    return {'mae': round(float(delta.mean()), 3), 'maxTileMae': round(float(max(tiles)), 3),
            'changedFraction': round(float((delta > 24).mean()), 4)}


def assert_alignment(left, right, label):
    metrics = [difference(a, b) for a, b in zip(left, right)]
    for metric in metrics:
        if metric['mae'] > 10 or metric['maxTileMae'] > 25 or metric['changedFraction'] > .12:
            raise ValueError(f'{label}姿态或光照差异过大，需重新生成，不能靠叠化掩盖：{metric}')
    return metrics


def mix(a, b, index, count):
    t = index / max(1, count - 1)
    weight = t * t * (3 - 2 * t)
    return cv2.addWeighted(a, 1 - weight, b, weight, 0)


def encode(file, info, stream, expected_frames):
    # 每帧只按原生时基输出；不增帧、减帧、倒放、缩放或裁水印。
    command = [os.environ.get('FFMPEG_PATH', 'ffmpeg'), '-y', '-v', 'error',
               '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-video_size', f"{info['width']}x{info['height']}",
               '-framerate', info['rate'], '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'slow',
               '-crf', '18', '-pix_fmt', 'yuv420p', '-g', str(round(info['fps'])),
               '-keyint_min', str(round(info['fps'])), '-sc_threshold', '0', '-movflags', '+faststart', str(file)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        count = 0
        for frame in stream:
            process.stdin.write(frame.tobytes())
            count += 1
        process.stdin.close()
        error = process.stderr.read().decode('utf-8', 'replace')
        if process.wait() != 0:
            raise ValueError('视频编码失败：' + error)
        metadata = probe(file)
        if metadata['frames'] != count or count != expected_frames:
            raise ValueError('编码前后帧数不一致')
        metadata['sha256'] = digest(file)
        return metadata
    except BaseException:
        if process.poll() is None:
            process.kill()
            process.wait()
        raise


def assemble(theme, output_root):
    folder = ROOT / 'generated' / theme
    report = {'theme': theme, 'technicalPassed': False, 'manualReviewRequired': True,
              'method': '原速真实视频；仅微小收尾进行约0.25秒缓动重叠，保留画幅与水印；无倒放、静图形变或模型替换'}
    try:
        sources, info = {}, {}
        for slot in SLOTS:
            job = json.loads((folder / slot / 'job.json').read_text('utf-8-sig'))
            if job.get('status') != 'completed':
                raise ValueError(f'{slot}尚未生成完成')
            sources[slot] = Path(job['file'])
            info[slot] = probe(sources[slot])
        review = json.loads((folder / 'visual-review.json').read_text('utf-8-sig'))
        source_hashes = {slot: digest(sources[slot]) for slot in SLOTS}
        if review.get('rawVisualReview') != 'pass' or any(review.get('rawReviewedFiles', {}).get(slot) != source_hashes[slot] for slot in SLOTS):
            raise ValueError('当前三段原片尚未完成匹配SHA256的视觉验收；不能沿用旧原片的结论')
        report['sourceSHA256'] = source_hashes
        base = info['background']
        if not all((item['width'], item['height'], item['rate']) == (base['width'], base['height'], base['rate']) for item in info.values()):
            raise ValueError('三段尺寸或帧率不一致，需要在源模型重新生成；不通过变速或裁图凑齐')
        overlap = max(2, round(base['fps'] * .25))
        shared = round(base['fps'] * .5)
        if shared <= overlap or base['frames'] < shared + overlap + 2:
            raise ValueError('视频过短或原生帧率过低，无法建立共享段')
        handoff = shared / base['fps']
        staged = output_root / ('.building-' + theme)
        staged.mkdir(parents=True, exist_ok=True)
        head = sample(sources['background'], range(overlap))
        tail = sample(sources['background'], range(base['frames'] - overlap, base['frames']))
        report['loopAlignment'] = assert_alignment(tail, head, '背景循环')

        def background_frames():
            for index, frame in enumerate(frames(sources['background'])):
                if overlap <= index < base['frames'] - overlap:
                    yield frame
                elif index >= base['frames'] - overlap:
                    offset = index - (base['frames'] - overlap)
                    yield mix(frame, head[offset], offset, overlap)

        clips = {'background': encode(staged / 'background.mp4', base, background_frames(), base['frames'] - overlap)}
        if clips['background']['bytes'] > 8 * 1024 * 1024:
            raise ValueError('背景超过8MiB，需要重新评估压缩质量和注入内存')
        common = sample(staged / 'background.mp4', range(shared + 1))
        # 三段都从同一组原始帧编码一次，避免共享片尾经历两次有损压缩和色彩转换。
        common_raw = list(islice(background_frames(), shared + 1))
        report['introAlignment'] = {}
        for slot in ('cold', 'warm'):
            count = info[slot]['frames']
            predicted = (count + shared - overlap) / base['fps']
            if not (.5 <= predicted < 10 if slot == 'cold' else 2.5 <= predicted <= 3.5):
                raise ValueError(f'{slot}拼接后为{predicted:.3f}秒，不符合时长；需要重新生成，不能变速')
            last = sample(sources[slot], range(count - overlap, count))
            report['introAlignment'][slot] = assert_alignment(last, common_raw[:overlap], slot + '收尾')

            def intro_frames():
                for index, frame in enumerate(frames(sources[slot])):
                    if index < count - overlap:
                        yield frame
                    else:
                        offset = index - (count - overlap)
                        yield mix(frame, common_raw[offset], offset, overlap)
                yield from common_raw[overlap:shared]

            clips[slot] = encode(staged / (slot + '.mp4'), info[slot], intro_frames(), count + shared - overlap)
        report['encodedHandoff'] = {}
        for slot in ('cold', 'warm'):
            endpoint = sample(staged / (slot + '.mp4'), [clips[slot]['frames'] - 1])[0]
            exact = difference(endpoint, common[shared - 1])
            adjacent = difference(endpoint, common[shared])
            if exact['mae'] > 2.5 or exact['maxTileMae'] > 6:
                raise ValueError(f'{slot}编码后共享末帧误差过大：{exact}')
            report['encodedHandoff'][slot] = {'sameFrame': exact, 'nextFrame': adjacent}
        loop_ends = sample(staged / 'background.mp4', [0, clips['background']['frames'] - 1])
        report['encodedLoop'] = difference(loop_ends[0], loop_ends[1])
        if report['encodedLoop']['mae'] > 5 or report['encodedLoop']['maxTileMae'] > 12:
            raise ValueError('编码后的循环边界仍有明显跳变，需要重新生成')
        report.update({'technicalPassed': True, 'handoffSeconds': handoff, 'overlapFrames': overlap,
                       'sharedFrames': shared, 'cleanSharedFrames': shared - overlap, 'clips': clips})
        final = output_root / theme
        final.mkdir(parents=True, exist_ok=True)
        for slot in SLOTS:
            os.replace(staged / (slot + '.mp4'), final / (slot + '.mp4'))
        staged.rmdir()
        report['output'] = str(final)
    except Exception as error:
        report['error'] = str(error)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'assembly-qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--themes', required=True, help='用逗号分隔的主题ID；每个主题必须已有三段原视频')
    parser.add_argument('--output-root', default=str(PROJECT / 'resources' / 'gallery' / 'video'))
    parser.add_argument('--summary', action='store_true', help='控制台只输出批次摘要，完整QA仍写入各主题文件')
    args = parser.parse_args()
    output = Path(args.output_root).resolve()
    if not output.is_relative_to(PROJECT.resolve()):
        raise ValueError('输出必须位于当前启动动画项目中')
    themes = args.themes.split(',')
    if not all(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', theme) for theme in themes):
        raise ValueError('主题ID无效')
    reports = [assemble(theme, output) for theme in themes]
    summary = [{'theme': item['theme'], 'technicalPassed': item['technicalPassed'],
                'durationMs': {slot: clip['durationMs'] for slot, clip in item.get('clips', {}).items()},
                'sameFrameMae': {slot: entry['sameFrame']['mae'] for slot, entry in item.get('encodedHandoff', {}).items()},
                'loopMae': item.get('encodedLoop', {}).get('mae'), **({'error': item['error']} if 'error' in item else {})}
               for item in reports]
    print(json.dumps(summary if args.summary else reports, ensure_ascii=False, indent=2))
    raise SystemExit(0 if all(report['technicalPassed'] for report in reports) else 1)


if __name__ == '__main__':
    main()
