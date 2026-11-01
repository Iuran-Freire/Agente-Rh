@echo off
rem =============================================================
rem  EXECUTOR MANUAL: dois cliques e o agente roda na hora.
rem  Use quando o PC nao estava ligado as 9h30, ou quando quiser
rem  buscar de novo. Nao repete vagas: a memoria (vagas-vistas.json)
rem  garante que so as vagas novas vao para o e-mail.
rem =============================================================
chcp 65001 > nul
cd /d "%~dp0"
title Agente de Vagas
echo.
echo  Buscando vagas para o seu perfil... (leva cerca de 1 minuto)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\rodar-agente.ps1"

echo.
echo  ---------------- Resultado ----------------
rem Mostra so as linhas importantes do log de hoje (ranking, e-mail, erros)
powershell -NoProfile -Command "$log = Get-ChildItem logs\agente-*.log | Sort-Object LastWriteTime | Select-Object -Last 1; $linhas = Get-Content $log.FullName -Encoding utf8; $inicio = ($linhas | Select-String '===== In' | Select-Object -Last 1).LineNumber; $linhas[($inicio-1)..($linhas.Count-1)] | Select-String -Pattern 'RANKING','/10','E-mail enviado','Nenhuma vaga','Erro','Gmail' | ForEach-Object { '  ' + $_.Line.Trim() }"
echo  -------------------------------------------
echo.
echo  Detalhes completos na pasta logs\ do projeto.
pause
