param(
  [string]$Root = (Join-Path $PSScriptRoot '../..')
)

$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root)
$allowedDirectories = @('api', 'css', 'docs', 'scripts', 'src', 'tools/sql', 'tools/tests')
$allowedRootFiles = @('.env.example', '.gitignore', 'CHANGELOG.md', 'index.html', 'package.json', 'README.md')
$blockedExtensions = @(
  '.csv', '.xls', '.xlsx', '.pdf', '.zip', '.doc', '.docx', '.ppt', '.pptx', '.odt', '.ods',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.tif', '.tiff', '.bmp',
  '.db', '.sqlite', '.pem', '.p12', '.pfx', '.key'
)
$textExtensions = @('.css', '.html', '.js', '.json', '.md', '.ps1', '.sql', '.txt')
$issues = [Collections.Generic.List[string]]::new()
$files = [Collections.Generic.List[IO.FileInfo]]::new()

foreach ($relativePath in $allowedDirectories) {
  $path = Join-Path $rootPath $relativePath
  if (Test-Path -LiteralPath $path -PathType Container) {
    Get-ChildItem -LiteralPath $path -Recurse -File | Where-Object {
      $_.FullName -notmatch '[\\/](private-invoice-samples|private-data|uploads|attachments|exports|backups|\.tmp[^\\/]*)[\\/]'
    } | ForEach-Object { $files.Add($_) }
  }
}
foreach ($name in $allowedRootFiles) {
  $path = Join-Path $rootPath $name
  if (Test-Path -LiteralPath $path -PathType Leaf) { $files.Add((Get-Item -LiteralPath $path)) }
}

$secretPatterns = @(
  @{ Name = 'legacy shared password'; Pattern = 'Bd@1234' },
  @{ Name = 'Supabase secret key'; Pattern = 'sb_secret_[A-Za-z0-9._-]{30,}' },
  @{ Name = 'Google API key'; Pattern = 'AIza[0-9A-Za-z_-]{30,}' },
  @{ Name = 'GitHub token'; Pattern = 'gh[pousr]_[0-9A-Za-z]{20,}' },
  @{ Name = 'private key'; Pattern = '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' },
  @{ Name = 'Google Drive folder link'; Pattern = 'drive\.google\.com/drive/folders/[0-9A-Za-z_-]+' },
  @{ Name = 'Windows user path'; Pattern = 'C:\\Users\\[^\\\s]+' },
  @{ Name = 'internal LAN host'; Pattern = '(?i)(ssh://[^\s`]+\.lan|[A-Za-z0-9.-]+\.lan:[0-9]+)' }
)

foreach ($file in $files) {
  $relative = $file.FullName.Substring($rootPath.TrimEnd('\').Length).TrimStart('\').Replace('\', '/')
  if ($file.Name -match '^\.env($|\.)' -and $file.Name -ne '.env.example') {
    $issues.Add("Environment file is in upload allowlist: $relative")
  }
  if ($blockedExtensions -contains $file.Extension.ToLowerInvariant()) {
    $issues.Add("Private/export file type is in upload allowlist: $relative")
  }
  if ($textExtensions -notcontains $file.Extension.ToLowerInvariant() -and $file.Name -notin @('.env.example', '.gitignore')) { continue }
  if ($file.FullName -eq (Join-Path $rootPath 'scripts/tools/check-public-upload.ps1')) { continue }
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
  if ($null -eq $content) { continue }
  foreach ($pattern in $secretPatterns) {
    if ($content -match $pattern.Pattern) {
      $issues.Add("$($pattern.Name) found in $relative")
    }
  }
  if ($relative -notlike 'tools/tests/*' -and $content -match '\b[A-Z][12][0-9]{8}\b') {
    $issues.Add("Possible Taiwan personal ID found in $relative")
  }
}

$localOnly = Get-ChildItem -LiteralPath $rootPath -Force -Directory | Where-Object {
  $_.Name -match '^(\.tmp|private-data$|uploads$|attachments$|exports$|backups$|\.vercel$|\.netlify$|node_modules$)'
}

if ($issues.Count) {
  Write-Host 'PUBLIC UPLOAD CHECK FAILED' -ForegroundColor Red
  $issues | Sort-Object -Unique | ForEach-Object { Write-Host "- $_" }
  exit 1
}

Write-Host "PUBLIC UPLOAD CHECK PASSED: $($files.Count) allowlisted files scanned."
Write-Host 'Upload only the allowlisted roots/files documented in README.md; do not drag the whole workspace.'
if ($localOnly.Count) {
  Write-Host "Local-only directories present and excluded: $($localOnly.Count)."
}
