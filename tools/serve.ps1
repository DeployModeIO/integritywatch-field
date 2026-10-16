# IntegrityWatch Field - static dev server (HttpListener)
# Compatible with Windows PowerShell 5.1 and PowerShell 7+.

param(
    [int]$Port = 8419,
    [switch]$Open,
    [string]$Root = ".."
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootPath = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir $Root))

$MimeTypes = @{
    ".html"        = "text/html; charset=utf-8"
    ".css"         = "text/css; charset=utf-8"
    ".js"          = "text/javascript; charset=utf-8"
    ".mjs"         = "text/javascript; charset=utf-8"
    ".json"        = "application/json; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
    ".svg"         = "image/svg+xml"
    ".png"         = "image/png"
    ".ico"         = "image/x-icon"
    ".xml"         = "application/xml; charset=utf-8"
    ".tsv"         = "text/tab-separated-values; charset=utf-8"
    ".csv"         = "text/csv; charset=utf-8"
}

$Url = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Url)

try {
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
} catch {
    Write-Host "Note: could not add http://127.0.0.1:$Port/ ($($_.Exception.Message)); serving on localhost only." -ForegroundColor Yellow
}

try {
    $listener.Start()
} catch {
    Write-Host "Could not start server on port $Port : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Try another port: powershell -File tools\serve.ps1 -Port 8500" -ForegroundColor Yellow
    exit 1
}

Write-Host "" -ForegroundColor Cyan
  Write-Host "  IntegrityWatch Field - dev server" -ForegroundColor Cyan
Write-Host "  URL:   $Url" -ForegroundColor Green
Write-Host "  Root:  $RootPath" -ForegroundColor Gray
Write-Host "  Stop:  Ctrl+C" -ForegroundColor Yellow
Write-Host ""

if ($Open) {
    Start-Process $Url
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }

    $request = $context.Request
    $response = $context.Response

    try {
        $rawPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        if ($rawPath -eq "/" -or $rawPath -eq "") {
            $rawPath = "/index.html"
        }

        $relativePath = $rawPath.TrimStart("/") -replace "/", "\"
        $fullPath = [System.IO.Path]::GetFullPath((Join-Path $RootPath $relativePath))

        $withinRoot = $fullPath.StartsWith($RootPath, [System.StringComparison]::OrdinalIgnoreCase)

        if (-not $withinRoot -or -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.StatusCode = 404
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $body.Length
            $response.OutputStream.Write($body, 0, $body.Length)
            continue
        }

        $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
        $contentType = "application/octet-stream"
        if ($MimeTypes.ContainsKey($ext)) {
            $contentType = $MimeTypes[$ext]
        }

        $response.StatusCode = 200
        $response.ContentType = $contentType
        $response.Headers.Add("Cache-Control", "no-cache")

        if ($request.HttpMethod -eq "HEAD") {
            $response.ContentLength64 = (Get-Item -LiteralPath $fullPath).Length
        } else {
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
    } finally {
        $response.Close()
    }
}
