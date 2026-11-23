---
name: pages-convert
description: 将本地 Apple Pages（.pages）文件转换为 PDF 或可编辑的 Word（.docx），处理 Windows 下的转换工具缺失、中文字体和表格截断问题。用户要求打开、导出或转换苹果 Pages 文件时使用；不用于 ChatGPT Pages 页面或普通 PDF/Word 编辑。
---

# Pages 文档转换

保留源文件及原文、数字、批注式文字和待确认事项。格式转换不意味着校对或改写；即使发现疑似计算错误，也不要自行修改。

## 路径与输出

- 用户指定 PDF 或 Word 时按要求交付；只说“PDF 或 Word”时优先 PDF。要求 Word 时必须交付可编辑的 DOCX，不以截图代替文字和表格。
- 使用用户提供的本地绝对路径，支持中文、空格和括号。源文件只读，输出另存；未指定目录时使用当前工作目录的 `output/pdf/` 或 `output/docx/`。
- 避免覆盖用户已有结果。操作产生的临时文件使用专用目录；清理时仅删除本次创建且已核验路径的文件。

## 识别与选择转换方式

1. 检查文件或 Pages 包目录。对 ZIP 型文件先列出目录，不要无条件解压所有内容。
2. 若包含 `QuickLook/Preview.pdf` 等内嵌 PDF，可提取后核对完整性；仅有 `preview.jpg`、`preview-web.jpg` 时不能将首页截图当成全文。`Index/*.iwa` 是新格式正文，不是 PDF。
3. 优先使用已可用的 Apple Pages 原生导出；没有时使用本地 LibreOffice。转换能力和版式保真以实际结果为准。不要把文档上传到在线转换网站，除非用户明确要求或同意。
4. Windows 缺少 LibreOffice 时，按 [Windows 工具准备](references/windows-runtime.md) 准备临时组件。导入不完整时说明具体障碍，不能把部分正文重新排版后宣称完整转换成功。

## 本地转换

确认 LibreOffice 的绝对路径。通过参数数组执行命令，避免将用户文件名拼接成 shell 代码。使用独立配置目录，以免连接到用户已打开的办公会话；配置目录用正确的文件 URI（例如 Python `Path.resolve().as_uri()`），不手写中文 URL 编码。

```text
soffice.com -env:UserInstallation=<独立配置目录的文件URI> --headless --convert-to pdf:writer_pdf_Export --outdir <输出目录> <源文件.pages>
soffice.com -env:UserInstallation=<独立配置目录的文件URI> --headless --convert-to "docx:Office Open XML Text" --outdir <输出目录> <源文件.pages>
```

非 Windows 环境通常使用 `soffice`。退出码为零不代表成功：确认新输出生成、大小合理且能被解析。中文终端乱码也不直接证明文件乱码，应通过 UTF-8 文本提取和页面渲染判断。

交付 PDF 时结合可用的 `pdf` 技能；交付 DOCX 时结合可用的 `documents` 技能，遵守对应的生成标记和渲染检查要求。依赖优先通过 `load_workspace_dependencies` 获取；不固定某台机器的用户名、缓存版本或业务文件名。

## 表格截断与合并异常

仅在检查发现问题时进入此分支：

1. 将 Pages 导出为临时 ODT，作为保留结构和原文的修复中间件。
2. 使用附带脚本查看表格，并将固定行高改为最小行高：

   ```text
   python scripts/repair_odt_tables.py inspect <中间件.odt>
   python scripts/repair_odt_tables.py repair <中间件.odt> <修复后.odt>
   ```

3. 只有原文件预览、源结构或其他可靠证据确认合并关系时，才传入 `--merge 表号:列号:起始行:结束行`。编号从 1 开始，包含表头行，可重复传入。**不要根据连续空单元格自动推断合并，也不要固定修复前两个表或前两列。**
4. 脚本拒绝覆盖输出、覆盖非空单元格、重叠合并，以及已有合并或重复单元格等复杂区域；遇到拒绝时检查结构，不能放松保护直接重试。默认只调整行高，不重设整篇文档的字体、颜色或边框。
5. 从修复后的 ODT 重新导出目标格式并检查。若合并后的边框缺失，只修正有问题的单元格边界。交付时简短说明排版或分页有调整。

## 验证与交付

- PDF 用 `pdfinfo`/`pypdf` 检查页数及文字，再用 `pdftoppm` 渲染；DOCX 按文档技能渲染。检查每页中文、数字、表头、合并单元格、跨页续表和最后一页结尾，不能只检查首页。
- 可逐段比较中间件正文与输出的提取文字，辅助发现漏段；忽略空白后仍有差异时定位检查。PDF 中引号、破折号等字符的提取顺序可能不同，不能因此直接修改原文。文本比较不能代替视觉检查。
- 原文件只有首页预览时，不能宣称全篇与原版完全一致；报告实际检查过的输出，并说明字体替换、分页变化等已知差异。
- 交付经过验证的最终文件链接，说明格式、页数和必要差异。不要交付安装包、临时 ODT、脚本日志或页面图片来代替用户请求的文档。
