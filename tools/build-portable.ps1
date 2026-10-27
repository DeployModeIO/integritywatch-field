#!/usr/bin/env pwsh
# build-portable.ps1 â€” Build IntegrityWatch Field Portable package
# PowerShell 5.1 compatible, ASCII file

$portableDir = "C:\Users\Deploy\Desktop\IntegrityWatch-Field-Portable"
$zipPath = "C:\Users\Deploy\Desktop\IntegrityWatch-Field-Portable.zip"
$srcRoot = "D:\ArquitectoSupremo\integritywatch-field"

# Make sure target dir exists and is clean
if (Test-Path -Path $portableDir) {
    Remove-Item -Path $portableDir -Recurse -Force
}
New-Item -ItemType Directory -Path $portableDir | Out-Null

# --- Copy item safely ---
function Copy-Safe {
    param([string]$src, [string]$dst)
    if (Test-Path -Path $src) {
        $dstDir = Split-Path $dst
        if (-not (Test-Path -Path $dstDir)) {
            New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
        }
        Copy-Item -Path $src -Destination $dst -Force
    }
}

# --- Copy folder recursively with exclusions ---
# Patterns: .git, node_modules, tests, tools\tests, backups, electron\node_modules, electron\dist, *.log
function Copy-Recursive {
    param([string]$src, [string]$dst, [string[]]$excludes)
    $items = Get-ChildItem -Path $src -Recurse -Force
    foreach ($item in $items) {
        $skip = $false
        foreach ($pat in $excludes) {
            if ($item.FullName -like "*$pat*" -or $item.Name -like "$pat") {
                $skip = $true
                break
            }
        }
        if ($skip) { continue }

        $rel = $item.FullName.Substring($src.Length).TrimStart('\')
        $dest = Join-Path $dst $rel

        if ($item.PSIsContainer) {
            # Special: electron\dist â€” include ONLY the EXE, skip everything else
            if ($src -match "electron\\dist$" -and $item.Name -ne "IntegrityWatch Field 1.0.0.exe") {
                continue
            }
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
            Copy-Recursive -src $item.FullName -dst $dst -excludes $excludes
        } else {
            Copy-Safe -src $item.FullName -dst $dest
        }
    }
}

# 1. Copy app files to portable root
Copy-Item -Path (Join-Path $srcRoot "index.html") -Destination (Join-Path $portableDir "index.html") -Force
Copy-Item -Path (Join-Path $srcRoot "sw.js") -Destination (Join-Path $portableDir "sw.js") -Force
Copy-Item -Path (Join-Path $srcRoot "manifest.webmanifest") -Destination (Join-Path $portableDir "manifest.webmanifest") -Force

# 2. Copy src/** and assets/** recursively
Copy-Recursive -src (Join-Path $srcRoot "src") -dst (Join-Path $portableDir "src") -excludes ".git"
Copy-Recursive -src (Join-Path $srcRoot "assets") -dst (Join-Path $portableDir "assets") -excludes ".git"

# 3. Desktop: app\IntegrityWatch Field 1.0.0.exe from electron\dist
$exeSrc = (Join-Path $srcRoot "electron\dist\IntegrityWatch Field 1.0.0.exe")
if (-not (Test-Path -Path $exeSrc)) {
    Write-Error "EXE not found: $exeSrc - aborting build"
    exit 1
}
$exeDstDir = (Join-Path $portableDir "app")
New-Item -ItemType Directory -Path $exeDstDir -Force | Out-Null
Copy-Item -Path $exeSrc -Destination (Join-Path $exeDstDir "IntegrityWatch Field 1.0.0.exe") -Force

# 4. Launchers
# START-HERE.bat â€” copy from root
Copy-Item -Path (Join-Path $srcRoot "START-HERE.bat") -Destination (Join-Path $portableDir "START-HERE.bat") -Force

# START-HERE.command (macOS) - #!/bin/bash + cd "$(dirname "$0")" && python3 -m http.server 8419
$commandFile = (Join-Path $portableDir "START-HERE.command")
@(
    "#!/bin/bash",
    "",
    'cd "$(dirname "$0")" && python3 -m http.server 8419'
) | Out-File -FilePath $commandFile -Encoding ASCII

# start.sh (Linux, same content)
$startFile = (Join-Path $portableDir "start.sh")
@(
    "#!/bin/bash",
    'cd "$(dirname "$0")" && python3 -m http.server 8419'
) | Out-File -FilePath $startFile -Encoding ASCII

# 5. Servidor: tools\serve.ps1, tools\serve.py
$toolsDst = Join-Path $portableDir "tools"
if (-not (Test-Path $toolsDst)) { New-Item -ItemType Directory -Path $toolsDst -Force | Out-Null }
Copy-Item -Path (Join-Path $srcRoot "tools\serve.ps1") -Destination (Join-Path $toolsDst "serve.ps1") -Force
Copy-Item -Path (Join-Path $srcRoot "tools\serve.py") -Destination (Join-Path $toolsDst "serve.py") -Force

# 6. Documentacion
$docsFiles = @("GUIA-DE-USO.md","PLAN-DE-PRUEBAS.md","STANDARDS.md","SCHEMA.md","CONTRACTS.md","TESTS.md","VISUAL-SPEC.md")
$docsRootDst = Join-Path $portableDir "docs"
if (-not (Test-Path $docsRootDst)) { New-Item -ItemType Directory -Path $docsRootDst -Force | Out-Null }
foreach ($f in $docsFiles) {
    $src = Join-Path (Join-Path $srcRoot "docs") $f
    if (Test-Path $src) {
        Copy-Item $src -Destination (Join-Path $docsRootDst $f) -Force
    }
}

# docs\presentacion\** (if exists) - include ALL files
$presentacionDir = (Join-Path $srcRoot "docs\presentacion")
if (Test-Path -Path $presentacionDir) {
    Copy-Recursive -src $presentacionDir -dst (Join-Path $portableDir "docs\presentacion") -excludes ".git"
}

# docs\manual\** (if exists)
$manualDir = (Join-Path $srcRoot "docs\manual")
if (Test-Path -Path $manualDir) {
    Copy-Recursive -src $manualDir -dst (Join-Path $portableDir "docs\manual") -excludes ".git"
}

# docs\evidence\** (if exists) - include PDFs, track size for 15 MB limit
$evidenceDir = (Join-Path $srcRoot "docs\evidence")
if (Test-Path -Path $evidenceDir) {
    Copy-Recursive -src $evidenceDir -dst (Join-Path $portableDir "docs\evidence") -excludes ".git"
}

# 7. Kit de datos: datos-prueba\**
$datosDir = (Join-Path $srcRoot "datos-prueba")
if (Test-Path -Path $datosDir) {
    Copy-Recursive -src $datosDir -dst (Join-Path $portableDir "datos-prueba") -excludes ".git"
}

# 8. RaÃ­z: README.md, THIRD-PARTY-NOTICES.md, PORTABLE-README.md
if (Test-Path -Path (Join-Path $srcRoot "README.md")) {
    Copy-Item -Path (Join-Path $srcRoot "README.md") -Destination (Join-Path $portableDir "README.md") -Force
}

if (Test-Path -Path (Join-Path $srcRoot "THIRD-PARTY-NOTICES.md")) {
    Copy-Item -Path (Join-Path $srcRoot "THIRD-PARTY-NOTICES.md") -Destination (Join-Path $portableDir "THIRD-PARTY-NOTICES.md") -Force
}

# PORTABLE-README.md â€” we write it
$portableReadme = @"
# IntegrityWatch Field Portable Package

## QuÃ© incluye
- AplicaciÃ³n completa (index.html, service worker, manifest)
- `IntegrityWatch Field 1.0.0.exe` (contenedor Electron, ~71 MB)
- Toda la documentaciÃ³n: `docs/GUIA-DE-USO.md`, `docs/PLAN-DE-PRUEBAS.md`, `docs/STANDARDS.md`, `docs/SCHEMA.md`, `docs/CONTRACTS.md`, `docs/TESTS.md`, `docs/VISUAL-SPEC.md`
- `datos-prueba/` (CSV de validaciÃ³n + precarga JSON + validadores)
- `THIRD-PARTY-NOTICES.md`
- `SHA256SUMS.txt` con hashes SHA-256 para verificaciÃ³n de integridad

## CÃ³mo arrancar
### Windows
Doble clic en `START-HERE.bat`. Esto inicia un servidor HTTP en el puerto 8419 y abre el navegador.
Si el puerto estÃ¡ ocupado, ejecuta: `tools\serve.ps1 -Port 9000` (o cierra el otro proceso).

### macOS
Doble clic en `START-HERE.command`. Abre el navegador en `http://localhost:8419`.

### Linux
Doble clic en `start.sh`. Abre el navegador en `http://localhost:8419`.

### PWA (Progressive Web App)
1. Arranca el servidor con `START-HERE.bat` (Windows) o `START-HERE.command`/`start.sh` (macOS/Linux)
2. Abre la app en el navegador (`http://localhost:8419`)
3. Haz clic en el icono "Instalar" en la barra de direcciones (o menÃº â‹® â†’ "Instalar aplicaciÃ³n")
4. Una vez instalada, funciona completamente offline desde su propio icono.

## CÃ³mo verificar con SHA256SUMS.txt
DespuÃ©s de extraer el ZIP, verifica cada archivo:
```
certutil -hashfile <archivo> SHA256
```
Comparar el hash (minÃºsculas) con la lÃ­nea correspondiente en `SHA256SUMS.txt`.
El archivo `SHA256SUMS.txt` contiene hashes de TODO el paquete excepto Ã©l mismo.

## QuÃ© NO incluye
- `.git`, `node_modules`, `tests/`, `tools/tests/`, `backups/`
- `electron\node_modules`, `electron\dist` (el EXE sÃ­ estÃ¡ incluido)
- Archivos `.log`
- PDFs en `docs/evidence/` si el tamaÃ±o total supera los 15 MB (en ese caso se omite y se anota aquÃ­)

## Nota de descargo
IntegrityWatch Field es una **herramienta de apoyo** y no sustituye el criterio de un ingeniero cualificado. Sus resultados de cÃ¡lculo son orientativos y deben ser verificados contra normas vigentes y datos del fabricante antes de decisiones de diseÃ±o u operaciÃ³n.
"@

$prFile = (Join-Path $portableDir "PORTABLE-README.md")
[System.IO.File]::WriteAllText($prFile, $portableReadme)

# 9. SHA256SUMS.txt â€” hash de TODO el archivo del paquete excepto SHA256SUMS.txt mismo
Write-Host "Generando SHA256SUMS.txt ..."

# Get all files in the portable directory recursively
$allFiles = Get-ChildItem -Path $portableDir -Recurse -File -Force

# Track PDF sizes for the 15 MB total limit
$totalPdfSize = 0
foreach ($file in $allFiles) {
    if ($file.Name -eq "SHA256SUMS.txt") { continue }
    if ($file.Extension -eq ".pdf") {
        try { $totalPdfSize += $file.Length } catch { }
    }
}

$maxPdfTotal = 15MB
$excludePdfs = ($totalPdfSize -gt $maxPdfTotal)

# Build the hash lines, optionally excluding PDFs
$sumsLines = @()
foreach ($file in $allFiles) {
    if ($file.Name -eq "SHA256SUMS.txt") { continue }
    if ($excludePdfs -and $file.Extension -eq ".pdf") { continue }

    $hashHex = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLower()
    $relPath = $file.FullName.Substring($portableDir.Length).TrimStart('\')
    $sumsLines += "$hashHex  $relPath"
}

# If PDFs were excluded, annotate PORTABLE-README
if ($excludePdfs) {
    $readmePath = (Join-Path $portableDir "PORTABLE-README.md")
    $original = [System.IO.File]::ReadAllText($readmePath)
    $annotated = $original + "`n---`nNota: Los PDFs en docs/evidence/ superaban los 15 MB por lo que se excluyeron de SHA256SUMS.txt pero siguen incluidos en el paquete."
    [System.IO.File]::WriteAllText($readmePath, $annotated)
}

# Write SHA256SUMS.txt to portable root
$sumsPath = (Join-Path $portableDir "SHA256SUMS.txt")
[System.IO.File]::WriteAllLines($sumsPath, $sumsLines)

# 10. Create ZIP with Compress-Archive -CompressionLevel Optimal
Write-Host "Creando ZIP: $zipPath ..."

# Compute folder size and file count before zipping
$fileCount = (Get-ChildItem -Path $portableDir -Recurse -File).Count
$folderSize = (Get-ChildItem -Path $portableDir -Recurse -File | Measure-Object -Property Length -Sum).Sum

# Build archive item list: top-level entries only (Compress-Archive recurses
# into directories itself; listing nested items too would duplicate them)
$archiveItems = @(Get-ChildItem -Path $portableDir -Force | ForEach-Object { $_.FullName })

if (Test-Path -Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

Compress-Archive -Path $archiveItems -DestinationPath $zipPath -CompressionLevel Optimal -Force

# Get ZIP size
$zipItem = Get-Item -Path $zipPath
$zipSize = $zipItem.Length

# Compute SHA-256 of the ZIP
$zipHashHex = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLower()

# Print summary
Write-Host ""
Write-Host "=== BUILD COMPLETE ==="
Write-Host "NÃºmero de archivos: $fileCount"
Write-Host "TamaÃ±o carpeta: $([math]::Round($folderSize/1MB,2)) MB"
Write-Host "TamaÃ±o ZIP: $([math]::Round($zipSize/1MB,2)) MB"
Write-Host "Hash SHA-256 del ZIP: $zipHashHex"
Write-Host ""

# Exit success
exit 0
