# IntegrityWatch Field - generate PNG app icons from the "Shield of Integrity" emblem.
# Windows System.Drawing / GDI+. Idempotent. Compatible with PS 5.1 and PS 7+.
#
# Emblem (see docs/VISUAL-SPEC.md "Emblema y sistema de imagenes"):
#   - hexagonal shield (industrial integrity)
#   - 270-degree gauge arc + needle (monitoring)
#   - horizontal duct line with 2 flanges, steel grey (flow) -- only at tiers >= 192 px
# Flat strokes, no gradients. Palette: blue #0b5cad, white #ffffff, steel #8d99a6,
# dark ground #11161c. Geometry is authored once in a 512x512 design space and scaled.

$ErrorActionPreference = "Stop"

try { Add-Type -AssemblyName System.Drawing } catch { Add-Type -AssemblyName System.Drawing.Common }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutDir = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir "..\assets\icons"))
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# --- palette -----------------------------------------------------------------
$Blue   = [System.Drawing.Color]::FromArgb(0x0b, 0x5c, 0xad)   # #0b5cad
$White  = [System.Drawing.Color]::White                        # #ffffff
$Steel  = [System.Drawing.Color]::FromArgb(0x8d, 0x99, 0xa6)   # #8d99a6
$Dark   = [System.Drawing.Color]::FromArgb(0x11, 0x16, 0x1c)   # #11161c
$RingA  = [System.Drawing.Color]::FromArgb(77, 0x0b, 0x5c, 0xad) # 30 % blue

# --- emblem geometry, 512x512 design space -----------------------------------
$HEX = @(
    @(256.0, 40.0), @(456.0, 156.0), @(456.0, 356.0),
    @(256.0, 472.0), @(56.0, 356.0), @(56.0, 156.0)
)
$GAUGE_CX = 256.0; $GAUGE_CY = 230.0; $GAUGE_R = 110.0
$ARC_START = 135.0; $ARC_SWEEP = 270.0
$NEEDLE_X = 297.0;  $NEEDLE_Y = 158.99
$HUB_R = 22.0
$RING_R = 236.0
$DUCT_Y = 380.0; $DUCT_X1 = 112.0; $DUCT_X2 = 400.0
$FLANGE_X = @(170.0, 342.0); $FLANGE_Y1 = 348.0; $FLANGE_Y2 = 412.0

function New-HexPath {
    $pts = New-Object 'System.Drawing.PointF[]' $HEX.Count
    for ($i = 0; $i -lt $HEX.Count; $i++) {
        $pts[$i] = New-Object System.Drawing.PointF ([float]$HEX[$i][0]), ([float]$HEX[$i][1])
    }
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddPolygon($pts)
    return $path
}

