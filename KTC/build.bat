@echo off
setlocal

echo ============================================================
echo  KTC Connector -- Build Script
echo ============================================================
echo.

echo [1/3] Installing Python dependencies...
pip install pystray Pillow pyinstaller
if errorlevel 1 (
    echo ERROR: pip install failed. Make sure Python is in PATH.
    pause & exit /b 1
)

echo.
echo [2/3] Building KTC-Connector.exe with PyInstaller...
python -m PyInstaller ^
    --onefile ^
    --windowed ^
    --name "KTC-Connector" ^
    --hidden-import pystray._win32 ^
    connector_app.py

if errorlevel 1 (
    echo ERROR: PyInstaller failed. See output above.
    pause & exit /b 1
)

echo.
echo [3/3] Done!
echo.
echo   Output: dist\KTC-Connector.exe
echo.
echo   Give dist\KTC-Connector.exe to the hotel IT person.
echo   They double-click it once -- it appears in the system tray
echo   (bottom-right near the clock) and auto-starts on every boot.
echo.
pause
