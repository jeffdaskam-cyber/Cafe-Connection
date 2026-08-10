@echo off
setlocal

rem ---------------------------------------------------------------------------
rem  Cafe Connection / Catering Companion - Windows sandbox setup
rem
rem  Run this from the repo root after cloning:
rem
rem      setup-windows.cmd
rem
rem  Deliberately thin. Everything it can delegate, it delegates:
rem  scripts/checkSandboxPrereqs.mjs already reports missing or too-old Node and
rem  Java with platform-specific install commands, and it is covered by tests.
rem  Batch only has to answer "is there a node at all", because without one that
rem  script cannot run.
rem
rem  Note for editors: cmd.exe treats > and < as redirection even inside quotes,
rem  so avoid them in `node -e` one-liners here. That is why the version check
rem  lives in the .mjs script rather than inline.
rem ---------------------------------------------------------------------------

echo.
echo   Cafe Connection - sandbox setup
echo   ================================
echo.

rem --- Are we in the right place? --------------------------------------------
if not exist "package.json" (
  echo   [X] No package.json here.
  echo.
  echo       Run this from the repo root - the folder containing package.json.
  echo       Current folder: %CD%
  echo.
  goto :fail
)

rem --- Node present at all? ---------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js is not installed, or is not on your PATH.
  echo.
  echo       winget install OpenJS.NodeJS.LTS
  echo.
  echo       Then CLOSE AND REOPEN this window - PATH only refreshes in a new
  echo       one - and run setup-windows.cmd again.
  echo.
  echo       No winget? Download the LTS installer from https://nodejs.org
  echo.
  goto :fail
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo   [ok] Node %NODEVER% found
echo.

rem --- Node new enough, and Java present? -------------------------------------
rem Delegated: this prints its own install guidance and exits non-zero on any
rem problem. Running it now surfaces a missing Java before the npm ci wait
rem rather than after it.
node scripts\checkSandboxPrereqs.mjs
if errorlevel 1 goto :fail

echo   [ok] Prerequisites satisfied
echo.

rem --- Dependencies -----------------------------------------------------------
rem `call` matters: npm is itself a .cmd, and without it this script would exit
rem here instead of continuing.
echo   Installing dependencies ^(npm ci^) - this takes a minute...
echo.
call npm ci
if errorlevel 1 (
  echo.
  echo   [X] npm ci failed. The output above should say why.
  echo.
  goto :fail
)

echo.
echo   [ok] Dependencies installed
echo.
echo   Starting the sandbox. Press Ctrl-C to stop everything.
echo.

call npm run sandbox
goto :eof

:fail
echo   Setup did not complete.
echo.
pause
exit /b 1
