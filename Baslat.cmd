@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title DMR Nexus

REM ============================================================================
REM  DMR Nexus - Gunluk baslatma (masaustundeki "DMR Nexus" kisayolu bunu calistirir)
REM
REM  Uygulama zaten calisiyorsa yalnizca tarayiciyi acar. Calismiyorsa sunucuyu
REM  arka planda (gizli) baslatir, saglik kontrolu yapar ve tarayiciyi acar.
REM  Gunlukler: logs\app.log ve logs\app-error.log
REM ============================================================================

if not exist "dist\server.cjs" goto :not_installed
if not exist "node_modules" goto :not_installed
if not exist ".env" goto :not_installed

set "PORT=3000"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "PORT=" .env`) do set "PORT=%%B"
if "%PORT%"=="" set "PORT=3000"

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'status') { exit 0 } } catch {}; exit 1"
if not errorlevel 1 goto :open

if not exist "logs" mkdir "logs"
powershell -NoProfile -Command "try { Start-Process -FilePath 'node' -ArgumentList 'scripts\start.mjs' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput 'logs\app.log' -RedirectStandardError 'logs\app-error.log' -ErrorAction Stop; exit 0 } catch { exit 1 }"
if errorlevel 1 goto :failed

powershell -NoProfile -Command "$u = 'http://127.0.0.1:%PORT%/api/health'; 1..120 | ForEach-Object { try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'status') { exit 0 } } catch {}; Start-Sleep -Milliseconds 800 }; exit 1"
if errorlevel 1 goto :failed

:open
start "" "http://127.0.0.1:%PORT%"
exit /b 0

:not_installed
echo Kurulum bulunamadi (dist, node_modules veya .env eksik).
echo Lutfen once Kur.cmd dosyasini calistirin.
echo.
pause
exit /b 1

:failed
echo Uygulama baslatilamadi. Ayrinti icin logs\app-error.log dosyasina bakin.
echo MySQL servisinin calistigini ve port %PORT% uzerinde baska bir program
echo olmadigini kontrol edin.
echo.
pause
exit /b 1
