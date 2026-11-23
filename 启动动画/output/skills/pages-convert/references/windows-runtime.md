# Windows 本地转换组件

仅在系统和当前依赖运行时都没有可用 LibreOffice 时阅读。优先查找 `soffice.com`、`soffice.exe` 与常见安装目录，避免全盘扫描。

## 获取组件

- 查看官方当前下载目录 `https://download.documentfoundation.org/libreoffice/stable/`，选择适合系统架构的稳定版本。不把历史版本号固定成长期依赖。
- 官方源慢时，可核实中国科大镜像 `https://mirrors.ustc.edu.cn/tdf/libreoffice/stable/` 的同版本文件。HEAD 成功不代表 GET 成功；实际下载可能返回 403，应检查退出码和文件大小。
- 下载到专用临时目录。联网受到沙箱限制时，走环境提供的授权机制。
- MSI 下载后检查 `Get-AuthenticodeSignature`，要求有效签名且签名者为 The Document Foundation。验证失败不执行。

## 仅解压，不进行系统安装

以下 PowerShell 模板使用 MSI 管理解压。变量由实际绝对路径赋值，使用隐藏窗口并等待完成。

```powershell
$arguments = @('/a', ('"' + $packagePath + '"'), '/qn',
  ('TARGETDIR="' + $extractPath + '"'), '/L*v', ('"' + $logPath + '"'))
$process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments `
  -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "解压失败：$($process.ExitCode)；检查 $logPath" }
```

确认 `program/soffice.com` 已生成。若返回 1601，先检查日志和执行权限；环境允许时可请求仅针对这次管理解压的提升权限。不默认改为全局安装，不关闭系统安全设置。

## 运行与回收

- 每项转换使用独立配置目录，通过 `-env:UserInstallation=` 指定文件 URI。
- 使用有界超时；超时时仅定位并结束本次创建的进程，不结束用户的其他办公进程。
- 验证文档后清理此次下载的安装包、解压组件和临时配置。递归清理前解析绝对路径，确认位于本次专用临时目录内；使用 PowerShell `-LiteralPath`，不跨 shell 拼接删除命令。
- 不通过上传用户文档绕过本地工具权限限制。
