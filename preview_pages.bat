@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
  py -3 tools\pages_preview.py
  goto done
)
where python >nul 2>&1
if not errorlevel 1 (
  python tools\pages_preview.py
  goto done
)
echo Python 3 was not found.
echo Install Python 3, then run preview_pages.bat again.
:done
echo.
pause
