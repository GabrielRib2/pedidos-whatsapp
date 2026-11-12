// Lógica da conversa (máquina de estados). Não depende do WhatsApp nem do banco:
// recebe texto, devolve respostas e, quando o cliente confirma, o pedido pronto.
import { config } from './config.js';

const { menu } = config;

const ESTADO = {
  INICIO: 'INICIO',
  ITENS: 'ITENS',
  OBS: 'OBS',
  NOME: 'NOME',
  ENDERECO: 'ENDERECO',
  CONFIRMAR: 'CONFIRMAR',
};

const TIMEOUT_MS = 30 * 60 * 1000; // sessão parada por 30 min é descartada
const MAX_QTD = 20;
const sessoes = new Map(); // chave: id do chat (jid)

setInterval(() => {
  const agora = Date.now();
  for (const [k, s] of sessoes) if (agora - s.ultimo > TIMEOUT_MS) sessoes.delete(k);
}, 5 * 60 * 1000).unref();

// ---------- utilidades ----------
export const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');
const arredonda = (n) => Math.round(n * 100) / 100;
const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SIM = ['sim', 's', 'confirmar', 'confirmo', 'ok', 'isso'];
const NAO = ['nao', 'n', 'cancelar'];

// ---------- cardápio e carrinho ----------
function formatarMenu() {
  const linhas = menu.itens.map((i) => `*${i.codigo}* - ${i.nome} — ${brl(i.preco)}`);
  return (
    `📋 *Cardápio*\n${linhas.join('\n')}\n\n` +
    `Entrega: ${brl(menu.taxaEntrega)} (retirada no balcão é grátis).`
  );
}

/** Acha um item por código ("2") ou por nome/parte do nome ("bacon"). */
function buscarItem(ref) {
  const r = ref.trim();
  if (/^\d+$/.test(r)) {
    const it = menu.itens.find((i) => i.codigo === Number(r));
    return it ? { item: it } : { erro: `Não encontrei o código ${r} no cardápio.` };
  }
  const n = norm(r);
  if (!n) return { erro: `Não entendi "${r}".` };
  const exato = menu.itens.find((i) => norm(i.nome) === n);
  if (exato) return { item: exato };
  if (n.length >= 3) {
    const cand = menu.itens.filter((i) => norm(i.nome).includes(n));
    if (cand.length === 1) return { item: cand[0] };
    if (cand.length > 1) {
      return { erro: `"${r}" combina com mais de um item (${cand.map((c) => c.nome).join(', ')}). Use o código.` };
    }
  }
  return { erro: `Não encontrei "${r}" no cardápio.` };
}

/** Aceita: "2x1, 4", "1", "x-bacon", "2 x bacon e 5" (formato: quantidade x código/nome). */
function interpretarItens(texto) {
  const adicionados = [];
  const partes = texto.split(/[,;\n]+|\s+e\s+/i).map((p) => p.trim()).filter(Boolean);
  for (const parte of partes) {
    let qtd = 1;
    let ref = parte;
    const m = parte.match(/^(\d{1,2})\s*[x*×]\s*(.+)$/i);
    if (m) {
      qtd = Number(m[1]);
      ref = m[2];
    }
    if (qtd < 1 || qtd > MAX_QTD) {
      continue;
    }
    const r = buscarItem(ref);
    if (!r.erro) adicionados.push({ item: r.item, qtd });
  }
  return adicionados;
}

function calcular(carrinho, retirada) {
  const itens = [...carrinho.entries()].map(([codigo, qtd]) => {
    const it = menu.itens.find((i) => i.codigo === codigo);
    return { codigo, nome: it.nome, qtd, preco: it.preco };
  });
  const subtotal = arredonda(itens.reduce((a, i) => a + i.preco * i.qtd, 0));
  const taxaEntrega = retirada ? 0 : menu.taxaEntrega;
  return { itens, subtotal, taxaEntrega, total: arredonda(subtotal + taxaEntrega) };
}

function textoCarrinho(carrinho) {
  const { itens, subtotal } = calcular(carrinho, true);
  const linhas = itens.map((i) => `• ${i.qtd}x ${i.nome} — ${brl(i.preco * i.qtd)}`);
  return `🛒 *Seu pedido até agora:*\n${linhas.join('\n')}\nSubtotal: ${brl(subtotal)}`;
}

