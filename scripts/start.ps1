$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.venv/Scripts/python.exe')) { throw 'Run the installation steps in README.md first.' }
if (-not (Test-Path 'frontend/dist/index.html')) { throw 'Run npm.cmd --prefix frontend run build first.' }
& ./.venv/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
