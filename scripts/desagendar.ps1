# Remove a tarefa diária criada pelo agendar.ps1
# Uso: npm run desagendar

$nome = "Agente de Vagas"

if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false
  Write-Host "Tarefa '$nome' removida. O agente não vai mais rodar sozinho."
} else {
  Write-Host "Não existe nenhuma tarefa '$nome' agendada."
}
