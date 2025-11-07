// === Helpers base ===
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

// ===== Toasts =====
const toastHost = $('#toastHost');
function toast(title, msg = '', actions = []) {
  if (!toastHost) return alert(`${title}\n${msg || ''}`);
  toastHost.classList.remove('hidden');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    <div>
      <div class="title">${title}</div>
      ${msg ? `<div class="msg">${msg}</div>` : ''}
    </div>
    <div class="actions"></div>
  `;
  const actBox = el.querySelector('.actions');
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = a.className || 'secondary';
    b.textContent = a.label || 'Ok';
    b.addEventListener('click', () => { a.onClick?.(); el.remove(); if(!toastHost.childElementCount) toastHost.classList.add('hidden'); });
    actBox.appendChild(b);
  });
  if (!actions.length) {
    const b = document.createElement('button');
    b.className = 'secondary';
    b.textContent = 'Fechar';
    b.addEventListener('click', () => { el.remove(); if(!toastHost.childElementCount) toastHost.classList.add('hidden'); });
    actBox.appendChild(b);
  }
  toastHost.appendChild(el);
  while (toastHost.childElementCount > 4) toastHost.firstElementChild.remove();
  setTimeout(() => {
    if (document.visibilityState === 'visible') {
      el.remove();
      if (!toastHost.childElementCount) toastHost.classList.add('hidden');
    }
  }, 6000);
}

// ===== Logs =====
const logs = $('#logs');
function appendLog(line) {
  if (!logs) return;
  const ts = new Date().toLocaleTimeString();
  logs.textContent += `[${ts}] ${line}\n`;
  logs.scrollTop = logs.scrollHeight;
}
$('#btnCopyLogs')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(logs.textContent || ''); toast('Logs copiados', 'Conteúdo disponível na área de transferência.'); }
  catch { toast('Falhou copiar', 'Navegador bloqueou o clipboard (tente HTTPS ou use Ctrl+C).'); }
});
$('#btnClearLogs')?.addEventListener('click', () => { logs.textContent = ''; toast('Logs limpos'); });

// ===== API helper =====
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error; } catch (_){ msg = await res.text(); }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

// ===== Socket (logs/qr) =====
const socket = io();
socket.on('log', appendLog);
socket.on('qr', (dataURL) => {
  const qrBox = $('#qrBox');
  if (qrBox) qrBox.innerHTML = `<img src="${dataURL}" alt="QR" />`;
});

// ===== Tema persistente =====
(function initTheme() {
  const pref = localStorage.getItem('theme') || 'dark';
  if (pref === 'light') document.documentElement.classList.add('light');
})();
$('#btnTheme')?.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  const isLight = document.documentElement.classList.contains('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  toast('Tema alterado', `Agora em modo ${isLight ? 'claro' : 'escuro'}.`);
});

// ===== Credenciais (Matrícula & Senha) =====
const CREDS_KEY = 'wppbot.creds';
function readCreds() {
  try { return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}'); }
  catch { return {}; }
}
function writeCreds(obj) {
  localStorage.setItem(CREDS_KEY, JSON.stringify(obj || {}));
}
function hydrateCredsUI() {
  const { regId, password, savedAt } = readCreds();
  if ($('#regIdInput')) $('#regIdInput').value = regId || '';
  if ($('#passwordInput')) $('#passwordInput').value = password || '';
  const box = $('#credsSaved');
  if (box) {
    if (regId || password) {
      box.classList.remove('hidden');
      box.innerHTML = `<strong>Salvo:</strong> matrícula ${regId ? `<span class="mono">${regId}</span>` : '(vazio)'} — ${savedAt ? new Date(savedAt).toLocaleString() : ''}`;
    } else {
      box.classList.add('hidden');
      box.textContent = '';
    }
  }
}
$('#btnSaveCreds')?.addEventListener('click', async () => {
  const regId = $('#regIdInput')?.value.trim() || '';
  const password = $('#passwordInput')?.value || '';
  writeCreds({ regId, password, savedAt: Date.now() });
  hydrateCredsUI();
  // NOVO: salva também no servidor (config.json)
  try {
    await api('/set-creds', { method: 'POST', body: JSON.stringify({ user: regId, pass: password }) });
    appendLog('Credenciais RUB salvas no servidor.');
    toast('Acesso salvo', 'Matrícula e senha armazenadas no servidor.');
    await refreshStatus();
  } catch (e) {
    toast('Falha ao salvar no servidor', String(e?.message || e));
  }
});
$('#btnClearCreds')?.addEventListener('click', async () => {
  writeCreds({});
  hydrateCredsUI();
  try {
    await api('/clear-creds', { method: 'POST' });
    appendLog('Credenciais RUB limpas no servidor.');
    toast('Acesso limpo', 'Servidor e navegador.');
    await refreshStatus();
  } catch (e) {
    toast('Falha ao limpar no servidor', String(e?.message || e));
  }
});

// ===== KPIs / Status =====
async function refreshStatus() {
  try {
    const s = await api('/status');
    $('#connState').textContent = s.ready ? 'Conectado ao WhatsApp' : (s.authenticated ? 'Autenticando…' : 'Aguardando conexão…');

    if (s.qr && !$('#qrBox img')) {
      $('#qrBox').innerHTML = `<img src="${s.qr}" alt="QR" />`;
    }

    if (s.savedGroup) {
      $('#savedGroup').classList.remove('hidden');
      $('#savedGroup').textContent = `Grupo salvo: ${s.savedGroup.name} (${s.savedGroup.id})`;
    } else {
      $('#savedGroup').classList.add('hidden');
      $('#savedGroup').textContent = '';
    }

    if (s.store) {
      $('#storeSaved').classList.remove('hidden');
      $('#storeSaved').innerHTML = `IP salvo: <strong>${s.store.ip}</strong>${s.store.name ? ' — ' + s.store.name : ''}`;
      $('#storeNameInput').value = s.store.name || '';
      $('#storeIpInput').value = s.store.ip || '';
    } else {
      $('#storeSaved').classList.add('hidden');
      $('#storeSaved').textContent = '';
    }

    $('#autoToggle').checked = !!s.autoMode;
    $('#codeRegex').value = s.codeRegex || '^\\d{4,}$';

    // NOVO: badge de credenciais no servidor
    const badge = $('#serverCreds');
    if (badge) {
      if (s.hasRubCreds) {
        badge.classList.remove('hidden');
        badge.textContent = 'Credenciais RUB: salvas no servidor';
      } else {
        badge.classList.add('hidden');
        badge.textContent = '';
      }
    }
  } catch (e) {
    console.error(e);
    toast('Falha ao carregar status', e.message);
  }
}


// botões de topo
$('#btnRefreshAll')?.addEventListener('click', () => refreshStatus().then(() => toast('Status atualizado')));
$('#btnOpenWA')?.addEventListener('click', () => window.open('https://web.whatsapp.com/', '_blank'));

// ===== Grupos (lista/busca) =====
async function loadGroups() {
  try {
    const res = await api('/groups');
    const search = $('#searchGroup').value.trim().toLowerCase();
    const select = $('#groupsList');
    select.innerHTML = '';
    const list = Array.isArray(res.groups) ? res.groups : []; // tolerante
    list
      .filter(g => !search || (g.name || '').toLowerCase().includes(search))
      .forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = `${g.name} — ${g.id}`;
        select.appendChild(opt);
      });
    if (!select.children.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Nenhum grupo encontrado (escaneie o QR e tente atualizar).';
      select.appendChild(opt);
    }
  } catch (e) {
    toast('Erro ao listar grupos', e.message);
  }
}

// ===== Store IP handlers =====
$('#btnSaveIP')?.addEventListener('click', async () => {
  const name = $('#storeNameInput').value.trim();
  const ip = $('#storeIpInput').value.trim();
  if (!ip) return toast('Informe o IP');
  try {
    await api('/set-ip', { method: 'POST', body: JSON.stringify({ ip, name }) });
    appendLog(`IP salvo: ${ip}${name ? ' (' + name + ')' : ''}`);
    toast('IP salvo', `${ip}${name ? ' • ' + name : ''}`);
    await refreshStatus();
  } catch (e) {
    toast('Erro ao salvar IP', e.message);
  }
});
$('#btnClearIP')?.addEventListener('click', async () => {
  try {
    await api('/clear-ip', { method: 'POST' });
    appendLog('IP salvo apagado.');
    $('#storeNameInput').value = '';
    $('#storeIpInput').value = '';
    toast('IP limpo');
    await refreshStatus();
  } catch (e) {
    toast('Erro ao limpar IP', e.message);
  }
});

// ===== Auto + Regex =====
$('#autoToggle')?.addEventListener('change', async (e) => {
  try {
    await api('/set-auto', { method: 'POST', body: JSON.stringify({ on: e.target.checked }) });
    appendLog('Modo automático: ' + (e.target.checked ? 'ATIVO' : 'PAUSADO'));
    toast('Modo automático', e.target.checked ? 'Ativo' : 'Pausado');
  } catch (err) {
    toast('Erro ao alternar automático', err.message);
    await refreshStatus();
  }
});
$('#btnSaveRegex')?.addEventListener('click', async () => {
  const pattern = $('#codeRegex').value.trim();
  try {
    await api('/set-regex', { method: 'POST', body: JSON.stringify({ pattern }) });
    appendLog('Regex atualizada para: ' + pattern);
    toast('Regex salva', pattern);
    await refreshStatus();
  } catch (e) {
    toast('Erro ao salvar regex', e.message);
  }
});

// ===== Grupo handlers =====
$('#btnKnowId')?.addEventListener('click', () => {
  $('#knowIdPanel').classList.remove('hidden');
  $('#dontKnowPanel').classList.add('hidden');
});
$('#btnDontKnowId')?.addEventListener('click', async () => {
  $('#dontKnowPanel').classList.remove('hidden');
  $('#knowIdPanel').classList.add('hidden');
  await loadGroups();
});
$('#btnReloadGroups')?.addEventListener('click', loadGroups);
$('#searchGroup')?.addEventListener('input', loadGroups);

$('#btnSetGroup')?.addEventListener('click', async () => {
  const id = $('#groupIdInput').value.trim();
  if (!id) return toast('Informe o ID do grupo');
  try {
    const r = await api('/set-group', { method: 'POST', body: JSON.stringify({ groupId: id }) });
    appendLog(`Grupo salvo: ${r.saved.name} (${r.saved.id})`);
    toast('Grupo salvo', r.saved.name);
    await refreshStatus();
  } catch (e) {
    toast('Erro ao salvar grupo', e.message);
  }
});
$('#btnJoinInvite')?.addEventListener('click', async () => {
  const invite = $('#inviteInput').value.trim();
  if (!invite) return toast('Cole o link de convite.');
  try {
    const r = await api('/join-invite', { method: 'POST', body: JSON.stringify({ invite }) });
    appendLog(`Convite processado. Código: ${r.code}. Atualize a lista e selecione o grupo.`);
    toast('Convite aceito', 'Atualize e selecione o grupo.');
  } catch (e) {
    toast('Erro ao entrar por convite', e.message);
  }
});
$('#btnSelectGroup')?.addEventListener('click', async () => {
  const sel = $('#groupsList').value;
  if (!sel) return toast('Selecione um grupo.');
  try {
    const r = await api('/select-group', { method: 'POST', body: JSON.stringify({ groupId: sel }) });
    appendLog(`Grupo salvo: ${r.saved.name} (${r.saved.id})`);
    toast('Grupo salvo', r.saved.name);
    await refreshStatus();
  } catch (e) {
    toast('Erro ao selecionar grupo', e.message);
  }
});
$('#btnClearGroup')?.addEventListener('click', async () => {
  try {
    await api('/clear-group', { method: 'POST' });
    appendLog('Grupo salvo apagado.');
    toast('Grupo limpo');
    await refreshStatus();
  } catch (e) {
    toast('Erro ao limpar grupo', e.message);
  }
});

// ===== Envio de teste / Ping =====
$('#btnSendTest')?.addEventListener('click', async () => {
  try {
    await api('/send-test', { method: 'POST' });
    appendLog('Mensagem de teste enviada.');
    toast('Teste enviado', 'Verifique o grupo.');
    addHistory({ type: 'send-test', ok: true });
  } catch (e) {
    toast('Erro no teste', e.message);
    addHistory({ type: 'send-test', ok: false, err: String(e) });
  }
});
$('#btnPing')?.addEventListener('click', async () => {
  try {
    const r = await api('/ping', { method: 'POST' });
    appendLog(`Ping: ${r?.status || 'ok'}`);
    toast('Ping', r?.status || 'ok');
    addHistory({ type: 'ping', ok: true });
  } catch (e) {
    appendLog('Ping indisponível (adicione a rota /ping no servidor).');
    toast('Ping indisponível', 'Adicione a rota /ping no backend.');
    addHistory({ type: 'ping', ok: false, err: String(e) });
  }
});

// ===== Manutenção (UI) =====
async function postMaintenance(at, message, exitAfter) {
  await api('/announce-maintenance', {
    method: 'POST',
    body: JSON.stringify({ at, message, exitAfter })
  });
  appendLog(`Manutenção: ${at} — ${message || '(mensagem padrão)'}${exitAfter ? ' (encerrar após enviar)' : ''}`);
  addHistory({ type: 'maintenance', at, message: message || null, exitAfter: !!exitAfter });
}
$('#btnMaintNow')?.addEventListener('click', async () => {
  const msg = $('#maintMsg').value.trim() || null;
  const exitAfter = $('#maintExit').checked;
  try {
    await postMaintenance('agora', msg, exitAfter);
    toast('Aviso de manutenção', 'Enviado.');
    if (exitAfter) appendLog('O processo será encerrado após o envio do aviso.');
  } catch (e) { toast('Erro manutenção', e.message); }
});
$('#btnMaintSchedule')?.addEventListener('click', async () => {
  const when = $('#maintWhen').value.trim();
  if (!when) return toast('Preencha o "Quando". Ex.: em 30m, 2025-12-31 22:00, agora');
  const msg = $('#maintMsg').value.trim() || null;
  const exitAfter = $('#maintExit').checked;
  try {
    await postMaintenance(when, msg, exitAfter);
    appendLog(`Agendado: ${when}`);
    toast('Manutenção agendada', when);
    if (exitAfter) appendLog('O processo será encerrado após o envio do aviso.');
  } catch (e) { toast('Erro manutenção', e.message); }
});

// ===== Histórico (local) =====
const HIST_KEY = 'wppbot.history';
function readHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); }
  catch { return []; }
}
function writeHistory(arr) { localStorage.setItem(HIST_KEY, JSON.stringify(arr.slice(-200))); }
function addHistory(item) {
  const arr = readHistory();
  arr.push({ ts: Date.now(), ...item });
  writeHistory(arr);
  paintHistory();
}
function paintHistory() {
  const box = $('#history');
  if (!box) return;
  const arr = readHistory().slice(-10).reverse();
  if (!arr.length) {
    box.classList.add('muted');
    box.textContent = 'Sem registros (ainda).';
    return;
  }
  box.classList.remove('muted');
  box.innerHTML = arr.map(h => {
    const when = new Date(h.ts).toLocaleString();
    const status = h.ok === false ? '❌' : '✅';
    return `<div class="panel" style="margin-top:8px">
      <div><strong>${status} ${h.type}</strong> — <span class="mono">${when}</span></div>
      ${h.message ? `<div class="muted">${h.message}</div>` : ''}
      ${h.err ? `<div class="muted">Erro: ${h.err}</div>` : ''}
    </div>`;
  }).join('');
}
$('#btnExportHistory')?.addEventListener('click', () => {
  const data = readHistory();
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wppbot-history-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Histórico exportado', 'Arquivo JSON baixado.');
});
$('#btnClearHistory')?.addEventListener('click', () => {
  writeHistory([]);
  paintHistory();
  toast('Histórico limpo');
});

// ===== Evidências (TXT p/ Bloco de Notas) =====
function mask(str = '') {
  if (!str) return '(vazio)';
  if (str.length <= 2) return '*'.repeat(str.length);
  return str[0] + '*'.repeat(Math.max(1, str.length - 2)) + str.at(-1);
}
function downloadTXT(filename, text) {
  // Força CRLF e BOM UTF-8 p/ Notepad
  const withCrlf = text.replace(/\n/g, '\r\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + withCrlf], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Dialog dinâmico pra filtros
function showEvidenceDialog() {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <form method="dialog" style="min-width:280px">
      <h3 style="margin-top:0">Exportar evidências (.txt)</h3>
      <label>De (data/hora)</label>
      <input id="evFrom" type="datetime-local" />
      <label>Até (data/hora)</label>
      <input id="evTo" type="datetime-local" />
      <label class="row" style="margin-top:8px; align-items:center">
        <input id="evOnlyFails" type="checkbox" style="width:auto; margin-right:8px" />
        Apenas falhas
      </label>
      <label class="row" style="margin-top:6px; align-items:center">
        <input id="evOnlyMaint" type="checkbox" style="width:auto; margin-right:8px" />
        Apenas manutenção
      </label>
      <div class="row" style="margin-top:12px">
        <button value="cancel" class="secondary">Cancelar</button>
        <button id="evConfirm" value="ok">Exportar</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return new Promise(resolve => {
    dlg.querySelector('#evConfirm').addEventListener('click', () => {
      const from = dlg.querySelector('#evFrom').value;
      const to = dlg.querySelector('#evTo').value;
      const onlyFails = dlg.querySelector('#evOnlyFails').checked;
      const onlyMaint = dlg.querySelector('#evOnlyMaint').checked;
      resolve({
        from: from ? new Date(from).getTime() : null,
        to: to ? new Date(to).getTime() : null,
        onlyFails, onlyMaint
      });
    }, { once: true });
  });
}

function filterHistoryForEvidence(opts = {}) {
  const arr = readHistory(); // todos
  return arr.filter(h => {
    if (opts.from && h.ts < opts.from) return false;
    if (opts.to && h.ts > opts.to) return false;
    if (opts.onlyFails && !(h.ok === false)) return false;
    if (opts.onlyMaint && h.type !== 'maintenance') return false;
    return true;
  }).slice(-50); // limite razoável pro TXT
}

async function buildEvidenceText(opts = {}) {
  // 1) Status atual
  let s = {};
  try { s = await api('/status'); } catch (e) { appendLog('Erro ao obter status p/ evidências: ' + e.message); }
  const ready = s.ready ? 'Online' : (s.authenticated ? 'Autenticando' : 'Offline');

  // 2) Credenciais (localStorage) — senha mascarada
  const { regId, password, savedAt } = readCreds();
  const savedAtStr = savedAt ? new Date(savedAt).toLocaleString() : '-';

  // 3) Logs atuais (da UI)
  const logsText = (document.getElementById('logs')?.textContent || '').trim() || '(sem logs)';

  // 4) Histórico (com filtros)
  const filtered = filterHistoryForEvidence(opts);
  const histLines = filtered.length
    ? filtered.map((h, i) => {
        const when = new Date(h.ts).toLocaleString();
        const status = h.ok === false ? 'FALHA' : 'OK';
        return [
          `#${i+1}`,
          `  tipo   : ${h.type}`,
          `  status : ${status}`,
          `  quando : ${when}`,
          h.message ? `  msg    : ${h.message}` : null,
          h.err ?     `  erro   : ${h.err}`     : null
        ].filter(Boolean).join('\n');
      }).join('\n')
    : '(sem histórico no filtro)';

  // 5) Cabeçalho de filtro
  const filtHdr = [
    opts.from ? `de=${new Date(opts.from).toLocaleString()}` : null,
    opts.to ? `até=${new Date(opts.to).toLocaleString()}` : null,
    opts.onlyFails ? 'apenas_falhas' : null,
    opts.onlyMaint ? 'apenas_manutencao' : null
  ].filter(Boolean).join(' | ') || 'sem filtros';

  // 6) Montagem do TXT
  const lines = [
    `WPP Bot — Pacote de Evidências (TXT)`,
    `Gerado em: ${new Date().toLocaleString()}`,
    `Versão UI: ${document.getElementById('appVersion')?.textContent || '—'}`,
    `Filtros   : ${filtHdr}`,
    ``,
    `== STATUS ==`,
    `WhatsApp      : ${ready}`,
    `Auto Mode     : ${s.autoMode ? 'Ativo' : 'Pausado'}`,
    `Regex         : ${s.codeRegex || '^\\d{4,}$'}`,
    `Grupo         : ${s.savedGroup ? `${s.savedGroup.name} (${s.savedGroup.id})` : '(não salvo)'}`,
    `Loja/IP       : ${s.store ? `${s.store.name || 'Loja'} @ ${s.store.ip}` : '(não salvo)'}`,
    ``,
    `== ACESSO (LOCAL) ==`,
    `Matrícula     : ${regId || '(vazio)'}`,
    `Senha         : ${mask(password)}`,
    `Salvo em      : ${savedAtStr}`,
    ``,
    `== HISTÓRICO (filtrado) ==`,
    `${histLines}`,
    ``,
    `== LOGS ATUAIS ==`,
    `${logsText}`,
    ``,
    `Fim do relatório.`
  ];
  return lines.join('\n');
}

