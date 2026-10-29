@echo off
chcp 65001 > nul
title E-Ticaret Karar Destek Sistemi - Lokal Sunucu

echo ======================================================================
echo   E-TICARET MUSTERI KAYBI KARAR DESTEK SISTEMI
echo ======================================================================
echo.

cd /d "%~dp0backend"

REM 1. Sistemde Python kontrolu
python --version > nul 2>&1
if errorlevel 1 (
    echo [HATA] Sisteminizde Python bulunamadi!
    echo Lutfen python.org adresinden Python 3.10+ yukleyin ve PATH'e ekleyin.
    echo.
    pause
    exit /b 1
)

REM 2. Yerel Sanal Ortam (.venv) kontrolu
if exist ".venv\Scripts\python.exe" goto START_SERVER

echo [*] Bilgilendirme: Yerel sanal ortam (.venv) henuz kurulmamis.
echo [*] Paketler global sisteme DEGIL, yalnizca bu klasor icindeki .venv klasorune kurulacaktir.
echo.
set /p USER_CONFIRM="Gerekli paketler yerel ortama (.venv) yuklensin mi? (E/H): "

if /i "%USER_CONFIRM%" neq "E" (
    if /i "%USER_CONFIRM%" neq "Y" (
        echo [!] Kurulum kullanici tarafindan iptal edildi.
        pause
        exit /b 0
    )
)

echo.
echo [*] Yerel sanal ortam (.venv) olusturuluyor...
python -m venv .venv
if errorlevel 1 (
    echo [HATA] .venv klasoru olusturulamadi!
    pause
    exit /b 1
)

echo [*] Gerekli paketler YEREL olarak .venv icine kuruluyor (FastAPI, XGBoost, SHAP)...
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
    echo [HATA] Paketler yuklenirken bir sorun olustu!
    pause
    exit /b 1
)
echo [OK] Yerel paket kurulumu tamamlandi!
echo.

:START_SERVER
echo [*] Lokal Backend baslatiliyor: http://127.0.0.1:8000
start "E-Ticaret Backend (Port 8000)" cmd /k "cd /d ""%~dp0backend"" && .venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [*] Sunucunun hazir olmasi bekleniyor (http://127.0.0.1:8000)...
for /l %%i in (1,1,25) do (
    curl.exe -s -m 1 -o nul http://127.0.0.1:8000/docs
    if not errorlevel 1 goto SERVER_READY
    timeout /t 1 > nul
)

:SERVER_READY
echo [OK] Sunucu aktif! Web arayuzu aciliyor...
start "" "%~dp0frontend\index.html"

echo.
echo ======================================================================
echo   [OK] Karar Destek Sistemi basariyla calisiyor!
echo   - Backend Penceresi: Acik tutun (Kapatirsaniz sunucu durur)
echo   - API Docs : http://127.0.0.1:8000/docs
echo   - Web DSS Paneli   : frontend\index.html
echo ======================================================================
echo.
pause
