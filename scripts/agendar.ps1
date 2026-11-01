# =============================================================
# AGENDAR O AGENTE PARA RODAR TODO DIA
# -------------------------------------------------------------
# Uso:   npm run agendar              (todo dia às 08:00)
#        npm run agendar -- -Hora 07:30
# Para desfazer: npm run desagendar
#
# Cria uma tarefa no Agendador de Tarefas do Windows chamada
# "Agente de Vagas". Você pode vê-la abrindo o "Agendador de Tarefas"
# no menu Iniciar.
# =============================================================

param(
  [string]$Hora = "08:00"
)

$nome = "Agente de Vagas"
$script = Join-Path $PSScriptRoot "rodar-agente.ps1"

# O QUE rodar: o PowerShell executando o nosso script, sem abrir janela
$acao = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

# QUANDO rodar: todo dia, no horário escolhido
$gatilho = New-ScheduledTaskTrigger -Daily -At $Hora

# REGRAS:
#  -StartWhenAvailable: se o PC estava desligado no horário, roda
#   assim que ele ligar (senão você perderia o dia)
#  -RunOnlyIfNetworkAvailable: sem internet não dá para buscar vagas
#  -ExecutionTimeLimit: trava de segurança, igual ao MAX_PASSOS do agente
$regras = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# -Force: se a tarefa já existir, substitui (útil para trocar o horário)
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $regras `
  -Description "Busca vagas para o meu perfil e envia por e-mail (github.com/Iuran-Freire/Agente-Rh)" `
  -Force | Out-Null

Write-Host "Tarefa '$nome' agendada para todo dia às $Hora."
Write-Host "Os logs de cada execução ficam na pasta logs\ do projeto."
