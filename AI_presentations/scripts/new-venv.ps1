# Создаёт .venv и ставит зависимости из requirements.txt (локальный бэкенд без Docker).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Write-Host "Готово. Активация: .\.venv\Scripts\Activate.ps1" -ForegroundColor Green
