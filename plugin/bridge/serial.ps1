param(
    [ValidateSet('Discover','Connect')][string]$Mode = 'Discover',
    [string]$Port = '',
    [string]$Nonce = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
function Emit($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Depth 6 -Compress)); [Console]::Out.Flush() }
if ($Mode -eq 'Discover') {
    $available = [System.IO.Ports.SerialPort]::GetPortNames()
    $ports = @()
    # Only the verified board's CH343 adapter. Do not probe unrelated serial hardware.
    $usbRoot = 'Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\USB\VID_1A86&PID_55D3'
    if (Test-Path -LiteralPath $usbRoot) {
        foreach ($entry in Get-ChildItem -LiteralPath $usbRoot) {
            $parameters = Join-Path $entry.PSPath 'Device Parameters'
            $props = Get-ItemProperty -LiteralPath $parameters -ErrorAction SilentlyContinue
            if ($props.PortName -in $available -and $props.PortName -notin @($ports | ForEach-Object { $_.port })) { $ports += [pscustomobject]@{port=$props.PortName; usbSerial=$entry.PSChildName} }
        }
    }
    Emit @{type='ports'; ports=$ports}
    exit 0
}
if ($Port -notmatch '^COM[1-9][0-9]{0,3}$' -or $Nonce -notmatch '^[0-9a-f]{32}$') { throw 'Invalid serial arguments' }
$serial = [System.IO.Ports.SerialPort]::new($Port,115200)
$serial.DtrEnable = $false
$serial.RtsEnable = $false
$serial.ReadTimeout = 100
$serial.WriteTimeout = 500
$serial.NewLine = "`n"
$serial.Encoding = [System.Text.Encoding]::ASCII
# Console.In is a synchronized reader: its ReadLineAsync may block synchronously.
# A dedicated background task keeps serial reads/heartbeats independent of stdin.
Add-Type -TypeDefinition @'
using System;
using System.Threading.Tasks;
using System.IO.Ports;
using System.Text;
public static class PetInputReader {
    public static Task<string> Read() { return Task.Run(() => Console.In.ReadLine()); }
}
public sealed class PetSerialReader {
    private readonly StringBuilder buffer = new StringBuilder();
    public string ReadLine(SerialPort port) {
        while (true) {
            int c;
            try { c = port.ReadChar(); } catch (TimeoutException) { return null; }
            if (c == '\n') { string line = buffer.ToString(); buffer.Clear(); return line; }
            if (buffer.Length >= 1024) throw new InvalidOperationException("Oversized or unterminated device frame");
            buffer.Append((char)c);
        }
    }
}
'@
$reader = [PetSerialReader]::new()
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$started = $false
try {
    $serial.Open()
    $serial.DiscardInBuffer()
    $serial.WriteLine("PET/1 HELLO $Nonce")
    $deadline = $clock.ElapsedMilliseconds + 3000
    $hello = $null
    while ($clock.ElapsedMilliseconds -lt $deadline) {
        $line = $reader.ReadLine($serial)
        if ($null -eq $line) { continue }
        $line = $line.Trim()
        if ($line.Length -gt 1024) { throw 'Oversized device response' }
        try { $candidate = $line | ConvertFrom-Json } catch { continue } # Ignore boot logs / other firmware.
        $legacyLayout = $candidate.firmware -eq '1.0.0' -and ($candidate.pins -join ',') -eq '4,6,7'
        $fourLayout = $candidate.firmware -in @('1.1.0','1.1.1') -and ($candidate.pins -join ',') -eq '4,6,7,5' -and ($candidate.zones -join ',') -ceq 'head,left_hand,back,right_hand'
        if ($candidate.type -ceq 'hello' -and $candidate.product -ceq 'loveandrobot.pet' -and $candidate.protocol -eq 1 -and $candidate.nonce -ceq $Nonce -and ($legacyLayout -or $fourLayout) -and $candidate.adc_bits -eq 12 -and $candidate.board -ceq 'esp32s3-n8r8' -and $candidate.sample_ms -eq 20 -and $candidate.device_id -cmatch '^LR-[A-F0-9]{12}$' -and $candidate.boot_id -cmatch '^[A-F0-9]{16}$') { $hello = $candidate; break }
    }
    if ($null -eq $hello) { throw 'Supported pet firmware did not answer the handshake' }
    Emit $hello
    $serial.WriteLine("PET/1 START $Nonce")
    $started = $true
    $stdinTask = [PetInputReader]::Read()
    $lastPing = $clock.ElapsedMilliseconds
    while ($true) {
        if ($stdinTask.IsCompleted) {
            $inputLine = $stdinTask.GetAwaiter().GetResult()
            if ($null -eq $inputLine -or $inputLine -eq 'stop') { break }
            $stdinTask = [PetInputReader]::Read()
        }
        if (($clock.ElapsedMilliseconds - $lastPing) -ge 1000) {
            $serial.WriteLine("PET/1 PING $Nonce")
            $lastPing = $clock.ElapsedMilliseconds
        }
        $line = $reader.ReadLine($serial)
        if ($null -eq $line) { continue }
        $line = $line.Trim()
        if ($line.Length -gt 1024) { throw 'Oversized device frame' }
        [Console]::Out.WriteLine($line)
        [Console]::Out.Flush()
    }
} catch {
    Emit @{type='transport_error'; message=$_.Exception.Message; port=$Port}
    exit 1
} finally {
    if ($serial.IsOpen) {
        if ($started) { try { $serial.WriteLine("PET/1 STOP $Nonce") } catch { <# Device may already be unplugged. #> } }
        $serial.Close()
    }
    $serial.Dispose()
}
