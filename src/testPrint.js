// Teste de impressão: gera uma comanda de exemplo e envia para a impressora
// (respeita IMPRIMIR, IMPRESSORA, PAPEL e COPIAS do seu .env).
import { gerarEImprimir } from './printer.js';

const pedido = {
  id: 999,
  criadoEm: new Date().toISOString(),
  telefone: '5579999999999',
  nome: 'Cliente de Teste',
  endereco: 'Rua Exemplo, 123, Centro, Aracaju - SE (perto da praça)',
  retirada: false,
  observacoes: 'Sem cebola. Troco para 50.',
  itens: [
    { codigo: 1, nome: 'X-Burger', qtd: 2, preco: 18.5 },
    { codigo: 4, nome: 'Batata Frita', qtd: 1, preco: 12 },
    { codigo: 6, nome: 'Suco Natural 500ml', qtd: 1, preco: 9 },
  ],
  subtotal: 58,
  taxaEntrega: 5,
  total: 63,
};

const arquivo = await gerarEImprimir(pedido);
console.log('PDF:', arquivo);
