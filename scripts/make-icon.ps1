# Renders icon.png (128x128), the Marketplace icon: three list rows (the fleet)
# next to a download arrow (the bulk fetch). Regenerate with:
#
#   powershell -ExecutionPolicy Bypass -File scripts\make-icon.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'icon.png'
$size = 128

$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# background
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 31, 111, 235))
$shape = New-RoundedRect 0 0 $size $size 26
$g.FillPath($bg, $shape)
$shape.Dispose()

$fg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

# three list rows on the left
$rows = @(@(30, 56), @(58, 42), @(86, 50))
foreach ($r in $rows) {
    $bar = New-RoundedRect 16 $r[0] $r[1] 14 7
    $g.FillPath($fg, $bar)
    $bar.Dispose()
}

# download arrow on the right
$shaft = New-RoundedRect 87 26 14 48 5
$g.FillPath($fg, $shaft)
$shaft.Dispose()
$head = New-Object System.Drawing.Drawing2D.GraphicsPath
$head.AddPolygon(@(
        (New-Object System.Drawing.PointF(76, 68)),
        (New-Object System.Drawing.PointF(112, 68)),
        (New-Object System.Drawing.PointF(94, 102))
    ))
$g.FillPath($fg, $head)
$head.Dispose()

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $bg.Dispose(); $fg.Dispose()
Write-Host "wrote $out"
