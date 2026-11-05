const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { StudioConnection } = require('./studio.cjs');
const { GeminiAgent } = require('./gemini-agent.cjs');


// Startup diagnostics are written to the user's local FORGE AI data directory,
// without API keys or other secrets. They help identify an app that exits silently.
function startupLog(message) {
  try {
    const directory = app.getPath('userData');
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, 'startup.log'), `[${new Date().toISOString()}] ${String(message)}\n`);
  } catch (_) { /* diagnostic logging must never prevent startup */ }
}
function startupFailure(error) {
  const message = error && (error.stack || error.message) || String(error);
  startupLog('STARTUP FAILURE: ' + message);
  if (process.env.FORGE_SMOKE_FILE) {
    try { fs.writeFileSync(process.env.FORGE_SMOKE_FILE, JSON.stringify({ status: 'error', message })); } catch (_) {}
  } else {
    try { dialog.showErrorBox('FORGE AI could not start', message + '\n\nDiagnostic log: %APPDATA%\\forge-ai-roblox\\startup.log'); } catch (_) {}
  }
}
process.on('uncaughtException', error => {
  startupFailure(error);
  app.exit(1);
});
process.on('unhandledRejection', reason => {
  startupLog('Unhandled rejection: ' + (reason?.stack || String(reason)));
});

const PORT = 43157;
let win;
let logs = [];
let authFile;
let token;
let logPath;
let server;
let gemini;
const send = () => { if (win && !win.isDestroyed()) win.webContents.send('forge:change', { status: studio.status, logs }); };
const record = (kind, message, details) => {
  const cleanDetails = details == null ? undefined : JSON.stringify(details).slice(0, 7000);
  logs.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), time: new Date().toISOString(), kind, message, details: cleanDetails });
  logs = logs.slice(0, 250);
  try { fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), { mode: 0o600 }); } catch (_) {}
  send();
};
const studio = new StudioConnection(record);
const wrap = async (fn) => { try { return { ok: true, data: await fn() }; } catch (e) { record('error', e.message); return { ok: false, error: e.message }; } };
async function approve(name, args) {
  const selected = await dialog.showMessageBox(win || undefined, {
    type: 'warning', title: 'Approve Roblox Studio modification',
    message: `Allow Claude / FORGE AI to run “${name}”?`,
    detail: `This tool may modify your open game.\n\nArguments (truncated):\n${JSON.stringify(args, null, 2).slice(0, 2600)}`,
    buttons: ['Deny', 'Allow once'], defaultId: 0, cancelId: 0, noLink: true
  });
  return selected.response === 1;
}
function authorized(req) {
  const ip = req.socket.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') return false;
  return req.headers.authorization === `Bearer ${token}` && req.headers.host === `127.0.0.1:${PORT}`;
}
function listenBridge() {
  server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!authorized(req)) { res.writeHead(403); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); if (body.length > 180000) req.destroy(); });
    req.on('end', async () => {
      let input = {};
      try { if (body) input = JSON.parse(body); } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
      let result;
      switch (req.url) {
        case '/status': result = { ok: true, data: studio.status }; break;
        case '/tools': result = await wrap(() => studio.listTools()); break;
        case '/execute': result = await wrap(() => studio.execute(input.name, input.args, approve)); break;
        default: res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return;
      }
      res.end(JSON.stringify(result));
    });
  });
  server.listen(PORT, '127.0.0.1', () => record('system', `Claude bridge listening only on 127.0.0.1:${PORT}`));
  server.on('error', err => record('error', `Claude bridge: ${err.message}`));
}
function installClaude() {
  const base = process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming');
  const configPath = path.join(base, 'Claude', 'claude_desktop_config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch (e) { throw new Error(`Claude config is not valid JSON. Fix it before continuing: ${e.message}`); }
  }
  config.mcpServers ||= {};
  const bridgePath = app.isPackaged
    ? path.join(process.resourcesPath, 'bridge-server.cjs')
    : path.join(__dirname, '..', 'dist-electron', 'bridge-server.cjs');
  if (!fs.existsSync(bridgePath)) throw new Error('Claude bridge bundle missing. Run npm run build first.');
  const command = app.isPackaged ? process.execPath : process.execPath;
  config.mcpServers.FORGE_AI = {
    command,
    args: [bridgePath],
    env: { ELECTRON_RUN_AS_NODE: '1', FORGE_AUTH_FILE: authFile }
  };
  if (fs.existsSync(configPath)) fs.copyFileSync(configPath, configPath + '.forge-backup');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  record('system', 'Claude Desktop configuration updated (restart Claude Desktop to activate).');
  return { configPath, bridgePath };
}
function createWindow() {
  win = new BrowserWindow({
    width: 1430, height: 900, minWidth: 960, minHeight: 650,
    backgroundColor: '#0b0d13', title: 'FORGE AI', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('preload-error', (_event, preloadPath, error) => startupLog('Preload error: ' + preloadPath + ' ' + error.message));
  win.webContents.on('render-process-gone', (_event, details) => startupLog('Renderer gone: ' + JSON.stringify(details)));
  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) startupFailure(new Error('Window load failed (' + code + '): ' + description + ' ' + url));
  });
  win.webContents.on('did-finish-load', () => {
    startupLog('Window HTML loaded');
    if (process.env.FORGE_SMOKE_FILE) {
      setTimeout(async () => {
        try {
          const valid = await win.webContents.executeJavaScript("!!window.forge && !!document.querySelector('.shell')");
          if (!valid) throw new Error('Renderer did not expose FORGE AI dashboard');
          fs.writeFileSync(process.env.FORGE_SMOKE_FILE, JSON.stringify({ status: 'ok', window: true, renderer: true }));
          startupLog('Packaged startup smoke test passed');
        } catch (error) {
          startupFailure(error);
        } finally { app.quit(); }
      }, 1800);
    }
  });
  if (process.env.FORGE_DEV === '1') win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
