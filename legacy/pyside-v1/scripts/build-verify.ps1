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

$runId = Get-Random
$distPath = Join-Path $root ".tmp\dist-verify-$runId"
$workPath = Join-Path $root ".tmp\pyinstaller-work-$runId"
$specPath = Join-Path $root ".tmp\pyinstaller-spec-$runId"
$tempPath = Join-Path $root ".tmp\build-temp-$runId"

New-Item -ItemType Directory -Force -Path $distPath, $workPath, $specPath, $tempPath | Out-Null
$env:TMP = $tempPath
$env:TEMP = $tempPath

Push-Location $root
try {
    & $python -m cloudsprocket.build --distpath $distPath --workpath $workPath --specpath $specPath --temp-dir $tempPath
}
finally {
    Pop-Location
}
