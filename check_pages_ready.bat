@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
  py -3 tools\check_pages_ready.py
  goto done
)
where python >nul 2>&1
if not errorlevel 1 (
  python tools\check_pages_ready.py
  goto done
)
echo Python 3 was not found.
echo Install Python 3, then run check_pages_ready.bat again.
:done
echo.
pause
