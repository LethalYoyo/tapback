const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, protocol, net, session, globalShortcut, dialog, powerMonitor, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { Storage } = require('./storage.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'tapback', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.setName('TapBack');
if (process.env.TAPBACK_TEST_DATA) app.setPath('userData', process.env.TAPBACK_TEST_DATA);
let win, tray, store, settings, cleanSettings, quitting = false, sensor, sensorTimer, running = false;
let stats = { total: 0, best: 0 }, sensorStatus = { type: 'idle', message: 'Sensor has not been checked.' };
const dev = !app.isPackaged && process.env.TAPBACK_DEV === '1';
const origin = dev ? 'http://127.0.0.1:5173' : 'tapback://app';
const allowed = url => { try { const u = new URL(url); return dev ? u.origin === origin : u.protocol === 'tapback:' && u.hostname === 'app'; } catch { return false; } };
const send = (channel, value) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };
function show() { win?.show(); win?.focus(); }
function menu() {
  if (!tray) return;
  tray.setToolTip(`TapBack · ${settings?.mute ? 'Muted' : running ? 'Listening' : 'Paused'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open TapBack', click: show },
    { label: running ? 'Pause listening' : 'Start listening', click: () => send('action', 'toggle') },
    { label: 'Play a reaction', click: () => send('action', 'tap') },
    { label: settings?.mute ? 'Unmute' : 'Mute', click: () => send('action', 'mute') },
    { type: 'separator' }, { label: 'Quit TapBack', click: () => app.quit() }
  ]));
}
function stopSensor() {
  clearTimeout(sensorTimer);
  if (sensor) { const old = sensor; sensor = null; old.kill(); }
}
function startSensor() {
  stopSensor();
  const root = app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(__dirname, '..', 'native');
  let command, args;
  if (process.platform === 'darwin') { command = path.join(root, 'tapback-sensor'); args = []; }
  else if (process.platform === 'win32') {
    command = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', path.join(root, 'windows-sensor.ps1'), '-ParentId', String(process.pid)];
  } else return Promise.resolve({ type: 'unavailable', message: 'Native sensors are supported on macOS and Windows. Use microphone mode.' });
  return new Promise(resolve => {
    let settled = false, buffer = '';
    function status(value) {
      sensorStatus = value; send('sensor', value);
      if (!settled) { settled = true; resolve(value); }
    }
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); sensor = child;
    function timeout() {
      status({ type: 'unavailable', message: 'No sensor readings received. Try microphone mode.' }); stopSensor();
    }
    sensorTimer = setTimeout(timeout, 7000);
    child.stdout.on('data', chunk => {
      if (sensor !== child) return;
      buffer += chunk.toString('utf8');
      if (buffer.length > 32768) { timeout(); return; }
      let boundary;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary).replace(/^\uFEFF/, ''); buffer = buffer.slice(boundary + 1);
        try {
          const data = JSON.parse(line);
          if (data.type === 'sample' && [data.x, data.y, data.z].every(n => Number.isFinite(n) && Math.abs(n) <= 32)) {
            clearTimeout(sensorTimer); sensorTimer = setTimeout(timeout, 4000);
            send('sensor', data);
          } else if (['ready', 'unavailable'].includes(data.type)) {
            status({ type: data.type, message: String(data.message).slice(0, 220) });
            if (data.type === 'unavailable') stopSensor();
          }
        } catch { /* Ignore non-protocol diagnostic lines. */ }
      }
    });
    child.on('error', () => { if (sensor === child) { status({ type: 'unavailable', message: 'The sensor helper could not start. Use microphone mode.' }); stopSensor(); } });
    child.on('exit', () => {
      if (!settled) { settled = true; resolve({ type: 'unavailable', message: 'Sensor stopped before connecting.' }); }
      if (sensor === child) { status({ type: 'unavailable', message: 'Sensor disconnected. Start again or use microphone mode.' }); stopSensor(); }
    });
  });
}
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame || !allowed(event.senderFrame.url)) throw new Error('Untrusted request.');
    return fn(...args);
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', show);
  app.whenReady().then(async () => {
    ({ cleanSettings } = await import('../shared/core.mjs'));
    store = new Storage(app.getPath('userData')); await store.init();
    let saved = {};
    try { saved = JSON.parse(await fs.readFile(path.join(store.root, 'settings.json'), 'utf8')); } catch { /* First run. */ }
    settings = cleanSettings(saved);
    try { const s = JSON.parse(await fs.readFile(path.join(store.root, 'stats.json'), 'utf8')); stats = { total: Math.max(0, Number(s.total) || 0), best: Math.max(0, Number(s.best) || 0) }; } catch { /* First run. */ }
    const dist = path.join(__dirname, '..', 'dist');
    protocol.handle('tapback', request => {
      const url = new URL(request.url);
      if (url.hostname !== 'app' || !['GET', 'HEAD'].includes(request.method)) return new Response('Forbidden', { status: 403 });
      let file;
      try { file = path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { return new Response('Invalid path', { status: 400 }); }
      if (!file.startsWith(dist + path.sep)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(contents === win?.webContents && allowed(details.requestingUrl || contents.getURL()) && permission === 'media' && details.mediaTypes?.every(t => t === 'audio') === true);
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => contents === win?.webContents && allowed(requestingOrigin) && permission === 'media' && (!details.mediaType || details.mediaType === 'audio'));
    win = new BrowserWindow({ width: 1200, height: 820, minWidth: 920, minHeight: 680, backgroundColor: '#f7f6f2', title: 'TapBack', titleBarStyle: 'hiddenInset', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) event.preventDefault(); });
    win.on('close', event => { if (!quitting && tray) { event.preventDefault(); win.hide(); } });
    win.webContents.on('render-process-gone', () => { stopSensor(); running = false; menu(); win.reload(); });
    const icon = nativeImage.createFromPath(path.join(dist, process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')).resize({ width: 22, height: 22 });
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon); tray.on('click', show); menu();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ label: 'TapBack', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }] }] : []),
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }
    ]));
    handle('state', () => ({ settings, clips: store.clips, stats, platform: process.platform, version: app.getVersion(), sensor: sensorStatus, shortcuts }));
    handle('settings', value => store.serial(async () => {
      const next = cleanSettings(value);
      if (next.launchAtLogin !== settings.launchAtLogin) {
        if (!app.isPackaged) throw new Error('Launch at login is available in the packaged app.');
        app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
      }
      await store.json('settings', next); settings = next; menu(); return settings;
    }));
    handle('stats', value => store.serial(async () => {
      if (!value || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.best) || value.total < 0 || value.best < 0) throw new Error('Invalid statistics.');
      stats = { total: value.total, best: value.best }; await store.json('stats', stats);
    }));
    handle('clip:save', (meta, bytes) => store.serial(() => store.add(meta, bytes)));
    handle('clip:read', id => store.read(id));
    handle('clip:update', (id, changes) => store.serial(() => store.update(id, changes || {})));
    handle('clip:delete', id => store.serial(() => store.remove(id)));
    handle('pack:export', async () => {
      if (!store.clips.length) throw new Error('Record or import a sound first.');
      const result = await dialog.showSaveDialog(win, { defaultPath: 'My TapBack sounds.tapback', filters: [{ name: 'TapBack sound pack', extensions: ['tapback'] }] });
      if (result.canceled || !result.filePath) return false;
      await fs.writeFile(result.filePath, JSON.stringify(await store.exportPack())); return true;
    });
    handle('pack:import', async () => {
      const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'TapBack sound pack', extensions: ['tapback'] }] });
      if (result.canceled || !result.filePaths[0]) return null;
      const file = result.filePaths[0];
      if ((await fs.stat(file)).size > 56 * 1024 * 1024) throw new Error('That pack is too large.');
      const pack = JSON.parse(await fs.readFile(file, 'utf8'));
      return store.serial(() => store.importPack(pack));
    });
    handle('sensor:start', startSensor); handle('sensor:stop', stopSensor);
    handle('microphone', async () => process.platform !== 'darwin' || await systemPreferences.askForMediaAccess('microphone'));
    handle('status', value => { running = value === true; menu(); });
    handle('hide', () => win.hide());
    const shortcuts = {};
    for (const [key, action] of [['CommandOrControl+Alt+T', 'tap'], ['CommandOrControl+Alt+M', 'mute'], ['CommandOrControl+Alt+P', 'toggle']]) shortcuts[action] = globalShortcut.register(key, () => send('action', action));
    powerMonitor.on('suspend', () => { stopSensor(); send('action', 'pause'); });
    powerMonitor.on('lock-screen', () => { stopSensor(); send('action', 'pause'); });
    await win.loadURL(dev ? origin : 'tapback://app/index.html');
    app.on('activate', show);
  }).catch(error => { dialog.showErrorBox('TapBack could not start', error.message); app.quit(); });
}
app.on('before-quit', () => { quitting = true; stopSensor(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
