/**
 * WPP Bot — © 2025 Urich
 * Ideia inicial: David
 * Implementação, refatorações e melhorias: Urich (Leonardo)
 * Automação RUB (Selenium): otimizada por Urich
 * Licença: MIT
 */

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const fs = require('fs');

// lê config do storage (usa rubUser/rubPass/storeIP quando não houver ENV)
const { readConfig } = require('./dist/storage'); // ajusta o caminho se necessário
const CFG = readConfig(); // tem autoMode, codeRegex, storeIP, groupId, rubUser, rubPass, etc. :contentReference[oaicite:1]{index=1}

const HEADLESS = (process.env.HEADLESS ?? '1') !== '0'; // HEADLESS=0 para ver o navegador
const DEBUG = (process.env.DEBUG ?? '0') === '1';

const baseDir = __dirname;
const downloadDir = path.resolve(baseDir, 'downloads');
const logsDir = path.resolve(baseDir, 'logs');
for (const d of [downloadDir, logsDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const chromeOptions = new chrome.Options();
if (HEADLESS) chromeOptions.addArguments('--headless=new');

chromeOptions.addArguments(
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-web-security',
  '--allow-running-insecure-content',
  '--ignore-certificate-errors',
  '--lang=pt-BR',
  '--window-size=1366,800',

  // Anti "Manter arquivo" + remove bolha de download
  '--safebrowsing-disable-download-protection',
  '--safebrowsing-disable-extension-blacklist',
  '--disable-features=DownloadBubble,DownloadBubbleV2,SafetyTips,OptimizationHints'
);

chromeOptions.setUserPreferences({
  // baixar PDF direto (não abrir no viewer)
  'plugins.always_open_pdf_externally': true,

  // download sem prompt e na pasta definida
  'download.prompt_for_download': false,
  'download.directory_upgrade': true,
  'download.default_directory': downloadDir,
  'profile.default_content_settings.popups': 0,

  // chaves que derrubam o bloqueio "Manter"
  'safebrowsing.enabled': false,
  'safebrowsing.disable_download_protection': true
});

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dumpDebug(driver, tag) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const shot = path.join(logsDir, `${ts}-${tag}.png`);
    const html = path.join(logsDir, `${ts}-${tag}.html`);
    const image = await driver.takeScreenshot();
    fs.writeFileSync(shot, image, 'base64');
    fs.writeFileSync(html, await driver.getPageSource(), 'utf8');
    console.log(`🧾 Debug salvo: ${shot} / ${html}`);
  } catch {}
}

async function findInFrames(driver, locator, timeout = 10000) {
  try { return await driver.wait(until.elementLocated(locator), timeout); } catch {}
  const frames = await driver.findElements(By.css('iframe, frame'));
  for (let i = 0; i < frames.length; i++) {
    try {
      await driver.switchTo().defaultContent();
      await driver.switchTo().frame(frames[i]);
      const el = await driver.wait(until.elementLocated(locator), 2000);
      return el;
    } catch {}
  }
  await driver.switchTo().defaultContent();
  throw new Error('Elemento não encontrado em nenhum frame.');
}

async function waitAny(driver, locators, timeoutEach = 4000) {
  for (const loc of locators) {
    try { return await findInFrames(driver, loc, timeoutEach); } catch {}
  }
  throw new Error('Nenhum dos seletores bateu.');
}

async function limparDownloads() {
  if (!fs.existsSync(downloadDir)) return;
  for (const f of fs.readdirSync(downloadDir)) {
    try { fs.unlinkSync(path.join(downloadDir, f)); } catch {}
  }
  console.log('🧹 Pasta de downloads limpa.');
}

function hasPdf() {
  const files = fs.readdirSync(downloadDir);
  const pdf = files.find(f => f.toLowerCase().endsWith('.pdf'));
  return pdf ? path.join(downloadDir, pdf) : null;
}
function hasCrdownload() {
  const files = fs.readdirSync(downloadDir);
  const tmp = files.find(f => f.toLowerCase().endsWith('.crdownload'));
  return tmp ? path.join(downloadDir, tmp) : null;
}
async function waitPdfOrCrdownload(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const p = hasPdf();
    if (p) return { path: p, isPdf: true };
    const c = hasCrdownload();
    if (c) return { path: c, isPdf: false };
    await delay(300);
  }
  throw new Error('PDF não apareceu a tempo.');
}

async function fazerLogin(driver) {
  const user = process.env.RUB_USER || CFG.rubUser || 'MATRICULA_AQUI';
  const pass = process.env.RUB_PASS || CFG.rubPass || 'SENHA_AQUI';

  const u = await waitAny(driver, [By.id('login-fld-usr'), By.css('input[name="usuario"]')], 8000);
  await u.sendKeys(user);

  const p = await waitAny(driver, [By.id('login-fld-pwd'), By.css('input[type="password"]')], 8000);
  await p.sendKeys(pass);

  const btn = await waitAny(driver, [By.id('login-vbtn-loginbtn'), By.css('button[type="submit"], .btnLogin')], 8000);
  await btn.click();
  console.log('🔐 Login enviado.');
  await delay(1200);
}

