const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, nativeImage, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('./lib/store');
const yt = require('./lib/ytdlp');
const vbcable = require('./lib/vbcable');
const { startServer, PORT } = require('./lib/server');

const SETTING_KEYS = ['micDeviceId', 'cableDeviceId', 'speakerDeviceId', 'micEnabled', 'monitorMic',
  'masterVolume', 'micGain', 'soundsToMic', 'soundsToSpeakers', 'retrigger', 'stopKey'];

let store, win, tray, quitting = false, hotkeyIssues = {}, soundsDir;

function publicState() {
  return { sounds: store.data.sounds, settings: store.data.settings, issues: hotkeyIssues, port: PORT, tools: yt.status() };
}
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function broadcast() { send('state', publicState()); }

function registerHotkeys() {
  globalShortcut.unregisterAll();
  hotkeyIssues = {};
  const used = new Set();
  const bind = (key, issueId, fn) => {
    if (!key) return;
    if (used.has(key)) { hotkeyIssues[issueId] = `"${key}" is already assigned to another sound`; return; }
    let ok = false;
    try { ok = globalShortcut.register(key, fn); } catch { /* invalid accelerator */ }
    if (ok) used.add(key); else hotkeyIssues[issueId] = `"${key}" could not be registered (in use by another app?)`;
  };
  for (const s of store.data.sounds) bind(s.key, s.id, () => send('trigger', s.id));
  bind(store.data.settings.stopKey, 'stop', () => send('stop-all'));
}

function addSound({ name, file, key = '', source, thumb }) {
  const sound = { id: path.parse(file).name, name: name || 'New sound', file, key, volume: 1, source, thumb };
  store.data.sounds.push(sound);
  store.save();
  registerHotkeys();
  broadcast();
  return sound;
}

async function handleClip({ url, start, end, name, key, thumbnail }) {
  const id = crypto.randomUUID();
  send('toast', 'Downloading clip…');
  const file = await yt.downloadClip({ url, start, end, outDir: soundsDir, id });
  let thumb;
  const warnings = [];
  if (thumbnail) {
    try { thumb = await yt.downloadThumbnail({ url, outDir: soundsDir, id }); }
    catch { warnings.push('Could not download the thumbnail.'); }
  }
  const taken = key && store.data.sounds.some((s) => s.key === key);
  if (taken) warnings.push('That key was already in use, so none was assigned.');
  const sound = addSound({ name: name || 'YouTube clip', file, key: taken ? '' : key, source: { url, start, end }, thumb });
  send('toast', `Added "${sound.name}"`);
  return { sound: { id: sound.id, name: sound.name }, warning: warnings.join(' ') || undefined };
}

// Square 144px PNG of a sound's thumbnail, sized for a Stream Deck key.
const keyThumbs = new Map();
function keyThumbnail(id) {
  const s = store.data.sounds.find((x) => x.id === id);
  if (!s || !s.thumb) return null;
  if (keyThumbs.has(id)) return keyThumbs.get(id);
  const img = nativeImage.createFromPath(path.join(soundsDir, path.basename(s.thumb)));
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  const png = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
    .resize({ width: 144, height: 144, quality: 'best' }).toPNG();
  keyThumbs.set(id, png);
  return png;
}

