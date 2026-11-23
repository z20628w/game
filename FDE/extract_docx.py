import zipfile, re, html, sys

path = r"C:\Users\admin\Desktop\FDE前沿部署工程师完全指南.docx"
with zipfile.ZipFile(path) as z:
    xml = z.read("word/document.xml").decode("utf-8", "ignore")

text = xml.replace("</w:p>", "\n").replace("</w:tc>", " | ").replace("</w:tr>", "\n")
text = re.sub(r"<[^>]+>", "", text)
text = html.unescape(text)
with open(r"C:\Users\admin\WorkBuddy\2026-10-12-11-11-42\docx_text.txt", "w", encoding="utf-8") as f:
    f.write(text)
print("OK, length:", len(text))
