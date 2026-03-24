@echo off
title Space Scheduler Server
echo.
echo  ========================================
echo   Space Scheduler - 서버 시작
echo  ========================================
echo.
echo  [1] 로컬 서버 시작 (포트 8080)...
start /B python -m http.server 8080
echo      http://localhost:8080
echo.
echo  [2] 외부 접속 URL 생성 중...
echo.
echo  !! 패스워드 화면이 뜨면 아래 IP를 입력하세요 !!
echo.
for /f %%i in ('curl -s https://ipv4.icanhazip.com') do echo      패스워드(IP): %%i
echo.
npx --yes localtunnel --port 8080
pause