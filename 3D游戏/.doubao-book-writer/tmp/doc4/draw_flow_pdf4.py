# -*- coding: utf-8 -*-
"""用 PyMuPDF 绘制《3D游戏开发资源需求与技术规划书》PDF 流程图。
页 1：开发流程（公司资源供给泳道 + 开发主流程 + 后端并行 + 外部环节）。
页 2：版本分割时间线（V0→V1.0→V1.5→V2.0→运营迭代）。
当前口径：后端 Java；周期待需求落地后评估；付费相关条款标注「付费运营时启用」。
文本层：中文用子集黑体（flow_subset4.ttf），ASCII/数字用内置 Helvetica。"""
import fitz

FONT = r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc4\flow_subset4.ttf"
OUT = r"D:\my_code\我的学习\3D游戏\deliverables\3D游戏开发流程与版本分割流程图.pdf"

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
    """切分 CJK/ASCII 段，返回 [(kind, seg)]。"""
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
    """画节点框（可多行文本，居中）。"""
    page.draw_rect(fitz.Rect(x, y, x + w, y + h), color=rgb(border), width=bwidth, fill=rgb(fill))
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
    draw_text(page, W / 2, 30, "3D游戏开发资源需求与技术规划书 · 开发流程", 15, align="center")
    draw_text(page, W / 2, 49,
              "平台：PC 浏览器 / 手机浏览器    引擎：Cocos Creator    后端：Java（Spring Boot）+ PostgreSQL + Redis    当前阶段：技术验证 demo · 周期待需求落地后评估",
              8.5, align="center", color=(0.35, 0.35, 0.35))

    # ---- 泳道 A：公司侧资源供给 ----
    ay, ah = 62, 92
    band(page, 8, ay, W - 16, ah, "F2F6FB")
    draw_text(page, 12, ay + 17, "公司侧 · 资源供给（按规格交付、按清单验收）", 10.5, color=(0.13, 0.3, 0.56))
    a_items = [
        (("策划与剧情", "玩法/数值/系统文档·台词表"), "E8F0FA"),
        (("美术资产", "角色/场景·贴图·动画·特效·UI"), "E8F0FA"),
        (("音频资产", "BGM/音效/配音（Ogg/AAC）"), "E8F0FA"),
        (("平台资质", "主体·软著·实名·备案"), "E8F0FA"),
        (("运营物料", "图标/宣传图/分享物料"), "E8F0FA"),
    ]
    ax0, aw, gap = 20, 152, 10
    a_centers = []
    for i, ((t1, t2), fill) in enumerate(a_items):
        x = ax0 + i * (aw + gap)
        draw_node(page, x, ay + 28, aw, 52, [t1, t2], fontsize=9.5, fill=fill, border="4A90D9")
        a_centers.append((x + aw / 2, ay + 28 + 52))
    for i in range(len(a_centers) - 1):
        draw_arrow(page, (a_centers[i][0] + aw / 2, ay + 54), (a_centers[i + 1][0] - aw / 2, ay + 54))

    # ---- 泳道 B：开发主流程（无周期标注） ----
    by, bh = 164, 128
    band(page, 8, by, W - 16, bh, "FBFBF8")
    draw_text(page, 12, by + 17, "开发主流程（当前阶段先交付技术 demo，正式周期待需求落地后评估）", 10.5, color=(0.45, 0.3, 0.1))
    m_items = ["立项评审", "需求冻结", "技术原型", "前端开发", "资源接入", "前后端联调", "测试与验收", "上线发布"]
    mx0, mw, mg = 20, 92, 9
    m_centers = []
    for i, t in enumerate(m_items):
        x = mx0 + i * (mw + mg)
        fill = "FFF6E5" if i <= 1 else ("EAF6EA" if t == "上线发布" else "FFFFFF")
        draw_node(page, x, by + 30, mw, 42, [t], fontsize=10, fill=fill)
        m_centers.append((x + mw / 2, by + 30 + 42))
    for i in range(len(m_centers) - 1):
        draw_arrow(page, (m_centers[i][0] + mw / 2 - 2, by + 51), (m_centers[i + 1][0] - mw / 2 + 2, by + 51))

    # 运营迭代出口
    draw_node(page, 766, by + 84, 59, 36, ["运营迭代"], fontsize=9, fill="EAF6EA", border="2E7D32")
    draw_arrow(page, (m_centers[-1][0], by + 30 + 42 + 4), (766, by + 84 + 18 - 10), width=1.0)

    # ---- 泳道 C：后端并行（Java） ----
    cy, ch = 304, 72
    band(page, 8, cy, W - 16, ch, "F4F4F4")
    draw_text(page, 12, cy + 17, "后端侧（Java 技术栈，与前端并行开发）", 10.5, color=(0.35, 0.35, 0.35))
    draw_node(page, 40, cy + 28, 200, 36, ["后端开发（Java）", "架构/登录/存档/排行/实时"], fontsize=9, fill="EFEFEF")
    draw_node(page, 320, cy + 28, 160, 36, ["接口就绪", "部署联调环境 + 接口文档"], fontsize=9, fill="EFEFEF")
    draw_arrow(page, (258, cy + 46), (305, cy + 46))
    draw_arrow(page, (440, cy + 28), (m_centers[5][0], by + 30 + 42 + 4), color=(0.5, 0.5, 0.5), width=1.0)

    # ---- 泳道 D：外部环节 ----
    dy, dh = 388, 70
    band(page, 8, dy, W - 16, dh, "FDF3F3")
    draw_text(page, 12, dy + 17, "外部环节（尽早启动 · 周期待需求落地后评估）", 10.5, color=(0.6, 0.2, 0.2))
    ext = [
        ("域名备案", "当前即需办理", "FFFFFF"),
        ("软著登记", "当前即需办理", "FFFFFF"),
        ("支付渠道开通", "付费运营时启用", "FBE9E9"),
        ("版号审批", "付费运营时启用", "FBE9E9"),
    ]
    ex0, ew, eg = 24, 188, 12
    for i, (t, p, fill) in enumerate(ext):
        x = ex0 + i * (ew + eg)
        draw_node(page, x, dy + 28, ew, 34, [t, p], fontsize=9.5, fill=fill, border="B23A3A")

    # 底部读图说明
    note = ("读图说明：公司五类供给按规格交付、按清单验收，资源在对应阶段汇入；主流程各阶段设检查点，前一阶段不通过不进入下一阶段；"
            "后端以 Java 与前端并行，接口就绪后汇入前后端联调。当前为非付费运营，支付渠道与版号相关条款暂不适用、保留备查；"
            "外部环节尽早启动，正式开发周期待需求落地后评估。")
    lines = wrap_lines(note, 9, W - 40)
    for i, ln in enumerate(lines):
        draw_text(page, 20, 478 + i * 15, ln, 9, color=(0.3, 0.3, 0.3))
    return doc


