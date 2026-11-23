"""生成高运动区间局部抽帧和全帧连续性线索；不自动判定视觉通过。"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent / 'generated'
parser = argparse.ArgumentParser()
parser.add_argument('--themes', required=True)
args = parser.parse_args()
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
scene_ids = {'aurora', 'sakura', 'city', 'ocean', 'orbit', 'ink', 'forest', 'crystal'}
reports = {}

for theme_id in args.themes.split(','):
    folder = root / theme_id
    report = {}
    for slot in ['cold', 'warm', 'background']:
        job_file = folder / slot / 'job.json'
        if not job_file.exists(): continue
        job = json.loads(job_file.read_text('utf-8-sig'))
        if job['status'] != 'completed': continue
        capture = cv2.VideoCapture(job['file'])
        fps = capture.get(cv2.CAP_PROP_FPS)
        frames, deltas, previous = 0, [], None
        while True:
            ok, frame = capture.read()
            if not ok: break
            small = cv2.resize(frame, (480, 270)).astype(np.float32)
            if previous is not None: deltas.append(float(np.abs(small - previous).mean()))
            previous = small
            frames += 1
        if not deltas:
            report[slot] = {'error': '没有完整可解码帧'}
            capture.release()
            continue
        peaks = []
        for index in np.argsort(deltas)[::-1]:
            if all(abs(int(index) - chosen) > fps * .6 for chosen in peaks): peaks.append(int(index))
            if len(peaks) >= 3: break
        report[slot] = {
            'decodedFrames': frames,
            'medianDelta': round(float(np.median(deltas)), 3),
            'p95Delta': round(float(np.percentile(deltas, 95)), 3),
            'maxDelta': round(float(max(deltas)), 3),
            'peaks': [{'seconds': round((index + 1) / fps, 3), 'delta': round(deltas[index], 3)} for index in peaks]
        }
        if slot in ['cold', 'warm']:
            indices = sorted(set(max(0, min(frames - 1, index + offset)) for index in peaks for offset in [-4, 4])) if slot == 'cold' else np.linspace(0, frames - 1, 6).astype(int)
            sheet = Image.new('RGB', (1800, 900), '#141b23')
            draw = ImageDraw.Draw(sheet)
            for number, index in enumerate(indices):
                capture.set(cv2.CAP_PROP_POS_FRAMES, index)
                ok, frame = capture.read()
                if not ok: continue
                height, width = frame.shape[:2]
                if theme_id not in scene_ids:
                    frame = frame[:int(height * .92), int(width * .38):] if slot == 'cold' else frame[int(height * .05):int(height * .65), int(width * .55):int(width * .97)]
                image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                image.thumbnail((600, 420))
                x, y = number % 3 * 600, number // 3 * 450
                sheet.paste(image, (x + (600 - image.width) // 2, y + 28))
                draw.text((x + 10, y + 3), f'{theme_id} {slot} {index / fps:.2f}s', font=font, fill='#dcebe6')
            sheet.save(folder / ('motion-detail.jpg' if slot == 'cold' else 'warm-detail.jpg'), quality=95)
        capture.release()
    (folder / 'frame-continuity.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    reports[theme_id] = report
print(json.dumps(reports, ensure_ascii=False, indent=2))
