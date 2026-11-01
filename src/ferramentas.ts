// =============================================================
// FERRAMENTAS DO AGENTE
// -------------------------------------------------------------
// Uma ferramenta tem duas partes:
//   1. A DESCRIÇÃO (para o modelo): nome, o que faz e quais
//      parâmetros aceita, em JSON Schema. É só isso que o Claude
//      "vê". Ele nunca vê o código da função.
//   2. A IMPLEMENTAÇÃO (para o seu código): a função TypeScript
//      que roda de verdade quando o modelo pede a ferramenta.
//
// ETAPA 2: novas ferramentas
//   - buscar_vagas_gupy: vagas do Brasil (estágio, júnior, Manaus...)
//   - ver_detalhes_vaga: lê a descrição completa de UMA vaga
// =============================================================

import type Anthropic from "@anthropic-ai/sdk";
import { carregarMemoria } from "./memoria.js";
import { lerAlertasLinkedin } from "./linkedin.js";

// ---------- 1. Descrições que vão para o modelo ----------

export const ferramentas: Anthropic.Tool[] = [
  {
    name: "buscar_vagas_gupy",
    // Esta é a fonte principal: a Gupy concentra vagas brasileiras,
    // inclusive estágio. Dizer isso na descrição ajuda o modelo a
    // escolher ESTA ferramenta antes da Remotive.
    description:
      "Busca vagas de emprego no BRASIL (fonte: Gupy, a maior plataforma de vagas do país). " +
      "Fonte principal: use esta antes das outras. Retorna um resumo de cada vaga: id, título, " +
      "empresa, tipo (estágio, efetivo/CLT, PJ...), modalidade, cidade, data e link. " +
      "NÃO retorna a descrição completa: para isso use ver_detalhes_vaga com o id. " +
      "Use termos curtos em português, como 'analista de dados', 'power bi' ou 'desenvolvedor vue'. " +
      "A palavra 'júnior' costuma estar no título, então pode entrar no termo ('desenvolvedor junior'). " +
      "Pode ser chamada várias vezes com termos e filtros diferentes.",
    input_schema: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description: "Palavra-chave da busca, ex.: 'analista de dados' ou 'estágio desenvolvimento'",
        },
        modalidade: {
          type: "string",
          // "enum" restringe os valores: o modelo não consegue inventar outro
          enum: ["remoto", "hibrido", "presencial"],
          description: "Filtra pela modalidade de trabalho. Omita para trazer todas.",
        },
        somente_estagio: {
          type: "boolean",
          description: "Se true, traz só vagas de estágio.",
        },
        // ETAPA 3: na Etapa 2 o modelo tentou buscar "estágio TI Manaus"
        // e não achou nada, porque o termo é procurado só no TÍTULO.
        // Um parâmetro próprio resolve isso.
        cidade: {
          type: "string",
          description:
            "Filtra pela cidade da vaga, ex.: 'Manaus'. Não coloque a cidade no termo: use este campo.",
        },
        limite: {
          type: "integer",
          description: "Máximo de vagas a retornar (padrão 15, máximo 30)",
        },
      },
      required: ["termo"],
    },
  },
  {
    name: "buscar_vagas_remotive",
    description:
      "Busca vagas REMOTAS INTERNACIONAIS (fonte: Remotive), quase sempre em inglês. " +
      "Fonte secundária: use só se a Gupy trouxer poucos resultados. " +
      "Retorna id, título, empresa, região aceita, tipo, salário, data e link. " +
      "Use termos curtos em inglês, como 'data analyst' ou 'vue'.",
    input_schema: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description: "Palavra-chave da busca em inglês, ex.: 'power bi'",
        },
        limite: {
          type: "integer",
          description: "Máximo de vagas a retornar (padrão 10, máximo 30)",
        },
      },
      required: ["termo"],
    },
  },
  {
    name: "ler_alertas_linkedin",
    // ETAPA 6: uma fonte que não é um site, e sim a caixa de e-mail.
    // A descrição avisa a limitação (sem descrição completa) para o
    // modelo calibrar a confiança das notas.
    description:
      "Lê as vagas que o LinkedIn enviou por e-mail (alertas de vaga) para a caixa de entrada da pessoa. " +
      "Retorna id, título, empresa, local, data de recebimento e link. Traz vagas de todos os alertas " +
      "configurados no LinkedIn, inclusive de áreas que não interessam, então filtre pelo perfil. " +
      "LIMITAÇÃO: o e-mail não traz a descrição da vaga, então ver_detalhes_vaga não ajuda nessas vagas. " +
      "Avalie pelo título, empresa e local. Chame no máximo uma vez por execução.",
    input_schema: {
      type: "object",
      properties: {
        dias: {
          type: "integer",
          description: "Quantos dias para trás ler os e-mails (padrão 7)",
        },
      },
      required: [],
    },
  },
  {
    name: "ver_detalhes_vaga",
    // A descrição explica QUANDO usar e DE ONDE vem o id. Sem isso,
    // o modelo poderia tentar inventar um id ou passar o link.
    description:
      "Lê a descrição completa de uma vaga (requisitos, atividades, benefícios, salário, horário). " +
      "Use nas vagas mais promissoras ANTES de recomendá-las, para confirmar se combinam com o perfil. " +
      "O id precisa ser um que veio de buscar_vagas_gupy ou buscar_vagas_remotive nesta conversa " +
      "(ex.: 'gupy-12803734').",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "O id da vaga, exatamente como veio na busca, ex.: 'gupy-12803734'",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "registrar_avaliacao",
    // ETAPA 4: SAÍDA ESTRUTURADA usando uma ferramenta.
    // Em vez de escrever a avaliação como texto livre, o modelo
    // "preenche um formulário". O código recebe dados prontos
    // (números, listas) para ordenar, filtrar, salvar e enviar.
    //
    // strict: true faz a API GARANTIR que a entrada siga o esquema:
    // todos os campos obrigatórios presentes, tipos certos, nada a mais.
    strict: true,
    description:
      "Registra a avaliação de UMA vaga que você leu com ver_detalhes_vaga e considera recomendável. " +
      "Chame uma vez por vaga recomendada (pode chamar várias de uma vez). " +
      "Dê uma nota inteira de 0 a 10 para cada critério, comparando a vaga com o perfil: " +
      "area (a área é a preferida do perfil?), nivel (estágio/júnior?), " +
      "tecnologias (o perfil domina o que a vaga pede?), " +
      "requisitos (formação, inglês e experiência exigidos são atendidos?), " +
      "condicoes (salário, horário, modalidade e local combinam?). " +
      "Não calcule a nota final: o programa calcula. " +
      "Título, empresa e link também são preenchidos pelo programa a partir do id.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "O id da vaga, exatamente como veio na busca",
        },
        criterios: {
          type: "object",
          properties: {
            area: { type: "integer" },
            nivel: { type: "integer" },
            tecnologias: { type: "integer" },
            requisitos: { type: "integer" },
            condicoes: { type: "integer" },
          },
          required: ["area", "nivel", "tecnologias", "requisitos", "condicoes"],
          additionalProperties: false,
        },
        motivos: {
          type: "array",
          items: { type: "string" },
          description: "2 a 4 frases curtas: por que a vaga combina com o perfil (cite as competências)",
        },
        pontos_de_atencao: {
          type: "array",
          items: { type: "string" },
          description: "Frases curtas com o que pesa contra ou precisa ser confirmado. Pode ser vazia.",
        },
      },
      required: ["id", "criterios", "motivos", "pontos_de_atencao"],
      // Com strict: true, todo objeto precisa de additionalProperties: false
      additionalProperties: false,
    },
  },
];

