// =============================================================
// MEMÓRIA DE LONGO PRAZO (o "chip de memória")
// -------------------------------------------------------------
// O array `mensagens` some quando o programa termina. Este arquivo
// JSON fica no disco: é assim que o agente lembra, de uma execução
// para a outra, quais vagas já te mandou.
//
// Repare: quem lê e grava a memória é o CÓDIGO. O modelo não decide
// o que é repetido. Um `if` faz isso sem nunca errar.
// =============================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Avaliacao } from "./ferramentas.js";

const ARQUIVO = new URL("../vagas-vistas.json", import.meta.url);

// O que guardamos de cada vaga. O status já prepara o terreno para
// você marcar depois o que fez com ela ("aplicada", "descartada").
export interface VagaVista {
  titulo: string;
  empresa: string;
  nota: number;
  link: string;
  enviada_em: string;
  status: "enviada" | "aplicada" | "descartada";
}

// A chave é o id da vaga (ex.: "gupy-12577451"), que é único.
type Memoria = Record<string, VagaVista>;

export function carregarMemoria(): Memoria {
  // Primeira execução: o arquivo ainda não existe, então a memória está vazia
  if (!existsSync(ARQUIVO)) return {};
  return JSON.parse(readFileSync(ARQUIVO, "utf-8")) as Memoria;
}

export function jaVista(memoria: Memoria, id: string): boolean {
  return id in memoria;
}

// Só é chamada DEPOIS que o e-mail saiu. Se o envio falhar, as vagas
// não entram na memória e são enviadas de novo na próxima execução.
export function registrarEnvio(memoria: Memoria, vagas: Avaliacao[]): void {
  const hoje = new Date().toISOString().slice(0, 10);
  for (const v of vagas) {
    memoria[v.id] = {
      titulo: v.titulo,
      empresa: v.empresa,
      nota: v.nota,
      link: v.link,
      enviada_em: hoje,
      status: "enviada",
    };
  }
  // null, 2 = JSON indentado, fácil de abrir e editar à mão
  writeFileSync(ARQUIVO, JSON.stringify(memoria, null, 2), "utf-8");
}
