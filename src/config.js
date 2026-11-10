// Configuração central: lê o .env e o cardápio (config/menu.json).
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const PAPEIS_VALIDOS = ['A4', 'A5', '80MM'];
const papel = (process.env.PAPEL || 'A4').trim().toUpperCase();
if (!PAPEIS_VALIDOS.includes(papel)) {
  throw new Error(`PAPEL inválido no .env: "${process.env.PAPEL}". Use A4, A5 ou 80mm.`);
}

const menu = JSON.parse(fs.readFileSync(path.join(root, 'config', 'menu.json'), 'utf8'));

export const config = {
  root,
  menu,
  papel,
  impressora: (process.env.IMPRESSORA || '').trim(), // vazio = impressora padrão do sistema
  copias: Math.max(1, parseInt(process.env.COPIAS || '1', 10) || 1),
  fuso: process.env.FUSO || 'America/Sao_Paulo',
  imprimir: (process.env.IMPRIMIR ?? 'true').trim().toLowerCase() !== 'false',
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'pedidos.db'),
  comandasDir: process.env.COMANDAS_DIR || path.join(root, 'comandas'),
  authDir: path.join(root, 'auth'), // sessão do WhatsApp (QR Code só na 1ª vez)
};
