# 🤖 WPP BOT UI — Automação WhatsApp + Selenium (RUB)

**Fluxo:** código enviado no grupo → execução via Selenium (RUB) → PDF, print e retorno automático no grupo.  
**Desenvolvimento:** Urich (Leonardo)  
**Licença:** MIT  
**Versão:** 1.0.1  

<<<<<<< HEAD
---
=======
1. Como baixar o projeto
git clone https://github.com/LawrenceUrich/wpp-bot.git >>
cd wpp-bot
>>>>>>> b2bba13aead7ff29929a659e222a3c1d9f630c62

## 🧠 Sobre o projeto

O **WPP Bot UI** é um sistema completo de automação que conecta o WhatsApp ao Selenium, executa tarefas no **RUB** e retorna resultados automaticamente (HTML, PDF, imagens).  
Ele opera com **fila de execução**, **autenticação local (LocalAuth)** e **painel web** para visualização e controle.

👉 **Principais recursos:**
- Integração entre `whatsapp-web.js` e `selenium-webdriver`.
- Execução automática de consultas a partir de mensagens recebidas em grupos.
- Geração de relatórios HTML/PDF e prints pós-login.
- Logs visuais (HTML/PNG) para depuração rápida.
- Painel web simples com QR Code, status e controles.
- Sistema de autoatualização via `manager.ts`.

---

## 🧩 Requisitos

- **Node.js ≥ 20.10**
- **npm ≥ 10**
- **Google Chrome instalado**  
  (o Selenium usa o Chrome padrão; o caminho é configurado automaticamente)

---

## 1️⃣ Clonar o repositório
   ```bash
   git clone https://github.com/LawrenceUrich/wpp-bot.git
   cd wpp-bot

## 2️⃣ Instalar dependências

Certifique-se de ter Node 20+ instalado.

npm install


## 3️⃣ Rodar em modo desenvolvimento (TypeScript)

Ideal para ajustar e testar.

npm run dev

Isso sobe o src/server.ts usando TSX (sem precisar build manual).

## 4️⃣ Gerar o build (dist)

Compila o TypeScript para JavaScript dentro da pasta dist/.

npm run build

## 5️⃣ Rodar a versão compilada (dist)

Depois do build:

npm start

O projeto usa dist/server.js como entrada principal.

## 6️⃣ ⚙️ Scripts úteis

```bash
# Servidor em modo desenvolvimento (TypeScript)
npm run dev

# Gera a pasta dist/
npm run build

# Roda o bot usando os arquivos compilados
npm start

# Modo dev do manager.ts
npm run manager:dev

# Teste de auto-update / gestão
npm run manager:start

# Limpa node_modules e reinstala tudo
npm run reinstall


7️⃣ 📂 Estrutura (resumida)
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

## 8️⃣ 🧾 Sobre os logs
🔍 Eles mostram:

tentativas de login,

pós-login,

possíveis erros do Selenium ou do fluxo.

Isso facilita debugar rapidamente:

ver onde falhou,

conferir se o código do grupo foi lido,

visualizar se o RUB respondeu como esperado.

Esses registros tornam o debug mais rápido e preciso.

## 💡 Dica:

Se algo quebrar, verifique os logs primeiro.
Eles mostram exatamente onde o processo parou, o que foi executado e o que deu errado.

## 📞 Suporte

Se não conseguir identificar o problema ou precisar de ajuda com a configuração, entre em contato:
📱 (21) 98211-1477
👤 Leonardo (Urich)

Consulte CREDITS.md para detalhes de autoria, contribuições e agradecimentos.
=======

Se algo quebrar, primeiro olha os logs. Caso não consiga identificar, entre em contato: (21) 98211-1477 >> Leonardo