@echo off
rem Bật Tiệm Ghép Ảnh ở chế độ phát triển (Vite + Electron). Bấm đúp file này hoặc chạy `dev.bat` trong terminal.
cd /d "%~dp0"
if not exist node_modules (
  echo Chua co node_modules, dang cai dat...
  call npm install || goto :error
)
call npm run dev -- %*
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Chay dev that bai. Xem loi o tren.
pause
exit /b 1
