@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 -Open
if errorlevel 1 (
    py -3 tools\serve.py --open
)
echo.
echo IntegrityWatch Field - the dev server was started in this window.
echo Press Ctrl+C here to stop it when you are done.
echo.
echo El servidor de IntegrityWatch Field se inicio en esta ventana.
echo Pulsa Ctrl+C aqui para detenerlo cuando termines.
echo.
pause
