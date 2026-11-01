// =============================================================
// ATUALIZAR OS DADOS DO PAINEL
// -------------------------------------------------------------
// Roda no GitHub Actions depois do agente. Copia o diário da execução
// para a pasta da branch "painel-dados" e acrescenta um resumo dela no
// histórico (as últimas 30 execuções).
//
// Uso: node scripts/atualizar-painel.mjs status/ultima-execucao.json <pasta-do-painel>
// =============================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [arquivoStatus, pastaPainel] = process.argv.slice(2);
const status = JSON.parse(readFileSync(arquivoStatus, "utf-8"));

writeFileSync(join(pastaPainel, "ultima-execucao.json"), JSON.stringify(status, null, 2));

const arquivoHistorico = join(pastaPainel, "historico.json");
const historico = existsSync(arquivoHistorico) ? JSON.parse(readFileSync(arquivoHistorico, "utf-8")) : [];

historico.unshift({
  inicio: status.inicio,
  duracao_s: status.duracao_s,
  passos: status.passos,
  vagas_avaliadas: status.ranking.length,
  novas_enviadas: status.novas_enviadas,
  melhor: status.ranking[0] ? { titulo: status.ranking[0].titulo, nota: status.ranking[0].nota } : null,
});

writeFileSync(arquivoHistorico, JSON.stringify(historico.slice(0, 30), null, 2));
console.log(`Painel atualizado: ${historico.length} execução(ões) no histórico.`);
