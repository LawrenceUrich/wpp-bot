MIX-RUB · WPP BOT UI

Bot que lê códigos enviados em um grupo do WhatsApp, dispara o Selenium no RUB e devolve o resultado (PDF) direto no grupo.
Interface simples, logs salvos em disco e um manager para testes de auto-atualização/config.

1. Como baixar o projeto
git clone https://github.com/LawrenceUrich/wpp-bot.git >>
cd wpp-bot

2. Instalar dependências

Certifique-se de ter Node 20+ instalado.

npm install

3. Rodar em modo desenvolvimento (TypeScript)

Ideal para ajustar e testar.

npm run dev

Isso sobe o src/server.ts usando TSX (sem precisar build manual).

4. Gerar o build (dist)

Compila o TypeScript para JavaScript dentro da pasta dist/.

npm run build

5. Rodar a versão compilada (dist)

Depois do build:

npm start

O projeto usa dist/server.js como entrada principal.

6. Scripts úteis

npm run dev – servidor em modo desenvolvimento (TS).

npm run build – gera dist/.

npm start – roda o bot usando os arquivos compilados.

npm run manager:dev – modo dev do manager.ts.

npm run manager:start – roda dist/manager.js (teste de auto-update/gestão).

npm run reinstall – limpa node_modules + package-lock e reinstala tudo.

7. Estrutura (resumida)
wpp-bot/
├─ dist/            # Arquivos compilados JS (server, manager, storage, etc.)
│  └─ data/
│     └─ config.json   # Configurações usadas em produção
│
├─ logs/            # Logs HTML/PNG para debug e ver onde o fluxo falhou
├─ downloads/       # Saídas geradas (PDFs/relatórios) se aplicável
├─ public/
│  ├─ index.html    # UI simples do bot
│  ├─ app.js        # Lógica da interface
│  └─ style.css     # Estilos básicos
├─ src/
│  ├─ server.ts     # Core do bot (WhatsApp + Selenium + fluxo principal)
│  ├─ manager.ts    # Teste de manager / auto-atualização / controle
│  ├─ storage.ts    # Persistência (config, sessões, etc.)
│  ├─ data/         # Arquivos auxiliares (se usados)
│  └─ types/        # Tipagens (quando necessário)
├─ selenium.js      # Execução direta do Selenium
├─ webjs_auth / .webjs_cache # Dados internos do whatsapp-web.js
├─ package.json
├─ tsconfig.json
├─ CREDITS.md       # Créditos e colaborações
├─ LICENSE          # Licença MIT
└─ README.md        # Documentação do projeto

8. Sobre os logs

Os logs HTML/PNG mostram:

tentativas de login,

pós-login,

possíveis erros do Selenium ou do fluxo.

Isso facilita debugar rapidamente:

ver onde falhou,

conferir se o código do grupo foi lido,

visualizar se o RUB respondeu como esperado.


Se algo quebrar, primeiro olha os logs. Caso não consiga identificar, entre em contato: (21) 98211-1477 >> Leonardo
