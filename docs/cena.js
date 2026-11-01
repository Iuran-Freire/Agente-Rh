// =============================================================
// CENA ISOMÉTRICA: o escritório e a sala de descanso
// -------------------------------------------------------------
// Como funciona a vista isométrica:
//  - O chão é uma grade de quadradinhos (tiles), em coordenadas (gx, gy).
//  - Cada quadradinho aparece na tela como um losango de 16x8 pixels.
//    gx cresce para baixo-direita, gy cresce para baixo-esquerda.
//  - Móveis são "caixas" 3D: base num ou mais tiles e uma altura em pixels.
//  - Profundidade: quem está mais perto da câmera (gx + gy maior) é
//    desenhado depois, por cima (o "algoritmo do pintor").
//  - Os personagens andam de tile em tile, desviando dos móveis com uma
//    busca em largura (BFS) na grade.
//
// Este arquivo só sabe DESENHAR e MOVER. Quem decide quem está ativo
// é a página (index.html), a partir dos dados reais do agente.
// =============================================================

export const W = 256, H = 180;
const COLS = 18, LINHAS = 11;          // tamanho da grade
const OX = 100, OY = 58;               // onde fica o tile (0, 0) na tela
const ALTURA_PAREDE = 50;
export const DIVISA = 11;              // coluna da meia-parede entre as salas
const PORTA = [7, 8];                  // linhas da porta na meia-parede

export const sala = gx => (gx < DIVISA ? "escritorio" : "descanso");

// Grade → tela (o ponto é o canto "de cima" do tile)
export function iso(gx, gy, z = 0) { return { x: OX + (gx - gy) * 8, y: OY + (gx + gy) * 4 - z }; }
// Centro de um tile na tela (onde ficam os pés de quem está nele)
export function centro(gx, gy) { return iso(gx + 0.5, gy + 0.5); }

// =============================================================
// 1. PINCEL DE PIXELS
// -------------------------------------------------------------
// Polígonos preenchidos linha a linha com pixels inteiros. O fill()
// normal do canvas suaviza as bordas e estraga o visual pixel art.
// =============================================================
let ctx;
export function usarContexto(c) { ctx = c; ctx.imageSmoothingEnabled = false; }

export function px(x, y, w, h, cor) { ctx.fillStyle = cor; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function poligono(pts, cor) {
  ctx.fillStyle = cor;
  const ys = pts.map(p => p.y), y0 = Math.ceil(Math.min(...ys)), y1 = Math.floor(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) xs.push(a.x + (cy - a.y) / (b.y - a.y) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
      if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1);
    }
  }
}

// Caixa 3D: base de (gx, gy) até (gx+w, gy+d), altura h, começando a z do chão
export function caixa(gx, gy, w, d, h, cores, z = 0) {
  const A = iso(gx, gy, z), B = iso(gx + w, gy, z), C = iso(gx + w, gy + d, z), D = iso(gx, gy + d, z);
  const up = p => ({ x: p.x, y: p.y - h });
  poligono([D, C, up(C), up(D)], cores.esq ?? cores.topo);   // face virada para gy+ (esquerda da tela)
  poligono([B, C, up(C), up(B)], cores.dir ?? cores.topo);   // face virada para gx+ (direita da tela)
  poligono([up(A), up(B), up(C), up(D)], cores.topo);        // tampa
}

// Retângulo pintado numa parede do fundo.
// eixo "x": parede de trás (gy = 0), t = gx.  eixo "y": parede da esquerda (gx = 0), t = gy.
function naParede(eixo, t, z) { return eixo === "x" ? iso(t, 0, z) : iso(0, t, z); }
function quadroParede(eixo, t0, t1, z0, z1, cor) {
  poligono([naParede(eixo, t0, z0), naParede(eixo, t1, z0), naParede(eixo, t1, z1), naParede(eixo, t0, z1)], cor);
}
// Pixel "colado" na parede (para detalhes pequenos)
function pixelParede(eixo, t, z, w, h, cor) { const p = naParede(eixo, t, z); px(p.x, p.y, w, h, cor); }

// =============================================================
// 2. A PLANTA: móveis, lugares e obstáculos
// =============================================================
const bloqueado = Array.from({ length: COLS }, () => Array(LINHAS).fill(false));
const moveis = [];      // tudo que tem volume, desenhado em ordem de profundidade
// ajuste: empurra o móvel para frente ou para trás na ordem de desenho
// (ex.: o encosto da cadeira é desenhado DEPOIS de quem está sentado)
function movel(gx, gy, w, d, desenhar, bloqueia = true, ajuste = 0.4) {
  moveis.push({ prof: gx + w - 1 + gy + d - 1 + ajuste, desenhar });
  if (bloqueia) for (let i = gx; i < gx + w; i++) for (let j = gy; j < gy + d; j++) bloqueado[i][j] = true;
}

// Meia-parede de vidro entre as salas, com porta
for (let gy = 0; gy < LINHAS; gy++) {
  if (PORTA.includes(gy)) continue;
  movel(DIVISA, gy, 1, 1, () => {
    // meia-parede baixa, com uma faixa de vidro em cima, para não esconder a sala de descanso
    caixa(DIVISA + 0.35, gy, 0.3, 1, 8, { topo: "#5d6a8a", esq: "#3d4660", dir: "#4a5575" });
    caixa(DIVISA + 0.4, gy, 0.2, 1, 7, { topo: "#bfe3f2", esq: "#8fb8d0", dir: "#a5cde0" }, 8);
  });
}

// ---------- Mesas (uma por função do agente, mais a do chefe) ----------
// cadeira = tile onde o personagem senta, virado para a mesa
export const MESAS = {
  busca:   { gx: 1, gy: 2, w: 2, cadeira: [1, 3] },               // buscar vagas na Gupy/Remotive
  agente:  { gx: 4, gy: 2, w: 2, cadeira: [4, 3] },               // a mesa do agente: onde ele "pensa"
  analise: { gx: 7, gy: 2, w: 2, cadeira: [7, 3] },               // ler as vagas e dar notas
  chefe:   { gx: 2, gy: 6, w: 3, cadeira: [3, 7], chefe: true },  // a mesa do chefe (Iuran)
  envio:   { gx: 7, gy: 6, w: 3, cadeira: [8, 7], balcao: true }, // montar e enviar o e-mail
};
const telaAtiva = {}; // mesa → a tela do computador está ligada?
export function ligarTela(id, sim) { telaAtiva[id] = sim; }

const MADEIRA = {
  clara:  { topo: "#d6a066", esq: "#9c6a3a", dir: "#b47c48" },
  escura: { topo: "#8a5634", esq: "#5a3520", dir: "#6e4228" },
  rosa:   { topo: "#d4a6c4", esq: "#9a6a8a", dir: "#b4809e" },
};
const METAL = { topo: "#4a5064", esq: "#2e3240", dir: "#3a3f50" };

