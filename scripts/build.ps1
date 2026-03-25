param(
    [string]$PythonExecutable = $null
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = if ($PythonExecutable) {
    $PythonExecutable
} elseif (Test-Path (Join-Path $root '.venv\Scripts\python.exe')) {
    Join-Path $root '.venv\Scripts\python.exe'
} else {
    'python'
}

Push-Location $root
try {
    & $python -m cloudsprocket.build
}
finally {
    Pop-Location
}
