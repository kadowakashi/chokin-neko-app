@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto use_python
py -3 tools\cat_asset_manager.py add
goto finished
:use_python
where python >nul 2>nul
if errorlevel 1 goto no_python
python tools\cat_asset_manager.py add
goto finished
:no_python
echo Python 3 was not found.
echo Install Python 3, then run add_cat.bat again.
set result=1
goto pause_and_exit
:finished
set result=%errorlevel%
:pause_and_exit
echo.
pause
exit /b %result%