// ---------- 2. Implementações (código de verdade) ----------

// ETAPA 4: o resumo de cada vaga encontrada fica guardado aqui.
// Assim, quando o modelo registra uma avaliação só com o id, o CÓDIGO
// preenche título, empresa e link. O modelo nunca digita o link, então
// não tem como errar uma letra nem inventar uma URL.
interface ResumoVaga {
  id: string;
  titulo: string;
  empresa: string;
  modalidade: string;
  local: string;
  publicada_em: string;
  link: string;
}
const vagasEncontradas = new Map<string, ResumoVaga>();

// ETAPA 5: as vagas que já foram enviadas em execuções anteriores.
// As buscas marcam essas vagas com ja_enviada: true, e o modelo pula
// a leitura e a avaliação delas, o que economiza passos e tokens.
// (O filtro que IMPEDE a repetição no e-mail é o do agente.ts, em código.
// Esta marcação é só para o modelo não perder tempo.)
const idsJaEnviados = new Set(Object.keys(carregarMemoria()));

// "Memória" das ferramentas: as buscas guardam aqui a descrição
// completa de cada vaga, mas NÃO a mandam para o modelo.
// Só quando ele pedir ver_detalhes_vaga o texto vai para a conversa.
// Isso se chama divulgação progressiva: primeiro o resumo barato,
// depois o detalhe caro, só do que interessa.
const descricoes = new Map<string, string>();

