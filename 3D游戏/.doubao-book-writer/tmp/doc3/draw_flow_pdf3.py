# -*- coding: utf-8 -*-
"""用 PyMuPDF 绘制《手机与PC浏览器3D游戏技术开发全流程》PDF 流程图。
页 1：总体开发流程（公司供给泳道 + 开发主流程 + 后端并行）。
页 2：前后端技术细节流程（前端列、后端列、联调、测试、上线两端出口）。
文本层：中文用子集黑体（flow_subset.ttf），ASCII/数字用内置 Helvetica，
避免 fontTools 子集字体嵌入后 ASCII 字形渲染为方块。"""
import fitz

FONT = r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc3\flow_subset3.ttf"
OUT = r"D:\my_code\我的学习\3D游戏\deliverables\手机与PC浏览器3D游戏技术开发全流程流程图.pdf"

W, H = 841, 595  # A4 横向

_FONT_HEI = None
_FONT_ASC = fitz.Font("helv")


def get_hei():
    global _FONT_HEI
    if _FONT_HEI is None:
        _FONT_HEI = fitz.Font(fontfile=FONT)
    return _FONT_HEI


def rgb(hexcolor):
    h = hexcolor.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def _split(text):
    """切分 CJK/ASCII 段，返回 [(kind, seg)]，kind: 'ascii'|'cjk'"""
    segs = []
    cur = None
    buf = []
    for ch in text:
        kind = "ascii" if ord(ch) < 0x2E80 else "cjk"
        if cur is None:
            cur = kind
        if kind != cur:
            segs.append((cur, "".join(buf)))
            buf = []
            cur = kind
        buf.append(ch)
    if buf:
        segs.append((cur, "".join(buf)))
    return segs


def measure(text, size):
    total = 0.0
    for kind, seg in _split(text):
        f = _FONT_ASC if kind == "ascii" else get_hei()
        total += f.text_length(seg, fontsize=size)
    return total


def draw_text(page, cx, cy, text, size, align="left", color=(0.1, 0.1, 0.1)):
    """基线 (cx, cy) 绘制文本，align: left/center/right。"""
    x = cx
    if align == "center":
        x = cx - measure(text, size) / 2
    elif align == "right":
        x = cx - measure(text, size)
    for kind, seg in _split(text):
        fn = "helv" if kind == "ascii" else "hei"
        page.insert_text(fitz.Point(x, cy), seg, fontsize=size, fontname=fn, color=color)
        f = _FONT_ASC if kind == "ascii" else get_hei()
        x += f.text_length(seg, fontsize=size)


def wrap_lines(text, size, maxw):
    """按像素宽度换行，返回行列表。"""
    lines = []
    cur = ""
    for ch in text:
        if measure(cur + ch, size) > maxw and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def draw_node(page, x, y, w, h, lines, fontsize=10.5, fill="FFFFFF", border="3A3A3A", bwidth=1.0):
    """画节点框（可多行文本，居中）。lines 为字符串列表。"""
    page.draw_rect(fitz.Rect(x, y, x + w, y + h), color=rgb(border), width=bwidth, fill=rgb(fill))
    # 若某行超宽，整体缩小字号
    fs = fontsize
    for t in lines:
        tw = measure(t, fs)
        if tw > w - 6:
            fs = min(fs, fontsize * (w - 6) / tw)
    n = len(lines)
    lh = fs * 1.45
    total = n * lh
    start = y + (h - total) / 2 + fs * 0.9
    for i, t in enumerate(lines):
        draw_text(page, x + w / 2, start + i * lh, t, fs, align="center")


def draw_arrow(page, p1, p2, color=(0.35, 0.35, 0.35), width=1.2, head=7):
    import math
    x1, y1 = p1
    x2, y2 = p2
    page.draw_line(fitz.Point(x1, y1), fitz.Point(x2, y2), color=color, width=width)
    ang = math.atan2(y2 - y1, x2 - x1)
    a1 = ang + math.radians(150)
    a2 = ang - math.radians(150)
    p = [fitz.Point(x2, y2),
         fitz.Point(x2 + head * math.cos(a1), y2 + head * math.sin(a1)),
         fitz.Point(x2 + head * math.cos(a2), y2 + head * math.sin(a2))]
    page.draw_polyline(p, color=color, width=0.8, fill=color, closePath=True)


def band(page, x, y, w, h, fill):
    page.draw_rect(fitz.Rect(x, y, x + w, y + h), color=(0.9, 0.9, 0.9), width=0.5, fill=rgb(fill))


def register_font(page):
    page.insert_font(fontname="hei", fontfile=FONT)


