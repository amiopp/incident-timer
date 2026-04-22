# Script de démarrage de l'API FastAPI (portable)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $scriptDir ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
	Write-Error "Virtual environment not found at '$pythonExe'."
	Write-Host "Create it with: py -3.13 -m venv .venv" -ForegroundColor Yellow
	exit 1
}

Set-Location $scriptDir
& $pythonExe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
