# Windows PowerShell 5.1 / Windows 10+. Uses Microsoft's public WinRT sensor API.
# Emits newline-delimited JSON; never requests administrator access.
param([int]$ParentId = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    $sensor = [Windows.Devices.Sensors.Accelerometer, Windows.Devices.Sensors, ContentType = WindowsRuntime]::GetDefault()
    if ($null -eq $sensor) {
        [Console]::WriteLine('{"type":"unavailable","message":"Windows reports no built-in accelerometer. Try microphone mode."}')
        exit 2
    }
    $sensor.ReportInterval = [Math]::Max(10, $sensor.MinimumReportInterval)
    $last = $null
    $lastData = [DateTime]::UtcNow
    $announced = $false
    while ($true) {
        if ($ParentId -gt 0 -and $null -eq (Get-Process -Id $ParentId -ErrorAction SilentlyContinue)) { break }
        $reading = $sensor.GetCurrentReading()
        if ($null -ne $reading -and $reading.Timestamp -ne $last) {
            if (!$announced) {
                [Console]::WriteLine('{"type":"ready","message":"Windows motion sensor connected"}')
                $announced = $true
            }
            $last = $reading.Timestamp
            $lastData = [DateTime]::UtcNow
            $sample = @{ type = 'sample'; x = $reading.AccelerationX; y = $reading.AccelerationY; z = $reading.AccelerationZ }
            [Console]::WriteLine(($sample | ConvertTo-Json -Compress))
        }
        if (([DateTime]::UtcNow - $lastData).TotalSeconds -gt 3) { throw 'Sensor stopped sending data. Try microphone mode.' }
        Start-Sleep -Milliseconds 10
    }
} catch {
    [Console]::WriteLine((@{ type = 'unavailable'; message = 'Windows sensor access failed or is disabled. Try microphone mode.' } | ConvertTo-Json -Compress))
    exit 3
} finally { if ($null -ne $sensor) { $sensor.ReportInterval = 0 } }
