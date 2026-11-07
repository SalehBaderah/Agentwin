$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.venv/Scripts/python.exe')) { throw 'Run the installation steps in README.md first.' }
if (-not (Test-Path 'frontend/node_modules')) { throw 'Run npm.cmd --prefix frontend ci first.' }
Write-Host 'Building the latest frontend before starting AgentWin...'
& npm.cmd --prefix frontend run build
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& ./.venv/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
exit $LASTEXITCODE