document.getElementById('btnExportEvidenceTxt')?.addEventListener('click', async () => {
  try {
    const opts = await showEvidenceDialog();
    const txt = await buildEvidenceText(opts);
    const suffix =
      (opts.onlyMaint ? 'maint-' : '') +
      (opts.onlyFails ? 'fails-' : '') +
      (opts.from ? new Date(opts.from).toISOString().slice(0,10) + '-' : '') +
      (opts.to ? new Date(opts.to).toISOString().slice(0,10) : '');
    const filename = `wppbot-evidencias-${suffix || ''}${Date.now()}.txt`;
    downloadTXT(filename, txt);
    toast('Evidências exportadas', 'Arquivo .txt baixado.');
  } catch (e) {
    toast('Erro ao exportar evidências', e.message);
  }
});

// ===== Shortcuts =====
// Ctrl+E: evidências | Ctrl+L: copiar logs | Ctrl+T: tema (ignora quando está digitando)
window.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  const typing = el && (/^(input|textarea)$/i.test(el.tagName) || el.isContentEditable);
  if (!e.ctrlKey || typing) return;
  const k = e.key.toLowerCase();
  if (k === 'e') { e.preventDefault(); $('#btnExportEvidenceTxt')?.click(); }
  if (k === 'l') { e.preventDefault(); $('#btnCopyLogs')?.click(); }
  if (k === 't') { e.preventDefault(); $('#btnTheme')?.click(); }
});

// ===== Boot =====
(function boot() {
  hydrateCredsUI();
  paintHistory();
  refreshStatus();
  setInterval(refreshStatus, 4000);
})();
