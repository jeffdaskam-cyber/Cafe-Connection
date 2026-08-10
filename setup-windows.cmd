@echo off
setlocal

rem ---------------------------------------------------------------------------
rem  Cafe Connection / Catering Companion - Windows sandbox setup
rem
rem  Run this from the repo root after cloning:
rem
rem      setup-windows.cmd
rem
rem  NO ADMIN RIGHTS? Node and Java both ship as plain .zip archives that need no
rem  installer. Extract them into this repo as:
rem
rem      tools\node\node.exe
rem      tools\java\bin\java.exe
rem
rem  and this script finds them without anything being on your PATH. tools\ is
rem  git-ignored. See docs/catering/SANDBOX.md for the download links.
rem
rem  Deliberately thin. Everything it can delegate, it delegates to
rem  scripts/checkSandboxPrereqs.mjs, which already reports missing or too-old
rem  Node and Java with platform-specific install commands and is covered by
rem  tests. Batch only answers "is there a node at all", because without one that
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

rem --- Portable copies, if present, win over anything on PATH -----------------
if exist "%CD%\tools\node\node.exe" (
  set "PATH=%CD%\tools\node;%PATH%"
  echo   [ok] Using portable Node from tools\node
)
if exist "%CD%\tools\java\bin\java.exe" (
  set "JAVA_HOME=%CD%\tools\java"
  set "PATH=%CD%\tools\java\bin;%PATH%"
  echo   [ok] Using portable Java from tools\java
)

rem --- Node present at all? ---------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js is not installed, or is not on your PATH.
  echo.
  echo       With admin rights:
  echo         winget install OpenJS.NodeJS.LTS
  echo         Then CLOSE AND REOPEN this window and run this again.
  echo.
  echo       Without admin rights, no installer needed:
  echo         1. Download the Windows x64 ZIP from https://nodejs.org/en/download
  echo         2. Extract it so node.exe sits at:  %CD%\tools\node\node.exe
  echo         3. Run this script again.
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
if errorlevel 1 (
  echo   Without admin rights, Java needs no installer either:
  echo     1. Download the Temurin 21 Windows x64 *.zip* from
  echo        https://adoptium.net/temurin/releases/?version=21^&package=jdk
  echo     2. Extract it so java.exe sits at:  %CD%\tools\java\bin\java.exe
  echo     3. Run this script again.
  echo.
  goto :fail
)

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
