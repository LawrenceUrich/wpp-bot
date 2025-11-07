// manager.ts — Supervisor do wpp-bot-ui
// Start/stop/status/update + logs SSE, sem loop infinito.
// © 2025 Urich — MIT

import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

// ---------- Config ----------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'ADMIN12';
const PORT = Number(process.env.MANAGER_PORT || 3030);
const ROOT = process.cwd();
const AUTO_START = process.env.MANAGER_AUTO_START !== '0'; // default: true

// ---------- Utils ----------
function npmBin(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}
function npxBin(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

type StartCmd = { cmd: string; args: string[]; display: string; shell?: boolean };

function resolveStartCmd(): StartCmd {
  const distServer = path.join(ROOT, 'dist', 'server.js');
  const jsServer   = path.join(ROOT, 'server.js');
  const tsServer   = path.join(ROOT, 'src', 'server.ts');

  if (fs.existsSync(distServer)) {
    return { cmd: process.execPath, args: [distServer], display: 'node dist/server.js' };
  }
  if (fs.existsSync(jsServer)) {
    return { cmd: process.execPath, args: [jsServer], display: 'node server.js' };
  }
  // Fallback DEV: usar shell pra não dar EINVAL em Windows/pastas com espaço
  return { cmd: npxBin(), args: ['tsx', tsServer], display: 'npx tsx src/server.ts', shell: true };
}

// ---------- App ----------
const app = express();
app.use(cors());
app.use(express.json());

// ---------- Estado ----------
let child: ChildProcess | null = null;
let restarting = false;
let updatedThisCrash = false;
let restarts: number[] = [];
const MAX_RESTARTS_PER_HOUR = 5;

// ---------- SSE Logs ----------
type SSEClient = Response;
const clients = new Set<SSEClient>();

function sse(res: Response) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

function send(line: string) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  for (const res of clients) res.write(`data: ${msg}\n\n`);
}

// ---------- Auth ----------
const auth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const hdr = (req.headers['x-admin-token'] as string) || '';
  const q = (req.query?.token as string) || '';
  if (hdr === ADMIN_TOKEN || q === ADMIN_TOKEN) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
};

// ---------- Restart control ----------
function canRestart(): boolean {
  const now = Date.now();
  restarts = restarts.filter(t => now - t < 3600_000);
  return restarts.length < MAX_RESTARTS_PER_HOUR;
}
function backoffMs(): number {
  const n = Math.min(restarts.length + 1, 5);
  return [2000, 5000, 10000, 20000, 30000][n - 1];
}

// ---------- Lifecycle ----------
function startBot() {
  if (child || restarting) return;
  restarting = true;

  if (!canRestart()) {
    send('⚠️ Limite de restarts/h atingido. Aguardando 10min.');
    setTimeout(() => (restarting = false), 600_000);
    return;
  }

  const wait = backoffMs();
  const start = resolveStartCmd();
  send(`🚀 Iniciando bot (${start.display}) em ${wait / 1000}s...`);

  setTimeout(() => {
    restarts.push(Date.now());
    updatedThisCrash = false;

    // env herdado + proteção para Puppeteer no Windows
    const env = { ...process.env };
    if (process.platform === 'win32' && !env.PUPPETEER_EXECUTABLE_PATH) {
      const chromeDefault = 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';
      if (fs.existsSync(chromeDefault)) {
        env.PUPPETEER_EXECUTABLE_PATH = chromeDefault;
        send('ℹ️ Definindo PUPPETEER_EXECUTABLE_PATH (Chrome padrão do Windows).');
      }
    }

    child = spawn(start.cmd, start.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT,
      env,
      shell: !!start.shell
    });

    child.stdout?.on('data', d => send(d.toString().trimEnd()));
    child.stderr?.on('data', d => send('[stderr] ' + d.toString().trimEnd()));

    child.on('exit', (code, sig) => {
      send(`⛔ Bot saiu (code=${code}, sig=${sig || 'none'})`);
      const normal = code === 0 || sig === 'SIGTERM';
      child = null;

      if (normal) {
        restarting = false;
        return;
      }

      if (!updatedThisCrash) {
        // 1 tentativa de update por queda (evita loop infinito)
        updatedThisCrash = true;
        npmUpdate()
          .then(() => {
            send('✅ Update ok. Reiniciando uma vez.');
            restarting = false;
            startBot();
          })
          .catch(err => {
            send('❌ Update falhou: ' + err);
            restarting = false;
          });
      } else {
        send('🟡 Já atualizei nesta queda. Parando para ação manual.');
        restarting = false;
      }
    });

    restarting = false;
    send('✅ Bot iniciado.');
  }, wait);
}

function stopBot(): boolean {
  if (!child) return false;
  try {
    child.kill('SIGTERM');
    send('🛑 Sinal de parada enviado.');
    return true;
  } catch (e: any) {
    send('❌ Falha ao parar: ' + e.message);
    return false;
  }
}

function npmUpdate(): Promise<void> {
  return new Promise((resolve, reject) => {
    send('🔄 Rodando: npm update whatsapp-web.js');
    const p = spawn(npmBin(), ['update', 'whatsapp-web.js'], { shell: true, cwd: ROOT, env: process.env });
    p.stdout?.on('data', d => send(d.toString().trimEnd()));
    p.stderr?.on('data', d => send('[stderr] ' + d.toString().trimEnd()));
    p.on('close', code => (code === 0 ? resolve() : reject('exit ' + code)));
  });
}

// ---------- API ----------
app.get('/api/logs', auth, (_req: Request, res: Response) => {
  sse(res);
  send('👀 Cliente conectado aos logs.');
});

app.get('/api/status', auth, (_req: Request, res: Response) => {
  res.json({
    ok: true,
    running: !!child,
    restartsLastHour: restarts.filter(t => Date.now() - t < 3600_000).length
  });
});

app.post('/api/start', auth, (_req: Request, res: Response) => {
  startBot();
  res.json({ ok: true });
});

app.post('/api/stop', auth, (_req: Request, res: Response) => {
  const r = stopBot();
  res.json({ ok: r });
});

app.post('/api/update', auth, async (_req: Request, res: Response) => {
  try {
    if (child) stopBot();
    await npmUpdate();
    updatedThisCrash = true; // evita laço no on('exit')
    startBot();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/restart', auth, async (_req: Request, res: Response) => {
  try {
    if (child) stopBot();
    // pequena janela pra porta liberar/recursos fecharem
    setTimeout(() => startBot(), 800);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---------- START ----------
app.listen(PORT, () => {
  send(`👩‍✈️ Manager ouvindo em http://localhost:${PORT}`);
  if (AUTO_START) {
    startBot(); // sobe o bot automaticamente (defaut)
  } else {
    send('⏸️ Auto-start desativado (MANAGER_AUTO_START=0).');
  }
});