// As descrições vêm com HTML e espaços sobrando. Limpar o texto
// economiza tokens e facilita a leitura para o modelo.
function limparTexto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ") // remove as tags HTML
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ") // junta espaços e quebras de linha
    .trim();
}

// ----- Gupy -----

// Formato (parcial) de uma vaga na API da Gupy.
// Atenção: essa é a API que o próprio site portal.gupy.io usa, não
// uma API oficial documentada. Ela pode mudar sem aviso.
interface VagaGupy {
  id: number;
  name: string;
  careerPageName: string;
  type: string;
  workplaceType: string;
  city: string;
  state: string;
  publishedDate: string;
  description: string;
  jobUrl: string;
}

// A Gupy usa nomes técnicos. Traduzimos para o modelo (e para você)
// entender melhor, nos dois sentidos.
const MODALIDADE_PARA_GUPY = { remoto: "remote", hibrido: "hybrid", presencial: "on-site" };
const TIPOS_GUPY: Record<string, string> = {
  vacancy_type_internship: "estágio",
  vacancy_type_effective: "efetivo (CLT)",
  vacancy_legal_entity: "PJ",
  vacancy_type_temporary: "temporário",
  vacancy_type_talent_pool: "banco de talentos",
  vacancy_type_apprentice: "jovem aprendiz",
  vacancy_type_freelancer: "freelancer",
};

async function buscarVagasGupy(
  termo: string,
  modalidade?: keyof typeof MODALIDADE_PARA_GUPY,
  somenteEstagio?: boolean,
  cidade?: string,
  limite = 15,
): Promise<string> {
  const url = new URL("https://portal.gupy.io/api/job-search/jobs");
  url.searchParams.set("jobName", termo);
  url.searchParams.set("limit", String(Math.min(limite, 30)));
  url.searchParams.set("offset", "0");
  if (modalidade) url.searchParams.set("workplaceType", MODALIDADE_PARA_GUPY[modalidade]);
  if (somenteEstagio) url.searchParams.set("type", "vacancy_type_internship");
  if (cidade) url.searchParams.set("city", cidade);

  const resposta = await fetch(url);
  if (!resposta.ok) {
    // Mensagem clara para o MODELO: ele vai ler isso e pode trocar de fonte.
    throw new Error(
      `a API da Gupy respondeu com status ${resposta.status}. ` +
        "Ela não é oficial e pode ter mudado. Tente buscar_vagas_remotive.",
    );
  }

  const dados = (await resposta.json()) as { data: VagaGupy[] };

  const resumo = dados.data.map((v) => {
    const id = `gupy-${v.id}`;
    descricoes.set(id, v.description); // guarda, mas não envia
    const resumo = {
      id,
      titulo: v.name,
      empresa: v.careerPageName,
      tipo: TIPOS_GUPY[v.type] ?? v.type,
      modalidade: v.workplaceType,
      local: v.city ? `${v.city} - ${v.state}` : "não informado",
      publicada_em: v.publishedDate.slice(0, 10),
      link: v.jobUrl,
    };
    vagasEncontradas.set(id, resumo);
    return idsJaEnviados.has(id) ? { ...resumo, ja_enviada: true } : resumo;
  });

  if (resumo.length === 0) return `Nenhuma vaga encontrada na Gupy para "${termo}".`;
  return JSON.stringify(resumo);
}

