@echo off
title Locally Uncensored - Setup
echo.
echo  LOCALLY UNCENSORED - Setup
echo  ===========================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  Installing Node.js...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    echo  Node.js installed. Please close and run setup.bat again.
    pause
    exit /b 0
)
echo  [OK] Node.js found

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo  Installing Git...
    winget install Git.Git --accept-package-agreements --accept-source-agreements
    echo  Git installed. Please close and run setup.bat again.
    pause
    exit /b 0
)
echo  [OK] Git found

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo  Installing Ollama...
    winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements
    echo  [OK] Ollama installed
) else (
    echo  [OK] Ollama found
)

echo.
echo  Starting Ollama...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I "ollama.exe" >NUL
if %errorlevel% neq 0 (
    start "" ollama serve
    timeout /t 3 /nobreak >nul
)

echo  Installing dependencies...
cd /d "%~dp0"
call npm install
echo  [OK] Dependencies installed

echo.
ollama list 2>nul | findstr /v "NAME" | findstr "." >nul 2>nul
if %errorlevel% neq 0 (
    echo  No AI model found. Downloading recommended model...
    echo  This downloads about 5.7 GB. Please wait.
    ollama pull mannix/llama3.1-8b-abliterated:q5_K_M
    echo  [OK] Model installed
) else (
    echo  [OK] AI models found
)

echo.
echo  ===========================
echo  Setup complete!
echo  ===========================
echo.
echo  Starting app on http://localhost:5173
echo.

start http://localhost:5173
npm run dev
