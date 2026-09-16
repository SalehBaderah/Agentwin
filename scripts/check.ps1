$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& ./.venv/Scripts/python.exe -m pytest -q
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& npm.cmd --prefix frontend run lint
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& npm.cmd --prefix frontend run build
exit $LASTEXITCODE