// ----- Remotive -----

// Formato (parcial) de uma vaga na API da Remotive
interface VagaRemotive {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location: string;
  job_type: string;
  salary: string;
  publication_date: string;
  description: string;
  url: string;
}

async function buscarVagasRemotive(termo: string, limite = 10): Promise<string> {
  const url = new URL("https://remotive.com/api/remote-jobs");
  url.searchParams.set("search", termo);
  url.searchParams.set("limit", String(Math.min(limite, 30)));

  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`a API da Remotive respondeu com status ${resposta.status}`);
  }

  const dados = (await resposta.json()) as { jobs: VagaRemotive[] };

  // Devolvemos só os campos úteis. A descrição completa fica guardada
  // no Map e só vai para o modelo se ele pedir ver_detalhes_vaga.
  const resumo = dados.jobs.map((v) => {
    const id = `remotive-${v.id}`;
    descricoes.set(id, v.description);
    const resumo = {
      id,
      titulo: v.title,
      empresa: v.company_name,
      regiao_aceita: v.candidate_required_location,
      tipo: v.job_type,
      salario: v.salary || "não informado",
      publicada_em: v.publication_date.slice(0, 10),
      link: v.url,
    };
    vagasEncontradas.set(id, {
      ...resumo,
      modalidade: "remote",
      local: v.candidate_required_location,
    });
    return idsJaEnviados.has(id) ? { ...resumo, ja_enviada: true } : resumo;
  });

  if (resumo.length === 0) return `Nenhuma vaga encontrada na Remotive para "${termo}".`;
  return JSON.stringify(resumo);
}

// ----- LinkedIn -----

async function buscarAlertasLinkedin(dias = 7): Promise<string> {
  const vagas = await lerAlertasLinkedin(Math.min(dias, 30));

  const resumo = vagas.map((v) => {
    // O alerta não tem descrição. Guardamos um aviso no lugar, para que
    // ver_detalhes_vaga explique isso ao modelo em vez de dar erro.
    descricoes.set(
      v.id,
      "Vaga do LinkedIn: o alerta por e-mail não traz a descrição. " +
        `Só se sabe: "${v.titulo}", empresa ${v.empresa}, local ${v.local}. ` +
        "Avalie por esses dados e registre nos pontos de atenção que a descrição não foi lida.",
    );
    const dados = {
      id: v.id,
      titulo: v.titulo,
      empresa: v.empresa,
      modalidade: "não informado",
      local: v.local,
      publicada_em: v.recebida_em,
      link: v.link,
    };
    vagasEncontradas.set(v.id, dados);
    return idsJaEnviados.has(v.id) ? { ...dados, ja_enviada: true } : dados;
  });

  if (resumo.length === 0) return `Nenhum alerta do LinkedIn nos últimos ${dias} dias.`;
  return JSON.stringify(resumo);
}

// ----- Detalhes -----

// Limite de caracteres por descrição: algumas vagas têm textos
// enormes. 4000 caracteres dão ~1000 tokens, o suficiente para
// ver requisitos e benefícios.
const MAX_CARACTERES_DETALHE = 4000;

function verDetalhesVaga(id: string): string {
  const html = descricoes.get(id);
  if (!html) {
    // Um erro EXPLICATIVO deixa o modelo se corrigir sozinho:
    // ele lê a mensagem e sabe que precisa buscar de novo.
    throw new Error(
      `não conheço a vaga "${id}". Use um id que veio de uma busca nesta conversa ` +
        "(ex.: 'gupy-12345'), ou faça uma nova busca.",
    );
  }

  const texto = limparTexto(html);
  if (texto.length <= MAX_CARACTERES_DETALHE) return texto;
  return texto.slice(0, MAX_CARACTERES_DETALHE) + " [...descrição cortada]";
}

// ----- Avaliação -----

// Os pesos de cada critério na nota final. Quem decide isso é VOCÊ,
// não o modelo: área e nível pesam mais porque são os filtros mais
// importantes do perfil. Ajuste à vontade (a soma deve dar 1).
const PESOS = {
  area: 0.25,
  nivel: 0.25,
  tecnologias: 0.25,
  requisitos: 0.15,
  condicoes: 0.1,
};

