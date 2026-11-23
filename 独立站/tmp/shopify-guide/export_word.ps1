$ErrorActionPreference = 'Stop'
$guideDir = 'D:\my_code\我的学习\独立站\output\Shopify开店上线手册'
$guideDocx = Join-Path $guideDir 'Shopify从开店到上线操作手册.docx'
$guidePdf = Join-Path $guideDir 'Shopify从开店到上线操作手册.pdf'
$wordApp = $null
$guideDocument = $null
try {
  $wordApp = New-Object -ComObject Word.Application
  $wordApp.Visible = $false
  $wordApp.DisplayAlerts = 0
  $guideDocument = $wordApp.Documents.Open($guideDocx, $false, $false)
  $guideDocument.Fields.Update() | Out-Null
  foreach ($guideToc in $guideDocument.TablesOfContents) {
    $guideToc.Update()
  }
  $guideDocument.Repaginate()
  foreach ($guideToc in $guideDocument.TablesOfContents) {
    $guideToc.UpdatePageNumbers()
  }
  $guideDocument.Save()
  $guideDocument.ExportAsFixedFormat($guidePdf, 17)
  Write-Output ('Pages: ' + $guideDocument.ComputeStatistics(2))
  Write-Output 'PDF export complete'
} finally {
  if ($null -ne $guideDocument) {
    $guideDocument.Close(0)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($guideDocument)
  }
  if ($null -ne $wordApp) {
    $wordApp.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordApp)
  }
}