// O que aparece em cada tela quando ela está ligada
function conteudoTela(id, x, y, t) {
  const pisca = Math.floor(t / 250) % 2;
  if (id === "busca") { // lista de vagas rolando
    for (let i = 0; i < 3; i++) px(x + 1, y + 1 + i * 2, ((i + Math.floor(t / 400)) % 3) + 3, 1, i === 1 ? "#ffffff" : "#bfe8ff");
    px(x + 6, y + 1, 1, 1, "#ffd93d");
  } else if (id === "agente") { // "código" do loop
    px(x + 1, y + 1, 3, 1, "#ffd93d"); px(x + 2, y + 3, 4, 1, "#9fffb0"); px(x + 2, y + 5, 2 + pisca, 1, "#ffffff");
  } else if (id === "analise") { // gráfico de barras das notas
    for (let i = 0; i < 4; i++) { const a = 1 + ((i * 3 + Math.floor(t / 500)) % 5); px(x + 1 + i * 2, y + 6 - a, 1, a, i % 2 ? "#5ad17a" : "#f2b544"); }
  } else if (id === "envio") { // envelope
    px(x + 2, y + 2, 5, 3, "#fffdf3"); px(x + 3, y + 3, 1, 1, "#c0392b"); px(x + 5, y + 3, 1, 1, "#c0392b"); px(x + 4, y + 4, 1, 1, "#c0392b");
  } else { // chefe: caixa de entrada
    px(x + 1, y + 1, 6, 1, "#ffffff"); px(x + 1, y + 3, 5, 1, "#bfe8ff"); px(x + 1, y + 5, 4, 1, pisca ? "#5ad17a" : "#bfe8ff");
  }
}

function monitor(id, gx, gy, t) {
  caixa(gx + 0.35, gy + 0.3, 0.1, 0.1, 3, METAL, 10);                        // haste
  caixa(gx + 0.15, gy + 0.32, 0.5, 0.06, 0, METAL, 10);                       // base
  caixa(gx, gy + 0.25, 0.85, 0.12, 8, { topo: "#6a7290", esq: "#565e7a", dir: "#4a5270" }, 13); // moldura
  const a = iso(gx + 0.06, gy + 0.37, 14), b = iso(gx + 0.79, gy + 0.37, 14);
  const ligada = telaAtiva[id];
  poligono([a, b, { x: b.x, y: b.y - 6 }, { x: a.x, y: a.y - 6 }], ligada ? "#1e6a9a" : "#1a1e2c");
  if (ligada) {
    conteudoTela(id, a.x, a.y - 7, t);
    // brilho da tela em volta
    ctx.globalAlpha = 0.14 + 0.06 * Math.sin(t / 170);
    poligono([{ x: a.x - 3, y: a.y + 3 }, { x: b.x + 3, y: b.y + 3 }, { x: b.x + 3, y: b.y - 10 }, { x: a.x - 3, y: a.y - 10 }], "#9fe8ff");
    ctx.globalAlpha = 1;
  } else { px(a.x + 1, a.y - 5, 2, 1, "#3a4258"); px(a.x + 1, a.y - 4, 1, 1, "#3a4258"); } // reflexo da tela desligada
}

for (const [id, m] of Object.entries(MESAS)) {
  movel(m.gx, m.gy, m.w, 1, t => {
    const madeira = m.balcao ? MADEIRA.rosa : m.chefe ? MADEIRA.escura : MADEIRA.clara;
    const x0 = m.gx + 0.05, x1 = m.gx + m.w - 0.05, y0 = m.gy + 0.1, y1 = m.gy + 0.9;
    if (m.balcao || m.chefe) {
      // balcão e mesa do chefe: frente fechada, com detalhe
      caixa(x0 + 0.05, y0 + 0.05, m.w - 0.2, 0.7, 8, { topo: madeira.topo, esq: madeira.esq, dir: madeira.dir });
      const f0 = iso(x0 + 0.3, y1 - 0.05, 4), f1 = iso(x1 - 0.3, y1 - 0.05, 4);
      poligono([f0, f1, { x: f1.x, y: f1.y - 2 }, { x: f0.x, y: f0.y - 2 }], m.chefe ? "#d4a017" : "#e8c8dc");
    } else {
      // mesa comum: pernas finas e um gaveteiro
      for (const [lx, ly] of [[x0 + 0.05, y0 + 0.05], [x1 - 0.12, y0 + 0.05], [x0 + 0.05, y1 - 0.12]]) caixa(lx, ly, 0.07, 0.07, 8, METAL);
      caixa(x1 - 0.5, y0 + 0.1, 0.45, 0.7, 8, madeira);
      for (const z of [2.5, 5.5]) { const g = iso(x1 - 0.28, y1 - 0.1, z); px(g.x - 1, g.y, 3, 1, "#5a3a20"); }
    }
    caixa(x0, y0, m.w - 0.1, 0.8, 2, madeira, 8); // tampo
    const T = 10; // altura do tampo

    // monitor(es): a mesa do agente tem dois
    if (id === "agente") { monitor(id, m.gx + 0.15, m.gy, t); monitor(id, m.gx + 1.0, m.gy, t); }
    else monitor(id, m.gx + (m.w === 3 ? 1.1 : 0.35), m.gy, t);

    // teclado e mouse
    const k = iso(m.gx + (m.w === 3 ? 1.45 : 0.75), m.gy + 0.72, T); px(k.x - 4, k.y - 1, 7, 2, "#cfd3dc"); px(k.x - 3, k.y - 1, 5, 1, "#e8ecf2");
    const ms = iso(m.gx + (m.w === 3 ? 2.0 : 1.25), m.gy + 0.72, T); px(ms.x, ms.y - 1, 2, 1, "#cfd3dc");

    // acessórios de cada mesa
    if (id === "busca") { // vasinho, post-its e pilha de papel
      const v = iso(m.gx + 1.7, m.gy + 0.35, T); px(v.x - 1, v.y - 3, 3, 3, "#c0703a"); px(v.x - 2, v.y - 6, 5, 3, "#4fa85a"); px(v.x, v.y - 8, 1, 2, "#5fbf6a");
      const p = iso(m.gx + 0.2, m.gy + 0.65, T); px(p.x - 2, p.y - 2, 4, 2, "#fffdf3"); px(p.x - 2, p.y - 3, 4, 1, "#f4f0e0");
      const s = iso(m.gx + 0.35, m.gy + 0.36, 20); px(s.x, s.y, 2, 2, "#ffd93d"); px(s.x + 8, s.y + 3, 2, 2, "#ff8ac2");
    }
    if (id === "agente") { // caneca de café com vapor e um patinho de borracha (para "debugar")
      const c = iso(m.gx + 1.8, m.gy + 0.65, T); px(c.x, c.y - 3, 3, 3, "#5aa7ef"); px(c.x + 3, c.y - 2, 1, 1, "#5aa7ef");
      if (Math.floor(t / 500) % 2) px(c.x + 1, c.y - 5, 1, 1, "#d0d0d0");
      const d = iso(m.gx + 0.2, m.gy + 0.7, T); px(d.x, d.y - 3, 3, 3, "#ffd93d"); px(d.x + 1, d.y - 4, 2, 1, "#ffd93d"); px(d.x + 3, d.y - 3, 1, 1, "#f08a24"); px(d.x + 1, d.y - 3, 1, 1, "#1b1b1b");
    }
    if (id === "analise") { // luminária (acende quando trabalha) e prancheta
      const l = iso(m.gx + 1.8, m.gy + 0.3, T);
      px(l.x, l.y - 1, 3, 1, "#3a3f50"); px(l.x + 1, l.y - 7, 1, 6, "#3a3f50"); px(l.x - 2, l.y - 9, 4, 2, "#e0a43a");
      if (telaAtiva.analise) { ctx.globalAlpha = 0.25; poligono([{ x: l.x - 3, y: l.y - 7 }, { x: l.x + 2, y: l.y - 7 }, { x: l.x + 6, y: l.y + 2 }, { x: l.x - 7, y: l.y + 2 }], "#ffe9a8"); ctx.globalAlpha = 1; }
      const p = iso(m.gx + 0.25, m.gy + 0.65, T); px(p.x - 2, p.y - 2, 4, 3, "#8a5a3a"); px(p.x - 1, p.y - 2, 2, 2, "#fffdf3");
      if (telaAtiva.analise && Math.floor(t / 350) % 2) px(p.x + 4, p.y - 4, 4, 2, "#fffdf3"); // papel voando
    }
    if (m.chefe) { // caneca "melhor chefe", plaquinha, porta-retrato e planta
      const c = iso(m.gx + 0.4, m.gy + 0.6, T); px(c.x, c.y - 4, 3, 4, "#fff"); px(c.x + 1, c.y - 3, 1, 1, "#c0392b"); px(c.x + 3, c.y - 3, 1, 2, "#fff");
      const pr = iso(m.gx + 2.55, m.gy + 0.4, T); px(pr.x, pr.y - 5, 4, 5, "#d4a017"); px(pr.x + 1, pr.y - 4, 2, 3, "#7cc4f0");
      const pl = iso(m.gx + 2.75, m.gy + 0.75, T); px(pl.x - 1, pl.y - 3, 3, 3, "#c0703a"); px(pl.x - 2, pl.y - 7, 5, 4, "#3f8f4a");
    }
    if (m.balcao) { // envelopes, sininho e carimbo
      const e = iso(m.gx + 2.3, m.gy + 0.5, T); px(e.x, e.y - 3, 4, 3, "#fffdf3"); px(e.x + 2, e.y - 5, 4, 3, "#f4f0e0"); px(e.x + 3, e.y - 4, 1, 1, "#c0392b");
      const s = iso(m.gx + 0.35, m.gy + 0.6, T); px(s.x - 1, s.y - 3, 3, 2, "#d4a017"); px(s.x, s.y - 4, 1, 1, "#d4a017"); px(s.x - 2, s.y - 1, 5, 1, "#8a6a1a");
    }
  });

  // cadeira de escritório: base com rodinhas, assento e encosto
  const [cx, cy] = m.cadeira;
  movel(cx, cy, 1, 1, () => {
    const b = iso(cx + 0.5, cy + 0.5); px(b.x - 3, b.y - 1, 6, 1, "#1e2028"); px(b.x - 1, b.y, 2, 1, "#1e2028");
    caixa(cx + 0.45, cy + 0.45, 0.1, 0.1, 3, METAL);
    caixa(cx + 0.2, cy + 0.2, 0.6, 0.6, 1, { topo: m.chefe ? "#5a2a2a" : "#3a3f52", esq: "#22252f", dir: "#2a2e3a" }, 3);
  }, false);
  // o encosto fica entre quem senta e a câmera, então é desenhado depois da pessoa
  movel(cx, cy, 1, 1, () => {
    caixa(cx + 0.2, cy + 0.72, 0.6, 0.1, 6, { topo: m.chefe ? "#6a3232" : "#444a60", esq: m.chefe ? "#4a2020" : "#2e3242", dir: "#363b4e" }, 4);
  }, false, 0.75);
}

