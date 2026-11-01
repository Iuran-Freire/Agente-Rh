// =============================================================
// O AGENTE: modelo + ferramentas + loop
// -------------------------------------------------------------
// Rode com:  npm run agente -- "sua pergunta aqui"
// =============================================================

import "dotenv/config";
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { ferramentas, executarFerramenta, avaliacoes } from "./ferramentas.js";
import { carregarMemoria, jaVista, registrarEnvio } from "./memoria.js";
import { enviarEmail } from "./email.js";

// ETAPA 5: só vão para o e-mail as vagas com pelo menos esta nota.
// Abaixo disso, nem vale a pena te incomodar.
const NOTA_MINIMA = 6;

// O cliente lê a chave ANTHROPIC_API_KEY do .env automaticamente
const cliente = new Anthropic();

const MODELO = "claude-sonnet-5-5";

// Trava de segurança: um agente com bug pode ficar em loop
// chamando ferramentas para sempre (e gastando). Sempre limite.
// (Subiu de 10 para 15: buscar + ler detalhes exige mais passos.)
const MAX_PASSOS = 15;

// ETAPA 3: o perfil do candidato entra no contexto.
// Lemos o perfil.md uma vez, quando o programa começa. Como o agente
// precisa dele em TODA decisão, ele vai direto no system prompt.
// (Uma ferramenta "ler_perfil" faria sentido para algo consultado só
// às vezes. Aqui seria um passo a mais, sempre, à toa.)
const PERFIL = readFileSync(new URL("../perfil.md", import.meta.url), "utf-8");

// O "system prompt" define o papel e as regras do agente.
// Ele não muda ao longo da conversa.
// ETAPA 2: o prompt descreve um PROCESSO em etapas
// (buscar → aprofundar → recomendar), não só um objetivo.
// ETAPA 3: o perfil vai entre tags <perfil>. As tags separam
// "dados sobre a pessoa" de "instruções para você", e o modelo
// entende melhor o que é cada coisa.
const SYSTEM = `Você é um assistente que encontra as melhores vagas de emprego para uma pessoa específica.

<perfil>
${PERFIL}
</perfil>

Siga este processo:
1. Monte as buscas a partir do perfil: use as áreas e tecnologias dele como termos.
   Use buscar_vagas_gupy (fonte principal) várias vezes, com termos e filtros diferentes.
   Para vagas presenciais ou híbridas, use o filtro cidade "Manaus" em vez de colocar
   a cidade no termo. Use buscar_vagas_remotive só se a Gupy trouxer poucos resultados.
   Chame também ler_alertas_linkedin (uma vez) para ver as vagas que o LinkedIn mandou por e-mail.
2. Descarte pelo resumo o que claramente não serve: nível pleno ou sênior, áreas que o
   perfil diz que NÃO quer, presencial/híbrido fora de Manaus, vagas publicadas há mais
   de 60 dias. Pule também as marcadas com ja_enviada: true (a pessoa já as recebeu).
3. Leia as mais promissoras com ver_detalhes_vaga (no máximo 6) e confira os requisitos
   contra o perfil: formação exigida, inglês, horário e salário.
4. Para cada vaga que você recomendaria, chame registrar_avaliacao. Só registre vagas
   que você leu com ver_detalhes_vaga. Exceção: as do LinkedIn não têm descrição; registre
   só as que o título deixa claro que combinam, e seja conservador nas notas de
   tecnologias e requisitos (no máximo 6), porque você não viu os requisitos. É melhor registrar 2 boas do que 6 ruins, e se
   nenhuma for boa, não registre nenhuma.
5. Depois de registrar, termine com um resumo CURTO em português (3 a 5 linhas):
   quantas vagas avaliou, o que descartou e por quê, e uma sugestão de próxima busca.
   Não repita a lista de vagas: o programa vai mostrar o ranking.
Nunca invente vagas nem informações: use só o que as ferramentas retornarem.`;

// ETAPA 4: quem mostra o resultado agora é o CÓDIGO, a partir dos
// dados estruturados. O modelo julga; o programa ordena e formata.
// Amanhã esta mesma lista vira e-mail, arquivo ou planilha.
function mostrarRanking() {
  if (avaliacoes.length === 0) {
    console.log("\n😕 Nenhuma vaga foi recomendada nesta busca.");
    return;
  }

  const ranking = [...avaliacoes].sort((a, b) => b.nota - a.nota);
  console.log(`\n🏆 RANKING: ${ranking.length} vaga(s)\n`);

  ranking.forEach((v, i) => {
    const c = v.criterios;
    console.log(`${i + 1}. ${v.titulo} | ${v.empresa}  ⭐ ${v.nota}/10`);
    console.log(`   📍 ${v.modalidade} · ${v.local} · publicada em ${v.publicada_em}`);
    console.log(
      `   📊 área ${c.area} · nível ${c.nivel} · tecnologias ${c.tecnologias} · ` +
        `requisitos ${c.requisitos} · condições ${c.condicoes}`,
    );
    for (const m of v.motivos) console.log(`   ✔ ${m}`);
    for (const p of v.pontos_de_atencao) console.log(`   ⚠ ${p}`);
    console.log(`   🔗 ${v.link}\n`);
  });
}