app.whenReady().then(() => {
  startupLog('FORGE AI main process starting; packaged=' + app.isPackaged);
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  logPath = path.join(dir, 'activity.json');
  try { logs = JSON.parse(fs.readFileSync(logPath, 'utf8')); if (!Array.isArray(logs)) logs = []; } catch { logs = []; }
  authFile = path.join(dir, 'bridge-auth.json');
  // Rotate token each app launch; stale bridge processes cannot reconnect.
  token = randomBytes(32).toString('hex');
  fs.writeFileSync(authFile, JSON.stringify({ token, port: PORT, created: Date.now() }), { mode: 0o600 });
  if (process.platform !== 'win32') record('system', 'Windows Studio MCP launcher required for connection.');
  gemini = new GeminiAgent({
    studio, approve, userData: dir, safeStorage, record,
    onEvent: event => { if (win && !win.isDestroyed()) win.webContents.send('forge:gemini:event', event); }
  });
  listenBridge(); createWindow();
  ipcMain.handle('forge:state', () => ({ ok: true, data: { status: studio.status, logs, bridgePort: PORT } }));
  ipcMain.handle('forge:connect', () => wrap(() => studio.connect()));
  ipcMain.handle('forge:disconnect', () => wrap(() => studio.disconnect()));
  ipcMain.handle('forge:tools', () => wrap(() => studio.listTools()));
  ipcMain.handle('forge:select-studio', (_, id) => wrap(() => studio.selectStudio(id)));
  ipcMain.handle('forge:execute', (_, name, args) => wrap(() => studio.execute(name, args, approve)));
  ipcMain.handle('forge:install-claude', () => wrap(() => installClaude()));
  ipcMain.handle('forge:open-claude', () => wrap(() => shell.openExternal('https://claude.ai/')));
  ipcMain.handle('forge:open-gemini-keys', () => wrap(() => shell.openExternal('https://aistudio.google.com/api-keys')));
  ipcMain.handle('forge:gemini:state', () => wrap(() => gemini.state()));
  ipcMain.handle('forge:gemini:key', (_, key) => wrap(() => gemini.setKey(key)));
  ipcMain.handle('forge:gemini:remove-key', () => wrap(() => gemini.removeKey()));
  ipcMain.handle('forge:gemini:model', (_, model) => wrap(() => gemini.setModel(model)));
  ipcMain.handle('forge:gemini:test', () => wrap(() => gemini.test()));
  ipcMain.handle('forge:gemini:send', (_, message) => wrap(() => gemini.send(message)));
  ipcMain.handle('forge:gemini:clear', () => wrap(() => gemini.clear()));
  ipcMain.handle('forge:gemini:stop', () => wrap(() => gemini.stop()));
}).catch(error => { startupFailure(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { studio.disconnect().catch(() => {}); if (server) server.close(); });
