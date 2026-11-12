// Ponto de entrada: WhatsApp -> bot -> banco -> impressão.
import { config } from './config.js';
import { iniciarWhatsApp } from './whatsapp.js';
import { processarMensagem, mensagemConfirmacao } from './bot.js';
import { salvarPedido } from './db.js';
import { gerarEImprimir } from './printer.js';

console.log(`Loja: ${config.menu.loja.nome} | Papel: ${config.papel} | ` +
  `Impressora: ${config.impressora || '(padrão do sistema)'} | Imprimir: ${config.imprimir}`);

await iniciarWhatsApp(async ({ jid, texto, nome, enviar, enviarImagem }) => {
  const resultado = processarMensagem(jid, texto, nome);
  if (resultado.enviarCardapio) await enviarImagem('Olá, aqui está o cardápio');
  for (const resposta of resultado.respostas) await enviar(resposta);

  if (resultado.pedidoConfirmado) {
    // 1) salva no SQLite
    const telefone = jid.split('@')[0].split(':')[0];
    const pedido = salvarPedido({ ...resultado.pedidoConfirmado, telefone });
    console.log(`📦 Pedido #${pedido.id} salvo — ${pedido.nome} — total ${pedido.total}`);

    // 2) avisa o cliente (não depende da impressora estar funcionando)
    await enviar(mensagemConfirmacao(pedido));

    // 3) gera o PDF e imprime automaticamente
    try {
      await gerarEImprimir(pedido);
    } catch (e) {
      console.error(`⚠️ Pedido #${pedido.id} salvo, mas a impressão falhou:`, e.message);
    }
  }
});
