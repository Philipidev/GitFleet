# Bumps the version, commits and pushes to main, which is what makes the release
# workflow publish to the Marketplace.
#
#   powershell -ExecutionPolicy Bypass -File scripts\bump.ps1            # 0.2.0 -> 0.2.1
#   powershell -ExecutionPolicy Bypass -File scripts\bump.ps1 minor      # 0.2.0 -> 0.3.0
#   powershell -ExecutionPolicy Bypass -File scripts\bump.ps1 major      # 0.2.0 -> 1.0.0
#   powershell -ExecutionPolicy Bypass -File scripts\bump.ps1 patch -NoPush

param(
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Part = 'patch',
    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
    $dirty = git status --porcelain
    if ($dirty) {
        Write-Warning "Working tree is not clean. The bump commit would carry these along:"
        $dirty
        throw 'Commit or stash first.'
    }

    $manifestPath = Join-Path $root 'package.json'
    $raw = Get-Content $manifestPath -Raw
    $old = ([regex]'"version":\s*"([^"]+)"').Match($raw).Groups[1].Value
    if (-not $old) { throw 'Could not read the current version from package.json.' }

    $n = $old.Split('.')
    switch ($Part) {
        'patch' { $new = "$($n[0]).$($n[1]).$([int]$n[2] + 1)" }
        'minor' { $new = "$($n[0]).$([int]$n[1] + 1).0" }
        'major' { $new = "$([int]$n[0] + 1).0.0" }
    }

    # Only the first "version" key, which is the manifest's own.
    $updated = ([regex]'"version":\s*"[^"]+"').Replace($raw, """version"": ""$new""", 1)
    [System.IO.File]::WriteAllText($manifestPath, $updated, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host "$old -> $new" -ForegroundColor Cyan

    git add package.json
    git commit -m "Release $new"
    if ($LASTEXITCODE -ne 0) { throw 'Commit failed.' }

    if ($NoPush) {
        Write-Host 'Committed but not pushed. Push main to trigger the release workflow.' -ForegroundColor Yellow
        return
    }

    git push origin main
    if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }

    Write-Host "Pushed. Watch the run with: gh run watch --repo Philipidev/GitFleet" -ForegroundColor Green
}
finally {
    Pop-Location
}
