param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$dartPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $dartPython)) {
    $dartPython = (Get-Command python -ErrorAction Stop).Source
}
& $dartPython (Join-Path $PSScriptRoot 'server.py') --port $Port
