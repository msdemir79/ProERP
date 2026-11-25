@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title DMR Nexus - Kurulum

REM ============================================================================
REM  DMR Nexus - Windows tek tik kurulum
REM
REM  KULLANIM: Bu dosyaya cift tiklayin (yonetici yetkisi GEREKMEZ).
REM
REM  Yaptigi isler:
REM    1) Node.js 20+ ve npm kontrolu (eksikse winget ile kurmayi teklif eder)
REM    2) MySQL 8 baglanti kontrolu (127.0.0.1:3306 veya .env degerleri)
REM    3) npm install
REM    4) .env olusturma (rastgele DB sifresi) + npm run db:setup (root sifresi sorar)
REM    5) npm run build, ilk baslatma, tarayici ve masaustu kisayolu
REM
REM  Veritabanina ve .env dosyasina yalnizca ilk kurulumda mudahale eder.
REM ============================================================================

set "PROJECT=%~dp0"
if "%PROJECT:~-1%"=="\" set "PROJECT=%PROJECT:~0,-1%"

echo.
echo ============================================================
echo   DMR Nexus - Tek Tik Kurulum (Windows)
echo ============================================================
echo.
echo  Bu betik sunlari yapar:
echo    1) Node.js 20+ kontrolu
echo    2) MySQL 8 baglanti kontrolu
echo    3) Bagimliliklarin kurulmasi (npm install)
echo    4) Veritabani ve tablolarin olusturulmasi (root sifresi sorulur)
echo    5) Derleme, ilk baslatma ve masaustu kisayolu
echo.
echo  Ilk kurulum birkac dakika surebilir, lutfen pencereyi kapatmayin.
echo.

REM ------------------------------------------------------------- 1) Node.js
echo --- 1/5  Node.js kontrol ediliyor ---
where node >nul 2>&1
if errorlevel 1 goto :no_node
where npm >nul 2>&1
if errorlevel 1 goto :no_node

set "NODE_MAJOR="
for /f "tokens=1 delims=v." %%A in ('node --version 2^>nul') do set "NODE_MAJOR=%%A"
if not defined NODE_MAJOR goto :no_node
if %NODE_MAJOR% LSS 20 goto :old_node
echo [OK] Node.js surumu:
node --version
echo.

REM --------------------------------------------------------------- 2) MySQL
echo --- 2/5  MySQL baglantisi kontrol ediliyor ---
set "DBH=127.0.0.1"
set "DBP=3306"
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "DB_HOST=" .env`) do set "DBH=%%B"
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "DB_PORT=" .env`) do set "DBP=%%B"
)
if "%DBH%"=="" set "DBH=127.0.0.1"
if "%DBP%"=="" set "DBP=3306"

powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $r = $c.BeginConnect('%DBH%', %DBP%, $null, $null); if (-not $r.AsyncWaitHandle.WaitOne(3000)) { exit 1 }; $c.EndConnect($r); $c.Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 goto :no_mysql
echo [OK] MySQL baglantisi kuruldu: %DBH%:%DBP%
echo.

REM -------------------------------------------------- zaten calisiyor mu?
set "PORT=3000"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "PORT=" .env`) do set "PORT=%%B"
if "%PORT%"=="" set "PORT=3000"
if exist ".env" powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'status') { exit 0 } } catch {}; exit 1"
if exist ".env" if not errorlevel 1 goto :already_running

REM ---------------------------------------------------------- 3) Bagimliliklar
echo --- 3/5  Bagimliliklar kuruluyor (npm install) ---
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail_npm
echo [OK] Bagimliliklar kuruldu.
echo.

REM ------------------------------------------------------- 4) .env + veritabani
echo --- 4/5  Veritabani kurulumu ---
call :ensure_env
if errorlevel 1 goto :fail_env
echo   .env hazir. MySQL root sifresi birazdan sorulacak.
echo   NOT: Sifre ekranda gorunmez; yazip Enter tusuna basin.
echo.
call npm run db:setup
if errorlevel 1 goto :fail_db
echo.

REM ------------------------------------------------------ 5) Derleme + baslatma
echo --- 5/5  Derleme yapiliyor ---
call npm run build
if errorlevel 1 goto :fail_build
echo [OK] Derleme tamamlandi.

call :create_shortcut

set "PORT=3000"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "PORT=" .env`) do set "PORT=%%B"
if "%PORT%"=="" set "PORT=3000"

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'status') { exit 0 } } catch {}; exit 1"
if not errorlevel 1 goto :open_app

echo.
echo [BILGI] Sunucu baslatiliyor. Ilk acilista kullanici parolalari
echo         acilan sunucu penceresinde BIR KEZ yazilir; kaydetmeyi unutmayin.
start "DMR Nexus - Bu pencereyi kapatmayin" cmd /k "chcp 65001 >nul & npm start"

powershell -NoProfile -Command "$u = 'http://127.0.0.1:%PORT%/api/health'; 1..120 | ForEach-Object { try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'status') { exit 0 } } catch {}; Start-Sleep -Milliseconds 800 }; exit 1"
if errorlevel 1 goto :fail_start

