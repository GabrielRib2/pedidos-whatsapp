// Banco de dados SQLite (arquivo único em data/pedidos.db).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    criado_em        TEXT    NOT NULL,           -- ISO 8601 em UTC
    cliente_telefone TEXT    NOT NULL,
    cliente_nome     TEXT    NOT NULL,
    endereco         TEXT    NOT NULL,
    retirada         INTEGER NOT NULL DEFAULT 0, -- 1 = retira no balcão
    observacoes      TEXT    NOT NULL DEFAULT '',
    subtotal         REAL    NOT NULL,
    taxa_entrega     REAL    NOT NULL,
    total            REAL    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pedido_itens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id   INTEGER NOT NULL REFERENCES pedidos(id),
    codigo      INTEGER NOT NULL,
    nome        TEXT    NOT NULL,
    qtd         INTEGER NOT NULL,
    preco_unit  REAL    NOT NULL
  );
`);

const insPedido = db.prepare(`
  INSERT INTO pedidos (criado_em, cliente_telefone, cliente_nome, endereco, retirada,
                       observacoes, subtotal, taxa_entrega, total)
  VALUES (@criadoEm, @telefone, @nome, @endereco, @retirada, @observacoes,
          @subtotal, @taxaEntrega, @total)
`);
const insItem = db.prepare(`
  INSERT INTO pedido_itens (pedido_id, codigo, nome, qtd, preco_unit)
  VALUES (?, ?, ?, ?, ?)
`);

// Pedido + itens numa transação: ou grava tudo, ou nada.
const gravar = db.transaction((p, criadoEm) => {
  const { lastInsertRowid } = insPedido.run({
    criadoEm,
    telefone: p.telefone,
    nome: p.nome,
    endereco: p.endereco,
    retirada: p.retirada ? 1 : 0,
    observacoes: p.observacoes || '',
    subtotal: p.subtotal,
    taxaEntrega: p.taxaEntrega,
    total: p.total,
  });
  for (const i of p.itens) insItem.run(lastInsertRowid, i.codigo, i.nome, i.qtd, i.preco);
  return Number(lastInsertRowid);
});

/** Salva o pedido confirmado e devolve o mesmo pedido com `id` e `criadoEm`. */
export function salvarPedido(pedido) {
  const criadoEm = new Date().toISOString();
  const id = gravar(pedido, criadoEm);
  return { ...pedido, id, criadoEm };
}

/** Lê um pedido de volta do banco (útil para testes e reimpressão). */
export function buscarPedido(id) {
  const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!p) return null;
  const itens = db
    .prepare('SELECT codigo, nome, qtd, preco_unit AS preco FROM pedido_itens WHERE pedido_id = ?')
    .all(id);
  return {
    id: p.id,
    criadoEm: p.criado_em,
    telefone: p.cliente_telefone,
    nome: p.cliente_nome,
    endereco: p.endereco,
    retirada: !!p.retirada,
    observacoes: p.observacoes,
    subtotal: p.subtotal,
    taxaEntrega: p.taxa_entrega,
    total: p.total,
    itens,
  };
}
