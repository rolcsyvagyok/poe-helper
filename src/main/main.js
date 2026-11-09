'use strict';
const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, screen, Tray, Menu, nativeImage, shell, safeStorage, Notification, dialog, session, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const { createServices } = require('./services');

// ---------- poelab through Chromium ----------
// poelab is behind Cloudflare, which turns some plain requests away (403), e.g. on a new network.
// Then the page is opened in a hidden window, like any browser would, and the picture is fetched with
// the same session (Cloudflare's pass is a cookie, kept in its own partition). If Cloudflare wants a
// click ("Verify you are human"), the window shows itself so you can do it, then closes.
const LAB_PARTITION = 'persist:poelab';
const labWait = (ms) => new Promise((r) => setTimeout(r, ms));
const isChallenge = (html) => /cf-challenge|challenge-platform|Just a moment|Verify you are human|cf-turnstile/i.test(html) && !/wp-content\/labfiles/i.test(html);
const labBrowser = {
  async text(url) {
    if (!/^https:\/\/www\.poelab\.com\//.test(url)) throw new Error('Only poelab pages are opened this way.');
    const win = new BrowserWindow({ show: false, width: 520, height: 640, title: 'poelab check', autoHideMenuBar: true,
      webPreferences: { partition: LAB_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    try {
      await win.loadURL(url).catch(() => {});
      const start = Date.now();
      let shown = false;
      while (Date.now() - start < 120000) {
        if (win.isDestroyed()) throw new Error('The poelab check window was closed.');
        const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => '');
        if (html && !isChallenge(html)) return html;
        if (!shown && Date.now() - start > 8000) { shown = true; win.show(); win.focus(); }
        await labWait(700);
      }
      throw new Error('poelab\'s Cloudflare check didn\'t finish. Open poelab.com once in your browser, then try again.');
    } finally { if (!win.isDestroyed()) win.destroy(); }
  },
  async buffer(url, referer) {
    if (!/^https:\/\/www\.poelab\.com\//.test(url)) throw new Error('Only poelab pictures are loaded this way.');
    const r = await session.fromPartition(LAB_PARTITION).fetch(url, { headers: referer ? { Referer: referer } : {} });
    if (!r.ok) throw new Error(`poelab's picture answered ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  },
};
const { isPoeItemText } = require('../core/item-parser');
const { sendCopy, hasKeySender, onMouse, stopHook } = require('./keys');
const { AuthError } = require('../core/ggg');
const Hotkey = require('../renderer/hotkey');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let services;
let mainWin = null;
let overlay = null;
let tray = null;
let clipboardTimer = null;
let lastClipboard = '';
let suppressClipboardUntil = 0;
let quitting = false;
let updater = null;

const secrets = {
  encrypt(s) {
    if (!s) return null;
    if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(s).toString('base64');
    return 'plain:' + Buffer.from(s).toString('base64');
  },
  decrypt(v) {
    if (!v) return null;
    try {
      if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
      if (v.startsWith('plain:')) return Buffer.from(v.slice(6), 'base64').toString('utf8');
    } catch { /* fallthrough */ }
    return null;
  },
};

function log(...a) {
  console.log('[poe-helper]', ...a);
}

// ---------------- windows ----------------

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#16181d',
    title: 'PoE Helper',
    icon: path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Started with Windows: stay in the tray until you open it.
  mainWin.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) mainWin.show(); });
  mainWin.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      hideToTray();
    }
  });
  mainWin.on('minimize', (e) => {
    if (services?.settings.get('minimizeToTray')) { e.preventDefault(); hideToTray(); }
  });
  lockNavigation(mainWin);
}

function createOverlay() {
  overlay = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  overlay.on('blur', () => {
    // a popup you have used (mouse went into it, you dragged it or pinned it) stays until Esc or ✕
    if (!overlayKept && services.settings.get('overlayCloseOnMouseAway') !== false && !overlay.webContents.isDevToolsOpened()) overlay.hide();
  });
  // dragged by its header: keep it open and open the next one in the same place
  let saveTimer = null;
  overlay.on('move', () => {
    if (Date.now() < ignoreMoveUntil || !overlay.isVisible()) return;
    keepOverlay();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { const [x, y] = overlay.getPosition(); services.settings.set('overlayPos', { x, y }); }, 300);
  });
  overlay.on('hide', onOverlayHidden);
  lockNavigation(overlay);
}

function lockNavigation(win) {
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
}

function openExternal(url) {
  try {
    const u = new URL(url);
    const ok = u.protocol === 'https:' && /(^|\.)(pathofexile\.com|poe\.ninja|github\.com|poewiki\.net|filterblade\.xyz|poelab\.com)$/.test(u.hostname);
    if (ok) shell.openExternal(u.toString());
  } catch { /* ignore */ }
}

let overlayKept = false;
let ignoreMoveUntil = 0;
function keepOverlay(on = true) {
  if (overlayKept === on) return;
  overlayKept = on;
  overlay?.webContents.send('overlay:kept', on);
}

function showOverlayAtCursor(payload) {
  if (!overlay) return;
  const pt = screen.getCursorScreenPoint();
  const d = screen.getDisplayNearestPoint(pt).workArea;
  const [w, h] = overlay.getSize();
  const saved = services.settings.get('overlayPos');
  let x;
  let y;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    // where you last dragged it
    ({ x, y } = saved);
  } else {
    // Prefer the side of the screen away from the item (PoE inventory is on the right)
    x = pt.x > d.x + d.width / 2 ? pt.x - w - 24 : pt.x + 24;
    y = pt.y - 40;
  }
  x = Math.max(d.x + 8, Math.min(x, d.x + d.width - w - 8));
  y = Math.max(d.y + 8, Math.min(y, d.y + d.height - h - 8));
  ignoreMoveUntil = Date.now() + 400;
  keepOverlay(false);
  overlay.setPosition(Math.round(x), Math.round(y));
  overlay.webContents.send('overlay:show', payload);
  // Show without taking focus, so the game keeps it: hover the next item and press the hotkey again.
  overlay.showInactive();
  armOverlayClose(pt);
}

// ---------------- popup closing: Esc, or moving the mouse away ----------------
let overlayAnchor = null;
let overlayShownAt = 0;
let escRegistered = false;
let lastMouseCheck = 0;

function armOverlayClose(pt) {
  overlayAnchor = pt;
  overlayShownAt = Date.now();
  if (!escRegistered) {
    try { escRegistered = globalShortcut.register('Escape', () => overlay?.hide()); } catch { escRegistered = false; }
  }
}

function onOverlayHidden() {
  overlayAnchor = null;
  if (escRegistered) { try { globalShortcut.unregister('Escape'); } catch { /* ignore */ } escRegistered = false; }
}

function watchMouseForOverlay() {
  onMouse((kind) => {
    if (!overlay?.isVisible() || !overlayAnchor || Date.now() - overlayShownAt < 300) return;
    if (!services.settings.get('overlayCloseOnMouseAway')) return;
    if (kind === 'move' && Date.now() - lastMouseCheck < 50) return;
    lastMouseCheck = Date.now();
    const p = screen.getCursorScreenPoint(); // DIP coordinates, same as the window bounds
    const b = overlay.getBounds();
    const pad = 24;
    const inside = p.x >= b.x - pad && p.x <= b.x + b.width + pad && p.y >= b.y - pad && p.y <= b.y + b.height + pad;
    // once the mouse has been on the popup it stays open: you can read it, tick mods, drag it
    if (inside && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) keepOverlay();
    if (inside || overlayKept) return;
    // on the way to the popup you may pass over other items: that is not moving away. It closes only when
    // the mouse is far from both the item you checked and the popup, or you click somewhere else.
    const fromItem = Math.hypot(p.x - overlayAnchor.x, p.y - overlayAnchor.y);
    const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width));
    const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height));
    const fromPopup = Math.hypot(dx, dy);
    if (kind === 'down' || (fromItem > 260 && fromPopup > 260)) overlay.hide();
  });
}

// ---------------- price check ----------------

async function priceCheck({ advanced = false, accelerator = '' } = {}) {
  // If you clicked into the popup, hide it so the copy goes to the game, not to the popup.
  if (overlay?.isVisible() && overlay.isFocused()) {
    overlay.hide();
    await new Promise((r) => setTimeout(r, 80));
  }
  const before = clipboard.readText();
  let text = null;
  if (hasKeySender()) {
    clipboard.writeText('');
    suppressClipboardUntil = Date.now() + 1000;
    await sendCopy({ advanced, held: Hotkey.parse(accelerator).mods });
    // Poll for the game to fill the clipboard (usually < 100ms)
    const start = Date.now();
    while (Date.now() - start < 500) {
      const t = clipboard.readText();
      if (t && isPoeItemText(t)) { text = t; break; }
      await new Promise((r) => setTimeout(r, 20));
    }
    if (services.settings.get('restoreClipboard')) clipboard.writeText(text && before === '' ? text : before);
    lastClipboard = clipboard.readText();
  }
  if (!text && isPoeItemText(before)) text = before; // you pressed Ctrl+C yourself
  if (!text) {
    showOverlayAtCursor({ error: hasKeySender() ? 'Hover an item in game and press the hotkey again.' : 'Press Ctrl+C on an item first (automatic copy needs uiohook-napi).' });
    return;
  }
  await runPriceCheck(text);
}

async function runPriceCheck(text) {
  showOverlayAtCursor({ loading: true });
  try {
    const result = await services.priceText(text);
    showOverlayAtCursor({ ...result, text, league: await services.getLeague() });
    mainWin?.webContents.send('history:updated');
  } catch (e) {
    showOverlayAtCursor({ error: e.message });
  }
}

function startClipboardWatcher() {
  stopClipboardWatcher();
  if (!services.settings.get('clipboardMode')) return;
  lastClipboard = clipboard.readText();
  // Electron has no clipboard change event; a local 300ms poll costs nothing and makes no network calls.
  clipboardTimer = setInterval(() => {
    const t = clipboard.readText();
    if (t === lastClipboard) return;
    lastClipboard = t;
    if (Date.now() < suppressClipboardUntil) return;
    if (isPoeItemText(t)) runPriceCheck(t);
  }, 300);
}

function stopClipboardWatcher() {
  if (clipboardTimer) clearInterval(clipboardTimer);
  clipboardTimer = null;
}

let hotkeyStatus = {};
let hotkeysPaused = false;

/** Registers the price check hotkeys. Status per hotkey: 'ok' | 'taken' | 'invalid' | 'off'. */
function registerHotkeys({ quiet = false } = {}) {
  globalShortcut.unregisterAll();
  escRegistered = false;
  hotkeyStatus = {};
  if (hotkeysPaused) return hotkeyStatus;
  const s = services.settings;
  const tryReg = (name, fn) => {
    const acc = Hotkey.normalize(s.get(name));
    if (!acc) { hotkeyStatus[name] = 'off'; return; }
    try {
      if (globalShortcut.register(acc, () => fn(acc))) hotkeyStatus[name] = 'ok';
      else {
        hotkeyStatus[name] = 'taken';
        if (!quiet) notify(`${Hotkey.label(acc)} is already used by another app. Pick another price check hotkey in Settings.`);
      }
    } catch (e) {
      hotkeyStatus[name] = 'invalid';
      if (!quiet) notify(`"${acc}" can't be used as a hotkey: ${e.message}`);
    }
  };
  tryReg('hotkeyPrice', (acc) => priceCheck({ advanced: false, accelerator: acc }));
  tryReg('hotkeyPriceAdvanced', (acc) => priceCheck({ advanced: true, accelerator: acc }));
  tryReg('hotkeyLab', () => toggleLab());
  if (overlay?.isVisible()) armOverlayClose(overlayAnchor || screen.getCursorScreenPoint());
  return hotkeyStatus;
}

/** Start with Windows (opens quietly in the tray). */
function applyLoginItem() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  const on = !!services.settings.get('startWithWindows');
  try {
    app.setLoginItemSettings({
      openAtLogin: on,
      path: process.execPath,
      // running from the folder (not the installer): Electron needs the app folder as an argument
      args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
    });
  } catch (e) { log('login item', e.message); }
}

function notify(body) {
  log(body);
  if (Notification.isSupported()) new Notification({ title: 'PoE Helper', body }).show();
  mainWin?.webContents.send('toast', body);
}

// ---------------- tray ----------------

const DEFAULT_ICON = path.join(__dirname, '..', '..', 'assets', 'icon.png');
const customIconPath = () => path.join(app.getPath('userData'), 'app-icon.png');

/** Your own icon if you picked one (Settings → Tray and app icon), else the app's. */
function appIconImage() {
  if (services?.settings.get('customAppIcon')) {
    const img = nativeImage.createFromPath(customIconPath());
    if (!img.isEmpty()) return img;
  }
  const img = nativeImage.createFromPath(DEFAULT_ICON);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

/** The tray gets its own simplified 16/32 px drawing (tray.png + tray@2x.png) unless you picked an icon. */
function trayImage() {
  if (!services?.settings.get('customAppIcon')) {
    const t = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
    if (!t.isEmpty()) return t;
  }
  return appIconImage().resize({ width: 16, height: 16, quality: 'best' });
}

function applyAppIcon() {
  const img = appIconImage();
  if (tray) tray.setImage(trayImage());
  if (mainWin && !img.isEmpty() && services?.settings.get('customAppIcon')) mainWin.setIcon(img.resize({ width: 256, height: 256, quality: 'best' }));
  else if (mainWin) mainWin.setIcon(path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'));
}

function hideToTray() {
  mainWin?.hide();
  // say it once, so the window "disappearing" isn't a surprise
  if (!services.settings.get('trayHintShown')) {
    services.settings.set('trayHintShown', true);
    if (Notification.isSupported()) new Notification({ title: 'PoE Helper is still running', body: 'It\'s in the tray (bottom right, maybe under ^). Alt+E keeps working. Right-click the icon there to quit.' }).show();
  }
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('PoE Helper');
  rebuildTrayMenu();
  tray.on('click', () => mainWin.show());
}

function rebuildTrayMenu() {
  if (!tray) return;
  const ready = updater?.status().state === 'ready';
  const menu = Menu.buildFromTemplate([
    ...(ready ? [{ label: `Restart to update to ${updater.status().latest}`, click: () => { quitting = true; updater.install(); } }, { type: 'separator' }] : []),
    { label: 'Open PoE Helper', click: () => mainWin.show() },
    { label: 'Price check clipboard', click: () => runPriceCheck(clipboard.readText()) },
    { label: 'Take net worth snapshot', click: () => snapshotNow('tray') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

const isAuthError = (e) => e instanceof AuthError || /returned (401|403)/.test(String(e?.message || ''));
// The website login (POESESSID) ends when you log out on pathofexile.com or after a while. Say so once,
// and a click on the message opens the login window; the snapshot runs again right after you log in.
let loginExpiredShown = false;
function loginExpired() {
  if (loginExpiredShown) return;
  loginExpiredShown = true;
  const text = 'Your pathofexile.com login has expired, so stash tabs can\'t be read. Click here to log in again.';
  log(text);
  mainWin?.webContents.send('toast', text);
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: 'PoE Helper: log in again', body: text });
  n.on('click', async () => {
    const r = await loginForSession();
    if (r?.ok) { loginExpiredShown = false; snapshotNow('login').catch(() => {}); }
  });
  n.show();
}

async function snapshotNow(reason) {
  try {
    const snap = await services.networth.takeSnapshot({ reason });
    mainWin?.webContents.send('networth:updated', snap);
    return snap;
  } catch (e) {
    if (isAuthError(e)) loginExpired(); else notify(`Snapshot failed: ${e.message}`);
    throw e;
  }
}

function applyAutoSnapshot() {
  const s = services.settings;
  services.networth.startAuto({
    minutes: s.get('autoSnapshotMin'),
    clientLogPath: s.get('clientLogPath'),
    onSnapshot: (snap) => mainWin?.webContents.send('networth:updated', snap),
    onError: (e) => (isAuthError(e) ? loginExpired() : notify(`Auto snapshot failed: ${e.message}`)),
  });
}

// Automatic tiering: re-check prices hourly (poe.ninja refreshes about every 15 minutes, cached 20).
let autoTierTimer = null;
function applyAutoTier() {
  clearInterval(autoTierTimer);
  autoTierTimer = null;
  if (!services.autoTierWanted()) return;
  const run = async () => {
    try {
      const moves = await services.autoTierRun();
      if (moves.length) {
        notify(`Auto-tier moved ${moves.length} item${moves.length === 1 ? '' : 's'} to match current prices. Undo it on the Price review tab.`);
        mainWin?.webContents.send('filter:rebuilt');
      }
    } catch (e) { log('auto-tier', e.message); }
  };
  setTimeout(run, 60 * 1000);
  autoTierTimer = setInterval(run, 60 * 60 * 1000);
}

function applyFilterWatch() {
  if (services.settings.get('autoWatchFilter') && services.filters.basePath()) {
    services.filters.watch((target) => {
      mainWin?.webContents.send('filter:rebuilt', target);
      notify('Your base filter changed, so the (helper) filter was rebuilt with your overrides.');
    });
  } else services.filters.unwatch();
}

// ---------------- POESESSID by logging in ----------------
// Opens the official login page in a separate, locked-down window (no app code runs in it). You log in
// yourself; once pathofexile.com takes you to your account page, the session cookie is read from that
// window, stored encrypted like a pasted one, and the window closes. The app never sees your password.
// ---------------- daily lab overlay ----------------
// One small always-on-top window: the hotkey opens it on a difficulty picker (1-4 or a click), it then
// shows poelab's layout for today. The same hotkey (or Esc, or ✕) hides it again.
let labWin = null;
function createLabWin() {
  const b = services.settings.get('labOverlayBounds');
  const area = screen.getPrimaryDisplay().workArea;
  labWin = new BrowserWindow({
    width: b?.width || 980, height: b?.height || 560,
    x: b?.x ?? Math.round(area.x + (area.width - 980) / 2), y: b?.y ?? area.y + 40,
    minWidth: 360, minHeight: 220,
    frame: false, transparent: false, backgroundColor: '#16181d', resizable: true, skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: true,
    title: 'Daily lab',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  labWin.setAlwaysOnTop(true, 'screen-saver');
  labWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  labWin.setOpacity(Math.min(1, Math.max(0.3, Number(services.settings.get('labOpacity')) || 1)));
  labWin.loadFile(path.join(__dirname, '..', 'renderer', 'lab.html'));
  let t = null;
  const save = () => { clearTimeout(t); t = setTimeout(() => { if (labWin && !labWin.isDestroyed()) services.settings.set('labOverlayBounds', labWin.getBounds()); }, 400); };
  labWin.on('move', save);
  labWin.on('resize', save);
  labWin.on('closed', () => { labWin = null; });
}
/** Hotkey: hidden -> show the picker; shown -> hide. diff given: show that layout straight away. */
function toggleLab(diff = null) {
  if (!labWin || labWin.isDestroyed()) createLabWin();
  if (!diff && labWin.isVisible()) { labWin.hide(); return; }
  // your favourite lab opens straight away; without one you pick each time
  if (!diff && services.settings.get('labFavorite')) diff = services.settings.get('labFavorite');
  const send = () => labWin.webContents.send('lab:pick', { diff, last: services.settings.get('labLast') });
  if (labWin.webContents.isLoading()) labWin.webContents.once('did-finish-load', send); else send();
  labWin.show();
  labWin.focus();
}

let loginWin = null;
function loginForSession() {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return Promise.resolve({ pending: true }); }
  return new Promise((resolve) => {
    let done = false;
    loginWin = new BrowserWindow({
      width: 520, height: 760, parent: mainWin || undefined, title: 'Log in to Path of Exile', autoHideMenuBar: true,
      webPreferences: { partition: 'persist:poe-login', contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const win = loginWin;
    // sign-in links (Steam, Xbox, PlayStation) open in the same window, never as new app windows
    win.webContents.setWindowOpenHandler(({ url }) => { win.loadURL(url); return { action: 'deny' }; });
    const finish = (result) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      resolve(result);
      if (!win.isDestroyed()) win.close();
    };
    const tryCookie = async () => {
      if (win.isDestroyed()) return;
      const url = win.webContents.getURL();
      // after logging in the site sends you to its front page (or back from Steam/Xbox/PlayStation):
      // open your account page once; it only opens when you really are logged in
      if (/^https:\/\/(www\.)?pathofexile\.com\//i.test(url) && !/\/(login|my-account|account\/view-profile)/i.test(url) && !win.checkedAccount) {
        win.checkedAccount = true;
        win.loadURL('https://www.pathofexile.com/my-account');
        return;
      }
      if (/\/login/i.test(url)) win.checkedAccount = false;
      // logged in = pathofexile.com shows you your account
      if (!/^https:\/\/(www\.)?pathofexile\.com\/(my-account|account\/view-profile)/i.test(url)) return;
      const cookies = await win.webContents.session.cookies.get({ url: 'https://www.pathofexile.com', name: 'POESESSID' }).catch(() => []);
      const sid = cookies.find((c) => /^[a-f0-9]{32}$/i.test(c.value))?.value;
      if (!sid) return;
      services.settings.set('sessionEnc', secrets.encrypt(sid));
      // the profile address carries your account name: /account/view-profile/Name-1234
      const prof = /view-profile\/([^/?#]+)/i.exec(url)?.[1];
      if (prof && !services.settings.get('accountName')) {
        const name = decodeURIComponent(prof).replace(/-(\d{4})$/, '#$1');
        services.settings.set('accountName', name);
      }
      loginExpiredShown = false;
      finish({ ok: true, accountName: services.settings.get('accountName') || null });
    };
    const timer = setInterval(tryCookie, 1000);
    win.webContents.on('did-navigate', tryCookie);
    win.webContents.on('did-navigate-in-page', tryCookie);
    win.on('closed', () => { loginWin = null; finish({ cancelled: true }); });
    win.loadURL('https://www.pathofexile.com/login');
  });
}

// ---------------- IPC ----------------

function sanitizedSettings() {
  const { sessionEnc, history, overrides, ...rest } = services.settings.get();
  return { ...rest, sessionSet: !!sessionEnc, keySender: hasKeySender(), hotkeyStatus, version: services.VERSION };
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      log(channel, 'failed:', e.message);
      return { ok: false, error: e.message };
    }
  });
}

function registerIpc() {
  const s = services.settings;

  handle('state:get', async () => {
    const league = await services.getLeague();
    // Served from the warm-up cache; never forces a fresh request.
    const divine = await services.ninja.divinePrice(league).catch(() => null);
    return { settings: sanitizedSettings(), league, divine, usage: services.usageSnapshot(), history: s.get('history') || [] };
  });
  handle('leagues:list', () => services.ninja.leagues());
  // everything back to a fresh install (your account, filter choice and history stay)
  const afterReset = () => {
    hotkeysPaused = false; registerHotkeys(); applyAppIcon(); startClipboardWatcher(); applyAutoSnapshot(); applyFilterWatch(); applyAutoTier();
    mainWin?.webContents.send('filter:rebuilt');
  };
  handle('app:resetAll', () => { const r = services.resetAll(); afterReset(); return r; });
  handle('app:undoReset', () => { const r = services.undoResetAll(); afterReset(); return r; });
  handle('app:canUndoReset', () => services.canUndoReset());
  // put some settings back to how a fresh install has them
  handle('settings:reset', (keys) => {
    const D = require('./services').DEFAULT_SETTINGS;
    for (const k of (Array.isArray(keys) ? keys : []).filter((x) => x in D && !['sessionEnc', 'history'].includes(x))) s.set(k, structuredClone(D[k]));
    services.applySettings();
    return true;
  });
  handle('settings:set', (patch) => {
    const allowed = Object.keys(require('./services').DEFAULT_SETTINGS).filter((k) => !['sessionEnc', 'history', 'overrides'].includes(k));
    const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => allowed.includes(k)));
    s.patch(clean);
    services.applySettings();
    if ('hotkeyPrice' in clean || 'hotkeyPriceAdvanced' in clean || 'hotkeyLab' in clean) { hotkeysPaused = false; registerHotkeys(); }
    if ('clipboardMode' in clean) startClipboardWatcher();
    if ('uiTheme' in clean) for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('uiTheme:changed', s.get('uiTheme')); } catch { /* closed */ } }
    if ('startWithWindows' in clean) applyLoginItem();
    if ('autoSnapshotMin' in clean || 'clientLogPath' in clean) applyAutoSnapshot();
    if ('baseFilter' in clean || 'filterDir' in clean || 'autoWatchFilter' in clean || 'hideFractured' in clean || 'hideSynthesised' in clean) {
      applyFilterWatch();
      if (services.filters.basePath()) { try { services.filters.write(); } catch (e) { log('write after choosing filter', e.message); } }
    }
    return sanitizedSettings();
  });
  handle('session:set', (sid) => {
    const v = String(sid || '').trim();
    if (v && !/^[a-f0-9]{32}$/i.test(v)) throw new Error('POESESSID should be 32 hexadecimal characters.');
    s.set('sessionEnc', v ? secrets.encrypt(v) : null);
    return { sessionSet: !!v };
  });
  handle('session:login', () => loginForSession());
  handle('usage:get', () => services.usageSnapshot());
  // While you record a new hotkey in Settings, the current ones are switched off so they don't fire.
  handle('hotkeys:pause', () => { hotkeysPaused = true; registerHotkeys({ quiet: true }); return true; });
  handle('hotkeys:resume', () => { hotkeysPaused = false; return registerHotkeys({ quiet: true }); });
  handle('history:get', () => s.get('history') || []);

  handle('price:text', (text) => services.priceText(text));
  handle('trade:prepare', (text) => services.tradePrepare(text));
  handle('trade:search', (args) => services.tradeSearch(args));

  handle('networth:tabs', async (force) => services.ggg.stashTabs(await services.getLeague(), { force: !!force }));
  handle('networth:select', (indices) => { s.set('selectedTabs', (indices || []).map(Number).filter(Number.isInteger)); return s.get('selectedTabs'); });
  handle('networth:snapshot', () => snapshotNow('manual'));
  handle('networth:report', async (sinceMs) => services.networth.report(await services.getLeague(), { sinceMs }));
  handle('networth:clear', async () => {
    const league = await services.getLeague();
    services.snapshots.set('snapshots', (services.snapshots.get('snapshots') || []).filter((x) => x.league !== league));
    return true;
  });

  handle('filter:list', () => {
    const basePath = services.filters.basePath(); // also picks up a synced filter's new file
    const sw = services.filters.lastSwitch;
    if (sw && !sw.told) { sw.told = true; applyFilterWatch(); }
    return { dir: services.filters.dir(), files: services.filters.list(), base: s.get('baseFilter'), lastWrite: s.get('lastWrite') || null, missing: basePath ? null : services.filters.missing(), switched: sw && Date.now() - sw.at < 60000 ? sw : null };
  });
  handle('filter:overrides', () => services.filters.overrides());
  handle('filter:saveOverrides', (list) => { services.filters.saveOverrides(Array.isArray(list) ? list : []); return services.filters.overrides(); });
  handle('filter:write', async () => {
    await services.regenerateEconomy();
    return services.filters.write();
  });
  handle('filter:quick', ({ kind, text, opts }) => services.quickFilter(kind === 'hide' ? 'hide' : 'highlight', text, opts || {}));
  handle('filter:economyRules', () => services.regenerateEconomy({ preview: true }));
  handle('sounds:list', () => services.listSounds());
  handle('sounds:import', (a) => services.importSound(a || {}));
  handle('gameSounds:get', () => services.gameSoundsState());
  // pick: choose the game folder yourself (when it isn't in one of the usual places)
  handle('gameSounds:extract', async (a) => {
    let dir = null;
    if (a?.pick) {
      const r = await dialog.showOpenDialog(mainWin, { title: 'Your Path of Exile folder (the one with Bundles2 and FMOD in it)', properties: ['openDirectory'] });
      if (r.canceled || !r.filePaths[0]) return services.gameSoundsState();
      dir = r.filePaths[0];
    }
    return services.extractGameSounds({ dir, force: !!a?.force || !!dir });
  });
  handle('icons:list', () => services.listIcons());
  handle('update:status', () => updater?.status() || { state: 'idle' });
  handle('app:version', () => services.versionInfo());
  handle('prices:units', async () => services.currencyUnits(await services.getLeague()));
  handle('app:changelog', () => services.changelog());
  handle('app:notesSeen', () => { s.set('notesShownFor', services.VERSION); return true; });
  handle('update:check', () => updater?.check());
  handle('update:install', () => { quitting = true; return updater?.install() || false; });
  handle('tiers:add', (a) => services.addTier(a || {}));
  handle('tiers:cond', ({ key, field, value } = {}) => services.setTierCondition(String(key), String(field), value ?? null));
  handle('tiers:stack', ({ key, size }) => services.setStackSize(String(key), size == null || size === '' ? null : Number(size)));
  handle('bases:list', () => services.myBases());
  handle('matrix:get', () => services.baseMatrixView());
  handle('cluster:get', () => services.clusterView());
  handle('cluster:set', (a) => services.setCluster(a || {}));
  handle('matrix:fracAuto', (a) => services.autoFractured(a || {}));
  handle('matrix:set', (a) => services.setBaseMatrix(a || {}));
  handle('regex:mapView', (a) => services.regexMapView(a || {}));
  handle('regex:mapBuild', (a) => services.regexMapBuild(a || {}));
  handle('regex:beastView', () => services.regexBeastView());
  handle('regex:itemBases', () => services.regexItemBases());
  handle('regex:itemView', (a) => services.regexItemView(a || {}));
  handle('regex:itemBuild', (a) => services.regexItemBuild(a || {}));
  handle('regex:campaignView', (a) => services.regexCampaignView(a || {}));
  handle('regex:gemView', () => services.regexGemView());
  handle('regex:gemBuild', (a) => services.regexGemBuild(a || {}));
  handle('pob:state', () => pobState());
  handle('pob:set', async (a = {}) => {
    const cur = services.settings.get('pob') || {};
    const next = { ...cur };
    for (const k of ['enabled', 'dir', 'buildsDir', 'build']) if (k in a) next[k] = a[k];
    services.settings.set('pob', next);
    if ('build' in a && pob) pob.build = null;
    return pobApply();
  });
  handle('pob:reload', async () => { if (pob) pob.build = null; return pobApply(); });
  handle('pob:pickDir', async (which) => {
    const r = await dialog.showOpenDialog(mainWin, { properties: ['openDirectory'], title: which === 'builds' ? 'Your Path of Building builds folder' : 'Your Path of Building folder' });
    if (r.canceled || !r.filePaths?.[0]) return pobState();
    const cur = services.settings.get('pob') || {};
    services.settings.set('pob', { ...cur, [which === 'builds' ? 'buildsDir' : 'dir']: r.filePaths[0] });
    return pobApply();
  });
  // what an item does to your build, slot by slot (the price check shows it)
  handle('pob:compare', async (text) => {
    if (!pob || pob.state !== 'ready' || !pob.build) return null;
    const r = await pob.compare(String(text || ''));
    if (r.error) return { error: r.error };
    return { build: pob.build.summary?.name, skill: pob.build.summary?.skill, ...require('./pob').summarise(r) };
  });
  handle('regex:campaignBuild', (a) => services.regexCampaignBuild(a || {}));
  handle('regex:beastBuild', (a) => services.regexBeastBuild(a || {}));
  handle('regex:mapTrade', async (a) => { const r = await services.regexMapTrade(a || {}); openExternal(r.url); return r; });
  handle('regex:savePreset', (a) => services.regexSavePreset(a || {}));
  handle('regex:deletePreset', (a) => services.regexDeletePreset(a || {}));
  handle('clipboard:write', (t) => { clipboard.writeText(String(t ?? '').slice(0, 5000)); return true; });
  handle('ranks:set', (a) => services.setBaseRanks(a || {}));
  handle('ranks:kind', (a) => services.setRankKind(a || {}));
  handle('ranks:default', () => services.defaultRanks());
  handle('ranks:auto', (a) => services.autoRanks(a || {}));
  handle('matrix:opts', (a) => services.setBaseMatrixOpts(a || {}));
  handle('campaignHide:set', (a) => services.setCampaignHide(a || {}));
  handle('currency:showAll', (on) => services.setShowAllCurrency(on));
  handle('bases:add', (a) => services.addMyBase(a || {}));
  handle('bases:update', ({ id, patch }) => services.updateMyBase(String(id), patch || {}));
  handle('bases:remove', (id) => services.removeMyBase(String(id)));
  handle('bases:style', (style) => services.setMyBasesStyle(style));
  handle('tiers:remove', (a) => services.removeTier(a || {}));
  handle('tiers:rename', (a) => services.renameTier(a || {}));
  handle('art:icons', (names) => services.categoryArt(Array.isArray(names) ? names.map(String).slice(0, 60) : []));
  handle('tray:hide', () => { hideToTray(); return true; });
  handle('appIcon:get', () => appIconImage().resize({ width: 64, height: 64, quality: 'best' }).toDataURL());
  handle('appIcon:pick', async () => {
    const r = await dialog.showOpenDialog(mainWin, { title: 'Choose an icon for PoE Helper', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'bmp', 'gif'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const img = nativeImage.createFromPath(r.filePaths[0]);
    if (img.isEmpty()) throw new Error('That image could not be read. Try a .png or .ico file.');
    const sq = Math.min(img.getSize().width, img.getSize().height);
    const crop = img.crop({ x: Math.floor((img.getSize().width - sq) / 2), y: Math.floor((img.getSize().height - sq) / 2), width: sq, height: sq });
    require('fs').writeFileSync(customIconPath(), crop.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
    s.set('customAppIcon', true);
    applyAppIcon();
    return appIconImage().resize({ width: 64, height: 64, quality: 'best' }).toDataURL();
  });
  handle('appIcon:reset', () => {
    s.set('customAppIcon', false);
    applyAppIcon();
    return appIconImage().resize({ width: 64, height: 64, quality: 'best' }).toDataURL();
  });
  handle('icons:import', (a) => services.importIcon(a || {}));
  handle('icons:delete', (id) => services.deleteIcon(id));
  handle('sounds:data', (id) => services.soundData(id));
  handle('tiers:view', () => services.tierViewNow());
  handle('tiers:prices', (type) => services.tierPrices(String(type)));
  handle('tiers:action', ({ key, action }) => services.setTierAction(String(key), ['Show', 'Hide', 'Off'].includes(action) ? action : null));
  handle('tiers:suggest', (type) => services.tierSuggest(String(type)));
  handle('review:run', (args) => services.priceReview(args || {}));
  handle('farm:dashboard', () => services.farmDashboard());
  handle('designer:state', () => services.designerState());
  handle('designer:random', () => require('../core/filter/designer').randomTheme());
  handle('designer:draft', (d) => services.designerSaveDraft(d || {}));
  handle('designer:apply', (a) => services.designerApply(a || {}));
  handle('designer:undo', () => services.designerUndo());
  handle('designer:saveTheme', ({ name, levels }) => services.designerSaveTheme(name, levels));
  handle('designer:deleteTheme', (id) => services.designerDeleteTheme(String(id)));
  handle('review:apply', (moves) => services.applyReviewMoves(Array.isArray(moves) ? moves : []));
  handle('review:undo', () => services.undoLastReview());
  handle('review:log', () => s.get('priceReviewLog') || []);
  handle('review:config', (patch) => {
    const cur = s.get('priceReview') || {};
    const next = { ...cur, ...(patch || {}) };
    if (patch?.categories) next.categories = { ...(cur.categories || {}), ...patch.categories };
    s.set('priceReview', next);
    applyAutoTier();
    return next;
  });
  // Optional: the real game font for item labels. We never ship it; you point us at your own copy.
  handle('font:get', () => {
    const p = s.get('labelFontPath');
    if (!p) return null;
    try {
      const buf = require('fs').readFileSync(p);
      if (buf.length > 5 * 1024 * 1024) return null;
      return { name: require('path').basename(p), data: buf.toString('base64') };
    } catch { return null; }
  });
  handle('font:pick', async () => {
    const r = await dialog.showOpenDialog(mainWin, { title: 'Choose the Fontin SmallCaps font file', properties: ['openFile'], filters: [{ name: 'Fonts', extensions: ['otf', 'ttf', 'woff', 'woff2'] }] });
    if (r.canceled || !r.filePaths?.[0]) return null;
    s.set('labelFontPath', r.filePaths[0]);
    overlay?.webContents.reload();
    return require('path').basename(r.filePaths[0]);
  });
  handle('font:clear', () => { s.set('labelFontPath', ''); overlay?.webContents.reload(); return true; });
  handle('tiers:move', ({ type, bases, to, force }) => services.moveBases(String(type), (bases || []).map(String), String(to), { force: !!force }));
  handle('tiers:style', ({ key, style }) => services.setTierStyle(String(key), style || null));
  handle('tiers:reset', (args) => services.resetTiers(args || {}));
  handle('themes:list', () => services.themes());
  handle('themes:save', ({ name, onlyEdited }) => services.saveTheme(name, { onlyEdited }));
  handle('themes:apply', (id) => services.applyTheme(id));
  handle('themes:delete', (id) => services.deleteTheme(id));
  handle('filterShare:export', async () => {
    const r = await dialog.showSaveDialog(mainWin, { title: 'Export your loot filter settings', defaultPath: 'loot-filter.poehelper.json', filters: [{ name: 'PoE Helper loot filter settings', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    require('fs').writeFileSync(r.filePath, services.exportFilterSettings(), 'utf8');
    return r.filePath;
  });
  handle('filterShare:import', async () => {
    const r = await dialog.showOpenDialog(mainWin, { title: 'Import loot filter settings', properties: ['openFile'], filters: [{ name: 'PoE Helper loot filter settings', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths?.[0]) return null;
    return services.importFilterSettings(require('fs').readFileSync(r.filePaths[0], 'utf8'));
  });
  handle('filterShare:undo', () => services.undoImportFilterSettings());
  handle('filterShare:canUndo', () => services.canUndoImport());
  handle('themes:export', async (id) => {
    const json = services.exportTheme(id);
    const name = (services.themes().find((t) => t.id === id)?.name || 'theme').replace(/[^\w -]+/g, '');
    const r = await dialog.showSaveDialog(mainWin, { title: 'Export theme', defaultPath: `${name}.poetheme.json`, filters: [{ name: 'PoE Helper theme', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    require('fs').writeFileSync(r.filePath, json, 'utf8');
    return r.filePath;
  });
  handle('themes:import', async () => {
    const r = await dialog.showOpenDialog(mainWin, { title: 'Import theme', properties: ['openFile'], filters: [{ name: 'PoE Helper theme', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths?.[0]) return null;
    return services.importTheme(require('fs').readFileSync(r.filePaths[0], 'utf8'));
  });
  handle('filter:explain', (text) => {
    const item = require('../core/item-parser').parseItem(text);
    const doc = item && services.filters.parsedActive();
    return doc ? require('../core/filter/matcher').explain(doc, item) : null;
  });
  handle('filter:render', (rule) => require('../core/filter/parser').renderBlock(rule));

  handle('overlay:hide', () => overlay?.hide());
  handle('overlay:resize', (h) => {
    if (!overlay) return;
    const b = overlay.getBounds();
    const d = screen.getDisplayMatching(b).workArea;
    const height = Math.max(120, Math.min(900, d.height - 16, Math.round(h)));
    // grow upwards when there's no room below, so the popup never ends up off screen
    const y = Math.max(d.y + 8, Math.min(b.y, d.y + d.height - height - 8));
    ignoreMoveUntil = Date.now() + 400;
    overlay.setBounds({ x: b.x, y, width: b.width, height });
  });
  handle('overlay:keep', (on) => keepOverlay(!!on));
  handle('overlay:resetPos', () => { services.settings.set('overlayPos', null); return true; });
  handle('shell:open', (url) => openExternal(url));
  handle('lab:get', (a) => services.labLayout(a || {}));
  handle('lab:show', (diff) => { toggleLab(services.LAB_DIFFS.some((d) => d.id === diff) ? diff : services.settings.get('labLast') || 'uber'); return true; });
  handle('lab:hide', () => { labWin?.hide(); return true; });
  handle('lab:favorite', (diff) => { const v = services.LAB_DIFFS.some((d) => d.id === diff) ? diff : null; services.settings.set('labFavorite', v); return v; });
  handle('lab:opacity', (v) => { const o = Math.min(1, Math.max(0.3, Number(v) || 1)); services.settings.set('labOpacity', o); labWin?.setOpacity(o); return o; });
  // the price check's App button: show the app, and the item's tier in the Loot filter when it has one
  handle('app:show', (a) => {
    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show(); mainWin.focus();
    if (a?.goto) mainWin.webContents.send('app:goto', a.goto);
  });
}

// ---------------- lifecycle ----------------

app.on('second-instance', () => mainWin?.show());

if (process.platform === 'win32') app.setAppUserModelId('dev.poehelper.app');

// ---------------- Path of Building (your installed copy, run headless) ----------------
let pob = null;
function pobState() {
  const P = require('./pob');
  const st = services.settings.get('pob') || {};
  const dir = P.findPobDir(st.dir);
  const dirs = P.buildsDirs(app.getPath('documents'));
  const buildsDir = st.buildsDir && fs.existsSync(st.buildsDir) ? st.buildsDir : dirs.find((d) => fs.existsSync(d)) || dirs[dirs.length - 1];
  return {
    enabled: !!st.enabled, dir, dirFound: !!dir, buildsDir, build: st.build || null,
    builds: fs.existsSync(buildsDir) ? P.listBuilds(buildsDir).map(({ file, name }) => ({ file, name })) : [],
    state: pob?.state || 'off', error: pob?.error || null, summary: pob?.build?.summary || null, platform: process.platform,
  };
}
async function pobApply() {
  const st = pobState();
  if (!st.enabled) { pob?.stop(); return pobState(); }
  if (!st.dir) return pobState();
  if (!pob) pob = new (require('./pob').PobEngine)({ utilityProcess, hostFile: path.join(__dirname, '..', 'pob', 'host.lua'), workerFile: path.join(__dirname, 'pob-worker.js'), log });
  try {
    await pob.start(st.dir);
    if (st.build && fs.existsSync(st.build) && pob.build?.file !== st.build) await pob.load(st.build);
  } catch (e) { log('pob', e.message); pob.error = e.message; }
  mainWin?.webContents.send('pob:changed');
  return pobState();
}

app.whenReady().then(async () => {
  services = createServices({ dataDir: app.getPath('userData'), secrets, log, labBrowser });
  registerIpc();
  createMainWindow();
  createOverlay();
  createTray();
  if (services.settings.get("customAppIcon")) applyAppIcon();
  // automatic updates from GitHub Releases (installed app only)
  updater = require('./updater').createUpdater({
    app,
    log,
    onStatus: (st) => {
      mainWin?.webContents.send('update:status', st);
      if (st.state === 'ready') {
        notify(`PoE Helper ${st.latest} is ready. Restart it from the tray or Settings, or it installs when you quit.`);
        rebuildTrayMenu();
      }
    },
  });
  updater.start();
  // Ctrl+D was the default before; Alt+E is the default now.
  if (services.settings.get('hotkeyPrice') === 'Ctrl+D') services.settings.set('hotkeyPrice', 'Alt+E');
  registerHotkeys();
  // preview copies of the game's alert sounds, made from your install (again after a patch)
  setTimeout(() => { const r = services.refreshGameSounds(); if (r) mainWin?.webContents.send('gameSounds:changed', r); }, 4000);
  applyLoginItem();
  watchMouseForOverlay();
  startClipboardWatcher();
  applyAutoSnapshot();
  applyFilterWatch();
  applyAutoTier();
  // Warm only what every price check needs (league + currency): 2 small poe.ninja requests, cached.
  services.getLeague().then((l) => services.ninja.category(l, 'Currency')).catch((e) => log('warmup', e.message));
  // your Path of Building build, loaded in the background so item checks can compare against it
  if (services.settings.get('pob')?.enabled) setTimeout(() => pobApply().catch(() => {}), 2500);
  // Rewrite the "(helper)" filter at start, so a fix in a new version (or a FilterBlade update)
  // reaches the game without you having to change anything first.
  if (services.settings.get('economy')?.enabled) services.regenerateEconomy().catch(() => {});
  else if (services.filters.basePath()) { try { services.filters.write(); } catch (e) { log('startup write', e.message); } }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopHook();
  stopClipboardWatcher();
  services?.networth.stopAuto();
  services?.filters.unwatch();
  pob?.stop();
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', (e) => e.preventDefault());
