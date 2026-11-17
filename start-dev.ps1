$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\logs" | Out-Null

function Test-Port([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Port 5432)) {
  & "C:\Users\ADMIN\pg16\bin\pg_ctl.exe" -D "C:\Users\ADMIN\pg16\data" -l "C:\Users\ADMIN\pg16\logfile" start
  Start-Sleep -Seconds 2
}
if (-not (Test-Port 4000)) {
  Start-Process -FilePath node -ArgumentList 'src/server.js' -WorkingDirectory "$root\backend" `
    -RedirectStandardOutput "$root\logs\api-out.log" -RedirectStandardError "$root\logs\api-err.log" -WindowStyle Hidden
  Start-Sleep -Seconds 3
}
if (-not (Test-Port 5175)) {
  Start-Process -FilePath npm.cmd -ArgumentList 'run', 'dev' -WorkingDirectory "$root\student" -WindowStyle Hidden
  Start-Sleep -Seconds 5
}

foreach ($p in 5432, 4000, 5175) {
  if (Test-Port $p) { Write-Host "port $p OK" } else { Write-Host "port $p FAILED - check $root\logs" }
}
Write-Host ''
Write-Host 'Student portal: http://localhost:5175'
Write-Host 'Admin portal:   http://localhost:5173 (run npm run dev in admin\ separately)'
