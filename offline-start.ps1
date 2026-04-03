param(
  [switch]$SkipMongoCheck
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Start-DevWindow {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Command
  )

  Write-Host "Starting $Name..." -ForegroundColor Cyan
  Start-Process -FilePath "powershell.exe" -WorkingDirectory $WorkingDirectory -ArgumentList @(
    '-NoExit',
    '-Command',
    $Command
  ) | Out-Null
}

if (-not $SkipMongoCheck) {
  $mongoReady = $false
  try {
    $mongoReady = Test-NetConnection -ComputerName 'localhost' -Port 27017 -InformationLevel Quiet
  } catch {
    $mongoReady = $false
  }

  if (-not $mongoReady) {
    Write-Warning 'MongoDB is not reachable on localhost:27017. Start MongoDB locally before launching Regiment.'
  }
}

$serverCmd = @'
$env:NODE_ENV = "development"
$env:OFFLINE_MODE = "true"
$env:NO_CLOUD_MODE = "true"
npm run dev
'@

$mlCmd = @'
$env:OFFLINE_MODE = "true"
$env:ML_PORT = "8000"
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
'@

$clientCmd = @'
$env:VITE_API_BASE_URL = "http://localhost:4000"
npm run dev -- --host 0.0.0.0
'@

Start-DevWindow -Name 'backend' -WorkingDirectory (Join-Path $root 'server') -Command $serverCmd
Start-DevWindow -Name 'ml service' -WorkingDirectory (Join-Path $root 'ml_service') -Command $mlCmd
Start-DevWindow -Name 'frontend' -WorkingDirectory (Join-Path $root 'client') -Command $clientCmd

Write-Host ''
Write-Host 'Regiment offline mode launched.' -ForegroundColor Green
Write-Host 'Open the frontend at http://localhost:5173' -ForegroundColor Green
Write-Host 'If you are on another device in the LAN, use the machine IP shown by your network settings.' -ForegroundColor Green
