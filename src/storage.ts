/**
 * storage.ts
 * Persistência simples em data/config.json (grupo, IP da loja, modo automático, regex, credenciais RUB)
 * © 2025 Urich — MIT License
 */

import fs from 'fs';
import path from 'path';

// Alvo: src/data/config.json (em dev com tsx)
// Se quiser /data na raiz do projeto, troque para: path.join(__dirname, '..', 'data')
export const DATA_DIR = path.join(__dirname, 'data');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

export interface AppConfig {
  groupId?: string;
  groupName?: string;
  storeIP?: string;
  storeName?: string;
  autoMode: boolean;
  codeRegex: string;
  rubUser?: string;
  rubPass?: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    const initial: AppConfig = {
      autoMode: true,
      codeRegex: '^\\d{4,}$'
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

export function readConfig(): AppConfig {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw || '{}') as Partial<AppConfig>;

    // defaults
    if (typeof cfg.autoMode === 'undefined') cfg.autoMode = true;
    if (!cfg.codeRegex) cfg.codeRegex = '^\\d{4,}$';

    return cfg as AppConfig;
  } catch {
    return { autoMode: true, codeRegex: '^\\d{4,}$' };
  }
}

export function writeConfig(cfg: AppConfig): void {
  ensureDataDir();
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e: any) {
    console.error('Falha ao salvar config:', e.message);
  }
}

// -------------------- Setters específicos --------------------
export function setGroup(groupId: string, groupName: string): AppConfig {
  const cfg = readConfig();
  cfg.groupId = groupId;
  cfg.groupName = groupName;
  writeConfig(cfg);
  return cfg;
}

export function clearGroup(): AppConfig {
  const cfg = readConfig();
  delete cfg.groupId;
  delete cfg.groupName;
  writeConfig(cfg);
  return cfg;
}

export function setStoreIP(ip: string, name?: string): AppConfig {
  const cfg = readConfig();
  cfg.storeIP = ip;
  if (name) cfg.storeName = name;
  writeConfig(cfg);
  return cfg;
}

export function clearStoreIP(): AppConfig {
  const cfg = readConfig();
  delete cfg.storeIP;
  delete cfg.storeName;
  writeConfig(cfg);
  return cfg;
}

export function setAutoMode(on: boolean): AppConfig {
  const cfg = readConfig();
  cfg.autoMode = !!on;
  writeConfig(cfg);
  return cfg;
}

export function setCodeRegex(pattern?: string): AppConfig {
  const cfg = readConfig();
  cfg.codeRegex = pattern || '^\\d{4,}$';
  writeConfig(cfg);
  return cfg;
}

// -------------------- Credenciais RUB (opcional) --------------------
export function setRubCreds(user: string, pass: string): AppConfig {
  const cfg = readConfig();
  cfg.rubUser = user;
  cfg.rubPass = pass;
  writeConfig(cfg);
  return cfg;
}

export function clearRubCreds(): AppConfig {
  const cfg = readConfig();
  delete cfg.rubUser;
  delete cfg.rubPass;
  writeConfig(cfg);
  return cfg;
}