function streamDeckPluginPath() {
  const candidates = [path.join(process.resourcesPath || '', 'bin'), path.join(__dirname, 'build-tools')];
  for (const dir of candidates) {
    const p = path.join(dir, 'YTSoundboard.streamDeckPlugin');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Carry sounds and settings over from the app's old name.
function migrateOldData() {
  const target = app.getPath('userData');
  const old = path.join(path.dirname(target), 'autosoundboard');
  if (fs.existsSync(path.join(target, 'config.json')) || !fs.existsSync(path.join(old, 'config.json'))) return;
  try {
    // Only our own data: the rest of the old folder is Chromium cache and may hold locked files.
    fs.cpSync(path.join(old, 'sounds'), path.join(target, 'sounds'), { recursive: true });
    fs.copyFileSync(path.join(old, 'config.json'), path.join(target, 'config.json'));
  } catch { /* start fresh if copy fails */ }
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.on('update-available', () => send('toast', 'Update found, downloading…'));
  autoUpdater.on('update-downloaded', (info) => send('update-ready', info.version));
  autoUpdater.on('error', () => { /* offline or no release: stay quiet */ });
  ipcMain.handle('update:install', () => { quitting = true; autoUpdater.quitAndInstall(); });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 820, minHeight: 560,
    backgroundColor: '#14161c', title: 'YTSoundboard',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,           // keep audio + hotkeys responsive while hidden
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')));
  tray.setToolTip('YTSoundboard');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => win.show() },
    { label: 'Stop all sounds', click: () => send('stop-all') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', () => win.show());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');

    migrateOldData();
    store = new Store(app.getPath('userData'));
    soundsDir = path.join(app.getPath('userData'), 'sounds');
    fs.mkdirSync(soundsDir, { recursive: true });
    yt.init(path.join(app.getPath('userData'), 'bin'));

    startServer({
      onClip: handleClip,
      getInfo: () => ({ sounds: store.data.sounds.length, tools: yt.status() }),
      api: {
        list: () => store.data.sounds.map((s) => ({ id: s.id, name: s.name, key: s.key, thumb: !!s.thumb })),
        play: (id) => {
          if (!store.data.sounds.some((s) => s.id === id)) return false;
          send('trigger', id);
          return true;
        },
        stop: () => send('stop-all'),
        thumb: (id) => keyThumbnail(id)
      }
    });
    createWindow();
    createTray();
    registerHotkeys();
    setupAutoUpdate();

    ipcMain.handle('state:get', () => publicState());

    ipcMain.handle('settings:set', (_e, patch) => {
      for (const k of SETTING_KEYS) if (k in patch) store.data.settings[k] = patch[k];
      store.save();
      registerHotkeys();
      broadcast();
    });

    ipcMain.handle('sound:read', (_e, id) => {
      const s = store.data.sounds.find((x) => x.id === id);
      if (!s) return null;
      return fs.readFileSync(path.join(soundsDir, path.basename(s.file)));
    });

    ipcMain.handle('sound:thumb', (_e, id) => {
      const s = store.data.sounds.find((x) => x.id === id);
      if (!s || !s.thumb) return null;
      try { return 'data:image/jpeg;base64,' + fs.readFileSync(path.join(soundsDir, path.basename(s.thumb))).toString('base64'); }
      catch { return null; }
    });

    ipcMain.handle('sound:update', (_e, id, patch) => {
      const s = store.data.sounds.find((x) => x.id === id);
      if (!s) return;
      if (typeof patch.name === 'string') s.name = patch.name.slice(0, 80);
      if (typeof patch.key === 'string') s.key = patch.key;
      if (typeof patch.volume === 'number') s.volume = Math.max(0, Math.min(2, patch.volume));
      store.save();
      registerHotkeys();
      broadcast();
    });

    ipcMain.handle('sound:delete', (_e, id) => {
      const i = store.data.sounds.findIndex((x) => x.id === id);
      if (i < 0) return;
      const [s] = store.data.sounds.splice(i, 1);
      for (const f of [s.file, s.thumb]) {
        if (f) try { fs.unlinkSync(path.join(soundsDir, path.basename(f))); } catch { /* already gone */ }
      }
      store.save();
      registerHotkeys();
      broadcast();
    });

    ipcMain.handle('sound:import', async () => {
      const r = await dialog.showOpenDialog(win, {
        title: 'Add sound files', properties: ['openFile', 'multiSelect'],
        filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus'] }]
      });
      if (r.canceled) return;
      for (const src of r.filePaths) {
        const id = crypto.randomUUID();
        const file = id + path.extname(src).toLowerCase();
        fs.copyFileSync(src, path.join(soundsDir, file));
        addSound({ name: path.parse(src).name, file });
      }
    });

    ipcMain.handle('hotkeys:suspend', (_e, on) => { if (on) globalShortcut.unregisterAll(); else registerHotkeys(); });

    ipcMain.handle('streamdeck:install', async () => {
      const p = streamDeckPluginPath();
      if (!p) return send('toast', 'Stream Deck plugin file not found');
      const err = await shell.openPath(p);   // the Stream Deck app handles .streamDeckPlugin files
      send('toast', err ? 'Could not open the plugin. Is the Stream Deck app installed?' : 'Confirm the install in the Stream Deck app');
    });

    ipcMain.handle('cable:install', async () => {
      try { await vbcable.install((m) => send('toast', m)); } catch (e) { send('toast', 'Virtual mic install failed: ' + e.message); }
    });

    ipcMain.handle('tools:install', async () => {
      try { await yt.install(); send('toast', 'yt-dlp installed'); } catch (e) { send('toast', 'Install failed: ' + e.message); }
      broadcast();
    });
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* stay in tray */ });
}