:open_app
start "" "http://127.0.0.1:%PORT%"
echo.
echo ============================================================
echo   KURULUM TAMAMLANDI
echo ============================================================
echo.
echo   Uygulama : http://127.0.0.1:%PORT%
echo   Kisayol  : Masaustu  ^>  DMR Nexus  (sonraki acilislar icin)
echo   Parolalar: Sunucu penceresinde yaziyor; guvenli bir yere kaydedin.
echo.
pause
exit /b 0

REM --------------------------------------------------------------- hata yollari
:already_running
echo.
echo [BILGI] Uygulama zaten calisiyor: http://127.0.0.1:%PORT%
echo        Guncelleme veya yeniden kurulum icin once uygulamayi durdurun
echo        (Gorev Yoneticisi  ^>  node), sonra Kur.cmd dosyasini tekrar calistirin.
echo.
start "" "http://127.0.0.1:%PORT%"
pause
exit /b 0

:no_node
echo [HATA] Node.js veya npm bulunamadi (PATH icinde yok).
echo.
where winget >nul 2>&1
if errorlevel 1 goto :no_node_manual
echo   Node.js LTS, winget ile simdi kurulabilir.
choice /c EH /n /m "  Node.js LTS kurulsun mu? [E=evet, H=hayir] "
if errorlevel 2 goto :no_node_manual
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto :no_node_manual
echo.
echo [OK] Node.js kuruldu. Kurulumun aktif olmasi icin bu pencereyi KAPATIP
echo      Kur.cmd dosyasini yeniden calistirin.
echo.
pause
exit /b 1

:no_node_manual
echo.
echo   Node.js 20 veya uzerini kurun: https://nodejs.org/tr/download
echo   Kurulumdan sonra bu dosyayi yeniden calistirin.
echo.
pause
exit /b 1

:old_node
echo [HATA] Node.js surumu cok eski (20 veya uzeri gerekli).
node --version
echo        Guncel surum: https://nodejs.org/tr/download
echo.
pause
exit /b 1

:no_mysql
echo [HATA] MySQL sunucusuna baglanilamadi (%DBH%:%DBP%).
echo.
echo   Gereksinim: MySQL 8.0+ kurulu ve calisiyor olmali.
echo     1) Indirme: https://dev.mysql.com/downloads/mysql/
echo     2) Kurulumda "MySQL Server 8.0" bilesenini secin, root sifresi belirleyin.
echo     3) Windows Hizmetleri'nde "MySQL80" hizmetinin calistigini kontrol edin.
echo        Yonetici komut isteminde baslatmak icin: net start MySQL80
echo     4) Bu dosyayi yeniden calistirin.
echo.
pause
exit /b 1

:fail_npm
echo.
echo [HATA] npm install basarisiz oldu.
echo        Internet baglantisini ve yukaridaki hata mesajini kontrol edin.
echo.
pause
exit /b 1

:fail_env
echo [HATA] .env dosyasi olusturulamadi.
echo        Proje klasorunun yazma iznine sahip oldugunu kontrol edin.
echo.
pause
exit /b 1

:fail_db
echo.
echo [HATA] Veritabani kurulumu basarisiz oldu.
echo        Root sifresini ve MySQL servisinin calistigini kontrol edin.
echo        Alternatif: npm run db:setup -- --root-password=SIFRE
echo.
pause
exit /b 1

:fail_build
echo.
echo [HATA] Derleme (npm run build) basarisiz oldu.
echo        Yukaridaki hata mesajini inceleyip bu dosyayi yeniden calistirin.
echo.
pause
exit /b 1

:fail_start
echo.
echo [HATA] Sunucu saglik kontrolunden gecemedi.
echo        Acilan "DMR Nexus" penceresindeki hata mesajini inceleyin.
echo        Sorun giderildikten sonra Baslat.cmd ile tekrar deneyin.
echo.
pause
exit /b 1

REM --------------------------------------------------------------- alt rutinler
:ensure_env
if exist ".env" exit /b 0
copy /y ".env.example" ".env" >nul
if errorlevel 1 exit /b 1
powershell -NoProfile -Command "$p = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }); $c = Get-Content '.env' -Encoding UTF8 -Raw; $c = $c -replace '(?m)^DB_PASSWORD=.*$', ('DB_PASSWORD=' + $p); [IO.File]::WriteAllText((Join-Path $PWD '.env'), $c, (New-Object System.Text.UTF8Encoding($false)))"
if errorlevel 1 (
  echo [UYARI] Rastgele veritabani sifresi uretilemedi; .env icindeki varsayilan kullanildi.
  exit /b 0
)
echo [OK] .env olusturuldu; rastgele veritabani sifresi atandi.
exit /b 0

:create_shortcut
set "APP_DIR=%PROJECT%"
powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; $d = [Environment]::GetFolderPath('Desktop'); $lnk = Join-Path $d 'DMR Nexus.lnk'; $s = $w.CreateShortcut($lnk); $s.TargetPath = (Join-Path $env:APP_DIR 'Baslat.cmd'); $s.WorkingDirectory = $env:APP_DIR; $s.WindowStyle = 7; $s.Description = 'DMR Nexus ERP'; $ico = Join-Path $env:APP_DIR 'public\brand\dmr-nexus.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Save(); Write-Host ('[OK] Masaustu kisayolu: ' + $lnk)"
if errorlevel 1 echo [UYARI] Masaustu kisayolu olusturulamadi. Baslat.cmd dosyasini kullanabilirsiniz.
exit /b 0
