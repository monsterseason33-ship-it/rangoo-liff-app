@echo off
title BOSS Premium - Auto Deploy Tool

echo ============================================================
echo   BOSS Premium: Auto Deploy to GitHub and Vercel
echo ============================================================
cd /d "%~dp0"

echo.
echo [1/3] Staging modified files (git add .)...
git add .
echo      - Done.

echo.
echo [2/3] Committing changes (git commit)...
git commit -m "Update rangoo-liff-app webapp"

echo.
echo [3/3] Pushing to GitHub (git push origin main)...
echo ------------------------------------------------------------
git push origin main

if errorlevel 1 goto ERROR_SECTION

:SUCCESS_SECTION
echo ------------------------------------------------------------
echo.
echo ============================================================
echo   SUCCESS: Code pushed to GitHub successfully!
echo   Vercel is deploying to https://rangoo-liff-app.vercel.app/
echo ============================================================
echo.
pause
exit /b 0

:ERROR_SECTION
echo ------------------------------------------------------------
echo.
echo ============================================================
echo   ERROR: Failed to push code to GitHub!
echo ============================================================
echo.
pause
exit /b 1
