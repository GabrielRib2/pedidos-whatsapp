// Gera a comanda em PDF (fundo branco, texto preto, fonte monoespaçada, margens mínimas)
// e envia direto para a impressora, sem nenhuma intervenção manual.
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';
import { brl } from './bot.js';

const execFileP = promisify(execFile);

// Medidas em pontos (1 pt = 1/72 pol). `cols` = caracteres por linha (Courier = 0,6 x fonte).
// A4 e A5 têm altura fixa; 80mm (bobina) tem altura calculada pelo conteúdo.
const PAPEIS = {
  A4: { w: 595.28, h: 841.89, margem: 20, fonte: 11, cols: 60 },
  A5: { w: 419.53, h: 595.28, margem: 16, fonte: 10, cols: 50 },
  '80MM': { w: 226.77, h: null, margem: 8, fonte: 8, cols: 40 },
};

// ---------- layout em texto ----------
// Fontes padrão do PDF só têm caracteres Latin-1: remove emojis e símbolos fora disso.
const limpar = (s) => String(s ?? '').normalize('NFC').replace(/[^\x20-\x7E -ÿ]/g, '');

/** Quebra o texto em linhas: a 1ª com largura w1, as demais com w2. */
function quebrar(texto, w1, w2 = w1) {
  const min = Math.min(w1, w2);
  const pedacos = [];
  for (const p of limpar(texto).split(/\s+/).filter(Boolean)) {
    if (p.length <= min) pedacos.push(p);
    else for (let i = 0; i < p.length; i += min) pedacos.push(p.slice(i, i + min));
  }
  const linhas = [];
  let atual = '';
  const larg = () => (linhas.length === 0 ? w1 : w2);
  for (const p of pedacos) {
    const cand = atual ? `${atual} ${p}` : p;
    if (cand.length <= larg()) atual = cand;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual || !linhas.length) linhas.push(atual);
  return linhas;
}

function formatarData(iso) {
  const d = new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.fuso,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
  return d.replace(', ', ' ');
}

export function montarLinhas(p, cols) {
  const L = [];
  const igual = '='.repeat(cols);
  const traco = '-'.repeat(cols);
  const centro = (s) => ' '.repeat(Math.max(0, Math.floor((cols - s.length) / 2))) + s;

  // texto à esquerda + valor alinhado à direita (nome longo quebra em mais linhas)
  const direita = (esq, dir) => {
    const partes = quebrar(esq, cols - dir.length - 1, cols - 3);
    const out = partes.map((l, i) => (i === 0 ? l : '   ' + l));
    out[0] = out[0].padEnd(cols - dir.length) + dir;
    return out;
  };
  // "Rótulo: texto" com recuo nas linhas seguintes
  const campo = (rotulo, texto) =>
    quebrar(texto, cols - rotulo.length).map((l, i) => (i === 0 ? rotulo : ' '.repeat(rotulo.length)) + l);

  L.push(igual);
  L.push(centro(limpar(config.menu.loja.nome).toUpperCase()));
  L.push(igual);
  L.push(...direita(`PEDIDO #${String(p.id).padStart(4, '0')}`, formatarData(p.criadoEm)));
  L.push(traco);
  L.push(...campo('Cliente: ', p.nome));
  L.push(...campo('Fone: ', p.telefone));
  L.push(...campo(p.retirada ? 'Tipo: ' : 'Entrega: ', p.endereco));
  L.push(traco);
  L.push(...direita('QTD ITEM', 'VALOR'));
  L.push(traco);
  for (const i of p.itens) L.push(...direita(`${i.qtd}x ${i.nome}`, brl(i.preco * i.qtd)));
  if (p.observacoes) {
    L.push(traco);
    L.push(...campo('OBS: ', p.observacoes.toUpperCase()));
  }
  L.push(traco);
  L.push(...direita('Subtotal', brl(p.subtotal)));
  if (!p.retirada) L.push(...direita('Taxa de entrega', brl(p.taxaEntrega)));
  L.push(igual);
  L.push(...direita('TOTAL', brl(p.total)));
  L.push(igual);
  return L;
}

// ---------- PDF ----------
export async function gerarComandaPDF(pedido) {
  const papel = PAPEIS[config.papel];
  const linhas = montarLinhas(pedido, papel.cols);
  fs.mkdirSync(config.comandasDir, { recursive: true });

  const stamp = new Date(pedido.criadoEm).toISOString().replace(/[-:]/g, '').slice(0, 15);
  const arquivo = path.join(
    config.comandasDir,
    `pedido-${String(pedido.id).padStart(4, '0')}-${stamp}.pdf`,
  );

  // altura da linha medida num documento temporário (para calcular a altura da bobina)
  const tmp = new PDFDocument({ size: [papel.w, 100] });
  tmp.font('Courier').fontSize(papel.fonte);
  const alturaLinha = tmp.currentLineHeight(true);
  tmp.end();

  const alturaPagina = papel.h ?? papel.margem * 2 + (linhas.length + 3) * alturaLinha;
  const doc = new PDFDocument({
    size: [papel.w, alturaPagina],
    margins: { top: papel.margem, bottom: papel.margem, left: papel.margem, right: papel.margem },
    info: { Title: `Pedido ${pedido.id}` },
  });
  const saida = fs.createWriteStream(arquivo);
  doc.pipe(saida);

  // Tudo em preto sobre branco, sem preenchimentos, sem negrito, sem imagens = mínimo de tinta.
  doc.font('Courier').fontSize(papel.fonte).fillColor('#000000');
  let y = papel.margem;
  for (const linha of linhas) {
    if (y + alturaLinha > alturaPagina - papel.margem) {
      doc.addPage();
      y = papel.margem;
    }
    if (linha) doc.text(linha, papel.margem, y, { lineBreak: false });
    y += alturaLinha;
  }
  doc.end();
  await new Promise((resolve, reject) => {
    saida.on('finish', resolve);
    saida.on('error', reject);
  });
  return arquivo;
}

// ---------- impressão ----------
async function enviarParaImpressora(arquivo) {
  if (process.platform === 'win32') {
    // Windows: pdf-to-printer (usa um leitor de PDF embutido, imprime em silêncio)
    const { print } = await import('pdf-to-printer');
    const opcoes = { scale: 'noscale', monochrome: true };
    if (config.impressora) opcoes.printer = config.impressora; // senão, usa a padrão
    await print(arquivo, opcoes);
  } else {
    // Linux/macOS: comando `lp` do CUPS (usa a impressora padrão se -d não for informado)
    const args = [];
    if (config.impressora) args.push('-d', config.impressora);
    args.push('-o', 'fit-to-page', '-o', 'print-color-mode=monochrome', arquivo);
    await execFileP('lp', args);
  }
}

/** Gera o PDF da comanda e imprime (COPIAS vezes). Devolve o caminho do PDF. */
export async function gerarEImprimir(pedido) {
  const arquivo = await gerarComandaPDF(pedido);
  if (!config.imprimir) {
    console.log(`[impressão] IMPRIMIR=false — PDF gerado, não enviado: ${arquivo}`);
    return arquivo;
  }
  for (let i = 0; i < config.copias; i++) await enviarParaImpressora(arquivo);
  console.log(`[impressão] Pedido #${pedido.id} enviado para a impressora (${config.copias}x).`);
  return arquivo;
}
