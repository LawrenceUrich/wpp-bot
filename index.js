/**
 * WPP Bot — © 2025 Urich
 * Ideia: DAVID
 * Automação RUB (Selenium): eudaverdgs@gmail.com
 * Melhorias/ajustes: leozinho.yukih@gmail.com
 * Licença: MIT (veja LICENSE)
 */

/**
 * Bot WhatsApp (terminal):
 * - Pergunta/salva IP do RUB e ID do grupo
 * - Escuta códigos no grupo
 * - Roda selenium.js e envia PDF
 *
 * Manutenção via CLI:
 *   npm start -- --announce "YYYY-MM-DD HH:mm" "Mensagem"
 *   npm start -- --announce "em 30m" "Mensagem"
 *   npm start -- --announce agora "Mensagem" --exit-after
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const prompt = require('prompt-sync')({ sigint: true });

// ========== Persistência ==========
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({}), 'utf8');
}
function readConfig() {
  ensureData();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw || '{}');
    if (typeof cfg.autoMode === 'undefined') cfg.autoMode = true;
    if (!cfg.codeRegex) cfg.codeRegex = '^\\d+$'; // só números por padrão
    return cfg;
  } catch {
    return { autoMode: true, codeRegex: '^\\d+$' };
  }
}
function writeConfig(cfg) {
  ensureData();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

// ========== Execução do Selenium ==========
function executarAutomacao(codigo) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, 'selenium.js');
    const env = { ...process.env };
    const cfg = readConfig();
    if (cfg.storeIP) env.STORE_IP = String(cfg.storeIP);
    if (cfg.storeName) env.STORE_NAME = String(cfg.storeName);
    if (cfg.rubUser) env.RUB_USER = String(cfg.rubUser);
    if (cfg.rubPass) env.RUB_PASS = String(cfg.rubPass);

    const comando = `node "${scriptPath}" ${codigo}`;
    exec(comando, { env }, (error, stdout, stderr) => {
      if (stdout) console.log(stdout.trim());
      if (stderr) console.log(stderr.trim());
      if (error) {
        console.error(`Erro ao executar Selenium: ${error.message}`);
        return reject(error);
      }
      const downloadsDir = path.join(__dirname, 'downloads');
      const alvo = path.join(downloadsDir, `${codigo}.pdf`);
      if (fs.existsSync(alvo)) return resolve(alvo);

      // fallback: PDF mais novo
      if (fs.existsSync(downloadsDir)) {
        let newest = null;
        for (const f of fs.readdirSync(downloadsDir)) {
          if (f.toLowerCase().endsWith('.pdf')) {
            const full = path.join(downloadsDir, f);
            const m = fs.statSync(full).mtimeMs;
            if (!newest || m > newest.m) newest = { p: full, m };
          }
        }
        if (newest) return resolve(newest.p);
      }
      reject(new Error('PDF não encontrado após execução.'));
    });
  });
}

// ========== Fila ==========
const fila = [];
let processando = false;
let clientReady = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendMessageWithRetry(client, chatId, media, options, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try { await client.sendMessage(chatId, media, options); return; }
    catch (e) {
      if (i === retries) throw e;
      console.warn(`Tentativa ${i} falhou: ${e.message}. Retentando...`);
      await sleep(2000);
    }
  }
}

async function processarFila(client) {
  processando = true;
  while (fila.length) {
    const { codigo, chatId } = fila.shift();
    try {
      await client.sendMessage(chatId, `🔄 Código recebido: ${codigo}. Iniciando automação...`);
      const caminhoPDF = await executarAutomacao(codigo);
      if (!fs.existsSync(caminhoPDF)) {
        await client.sendMessage(chatId, `⚠️ PDF não encontrado para "${codigo}". Confirme o código / estoque.`);
        continue;
      }
      const media = MessageMedia.fromFilePath(caminhoPDF);
      await sendMessageWithRetry(client, chatId, media, {
        caption: `📄 Resultado do código ${codigo}`,
        sendMediaAsDocument: true
      });
      console.log('📤 PDF enviado com sucesso!');
    } catch (err) {
      console.error('Erro ao rodar automação:', err);
      try { await client.sendMessage(chatId, '❌ Erro ao gerar o PDF. Verifique os dados e tente de novo.'); } catch {}
    }
  }
  processando = false;
}

async function adicionarNaFila(client, codigo, chatId) {
  fila.push({ codigo, chatId });
  if (clientReady && !processando) await processarFila(client);
}

// ========== CLI: manutenção ==========
function parseWhen(s) {
  if (!s) return null;
  const lower = String(s).toLowerCase();
  if (lower === 'agora' || lower === 'now') return new Date();
  const em = lower.match(/^em\s+(\d+)\s*([mh])$/);
  if (em) {
    const n = parseInt(em[1], 10);
    const unit = em[2];
    const d = new Date();
    if (unit === 'm') d.setMinutes(d.getMinutes() + n);
    if (unit === 'h') d.setHours(d.getHours() + n);
    return d;
  }
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

async function scheduleMaintenance(whenStr, msg, exitAfter = false, clientRef) {
  const cfg = readConfig();
  if (!cfg.groupId) {
    console.log('⚠️ Sem grupo salvo. Defina o grupo antes de anunciar manutenção.');
    return;
  }
  const when = parseWhen(whenStr);
  if (!when) {
    console.log('⚠️ Data/hora inválida para manutenção:', whenStr);
    return;
  }

  const ms = when.getTime() - Date.now();
  const alvoFmt = when.toLocaleString();
  const texto = msg || `🚧 Entraremos em manutenção em ${alvoFmt}.`;

  if (ms <= 0) {
    console.log('🟠 Anunciando manutenção AGORA...');
    await clientRef.sendMessage(cfg.groupId, texto);
    if (exitAfter) process.exit(0);
    return;
  }

  console.log(`🗓️ Manutenção agendada para ${alvoFmt} (em ${Math.round(ms/1000)}s).`);
  setTimeout(async () => {
    try {
      await clientRef.sendMessage(cfg.groupId, texto);
      console.log('✅ Aviso de manutenção enviado.');
    } catch (e) {
      console.log('❌ Falha ao enviar aviso de manutenção:', e.message);
    } finally {
      if (exitAfter) process.exit(0);
    }
  }, ms);
}

// parse args: --announce "<quando>" "mensagem..." [--exit-after]
const argv = process.argv.slice(2);
const iAnn = argv.indexOf('--announce');
let _announceWhen = null, _announceMsg = null, _announceExit = false;
if (iAnn >= 0) {
  _announceWhen = argv[iAnn + 1] || 'agora';
  _announceMsg = argv.slice(iAnn + 2).filter(a => a !== '--exit-after').join(' ') || null;
  _announceExit = argv.includes('--exit-after');
}

// ========== WhatsApp client ==========
const BROWSER_PATH = process.env.PUPPETEER_EXECUTABLE_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Cache da versão do WA Web: local por padrão; remoto via WWEBJS_USE_REMOTE_CACHE=1
const useRemoteCache = String(process.env.WWEBJS_USE_REMOTE_CACHE || '').trim() === '1';
const webVersionCache = useRemoteCache
  ? { type: 'remote' }                                  // <- atualização
  : { type: 'local', path: path.join(__dirname, '.wwebjs_cache') };

console.log('WebCache:', useRemoteCache ? 'REMOTE' : 'LOCAL');

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, 'wwebjs_auth')
  }),
  puppeteer: {
    executablePath: BROWSER_PATH,
    headless: false,
    protocolTimeout: 180000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1200,900'
    ]
  },
  webVersionCache,              // estabiliza contra mudanças do WA Web
  takeoverOnConflict: true,
  takeoverTimeoutMs: 8000
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('loading_screen', (percent, message) => {
  console.log(`Carregando WhatsApp (${percent || 0}%) ${message || ''}`);
});

client.on('ready', async () => {
  console.log('🟢 Bot WhatsApp está pronto!');
  try {
    const wv = await client.getWWebVersion?.();
    if (wv) console.log('ℹ️ WWeb version:', wv);
  } catch {}
  clientReady = true;

  const cfg = readConfig();

  // 1) IP do RUB
  if (!cfg.storeIP) {
    console.log('\n== Config inicial ==');
    const ip = prompt('Informe o IP do RUB (ex.: 10.48.69.146): ').trim();
    const name = prompt('Apelido da loja (opcional): ').trim();
    cfg.storeIP = ip;
    if (name) cfg.storeName = name;
    writeConfig(cfg);
    console.log(`💾 IP salvo: ${cfg.storeIP}${cfg.storeName ? ' (' + cfg.storeName + ')' : ''}`);
  }

  // (Opcional) login RUB
  if (!cfg.rubUser || !cfg.rubPass) {
    const want = prompt('Quer salvar matrícula/senha do RUB aqui? (s/N): ').trim().toLowerCase();
    if (want === 's' || want === 'sim') {
      cfg.rubUser = prompt('Matrícula: ').trim();
      cfg.rubPass = prompt('Senha: ').trim();
      writeConfig(cfg);
      console.log('💾 Login RUB salvo (em data/config.json).');
    }
  }

  // 2) Grupo salvo?
  if (!cfg.groupId) {
    console.log('\nPergunta: Sabe o ID do grupo de WPP?');
    const resp = prompt('(s/n): ').trim().toLowerCase();
    if (resp === 's' || resp === 'sim') {
      const gid = prompt('Cole o ID do grupo (ex: 1203...@g.us): ').trim();
      try {
        const chat = await client.getChatById(gid);
        const name = chat?.name || 'Grupo';
        cfg.groupId = gid;
        cfg.groupName = name;
        writeConfig(cfg);
        console.log(`💾 Grupo salvo: ${name} (${gid})`);
      } catch {
        console.log('❌ ID inválido ou inacessível. Rode de novo e escolha pela lista.');
      }
    } else {
      const chats = await client.getChats();
      const groups = chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name || '(sem nome)' }));
      if (!groups.length) {
        console.log('Nenhum grupo encontrado. Entre em um grupo e rode novamente.');
      } else {
        console.log('\nSelecione o grupo:');
        groups.forEach((g, i) => console.log(`${i + 1}. ${g.name} — ${g.id}`));
        const idx = parseInt(prompt('Número: ').trim(), 10) - 1;
        if (groups[idx]) {
          cfg.groupId = groups[idx].id;
          cfg.groupName = groups[idx].name;
          writeConfig(cfg);
          console.log(`💾 Grupo salvo: ${cfg.groupName} (${cfg.groupId})`);
        } else {
          console.log('Seleção inválida. Rode novamente.');
        }
      }
    }
  }

  // 3) Agendar manutenção (se veio por CLI)
  if (_announceWhen) {
    await scheduleMaintenance(_announceWhen, _announceMsg, _announceExit, client);
  }

  // 4) Se tinha fila antes do ready
  if (!processando && fila.length) await processarFila(client);
});

client.on('auth_failure', (m) => {
  console.error('❌ Falha na autenticação!', m || '');
});

client.on('change_state', (s) => {
  console.log('STATE =>', s);
});

client.on('disconnected', (reason) => {
  console.warn(`⚠️ Cliente desconectado: ${reason}. Reinicializando...`);
  clientReady = false;
  client.initialize();
});

// ---------- Logs focados no grupo salvo ----------
client.on('message_create', (m) => {
  try {
    const cfg = readConfig();

    const chatId =
      m?.from ||
      m?.to ||
      m?.id?._serialized ||
      m?.id?.remote ||
      '';

    const isStatus = chatId === 'status@broadcast' || m?.isStatus;
    if (isStatus) return;

    if (cfg?.groupId && chatId !== cfg.groupId) return;

    const body = (m?.body || '').trim();
    if (body) console.log(`message_create: ${chatId} :: "${body}"`);
  } catch {}
});

// ---------- Processamento: só o grupo salvo ----------
client.on('message', async (message) => {
  const cfg = readConfig();
  if (!cfg.groupId) return;

  if (message.from === 'status@broadcast' || message.isStatus) return;

  const from = message.from;
  const texto = (message.body || '').trim();
  if (from === cfg.groupId && texto) {
    console.log(`📩 [${cfg.groupName}] ${from} :: "${texto}"`);
  }

  if (!cfg.autoMode) return;
  if (from !== cfg.groupId) return;
  if (message.fromMe) return;
  if (!texto) return;

  const regex = new RegExp(cfg.codeRegex); // padrão: ^\d+$
  if (regex.test(texto)) {
    await adicionarNaFila(client, texto, message.from);
  } else {
    try { await client.sendMessage(message.from, '⚠️ Envie apenas 1 código numérico por mensagem.'); } catch {}
  }
});

// --------- Fechamento limpo (sem deslogar) ---------
let _closing = false;
async function cleanExit(code = 0) {
  if (_closing) return;
  _closing = true;
  try { await client.destroy(); } catch (_) {}
  process.exit(code);
}
process.once('SIGINT',  () => cleanExit(0)); // Ctrl+C
process.once('SIGTERM', () => cleanExit(0)); // kill “normal”
process.on('uncaughtException', (err) => { console.error(err); cleanExit(1); });
process.on('unhandledRejection', (reason) => { console.error(reason); cleanExit(1); });

client.initialize();
