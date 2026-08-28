# Packages Git Fleet into a .vsix and installs it into the Default profile and
# every user profile that does not already share the Default profile's extensions.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-local.ps1
#
# Requires: the `code` CLI on PATH and network access for `npx @vscode/vsce`.

param(
    [switch]$SkipPackage,
    [string]$Vsix
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
    if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
        throw "The 'code' CLI was not found on PATH. In VS Code run: Shell Command: Install 'code' command in PATH."
    }

    $manifest = Get-Content package.json -Raw | ConvertFrom-Json
    $version = $manifest.version
    $vsixPath = if ($Vsix) { $Vsix } else { Join-Path $root "git-fleet-$version.vsix" }

    if (-not $SkipPackage) {
        Write-Host "Packaging git-fleet $version ..." -ForegroundColor Cyan
        npx --yes @vscode/vsce package --no-dependencies --out $vsixPath
        if ($LASTEXITCODE -ne 0) { throw "vsce package failed with exit code $LASTEXITCODE." }
    }

    if (-not (Test-Path $vsixPath)) { throw "VSIX not found: $vsixPath" }

    # Default profile
    $targets = @([pscustomobject]@{ Name = '<default>'; Arg = @() })

    # Extra profiles. A profile with useDefaultFlags.extensions = true shares the
    # Default profile's extensions, so installing again would be a no-op.
    $storage = Join-Path $env:APPDATA 'Code\User\globalStorage\storage.json'
    if (Test-Path $storage) {
        $profiles = (Get-Content $storage -Raw | ConvertFrom-Json).userDataProfiles
        foreach ($p in $profiles) {
            if ($p.useDefaultFlags -and $p.useDefaultFlags.extensions -eq $true) {
                Write-Host "Skipping profile '$($p.name)' - it shares the Default profile's extensions." -ForegroundColor DarkGray
                continue
            }
            $targets += [pscustomobject]@{ Name = $p.name; Arg = @('--profile', $p.name) }
        }
    }

    foreach ($t in $targets) {
        Write-Host "Installing into profile $($t.Name) ..." -ForegroundColor Cyan
        & code --install-extension $vsixPath --force @($t.Arg)
        if ($LASTEXITCODE -ne 0) { Write-Warning "Install into $($t.Name) returned exit code $LASTEXITCODE." }
    }

    Write-Host "`nDone. Reload the window (Developer: Reload Window) to pick up the new build." -ForegroundColor Green
}
finally {
    Pop-Location
}
