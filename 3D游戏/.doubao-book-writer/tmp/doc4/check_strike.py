# -*- coding: utf-8 -*-
import zipfile
p = r"D:\my_code\我的学习\3D游戏\deliverables\3D游戏开发资源需求与技术规划书.docx"
z = zipfile.ZipFile(p)
x = z.read("word/document.xml").decode("utf-8")
print("strike tag count:", x.count("w:strike"))
print("strike val true:", x.count('w:strike w:val="true"'))
import re
# 打印含删除线的文本片段（粗略）
for m in re.finditer(r'<w:r[^>]*>.*?<w:strike[^>]*/>.*?</w:r>|<w:r[^>]*>.*?<w:strike w:val="true"/>.*?</w:r>', x, re.S):
    t = re.findall(r"<w:t[^>]*>([^<]+)</w:t>", m.group(0))
    if t:
        print("struck:", "".join(t)[:60])
