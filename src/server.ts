/**
 * WPP Bot — © 2025 Urich
 * Ideia: Urich | Automação RUB (Selenium): eudaverdgs@gmail.com | Melhorias: leozinho.yukih@gmail.com
 * Licença: MIT
 */

import express, { Request, Response } from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import * as path from 'path';
import fs from 'fs';
import * as QRCode from 'qrcode';
import cors from 'cors';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import {
  readConfig, setGroup, clearGroup, setStoreIP, clearStoreIP, setAutoMode, setCodeRegex, setRubCreds, clearRubCreds
} from './storage';
import { exec as _exec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(_exec);

// -------------------- App base --------------------
const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Static pela raiz do projeto (funciona em dev com tsx e em prod)
const STATIC_DIR = path.join(process.cwd(), 'public');
console.log('Serving static from:', STATIC_DIR);
app.use(express.static(STATIC_DIR));
app.get('/', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

interface State { ready: boolean; authenticated: boolean; loading: boolean; }
const STATE: State = { ready: false, authenticated: false, loading: true };

function broadcast<T = unknown>(event: string, payload: T) { io.sockets.emit(event, payload); }
function log(msg: string) {
  const stamp = new Date().toLocaleTimeString();
  const line = `[${stamp}] ${msg}`;
  console.log(line);
  broadcast('log', line);
}

let qrDataURL: string | null = null;

// -------------------- Helpers --------------------
function parseWhen(s?: string | null): Date | null {
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
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

async function ensureReady(timeoutMs = 180000): Promise<void> {
  if (STATE.ready) return;
  const start = Date.now();
  await new Promise<void>((resolve, reject) => {
    const t = setInterval(() => {
      if (STATE.ready) { clearInterval(t); return resolve(); }
      if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        return reject(new Error('Cliente WhatsApp não ficou pronto a tempo.'));
      }
    }, 250);
  });
}

// -------------------- WhatsApp client --------------------
// Caminhos padrão do Chrome por SO (se não vier PUPPETEER_EXECUTABLE_PATH)
const DEFAULT_CHROME =
  process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome';

const BROWSER_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || DEFAULT_CHROME;

// Cache LOCAL da versão do WhatsApp Web (estabiliza mudanças do WA)
const webVersionCache = {
  type: 'local' as const,
  path: path.join(__dirname, '..', '.wwebjs_cache'),
  strict: false,
};

// Watchdog: encerra se não houver grupo salvo após X minutos
const NO_GROUP_TIMEOUT_MS = 60 * 60 * 1000; // 60 min

// ---- Monkey-patch de logout seguro (sem herança) ----
function createSafeLocalAuth(opts: ConstructorParameters<typeof LocalAuth>[0]) {
  const auth = new LocalAuth(opts);
  const anyAuth = auth as any;
  const originalLogout: (() => Promise<void>) | undefined = anyAuth.logout?.bind(anyAuth);
  if (originalLogout) {
    anyAuth.logout = async () => {
      try {
        await originalLogout();
      } catch (e: any) {
        const code = e?.code ?? '';
        const msg  = String(e?.message ?? e ?? '');
        if (code === 'EBUSY' || code === 'EPERM' || /EBUSY|EPERM/i.test(msg)) {
          console.warn('[SafeLocalAuth] Ignorando erro no logout:', code || msg, e?.path || '');
          return; // não derruba o processo
        }
        throw e;
      }
    };
  }
  return auth;
}

const client = new Client({
  authStrategy: createSafeLocalAuth({
    clientId: 'bot-1',
    dataPath: path.join(__dirname, '..', 'wwebjs_auth'),
  }),
  webVersionCache,
  puppeteer: {
    executablePath: BROWSER_PATH,
    headless: false,
    // @ts-ignore
    protocolTimeout: 180000,
    defaultViewport: null,
    // ⚠️ NÃO use userDataDir com LocalAuth
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1200,900',

      // Anti-automation
      '--disable-blink-features=AutomationControlled',
      '--disable-features=Translate,IsolateOrigins,site-per-process',

      // User-Agent “real”
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36`,
    ]
  },
  takeoverOnConflict: false,  // evita disputar sessão
  takeoverTimeoutMs: 15000,
  restartOnAuthFail: false,   // sem loop automático
});

client.on('qr', async (qr: string) => {
  try {
    qrDataURL = await QRCode.toDataURL(qr);
    log('QR gerado. Escaneie com o WhatsApp do celular.');
    broadcast('qr', qrDataURL);
  } catch (e: any) {
    log('Falha ao gerar QR: ' + e.message);
  }
});

client.on('loading_screen', (percent: number, message: string) => {
  log(`Carregando WhatsApp (${percent || 0}%) ${message || ''}`);
});

client.on('authenticated', () => {
  STATE.authenticated = true;
  log('Autenticado com sucesso.');
});

client.on('auth_failure', (m: string) => {
  log('Falha de autenticação: ' + (m || ''));
});

client.on('ready', async () => {
  STATE.ready = true;
  STATE.loading = false;
  try {
    // @ts-ignore — método não tipado em algumas versões
    const wv = await client.getWWebVersion?.();
    if (wv) log('WWeb version: ' + wv);
  } catch {}
  log('Cliente pronto.');

  const cfg = readConfig();
  if (cfg.groupId) {
    try {
      const chat = await client.getChatById(cfg.groupId);
      const name = (chat as any)?.name || cfg.groupName || 'Grupo';
      setGroup(cfg.groupId, name);
      log(`Grupo salvo encontrado: ${name} (${cfg.groupId}).`);
      await client.sendMessage(
        cfg.groupId,
        `🤖 Bot online. Modo automático: ${cfg.autoMode ? 'ATIVO' : 'PAUSADO'}`
      );
    } catch (e: any) {
      log('Não foi possível acessar o grupo salvo. Limpe e selecione novamente.');
    }
  } else {
    log('Nenhum grupo salvo ainda. Use a interface para selecionar/definir o grupo.');
    setTimeout(() => {
      const cfgLate = readConfig();
      if (!cfgLate.groupId) {
        log(`Sem grupo salvo após ${NO_GROUP_TIMEOUT_MS / 60000} minutos. Encerrando limpo.`);
        cleanExit(0);
      }
    }, NO_GROUP_TIMEOUT_MS);
  }
});

client.on('change_state', (s: string) => log('change_state: ' + s));

client.on('disconnected', (reason: string) => {
  STATE.ready = false;
  STATE.authenticated = false;
  log('Desconectado: ' + reason);
  // Reinicializa suave: mostra novo QR sem derrubar o processo
  setTimeout(() => {
    try { client.initialize(); } catch {}
  }, 3000);
});

client.initialize();

// -------------------- Fila de execução --------------------
type Job = { codigo: string; chatId?: string };
const fila: Job[] = [];
let processando = false;

function pushFila(item: Job) {
  fila.push(item);
  if (!processando) processarFila().catch(e => log('Loop fila erro: ' + e.message));
}

async function processarFila() {
  processando = true;
  while (fila.length) {
    const job = fila.shift()!;
    try {
      await executarSelenium(job.codigo, job.chatId);
    } catch (e: any) {
      log(`Falha no job ${job.codigo}: ${e.message}`);
      if (job.chatId) {
        try { await client.sendMessage(job.chatId, `❌ Erro ao gerar/enviar PDF do código ${job.codigo}.`); } catch {}
      }
    }
  }
  processando = false;
}

async function executarSelenium(codigo: string, chatId?: string) {
  await ensureReady();
  const cfg = readConfig();

  const downloadsDir = path.join(__dirname, '..', 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  log(`⏳ Rodando selenium.js para código ${codigo} ...`);
  const startMark = Date.now();

  // roda selenium.js com as envs atuais + cfg
  const scriptPath = path.join(__dirname, '..', 'selenium.js');
  const env = { ...process.env };
  if (cfg.storeIP) env.STORE_IP = cfg.storeIP;
  if (cfg.storeName) env.STORE_NAME = cfg.storeName;
  if (cfg.rubUser) env.RUB_USER = cfg.rubUser;
  if (cfg.rubPass) env.RUB_PASS = cfg.rubPass;

  try {
    const { stdout, stderr } = await exec(`node "${scriptPath}" ${codigo}`, { env });
    if (stdout?.trim()) log(stdout.trim());
    if (stderr?.trim()) log(stderr.trim());
  } catch (err: any) {
    if (err.stdout?.trim()) log(err.stdout.trim());
    if (err.stderr?.trim()) log(err.stderr.trim());
    throw err;
  }

  // Preferência: downloads/<codigo>.pdf; fallback: PDF mais novo após startMark
  const alvoPreferido = path.join(downloadsDir, `${codigo}.pdf`);
  let pdfFile: string | null = fs.existsSync(alvoPreferido) ? alvoPreferido : null;

  if (!pdfFile) {
    const files = fs.readdirSync(downloadsDir)
      .filter(n => /\.pdf$/i.test(n))
      .map(n => {
        const p = path.join(downloadsDir, n);
        const m = fs.statSync(p).mtimeMs;
        return { p, m };
      })
      .filter(o => o.m >= startMark - 5000)
      .sort((a, b) => b.m - a.m);
    if (files[0]) pdfFile = files[0].p;
  }

  if (!pdfFile) throw new Error('PDF não encontrado após execução.');

  log(`📄 PDF localizado: ${path.basename(pdfFile)} — enviando ao grupo...`);
  const media = await MessageMedia.fromFilePath(pdfFile);
  const caption = `PDF gerado para código ${codigo}`;

  for (let i = 1; i <= 3; i++) {
    try {
      await client.sendMessage(chatId || readConfig().groupId!, media, { caption, sendMediaAsDocument: true });
      log('✅ PDF enviado.');
      return;
    } catch (e: any) {
      log(`Tentativa ${i} de envio falhou: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Falha ao enviar PDF após 3 tentativas.');
}

// -------------------- Listener (modo automático) --------------------
client.on('message', async (message: any) => {
  try {
    const cfg = readConfig();
    if (!cfg.autoMode || !cfg.groupId) return;
    if (message.from === 'status@broadcast' || message.isStatus) return;
    if (message.from !== cfg.groupId) return;
    if (message.fromMe) return;

    const body: string = (message.body || '').trim();
    if (!body) return;

    const regex = new RegExp(cfg.codeRegex);
    if (!regex.test(body)) {
      await client.sendMessage(cfg.groupId, '⚠️ Envie apenas 1 código numérico por mensagem.');
      return;
    }

    log(`📥 Código detectado: "${body}".`);
    await client.sendMessage(cfg.groupId, `🔎 Recebi o código **${body}**. Gerando o PDF...`);
    pushFila({ codigo: body, chatId: cfg.groupId });
  } catch (e: any) {
    log('Erro no listener de mensagem: ' + e.message);
  }
});

// -------------------- API HTTP (UI) --------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, ...STATE });
});

app.get('/status', async (_req: Request, res: Response) => {
  const cfg = readConfig();
  res.json({
    ok: true,
    ...STATE,
    qr: qrDataURL,
    savedGroup: cfg.groupId ? { id: cfg.groupId, name: cfg.groupName } : null,
    store: cfg.storeIP ? { ip: cfg.storeIP, name: cfg.storeName || null } : null,
    autoMode: cfg.autoMode,
    codeRegex: cfg.codeRegex
  });
});

app.post('/set-ip', (req: Request, res: Response) => {
  const { ip, name } = (req.body || {}) as { ip?: string; name?: string };
  if (!ip) return res.status(400).json({ ok: false, error: 'ip é obrigatório' });
  setStoreIP(ip, name);
  log(`IP da loja salvo: ${ip}${name ? ' (' + name + ')' : ''}`);
  res.json({ ok: true });
});

app.post('/clear-ip', (_req: Request, res: Response) => {
  clearStoreIP();
  log('IP/Loja apagados.');
  res.json({ ok: true });
});

app.post('/set-auto', (req: Request, res: Response) => {
  const { on } = (req.body || {}) as { on?: boolean };
  setAutoMode(!!on);
  log('Modo automático: ' + (on ? 'ATIVO' : 'PAUSADO'));
  res.json({ ok: true });
});

app.post('/set-regex', (req: Request, res: Response) => {
  const { pattern } = (req.body || {}) as { pattern?: string };
  setCodeRegex(pattern || '^\\d{4,}$');
  log('Regex de captura atualizada: ' + (pattern || '^\\d{4,}$'));
  res.json({ ok: true });
});

app.get('/groups', async (_req: Request, res: Response) => {
  try {
    await ensureReady();
    const chats = await client.getChats();
    const groups = (chats as any[])
      .filter(c => c.isGroup)
      .map(c => ({ id: c.id._serialized, name: c.name || '(sem nome)' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ ok: true, groups });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/set-group', async (req: Request, res: Response) => {
  const { groupId } = (req.body || {}) as { groupId?: string };
  if (!groupId) return res.status(400).json({ ok: false, error: 'groupId é obrigatório' });
  try {
    await ensureReady();
    const chat = await client.getChatById(groupId);
    const name = (chat as any)?.name || 'Grupo';
    setGroup(groupId, name);
    log(`Grupo salvo: ${name} (${groupId}).`);
    res.json({ ok: true, saved: { id: groupId, name } });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: 'ID inválido ou inacessível. Entre no grupo com esta conta e tente novamente.' });
  }
});

app.post('/select-group', async (req: Request, res: Response) => {
  const { groupId } = (req.body || {}) as { groupId?: string };
  if (!groupId) return res.status(400).json({ ok: false, error: 'groupId é obrigatório' });
  try {
    await ensureReady();
    const chat = await client.getChatById(groupId);
    const name = (chat as any)?.name || 'Grupo';
    setGroup(groupId, name);
    log(`Grupo salvo: ${name} (${groupId}).`);
    res.json({ ok: true, saved: { id: groupId, name } });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: 'ID inválido ou inacessível.' });
  }
});

