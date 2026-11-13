$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repoRoot 'backend/.local-pdf-lab/processes.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No lab process record.'; exit 0 }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
function Stop-LabTree([int]$processId) {
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$processId"
  foreach ($child in $children) { Stop-LabTree $child.ProcessId }
  Stop-Process -Id $processId -ErrorAction SilentlyContinue
}
foreach ($name in @('backend','frontend')) {
  $processId = [int]$state.$name
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  $expected = if ($name -eq 'backend') { 'uvicorn tests\.serve_interactive_e2e:app.*8017' } else { 'next.*dev.*3310' }
  if ($process.CommandLine -notmatch $expected) { Write-Warning "Skipping reused process ID $processId"; continue }
  Stop-LabTree $processId
}
Write-Output 'Local lab stopped. Saved courses and progress are retained.'
