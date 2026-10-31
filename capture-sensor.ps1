param(
    [string]$Port = 'COM4',
    [ValidateRange(1, 1800)][int]$Seconds = 600,
    [ValidateSet('Single', 'Three')][string]$Channels = 'Single',
    [string]$LogFile = '',
    [string]$StopFile = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($LogFile)) {
    $LogFile = 'logs/{0}-sensor-{1}.csv' -f $Channels.ToLowerInvariant(), (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
}
$logPath = if ([System.IO.Path]::IsPathRooted($LogFile)) { $LogFile } else { Join-Path $PSScriptRoot $LogFile }
$stopPath = if ([string]::IsNullOrWhiteSpace($StopFile)) { $null } elseif ([System.IO.Path]::IsPathRooted($StopFile)) { $StopFile } else { Join-Path $PSScriptRoot $StopFile }
if ($stopPath -and (Test-Path -LiteralPath $stopPath)) { throw "Stop file already exists: $stopPath" }
[System.IO.Directory]::CreateDirectory((Split-Path -Parent $logPath)) | Out-Null
$columnCount = if ($Channels -eq 'Three') { 4 } else { 2 }
$pattern = if ($Channels -eq 'Three') { '^\d+,\d+,\d+,\d+$' } else { '^\d+,\d+$' }
$header = if ($Channels -eq 'Three') { 'received_utc,uptime_ms,head_raw,belly_raw,back_raw' } else { 'received_utc,uptime_ms,head_raw' }
$serialPort = [System.IO.Ports.SerialPort]::new($Port, 115200)
$serialPort.ReadTimeout = 500
$serialPort.DtrEnable = $false
$serialPort.RtsEnable = $false
$writer = $null
$stream = $null
$sampleCount = 0
$rejectedCount = 0
try {
    # Refuse to overwrite previous measurements; readers may inspect the live CSV.
    $stream = [System.IO.File]::Open($logPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    $writer = [System.IO.StreamWriter]::new($stream)
    $writer.AutoFlush = $true
    $writer.WriteLine($header)
    $serialPort.Open()
    $serialPort.DiscardInBuffer()
    Write-Output "Capturing $Channels channel mode on $Port for $Seconds seconds to $logPath"
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $Seconds) {
        if ($stopPath -and (Test-Path -LiteralPath $stopPath)) { break }
        try {
            $line = $serialPort.ReadLine().Trim()
        } catch [System.TimeoutException] {
            continue
        }
        if ($line -match $pattern) {
            $values = $line.Split(',')
            $valid = $true
            [uint32]$deviceTime = 0
            if (-not [uint32]::TryParse($values[0], [ref]$deviceTime)) { $valid = $false }
            for ($i = 1; $i -lt $columnCount; $i++) {
                [int]$raw = 0
                if (-not [int]::TryParse($values[$i], [ref]$raw) -or $raw -gt 4095) { $valid = $false }
            }
            if ($valid) {
                $writer.WriteLine(('{0},{1}' -f [DateTime]::UtcNow.ToString('o'), $line))
                $sampleCount++
                continue
            }
        }
        $rejectedCount++
    }
} finally {
    if ($null -ne $writer) { $writer.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
    if ($serialPort.IsOpen) { $serialPort.Close() }
    $serialPort.Dispose()
}
Write-Output "Capture complete: $sampleCount samples, $rejectedCount skipped lines."
if ($sampleCount -eq 0) { exit 1 }
exit 0
