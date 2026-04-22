@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%.venv\Scripts\python.exe"

cd /d "%SCRIPT_DIR%"

if not exist "%PYTHON_EXE%" (
	echo Virtual environment not found at "%PYTHON_EXE%"
	echo Create it with: py -3.13 -m venv .venv
	exit /b 1
)

start "" "%PYTHON_EXE%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
