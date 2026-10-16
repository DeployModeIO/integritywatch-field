# IntegrityWatch Field - generate PNG app icons from a vector mark.
# Uses System.Drawing (Windows). Idempotent. Compatible with PS 5.1 and PS 7+.

$ErrorActionPreference = "Stop"

try {
    Add-Type -AssemblyName System.Drawing
} catch {
    Add-Type -AssemblyName System.Drawing.Common
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutDir = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir "..\assets\icons"))
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$Brand = [System.Drawing.Color]::FromArgb(11, 92, 173)   # #0b5cad
$White = [System.Drawing.Color]::White

function New-TeardropPath {
    param([float]$tipX, [float]$tipY, [float]$bulbR)
    $bulbCy = $tipY + $bulbR
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddBezier(
        $tipX, $tipY,
        ($tipX + $bulbR * 0.7), ($tipY + $bulbR * 0.4),
        ($tipX + $bulbR), ($tipY + $bulbR * 0.85),
        ($tipX + $bulbR), $bulbCy)
    $rect = New-Object System.Drawing.RectangleF (($tipX - $bulbR)), ($bulbCy - $bulbR), (2 * $bulbR), (2 * $bulbR)
    $path.AddArc($rect, 0, 180)
    $path.AddBezier(
        ($tipX - $bulbR), $bulbCy,
        ($tipX - $bulbR), ($tipY + $bulbR * 0.85),
        ($tipX - $bulbR * 0.7), ($tipY + $bulbR * 0.4),
        $tipX, $tipY)
    $path.CloseFigure()
    return $path
}

function New-RoundedRectPath {
    param([float]$x, [float]$y, [float]$w, [float]$h, [float]$radius)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $radius
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-GaugeMark {
    param($g, [float]$cx, [float]$cy, [float]$arcR, $color)

    $strokeWidth = [Math]::Max(1.0, $arcR * 0.16)
    $tickWidth = [Math]::Max(1.0, $arcR * 0.09)

    $pen = New-Object System.Drawing.Pen($color, $strokeWidth)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $rect = New-Object System.Drawing.RectangleF (($cx - $arcR)), ($cy - $arcR), (2 * $arcR), (2 * $arcR)
    $g.DrawArc($pen, $rect, 180, 180)

    $nrad = 55 * [Math]::PI / 180.0
    $nx = $cx + ($arcR * 0.66) * [Math]::Cos($nrad)
    $ny = $cy - ($arcR * 0.66) * [Math]::Sin($nrad)
    $g.DrawLine($pen, $cx, $cy, $nx, $ny)
    $pen.Dispose()

    $tpen = New-Object System.Drawing.Pen($color, $tickWidth)
    $tpen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $tpen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    foreach ($a in @(150, 120, 90, 60, 30)) {
        $rad = $a * [Math]::PI / 180.0
        $x1 = $cx + ($arcR * 0.76) * [Math]::Cos($rad)
        $y1 = $cy - ($arcR * 0.76) * [Math]::Sin($rad)
        $x2 = $cx + ($arcR * 0.94) * [Math]::Cos($rad)
        $y2 = $cy - ($arcR * 0.94) * [Math]::Sin($rad)
        $g.DrawLine($tpen, $x1, $y1, $x2, $y2)
    }
    $tpen.Dispose()

    $brush = New-Object System.Drawing.SolidBrush($color)

    $hr = $arcR * 0.12
    $g.FillEllipse($brush, ($cx - $hr), ($cy - $hr), (2 * $hr), (2 * $hr))

    $drop = New-TeardropPath $cx ($cy + $arcR * 0.10) ($arcR * 0.24)
    $g.FillPath($brush, $drop)
    $drop.Dispose()
    $brush.Dispose()
}

function New-Icon {
    param(
        [int]$Size,
        [string]$FileName,
        [bool]$SquareBackground,
        [float]$ContentScale
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $bgBrush = New-Object System.Drawing.SolidBrush($Brand)
    if ($SquareBackground) {
        $g.FillRectangle($bgBrush, 0, 0, $Size, $Size)
    } else {
        $radius = [float]($Size * 0.22)
        $bgPath = New-RoundedRectPath 0 0 $Size $Size $radius
        $g.FillPath($bgBrush, $bgPath)
        $bgPath.Dispose()
    }
    $bgBrush.Dispose()

    $arcR = [float](($Size / 2.0) * $ContentScale)
    $cx = [float]($Size / 2.0)
    $cy = [float]($Size / 2.0)
    Draw-GaugeMark $g $cx $cy $arcR $White

    $g.Dispose()
    $outPath = Join-Path $OutDir $FileName
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

New-Icon 192 "icon-192.png" $false 0.78
New-Icon 512 "icon-512.png" $false 0.78
New-Icon 512 "maskable-512.png" $true 0.60
New-Icon 180 "apple-touch-icon.png" $true 0.78

Write-Host "Icons written to $OutDir" -ForegroundColor Green
