param([switch]$Upload, [string]$Port = 'COM4')
$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot '.tools/arduino-cli/arduino-cli.exe'
# Generate local paths rather than committing this computer's user directory.
$config = Join-Path $PSScriptRoot '.tools/pet-arduino-config.json'
$configuration = @{
    board_manager = @{ additional_urls = @('https://jihulab.com/esp-mirror/espressif/arduino-esp32/-/raw/gh-pages/package_esp32_index_cn.json') }
    directories = @{
        data = (Join-Path $PSScriptRoot '.tools/arduino-data')
        downloads = (Join-Path $PSScriptRoot '.tools/downloads')
        user = (Join-Path $PSScriptRoot '.tools/arduino-user')
    }
    updater = @{ enable_notification = $false }
}
$configuration | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $config -Encoding utf8
$sketch = Join-Path $PSScriptRoot 'firmware/pet_usb'
$build = Join-Path $PSScriptRoot 'build/pet_usb'
$fqbn = 'esp32:esp32:esp32s3:FlashSize=8M,FlashMode=qio,PSRAM=opi,PartitionScheme=default_8MB,USBMode=hwcdc,CDCOnBoot=default,UploadMode=default,UploadSpeed=921600'
& $cli --config-file $config compile --fqbn $fqbn --build-property 'compiler.cpp.extra_flags=-DPET_NO_NVS_INIT=1' --build-property 'compiler.c.elf.extra_flags=-Wl,--wrap=nvs_flash_init' --build-path $build $sketch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$binTools = Join-Path $PSScriptRoot '.tools/arduino-data/packages/esp32/tools/esp-x32/2601-cn/bin'
$symbols = & (Join-Path $binTools 'xtensa-esp32s3-elf-nm.exe') -C (Join-Path $build 'pet_usb.ino.elf')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect firmware storage guards; upload refused.' }
if (-not ($symbols -match ' T __wrap_nvs_flash_init$') -or ($symbols -match '\s[nTtWw] nvs_flash_init$') -or -not ($symbols -match ' T verifyRollbackLater$')) { throw 'Firmware storage guards missing or bypassed; upload refused.' }
$startup = & (Join-Path $binTools 'xtensa-esp32s3-elf-objdump.exe') -d --disassemble=initArduino (Join-Path $build 'pet_usb.ino.elf')
if ($LASTEXITCODE -ne 0 -or -not ($startup -match '<__wrap_nvs_flash_init>') -or -not ($startup -match '<verifyRollbackLater>')) { throw 'Startup storage guards could not be verified; upload refused.' }
Write-Output 'ELF verified: NVS initialization is blocked and automatic OTA metadata updates are deferred.'
if (-not $Upload) { exit 0 }

# Upgrade only the known ota_0 application slot. Never erase the whole chip.
$esptool = Join-Path $PSScriptRoot '.tools/arduino-data/packages/esp32/tools/esptool_py/5.3.0-cn/esptool.exe'
$appImage = Join-Path $build 'pet_usb.ino.bin'
if ((Get-Item -LiteralPath $appImage).Length -gt 0x330000) { throw 'Image exceeds the verified application partition.' }
$backupDir = Join-Path $PSScriptRoot ('.tools/backups/pet-upgrade-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDir | Out-Null
$partitionBackup = Join-Path $backupDir 'partition-table.bin'
& $esptool --chip esp32s3 --port $Port --baud 921600 read-flash 0x8000 0x1000 $partitionBackup
if ($LASTEXITCODE -ne 0) { throw 'Cannot read partition table; nothing written.' }
$expected = [System.IO.File]::ReadAllBytes((Join-Path $build 'pet_usb.ino.partitions.bin'))
$actual = [System.IO.File]::ReadAllBytes($partitionBackup)
for ($i = 0; $i -lt $expected.Length; $i++) {
    if ($actual[$i] -ne $expected[$i]) { throw 'Partition table differs from the verified 8 MB layout; nothing written.' }
}
$bootBackup = Join-Path $backupDir 'boot-selection.bin'
& $esptool --chip esp32s3 --port $Port --baud 921600 read-flash 0xe000 0x2000 $bootBackup
if ($LASTEXITCODE -ne 0) { throw 'Cannot read boot selection; nothing written.' }
$bootBytes = [System.IO.File]::ReadAllBytes($bootBackup)
# Compare the entire vendor-provided ota_0 selection image, including CRCs.
# This is stronger than guessing the meaning of the second record's sequence.
$expectedBoot = [System.IO.File]::ReadAllBytes((Join-Path $build 'boot_app0.bin'))
if ($bootBytes.Length -ne $expectedBoot.Length) { throw 'Unexpected boot metadata length; nothing written.' }
for ($i = 0; $i -lt $expectedBoot.Length; $i++) {
    if ($bootBytes[$i] -ne $expectedBoot[$i]) { throw 'Boot selection differs from the verified ota_0 image; nothing written.' }
}
& $esptool --chip esp32s3 --port $Port --baud 921600 read-flash 0x10000 0x330000 (Join-Path $backupDir 'previous-app.bin')
if ($LASTEXITCODE -ne 0) { throw 'Application backup failed; nothing written.' }
Get-FileHash -LiteralPath (Join-Path $backupDir 'previous-app.bin') -Algorithm SHA256 | Format-List | Out-File (Join-Path $backupDir 'sha256.txt')
$protectedBefore = Join-Path $backupDir 'protected-before.bin'
& $esptool --chip esp32s3 --port $Port --baud 921600 read-flash 0x0 0x10000 $protectedBefore
if ($LASTEXITCODE -ne 0) { throw 'Protected-region backup failed; nothing written.' }
& $esptool --chip esp32s3 --port $Port --baud 921600 write-flash --skip-flashed 0x10000 $appImage
if ($LASTEXITCODE -ne 0) { throw "Upload failed. Backup retained in $backupDir" }
# Allow the new application to boot, then verify bootloader, partition table,
# NVS and boot-selection bytes are unchanged, including runtime initialization.
Start-Sleep -Seconds 6
$protectedAfter = Join-Path $backupDir 'protected-after.bin'
& $esptool --chip esp32s3 --port $Port --baud 921600 read-flash 0x0 0x10000 $protectedAfter
if ($LASTEXITCODE -ne 0) { throw "Cannot read back protected regions. Backup: $backupDir" }
if ((Get-FileHash -LiteralPath $protectedBefore).Hash -ne (Get-FileHash -LiteralPath $protectedAfter).Hash) { throw "Protected-region verification failed. Do not erase or automatically retry. Backup: $backupDir" }
Write-Output 'Protected first 64 KiB unchanged after upload and application startup.'
Write-Output "Application-only upload verified. Backup: $backupDir"
