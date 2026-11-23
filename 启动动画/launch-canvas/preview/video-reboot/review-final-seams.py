"""抽取终片交接和循环边界供人工复核；只记录哈希，不自动批准。"""
import argparse
import hashlib
import json
from pathlib import Path
import cv2
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--themes', required=True)
args = parser.parse_args()
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
reports = {}
for theme_id in args.themes.split(','):
    target = root / 'resources/gallery/video' / theme_id
    output = root / 'preview/video-reboot/generated' / theme_id
    clips, hashes = {}, {}
    for slot in ['cold', 'warm', 'background']:
        path = target / f'{slot}.mp4'
        with path.open('rb') as file: hashes[slot] = hashlib.file_digest(file, 'sha256').hexdigest()
        capture = cv2.VideoCapture(str(path))
        clips[slot] = {'capture': capture, 'frames': int(capture.get(cv2.CAP_PROP_FRAME_COUNT)), 'fps': capture.get(cv2.CAP_PROP_FPS)}
    sheet = Image.new('RGB', (1920, 900), '#151b22')
    draw = ImageDraw.Draw(sheet)
    face = Image.new('RGB', (1920, 1120), '#151b22')
    face_draw = ImageDraw.Draw(face)
    for row, slot in enumerate(['cold', 'warm', 'background']):
        count = clips[slot]['frames']
        entry = round(clips['background']['fps'] * .5)
        samples = [(slot, count - 9), (slot, count - 2), ('background', entry), ('background', entry + 3)] if slot != 'background' else [(slot, count - 4), (slot, count - 1), (slot, 0), (slot, 3)]
        for column, (key, index) in enumerate(samples):
            capture = clips[key]['capture']
            capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = capture.read()
            if not ok: raise ValueError(f'{theme_id}/{key} 第{index}帧解码失败')
            text = f'{slot} → {key} {index / clips[key]["fps"]:.3f}s'
            image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            image.thumbnail((480, 270))
            sheet.paste(image, (column * 480, row * 300 + 27))
            draw.text((column * 480 + 8, row * 300 + 3), text, font=font, fill='#deeee8')
            if row < 2:
                height, width = frame.shape[:2]
                image = Image.fromarray(cv2.cvtColor(frame[int(height * .05):int(height * .77), int(width * .47):int(width * .84)], cv2.COLOR_BGR2RGB))
                image.thumbnail((480, 530))
                face.paste(image, (column * 480, row * 560 + 27))
                face_draw.text((column * 480 + 8, row * 560 + 3), text, font=font, fill='#deeee8')
    for clip in clips.values(): clip['capture'].release()
    sheet.save(output / 'final-seams.jpg', quality=95)
    face.save(output / 'final-seams-face.jpg', quality=95)
    (output / 'final-review-files.json').write_text(json.dumps(hashes, indent=2), 'utf-8')
    reports[theme_id] = hashes
print(json.dumps(reports, indent=2))
