$ErrorActionPreference = 'Stop'

$baseline = if ($env:MIGRATION_LINT_BASELINE) { $env:MIGRATION_LINT_BASELINE } else { '20260827110000' }
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$migrationDir = Join-Path $root 'supabase/migrations'
$patterns = @(
  'select\s+role\s+into\s+v_actor_role\s+from\s+public\.profiles',
  'from\s+public\.profiles\s+where\s+id\s*=\s*v_actor_id'
)

$violations = @()
Get-ChildItem -Path $migrationDir -Filter '*.sql' | Where-Object {
  $_.BaseName.Substring(0, 14) -ge $baseline
} | ForEach-Object {
  $content = Get-Content -LiteralPath $_.FullName -Raw
  foreach ($pattern in $patterns) {
    if ($content -match $pattern) {
      $violations += "$($_.Name): $pattern"
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Error ("Migration role regression found:`n" + ($violations -join "`n"))
}

Write-Host "Migration lint passed from baseline $baseline."
