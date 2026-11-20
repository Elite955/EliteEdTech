$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\logs" | Out-Null

function Test-Port([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Test-BackendCurrent {
  try {
    Invoke-WebRequest -Uri 'http://localhost:4000/api/teacher/dashboard/stats' -UseBasicParsing -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    $response = $_.Exception.Response
    if ($response -and $response.StatusCode.value__ -eq 401) { return $true }
    return $false
  }
}

function Stop-PortProcess([int]$port) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return }
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq 'node') {
    Stop-Process -Id $process.Id -Force
    for ($i = 0; $i -lt 10; $i++) {
      if (-not (Test-Port $port)) { break }
      Start-Sleep -Milliseconds 300
    }
  } else {
    Write-Host "port $port is held by '$($process.ProcessName)' - not restarting it"
  }
}

if (-not (Test-Port 5432)) {
  & "C:\Users\ADMIN\pg16\bin\pg_ctl.exe" -D "C:\Users\ADMIN\pg16\data" -l "C:\Users\ADMIN\pg16\logfile" start
  Start-Sleep -Seconds 2
}

if (Test-Port 4000) {
  if (-not (Test-BackendCurrent)) {
    Write-Host 'Backend on port 4000 is running old code - restarting it'
    Stop-PortProcess 4000
  }
}

if (-not (Test-Port 4000)) {
  Start-Process -FilePath npm.cmd -ArgumentList 'run', 'dev' -WorkingDirectory "$root\backend" `
    -RedirectStandardOutput "$root\logs\api-out.log" -RedirectStandardError "$root\logs\api-err.log" -WindowStyle Hidden
  Start-Sleep -Seconds 4
}

$apps = @(
  @{ Name = 'Home';          Dir = 'home';    Port = 5170; Url = 'http://localhost:5170' },
  @{ Name = 'Student portal'; Dir = 'student'; Port = 5175; Url = 'http://localhost:5175' },
  @{ Name = 'Teacher portal'; Dir = 'teacher'; Port = 5174; Url = 'http://localhost:5174' },
  @{ Name = 'Admin portal';   Dir = 'admin';   Port = 5173; Url = 'http://localhost:5173' }
)

foreach ($app in $apps) {
  if (Test-Port $app.Port) { continue }
  if (-not (Test-Path "$root\$($app.Dir)\node_modules")) {
    Write-Host "$($app.Name): dependencies missing - run 'npm install' in $($app.Dir)\ first"
    continue
  }
  Start-Process -FilePath npm.cmd -ArgumentList 'run', 'dev' -WorkingDirectory "$root\$($app.Dir)" `
    -RedirectStandardOutput "$root\logs\$($app.Dir)-out.log" -RedirectStandardError "$root\logs\$($app.Dir)-err.log" -WindowStyle Hidden
  Start-Sleep -Seconds 4
}

foreach ($p in 5432, 4000, 5170, 5175, 5174, 5173) {
  if (Test-Port $p) { Write-Host "port $p OK" } else { Write-Host "port $p not listening - check $root\logs" }
}
Write-Host ''
Write-Host 'Home:           http://localhost:5170'
Write-Host 'Student portal: http://localhost:5175'
Write-Host 'Teacher portal: http://localhost:5174'
Write-Host 'Admin portal:   http://localhost:5173'