type Criterios = Record<keyof typeof PESOS, number>;

export interface Avaliacao extends ResumoVaga {
  nota: number;
  criterios: Criterios;
  motivos: string[];
  pontos_de_atencao: string[];
}

// O resultado da execução: o agente.ts lê esta lista no final.
export const avaliacoes: Avaliacao[] = [];

function registrarAvaliacao(entrada: {
  id: string;
  criterios: Criterios;
  motivos: string[];
  pontos_de_atencao: string[];
}): string {
  const vaga = vagasEncontradas.get(entrada.id);
  if (!vaga) {
    throw new Error(`não conheço a vaga "${entrada.id}". Use um id que veio de uma busca nesta conversa.`);
  }

  // O strict: true garante os TIPOS (inteiro), mas não a FAIXA:
  // o esquema estrito não aceita "minimum"/"maximum". Então o código
  // confere. Validar a entrada do modelo é sempre papel do seu código.
  for (const [nome, valor] of Object.entries(entrada.criterios)) {
    if (valor < 0 || valor > 10) {
      throw new Error(`a nota de "${nome}" foi ${valor}, mas precisa estar entre 0 e 10.`);
    }
  }

  // A nota final é uma conta: o código faz, sempre do mesmo jeito.
  let nota = 0;
  for (const nome of Object.keys(PESOS) as (keyof typeof PESOS)[]) {
    nota += entrada.criterios[nome] * PESOS[nome];
  }
  nota = Math.round(nota * 10) / 10; // uma casa decimal, ex.: 7.8

  // Se o modelo registrar a mesma vaga duas vezes, vale a última avaliação.
  const indice = avaliacoes.findIndex((a) => a.id === entrada.id);
  const avaliacao = { ...vaga, ...entrada, nota };
  if (indice >= 0) avaliacoes[indice] = avaliacao;
  else avaliacoes.push(avaliacao);

  return `Avaliação registrada: ${vaga.titulo} (${vaga.empresa}), nota ${nota}.`;
}

// ---------- 3. O "despachante" ----------
// O modelo pede uma ferramenta pelo NOME, com um objeto de entrada.
// Esta função liga esse pedido à implementação certa.

export async function executarFerramenta(
  nome: string,
  entrada: unknown,
): Promise<{ conteudo: string; erro: boolean }> {
  try {
    switch (nome) {
      case "buscar_vagas_gupy": {
        const { termo, modalidade, somente_estagio, cidade, limite } = entrada as {
          termo: string;
          modalidade?: keyof typeof MODALIDADE_PARA_GUPY;
          somente_estagio?: boolean;
          cidade?: string;
          limite?: number;
        };
        return {
          conteudo: await buscarVagasGupy(termo, modalidade, somente_estagio, cidade, limite),
          erro: false,
        };
      }
      case "buscar_vagas_remotive": {
        const { termo, limite } = entrada as { termo: string; limite?: number };
        return { conteudo: await buscarVagasRemotive(termo, limite), erro: false };
      }
      case "ler_alertas_linkedin": {
        const { dias } = entrada as { dias?: number };
        return { conteudo: await buscarAlertasLinkedin(dias), erro: false };
      }
      case "ver_detalhes_vaga": {
        const { id } = entrada as { id: string };
        return { conteudo: verDetalhesVaga(id), erro: false };
      }
      case "registrar_avaliacao": {
        const dados = entrada as Parameters<typeof registrarAvaliacao>[0];
        return { conteudo: registrarAvaliacao(dados), erro: false };
      }
      default:
        return { conteudo: `Ferramenta desconhecida: ${nome}`, erro: true };
    }
  } catch (e) {
    // Em vez de derrubar o programa, devolvemos o erro ao MODELO.
    // Assim ele pode reagir: tentar outro termo, avisar você, etc.
    const mensagem = e instanceof Error ? e.message : String(e);
    return { conteudo: `Erro ao executar ${nome}: ${mensagem}`, erro: true };
  }
}
