// =============================================================
// ENVIO DE E-MAIL (Gmail)
// -------------------------------------------------------------
// O agente não "manda e-mail" sozinho: é este código comum que
// pega a lista estruturada de avaliações e transforma em HTML.
// Por isso a Etapa 4 (dados estruturados) veio antes.
//
// Configuração no .env (veja o .env.example):
//   GMAIL_USUARIO   = seu endereço do Gmail
//   GMAIL_SENHA_APP = a "senha de app" de 16 letras (NÃO a senha normal)
//   EMAIL_DESTINO   = para onde mandar (opcional; padrão: o próprio Gmail)
// =============================================================

import { mkdirSync, writeFileSync } from "node:fs";
import nodemailer from "nodemailer";
import type { Avaliacao } from "./ferramentas.js";

// Os textos vêm das vagas (dados de fora). Escapar evita que um
// título com "<" ou "&" quebre o HTML do e-mail.
function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function corDaNota(nota: number): string {
  if (nota >= 8) return "#1a7f37"; // verde
  if (nota >= 6.5) return "#9a6700"; // amarelo
  return "#cf222e"; // vermelho
}

function montarHtml(vagas: Avaliacao[], resumo: string): string {
  const cartoes = vagas
    .map(
      (v, i) => `
    <div style="border:1px solid #d0d7de;border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:13px;color:#57606a">#${i + 1} · ${escapar(v.modalidade)} · ${escapar(v.local)} · publicada em ${v.publicada_em}</div>
      <h2 style="margin:6px 0;font-size:18px">${escapar(v.titulo)}</h2>
      <div style="margin-bottom:8px"><b>${escapar(v.empresa)}</b>
        <span style="background:${corDaNota(v.nota)};color:#fff;border-radius:12px;padding:2px 10px;margin-left:8px">${v.nota}/10</span>
      </div>
      <ul style="margin:8px 0;padding-left:20px">
        ${v.motivos.map((m) => `<li>✔ ${escapar(m)}</li>`).join("")}
        ${v.pontos_de_atencao.map((p) => `<li style="color:#9a6700">⚠ ${escapar(p)}</li>`).join("")}
      </ul>
      <a href="${escapar(v.link)}" style="display:inline-block;background:#0969da;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px">Ver vaga e me candidatar</a>
    </div>`,
    )
    .join("");

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#1f2328">
    <h1 style="font-size:22px">🎯 ${vagas.length} vaga(s) nova(s) para você</h1>
    <p style="color:#57606a">${escapar(resumo).replace(/\n/g, "<br>")}</p>
    ${cartoes}
    <p style="font-size:12px;color:#57606a">Enviado pelo seu agente de vagas.</p>
  </div>`;
}

// Devolve true se o e-mail saiu de verdade e false se só salvou a prévia.
// Lança erro se o Gmail recusar o envio (ex.: senha de app errada).
export async function enviarEmail(vagas: Avaliacao[], resumo: string): Promise<boolean> {
  const html = montarHtml(vagas, resumo);
  const hoje = new Date().toLocaleDateString("pt-BR");
  const assunto = `🎯 ${vagas.length} vaga(s) nova(s) para você (${hoje})`;

  const usuario = process.env.GMAIL_USUARIO;
  const senha = process.env.GMAIL_SENHA_APP;

  // Sem configuração, salvamos uma prévia em vez de enviar.
  // Assim dá para ver como o e-mail vai ficar antes de configurar o Gmail.
  if (!usuario || !senha) {
    mkdirSync(new URL("../relatorios/", import.meta.url), { recursive: true });
    const arquivo = new URL("../relatorios/previa-email.html", import.meta.url);
    writeFileSync(arquivo, html, "utf-8");
    console.log("\n📭 Gmail não configurado no .env: salvei uma prévia em relatorios/previa-email.html");
    return false;
  }

  const transporte = nodemailer.createTransport({
    service: "gmail",
    auth: { user: usuario, pass: senha },
  });

  await transporte.sendMail({
    from: `Agente de Vagas <${usuario}>`,
    to: process.env.EMAIL_DESTINO || usuario,
    subject: assunto,
    html,
  });

  console.log(`\n📧 E-mail enviado para ${process.env.EMAIL_DESTINO || usuario}`);
  return true;
}
