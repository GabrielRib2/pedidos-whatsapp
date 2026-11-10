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
const { gerarEImprimir } = await import('./printer.js');

const chat = '5579999999999@s.whatsapp.net';
const falas = [
  'oi',
  '2x1, 4',
  '1 x-bacon e 5',
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
  for (const msg of r.respostas) console.log(`🤖 ${msg}`);
  if (r.pedidoConfirmado) confirmado = r.pedidoConfirmado;
}

assert.ok(confirmado, 'o pedido deveria ter sido confirmado');
const salvo = salvarPedido({ ...confirmado, telefone: '5579999999999' });
console.log(`\n🤖 ${mensagemConfirmacao(salvo)}`);

const lido = buscarPedido(salvo.id);
assert.equal(lido.itens.length, 4);
assert.equal(lido.total, 82); // 2x18,50 + 12 + 22 + 6 + 5 de entrega
assert.equal(lido.nome, 'Maria Silva');

const pdf = await gerarEImprimir(salvo);
assert.ok(fs.existsSync(pdf) && fs.statSync(pdf).size > 500, 'PDF não foi gerado');

console.log(`\n✅ Teste OK. Banco: ${process.env.DB_PATH}\n   PDF: ${pdf}`);
