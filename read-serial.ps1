param(
    [string]$Port = 'COM4',
    [ValidateRange(1, 120)][int]$Seconds = 12,
    [switch]$ResetBoard,
    [string]$LogFile = 'logs/board-check-serial.txt'
)

$ErrorActionPreference = 'Stop'
$serialPort = [System.IO.Ports.SerialPort]::new($Port, 115200)
$serialPort.ReadTimeout = 500
$serialPort.DtrEnable = $false
$serialPort.RtsEnable = $false
$serialPort.Encoding = [System.Text.Encoding]::UTF8
$lines = [System.Collections.Generic.List[string]]::new()
try {
    $serialPort.Open()
    if ($ResetBoard) {
        # CH343 auto-reset: DTR remains inactive; pulse EN through RTS.
        $serialPort.DiscardInBuffer()
        $serialPort.RtsEnable = $true
        Start-Sleep -Milliseconds 150
        $serialPort.RtsEnable = $false
    }
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $Seconds) {
        try {
            $line = $serialPort.ReadLine().TrimEnd()
            $lines.Add($line)
            Write-Output $line
        } catch [System.TimeoutException] {
            # A read timeout is normal while waiting for the next message.
        }
    }
} finally {
    if ($serialPort.IsOpen) { $serialPort.Close() }
    $serialPort.Dispose()
    $logPath = Join-Path $PSScriptRoot $LogFile
    $lines | Set-Content -LiteralPath $logPath -Encoding utf8
}

if ($lines.Count -eq 0) {
    Write-Output 'No serial output received during this interval.'
}
