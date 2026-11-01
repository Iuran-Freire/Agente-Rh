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
function movel(gx, gy, w, d, desenhar, bloqueia = true) {
  moveis.push({ prof: gx + w - 1 + gy + d - 1 + 0.4, desenhar });
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

for (const [id, m] of Object.entries(MESAS)) {
  movel(m.gx, m.gy, m.w, 1, t => {
    const madeira = m.balcao ? { topo: "#c99ab8", esq: "#9a6a8a", dir: "#b07a9a" } : m.chefe ? { topo: "#a06a40", esq: "#6e4826", dir: "#83552e" } : { topo: "#d29a5c", esq: "#9c6a3a", dir: "#b07a45" };
    caixa(m.gx + 0.05, m.gy + 0.1, m.w - 0.1, 0.8, 9, madeira);
    // monitor virado para a cadeira (a tela fica de frente para nós)
    const mx = m.gx + (m.w === 3 ? 1.2 : 0.4);
    caixa(mx, m.gy + 0.25, 0.9, 0.15, 7, { topo: "#2b2d38", esq: "#2b2d38", dir: "#1e2028" }, 9);
    const ligada = telaAtiva[id];
    const s0 = iso(mx + 0.08, m.gy + 0.4, 10), s1 = iso(mx + 0.82, m.gy + 0.4, 10);
    poligono([s0, s1, { x: s1.x, y: s1.y - 5 }, { x: s0.x, y: s0.y - 5 }], ligada ? (Math.floor(t / 300) % 2 ? "#7fe0ff" : "#5cc8ef") : "#3a3f52");
    if (ligada) { px(s0.x + 2, s0.y - 3, 4, 1, "#e8fbff"); px(s0.x + 2, s0.y - 1 - (Math.floor(t / 200) % 2), 6, 1, "#e8fbff"); }
    // teclado
    const k = iso(mx + 0.3, m.gy + 0.75, 9); px(k.x - 3, k.y - 1, 6, 2, "#cfd3dc");
    if (m.chefe) { // caneca "melhor chefe" e plaquinha dourada
      const c = iso(m.gx + 0.4, m.gy + 0.6, 9); px(c.x, c.y - 4, 3, 4, "#fff"); px(c.x + 1, c.y - 3, 1, 1, "#c0392b"); px(c.x + 3, c.y - 3, 1, 2, "#fff");
      const p = iso(m.gx + 2.4, m.gy + 0.7, 9); px(p.x - 3, p.y - 2, 6, 2, "#d4a017");
    }
    if (m.balcao) { const e = iso(m.gx + 2.3, m.gy + 0.5, 9); px(e.x, e.y - 3, 4, 3, "#fffdf3"); px(e.x + 2, e.y - 5, 4, 3, "#f4f0e0"); }
    if (id === "analise" && ligada && Math.floor(t / 350) % 2) { const p = iso(m.gx + 1.5, m.gy + 0.6, 9); px(p.x, p.y - 3, 4, 2, "#fffdf3"); }
  });
  // cadeira (só o assento; o personagem senta em cima)
  const [cx, cy] = m.cadeira;
  movel(cx, cy, 1, 1, () => {
    caixa(cx + 0.25, cy + 0.25, 0.5, 0.5, 4, { topo: "#3a3f52", esq: "#2a2e3c", dir: "#323646" });
  }, false);
}

// ---------- Escritório ----------
movel(0, 0, 1, 1, () => { // planta grande no canto
  caixa(0.25, 0.25, 0.5, 0.5, 6, { topo: "#7a4020", esq: "#a0552d", dir: "#8a4a26" });
  const p = iso(0.5, 0.5, 6); px(p.x - 4, p.y - 10, 8, 9, "#3f8f4a"); px(p.x - 6, p.y - 7, 3, 5, "#4fa85a"); px(p.x + 3, p.y - 12, 3, 6, "#5fbf6a"); px(p.x - 1, p.y - 14, 2, 4, "#4fa85a");
});
movel(5, 0, 1, 1, t => { // impressora numa mesinha
  caixa(5.1, 0.1, 0.8, 0.8, 8, { topo: "#83552e", esq: "#6e4826", dir: "#7a5030" });
  caixa(5.2, 0.2, 0.6, 0.6, 5, { topo: "#e8ecf2", esq: "#b8bcc6", dir: "#cfd3dc" }, 8);
  const p = iso(5.5, 0.5, 13); px(p.x - 3, p.y - 1, 6, 1, "#2a2a2a");
  if (estado.imprimindo && Math.floor(t / 300) % 2) px(p.x - 2, p.y - 4, 4, 3, "#fffdf3");
});
movel(9, 0, 1, 1, () => { // arquivo de aço
  caixa(9.1, 0.15, 0.8, 0.7, 26, { topo: "#9aa3b2", esq: "#6e7888", dir: "#808a9a" });
  for (let z = 5; z < 26; z += 7) { const a = iso(9.1, 0.85, z), b = iso(9.9, 0.85, z); px((a.x + b.x) / 2 - 2, (a.y + b.y) / 2 - 1, 4, 1, "#3a3f4a"); }
});
movel(0, 8, 1, 2, t => { // rack de servidores com LEDs
  caixa(0.1, 8.1, 0.8, 1.8, 30, { topo: "#2c3244", esq: "#1e2230", dir: "#262b3a" });
  for (let z = 4; z < 29; z += 4) for (let i = 0; i < 3; i++) {
    const p = iso(0.9, 8.4 + i * 0.5, z);
    px(p.x, p.y, 1, 1, Math.floor(t / 180 + z + i * 3) % 3 ? "#5ad17a" : "#1a5a2a");
    if (i === 1) px(p.x - 2, p.y, 1, 1, Math.floor(t / 310 + z) % 4 ? "#f2b544" : "#5a4010");
  }
});
movel(10, 10, 1, 1, () => { // caixa de correio
  caixa(10.2, 10.2, 0.6, 0.6, 12, { topo: "#e05a4a", esq: "#a03030", dir: "#c0392b" });
  const p = iso(10.5, 10.8, 9); px(p.x - 2, p.y, 4, 1, "#5a1a1a");
  if (estado.correioCheio) { const q = iso(10.5, 10.5, 12); px(q.x - 3, q.y - 3, 4, 3, "#fffdf3"); px(q.x, q.y - 4, 4, 3, "#f4f0e0"); }
});
movel(5, 9, 1, 1, () => { // vaso com planta
  caixa(5.3, 9.3, 0.4, 0.4, 5, { topo: "#7a4020", esq: "#a0552d", dir: "#8a4a26" });
  const p = iso(5.5, 9.5, 5); px(p.x - 3, p.y - 7, 6, 6, "#3f8f4a"); px(p.x - 1, p.y - 9, 2, 3, "#5fbf6a");
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

function desenharPisoEParedes(t, notas) {
  // Piso: carpete xadrez no escritório, madeira na sala de descanso, tapete
  for (let gx = 0; gx < COLS; gx++) for (let gy = 0; gy < LINHAS; gy++) {
    const A = iso(gx, gy), B = iso(gx + 1, gy), C = iso(gx + 1, gy + 1), D = iso(gx, gy + 1);
    let cor;
    if (gx < DIVISA) cor = (gx + gy) % 2 ? "#4b5a6e" : "#55657c";
    else if (gx >= 13 && gx <= 16 && gy >= 4 && gy <= 8) cor = (gx + gy) % 2 ? "#3a8a90" : "#43979d";
    else cor = gy % 2 ? "#8a5f3c" : "#956843";
    poligono([A, B, C, D], cor);
  }

  // Paredes do fundo (esquerda: gx = 0; trás: gy = 0)
  const O = iso(0, 0), Lb = iso(0, LINHAS), Rb = iso(COLS, 0), Ld = iso(DIVISA, 0);
  const up = p => ({ x: p.x, y: p.y - ALTURA_PAREDE });
  poligono([O, Lb, up(Lb), up(O)], "#343a58");                 // parede esquerda
  poligono([O, Ld, up(Ld), up(O)], "#3d4466");                 // parede de trás do escritório
  poligono([Ld, Rb, up(Rb), up(Ld)], "#5e4266");               // parede de trás da sala de descanso
  poligono([O, Lb, { x: Lb.x, y: Lb.y - 3 }, { x: O.x, y: O.y - 3 }], "#262a42"); // rodapés
  poligono([O, Rb, { x: Rb.x, y: Rb.y - 3 }, { x: O.x, y: O.y - 3 }], "#262a42");
  poligono([up(Lb), up(O), up(Rb), { x: up(Rb).x, y: up(Rb).y - 2 }, { x: up(O).x, y: up(O).y - 2 }, { x: up(Lb).x, y: up(Lb).y - 2 }], "#22263a");

  // ----- Parede esquerda: janela com a hora real de Manaus -----
  const { h, m } = horaManaus(), dia = h >= 6 && h < 18;
  quadroParede("y", 1.6, 5.4, 16, 42, "#22263a");
  quadroParede("y", 1.8, 5.2, 18, 40, dia ? "#7cc4f0" : "#1d2450");
  quadroParede("y", 1.8, 5.2, 18, 25, dia ? "#5a8fc8" : "#262c58");
  quadroParede("y", 3.45, 3.55, 18, 40, "#22263a");
  if (dia) pixelParede("y", 4.4, 36, 4, 4, "#ffe27a"); else { pixelParede("y", 4.4, 36, 3, 3, "#eeeeee"); pixelParede("y", 2.2, 33, 1, 1, "#fff"); pixelParede("y", 3, 37, 1, 1, "#fff"); }
  // prateleira de colecionáveis geek
  quadroParede("y", 6.4, 9.6, 26, 27.5, "#6e4826");
  // robô gigante
  pixelParede("y", 6.8, 36, 4, 3, "#e8e8f0"); pixelParede("y", 6.8, 33, 5, 5, "#3a5fc0"); pixelParede("y", 6.9, 35, 1, 1, "#3aa3ff"); pixelParede("y", 7.3, 37, 2, 1, "#ffd93d");
  // garota mágica de anime (cabelo rosa)
  pixelParede("y", 7.9, 37, 5, 2, "#ff8ac2"); pixelParede("y", 7.9, 35, 5, 3, "#f5d0a9"); pixelParede("y", 7.7, 35, 1, 5, "#ff8ac2"); pixelParede("y", 8.5, 35, 1, 5, "#ff8ac2"); pixelParede("y", 7.9, 32, 5, 4, "#ffffff"); pixelParede("y", 8.1, 31, 2, 1, "#ff4a8a");
  // capacete espacial e dado de 20 lados
  pixelParede("y", 8.8, 35, 5, 6, "#e8e8f0"); pixelParede("y", 8.9, 33, 3, 3, "#2a2a4a"); pixelParede("y", 9.3, 31, 3, 3, "#9b59b6");

  // ----- Parede de trás: quadro branco com as notas reais -----
  quadroParede("x", 1.2, 4.8, 18, 40, "#22263a");
  quadroParede("x", 1.4, 4.6, 20, 38, "#f4f4ee");
  notas.slice(0, 6).forEach((n, i) => {
    const alt = Math.max(1, Math.round(n * 1.5)), p = naParede("x", 1.8 + i * 0.45, 22);
    px(p.x, p.y - alt, 3, alt, n >= 8 ? "#3aa35a" : n >= 6.5 ? "#e0a43a" : "#d05050");
  });
  // relógio com a hora real
  const r = naParede("x", 5.6, 34);
  px(r.x - 5, r.y - 5, 11, 11, "#22263a"); px(r.x - 4, r.y - 4, 9, 9, "#f3efe0");
  const ponteiro = (ang, tam, cor) => { for (let i = 0; i <= tam; i++) px(r.x + Math.round(Math.sin(ang) * i), r.y - Math.round(Math.cos(ang) * i), 1, 1, cor); };
  ponteiro(((h % 12) + m / 60) / 12 * Math.PI * 2, 2, "#22263a"); ponteiro(m / 60 * Math.PI * 2, 3, "#c0392b");
  // pôster do herói mascarado (original)
  quadroParede("x", 6.6, 8.2, 14, 42, "#1b1b2a"); quadroParede("x", 6.75, 8.05, 16, 40, "#2c4a9a");
  pixelParede("x", 7.1, 36, 4, 4, "#f1c27d"); pixelParede("x", 7.1, 35, 4, 1, "#c0392b"); pixelParede("x", 7.2, 35, 1, 1, "#fff"); pixelParede("x", 7.55, 35, 1, 1, "#fff");
  pixelParede("x", 7.0, 31, 6, 7, "#c0392b"); pixelParede("x", 7.3, 29, 2, 2, "#ffd93d"); pixelParede("x", 6.85, 31, 1, 10, "#ffd93d"); pixelParede("x", 7.8, 31, 1, 10, "#ffd93d");

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
