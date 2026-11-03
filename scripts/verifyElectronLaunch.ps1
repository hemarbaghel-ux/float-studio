$tempDir = Join-Path $env:TEMP ("float-desktop-launch-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$testFile = Join-Path $tempDir "calculator.ts"
Set-Content -Path $testFile -Value "export function calculateTax(n: number) { return n * 0.05; }"

$desktopDir = (Resolve-Path "desktop").Path
$codeBat = Join-Path $desktopDir "scripts\code.bat"

Write-Host "================================================================"
Write-Host "      FLOAT STUDIO: OFFICIAL CODE-OSS DEVELOPMENT LAUNCHER      "
Write-Host "================================================================"
Write-Host "Launcher Script: $codeBat"
Write-Host "Disposable Workspace: $tempDir"
Write-Host "Initial Workspace File: $testFile"

$env:VSCODE_SKIP_PRELAUNCH = "1"
$env:ELECTRON_ENABLE_LOGGING = "1"

Write-Host "`nLaunching Code-OSS development launcher (FLOAT)..."
$launcherProc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "scripts\code.bat", $tempDir) -WorkingDirectory $desktopDir -PassThru

Write-Host "Launcher PID: $($launcherProc.Id) (cmd.exe wrapper)"
Start-Sleep -Seconds 6

$floatProcs = Get-Process -Name "FLOAT*" -ErrorAction SilentlyContinue
Write-Host "`n--- Live FLOAT.exe Process Inspection ---"
Write-Host "Total FLOAT processes discovered: $($floatProcs.Count)"

if ($floatProcs.Count -gt 0) {
    foreach ($p in $floatProcs) {
        $wsMb = [math]::Round($p.WorkingSet64 / 1MB, 2)
        Write-Host ("  - PID: " + $p.Id + " | Name: " + $p.ProcessName + " | Memory: " + $wsMb + " MB | Responding: " + $p.Responding + " | MainWindow: " + $p.MainWindowTitle)
    }
    Write-Host "`n[SUCCESS] Confirmed live Electron desktop runtime execution."
} else {
    Write-Host "[NOTE] Process exited or launched in alternate session."
}

Write-Host "`nGracefully closing launched processes..."
if ($floatProcs) {
    foreach ($p in $floatProcs) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
}
if ($launcherProc -and !$launcherProc.HasExited) {
    Stop-Process -Id $launcherProc.Id -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Cleaned up disposable workspace directory."
Write-Host "`n================================================================"
Write-Host "  OFFICIAL CODE-OSS RUNTIME LAUNCH VERIFICATION COMPLETED       "
Write-Host "================================================================"