def build_page2():
    doc = fitz.open()
    page = doc.new_page(width=W, height=H)
    register_font(page)
    page.draw_rect(fitz.Rect(0, 0, W, H), fill=(1, 1, 1))
    draw_text(page, W / 2, 30, "3D游戏开发资源需求与技术规划书 · 版本分割与里程碑", 15, align="center")

    # ---- 版本顺序轴 ----
    ty = 80
    draw_text(page, 20, ty - 12, "版本推进顺序：", 9.5, color=(0.35, 0.35, 0.35))
    vx = [60, 225, 390, 555, 720]
    vw = 150
    vh = 48
    v_items = [
        ("V0 技术原型", "EFF4FB", "4A90D9"),
        ("V1.0 核心循环", "FFF6E5", "B07C2E"),
        ("V1.5 内容版本", "FFF6E5", "B07C2E"),
        ("V2.0 上线版本", "EAF6EA", "2E7D32"),
        ("运营迭代", "EAF6EA", "2E7D32"),
    ]
    centers = []
    for i, (t, fill, bd) in enumerate(v_items):
        draw_node(page, vx[i], ty, vw, vh, [t], fontsize=10.5, fill=fill, border=bd)
        centers.append((vx[i] + vw / 2, ty + vh))
    ax_y = ty + vh + 12
    page.draw_line(fitz.Point(vx[0], ax_y), fitz.Point(vx[-1] + vw, ax_y), color=(0.35, 0.35, 0.35), width=1.4)
    for i, c in enumerate(centers):
        draw_arrow(page, (c[0], ty + vh + 2), (c[0], ax_y), width=1.0)
    draw_text(page, vx[0] + vw / 2, ax_y + 15, "内部里程碑（不对外发布）", 9, align="center", color=(0.5, 0.4, 0.15))
    draw_text(page, vx[3] + vw / 2, ax_y + 15, "正式上线", 9, align="center", color=(0.15, 0.5, 0.2))
    draw_text(page, vx[4] + vw / 2, ax_y + 15, "运营期", 9, align="center", color=(0.15, 0.5, 0.2))

    # ---- 版本信息卡 ----
    info_y = 200
    info = [
        ("目标", "验证玩法与技术可行性"),
        ("范围", "核心循环可玩·占位资源·单端可跑"),
        ("出口标准", "玩法成立、性能初步达标"),
    ]
    for j, (lab, val) in enumerate(info):
        yy = info_y + j * 46
        draw_text(page, vx[0] + vw / 2, yy, lab, 9, align="center", color=(0.35, 0.35, 0.35))
        lines = wrap_lines(val, 9, vw - 8)
        draw_text(page, vx[0] + vw / 2, yy + 15, lines[0], 9, align="center")
        if len(lines) > 1:
            draw_text(page, vx[0] + vw / 2, yy + 29, lines[1], 9, align="center")

    info2 = [
        ("目标", "核心玩法完整，系统骨架就位"),
        ("范围", "输入/相机/战斗/存档/UI骨架"),
        ("出口标准", "核心循环完整可玩，无阻断Bug"),
    ]
    for j, (lab, val) in enumerate(info2):
        yy = info_y + j * 46
        draw_text(page, vx[1] + vw / 2, yy, lab, 9, align="center", color=(0.35, 0.35, 0.35))
        lines = wrap_lines(val, 9, vw - 8)
        draw_text(page, vx[1] + vw / 2, yy + 15, lines[0], 9, align="center")
        if len(lines) > 1:
            draw_text(page, vx[1] + vw / 2, yy + 29, lines[1], 9, align="center")

    info3 = [
        ("目标", "内容填充，前后端全通"),
        ("范围", "关卡/角色/音频接入·联调"),
        ("出口标准", "两端联调全通，内容达标"),
    ]
    for j, (lab, val) in enumerate(info3):
        yy = info_y + j * 46
        draw_text(page, vx[2] + vw / 2, yy, lab, 9, align="center", color=(0.35, 0.35, 0.35))
        lines = wrap_lines(val, 9, vw - 8)
        draw_text(page, vx[2] + vw / 2, yy + 15, lines[0], 9, align="center")
        if len(lines) > 1:
            draw_text(page, vx[2] + vw / 2, yy + 29, lines[1], 9, align="center")

    info4 = [
        ("目标", "正式发布"),
        ("范围", "测试达标·资质齐·灰度通过"),
        ("出口标准", "上线检查清单全绿"),
    ]
    for j, (lab, val) in enumerate(info4):
        yy = info_y + j * 46
        draw_text(page, vx[3] + vw / 2, yy, lab, 9, align="center", color=(0.35, 0.35, 0.35))
        lines = wrap_lines(val, 9, vw - 8)
        draw_text(page, vx[3] + vw / 2, yy + 15, lines[0], 9, align="center")
        if len(lines) > 1:
            draw_text(page, vx[3] + vw / 2, yy + 29, lines[1], 9, align="center")

    info5 = [
        ("目标", "长线运营"),
        ("范围", "新内容/活动"),
        ("出口标准", "版本更新记录·数据达标"),
    ]
    for j, (lab, val) in enumerate(info5):
        yy = info_y + j * 46
        draw_text(page, vx[4] + vw / 2, yy, lab, 9, align="center", color=(0.35, 0.35, 0.35))
        lines = wrap_lines(val, 9, vw - 8)
        draw_text(page, vx[4] + vw / 2, yy + 15, lines[0], 9, align="center")
        if len(lines) > 1:
            draw_text(page, vx[4] + vw / 2, yy + 29, lines[1], 9, align="center")

    # ---- 外部环节提示 ----
    ey = 420
    band(page, 8, ey, W - 16, 64, "FDF3F3")
    draw_text(page, 20, ey + 18, "外部环节（尽早启动 · 周期待需求落地后评估）", 10.5, color=(0.6, 0.2, 0.2))
    ext = [
        ("域名备案", "当前即需办理"),
        ("软著登记", "当前即需办理"),
        ("支付渠道", "付费运营时启用"),
        ("版号", "付费运营时启用"),
    ]
    ex0, ew, eg = 30, 185, 14
    for i, (t, p) in enumerate(ext):
        x = ex0 + i * (ew + eg)
        fill = "FBE9E9" if p != "当前即需办理" else "FFFFFF"
        draw_node(page, x, ey + 28, ew, 30, [t, p], fontsize=9, fill=fill, border="B23A3A")

    note = ("版本分割原则：任何时间点砍需求，游戏都还是完整的——V1.0只保核心循环，V1.5按内容优先级填充，V2.0前只修阻断问题；"
            "重大版本先灰度后全量；每版本出口标准在需求冻结时写清，双周对齐资产与版本，评审会核销。当前为非付费运营，付费相关条款保留备查。")
    lines = wrap_lines(note, 9, W - 40)
    for i, ln in enumerate(lines):
        draw_text(page, 20, 508 + i * 15, ln, 9, color=(0.3, 0.3, 0.3))
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
