# 📜 Créditos & Atribuições

**Projeto:** WPP Bot — código no grupo → Selenium (RUB) → PDF no grupo  
**Copyright:** © 2025 Urich  
**Licença:** MIT  

---

## 💡 Origem da Ideia
- **David** — concepção inicial do fluxo automatizado entre WhatsApp e Selenium (RUB), integrando leitura de códigos e execução de consultas automáticas.

---

## ⚙️ Desenvolvimento da Automação (RUB / Selenium)
- **eudaverdgs@gmail.com** — implementação inicial da automação RUB: login, filtros, captura e download.  
- **leozinho.yukih@gmail.com (Urich)** — refatoração completa do fluxo, otimização de performance e compatibilidade com o WhatsApp, Selenium e sistema de logs.

---

## 🧠 Implementações, Integrações e UI/Back-end
- **Urich (Leonardo)** — direção técnica, desenvolvimento da interface web e aprimoramento da automação.  
  **Principais entregas:**
  - Bot CLI + Interface Web com integração em tempo real via Socket.IO.  
  - Sistema de fila, regex avançado e seleção dinâmica de grupo e IP.  
  - Logs automáticos em HTML e PNG para depuração e rastreio de falhas.  
  - Integração completa entre `whatsapp-web.js`, Selenium e controle via API REST.  
  - Painel visual com QR Code, status de sessão, histórico e configurações persistentes.  
  - Mecanismo de autoatualização (manager.ts) com fallback e checagem contínua.  
  - Melhorias no cache e autenticação local (`LocalAuth`) para evitar re-login.  
  - Execução modular: `server.ts` (principal), `manager.ts` (gerência), `storage.ts` (persistência).  

---

## 🙌 Agradecimentos
- Comunidade **[whatsapp-web.js]** — base da integração com o WhatsApp.  
- Comunidade **[Selenium]** — automação de navegador e backbone do fluxo RUB.  
- A todos que testaram o bot e contribuíram com feedbacks reais durante o desenvolvimento.

---

> *“Automatizar é transformar o caos em rotina controlada.”*  
> — **Urich**
