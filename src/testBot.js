// Teste sem WhatsApp: simula uma conversa completa, grava no banco e gera o PDF.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

// Usa banco e pasta temporários e NUNCA imprime de verdade.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-teste-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');
process.env.COMANDAS_DIR = path.join(tmp, 'comandas');
process.env.IMPRIMIR = 'false';

const { processarMensagem, mensagemConfirmacao } = await import('./bot.js');
const { salvarPedido, buscarPedido } = await import('./db.js');
const { gerarEImprimir, montarLinhas } = await import('./printer.js');

const chat = '5579999999999@s.whatsapp.net';
const desconhecido = processarMensagem('desconhecido@s.whatsapp.net', 'oi', 'Maria');
assert.equal(desconhecido.enviarCardapio, true);
assert.deepEqual(processarMensagem('desconhecido@s.whatsapp.net', 'qualquer coisa').respostas, []);

const falas = [
  'oi',
  '2x1, 4',
  '1x5, 1x7, 1x6, 1x8',
  'pronto',
  'sem cebola, troco para 100',
  'Maria Silva',
  'Rua das Flores, 123, Centro, apto 4 (perto da padaria)',
  'sim',
];

let confirmado;
for (const fala of falas) {
  console.log(`\n👤 ${fala}`);
  const r = processarMensagem(chat, fala, 'Maria');
  if (fala === 'oi') {
    assert.equal(r.enviarCardapio, true);
    assert.equal(r.respostas.length, 1);
  } else {
    assert.equal(Boolean(r.enviarCardapio), false);
  }
  for (const msg of r.respostas) console.log(`🤖 ${msg}`);
  if (r.pedidoConfirmado) confirmado = r.pedidoConfirmado;
  if (fala === 'oi') assert.deepEqual(processarMensagem(chat, 'texto aleatório').respostas, []);
  if (fala === '2x1, 4') assert.deepEqual(processarMensagem(chat, 'texto aleatório').respostas, []);
  if (fala === 'sem cebola, troco para 100') assert.deepEqual(processarMensagem(chat, 'x').respostas, []);
  if (fala === 'Rua das Flores, 123, Centro, apto 4 (perto da padaria)') {
    assert.deepEqual(processarMensagem(chat, 'talvez').respostas, []);
  }
}

assert.ok(confirmado, 'o pedido deveria ter sido confirmado');
const salvo = salvarPedido({ ...confirmado, telefone: '5579999999999' });
console.log(`\n🤖 ${mensagemConfirmacao(salvo)}`);

const lido = buscarPedido(salvo.id);
assert.equal(lido.itens.length, 6);
assert.equal(lido.total, 93); // Quentinha M, panqueca, refrigerantes, sucos e entrega
assert.deepEqual(
  lido.itens.map(({ codigo, nome }) => [codigo, nome]),
  [
    [1, 'Quentinha M'],
    [4, 'Porção Panqueca de Carne'],
    [5, 'Refrigerante Lata'],
    [7, 'Refrigerante 1L'],
    [6, 'Suco Natural 500ml'],
    [8, 'Suco Natural 1L'],
  ],
);
assert.equal(lido.nome, 'Maria Silva');

const pdf = await gerarEImprimir(salvo);
assert.ok(fs.existsSync(pdf) && fs.statSync(pdf).size > 500, 'PDF não foi gerado');
const linhasComanda = montarLinhas(salvo, 60);
const linhaEntrega = linhasComanda.findIndex((linha) => linha.startsWith('Entrega: '));
assert.ok(linhaEntrega >= 0, 'a comanda deveria ter o campo Entrega');
assert.ok(
  linhasComanda.slice(linhaEntrega, linhaEntrega + 3).join(' ').replace(/\s+/g, ' ')
    .includes('Rua das Flores, 123, Centro, apto 4 (perto da padaria)'),
  'o endereço do cliente deveria aparecer no campo Entrega da comanda',
);

const chatEnderecoCurto = '5579888888888@s.whatsapp.net';
processarMensagem(chatEnderecoCurto, 'oi');
processarMensagem(chatEnderecoCurto, '1');
processarMensagem(chatEnderecoCurto, 'pronto');
processarMensagem(chatEnderecoCurto, 'não');
processarMensagem(chatEnderecoCurto, 'Ana');
const enderecoCurto = processarMensagem(chatEnderecoCurto, 'Rua 1');
assert.match(enderecoCurto.respostas[0], /📍 Rua 1/);

console.log(`\n✅ Teste OK. Banco: ${process.env.DB_PATH}\n   PDF: ${pdf}`);
