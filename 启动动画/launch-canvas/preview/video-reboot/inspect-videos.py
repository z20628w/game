"""提取真实视频抽帧与质量线索，供人工验收；分数不是自动通过标记。"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--themes', default='')
args = parser.parse_args()
selected = args.themes.split(',') if args.themes else []
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)

def read_frame(cap, index):
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, index))
    ok, frame = cap.read()
    if not ok:
        raise ValueError(f'无法解码帧 {index}')
    return frame

def preview(frame):
    return cv2.resize(frame, (480, 270), interpolation=cv2.INTER_AREA)

def difference(a, b):
    return float(np.abs(preview(a).astype(np.float32) - preview(b)).mean())

def camera(reference, frame):
    a = cv2.cvtColor(preview(reference), cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(preview(frame), cv2.COLOR_BGR2GRAY)
    mask = np.zeros(a.shape, np.uint8)
    mask[25:-15, 15:220] = 255
    orb = cv2.ORB_create(1800)
    ka, da = orb.detectAndCompute(a, mask)
    kb, db = orb.detectAndCompute(b, mask)
    if da is None or db is None: return None
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2)
    good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < .72 * p[1].distance]
    if len(good) < 16: return None
    src = np.float32([ka[m.queryIdx].pt for m in good])
    dst = np.float32([kb[m.trainIdx].pt for m in good])
    transform, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=1.5)
    if transform is None or inliers.sum() < 12: return None
    scale = float(np.hypot(transform[0, 0], transform[0, 1]))
    return {'scale': round(scale, 5), 'x': round(float(transform[0, 2]), 2), 'y': round(float(transform[1, 2]), 2), 'inliers': int(inliers.sum())}

reports = {}
for folder in sorted((ROOT / 'generated').glob('*')):
    if selected and folder.name not in selected: continue
    sheet = Image.new('RGB', (6 * 320, 3 * 210), '#141b23')
    draw = ImageDraw.Draw(sheet)
    report, ends = {}, {}
    for row, slot in enumerate(['cold', 'warm', 'background']):
        state_file = folder / slot / 'job.json'
        if not state_file.exists(): continue
        job = json.loads(state_file.read_text('utf-8-sig'))
        if job['status'] != 'completed':
            report[slot] = {'status': job['status']}
            continue
        cap = cv2.VideoCapture(job['file'])
        count, fps = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), cap.get(cv2.CAP_PROP_FPS)
        indices = np.linspace(0, count - 1, 6).astype(int)
        frames = [read_frame(cap, int(index)) for index in indices]
        ends[slot] = [frames[0], frames[-1]]
        report[slot] = {
            'duration': count / fps, 'fps': fps, 'frames': count,
            'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), 'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            'loopEndpointMae': round(difference(frames[0], frames[-1]), 3),
            'cameraSamples': [camera(frames[0], frame) for frame in frames[1:]],
        }
        for column, (frame, index) in enumerate(zip(frames, indices)):
            thumb = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            thumb.thumbnail((320, 180))
            sheet.paste(thumb, (column * 320 + (320 - thumb.width) // 2, row * 210 + 27))
            draw.text((column * 320 + 8, row * 210 + 2), f'{slot}  {index / fps:.2f}s', font=font, fill='#deeee8')
        cap.release()
    if 'background' in ends:
        report['handoffMae'] = {slot: round(difference(pair[-1], ends['background'][0]), 3) for slot, pair in ends.items() if slot != 'background'}
    reports[folder.name] = report
    if ends:
        sheet.save(folder / 'contact-sheet.jpg', quality=92)
    (folder / 'inspection.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(reports, ensure_ascii=False, indent=2))