app.post('/clear-group', (_req: Request, res: Response) => {
  clearGroup();
  log('Grupo salvo apagado.');
  res.json({ ok: true });
});

app.post('/join-invite', async (req: Request, res: Response) => {
  try {
    await ensureReady();
    const { invite } = (req.body || {}) as { invite?: string };
    if (!invite) return res.status(400).json({ ok: false, error: 'invite é obrigatório' });
    const codeMatch = invite.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
    const code = codeMatch ? codeMatch[1] : invite;
    log(`Tentando aceitar convite com código: ${code}`);
    // @ts-ignore — método não tipado em algumas versões
    const result = await client.acceptInvite(code);
    log(`Convite aceito? Resposta: ${result}`);
    const chats = await client.getChats();
    const groups = (chats as any[]).filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name }));
    res.json({ ok: true, code, groups });
  } catch (e: any) {
    log('Falha ao aceitar convite: ' + e.message);
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.post('/send-test', async (_req: Request, res: Response) => {
  try {
    await ensureReady();
    const cfg = readConfig();
    if (!cfg.groupId) return res.status(400).json({ ok: false, error: 'Nenhum grupo salvo.' });
    await client.sendMessage(cfg.groupId, '✅ Teste: o bot está ativo e consegue enviar mensagens aqui.');
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Execução manual do selenium + envio de PDF
app.post('/run-selenium', async (req: Request, res: Response) => {
  try {
    await ensureReady();
    const { codigo, pdfPath } = (req.body || {}) as { codigo?: string; pdfPath?: string };
    const cfg = readConfig();
    if (!cfg.groupId) return res.status(400).json({ ok: false, error: 'Nenhum grupo salvo para envio.' });

    if (!codigo && !pdfPath) {
      return res.status(400).json({ ok: false, error: 'Envie {codigo} ou {pdfPath}.' });
    }

    if (codigo) {
      await executarSelenium(codigo, cfg.groupId);
      return res.json({ ok: true });
    }

    if (pdfPath && fs.existsSync(pdfPath)) {
      const media = await MessageMedia.fromFilePath(pdfPath);
      await client.sendMessage(cfg.groupId, media, { caption: 'PDF enviado manualmente', sendMediaAsDocument: true });
      return res.json({ ok: true });
    }

    res.status(400).json({ ok: false, error: 'pdfPath não existe.' });
  } catch (e: any) {
    log('Falha no run-selenium: ' + e.message);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// -------------------- WebSocket de logs --------------------
io.on('connection', (socket) => {
  if (qrDataURL) socket.emit('qr', qrDataURL);
  log('UI conectada.');
});

// -------------------- Start --------------------
const PORT = Number(process.env.PORT || 3000);

// Persistência de credenciais RUB: salva matricula/senha no arquivo de configuração (src/data/config.json)
app.post('/set-creds', (req: Request, res: Response) => {
  try {
    const { user, pass } = req.body || {};
    if (!user || !pass) return res.status(400).json({ ok: false, error: 'user and pass required' });
    const cfg = setRubCreds(String(user), String(pass));
    log('Credenciais RUB salvas no servidor.');
    res.json({ ok: true, saved: { rubUser: cfg.rubUser ? true : false } });
  } catch (e: any) {
    console.error('Erro /set-creds', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/clear-creds', (req: Request, res: Response) => {
  try {
    const cfg = clearRubCreds();
    log('Credenciais RUB removidas do servidor.');
    res.json({ ok: true, cleared: true });
  } catch (e: any) {
    console.error('Erro /clear-creds', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
server.listen(PORT, () => {
  console.log('Servidor ouvindo em http://localhost:' + PORT);
});

// -------------------- Fechamento limpo --------------------
let _closing = false;
async function cleanExit(code = 0) {
  if (_closing) return;
  _closing = true;
  try { await client.destroy(); } catch { /* noop */ }
  process.exit(code);
}
process.once('SIGINT',  () => cleanExit(0));
process.once('SIGTERM', () => cleanExit(0));
process.on('uncaughtException', (err) => { console.error(err); cleanExit(1); });
process.on('unhandledRejection', (reason) => { console.error(reason); cleanExit(1); });