async function aguardarTelaProdutos(driver) {
  await delay(800);

  // usa a origem REAL (pós-login) – evita 10.48 vs 10.60 etc.
  const urlNow = new URL(await driver.getCurrentUrl());
  const origin = `${urlNow.protocol}//${urlNow.host}`;

  // força rota de produtos na mesma origem autenticada
  await driver.get(`${origin}/vue/#/core/op/produto`);

  // fallback sem hash
  try {
    await driver.wait(async () => (await driver.getCurrentUrl()).includes('/produto'), 5000);
  } catch {
    await driver.get(`${origin}/vue/core/op/produto`);
  }

  try {
    await waitAny(driver, [
      By.css('#master-vbtn-optionsdialogopenbutton'),
      By.css('[id*="optionsdialogopenbutton"]'),
      By.xpath("//*[contains(., 'Opções') or contains(., 'Filtros') or contains(., 'Produtos')]")
    ], 6000);
  } catch (e) {
    await dumpDebug(driver, 'pos-login');
    throw new Error('Tela de produtos não carregou (ver logs).');
  }
}

async function aplicarFiltros(driver, codigoFornecedor) {
  const btnFiltro = await waitAny(driver, [
    By.id('master-vbtn-optionsdialogopenbutton'),
    By.css('[id*="optionsdialogopenbutton"], .btnOptions, .btnFilter, a[onclick*="options"]')
  ], 6000);
  await btnFiltro.click();
  console.log('⏳ Botão de filtro aberto.');
  await delay(200);

  const selTipo = await waitAny(driver, [
    By.css('select.addNewFilter'),
    By.css('select[name*="filter"]')
  ], 4000);
  await selTipo.sendKeys('E'); // Estoque
  console.log('✅ Filtro "Estoque" selecionado.');
  await delay(150);

  const oper = await waitAny(driver, [
    By.css('select.operator'),
    By.css('select[name*="operator"]')
  ], 4000);
  await oper.sendKeys('m0'); // maior que zero
  console.log('✅ Operador "maior que zero".');
  await delay(150);

  const selFornecedor = await waitAny(driver, [
    By.css('select.addNewFilter'),
    By.css('select[name*="filter"]')
  ], 4000);
  await selFornecedor.sendKeys(`F${codigoFornecedor}`);
  console.log(`✅ Fornecedor "${codigoFornecedor}" aplicado.`);
  await delay(200);

  const apply = await waitAny(driver, [
    By.css('a.btnApply'),
    By.xpath("//a[contains(.,'Aplicar') or contains(.,'Apply')]"),
    By.css('button.apply, .btn.btn-primary')
  ], 4000);
  await apply.click();
  console.log('🔎 Filtros aplicados.');
  await delay(400);
}

const xPathPDF = '//*[@id="mainview"]/div[1]/div/div[1]/div/div[3]/div[3]/ul[2]/li[3]/a';
async function gerarPDF(driver) {
  const btn = await waitAny(driver, [
    By.xpath(xPathPDF),
    By.css('a[href*="pdf"], a.export-pdf, .btnPdf, .pdf'),
    By.xpath("//a[contains(.,'PDF') or contains(.,'Relatório')]")
  ], 6000);
  await btn.click();
  console.log('📥 PDF solicitado, aguardando arquivo...');
}

async function configurarDownloadViaCDP(driver) {
  try { await driver.createCDPConnection('page'); } catch {}
  try {
    await driver.sendDevToolsCommand('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir
    });
  } catch {}
  try {
    await driver.sendDevToolsCommand('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
      eventsEnabled: true
      // allowDangerousDownloads: true // dependendo do build
    });
  } catch {}
}

async function executar(codigoFornecedor) {
  if (!codigoFornecedor) throw new Error('Código do fornecedor não informado!');

  // Primeiro acesso: usa storeIP do config (ou ENV). Depois do login, passamos a usar o origin real.
  const initialIP = process.env.STORE_IP || CFG.storeIP || '127.0.0.1'; // :contentReference[oaicite:2]{index=2}

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();

  try {
    await configurarDownloadViaCDP(driver);
    await limparDownloads();

    console.log(`\n🌐 Iniciando processo para código: ${codigoFornecedor}`);
    await driver.get(`http://${initialIP}/vue/#/core/op/produto`);

    await fazerLogin(driver);
    await aguardarTelaProdutos(driver);

    await aplicarFiltros(driver, codigoFornecedor);
    await gerarPDF(driver);

    // espera por .pdf ou .crdownload
    const file = await waitPdfOrCrdownload(60000);
    let finalPath;
    if (file.isPdf) {
      finalPath = path.join(downloadDir, `${codigoFornecedor}.pdf`);
      try { fs.renameSync(file.path, finalPath); } catch { finalPath = file.path; }
    } else {
      finalPath = path.join(downloadDir, `${codigoFornecedor}.pdf`);
      try { fs.renameSync(file.path, finalPath); } catch {}
    }
    console.log(`✅ PDF pronto: ${finalPath}`);
  } catch (err) {
    console.error(`❌ Erro no código ${codigoFornecedor}:`, err.stack || err.message);
    if (DEBUG) await dumpDebug(driver, `erro-${codigoFornecedor}`);
    throw err;
  } finally {
    try { await driver.quit(); } catch {}
    console.log('🧹 Navegador fechado.');
  }
}

// Entrada (vários códigos separados por vírgula)
const codigosFornecedores = process.argv[2] ? process.argv[2].split(',') : [];
if (!codigosFornecedores.length) {
  console.error('❌ Informe ao menos um código de fornecedor (separados por vírgula).');
  process.exit(1);
}

(async () => {
  for (const codigo of codigosFornecedores) {
    await executar(codigo.trim());
  }
  console.log('\n🏁 Todos os processos finalizados.');
})();