// ---------- Escritório ----------
movel(0, 0, 1, 1, () => { // planta grande no canto
  caixa(0.25, 0.25, 0.5, 0.5, 7, { topo: "#7a4020", esq: "#a0552d", dir: "#8a4a26" });
  const p = iso(0.5, 0.5, 7); px(p.x - 4, p.y - 10, 8, 9, "#3f8f4a"); px(p.x - 6, p.y - 7, 3, 5, "#4fa85a"); px(p.x + 3, p.y - 12, 3, 6, "#5fbf6a"); px(p.x - 1, p.y - 14, 2, 4, "#4fa85a"); px(p.x - 3, p.y - 6, 2, 2, "#2f7a3a");
});
movel(5, 0, 1, 1, t => { // impressora numa mesinha, com bandeja de papel
  caixa(5.1, 0.1, 0.8, 0.8, 8, MADEIRA.escura);
  caixa(5.15, 0.15, 0.7, 0.65, 6, { topo: "#e8ecf2", esq: "#b8bcc6", dir: "#cfd3dc" }, 8);
  const p = iso(5.5, 0.5, 14); px(p.x - 3, p.y - 1, 6, 1, "#2a2a2a");
  const l = iso(5.8, 0.8, 11); px(l.x, l.y, 1, 1, estado.imprimindo ? "#5ad17a" : "#2f7a45");
  if (estado.imprimindo && Math.floor(t / 300) % 2) px(p.x - 2, p.y - 4, 4, 3, "#fffdf3");
});
movel(9, 0, 1, 1, () => { // arquivo de aço com 4 gavetas
  caixa(9.1, 0.15, 0.8, 0.7, 26, { topo: "#9aa3b2", esq: "#6e7888", dir: "#808a9a" });
  for (let z = 3; z < 26; z += 6) {
    const a = iso(9.15, 0.85, z), b = iso(9.85, 0.85, z);
    poligono([a, b, { x: b.x, y: b.y - 5 }, { x: a.x, y: a.y - 5 }], "#8a94a4");
    px((a.x + b.x) / 2 - 2, (a.y + b.y) / 2 - 3, 4, 1, "#3a3f4a");
  }
});
movel(10, 0, 1, 1, t => { // bebedouro com bolhas subindo
  caixa(10.2, 0.2, 0.6, 0.6, 14, { topo: "#e8ecf2", esq: "#b8bcc6", dir: "#cfd3dc" });
  caixa(10.27, 0.27, 0.46, 0.46, 9, { topo: "#9fd8ff", esq: "#5aa7ef", dir: "#7ab8f0" }, 14);
  const b = iso(10.5, 0.75, 16 + ((t / 120) % 6)); px(b.x, b.y, 1, 1, "#e8fbff");
  const c = iso(10.5, 0.8, 8); px(c.x - 1, c.y, 3, 2, "#7a7a82");
});
movel(0, 6, 1, 2, () => { // estante de livros e quadrinhos, com colecionáveis em cima
  caixa(0.1, 6.05, 0.7, 1.9, 26, MADEIRA.escura);
  const cores = ["#c0392b", "#2c6ac8", "#e0a43a", "#3aa35a", "#8a4ac0", "#e8e8e8", "#d05a8a", "#1b1b2a"];
  for (const [z, alt] of [[2, 6], [9, 5], [16, 6]]) {
    const a = iso(0.8, 6.1, z), b = iso(0.8, 7.9, z);
    poligono([a, b, { x: b.x, y: b.y - 1 }, { x: a.x, y: a.y - 1 }], "#3a2414"); // prateleira
    for (let i = 0; i < 14; i++) {
      if ((i + z) % 7 === 3) continue; // um espaço vazio aqui e ali
      const p = iso(0.8, 6.15 + i * 0.125, z + 1), h = alt - ((i * 5 + z) % 3);
      px(p.x - 1, p.y - h, 1, h, cores[(i * 3 + z) % cores.length]);
    }
  }
  // colecionáveis no topo: robô gigante, garota mágica, capacete espacial
  const r = iso(0.45, 6.4, 26); px(r.x - 2, r.y - 7, 4, 3, "#e8e8f0"); px(r.x - 3, r.y - 4, 6, 4, "#3a5fc0"); px(r.x - 1, r.y - 6, 1, 1, "#3aa3ff"); px(r.x - 1, r.y - 8, 2, 1, "#ffd93d");
  const g = iso(0.45, 7.0, 26); px(g.x - 2, g.y - 9, 5, 2, "#ff8ac2"); px(g.x - 2, g.y - 7, 5, 3, "#f5d0a9"); px(g.x - 3, g.y - 7, 1, 4, "#ff8ac2"); px(g.x + 3, g.y - 7, 1, 4, "#ff8ac2"); px(g.x - 2, g.y - 4, 5, 4, "#ffffff"); px(g.x - 1, g.y - 3, 3, 1, "#ff4a8a");
  const c = iso(0.45, 7.6, 26); px(c.x - 3, c.y - 6, 6, 6, "#e8e8f0"); px(c.x - 2, c.y - 5, 4, 3, "#2a2a4a"); px(c.x - 1, c.y - 4, 2, 1, "#8ad8ff");
});
movel(0, 8, 1, 2, t => { // rack de servidores com LEDs e cabos
  caixa(0.1, 8.1, 0.8, 1.8, 30, { topo: "#2c3244", esq: "#1e2230", dir: "#262b3a" });
  for (let z = 3; z < 29; z += 4) {
    const a = iso(0.9, 8.2, z), b = iso(0.9, 9.8, z);
    poligono([a, b, { x: b.x, y: b.y - 3 }, { x: a.x, y: a.y - 3 }], "#323a50");
    for (let i = 0; i < 3; i++) {
      const p = iso(0.9, 8.4 + i * 0.5, z + 1);
      px(p.x, p.y - 1, 1, 1, Math.floor(t / 180 + z + i * 3) % 3 ? "#5ad17a" : "#1a5a2a");
      if (i === 1) px(p.x - 2, p.y - 1, 1, 1, Math.floor(t / 310 + z) % 4 ? "#f2b544" : "#5a4010");
    }
  }
  // cabos saindo pelo chão
  const c0 = iso(1, 9.6); px(c0.x - 2, c0.y - 1, 6, 1, "#1b1b2a"); px(c0.x + 4, c0.y, 5, 1, "#1b1b2a");
});
movel(3, 2, 1, 1, () => { // lixeira com bolinhas de papel
  caixa(3.3, 2.3, 0.4, 0.4, 6, { topo: "#3a3f50", esq: "#2a2e3a", dir: "#323646" });
  const p = iso(3.5, 2.5, 6); px(p.x - 1, p.y - 1, 2, 2, "#fffdf3"); px(p.x + 1, p.y - 2, 2, 2, "#f4f0e0");
});
movel(10, 10, 1, 1, () => { // caixa de correio
  caixa(10.45, 10.45, 0.1, 0.1, 8, METAL);
  caixa(10.2, 10.25, 0.6, 0.5, 7, { topo: "#e05a4a", esq: "#a03030", dir: "#c0392b" }, 8);
  const p = iso(10.5, 10.75, 12); px(p.x - 2, p.y, 4, 1, "#5a1a1a");
  const f = iso(10.8, 10.4, 14); px(f.x, f.y - 3, 1, 4, "#5a5a62"); px(f.x + 1, f.y - 3, 2, 2, estado.correioCheio ? "#f2b544" : "#c0392b"); // bandeirinha
  if (estado.correioCheio) { const q = iso(10.5, 10.5, 15); px(q.x - 3, q.y - 3, 4, 3, "#fffdf3"); px(q.x, q.y - 4, 4, 3, "#f4f0e0"); }
});
movel(5, 9, 1, 1, () => { // vaso com planta
  caixa(5.3, 9.3, 0.4, 0.4, 5, { topo: "#7a4020", esq: "#a0552d", dir: "#8a4a26" });
  const p = iso(5.5, 9.5, 5); px(p.x - 3, p.y - 7, 6, 6, "#3f8f4a"); px(p.x - 1, p.y - 9, 2, 3, "#5fbf6a"); px(p.x - 4, p.y - 4, 2, 2, "#4fa85a");
});

