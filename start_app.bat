@echo off
setlocal

cd /d "%~dp0"

set "PORT=8000"
set "URL=http://localhost:%PORT%"

where py >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    py -m http.server %PORT%
    pause
    exit /b
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    python -m http.server %PORT%
    pause
    exit /b
)

echo Python was not found.
echo Please install Python or start the server manually.
pause