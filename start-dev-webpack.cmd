@echo off
setlocal
set "ROOT=C:\Users\lirenxuan\Documents\trae_projects\gongkao"
set "PROJECT=%ROOT%\gongkao-review"
set "NEXT_PKG=%ROOT%\node_modules\.pnpm\next@16.1.1_@babel+core@7.2_704a7f71a75f95b2a8902ec56ade7cab\node_modules\next"
set "NODE_PATH=%NEXT_PKG%\node_modules;%NEXT_PKG%\..;%ROOT%\node_modules\.pnpm\node_modules"
cd /d "%PROJECT%"
node "%NEXT_PKG%\dist\bin\next" dev --webpack -p 5000
