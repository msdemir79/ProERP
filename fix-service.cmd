@echo off
REM ============================================================================
REM  DMR Nexus - Yonetici Onarim Betigi
REM
REM  NEDEN GEREKLI: E:\ProERP uzerindeki DSH kum havuzu, alt sureclerin (npm,
REM  vite, tsc) proje klasorlerine yazmasini engelleyen bir Windows butunluk
REM  etiketi birakti. Bu yuzden asagidaki isler kum havuzu icinden yapilamadi:
REM    (1) NSSM servis yapilandirmasinin duzeltilmesi  -> uygulama kapali
REM    (2) @types/react kurulumu ve uretim derlemesi   -> npm node_modules'a yazamadi
REM
REM  Bu betik SADECE su degisiklikleri yapar:
REM    - ProERP adli Windows hizmetinin baslatma komutunu duzeltir (tirnak hatasi giderilir)
REM    - @types/react + @types/react-dom kurar (gelistirme bagimliligi)
REM    - Uretim derlemesini olusturur (dist/)
REM    - Servisi baslatir ve saglik kontrolu yapar
REM    - Gunluk veritabani yedegi icin Zamanlanmis Gorev olusturur
REM
REM  Veritabani semasina, tablolarina veya kayitlarina DOKUNMAZ.
REM
REM  KULLANIM: Bu dosyaya sag tiklayip "Yonetici olarak calistir".
REM ============================================================================

setlocal
set "PROJECT=E:\ProERP"
set "NSSM=C:\NSSM\win64\nssm.exe"
set "NODE=C:\Program Files\nodejs\node.exe"

echo.
echo ============================================================
echo  DMR Nexus Onarim - Baslangic
echo ============================================================
echo.

REM ---------------------------------------------------------------- 0) Kontroller
if not exist "%NSSM%" (
  echo [HATA] NSSM bulunamadi: %NSSM%
  goto :fail
)
if not exist "%NODE%" (
  echo [HATA] Node.js bulunamadi: %NODE%
  goto :fail
)
if not exist "%PROJECT%\package.json" (
  echo [HATA] Proje bulunamadi: %PROJECT%
  goto :fail
)

net session >nul 2>&1
if errorlevel 1 (
  echo [HATA] Bu betik YONETICI yetkisi gerektirir.
  echo        Dosyaya sag tiklayip "Yonetici olarak calistir" secin.
  goto :fail
)
echo [OK] Yonetici yetkisi dogrulandi.

cd /d "%PROJECT%"

REM ------------------------------------------------- 1) Servis komutunu duzelt
echo.
echo --- 1/5  Servis baslatma komutu duzeltiliyor ---
echo.
echo   ESKI (bozuk - tirnak dengesiz, cmd "C:\Program" i program saniyordu):
echo     cmd.exe /d /s /c ""C:\Program Files\nodejs\npm.cmd" start
echo.
echo   YENI (cmd/npm sarmalayicisi TAMAMEN kaldirildi):
echo     "C:\Program Files\nodejs\node.exe" scripts\start.mjs
echo.
echo   Node yolu bosluk icerdigi icin NSSM degeri tirnakli yazilir; NSSM bu
echo   degeri oldugu gibi CreateProcess'e gecirir, arada cozulen bir katman yok.
echo.

"%NSSM%" set ProERP Application "%NODE%"
if errorlevel 1 ( echo [HATA] Application ayarlanamadi. & goto :fail )

"%NSSM%" set ProERP AppParameters "scripts\start.mjs"
if errorlevel 1 ( echo [HATA] AppParameters ayarlanamadi. & goto :fail )

"%NSSM%" set ProERP AppDirectory "%PROJECT%"
if errorlevel 1 ( echo [HATA] AppDirectory ayarlanamadi. & goto :fail )

REM Yeniden baslatma firtinasi yerine makul bir yeniden deneme araligi.
"%NSSM%" set ProERP AppThrottle 5000 >nul 2>&1

echo.
echo   Yazilan degerler dogrulaniyor:
echo     Application  :
"%NSSM%" get ProERP Application
echo     AppParameters:
"%NSSM%" get ProERP AppParameters
echo     AppDirectory :
"%NSSM%" get ProERP AppDirectory

