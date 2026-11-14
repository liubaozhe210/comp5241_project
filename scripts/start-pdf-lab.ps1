param([string]$Python = 'python', [string]$Node = 'node')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $repoRoot 'backend'
$frontend = Join-Path $repoRoot 'frontend'
$lab = Join-Path $backend '.local-pdf-lab'
$next = Join-Path $frontend 'node_modules/next/dist/bin/next'
if (-not (Test-Path -LiteralPath $next)) { throw 'Run npm ci in frontend first.' }
$pythonExe = (Get-Command $Python -ErrorAction Stop).Source
$nodeExe = (Get-Command $Node -ErrorAction Stop).Source
foreach ($port in @(8017,3310)) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port is occupied. Stop the existing lab before starting another." }
}
New-Item -ItemType Directory -Path $lab -Force | Out-Null
$public = Join-Path $frontend 'public'
New-Item -ItemType Directory -Path $public -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'pdf-lab.html') -Destination (Join-Path $public 'local-pdf-lab.html')
$vars = @{
  INTERACTIVE_E2E_DB = (Join-Path $lab 'courses.sqlite')
  INTERACTIVE_E2E_REAL_AI = '1'
  CORS_ORIGINS = 'http://localhost:3310,http://127.0.0.1:3310'
  NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-pdf-lab-placeholder'
  NEXT_PUBLIC_API_BASE = 'http://127.0.0.1:8017'
  NEXT_TELEMETRY_DISABLED = '1'
  COURSEHUB_LOCAL_PDF_LAB = '1'
}
$previous = @{}
foreach ($name in $vars.Keys) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process'); [Environment]::SetEnvironmentVariable($name, $vars[$name], 'Process') }
$api = $null
try {
  $api = Start-Process -FilePath $pythonExe -ArgumentList @('-m','uvicorn','tests.serve_interactive_e2e:app','--host','127.0.0.1','--port','8017') -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $lab 'backend.log') -RedirectStandardError (Join-Path $lab 'backend-errors.log')
  $web = Start-Process -FilePath $nodeExe -ArgumentList @('node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3310') -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $lab 'frontend.log') -RedirectStandardError (Join-Path $lab 'frontend-errors.log')
  @{backend=$api.Id;frontend=$web.Id} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $lab 'processes.json') -Encoding utf8
  Write-Output 'Local PDF lab starting: http://localhost:3310/local-pdf-lab.html'
  Write-Output 'Real AI calls use backend/.env. Course data stays in local SQLite.'
} catch {
  if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id }
  throw
} finally {
  foreach ($name in $vars.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
