# 新开发板首次固件准备

这是配套的开发者附录，供协助准备新板的人阅读。普通使用者先看[首次采购与搭建指南](GETTING-STARTED.md)。本附录不要求已经正常运行的板子再次刷写。

**适用目标只有已核对的微雪 ESP32-S3-DEV-KIT-N8R8-M／N8R8。** 固件 1.1.1，8 MB Flash、8 MB OPI PSRAM。其他型号、分区或安全配置不直接套用这里的地址。

## 1 分清首次初始化和应用升级

| 情况 | 处理方式 |
| --- | --- |
| 已有本项目匹配的分区与启动选择，只升级宠物固件 | 使用 `pet-firmware.ps1 -Upload`；脚本核对布局、备份旧应用，仅更新应用区，并比较关键区域。 |
| 刚买的新板，仍是厂商示例或未知布局 | 先核对硬件与安全状态、做完整 Flash 备份，再判断是否需要首次初始化。不能让升级脚本的拒绝检查变成“删掉检查后强刷”。 |
| 已经运行 1.1.1，日常设置或换传感器 | 不刷写；在界面重新校准、配对。 |

交付包 `prebuilt/pet_usb.ino.bin` **只有应用程序**，不是整片镜像，不能写到 0x0。首次初始化所需的启动程序、分区表和启动选择必须来自同一次受保护构建；不要拼接其他板型或版本的文件，也不要把别人的全片备份当作出厂初始化包。

## 2 准备电脑工具

原项目已验证 Arduino CLI 1.5.1、ESP32 core 3.3.10-cn、随该核心安装的 esptool 5.3.0-cn。USB 插件的开发脚本另需 Node 24；运行已安装的插件由 Harness 提供运行环境。