// ---------- Sala de descanso ----------
movel(12, 0, 3, 1, t => { // balcão com a cafeteira expresso
  caixa(12.05, 0.1, 2.9, 0.8, 11, { topo: "#b8875a", esq: "#7a5230", dir: "#8f6038" });
  caixa(12.25, 0.25, 0.6, 0.5, 9, { topo: "#d8dde6", esq: "#a8adb8", dir: "#bfc4cf" }, 11);
  const b = iso(12.55, 0.75, 13); px(b.x - 1, b.y, 2, 2, "#ff4a4a");
  const v = iso(12.55, 0.5, 20); if (Math.floor(t / 450) % 2) px(v.x, v.y - 3, 1, 2, "#e0e0e0"); else px(v.x + 1, v.y - 4, 1, 2, "#e0e0e0");
  for (const [i, cor] of [[13.3, "#ffffff"], [13.7, "#f2b544"], [14.1, "#5aa7ef"]]) { const c = iso(i, 0.6, 11); px(c.x - 1, c.y - 3, 3, 3, cor); }
  const g = iso(14.6, 0.5, 11); px(g.x - 1, g.y - 5, 3, 5, "#8a5a3a");
});
movel(15, 0, 1, 1, () => { // geladeira com adesivos
  caixa(15.08, 0.1, 0.84, 0.8, 36, { topo: "#f4f7fb", esq: "#c8ccd6", dir: "#dde1ea" });
  const a = iso(15.1, 0.9, 20); px(a.x + 1, a.y, 6, 1, "#a8acb6");
  const s = iso(15.3, 0.9, 28); px(s.x, s.y, 2, 2, "#ff6b6b"); px(s.x + 3, s.y + 3, 2, 2, "#4d96ff"); px(s.x + 1, s.y + 9, 3, 2, "#ffd93d");
});
movel(17, 2, 1, 1, t => { // fliperama
  caixa(17.08, 2.1, 0.84, 0.8, 30, { topo: "#4a2a7a", esq: "#2a1a5a", dir: "#3a1a6a" });
  const s0 = iso(17.15, 2.9, 24), s1 = iso(17.85, 2.9, 24);
  poligono([s0, s1, { x: s1.x, y: s1.y - 8 }, { x: s0.x, y: s0.y - 8 }], Math.floor(t / 300) % 2 ? "#1a8a4a" : "#1a5a8a");
  px(s0.x + 2 + (Math.floor(t / 250) % 3), s0.y - 5, 2, 2, "#ffd93d");
  const c = iso(17.5, 2.95, 16); px(c.x - 3, c.y, 1, 2, "#ff4a4a"); px(c.x + 1, c.y, 2, 2, "#4dff8a");
});
// Sofá e pufe bloqueiam a passagem, mas a busca de caminho deixa
// alguém chegar neles quando é o destino (para sentar)
for (let i = 13; i <= 15; i++) movel(i, 6, 1, 1, () => { // sofá (3 lugares), virado para a TV
  caixa(i, 6.15, 1, 0.7, 6, { topo: "#c75a4a", esq: "#8f3a2f", dir: "#a8483b" });
  caixa(i, 6.6, 1, 0.3, 13, { topo: "#b0473a", esq: "#7a2f26", dir: "#94402f" });
});
movel(17, 9, 1, 1, () => { // pufe
  caixa(17.1, 9.1, 0.8, 0.8, 6, { topo: "#6aa8ff", esq: "#3a6ad0", dir: "#4d80e8" });
});
movel(12, 9, 1, 1, () => { // mesinha com pizza
  caixa(12.15, 9.15, 0.7, 0.7, 8, { topo: "#83552e", esq: "#5a3a20", dir: "#6e4826" });
  const p = iso(12.5, 9.5, 8); px(p.x - 4, p.y - 2, 8, 3, "#e2b866"); px(p.x - 2, p.y - 1, 1, 1, "#c0392b"); px(p.x + 2, p.y - 2, 1, 1, "#c0392b");
});
movel(17, 10, 1, 1, () => { // planta
  caixa(17.3, 10.3, 0.4, 0.4, 5, { topo: "#7a4020", esq: "#a0552d", dir: "#8a4a26" });
  const p = iso(17.5, 10.5, 5); px(p.x - 3, p.y - 8, 6, 7, "#3f8f4a"); px(p.x - 5, p.y - 6, 3, 4, "#4fa85a");
});
// ---------- Lugares de trabalho e de descanso ----------
// dir: para onde o personagem olha ("nx" = gx-, "ny" = gy-, "px" = gx+, "py" = gy+)
const sentar = (mesa, extra = {}) => ({ gx: MESAS[mesa].cadeira[0], gy: MESAS[mesa].cadeira[1], dir: "ny", mesa, ...extra });

