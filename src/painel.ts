// =============================================================
// DIÁRIO DE EVENTOS (para o painel em pixel art)
// -------------------------------------------------------------
// Observabilidade: um agente que roda sozinho na nuvem é uma caixa
// preta. Este módulo anota O QUE cada parte do agente fez e QUANDO.
// No fim, grava tudo em status/ultima-execucao.json. O workflow do
// GitHub publica esse arquivo, e a página docs/index.html reproduz
// a execução com os personagens.
//
// Cada ferramenta pertence a um "agente" do escritório:
//   coordenador → o modelo pensando (cada passo do loop)
//   buscador    → buscar_vagas_gupy, buscar_vagas_remotive
//   linkedin    → ler_alertas_linkedin
//   analista    → ver_detalhes_vaga, registrar_avaliacao
//   carteiro    → o envio do e-mail
// =============================================================

import { mkdirSync, writeFileSync } from "node:fs";
import type { Avaliacao } from "./ferramentas.js";

export type Agente = "coordenador" | "buscador" | "linkedin" | "analista" | "carteiro";

interface Evento {
  agente: Agente;
  acao: string; // frase curta que aparece no balão do personagem
  inicio_ms: number; // tempo desde o começo da execução
  duracao_ms: number;
  erro?: boolean;
}

const AGENTE_DA_FERRAMENTA: Record<string, Agente> = {
  buscar_vagas_gupy: "buscador",
  buscar_vagas_remotive: "buscador",
  ler_alertas_linkedin: "linkedin",
  ver_detalhes_vaga: "analista",
  registrar_avaliacao: "analista",
};

const comeco = Date.now();
const eventos: Evento[] = [];

// Envolve qualquer trabalho (uma chamada ao modelo, uma ferramenta, o
// e-mail) e anota quanto tempo levou. Devolve o resultado do trabalho.
export async function medir<T>(agente: Agente, acao: string, trabalho: () => Promise<T>): Promise<T> {
  const inicio = Date.now();
  const evento: Evento = { agente, acao, inicio_ms: inicio - comeco, duracao_ms: 0 };
  eventos.push(evento);
  try {
    return await trabalho();
  } catch (e) {
    evento.erro = true;
    throw e;
  } finally {
    evento.duracao_ms = Date.now() - inicio;
  }
}

export function agenteDaFerramenta(nome: string): Agente {
  return AGENTE_DA_FERRAMENTA[nome] ?? "coordenador";
}

// Traduz um pedido de ferramenta numa frase para o balão
export function descreverFerramenta(nome: string, entrada: Record<string, unknown>): string {
  switch (nome) {
    case "buscar_vagas_gupy":
      return `Procurando "${entrada.termo}" na Gupy` + (entrada.cidade ? ` em ${entrada.cidade}` : "");
    case "buscar_vagas_remotive":
      return `Procurando "${entrada.termo}" na Remotive`;
    case "ler_alertas_linkedin":
      return "Lendo os alertas do LinkedIn no Gmail";
    case "ver_detalhes_vaga":
      return `Lendo a vaga ${entrada.id}`;
    case "registrar_avaliacao":
      return `Dando nota para a vaga ${entrada.id}`;
    default:
      return nome;
  }
}

// Acrescenta o resultado ao último evento, ex.: "... → 15 vagas"
export function anotarResultado(conteudo: string, erro: boolean) {
  const ultimo = eventos[eventos.length - 1];
  if (!ultimo) return;
  if (erro) {
    ultimo.erro = true;
    ultimo.acao += " → erro";
    return;
  }
  try {
    const dados = JSON.parse(conteudo);
    if (Array.isArray(dados)) ultimo.acao += ` → ${dados.length} vaga(s)`;
  } catch {
    // não era JSON (ex.: "Avaliação registrada: ..."), então não anota nada
  }
}

export function salvarStatus(info: {
  passos: number;
  resumo: string;
  avaliacoes: Avaliacao[];
  novasEnviadas: number;
  emailEnviado: boolean;
}) {
  const status = {
    inicio: new Date(comeco).toISOString(),
    fim: new Date().toISOString(),
    duracao_s: Math.round((Date.now() - comeco) / 1000),
    origem: process.env.GITHUB_ACTIONS ? "nuvem" : "pc",
    passos: info.passos,
    resumo: info.resumo,
    novas_enviadas: info.novasEnviadas,
    email_enviado: info.emailEnviado,
    // Só o que a página precisa. Nada de e-mail, chave ou dado pessoal.
    ranking: [...info.avaliacoes]
      .sort((a, b) => b.nota - a.nota)
      .map((v) => ({ titulo: v.titulo, empresa: v.empresa, nota: v.nota, link: v.link })),
    eventos,
  };

  mkdirSync(new URL("../status/", import.meta.url), { recursive: true });
  writeFileSync(
    new URL("../status/ultima-execucao.json", import.meta.url),
    JSON.stringify(status, null, 2),
    "utf-8",
  );
}
