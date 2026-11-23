"""生成本项目原创的几何商品示意图，仅用于演示。需要 Pillow。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

target = Path(__file__).resolve().parent.parent / 'demo-media'
target.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 24)
for kind, label, bg, ink in [
    ('cup', '01 / 弧线陶瓷杯', '#e7ecdf', '#819779'),
    ('bag', '02 / 日常帆布包', '#eee9df', '#b19c7e'),
    ('lamp', '03 / 阅读台灯', '#e2e9e7', '#456b61'),
    ('notebook', '04 / 灵感笔记本', '#e8e4df', '#789a89')
]:
    im = Image.new('RGB', (1200, 1200), bg)
    shadow = Image.new('RGBA', im.size)
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((280, 860, 950, 960), fill=(35, 45, 33, 45))
    shadow = shadow.filter(ImageFilter.GaussianBlur(35))
    im = Image.alpha_composite(im.convert('RGBA'), shadow)
    d = ImageDraw.Draw(im)
    if kind == 'cup':
        d.rounded_rectangle((700, 400, 956, 770), radius=100, fill=ink)
        d.rounded_rectangle((755, 455, 894, 707), radius=65, fill=bg)
        d.rounded_rectangle((300, 350, 800, 900), radius=100, fill=ink)
        d.ellipse((300, 300, 800, 460), fill='#b4c3a9')
        d.ellipse((337, 326, 763, 428), fill='#586f53')
        d.arc((318, 330, 782, 865), 80, 110, fill='#c1cfb9', width=12)
    elif kind == 'bag':
        d.arc((385, 190, 815, 710), 180, 360, fill=ink, width=58)
        d.polygon([(300, 435), (880, 435), (920, 930), (260, 930)], fill=ink)
        d.line((325, 465, 295, 897, 884, 897, 854, 465), fill='#cfc0aa', width=4)
        d.rounded_rectangle((470, 610, 710, 735), 12, fill='#e1d9c8')
        d.line((510, 673, 665, 673), fill=ink, width=5)
    elif kind == 'lamp':
        d.ellipse((340, 835, 860, 955), fill='#274d44')
        d.rounded_rectangle((580, 410, 615, 886), radius=15, fill=ink)
        d.polygon([(455, 260), (740, 260), (885, 560), (300, 560)], fill=ink)
        d.ellipse((300, 520, 885, 610), fill='#c7cfb1')
        d.ellipse((390, 542, 795, 588), fill='#f9e8bb')
    else:
        d.rounded_rectangle((330, 260, 870, 925), 25, fill='#f5f1e8')
        d.rounded_rectangle((300, 240, 845, 890), 28, fill=ink)
        d.line((356, 240, 356, 890), fill='#567a68', width=8)
        d.rectangle((750, 240, 773, 890), fill='#315346')
        d.text((410, 450), '灵感 / 01', fill='#edf0dd', font=font)
        for y in range(490, 560, 25): d.line((410, y, 660, y), fill='#aac0b1', width=2)
    d.text((60, 58), '主题能力实验室', fill='#45594e', font=font)
    d.text((60, 1115), label, fill='#45594e', font=font)
    d.text((1090, 1115), '演示', fill='#45594e', font=font)
    im.convert('RGB').save(target / f'{kind}.png', optimize=True)
print('已生成 4 张原创演示商品示意图')