// Cada tipo de trabalho do agente acontece num lugar do escritório
export const ESTACOES = {
  pensar:   sentar("agente"),                                        // o modelo decidindo o próximo passo
  buscar:   sentar("busca"),                                         // buscar_vagas_gupy / buscar_vagas_remotive
  linkedin: { gx: 1, gy: 5, dir: "nx", celular: true },              // ler_alertas_linkedin (celular, perto da janela)
  ler:      sentar("analise"),                                       // ver_detalhes_vaga
  nota:     { gx: 2, gy: 1, dir: "ny", fala: "Atualizando o quadro de notas" }, // registrar_avaliacao
  enviar:   sentar("envio"),                                         // montando o e-mail
  correio:  { gx: 9, gy: 10, dir: "px" },                            // levando as vagas até a caixa de correio
  // lugares extras para a rotina "ao vivo" e para o chefe
  arquivo:  { gx: 9, gy: 1, dir: "ny", fala: "Arquivando vagas" },
  servidor: { gx: 1, gy: 8, dir: "nx", fala: "Conferindo os servidores" },
  impressora: { gx: 5, gy: 1, dir: "ny", fala: "Imprimindo o relatório" },
  chefe:    sentar("chefe"),
  visita:   { gx: 4, gy: 4, dir: "ny", fala: "E aí, achou alguma boa?" },
};
export const DESCANSO = [
  { gx: 12, gy: 1, dir: "ny", acao: "cafe", fala: "☕ Expresso duplo" },
  { gx: 13, gy: 1, dir: "ny", acao: "cafe", fala: "Cadê o leite?" },
  { gx: 15, gy: 1, dir: "ny", acao: "geladeira", fala: "Quem comeu minha pizza?" },
  { gx: 13, gy: 6, dir: "ny", acao: "sofa", fala: "Esse episódio é bom!" },
  { gx: 14, gy: 6, dir: "ny", acao: "sofa", fala: "Mais um e eu volto" },
  { gx: 15, gy: 6, dir: "ny", acao: "sofa" },
  { gx: 17, gy: 3, dir: "ny", acao: "fliperama", fala: "Recorde!" },
  { gx: 17, gy: 9, dir: "py", acao: "dormir", fala: "zzz" },
  { gx: 13, gy: 9, dir: "nx", acao: "pizza", fala: "Última fatia é minha" },
  { gx: 16, gy: 3, dir: "ny", acao: "tv", fala: "Esse anime é muito bom" },
];

// =============================================================
// 3. BUSCA DE CAMINHO (BFS na grade)
// =============================================================
export function caminho(de, para) {
  const chave = (x, y) => x * 100 + y;
  const fila = [[de.gx, de.gy]], veio = new Map([[chave(de.gx, de.gy), null]]);
  while (fila.length) {
    const [x, y] = fila.shift();
    if (x === para.gx && y === para.gy) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = chave(nx, ny);
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= LINHAS || veio.has(k)) continue;
      if (bloqueado[nx][ny] && !(nx === para.gx && ny === para.gy)) continue;
      veio.set(k, [x, y]); fila.push([nx, ny]);
    }
  }
  const passos = [];
  let atual = [para.gx, para.gy];
  if (!veio.has(chave(...atual))) return [];
  while (atual && !(atual[0] === de.gx && atual[1] === de.gy)) { passos.unshift({ gx: atual[0], gy: atual[1] }); atual = veio.get(chave(...atual)); }
  return passos;
}

// =============================================================
// 4. CENÁRIO (piso e paredes)
// =============================================================
const horaManaus = () => { const a = new Date(); return { h: (a.getUTCHours() + 20) % 24, m: a.getUTCMinutes() }; };

// Fonte de 3x5 pixels para o letreiro em neon (1 = pixel aceso)
const LETRAS = {
  A: ["010", "101", "111", "101", "101"], G: ["011", "100", "101", "101", "011"], E: ["111", "100", "110", "100", "111"],
  N: ["101", "111", "111", "111", "101"], T: ["111", "010", "010", "010", "010"], R: ["110", "101", "110", "101", "101"],
  H: ["101", "101", "111", "101", "101"], "-": ["000", "000", "111", "000", "000"],
};
function neon(texto, t0, z, cor, t) {
  const liga = Math.floor(t / 2600) % 9 !== 0 || (t % 2600) > 120; // de vez em quando o neon "falha"
  [...texto].forEach((ch, ci) => LETRAS[ch]?.forEach((linha, row) => [...linha].forEach((b, col) => {
    if (b !== "1") return;
    const p = naParede("x", t0 + (ci * 4 + col) / 8, z - row);
    if (liga) { ctx.globalAlpha = 0.35; px(p.x - 1, p.y, 3, 1, cor); px(p.x, p.y - 1, 1, 3, cor); ctx.globalAlpha = 1; }
    px(p.x, p.y, 1, 1, liga ? "#fff4fb" : "#6a4a5a");
  })));
}

