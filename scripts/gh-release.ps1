# GitHub release helper for Release.cmd (needs GH_TOKEN with Contents: read and write).
#   -Mode create : make the release for this version before electron-builder uploads into it.
#                  (When electron-builder has to create it, its uploads run in parallel and each one
#                  creates its own release, so the files end up split over two releases.)
#   -Mode fix    : make sure every release with this version's tag has the installer, its blockmap
#                  and latest.yml (the file the app's updater reads). Uploads only what is missing;
#                  never deletes anything.
param([Parameter(Mandatory = $true)][ValidateSet('create', 'fix')][string]$Mode)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$ver = $pkg.version
$tag = "v$ver"
$repo = 'rolcsyvagyok/poe-helper'
$token = $env:GH_TOKEN
if (-not $token) { $token = (Get-ItemProperty -Path 'HKCU:\Environment' -Name GH_TOKEN -ErrorAction SilentlyContinue).GH_TOKEN }
if (-not $token) { throw 'GH_TOKEN is not set.' }
$h = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'poe-helper-release' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Releases-ForTag {
  $all = Invoke-RestMethod -Headers $h -Uri "https://api.github.com/repos/$repo/releases?per_page=50"
  return @($all | Where-Object { $_.tag_name -eq $tag })
}

if ($Mode -eq 'create') {
  $have = Releases-ForTag
  if ($have.Count -gt 0) { Write-Output "Release $tag already exists ($($have.Count))."; exit 0 }
  $notesFile = Join-Path $root 'build\release-notes.md'
  $notes = if (Test-Path $notesFile) { [IO.File]::ReadAllText($notesFile) } else { '' } # a plain string: Get-Content adds PS properties that ConvertTo-Json would send
  $body = @{ tag_name = $tag; name = $ver; body = $notes; draft = $false; prerelease = $false } | ConvertTo-Json
  $r = Invoke-RestMethod -Method Post -Headers $h -Uri "https://api.github.com/repos/$repo/releases" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8'
  Write-Output "Created release $tag (id $($r.id))."
  exit 0
}

# fix
$files = @("PoE-Helper-Setup-$ver.exe", "PoE-Helper-Setup-$ver.exe.blockmap", 'latest.yml') | ForEach-Object { @{ name = $_; path = (Join-Path $root "dist\$_") } }
foreach ($f in $files) { if (-not (Test-Path $f.path)) { throw "Missing $($f.path). Build the release first." } }
$rels = Releases-ForTag
if ($rels.Count -eq 0) { throw "No GitHub release for $tag." }
foreach ($rel in $rels) {
  $names = @($rel.assets | ForEach-Object { $_.name })
  foreach ($f in $files) {
    if ($names -contains $f.name) { Write-Output "release $($rel.id): $($f.name) already there"; continue }
    Write-Output "release $($rel.id): uploading $($f.name)..."
    $ct = if ($f.name -like '*.yml') { 'text/yaml' } else { 'application/octet-stream' }
    Invoke-RestMethod -Method Post -Headers $h -Uri "https://uploads.github.com/repos/$repo/releases/$($rel.id)/assets?name=$([Uri]::EscapeDataString($f.name))" -InFile $f.path -ContentType $ct | Out-Null
  }
}
Write-Output "Done: every $tag release has the installer and latest.yml."
