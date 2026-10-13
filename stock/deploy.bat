@echo off
title BOSS Mobile Stock - Auto Deploy Tool

echo ============================================================
echo   BOSS Mobile Stock: Deploy to GitHub / Vercel / Pages
echo ============================================================
cd /d "%~dp0"

echo.
echo [1/3] Checking Git status...
git status

echo.
echo [2/3] Adding files...
git add .
git commit -m "Update BOSS Mobile Stock Web App"

echo.
echo [3/3] Pushing to GitHub...
git push origin main

echo.
echo ============================================================
echo   Finished! Web App will be live on Vercel/GitHub Pages.
echo ============================================================
pause
