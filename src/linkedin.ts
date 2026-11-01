// =============================================================
// ALERTAS DO LINKEDIN (lidos do seu Gmail)
// -------------------------------------------------------------
// O LinkedIn não tem API pública de vagas e proíbe robôs no site.
// Mas ele MANDA as vagas para você por e-mail (alertas de vaga).
// Então lemos a SUA caixa de entrada, com a mesma senha de app do
// Gmail, pelo protocolo IMAP. São dados que já são seus.
//
// Limite importante: o e-mail traz só título, empresa e local.
// A descrição completa fica no site do LinkedIn, que não acessamos.
// =============================================================

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface VagaLinkedin {
  id: string; // ex.: "linkedin-4473994581"
  titulo: string;
  empresa: string;
  local: string;
  recebida_em: string;
  link: string;
}

// Os alertas chegam deste remetente
const REMETENTE = "jobalerts-noreply@linkedin.com";

// Extrai as vagas do TEXTO de um e-mail de alerta. Cada vaga vem num
// bloco assim, separado por uma linha de traços:
//
//   Estagiário na área de Análise e Desenvolvimento de Sistemas
//   Jobbol
//   Manaus, AM
//   Visualizar vaga: https://www.linkedin.com/comm/jobs/view/4473994581/?...
//
// Se o LinkedIn mudar esse formato, é esta função que precisa de ajuste.
function extrairVagas(texto: string, recebidaEm: string): VagaLinkedin[] {
  const vagas: VagaLinkedin[] = [];

  for (const bloco of texto.split(/-{20,}/)) {
    const numero = bloco.match(/Visualizar vaga:\s*\S*\/jobs\/view\/(\d+)/)?.[1];
    if (!numero) continue;

    // As linhas com conteúdo ANTES do "Visualizar vaga"
    const linhas = bloco
      .slice(0, bloco.indexOf("Visualizar vaga:"))
      .split("\n")
      .map((l) => l.replace(/<[^>]+>/g, "").trim()) // às vezes sobra uma tag HTML
      .filter((l) => l && !l.includes("http"));

    // No primeiro bloco, o cabeçalho do e-mail vem junto. As 3 linhas
    // da vaga ficam logo antes de linhas extras como "Candidate-se...",
    // então procuramos a partir do fim, ignorando essas linhas extras.
    const extras = /candidate-se|ex-aluno|conex(ão|ões)|recrutando|contratando|promovida|novas vagas|alerta/i;
    const daVaga = linhas.filter((l) => !extras.test(l));
    if (daVaga.length < 3) continue;
    const [titulo, empresa, local] = daVaga.slice(-3);

    vagas.push({
      id: `linkedin-${numero}`,
      titulo,
      empresa,
      local,
      recebida_em: recebidaEm,
      // Link "limpo", sem os parâmetros de rastreamento do e-mail
      link: `https://www.linkedin.com/jobs/view/${numero}/`,
    });
  }

  return vagas;
}

export async function lerAlertasLinkedin(dias: number): Promise<VagaLinkedin[]> {
  const usuario = process.env.GMAIL_USUARIO;
  const senha = process.env.GMAIL_SENHA_APP;
  if (!usuario || !senha) {
    throw new Error("o Gmail não está configurado no .env (GMAIL_USUARIO e GMAIL_SENHA_APP).");
  }

  const cliente = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: usuario, pass: senha },
    logger: false, // sem isso, a biblioteca imprime cada comando IMAP no terminal
  });

  await cliente.connect();
  // O "lock" impede que duas operações mexam na caixa ao mesmo tempo
  const lock = await cliente.getMailboxLock("INBOX");

  // Usamos um Map pelo id: a mesma vaga costuma aparecer em vários alertas
  const vagas = new Map<string, VagaLinkedin>();
  try {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const uids = (await cliente.search({ from: REMETENTE, since: desde }, { uid: true })) || [];

    for await (const msg of cliente.fetch(uids, { envelope: true, source: true }, { uid: true })) {
      if (!msg.source) continue;
      const email = await simpleParser(msg.source);
      // A data pode vir como Date ou como texto: new Date() aceita os dois
      const data = new Date(msg.envelope?.date ?? Date.now()).toISOString().slice(0, 10);
      for (const v of extrairVagas(email.text ?? "", data)) {
        vagas.set(v.id, v);
      }
    }
  } finally {
    // finally: fecha a conexão mesmo se algo der errado no meio
    lock.release();
    await cliente.logout();
  }

  return [...vagas.values()];
}