def build_page1():
    doc = fitz.open()
    page = doc.new_page(width=W, height=H)
    register_font(page)
    page.draw_rect(fitz.Rect(0, 0, W, H), fill=(1, 1, 1))
    # 标题
    draw_text(page, W / 2, 32, "手机与 PC 浏览器 3D 游戏技术开发全流程与公司资产交付图（总体流程）", 15, align="center")
    draw_text(page, W / 2, 52, "平台：PC 浏览器 / 手机浏览器    引擎：Cocos Creator    后端：NestJS + PostgreSQL + Redis",
              9, align="center", color=(0.35, 0.35, 0.35))

    # ---- 泳道 A：公司侧 ----
    ay, ah = 70, 100
    band(page, 8, ay, W - 16, ah, "F2F6FB")
    draw_text(page, 12, ay + 20, "公司侧 · 内容与资产供给（按规格交付、按清单验收）", 10.5, color=(0.13, 0.3, 0.56))
    a_items = [
        (("策划与剧情", "玩法/数值/系统/关卡文档 + 台词表"), "E8F0FA"),
        (("美术资产", "角色/场景模型·贴图·动画·特效·UI"), "E8F0FA"),
        (("音频资产", "BGM / 音效 / 配音（Ogg/AAC）"), "E8F0FA"),
        (("平台资质", "主体·软著·版号·实名·备案·支付"), "E8F0FA"),
        (("运营物料", "商店图 / 分享图 / 图标 / 截图"), "E8F0FA"),
    ]
    ax0, aw, gap = 20, 152, 10
    a_centers = []
    for i, ((t1, t2), fill) in enumerate(a_items):
        x = ax0 + i * (aw + gap)
        draw_node(page, x, ay + 34, aw, 52, [t1, t2], fontsize=10, fill=fill, border="4A90D9")
        a_centers.append((x + aw / 2, ay + 34 + 52))
    for i in range(len(a_centers) - 1):
        draw_arrow(page, (a_centers[i][0] + aw / 2, ay + 60), (a_centers[i + 1][0] - aw / 2, ay + 60))

    # ---- 泳道 B：开发主流程 ----
    by, bh = 182, 148
    band(page, 8, by, W - 16, bh, "FBFBF8")
    draw_text(page, 12, by + 20, "开发主流程（前端 + 联调 + 测试 + 上线）", 10.5, color=(0.45, 0.3, 0.1))
    m_items = ["立项评审", "需求冻结", "前端开发", "资源接入", "前后端联调", "两端测试", "上线发布", "运营迭代"]
    mx0, mw, mg = 20, 92, 12
    m_centers = []
    for i, t in enumerate(m_items):
        x = mx0 + i * (mw + mg)
        fill = "FFF6E5" if t in ("立项评审", "需求冻结") else ("EAF6EA" if t in ("上线发布", "运营迭代") else "FFFFFF")
        draw_node(page, x, by + 34, mw, 46, [t], fontsize=10.5, fill=fill)
        m_centers.append((x + mw / 2, by + 34 + 46))
    for i in range(len(m_centers) - 1):
        draw_arrow(page, (m_centers[i][0] + mw / 2 - 2, by + 57), (m_centers[i + 1][0] - mw / 2 + 2, by + 57))

    # ---- 泳道 C：后端并行 ----
    cy, ch = 348, 84
    band(page, 8, cy, W - 16, ch, "F4F4F4")
    draw_text(page, 12, cy + 20, "后端侧（与前端并行开发）", 10.5, color=(0.35, 0.35, 0.35))
    draw_node(page, 40, cy + 34, 180, 40, ["后端开发", "架构/登录/存档/排行/实时/支付"], fontsize=9.5, fill="EFEFEF")
    draw_node(page, 300, cy + 34, 150, 40, ["接口就绪", "部署联调环境 + 接口文档"], fontsize=9.5, fill="EFEFEF")
    draw_arrow(page, (240, cy + 54), (285, cy + 54))

    # ---- 供给箭头 ----
    def v_arrow(a_idx, m_idx):
        ax1, ay1 = a_centers[a_idx][0], a_centers[a_idx][1]
        mx2 = m_centers[m_idx][0]
        draw_arrow(page, (ax1, ay1 + 4), (mx2, by + 30), color=(0.2, 0.45, 0.8), width=1.1)

    v_arrow(0, 1)
    v_arrow(1, 3)
    v_arrow(2, 3)
    v_arrow(3, 6)
    v_arrow(4, 7)
    draw_arrow(page, (375, cy + 34), (m_centers[4][0], by + 34 + 46 + 4), color=(0.5, 0.5, 0.5), width=1.1)

    # 底部读图说明（自动换行）
    note = ("读图说明：公司侧五类供给按规格交付、按清单验收；开发主流程九阶段前后衔接，每阶段有出口标准；后端与前端并行，"
            "接口就绪后汇入前后端联调；平台资质与备案、支付渠道周期决定整体排期。关键约束：手机端 WebGPU 支持率低于 PC、"
            "需 WebGL 回退；低端安卓保 20 帧以上；首屏加载目标 3 秒内可交互；域名备案 1–2 周；付费游戏需版号。")
    lines = wrap_lines(note, 9, W - 40)
    for i, ln in enumerate(lines):
        draw_text(page, 20, 460 + i * 16, ln, 9, color=(0.3, 0.3, 0.3))
    return doc


