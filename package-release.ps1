$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'docs/build-guides.ps1')
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'plugin/package.json') -Raw | ConvertFrom-Json).version
$artifactName = "youyou-usb-$version"
$stage = Join-Path $PSScriptRoot ('build/releases/' + $artifactName + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
foreach ($directory in @('plugin','firmware/pet_usb','docs')) {
    $source = Join-Path $PSScriptRoot $directory
    $destination = Join-Path $stage $directory
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Recurse
}
foreach ($file in @('pet-firmware.ps1','install-pet-plugin.ps1','package-release.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $stage $file)
}
$prebuilt = Join-Path $stage 'prebuilt'
New-Item -ItemType Directory -Path $prebuilt | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "build/plugin/loveandrobot-dsh-pet-usb-$version.tgz") -Destination $prebuilt
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'build/pet_usb/pet_usb.ino.bin') -Destination $prebuilt
@'
# youyou USB 原型交付

首次搭建请先双击 docs/GETTING-STARTED.html；购买清单、接线关系图、安装和使用步骤都在里面。新开发板的一次性固件准备在 docs/FIRST-BOARD-SETUP.html。两份均有对应 Markdown 源文档，接线图已经内嵌在 HTML 中，可离线阅读和打印。

包含插件安装包、完整源码和测试、USB 固件源码与已编译的应用镜像、协议文档、构建／安装脚本。

适用：Windows + DeepSeek Harness Desktop 0.2.1-rc.5 + 微雪 ESP32-S3-DEV-KIT-N8R8 + 四路 KEYES 压力模块（物理输入 IO4／IO6／IO7／IO5，身体位置通过界面配对）。固件1.1.1，协议1。插件兼容原1.0.0三路固件，但三路时没有右手和双手组合识别。名字、设备编号、COM和会话关联均不写死在源码中。

现有同型号设备复用：按入门指南在 Harness 插件页添加解压后的 plugin 目录；维护者也可用安装脚本生成并安装 tgz。通过悬浮猫咪的「陪伴设置」完成绑定、起名、校准、部位配对和专属聊天创建，日常操作无需输入命令。四路未配对时可先文字聊天，暂不按部位触发回应；四片位置可重新配对，不必再次刷固件。四路采样需要本包1.1.1固件；只使用原三路时可先升级插件。安装代码后可能需要重启宿主；正常使用时插拔、起名和聊天不需要反复重启。

prebuilt/pet_usb.ino.bin 只是应用镜像，不是整片Flash镜像，不可写到0x0。先阅读 docs/USB-PROTOCOL.md 的分区、启动选择与备份条件。已有匹配布局的板子使用 pet-firmware.ps1；该脚本包含必需的 NVS 链接保护、ELF 校验和升级前后关键区域对比，不要绕过脚本使用默认 Arduino 构建参数；脚本检查失败必须先核对，不删除检查强刷。全新板子的首次工具安装与板型初始化仍是开发准备步骤，不是本插件的自动功能。

从源码构建：需要项目 .tools 中的 Arduino CLI 1.5.1、ESP32 core 3.3.10-cn、esptool 5.3.0-cn，目录结构与 pet-firmware.ps1 一致；脚本自动生成当前项目路径的工具配置。插件开发／打包需要 Node 24 与 Harness 自带 pnpm；运行已打包插件只使用 Harness和Windows自带运行环境。

本包不含模型密钥、Wi-Fi配置、用户绑定状态、控制管道令牌、聊天记录、开发工具缓存或原厂Flash备份。原有电脑上的备份应另行保留。完整桌面原型闭环已实测，尚未作为装入娃娃后的量产产品验收。
'@ | Set-Content -LiteralPath (Join-Path $stage 'README.md') -Encoding utf8
$hashes = Get-ChildItem -LiteralPath $prebuilt -File | ForEach-Object {
    $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
    '{0}  prebuilt/{1}' -f $hash.Hash.ToLowerInvariant(), $_.Name
}
$hashes | Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS.txt') -Encoding ascii
$zip = Join-Path $PSScriptRoot "build/releases/$artifactName.zip"
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Get-Item -LiteralPath $zip | Select-Object FullName,Length
Get-FileHash -LiteralPath $zip -Algorithm SHA256 | Select-Object Hash


