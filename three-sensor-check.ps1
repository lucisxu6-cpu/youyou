param(
    [switch]$Upload,
    [string]$Port = 'COM4'
)

$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot '.tools/arduino-cli/arduino-cli.exe'
$config = Join-Path $PSScriptRoot 'arduino-cli.yaml'
$sketch = Join-Path $PSScriptRoot 'firmware/three_sensor_check'
$build = Join-Path $PSScriptRoot 'build/three_sensor_check'
$fqbn = 'esp32:esp32:esp32s3:FlashSize=8M,FlashMode=qio,PSRAM=opi,PartitionScheme=default_8MB,USBMode=hwcdc,CDCOnBoot=default,UploadMode=default,UploadSpeed=921600'

& $cli --config-file $config compile --fqbn $fqbn --build-path $build $sketch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Upload) {
    & $cli --config-file $config upload --fqbn $fqbn --port $Port --input-dir $build $sketch
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
