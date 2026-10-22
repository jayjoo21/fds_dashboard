param(
    [int]$Port = 8765,
    [string]$DataDir,
    [string]$AuditDir,
    [string]$OwnerAccounts,
    [string]$PriceCsv
)
$ErrorActionPreference = 'Stop'
# Process-local read paths only. No files are copied or rewritten.
if ($DataDir) { $env:DART_DATA_DIR = $DataDir }
if ($AuditDir) { $env:DART_AUDIT_DIR = $AuditDir }
if ($OwnerAccounts) { $env:DART_OWNER_ACCOUNTS = $OwnerAccounts }
if ($PriceCsv) { $env:DART_PRICE_CSV = $PriceCsv }
$dartPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $dartPython)) {
    $dartPython = (Get-Command python -ErrorAction Stop).Source
}
& $dartPython (Join-Path $PSScriptRoot 'server.py') --port $Port