def build_page2():
    doc = fitz.open()
    page = doc.new_page(width=W, height=H)
    register_font(page)
    page.draw_rect(fitz.Rect(0, 0, W, H), fill=(1, 1, 1))
    draw_text(page, W / 2, 32, "手机与 PC 浏览器 3D 游戏技术开发全流程与公司资产交付图（前后端技术细节）", 15, align="center")

    # 左列：前端
    fx, fw, fh = 36, 190, 42
    front = ["工程搭建与规范", "场景搭建与核心系统", "资源接入与包体控制", "两端构建与适配", "前端验收标准"]
    front_y = [78, 138, 198, 258, 318]
    for i, t in enumerate(front):
        draw_node(page, fx, front_y[i], fw, fh, [t], fontsize=10, fill="EFF4FB", border="4A90D9")
    for i in range(len(front) - 1):
        draw_arrow(page, (fx + fw / 2, front_y[i] + fh), (fx + fw / 2, front_y[i + 1]))

    # 右列：后端
    bx, bw, bh = 615, 190, 42
    back = ["后端架构与模块", "登录与账号体系", "存档与数据模型", "排行榜与实时对战", "支付与运营接口", "部署·监控·运维"]
    back_y = [78, 138, 198, 258, 318, 378]
    for i, t in enumerate(back):
        draw_node(page, bx, back_y[i], bw, bh, [t], fontsize=10, fill="F4F4F4", border="555555")
    for i in range(len(back) - 1):
        draw_arrow(page, (bx + bw / 2, back_y[i] + bh), (bx + bw / 2, back_y[i + 1]))

    # 汇合区
    cx, cw = 300, 240
    draw_node(page, cx, 448, cw, 40, ["前后端联调（契约先行 · Mock · 两端联调）"], fontsize=10, fill="FFFFFF")
    draw_node(page, cx, 500, cw, 40, ["两端测试与验收（真机矩阵）"], fontsize=10, fill="FFFFFF")
    draw_node(page, cx, 552, cw, 36, ["上线发布"], fontsize=10.5, fill="EAF6EA", border="2E7D32")

    draw_arrow(page, (fx + fw, 318 + fh / 2), (cx - 4, 448 + 20), color=(0.2, 0.45, 0.8), width=1.1)
    draw_arrow(page, (bx, 378 + fh / 2), (cx + cw + 4, 448 + 20), color=(0.5, 0.5, 0.5), width=1.1)
    draw_arrow(page, (cx + cw / 2, 448 + 40), (cx + cw / 2, 500))
    draw_arrow(page, (cx + cw / 2, 500 + 40), (cx + cw / 2, 552))

    # 上线两端出口
    draw_node(page, 80, 552, 185, 36, ["PC 浏览器", "高画质档 · 键鼠操作"], fontsize=9.5, fill="FDF4E3", border="B07C2E")
    draw_node(page, 575, 552, 185, 36, ["手机浏览器", "低端机 20 帧 · 弱网适配"], fontsize=9.5, fill="FDF4E3", border="B07C2E")
    draw_arrow(page, (cx, 552 + 18), (80 + 185, 552 + 18))
    draw_arrow(page, (cx + cw, 552 + 18), (575, 552 + 18))

    draw_text(page, 250, 448, "前端", 10)
    draw_text(page, 585, 448, "后端", 10)
    draw_text(page, 20, 462, "前端：输入/相机/物理/动画/UI/存档/网络七类系统，两端差异收进适配层。", 8.5, color=(0.3, 0.3, 0.3))
    draw_text(page, 640, 462, "后端：接口稳定 / 数据可信 / 可扩展，三表起步，服务端权威。", 8.5, color=(0.3, 0.3, 0.3))
    return doc


doc = fitz.open()
p1 = build_page1()
p2 = build_page2()
out = fitz.open()
out.insert_pdf(p1)
out.insert_pdf(p2)
out.save(OUT)
out.close()
p1.close()
p2.close()
print("saved:", OUT)