function New-Icon {
    param(
        [int]$Size,
        [string]$FileName,
        [bool]$Opaque,
        [System.Drawing.Color]$Background,
        [double]$Scale,
        [System.Drawing.Color]$Body,
        [System.Drawing.Color]$Gauge,
        [bool]$WithDuct,
        [bool]$WithRing
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($Opaque) {
        $bgBrush = New-Object System.Drawing.SolidBrush($Background)
        $g.FillRectangle($bgBrush, 0, 0, $Size, $Size)
        $bgBrush.Dispose()
    }

    $state = $g.Save()
    $g.TranslateTransform([float]($Size / 2.0), [float]($Size / 2.0))
    $g.ScaleTransform([float]$Scale, [float]$Scale)
    $g.TranslateTransform(-256.0, -256.0)

    # subtle outer ring (drawn first, behind the shield)
    if ($WithRing) {
        $ringPen = New-Object System.Drawing.Pen($RingA, 8.0)
        $g.DrawEllipse($ringPen, [float](256.0 - $RING_R), [float](256.0 - $RING_R), [float](2 * $RING_R), [float](2 * $RING_R))
        $ringPen.Dispose()
    }

    # hexagonal shield body (solid, flat)
    $hexBrush = New-Object System.Drawing.SolidBrush($Body)
    $hexPath = New-HexPath
    $g.FillPath($hexBrush, $hexPath)
    $hexPath.Dispose()
    $hexBrush.Dispose()

    # 270-degree gauge arc (gap at the bottom)
    $arcPen = New-Object System.Drawing.Pen($Gauge, 30.0)
    $arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arcRect = New-Object System.Drawing.RectangleF ([float]($GAUGE_CX - $GAUGE_R)), ([float]($GAUGE_CY - $GAUGE_R)), ([float](2 * $GAUGE_R)), ([float](2 * $GAUGE_R))
    $g.DrawArc($arcPen, $arcRect, [float]$ARC_START, [float]$ARC_SWEEP)
    $arcPen.Dispose()

    # needle
    $needlePen = New-Object System.Drawing.Pen($Gauge, 26.0)
    $needlePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $needlePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($needlePen, [float]$GAUGE_CX, [float]$GAUGE_CY, [float]$NEEDLE_X, [float]$NEEDLE_Y)
    $needlePen.Dispose()

    # hub
    $hubBrush = New-Object System.Drawing.SolidBrush($Gauge)
    $g.FillEllipse($hubBrush, [float]($GAUGE_CX - $HUB_R), [float]($GAUGE_CY - $HUB_R), [float](2 * $HUB_R), [float](2 * $HUB_R))
    $hubBrush.Dispose()

    # duct line with 2 flanges (flow) -- rich tiers only
    if ($WithDuct) {
        $pipePen = New-Object System.Drawing.Pen($Steel, 16.0)
        $pipePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Flat
        $pipePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Flat
        $g.DrawLine($pipePen, [float]$DUCT_X1, [float]$DUCT_Y, [float]$DUCT_X2, [float]$DUCT_Y)
        $pipePen.Dispose()

        $flangePen = New-Object System.Drawing.Pen($Steel, 20.0)
        $flangePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Flat
        $flangePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Flat
        foreach ($fx in $FLANGE_X) {
            $g.DrawLine($flangePen, [float]$fx, [float]$FLANGE_Y1, [float]$fx, [float]$FLANGE_Y2)
        }
        $flangePen.Dispose()
    }

    $g.Restore($state)
    $g.Dispose()

    $outPath = Join-Path $OutDir $FileName
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    $len = (Get-Item -LiteralPath $outPath).Length
    Write-Host ("  {0,-22} {1,3}x{1,-3}px  {2,7} bytes" -f $FileName, $Size, $len)
}

# --- tiers -------------------------------------------------------------------
# design hexagon: width 400, height 432 within the 512 design box.
#   "any"  (transparent): scale = Size/512  -> hexagon 78.1 % wide, 84.4 % tall
#   mask   (opaque dark) : hexagon width 60 % of Size -> scale = 0.60*Size/400
#   apple  (opaque blue) : hexagon width 66 % of Size -> scale = 0.66*Size/400
Write-Host "Shield of Integrity -> $OutDir"
New-Icon -Size 192 -FileName "icon-192.png" -Opaque $false -Background $Dark -Scale (192.0 / 512.0) -Body $Blue -Gauge $White -WithDuct $true  -WithRing $true
New-Icon -Size 512 -FileName "icon-512.png" -Opaque $false -Background $Dark -Scale (512.0 / 512.0) -Body $Blue -Gauge $White -WithDuct $true  -WithRing $true
New-Icon -Size 512 -FileName "maskable-512.png" -Opaque $true -Background $Dark -Scale (0.60 * 512.0 / 400.0) -Body $Blue -Gauge $White -WithDuct $true -WithRing $true
New-Icon -Size 180 -FileName "apple-touch-icon.png" -Opaque $true -Background $Blue -Scale (0.66 * 180.0 / 400.0) -Body $White -Gauge $Blue -WithDuct $false -WithRing $false

Write-Host "Done." -ForegroundColor Green