复用已有开发电脑时沿用已验证工具。新电脑从 [Arduino CLI 官方安装说明](https://arduino.github.io/arduino-cli/latest/installation/)和[微雪 Arduino 指南](https://docs.waveshare.net/ESP32-S3-DEV-KIT-N8R8/Arduino/)准备工具，并固定兼容版本。国内镜像和官方发行版的目录名称可能不同；本项目脚本按下述已验证目录寻找工具，不能只安装最新版就假定路径和二进制相同。

```text
项目根目录/
  .tools/arduino-cli/arduino-cli.exe
  .tools/arduino-data/packages/esp32/hardware/esp32/3.3.10-cn/
  .tools/arduino-data/packages/esp32/tools/esptool_py/5.3.0-cn/esptool.exe
  .tools/arduino-data/packages/esp32/tools/esp-x32/2601-cn/bin/
  .tools/downloads/
  .tools/arduino-user/
```

`.tools` 是开发工具缓存，不随交付包分发。在新电脑上要先按以上结构准备工具或审查调整脚本路径；不要将旧电脑用户目录硬编码到新环境。

## 3 只接 USB 并核对目标

先不接传感器。只连这一块目标板，完整退出 Harness 和串口监视器，避免争用串口。在设备管理器确认 **CH343** 的实际 COM 号。下面的 `COM7` 只是示例，必须改成当前板子的端口。

在项目根目录的 PowerShell 中设置工具路径并只读检查：

```powershell
$Port = 'COM7'  # 改成设备管理器中的 CH343 端口
$esptool = Join-Path $PWD '.tools/arduino-data/packages/esp32/tools/esptool_py/5.3.0-cn/esptool.exe'
& $esptool --chip esp32s3 --port $Port chip-id
& $esptool --chip esp32s3 --port $Port flash-id
& $esptool --chip esp32s3 --port $Port get-security-info
```

逐条检查退出状态与输出：芯片必须是 ESP32-S3，Flash 必须符合 8 MB；主板／模组标识还需确认 N8R8 和 8 MB OPI PSRAM。`flash-id` 不能代替 PSRAM 型号核对。遇到安全启动、Flash 加密、下载限制或不明型号先停止；不修改 eFuse、不使用 `--force` 绕过保护。

## 4 为这块新板做完整备份

在确认 8 MB 后执行下述读取。记录主板标识、设备 MAC、日期和备份哈希；每块板分别保存，不覆盖前一块。

```powershell
$backupDir = Join-Path $PWD ('.tools/backups/new-board-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
$backupFile = Join-Path $backupDir 'factory-flash.bin'
& $esptool --chip esp32s3 --port $Port read-flash 0x0 0x800000 $backupFile
if ($LASTEXITCODE -ne 0) { throw '读取备份失败，停止，不刷写。' }
if ((Get-Item -LiteralPath $backupFile).Length -ne 8388608) { throw '备份长度不符，停止。' }
Get-FileHash -LiteralPath $backupFile -Algorithm SHA256
```

这是读取备份，不擦除 Flash。备份只对这块板有恢复意义，不应作为通用发布镜像。

## 5 使用受保护的构建入口

```powershell
.\pet-firmware.ps1
```

这一步只编译，不上传。必须看到编译成功，以及 **NVS 初始化阻止和 OTA 元数据保护的 ELF 校验成功**。构建入口会固定 8 MB 分区与 PSRAM 参数，启用必要的链接保护；不改用默认 Arduino 示例直接编译宠物固件。

构建产物在 `build/pet_usb`。本版本的 `flash_args` 列出：

| 地址 | 文件 | 作用 |
| --- | --- | --- |
| 0x0 | pet_usb.ino.bootloader.bin | 启动程序 |
| 0x8000 | pet_usb.ino.partitions.bin | 8 MB 分区表 |
| 0xe000 | boot_app0.bin | 初始应用选择 |
| 0x10000 | pet_usb.ino.bin | 宠物应用 |

构建板型选项使用 QIO Flash／OPI PSRAM；当前构建生成的 **flash_args 下载参数是 dio、80m、8MB**。这两个位置的参数用途不同，首次初始化以本次构建生成的 flash_args 为准，不擅自把下载参数改成 OPI。

## 6 选择正确的写入路径

### 已有匹配布局的板子

```powershell
.\pet-firmware.ps1 -Upload -Port $Port
```

该脚本在写入前比较真实分区表和完整启动选择，备份原应用与关键区域，然后只写应用。检查失败时停止，先核对原因；不要删掉检查继续。

### 确认需要初始化的新板

这会**主动写入启动程序、分区表、启动选择和应用**。只有在已确认目标板、完整备份成功、构建保护通过，并明确决定用本项目布局替换该新板的出厂软件后才执行。它不是普通升级，也不是日常操作。

下面是当前受保护构建对应的写入示例。执行前逐项对照实际 `build/pet_usb/flash_args`；有任何不同，应先审查构建，不盲目复制。这里没有 `erase-all` 或 `--force`。

```powershell
Push-Location 'build/pet_usb'
try {
    & $esptool --chip esp32s3 --port $Port write-flash `
      --flash-mode dio --flash-freq 80m --flash-size 8MB `
      0x0 pet_usb.ino.bootloader.bin `
      0x8000 pet_usb.ino.partitions.bin `
      0xe000 boot_app0.bin `
      0x10000 pet_usb.ino.bin
    if ($LASTEXITCODE -ne 0) { throw '初始化失败，保留备份与日志，先排查。' }
} finally { Pop-Location }
```

刷写期间不要拔 USB。esptool 会擦写所列镜像覆盖的扇区并校验数据；不会因为未使用整片擦除就变成零写入风险。文件与偏移必须成对匹配，详见 [esptool 官方说明](https://docs.espressif.com/projects/esptool/en/latest/esp32s3/esptool/basic-commands.html)。

这份初始化步骤依据当前实际构建产物和原板准备流程整理，**尚未在另一块新购板上重新执行验收**。给下一块新板准备时，须完成下面的读取与握手检查，不能仅凭命令执行完就宣布成功。

## 7 验收后再交回主指南

1. 保存 esptool 成功校验的日志。读取启动后的前 64 KiB 作基准；正常运行并再次启动后读取同一区域，比较哈希，确认正常启动没有改写这些关键区域。注意首次初始化会主动改变布局，不能要求它与出厂备份完全相同。
2. 在 Harness 保持退出时运行 `node plugin/test/hardware-smoke.mjs`。应确认固件 1.1.1、四个通道、持续有效帧及串口正常关闭；新板设备编号应属于新板，不应硬编码旧板 ID。未接传感器时模拟输入读数不作为传感器验收。
3. 保留备份，退出独立测试。拔掉 USB，回到主指南接四片传感器，再做四路校准、部位配对与实际按片验收。
4. 在 Harness 中绑定这块新板；不要复制旧电脑的设备绑定或基线冒充完成配置。

必要时可使用 `plugin/test/hardware-lifecycle.ps1 -Port $Port` 检查严格握手、畸形命令与心跳超时。此脚本只测试运行协议，不包含刷写命令；运行前同样要释放串口。

## 8 为下一块保留哪些记录

- 购买型号与排针版本，传感器商品规格和批次。
- 新板只读身份、Flash 规格、安全状态与原厂备份哈希。
- 使用的工具版本、固件版本、实际 flash_args 与应用哈希。
- 四路接线、校准结果、已保存的身体位置和按片验证结果。

开发板备份留在对应设备的维护记录中；可复用交付包不包含这些个人或设备专属数据。以后只换部位、校准、聊天或正常插拔 USB，都不再执行本附录的刷写步骤。