// ETAPA 5: o que acontece depois que o agente termina.
// Tudo aqui é código comum, sem modelo: filtrar, enviar, lembrar.
async function finalizar(resumo: string) {
  mostrarRanking();

  const memoria = carregarMemoria();

  // O FILTRO DE VERDADE contra repetição: um if, que nunca erra.
  const novas = avaliacoes
    .filter((v) => !jaVista(memoria, v.id))
    .filter((v) => v.nota >= NOTA_MINIMA)
    .sort((a, b) => b.nota - a.nota);

  if (novas.length === 0) {
    console.log(`\n📪 Nenhuma vaga nova com nota ≥ ${NOTA_MINIMA}. Nada para enviar hoje.`);
    return;
  }

  const enviado = await enviarEmail(novas, resumo);

  // Só grava na memória o que foi enviado DE VERDADE. Se o envio
  // falhar (ou for só a prévia), as vagas continuam "novas" e vão
  // no próximo e-mail.
  if (enviado) {
    registrarEnvio(memoria, novas);
    console.log(`🧠 ${novas.length} vaga(s) gravada(s) na memória (vagas-vistas.json)`);
  }
}

async function rodarAgente(pedido: string) {
  // A memória de curto prazo do agente é SÓ esta lista.
  // A API não guarda estado entre chamadas: a cada volta do loop,
  // mandamos o histórico inteiro de novo.
  const mensagens: Anthropic.MessageParam[] = [
    { role: "user", content: pedido },
  ];

  for (let passo = 1; passo <= MAX_PASSOS; passo++) {
    console.log(`\n── Passo ${passo}: perguntando ao modelo...`);

    // 1) PENSAR: o modelo recebe o histórico + as ferramentas disponíveis
    const resposta = await cliente.messages.create({
      model: MODELO,
      max_tokens: 4096,
      system: SYSTEM,
      tools: ferramentas,
      messages: mensagens,
    });

    // A resposta do modelo entra no histórico (inclusive os pedidos de ferramenta)
    mensagens.push({ role: "assistant", content: resposta.content });

    // Mostra qualquer "fala" do modelo neste passo
    let textoDoPasso = "";
    for (const bloco of resposta.content) {
      if (bloco.type === "text" && bloco.text.trim()) {
        console.log(`\n🤖 ${bloco.text}`);
        textoDoPasso += bloco.text;
      }
    }

    // 2) DECIDIR: o stop_reason diz por que o modelo parou.
    //    "tool_use"  → ele quer que a gente execute ferramenta(s)
    //    "end_turn"  → terminou; a resposta final já foi mostrada
    if (resposta.stop_reason !== "tool_use") {
      console.log(`\n✅ Fim (stop_reason: ${resposta.stop_reason}, ${passo} passo(s))`);
      // O texto final do modelo vira o resumo no topo do e-mail
      await finalizar(textoDoPasso);
      return;
    }

    // 3) AGIR: executar cada ferramenta pedida
    const resultados: Anthropic.ToolResultBlockParam[] = [];

    for (const bloco of resposta.content) {
      if (bloco.type !== "tool_use") continue;

      console.log(`🔧 Ferramenta: ${bloco.name}(${JSON.stringify(bloco.input)})`);
      const { conteudo, erro } = await executarFerramenta(bloco.name, bloco.input);
      console.log(erro ? `   ⚠️ ${conteudo}` : `   ↳ ${conteudo.length} caracteres de resultado`);

      resultados.push({
        type: "tool_result",
        tool_use_id: bloco.id, // liga o resultado ao pedido certo
        content: conteudo,
        is_error: erro,
      });
    }

    // 4) OBSERVAR: os resultados voltam ao modelo como uma mensagem
    //    do "user". Na próxima volta do loop, ele decide o que fazer
    //    com eles: buscar de novo, ou responder.
    mensagens.push({ role: "user", content: resultados });
  }

  console.log(`\n⛔ Parei após ${MAX_PASSOS} passos sem resposta final.`);
  // Mesmo parando no meio, as avaliações já registradas não se perdem
  await finalizar("O agente atingiu o limite de passos antes de terminar o resumo.");
}

const pedido =
  process.argv.slice(2).join(" ") ||
  "Encontre as melhores vagas para o meu perfil.";

console.log(`📋 Pedido: ${pedido}`);
rodarAgente(pedido).catch((e) => {
  console.error("Erro:", e);
  process.exit(1);
});
