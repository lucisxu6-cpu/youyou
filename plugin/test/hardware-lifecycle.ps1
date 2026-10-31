param([string]$Port='COM4')
$ErrorActionPreference='Stop'
$serial=[System.IO.Ports.SerialPort]::new($Port,115200)
$serial.DtrEnable=$false; $serial.RtsEnable=$false
$serial.ReadTimeout=80; $serial.WriteTimeout=500; $serial.NewLine="`n"
$serial.Encoding=[Text.Encoding]::ASCII
$checks=[Collections.Generic.List[string]]::new()
function Read-Window([int]$Ms) {
    $clock=[Diagnostics.Stopwatch]::StartNew()
    $frames=[Collections.Generic.List[object]]::new()
    while($clock.ElapsedMilliseconds -lt $Ms) {
        try { $line=$serial.ReadLine() } catch [TimeoutException] { continue }
        try { $frame=$line | ConvertFrom-Json } catch { continue }
        $frames.Add([pscustomobject]@{at=$clock.ElapsedMilliseconds;frame=$frame})
    }
    return ,$frames.ToArray()
}
function Check([bool]$Condition,[string]$Label) {
    if(-not $Condition){throw "Hardware lifecycle check failed: $Label"}
    $checks.Add($Label)
}
function Say([string]$Text){$serial.WriteLine($Text)}
function Quiet([string]$Label){$frames=Read-Window 300;Check (@($frames|Where-Object {$_.frame.type -eq 'sample'}).Count -eq 0) $Label}
$nonce='0123456789abcdef0123456789abcdef'
$next='fedcba9876543210fedcba9876543210'
try {
    $serial.Open();$serial.DiscardInBuffer()
    Say "PET/1 HELLO $nonce"
    $frames=Read-Window 500
    $hello=@($frames|Where-Object {$_.frame.type -eq 'hello'})[0].frame
    Check ($hello.firmware -eq '1.1.1' -and $hello.nonce -ceq $nonce -and ($hello.pins -join ',') -eq '4,6,7,5') 'strict handshake and four physical channels'
    Say "PET/1 START extra $nonce";Quiet 'START with extra fields rejected'
    Say "PET/1 START $next";Quiet 'wrong nonce rejected'
    $serial.Write("PET/1 START $nonce"+[char]0+"hidden`n");Quiet 'embedded NUL rejects whole command'
    $serial.Write("PET/1 STA`rRT $nonce`n");Quiet 'embedded CR rejects whole command'
    $serial.Write("PET/1 START $nonce`r`n")
    $frames=Read-Window 250
    Check (@($frames|Where-Object {$_.frame.type -eq 'sample'}).Count -ge 5) 'valid CRLF START streams data'
    Say "PET/1 STOP extra $nonce"
    $frames=Read-Window 250
    Check (@($frames|Where-Object {$_.frame.type -eq 'sample'}).Count -ge 5) 'malformed STOP does not stop stream'
    $serial.Write(('X'*160)+"`n")
    Say "PET/1 STOP $nonce"
    $null=Read-Window 150;Quiet 'overflow line discarded; subsequent valid STOP works'
    Say "PET/1 START $nonce";$null=Read-Window 100
    Say "PET/1 HELLO $next";$frames=Read-Window 250
    Check (@($frames|Where-Object {$_.frame.type -eq 'hello' -and $_.frame.nonce -ceq $next}).Count -eq 1) 'new HELLO replaces session challenge'
    Quiet 'HELLO stops previous stream'
    Say "PET/1 START $nonce";Quiet 'old session nonce cannot restart stream'
    Say "PET/1 START $next"
    $frames=Read-Window 6500
    $samples=@($frames|Where-Object {$_.frame.type -eq 'sample'})
    Check ($samples.Count -ge 180 -and $samples.Count -le 260) 'lease streams for a bounded interval without heartbeat'
    Check ($samples[-1].at -ge 4500 -and $samples[-1].at -lt 5500) 'missing heartbeat stops at approximately five seconds'
    Quiet 'expired lease remains silent'
    [pscustomobject]@{firmware=$hello.firmware;device=$hello.device_id;checks=$checks.ToArray();leaseSamples=$samples.Count;lastLeaseSampleMs=$samples[-1].at} | ConvertTo-Json -Depth 5
} finally {
    if($serial.IsOpen){try{Say "PET/1 STOP $next"}catch{};$serial.Close()}
    $serial.Dispose()
}
