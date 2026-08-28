# Links this folder into ~/.vscode/extensions with a directory junction, so the
# extension loads straight from source with no packaging step. Editing
# extension.js then only needs a window reload.
#
#   powershell -ExecutionPolicy Bypass -File scripts\dev-link.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\dev-link.ps1 -Remove
#
# A junction (not a symlink) is used on purpose: it needs no admin rights.
# Folder-scanned extensions are per machine and are NOT covered by Settings Sync.

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$link = Join-Path $env:USERPROFILE ".vscode\extensions\$($manifest.publisher).$($manifest.name)-$($manifest.version)"

if ($Remove) {
    if (Test-Path $link) {
        # Remove the junction itself, never its contents.
        [System.IO.Directory]::Delete($link, $false)
        Write-Host "Removed $link" -ForegroundColor Green
    }
    else {
        Write-Host "Nothing to remove at $link" -ForegroundColor DarkGray
    }
    return
}

if (Test-Path $link) { [System.IO.Directory]::Delete($link, $false) }
New-Item -ItemType Junction -Path $link -Target $root | Out-Null
Write-Host "Linked:`n  $link`n  -> $root" -ForegroundColor Green
Write-Host 'Now run "Developer: Reload Window" in VS Code.' -ForegroundColor Cyan
