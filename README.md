# Pedidos WhatsApp + Impressão automática

Bot de pedidos no WhatsApp (Baileys) → salva em SQLite → imprime comanda em PDF
(fundo branco, texto preto, fonte monoespaçada, margens mínimas) sem nenhum clique.

## Estrutura

```
pedidos-whatsapp/
├── package.json
├── .env.example        # copie para .env e ajuste (impressora, papel, cópias...)
├── config/menu.json    # nome da loja, cardápio, preços e taxa de entrega
└── src/
    ├── index.js        # ponto de entrada: WhatsApp -> bot -> banco -> impressão
    ├── whatsapp.js     # conexão Baileys, QR Code, reconexão, fila por cliente
    ├── bot.js          # conversa (itens, observações, nome, endereço, confirmação)
    ├── db.js           # SQLite (tabelas pedidos e pedido_itens)
    ├── printer.js      # gera o PDF e envia à impressora (Windows / Linux / macOS)
    ├── config.js       # lê .env e menu.json
    ├── testBot.js      # simula uma conversa completa, sem WhatsApp e sem imprimir
    └── testPrint.js    # imprime uma comanda de exemplo
```

Criados automaticamente ao rodar: `auth/` (sessão do WhatsApp), `data/pedidos.db`, `comandas/` (PDFs).

## Instalação

1. Instale o Node.js 18+ (recomendado a versão LTS): https://nodejs.org
2. Na pasta do projeto:
   ```
   npm install
   ```
   (`better-sqlite3` baixa um binário pronto. Se falhar no Windows, instale as
   "Ferramentas de Build do Visual Studio" ou use uma versão LTS do Node.)
3. Crie o arquivo de configuração:
   - Windows: `copy .env.example .env`
   - Linux/macOS: `cp .env.example .env`
4. Edite `.env` (impressora, papel A4/A5/80mm, cópias) e `config/menu.json` (seu cardápio).

## Testes (antes de usar com clientes)

```
npm run test-bot     # conversa simulada + banco + PDF (não imprime)
npm run test-print   # gera e IMPRIME uma comanda de exemplo na impressora do .env
```
Para só gerar o PDF sem imprimir, use `IMPRIMIR=false` no `.env` e veja a pasta `comandas/`.

## Rodando

```
npm start
```
Na 1ª vez aparece um QR Code no terminal: WhatsApp no celular → Aparelhos conectados →
Conectar um aparelho. Depois disso a sessão fica salva em `auth/`.
Deixe o computador ligado, com a impressora ligada e definida como padrão
(ou informe o nome em `IMPRESSORA`).

## Como o cliente pede

O cliente manda qualquer mensagem e recebe o cardápio. Ele responde, por exemplo, `2x1, 4`
(2 unidades do item 1 e 1 do item 4), envia `pronto`, informa observações, nome e endereço
(ou `retirada`) e confirma com `sim`. O pedido é salvo, o cliente recebe o número do pedido
e a comanda sai na impressora.

## Observações

- Baileys é uma biblioteca **não oficial**: use preferencialmente um número secundário/comercial
  e evite disparar mensagens em massa para não arriscar bloqueio.
- Se o WhatsApp deslogar, apague a pasta `auth/` e rode de novo para gerar outro QR Code.
- Windows imprime via `pdf-to-printer`; Linux/macOS via `lp` (CUPS). `lpstat -p` lista impressoras.
- Os dados ficam em `data/pedidos.db` (abra com DB Browser for SQLite para consultar).