function textoResumo(s) {
  const t = calcular(s.carrinho, s.retirada);
  const linhas = t.itens.map((i) => `• ${i.qtd}x ${i.nome} — ${brl(i.preco * i.qtd)}`);
  return [
    '🧾 *Resumo do pedido*',
    ...linhas,
    s.observacoes ? `📝 Obs: ${s.observacoes}` : null,
    `👤 ${s.nome}`,
    s.retirada ? '🏪 Retirada no balcão' : `📍 ${s.endereco}`,
    '',
    `Subtotal: ${brl(t.subtotal)}`,
    s.retirada ? null : `Entrega: ${brl(t.taxaEntrega)}`,
    `*Total: ${brl(t.total)}*`,
    '',
    'Está tudo certo? Responda *SIM* para confirmar ou *NÃO* para ajustar.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function mensagemConfirmacao(p) {
  return (
    `✅ *Pedido #${String(p.id).padStart(4, '0')} confirmado!*\n` +
    `Total: ${brl(p.total)}\n` +
    `Já enviamos para a cozinha. Obrigado, ${p.nome.split(' ')[0]}! 🙌`
  );
}

// ---------- conversa ----------
function novaSessao(nomePerfil) {
  return {
    estado: ESTADO.INICIO,
    carrinho: new Map(),
    observacoes: '',
    nome: '',
    nomePerfil: nomePerfil || '',
    endereco: '',
    retirada: false,
    ultimo: Date.now(),
  };
}

/**
 * Processa uma mensagem do cliente.
 * @returns {{ respostas: string[], enviarCardapio?: boolean, pedidoConfirmado?: object }}
 */
export function processarMensagem(chave, texto, nomePerfil = '') {
  let s = sessoes.get(chave);
  if (!s || Date.now() - s.ultimo > TIMEOUT_MS) {
    s = novaSessao(nomePerfil);
    sessoes.set(chave, s);
  }
  s.ultimo = Date.now();

  const t = (texto || '').trim();
  const cmd = norm(t);

  // "cancelar" funciona em qualquer etapa (menos no início)
  if (cmd === 'cancelar' && s.estado !== ESTADO.INICIO) {
    sessoes.delete(chave);
    return { respostas: ['Pedido cancelado. Quando quiser recomeçar, é só mandar uma mensagem. 🙂'] };
  }

  switch (s.estado) {
    case ESTADO.INICIO: {
      s.estado = ESTADO.ITENS;
      return {
        enviarCardapio: true,
        respostas: [
          'Para pedir, envie o *código* e a quantidade, por exemplo:\n' +
            '`2x1, 4` = 2 unidades do item 1 e 1 do item 4.\n' +
            'Quando terminar, envie *pronto*. (*cancelar* a qualquer momento)',
        ],
      };
    }

    case ESTADO.ITENS: {
      if (['menu', 'cardapio'].includes(cmd)) return { respostas: [formatarMenu()] };
      if (cmd === 'limpar') {
        s.carrinho.clear();
        return { respostas: ['Carrinho limpo. Envie os itens que deseja. 🙂'] };
      }
      if (['pronto', 'fim', 'finalizar', 'so isso', 'so'].includes(cmd)) {
        if (s.carrinho.size === 0) return { respostas: [] };
        s.estado = ESTADO.OBS;
        return {
          respostas: [
            `${textoCarrinho(s.carrinho)}\n\n` +
              'Alguma observação? (ex.: sem cebola, troco para 50). Se não tiver, envie *não*.',
          ],
        };
      }
      const adicionados = interpretarItens(t);
      if (adicionados.length === 0) return { respostas: [] };
      for (const { item, qtd } of adicionados) {
        s.carrinho.set(item.codigo, Math.min(MAX_QTD, (s.carrinho.get(item.codigo) || 0) + qtd));
      }
      return {
        respostas: [
          `${textoCarrinho(s.carrinho)}\n\nEnvie mais itens, *limpar* para zerar ou *pronto* para continuar.`,
        ],
      };
    }

    case ESTADO.OBS: {
      const semObs = ['nao', 'n', 'nenhuma', 'nenhum', 'sem obs', 'sem observacao'].includes(cmd);
      s.observacoes = semObs ? '' : t.slice(0, 200);
      s.estado = ESTADO.NOME;
      const dica = s.nomePerfil ? ` (ou envie *ok* para usar "${s.nomePerfil}")` : '';
      return { respostas: [`Qual o *nome* para o pedido?${dica}`] };
    }

    case ESTADO.NOME: {
      if (cmd === 'ok' && s.nomePerfil) s.nome = s.nomePerfil;
      else if (t.length >= 2) s.nome = t.slice(0, 60);
      else return { respostas: [] };
      s.estado = ESTADO.ENDERECO;
      return {
        respostas: [
          'Informe o *endereço completo de entrega* (rua, número, bairro e ponto de referência) ' +
            'ou envie *retirada* para buscar no balcão.',
        ],
      };
    }

    case ESTADO.ENDERECO: {
      if (['retirada', 'retirar', 'balcao'].includes(cmd)) {
        s.retirada = true;
        s.endereco = 'RETIRADA NO BALCÃO';
      } else if (t.length >= 8) {
        s.retirada = false;
        s.endereco = t.slice(0, 200);
      } else {
        return { respostas: [] };
      }
      s.estado = ESTADO.CONFIRMAR;
      return { respostas: [textoResumo(s)] };
    }

    case ESTADO.CONFIRMAR: {
      if (SIM.includes(cmd)) {
        const tot = calcular(s.carrinho, s.retirada);
        const pedido = {
          nome: s.nome,
          endereco: s.endereco,
          retirada: s.retirada,
          observacoes: s.observacoes,
          ...tot,
        };
        sessoes.delete(chave);
        return { respostas: [], pedidoConfirmado: pedido };
      }
      if (['nao', 'n'].includes(cmd)) {
        s.estado = ESTADO.ITENS;
        return {
          respostas: [
            'Sem problemas! Envie itens para adicionar, *limpar* para recomeçar ou *pronto* para revisar. ' +
              '(*cancelar* descarta o pedido)',
          ],
        };
      }
      return { respostas: [] };
    }
  }
  return { respostas: [] };
}
