# Rebuild the offline reading editions; PowerShell 7+ includes ConvertFrom-Markdown.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command ConvertFrom-Markdown -ErrorAction SilentlyContinue)) { throw 'Use PowerShell 7 or later.' }
$style = @'
:root{color-scheme:light;--ink:#302d35;--muted:#756b71;--rose:#956575;--line:#e6ddd6;--paper:#fffdfa}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f4f0eb;color:var(--ink);font:16px/1.85 "Microsoft YaHei",system-ui,sans-serif}a{color:#815267;text-underline-offset:4px;overflow-wrap:anywhere}a:hover{color:#543749}header{max-width:1190px;margin:34px auto 0;padding:0 32px;font-size:12px;font-weight:700;letter-spacing:2px;color:var(--rose)}.layout{max-width:1190px;display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;margin:20px auto 48px;padding:0 32px}nav{align-self:start;position:sticky;top:24px;font-size:13px}nav strong{display:block;margin:5px 0 15px;color:#54454e}nav a{display:block;padding:8px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--muted)}main{background:var(--paper);padding:42px 46px;border:1px solid var(--line);border-radius:18px;min-width:0;box-shadow:0 8px 28px #302d3505}h1{font-size:32px;line-height:1.4;letter-spacing:-.5px;margin:0 0 20px}h2{font-size:23px;line-height:1.5;margin:54px 0 20px;padding-top:24px;border-top:1px solid var(--line);scroll-margin-top:22px}h3{font-size:18px;line-height:1.6;margin:27px 0 12px}p{margin:14px 0}strong{font-weight:700}ul,ol{padding-left:25px}li{margin:9px 0;padding-left:3px}.table-wrap{overflow-x:auto;margin:20px 0}table{width:100%;border-collapse:collapse;font-size:14px;line-height:1.75}th,td{padding:12px 13px;border:1px solid var(--line);text-align:left;vertical-align:top}th{white-space:nowrap;background:#eee6e3;color:#59404e;font-weight:600}tbody tr:nth-child(even){background:#faf7f3}code{font-family:Consolas,monospace;font-size:.88em;background:#f0eae5;padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}pre{font-size:13px;line-height:1.7;background:#f1ece6;border:1px solid var(--line);padding:18px;border-radius:10px;overflow:auto;tab-size:4}pre code{padding:0;background:transparent;overflow-wrap:normal}blockquote{margin:20px 0;padding:8px 18px;border-left:3px solid var(--rose);background:#f8eef1}svg,img{display:block;width:100%;height:auto;margin:24px 0}footer{border-top:1px solid var(--line);margin-top:44px;padding-top:18px;font-size:12px;color:var(--muted)}@media(max-width:850px){.layout{display:block;padding:0 16px;margin-top:12px}header{padding:0 20px;margin-top:22px}nav{position:static;padding-bottom:18px}nav a{display:inline-block;padding:5px 12px 5px 0;border:0;font-size:12px}main{padding:27px 22px}h1{font-size:27px}h2{font-size:21px}table{min-width:580px}svg{min-width:0}}@media print{body{background:#fff;font-size:11pt;line-height:1.65}header,nav{display:none}.layout{display:block;max-width:none;margin:0;padding:0}main{box-shadow:none;border:0;padding:0}h1{font-size:22pt}h2{font-size:16pt;margin-top:28px;break-after:avoid}h3{font-size:13pt;break-after:avoid}table{font-size:9pt;min-width:0}tr,svg,pre{break-inside:avoid}th,td{padding:7px}.table-wrap{overflow:visible}a{color:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:9pt}@page{size:A4;margin:17mm 16mm}
'@
foreach ($name in @('GETTING-STARTED','FIRST-BOARD-SETUP')) {
    $markdown = Join-Path $PSScriptRoot ($name + '.md')
    $body = (ConvertFrom-Markdown -LiteralPath $markdown).Html
    $body = $body.Replace('href="GETTING-STARTED.md"','href="GETTING-STARTED.html"').Replace('href="FIRST-BOARD-SETUP.md"','href="FIRST-BOARD-SETUP.html"')
    $wiring = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'assets/four-sensor-wiring.svg') -Raw
    $body = [regex]::Replace($body,'<img[^>]+src="assets/four-sensor-wiring.svg"[^>]*>',[Text.RegularExpressions.MatchEvaluator]{ param($match) $wiring })
    $body = $body.Replace('<table>','<div class="table-wrap"><table>').Replace('</table>','</table></div>')
    $nav = [Collections.Generic.List[string]]::new()
    $headingIndex = @{Value=0}
    $body = [regex]::Replace($body,'<h2(?: [^>]*)?>(.*?)</h2>',[Text.RegularExpressions.MatchEvaluator]{
        param($match)
        $headingIndex.Value++
        $id = 'guide-section-' + $headingIndex.Value
        $text = [regex]::Replace($match.Groups[1].Value,'<[^>]+>','')
        $nav.Add('<a href="#' + $id + '">' + $text + '</a>')
        '<h2 id="' + $id + '">' + $match.Groups[1].Value + '</h2>'
    })
    $title = [regex]::Match($body,'<h1(?: [^>]*)?>(.*?)</h1>').Groups[1].Value
    $html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + $title + '</title><style>' + $style + '</style></head><body><header>YOUYOU · USB 陪伴小猫</header><div class="layout"><nav aria-label="目录"><strong>阅读导航</strong>' + ($nav -join '') + '</nav><main>' + $body + '<footer>离线阅读版 · 可使用浏览器打印或保存为 PDF。接线图已内嵌；外部产品与资料链接需要联网。</footer></main></div></body></html>'
    Set-Content -LiteralPath (Join-Path $PSScriptRoot ($name + '.html')) -Value $html -Encoding utf8
}
Write-Output 'Built both offline HTML guides from Markdown.'

