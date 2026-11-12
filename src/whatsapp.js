// Conexão com o WhatsApp via Baileys (biblioteca não oficial, login por QR Code).
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import fs from 'node:fs';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { config } from './config.js';

const filas = new Map(); // uma fila por cliente: mensagens do mesmo chat são tratadas em ordem

function textoDaMensagem(msg) {
  const m = msg.message;
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.ephemeralMessage?.message?.conversation ||
    m?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    ''
  );
}

/**
 * Conecta ao WhatsApp. `aoReceber({ jid, texto, nome, enviar })` é chamado a cada mensagem
 * de cliente (conversa individual). `enviar(texto)` e `enviarImagem(legenda)` respondem no chat.
 */
export async function iniciarWhatsApp(aoReceber) {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const imagemCardapio = fs.readFileSync(config.menuImage);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    // sem internet para consultar a versão: o Baileys usa a embutida
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }), // silencia os logs internos do Baileys
    browser: ['Pedidos Bot', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\nEscaneie o QR Code abaixo: WhatsApp > Aparelhos conectados > Conectar um aparelho\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') console.log('✅ WhatsApp conectado. Aguardando pedidos...');
    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        console.log('❌ Sessão encerrada pelo celular. Apague a pasta "auth" e rode de novo para gerar um novo QR Code.');
        process.exit(1);
      }
      console.log(`Conexão caiu (código ${codigo ?? '?'}). Reconectando em 3s...`);
      setTimeout(() => iniciarWhatsApp(aoReceber).catch(console.error), 3000);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!msg.message || msg.key.fromMe || !jid) continue;
      if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue; // ignora grupos/status

      const enviar = (texto) => sock.sendMessage(jid, { text: texto });
      const enviarImagem = (legenda) =>
        sock.sendMessage(jid, { image: imagemCardapio, caption: legenda });
      const texto = textoDaMensagem(msg).trim();

      const tarefa = async () => {
        if (!texto) return;
        await sock.sendPresenceUpdate('composing', jid);
        await aoReceber({ jid, texto, nome: msg.pushName || '', enviar, enviarImagem });
      };

      const anterior = filas.get(jid) || Promise.resolve();
      const proxima = anterior.then(tarefa).catch((e) => console.error('Erro ao tratar mensagem:', e));
      filas.set(jid, proxima);
    }
  });

  return sock;
}
