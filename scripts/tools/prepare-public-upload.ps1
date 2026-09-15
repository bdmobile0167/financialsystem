param(
  [string]$Root = (Join-Path $PSScriptRoot '../..')
)

$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$stagingPath = [IO.Path]::GetFullPath((Join-Path $rootPath '.release-upload')).TrimEnd('\')
$expectedStagingPath = "$rootPath\.release-upload"

if ($stagingPath -ne $expectedStagingPath -or -not $stagingPath.StartsWith("$rootPath\", [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unsafe release staging path.'
}

& (Join-Path $rootPath 'scripts/tools/check-public-upload.ps1') -Root $rootPath
if (-not $?) { throw 'Public upload check failed; staging was not created.' }

if (Test-Path -LiteralPath $stagingPath) {
  $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $stagingPath).Path).TrimEnd('\')
  if ($resolved -ne $expectedStagingPath) { throw 'Refusing to remove an unexpected staging path.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingPath | Out-Null

$allowedDirectories = @('api', 'css', 'docs', 'scripts', 'src', 'tools/sql', 'tools/tests')
$allowedRootFiles = @('.env.example', '.gitignore', 'CHANGELOG.md', 'index.html', 'package.json', 'README.md')

foreach ($relativePath in $allowedDirectories) {
  $source = Join-Path $rootPath $relativePath
  if (-not (Test-Path -LiteralPath $source -PathType Container)) { continue }
  Get-ChildItem -LiteralPath $source -Recurse -File | Where-Object {
    $_.FullName -notmatch '[\\/](private-invoice-samples|private-data|uploads|attachments|exports|backups|\.tmp[^\\/]*)[\\/]'
  } | ForEach-Object {
    $relative = $_.FullName.Substring($rootPath.Length).TrimStart('\')
    $destination = Join-Path $stagingPath $relative
    $destinationDirectory = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $destinationDirectory)) {
      New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    }
    Copy-Item -LiteralPath $_.FullName -Destination $destination
  }
}

foreach ($name in $allowedRootFiles) {
  $source = Join-Path $rootPath $name
  if (Test-Path -LiteralPath $source -PathType Leaf) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $stagingPath $name)
  }
}

& (Join-Path $rootPath 'scripts/tools/check-public-upload.ps1') -Root $stagingPath
if (-not $?) { throw 'Staged upload failed its final privacy check.' }

$count = (Get-ChildItem -LiteralPath $stagingPath -Recurse -File).Count
Write-Host "Safe upload staging created: $stagingPath"
Write-Host "Files: $count. Upload only the contents of this directory."