REM ------------------------------------------------------- 2) Gelistirme bagimliligi
echo.
echo --- 2/5  React tip tanimlari kuruluyor (@types/react) ---
call npm install --save-dev "@types/react@^19" "@types/react-dom@^19" --no-audit --no-fund
if errorlevel 1 (
  echo [UYARI] npm install basarisiz oldu. Uygulama yine de calisir,
  echo         ancak tip kontrolu etkinlesmez. Hatayi ayrica inceleyin.
) else (
  echo [OK] Tip tanimlari kuruldu.
)

REM ------------------------------------------------------------ 3) Uretim derlemesi
echo.
echo --- 3/5  Uretim derlemesi olusturuluyor (dist/) ---
call npm run build
if errorlevel 1 (
  echo [HATA] Derleme basarisiz. Servis ESKI dist ile baslatilacak.
  echo        Yukaridaki derleme hatasini duzeltip bu betigi tekrar calistirin.
  goto :skipbuild
)
echo [OK] Derleme tamamlandi.

:skipbuild

REM --------------------------------------------------------- 4) Servisi baslat
echo.
echo --- 4/5  Servis yeniden baslatiliyor ---
"%NSSM%" reset ProERP >nul 2>&1
net stop ProERP >nul 2>&1
timeout /t 2 /nobreak >nul
net start ProERP
if errorlevel 1 (
  echo [HATA] Servis baslatilamadi. Son hatalar:
  echo ------------------------------------------------------------
  powershell -NoProfile -Command "if (Test-Path '%PROJECT%\logs\service-error.log') { Get-Content '%PROJECT%\logs\service-error.log' -Tail 20 }"
  echo ------------------------------------------------------------
  goto :fail
)
echo [OK] Servis komutu verildi, acilis bekleniyor...
timeout /t 12 /nobreak >nul

echo.
echo   Saglik kontrolu (http://127.0.0.1:3000/api/health):
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 15 -UseBasicParsing; Write-Host ('    HTTP ' + $r.StatusCode + '  ' + $r.Content) } catch { Write-Host ('    BASARISIZ: ' + $_.Exception.Message) }"

REM --------------------------------------------- 5) Gunluk yedek zamanlanmis gorev
echo.
echo --- 5/5  Gunluk otomatik yedek gorevi ---
echo      Gunluk 02:30'da calisir; oturum acmis kullanici olarak kosar
echo      (LocalSystem'in npm/node ortami guvenilir degildir).
echo.

schtasks /Query /TN "ProERP Gunluk Yedek" >nul 2>&1
if not errorlevel 1 (
  echo      Mevcut gorev guncelleniyor...
  schtasks /Delete /TN "ProERP Gunluk Yedek" /F >nul 2>&1
)

schtasks /Create ^
  /TN "ProERP Gunluk Yedek" ^
  /TR "cmd /c cd /d \"%PROJECT%\" && npm run db:backup >> \"%PROJECT%\logs\backup.log\" 2>&1" ^
  /SC DAILY /ST 02:30 /RL HIGHEST /F
if errorlevel 1 (
  echo [UYARI] Zamanlanmis gorev olusturulamadi. Elle kurmak icin:
  echo         schtasks /Create /TN "ProERP Gunluk Yedek" /TR "cmd /c cd /d %PROJECT% ^&^& npm run db:backup" /SC DAILY /ST 02:30 /RL HIGHEST /F
) else (
  echo [OK] Gunluk yedek gorevi olusturuldu (her gun 02:30).
)

echo.
echo ============================================================
echo  TAMAMLANDI
echo ============================================================
echo.
echo  Uygulama : http://localhost:3000
echo  Loglar   : %PROJECT%\logs\service-out.log
echo              %PROJECT%\logs\service-error.log
echo  Yedekler : %PROJECT%\backups\
echo.
echo  NOT: .env icindeki 'NODE_ENV=development' satirini silmeniz GEREKMEZ.
echo       scripts/start.mjs artik ortami kosulsuz production'a cektigi icin
echo       'npm start' her zaman uretim modunda calisir.
echo.
pause
endlocal
exit /b 0

:fail
echo.
echo ============================================================
echo  BETIK HATA ILE DURDU - yukaridaki mesaji inceleyin.
echo ============================================================
echo.
pause
endlocal
exit /b 1
