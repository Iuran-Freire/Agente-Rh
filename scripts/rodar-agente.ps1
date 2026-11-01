# =============================================================
# RODAR O AGENTE (usado pelo Agendador de Tarefas do Windows)
# -------------------------------------------------------------
# Quando o Windows roda o agente sozinho, ninguém está olhando o
# terminal. Por isso toda a saída vai para um arquivo de log por dia:
#   logs\agente-2026-11-02.log
# Se um dia o e-mail não chegar, é nesse arquivo que você descobre o porquê.
# =============================================================

# A pasta do projeto é a pasta acima de "scripts". O agendador roda
# a partir de outra pasta, então precisamos entrar no projeto primeiro.
$projeto = Split-Path -Parent $PSScriptRoot
Set-Location $projeto

New-Item -ItemType Directory -Force -Path "logs" | Out-Null
$log = "logs\agente-$(Get-Date -Format 'yyyy-MM-dd').log"

# O agente escreve emojis e acentos em UTF-8. Sem isso, o PowerShell
# leria o texto com outra codificação e o log ficaria cheio de "�".
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

"===== Início: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File $log -Append -Encoding utf8

# 2>&1 junta os erros com a saída normal, para os dois irem para o log
npm.cmd run agente 2>&1 | Out-File $log -Append -Encoding utf8
$codigo = $LASTEXITCODE

"===== Fim: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (código de saída $codigo) =====`n" | Out-File $log -Append -Encoding utf8

# Repassa o código de saída: o Agendador mostra "Último resultado"
# 0 quando deu certo e outro número quando deu erro.
exit $codigo