function desenharPisoEParedes(t, notas) {
  // ----- Piso -----
  for (let gx = 0; gx < COLS; gx++) for (let gy = 0; gy < LINHAS; gy++) {
    const A = iso(gx, gy), B = iso(gx + 1, gy), C = iso(gx + 1, gy + 1), D = iso(gx, gy + 1);
    let cor;
    const tapeteChefe = gx >= 1 && gx <= 5 && gy >= 5 && gy <= 8;
    if (tapeteChefe) cor = gx === 1 || gx === 5 || gy === 5 || gy === 8 ? "#5e2636" : (gx + gy) % 2 ? "#74324a" : "#7c3850";
    else if (gx < DIVISA) cor = (gx + gy) % 2 ? "#4b5a6e" : "#52627a";
    else if (gx >= 13 && gx <= 16 && gy >= 4 && gy <= 8) cor = (gx + gy) % 2 ? "#3a8a90" : "#43979d";
    else cor = gy % 2 ? "#8a5f3c" : "#956843";
    poligono([A, B, C, D], cor);
    // textura: um pontinho de carpete ou um veio de madeira em cada tile
    const c = iso(gx + 0.5, gy + 0.5);
    if (gx < DIVISA && !tapeteChefe) px(c.x - 2, c.y, 1, 1, "#5c6c86");
    if (gx > DIVISA && !(gx >= 13 && gx <= 16 && gy >= 4 && gy <= 8)) px(c.x - 3, c.y - 1, 4, 1, "#7a5232");
    if (tapeteChefe && !(gx === 1 || gx === 5 || gy === 5 || gy === 8)) px(c.x - 1, c.y - 1, 2, 1, "#d4a017");
  }

  const { h, m } = horaManaus(), dia = h >= 6 && h < 18;

  // Luz no chão: da janela durante o dia, das luminárias do teto à noite
  ctx.globalAlpha = dia ? 0.13 : 0.07;
  if (dia) poligono([iso(0, 1.8), iso(0, 5.2), iso(3.2, 6.4), iso(3.2, 3.0)], "#fff2b0");
  else for (const [cx, cy] of [[3, 4], [8, 4], [5, 8]]) poligono([iso(cx - 1.4, cy - 1.4), iso(cx + 1.4, cy - 1.4), iso(cx + 1.4, cy + 1.4), iso(cx - 1.4, cy + 1.4)], "#ffe9a8");
  ctx.globalAlpha = 1;

  // ----- Paredes do fundo (esquerda: gx = 0; trás: gy = 0) -----
  const O = iso(0, 0), Lb = iso(0, LINHAS), Rb = iso(COLS, 0), Ld = iso(DIVISA, 0);
  const up = p => ({ x: p.x, y: p.y - ALTURA_PAREDE });
  poligono([O, Lb, up(Lb), up(O)], "#363d5c");                 // parede esquerda
  poligono([O, Ld, up(Ld), up(O)], "#3f4769");                 // parede de trás do escritório
  poligono([Ld, Rb, up(Rb), up(Ld)], "#5e4266");               // parede de trás da sala de descanso
  // lambri (painéis de madeira na parte de baixo) com frisos e um rodapé
  quadroParede("y", 0, LINHAS, 0, 15, "#2e3452"); quadroParede("x", 0, DIVISA, 0, 15, "#343b5c"); quadroParede("x", DIVISA, COLS, 0, 15, "#4a3050");
  quadroParede("y", 0, LINHAS, 15, 16.5, "#525a80"); quadroParede("x", 0, DIVISA, 15, 16.5, "#5a6390"); quadroParede("x", DIVISA, COLS, 15, 16.5, "#7a5a82");
  for (let i = 1; i < LINHAS; i++) quadroParede("y", i, i + 0.07, 3, 13, "#272c46");
  for (let i = 1; i < COLS; i++) if (i !== DIVISA) quadroParede("x", i, i + 0.07, 3, 13, i < DIVISA ? "#2c3250" : "#3e2644");
  quadroParede("y", 0, LINHAS, 0, 3, "#22263a"); quadroParede("x", 0, COLS, 0, 3, "#22263a");
  poligono([up(Lb), up(O), up(Rb), { x: up(Rb).x, y: up(Rb).y - 2 }, { x: up(O).x, y: up(O).y - 2 }, { x: up(Lb).x, y: up(Lb).y - 2 }], "#22263a");

  // ----- Parede esquerda: janela com a hora real de Manaus -----
  quadroParede("y", 1.6, 5.4, 17, 44, "#22263a");
  quadroParede("y", 1.8, 5.2, 19, 42, dia ? "#7cc4f0" : "#1d2450");
  quadroParede("y", 1.8, 5.2, 19, 27, dia ? "#5a8fc8" : "#262c58");
  // prédios ao longe (com janelinhas acesas à noite)
  for (const [g0, g1, alt] of [[1.9, 2.5, 30], [2.6, 3.0, 35], [3.7, 4.3, 32], [4.5, 5.1, 29]]) {
    quadroParede("y", g0, g1, 19, alt, dia ? "#4e7aa8" : "#262c58");
    if (!dia) for (let z = 22; z < alt - 2; z += 4) pixelParede("y", g0 + 0.2, z, 1, 1, (z * 7 + g0 * 10) % 3 < 1 ? "#3a3f6a" : "#ffd76a");
  }
  if (dia) pixelParede("y", 4.6, 39, 4, 4, "#ffe27a");
  else { pixelParede("y", 4.6, 39, 3, 3, "#eeeeee"); pixelParede("y", 4.75, 39, 2, 2, "#1d2450"); pixelParede("y", 2.2, 40, 1, 1, "#fff"); pixelParede("y", 3.1, 38, 1, 1, "#fff"); }
  quadroParede("y", 3.45, 3.55, 19, 42, "#22263a");          // divisória do vidro
  quadroParede("y", 1.8, 5.2, 39, 42, "#c8ccd6");            // persiana enrolada
  for (const z of [37.5, 36]) quadroParede("y", 1.8, 5.2, z, z + 0.6, "#a8adb8");
  quadroParede("y", 1.5, 5.5, 16, 17.5, "#d8dde6");          // parapeito

  // diplomas acima da estante
  for (const g of [6.15, 7.05]) {
    quadroParede("y", g, g + 0.75, 37, 46, "#d4a017"); quadroParede("y", g + 0.08, g + 0.67, 38, 45, "#fffdf3");
    pixelParede("y", g + 0.2, 43, 3, 1, "#8a8a92"); pixelParede("y", g + 0.2, 41, 2, 1, "#8a8a92"); pixelParede("y", g + 0.5, 40, 2, 2, "#c0392b");
  }

  // TV na parede com um dashboard de BI (animado)
  quadroParede("y", 8.0, 10.6, 29, 47, "#111118");
  quadroParede("y", 8.12, 10.48, 30.5, 45.5, "#14213d");
  for (let i = 0; i < 6; i++) {
    const alt = 3 + Math.round(5 * (0.5 + 0.5 * Math.sin(t / 900 + i * 1.3))), p = naParede("y", 8.35 + i * 0.22, 32);
    px(p.x, p.y - alt, 1, alt, i % 2 ? "#4dd0e1" : "#f2b544");
  }
  for (let i = 0; i < 7; i++) { const p = naParede("y", 9.75 + i * 0.1, 39 + Math.round(2 * Math.sin(t / 700 + i))); px(p.x, p.y, 1, 1, "#5ad17a"); }
  pixelParede("y", 9.75, 44, 4, 1, "#ffffff"); pixelParede("y", 8.25, 44, 3, 1, "#bfe8ff");
  if (Math.floor(t / 600) % 2) pixelParede("y", 10.3, 44.5, 1, 1, "#ff4a4a");

  // ----- Parede de trás -----
  // letreiro em neon
  neon("AGENTE-RH", 1.35, 48, "#ff5fae", t);
  // quadro branco com as notas reais
  quadroParede("x", 1.2, 4.8, 18, 41, "#22263a");
  quadroParede("x", 1.4, 4.6, 20, 39, "#f4f4ee");
  quadroParede("x", 1.4, 4.6, 18.5, 19.5, "#8a8a92");          // canaleta dos pincéis
  pixelParede("x", 2.0, 20, 2, 1, "#c0392b"); pixelParede("x", 2.4, 20, 2, 1, "#2c6ac8");
  pixelParede("x", 1.6, 37, 6, 1, "#7a7a82"); pixelParede("x", 1.6, 35, 4, 1, "#b0b0b8");    // "título" no quadro
  notas.slice(0, 6).forEach((n, i) => {
    const alt = Math.max(1, Math.round(n * 1.4)), p = naParede("x", 1.8 + i * 0.45, 23);
    px(p.x, p.y - alt, 3, alt, n >= 8 ? "#3aa35a" : n >= 6.5 ? "#e0a43a" : "#d05050");
  });
  // relógio com a hora real
  const r = naParede("x", 5.6, 35);
  px(r.x - 5, r.y - 5, 11, 11, "#22263a"); px(r.x - 4, r.y - 4, 9, 9, "#f3efe0");
  for (const [dx, dy] of [[0, -3], [3, 0], [0, 3], [-3, 0]]) px(r.x + dx, r.y + dy, 1, 1, "#9a9aa2");
  const ponteiro = (ang, tam, cor) => { for (let i = 0; i <= tam; i++) px(r.x + Math.round(Math.sin(ang) * i), r.y - Math.round(Math.cos(ang) * i), 1, 1, cor); };
  ponteiro(((h % 12) + m / 60) / 12 * Math.PI * 2, 2, "#22263a"); ponteiro(m / 60 * Math.PI * 2, 3, "#c0392b");
  // pôster do herói mascarado (original)
  quadroParede("x", 6.6, 8.2, 16, 44, "#1b1b2a"); quadroParede("x", 6.75, 8.05, 18, 42, "#2c4a9a");
  quadroParede("x", 6.75, 8.05, 18, 22, "#1b2a6a");
  pixelParede("x", 7.1, 38, 4, 4, "#f1c27d"); pixelParede("x", 7.1, 37, 4, 1, "#c0392b"); pixelParede("x", 7.2, 37, 1, 1, "#fff"); pixelParede("x", 7.55, 37, 1, 1, "#fff");
  pixelParede("x", 7.0, 33, 6, 7, "#c0392b"); pixelParede("x", 7.3, 31, 2, 2, "#ffd93d"); pixelParede("x", 6.85, 33, 1, 10, "#ffd93d"); pixelParede("x", 7.8, 33, 1, 10, "#ffd93d");
  // mural de cortiça com recados, acima do arquivo
  quadroParede("x", 8.9, 10.8, 30, 46, "#6e4826"); quadroParede("x", 9.0, 10.7, 31, 45, "#c8955a");
  for (const [g, z, cor] of [[9.15, 43, "#fff59a"], [9.6, 41, "#ff9ac8"], [10.1, 44, "#9ae0ff"], [9.3, 37, "#ffffff"], [10.0, 38, "#fff59a"], [9.7, 35, "#b8f0a0"]]) {
    quadroParede("x", g, g + 0.45, z - 4, z, cor); pixelParede("x", g + 0.2, z, 1, 1, "#c0392b");
  }

  // ----- Sala de descanso: máscaras, TV com anime, luzinhas -----
  pixelParede("x", 11.6, 38, 7, 5, "#c0392b"); pixelParede("x", 11.7, 36, 2, 1, "#fff"); pixelParede("x", 12.05, 36, 2, 1, "#fff");
  pixelParede("x", 12.6, 39, 7, 7, "#d4a017"); pixelParede("x", 12.7, 36, 2, 1, "#2a2a2a"); pixelParede("x", 13.1, 36, 2, 1, "#2a2a2a");
  pixelParede("x", 13.6, 40, 7, 8, "#2c3e50"); pixelParede("x", 13.7, 39, 5, 4, "#8ad8ff");
  quadroParede("x", 16.1, 17.9, 20, 40, "#111111");
  quadroParede("x", 16.2, 17.8, 22, 38, "#3a6ad8");
  quadroParede("x", 16.2, 17.8, 22, 26, "#2e8b57");
  const qt = Math.floor(t / 700) % 3, rosto = naParede("x", 16.75, 34);
  px(rosto.x, rosto.y, 7, 6, "#f5d0a9"); px(rosto.x - 1, rosto.y - 2, 9, 3, ["#ff8ac2", "#ffd93d", "#7a5cff"][qt]);
  px(rosto.x + 1, rosto.y + 2, 2, 2, "#2a2a6a"); px(rosto.x + 4, rosto.y + 2, 2, 2, "#2a2a6a");
  if (qt === 2) { const b = naParede("x", 17.4, 36); px(b.x, b.y, 1, 1, "#fff"); px(b.x - 9, b.y + 3, 1, 1, "#fff"); }
  for (let i = 0; i < 14; i++) {
    const p = naParede("x", DIVISA + 0.3 + i * 0.5, 46 - (i % 2));
    px(p.x, p.y, 2, 2, Math.floor(t / 500 + i) % 3 ? ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff"][i % 4] : "#555");
  }
}

// =============================================================
// 5. PERSONAGENS (7 x 14 pixels)
// =============================================================

// O agente de IA é um robozinho: assim fica claro quem é a IA
function desenharRobo(P, ag, t, x, y) {
  const costas = ag.dir === "nx" || ag.dir === "ny";
  const anda = ag.andando ? Math.floor(t / 140) % 2 : 0;
  const sentado = ag.sentado || ag.pose === "sofa" || ag.pose === "dormir";
  const dormindo = ag.pose === "dormir";
  const digita = ag.digitando ? Math.floor(t / 120) % 2 : 0;
  const bx = Math.round(x) - 3, top = Math.round(y) - 14 + (sentado ? 3 : 0);
  const metal = "#c9d2de", sombra = "#8e9aaa", visor = "#1d2433";

  P(bx + 1, Math.round(y) - 1, 5, 2, "rgba(0,0,0,.25)");
  // antena com luz (pisca rápido quando está trabalhando)
  P(bx + 3, top - 2, 1, 2, sombra);
  P(bx + 3, top - 3, 1, 1, ag.ativo ? (Math.floor(t / 200) % 2 ? "#5ad17a" : "#f2b544") : "#5a6170");
  // pernas
  if (!sentado) { P(bx + 1, top + 11, 2, anda ? 2 : 3, sombra); P(bx + 4, top + 11, 2, anda ? 3 : 2, sombra); P(bx + 1, top + 13 - (anda ? 1 : 0), 2, 1, "#4a5260"); P(bx + 4, top + 13 - (anda ? 0 : 1), 2, 1, "#4a5260"); }
  else if (!costas) { P(bx + 1, top + 11, 5, 1, sombra); }
  // corpo com o crachá "RH" e luz no peito
  P(bx + 1, top + 6, 5, 5, metal); P(bx + 1, top + 10, 5, 1, sombra);
  if (!costas) { P(bx + 2, top + 7, 3, 2, "#2f3b55"); P(bx + 3, top + 7, 1, 1, ag.ativo ? "#5ad17a" : "#3a4a6a"); }
  // braços
  P(bx, top + 6 + (digita ? 1 : 0), 1, 4, sombra); P(bx + 6, top + 6 + (digita ? 0 : 1), 1, 4, sombra);
  // cabeça com visor
  P(bx, top, 7, 6, metal); P(bx, top + 5, 7, 1, sombra);
  if (!costas) {
    P(bx + 1, top + 1, 5, 3, visor);
    if (dormindo) { P(bx + 2, top + 2, 1, 1, "#3a6a8a"); P(bx + 4, top + 2, 1, 1, "#3a6a8a"); }
    else {
      const olhar = ag.digitando ? Math.floor(t / 260) % 2 : 0; // olhos "lendo" a tela
      const cor = ag.ativo ? "#7fe0ff" : "#4aa8d0";
      if ((t + ag.semente) % 3000 > 120) { P(bx + 2 + olhar, top + 2, 1, 1, cor); P(bx + 4 + olhar, top + 2, 1, 1, cor); }
    }
  }
  if (ag.celular) P(bx + 6, top + 6, 2, 3, "#222");
  if (ag.carregando) { P(bx + 5, top + 7, 4, 3, "#fffdf3"); P(bx + 6, top + 8, 2, 1, "#c0392b"); }
  if (ag.pose === "cafe" || ag.segurandoCafe) { P(bx + 6, top + 7, 3, 3, "#fff"); P(bx + 7, top + 7, 1, 1, "#6e4826"); }
}

export function desenharPessoa(alvo, d, ag, t, x, y) {
  const P = (a, b, w, h, cor) => { alvo.fillStyle = cor; alvo.fillRect(Math.round(a), Math.round(b), w, h); };
  if (d.tipo === "robo") return desenharRobo(P, ag, t, x, y);
  const costas = ag.dir === "nx" || ag.dir === "ny";
  const espelho = ag.dir === "py" || ag.dir === "nx"; // olhando para a esquerda da tela
  const anda = ag.andando ? Math.floor(t / 140) % 2 : 0;
  const sentado = ag.sentado || ag.pose === "sofa" || ag.pose === "dormir";
  const dormindo = ag.pose === "dormir";
  const digita = ag.digitando ? Math.floor(t / 130) % 2 : 0;
  const bx = Math.round(x) - 3, top = Math.round(y) - 14 + (sentado ? 3 : 0);

  P(bx + 1, Math.round(y) - 1, 5, 2, "rgba(0,0,0,.25)"); // sombra
  // pernas
  if (sentado) { if (!costas) { P(bx + 1, top + 11, 5, 1, d.calca); P(bx + 1, top + 12, 2, 1, "#1b1b1b"); P(bx + 4, top + 12, 2, 1, "#1b1b1b"); } }
  else {
    P(bx + 1, top + 11, 2, anda ? 2 : 3, d.calca); P(bx + 4, top + 11, 2, anda ? 3 : 2, d.calca);
    P(bx + 1, top + 13 - (anda ? 1 : 0), 2, 1, "#1b1b1b"); P(bx + 4, top + 13 - (anda ? 0 : 1), 2, 1, "#1b1b1b");
  }
  // corpo e braços
  if (d.oversize) {
    // camiseta oversize: mais larga, mais comprida e com mangas largas
    P(bx, top + 6, 7, 6, d.camisa); P(bx - 1, top + 6, 1, 3, d.camisa); P(bx + 7, top + 6, 1, 3, d.camisa);
    if (!costas) { // estampa de espada (genérica), apontando para baixo
      P(bx + 3, top + 7, 1, 1, "#8a6a3a"); P(bx + 2, top + 8, 3, 1, "#7a7a82"); P(bx + 3, top + 9, 1, 3, "#e4e4ea"); P(bx + 5, top + 10, 1, 1, "#b03030");
    }
    P(bx - 1, top + 9 + (digita ? 1 : 0), 1, 2, d.pele); P(bx + 7, top + 9 + (digita ? 0 : 1), 1, 2, d.pele);
  } else {
    P(bx + 1, top + 6, 5, 5, d.camisa);
    if (d.gravata && !costas) P(bx + 3, top + 6, 1, 4, d.gravata);
    P(bx, top + 6 + (digita ? 1 : 0), 1, 4, d.camisa); P(bx + 6, top + 6 + (digita ? 0 : 1), 1, 4, d.camisa);
    P(bx, top + 10 + (digita ? 1 : 0), 1, 1, d.pele); P(bx + 6, top + 10 + (digita ? 0 : 1), 1, 1, d.pele);
  }
  // cabeça
  const hx = bx + (dormindo ? 1 : 0), ht = top;
  P(hx + 1, ht + 1, 5, 5, d.pele); P(hx + 1, ht, 5, 2, d.cabelo);
  if (d.cabeloLongo) { P(hx, ht + 1, 1, 5, d.cabelo); P(hx + 6, ht + 1, 1, 5, d.cabelo); }
  if (d.coque) { P(hx, ht, 7, 2, d.cabelo); P(hx + 2, ht - 2, 3, 2, d.cabelo); }
  if (costas) P(hx + 1, ht + 1, 5, 4, d.cabelo);
  else if (dormindo) { P(hx + 2, ht + 3, 1, 1, "#7a5a3a"); P(hx + 4, ht + 3, 1, 1, "#7a5a3a"); }
  else {
    const o = espelho ? -1 : 1, olhos = d.olhos ?? "#1b1b1b";
    if ((t + ag.semente) % 3300 > 140) { P(hx + 2 + (o > 0 ? 1 : 0), ht + 3, 1, 1, olhos); P(hx + 4 + (o > 0 ? 1 : 0) - (o < 0 ? 1 : 0), ht + 3, 1, 1, olhos); }
    if (d.cavanhaque) { P(hx + 2 + (o > 0 ? 1 : 0), ht + 4, 3, 1, d.cabelo); P(hx + 3 + (o > 0 ? 1 : 0), ht + 5, 1, 1, d.cabelo); }
    else P(hx + 3 + (o > 0 ? 1 : 0), ht + 5, 1, 1, "#c07a5a");
  }
  // acessórios
  if (d.acessorio === "oculos" && !costas && !dormindo) { P(hx + 1, ht + 3, 5, 1, "#1b1b1b"); P(hx + 2, ht + 3, 1, 1, "#9fd8ff"); P(hx + 4, ht + 3, 1, 1, "#9fd8ff"); }
  if (d.acessorio === "bone") { P(hx + 1, ht - 1, 5, 2, "#0a66c2"); if (!costas) P(hx + (espelho ? -1 : 4), ht + 1, 3, 1, "#0a66c2"); }
  if (d.acessorio === "fone") { P(hx, ht + 1, 1, 4, "#dcdcdc"); P(hx + 6, ht + 1, 1, 4, "#dcdcdc"); P(hx + 1, ht - 1, 5, 1, "#dcdcdc"); }
  if (d.acessorio === "lupa" && ag.ativo && !sentado && !costas) { P(bx + 7, top + 5, 3, 3, "#cfcfcf"); P(bx + 8, top + 6, 1, 1, "#bfe8ff"); P(bx + 7, top + 8, 1, 2, "#7a5230"); }
  if (ag.pose === "cafe" || ag.segurandoCafe) { P(bx + 6, top + 7, 3, 3, "#fff"); P(bx + 7, top + 7, 1, 1, "#6e4826"); }
  if (ag.celular) P(bx + 6, top + 6, 2, 3, "#222");
  if (ag.carregando) { P(bx + 5, top + 7, 4, 3, "#fffdf3"); P(bx + 6, top + 8, 2, 1, "#c25b8a"); }
}

// =============================================================
// 6. QUADRO COMPLETO
// =============================================================
export const estado = { imprimindo: false, correioCheio: false };

export function desenharCena(t, pessoas, equipe, notas) {
  ctx.fillStyle = "#14151d"; ctx.fillRect(0, 0, W, H);
  desenharPisoEParedes(t, notas);
  const itens = [
    ...moveis,
    // +0.6: quem está no tile é desenhado depois do móvel/cadeira do mesmo tile
    ...pessoas.map(ag => ({ prof: ag.gx + ag.gy + 0.6, desenhar: () => { const c = centro(ag.gx, ag.gy); desenharPessoa(ctx, equipe[ag.id], ag, t, c.x, c.y); } })),
  ].sort((a, b) => a.prof - b.prof);
  for (const it of itens) it.desenhar(t);
}
