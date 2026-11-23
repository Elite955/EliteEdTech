$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\logs" | Out-Null

function Test-Port([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Ensure-Dependencies([string]$dir, [string]$label) {
  $dirPath = Join-Path $root $dir
  if (Test-Path -LiteralPath (Join-Path $dirPath 'node_modules')) { return }

  Write-Host "${label}: installing dependencies..."
  $lock = Join-Path $dirPath 'package-lock.json'
  $arguments = if (Test-Path -LiteralPath $lock) {
    @('ci', '--no-audit', '--no-fund')
  } else {
    @('install', '--no-audit', '--no-fund')
  }

  Push-Location $dirPath
  try {
    & npm.cmd @arguments
    if ($LASTEXITCODE -ne 0) { throw "$label dependency installation failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
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
  $defaultPgCtl = Join-Path $env:USERPROFILE 'pg16\bin\pg_ctl.exe'
  $pgCtl = if ($env:PG_CTL) { $env:PG_CTL } elseif (Test-Path -LiteralPath $defaultPgCtl) { $defaultPgCtl } else { 'pg_ctl' }
  $pgData = if ($env:PGDATA) { $env:PGDATA } else { Join-Path $env:USERPROFILE 'pg16\data' }
  $pgLog = if ($env:PG_LOG_FILE) { $env:PG_LOG_FILE } else { Join-Path $root 'logs\postgres.log' }

  if (-not (Get-Command $pgCtl -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath $pgCtl)) {
    throw 'PostgreSQL is not running. Set PG_CTL and PGDATA (and optionally PG_LOG_FILE) to your local PostgreSQL installation.'
  }

  & $pgCtl -D $pgData -l $pgLog start
  Start-Sleep -Seconds 2
}

if (Test-Port 4000) {
  if (-not (Test-BackendCurrent)) {
    Write-Host 'Backend on port 4000 is running old code - restarting it'
    Stop-PortProcess 4000
  }
}

Ensure-Dependencies 'backend' 'Backend'

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
  Ensure-Dependencies $app.Dir $app.Name
  Start-Process -FilePath npm.cmd -ArgumentList 'run', 'dev' -WorkingDirectory "$root\$($app.Dir)" `
    -RedirectStandardOutput "$root\logs\$($app.Dir)-out.log" -RedirectStandardError "$root\logs\$($app.Dir)-err.log" -WindowStyle Hidden
  Start-Sleep -Seconds 4
}

foreach ($p in 5432, 4000, 5170, 5175, 5174, 5173) {
  if (Test-Port $p) { Write-Host "port $p OK" } else { Write-Host "port $p not listening - check $root\logs" }
}
Write-Host ''
Write-Host 'Host ports:'
Write-Host '  PostgreSQL       localhost:5432'
Write-Host '  API health       http://localhost:4000/api/health'
Write-Host '  Public site      http://localhost:5170'
Write-Host '  Student portal   http://localhost:5175'
Write-Host '  Teacher portal   http://localhost:5174'
Write-Host '  Admin console    http://localhost:5173'
Write-Host ''
