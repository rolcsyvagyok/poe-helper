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
// The installed app and a copy run from the source folder get their own taskbar identity, so Windows
// never mixes up their icons
const APP_ID = app.isPackaged ? 'dev.poehelper.app' : 'dev.poehelper.app.source';
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
const keysMod = require('./keys');
const { sendCopy, hasKeySender, onMouse, stopHook } = keysMod;
const { createChatMacros } = require('./chat-macros');
let chatMacros = null;
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
  // Windows sometimes drops the taskbar icon after the window was hidden to the tray: set it again
  mainWin.on('show', () => applyAppIcon());
  mainWin.on('restore', () => applyAppIcon());
  taskbarIcon();
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
    const ok = u.protocol === 'https:' && /(^|\.)(pathofexile\.com|poe\.ninja|github\.com|poewiki\.net|filterblade\.xyz|poelab\.com|pobb\.in|pob\.codes)$/.test(u.hostname);
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

/** Copies the item under the mouse in game (Ctrl+C, or Ctrl+Alt+C for mod tiers); falls back to what you copied yourself. */
async function copyItemFromGame({ advanced = false, accelerator = '' } = {}) {
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
  return text;
}

async function priceCheck({ advanced = false, accelerator = '', compare = false } = {}) {
  // If you clicked into the popup, hide it so the copy goes to the game, not to the popup.
  if (overlay?.isVisible() && overlay.isFocused()) {
    overlay.hide();
    await new Promise((r) => setTimeout(r, 80));
  }
  const text = await copyItemFromGame({ advanced, accelerator });
  if (!text) {
    showOverlayAtCursor({ error: hasKeySender() ? 'Hover an item in game and press the hotkey again.' : 'Press Ctrl+C on an item first (automatic copy needs uiohook-napi).' });
    return;
  }
  await runPriceCheck(text, { compare });
}

/** The PoB item tester hotkey: copies the item in game and opens it on the Path of Building page. */
async function pobTestHotkey(accelerator) {
  const text = await copyItemFromGame({ accelerator });
  if (!text) { notify(hasKeySender() ? 'Hover an item in game and press the item tester hotkey again.' : 'Press Ctrl+C on an item first.'); return; }
  mainWin?.show();
  mainWin?.focus();
  mainWin?.webContents.send('app:goto', { page: 'pob', tab: 'test', text });
}

async function runPriceCheck(text, { compare = false } = {}) {
  showOverlayAtCursor({ loading: true });
  // the comparison only on its own hotkey and only when it's switched on: the normal price check never starts PoB
  const wantPob = compare && services.settings.get('pobCompareOn') !== false && /Rarity:\s*(Normal|Magic|Rare|Unique)/i.test(text) && !/^Rarity:\s*Unique[\s\S]*?\nMap Tier:/i.test(text);
  try {
    const result = await services.priceText(text);
    showOverlayAtCursor({ ...result, text, league: await services.getLeague(), pob: wantPob ? { loading: true } : null });
    mainWin?.webContents.send('history:updated');
  } catch (e) {
    showOverlayAtCursor({ error: e.message });
    return;
  }
  if (wantPob) overlay?.webContents.send('overlay:pob', await pobCompareFor(text));
}

/** Path of Building's tooltip and comparison for an item, against the build you last used on the PoB page. */
async function pobCompareFor(text) {
  const st = services.settings.get('pob') || {};
  const file = [st.current, st.last?.file].find((f) => f && fs.existsSync(f));
  if (!file) return { error: 'Pick a build on the Path of Building page first, or save a snapshot.' };
  try {
    const r = await pobWith(file, () => pob.timeless('itemTooltip', { item: String(text).slice(0, 20000) }));
    return { r, build: path.basename(file, '.xml') };
  } catch (e) { return { error: e.message }; }
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

// The PoB item tester takes every item you Ctrl+C in game (its own setting, apart from the price check's).
let pobClipTimer = null;
let pobClipLast = null;
function applyPobClipboard() {
  if (pobClipTimer) clearInterval(pobClipTimer);
  pobClipTimer = null;
  if ((services.settings.get('pob') || {}).watchClipboard === false) return;
  pobClipLast = clipboard.readText();
  pobClipTimer = setInterval(() => {
    const t = clipboard.readText();
    if (t === pobClipLast) return;
    pobClipLast = t;
    if (Date.now() < suppressClipboardUntil) return; // the price check hotkey's own copy
    if (isPoeItemText(t)) mainWin?.webContents.send('pob:copied', t);
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
  tryReg('hotkeySnapshot', () => pobSnapshotNotify('hotkey'));
  tryReg('hotkeyPobTest', (acc) => pobTestHotkey(acc));
  if (services.settings.get('pobCompareOn') !== false) tryReg('hotkeyPobCompare', (acc) => priceCheck({ accelerator: acc, compare: true }));
  else hotkeyStatus.hotkeyPobCompare = 'off';
  if (overlay?.isVisible()) armOverlayClose(overlayAnchor || screen.getCursorScreenPoint());
  // unregisterAll above dropped the chat macro keys too
  if (!chatMacros) chatMacros = createChatMacros({ globalShortcut, clipboard, keys: keysMod, foreground: require('./foreground'), settings: s, log });
  hotkeyStatus.chatMacros = chatMacros.refresh().on ? 'ok' : 'off';
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

// 'flask' is the default icon, 'classic' the earlier gold diamond; your own image overrides both
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const iconStyle = () => (services?.settings.get('appIconStyle') === 'classic' ? 'classic' : 'flask');
const assetFile = (base, ext) => path.join(ASSETS, `${base}${iconStyle() === 'classic' ? '-classic' : ''}${ext}`);

/** Your own icon if you picked one (Settings → Tray and app icon), else the chosen built-in one. */
function appIconImage() {
  if (services?.settings.get('customAppIcon')) {
    const img = nativeImage.createFromPath(customIconPath());
    if (!img.isEmpty()) return img;
  }
  const img = nativeImage.createFromPath(assetFile('icon', '.png'));
  return img.isEmpty() ? nativeImage.createFromPath(DEFAULT_ICON) : img;
}

/** The tray gets its own close-cropped 16/32 px drawing (tray.png + tray@2x.png) unless you picked an icon. */
function trayImage() {
  if (!services?.settings.get('customAppIcon')) {
    const t = nativeImage.createFromPath(assetFile('tray', '.png'));
    if (!t.isEmpty()) return t;
  }
  return appIconImage().resize({ width: 16, height: 16, quality: 'best' });
}

// An .ico from any picture: a PNG entry for 256 px and classic 32-bit bitmaps for the small sizes, because
// the taskbar and title bar can't always read PNG-compressed small icons (they show a blank square)
function imageToIco(img) {
  const sizes = [256, 48, 32, 24, 16];
  const datas = sizes.map((s) => {
    const im = img.resize({ width: s, height: s, quality: 'best' });
    if (s >= 256) return im.toPNG();
    const bgra = im.toBitmap(); // top-down BGRA rows
    const row = s * 4;
    const xor = Buffer.alloc(row * s);
    for (let y = 0; y < s; y++) bgra.copy(xor, (s - 1 - y) * row, y * row, (y + 1) * row); // bitmaps go bottom-up
    const and = Buffer.alloc(Math.ceil(s / 32) * 4 * s);
    const head = Buffer.alloc(40);
    head.writeUInt32LE(40, 0); head.writeInt32LE(s, 4); head.writeInt32LE(s * 2, 8);
    head.writeUInt16LE(1, 12); head.writeUInt16LE(32, 14); head.writeUInt32LE(xor.length + and.length, 20);
    return Buffer.concat([head, xor, and]);
  });
  const dir = Buffer.alloc(6 + 16 * sizes.length);
  dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
  let off = dir.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    dir.writeUInt8(s % 256, e); dir.writeUInt8(s % 256, e + 1);
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(datas[i].length, e + 8); dir.writeUInt32LE(off, e + 12);
    off += datas[i].length;
  });
  return Buffer.concat([dir, ...datas]);
}

/**
 * The taskbar takes its icon from a real file outside the app archive: the installed PoE Helper.exe (the
 * flask is built in), a copy of the classic icon or your own icon as an .ico, or assets/icon.ico when run
 * from the source folder. Without this, Windows sometimes shows the blank default icon.
 */
function taskbarIcon() {
  if (process.platform !== 'win32' || !mainWin || mainWin.isDestroyed()) return;
  let iconPath = app.isPackaged ? process.execPath : path.join(ASSETS, 'icon.ico');
  try {
    if (services?.settings.get('customAppIcon')) {
      const img = nativeImage.createFromPath(customIconPath());
      if (!img.isEmpty()) {
        iconPath = path.join(app.getPath('userData'), 'app-icon.ico');
        fs.writeFileSync(iconPath, imageToIco(img));
      }
    } else if (iconStyle() === 'classic') {
      iconPath = path.join(app.getPath('userData'), 'app-icon-classic.ico');
      fs.writeFileSync(iconPath, fs.readFileSync(path.join(ASSETS, 'icon-classic.ico')));
    }
  } catch { /* keep the app's icon */ }
  // Windows ignores the icon unless a relaunch command is set too; run from the source folder that is
  // electron.exe plus the app folder, the same thing the PoE Helper shortcut starts
  const relaunchCommand = app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}"`;
  try {
    mainWin.setAppDetails({ appId: APP_ID, appIconPath: iconPath, appIconIndex: 0, relaunchCommand, relaunchDisplayName: 'PoE Helper' });
  } catch { /* older Windows */ }
  // and the window's own big and small icons, from the real file
  try { const img = nativeImage.createFromPath(iconPath === process.execPath ? assetFile('icon', '.ico') : iconPath); if (!img.isEmpty()) mainWin.setIcon(img); } catch { /* keep */ }
}

function applyAppIcon() {
  const img = appIconImage();
  taskbarIcon();
  if (tray) tray.setImage(trayImage());
  if (mainWin && !img.isEmpty() && services?.settings.get('customAppIcon')) mainWin.setIcon(img.resize({ width: 256, height: 256, quality: 'best' }));
  else if (mainWin) mainWin.setIcon(assetFile('icon', process.platform === 'win32' ? '.ico' : '.png'));
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
    ...(pobDirNow() ? [{ label: 'Save Path of Building snapshot', click: () => pobSnapshotNotify('tray') }] : []),
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
  handle('settings:set', (patch) => {
    const allowed = Object.keys(require('./services').DEFAULT_SETTINGS).filter((k) => !['sessionEnc', 'history', 'overrides'].includes(k));
    const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => allowed.includes(k)));
    // chat macros: a key and up to 250 characters of chat each
    if ('chatMacros' in clean) {
      const H = Hotkey;
      clean.chatMacros = (Array.isArray(clean.chatMacros) ? clean.chatMacros : []).slice(0, 12).map((m) => ({
        key: H.normalize(String(m?.key || '')) || '', text: String(m?.text || '').replace(/[\r\n]+/g, ' ').slice(0, 250), send: m?.send !== false,
      })).filter((m) => m.key);
    }
    s.patch(clean);
    services.applySettings();
    if ('hotkeyPrice' in clean || 'hotkeyPriceAdvanced' in clean || 'hotkeyLab' in clean || 'hotkeySnapshot' in clean || 'hotkeyPobTest' in clean || 'hotkeyPobCompare' in clean || 'pobCompareOn' in clean || 'chatMacros' in clean || 'chatMacrosOn' in clean) { hotkeysPaused = false; registerHotkeys(); }
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
  // While you record a new hotkey in Settings, the current ones are switched off so they don't fire.
  handle('hotkeys:pause', () => { hotkeysPaused = true; registerHotkeys({ quiet: true }); return true; });
  handle('hotkeys:resume', () => { hotkeysPaused = false; return registerHotkeys({ quiet: true }); });

  handle('trade:prepare', (text) => services.tradePrepare(text));
  handle('trade:search', (args) => services.tradeSearch(args));

  handle('networth:tabs', async (force) => services.ggg.stashTabs(await services.getLeague(), { force: !!force }));
  handle('networth:select', (indices) => { s.set('selectedTabs', (indices || []).map(Number).filter(Number.isInteger)); return s.get('selectedTabs'); });
  handle('networth:snapshot', () => snapshotNow('manual'));
  handle('networth:report', async (sinceMs, at = null) => services.networth.report(await services.getLeague(), { sinceMs, at }));
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
  // the icon of Path of Building.exe in your PoB folder, for the menu
  handle('pob:icon', async () => {
    const dir = pobState().dir;
    if (!dir) return null;
    const exe = ['Path of Building.exe', 'Path of Building-PoE2.exe'].map((n) => path.join(dir, n)).find((f) => fs.existsSync(f));
    if (!exe) return null;
    const img = await app.getFileIcon(exe, { size: 'normal' });
    return img.isEmpty() ? null : img.toDataURL();
  });
  // build codes and links, like PoB's Import/Export tab; pobb.in for a link to share
  const pobBuildFile = (file) => {
    const st = pobState();
    const real = path.resolve(String(file || ''));
    const rel = path.relative(path.resolve(st.buildsDir), real);
    if (!real.toLowerCase().endsWith('.xml') || !rel || rel.startsWith('..') || !fs.existsSync(real)) throw new Error('That build isn\'t in your Path of Building builds folder.');
    return real;
  };
  const webText = async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { 'User-Agent': `PoE Helper/${app.getVersion()}`, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    if (!r.ok) throw new Error(`${new URL(url).hostname} said ${r.status}${t && t.length < 200 ? `: ${t.trim()}` : ''}`);
    return t;
  };
  // the code goes straight to the clipboard (codes are long)
  handle('pob:exportCode', (file) => { const code = require('../core/pob-code').encode(fs.readFileSync(pobBuildFile(file), 'utf8')); clipboard.writeText(code); return { length: code.length }; });
  handle('pob:sharePobb', async (file) => {
    const code = require('../core/pob-code').encode(fs.readFileSync(pobBuildFile(file), 'utf8'));
    const id = (await webText('https://pobb.in/pob/', { method: 'POST', body: code, headers: { 'Content-Type': 'text/plain' } })).trim();
    if (!/^[\w-]{3,64}$/.test(id)) throw new Error('pobb.in didn\'t send a link back.');
    return { url: `https://pobb.in/${id}` };
  });
  handle('pob:importCode', async ({ text, name } = {}) => {
    const C = require('../core/pob-code');
    let code = String(text || '').trim();
    if (!code) throw new Error('Paste a Path of Building code or link first.');
    let site = null;
    if (C.isLink(code)) {
      const src = C.linkSource(code);
      if (!src) throw new Error('Path of Building doesn\'t import from that site. Links from pobb.in, pob.codes, poe.ninja, Maxroll, Pastebin, Rentry and poedb work.');
      site = src.site;
      code = (await webText(src.raw)).trim();
    }
    const xml = C.decode(code);
    const info = C.infoFromXml(xml);
    const st = pobState();
    const dir = path.join(st.buildsDir, 'PoE Helper snapshots');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
    const base = String(name || '').trim() || `Imported ${[info.ascendancy || info.className, info.level, info.skill].filter(Boolean).join(' ')}`;
    const clean = base.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 80).trim() || 'Imported build';
    let file = path.join(dir, `${clean} ${stamp}.xml`);
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${clean} ${stamp} (${i}).xml`);
    fs.writeFileSync(file, xml, 'utf8');
    return { file, info, site };
  });
  // open a build in Path of Building itself: PoB starts with the build it had open last, so that is set first
  handle('pob:openInPob', (file) => {
    const st = pobState();
    if (!st.dir) throw new Error('Path of Building wasn\'t found. Choose its folder on the Snapshot tab.');
    const exe = ['Path of Building.exe', 'Path of Building-PoE2.exe'].map((n) => path.join(st.dir, n)).find((f) => fs.existsSync(f));
    if (!exe) throw new Error('Path of Building.exe isn\'t in the Path of Building folder.');
    const real = path.resolve(String(file || ''));
    if (!real.toLowerCase().endsWith('.xml') || !fs.existsSync(real) || !path.relative(path.resolve(st.buildsDir), real) || path.relative(path.resolve(st.buildsDir), real).startsWith('..')) throw new Error('That build isn\'t in your Path of Building builds folder.');
    const P = require('./pob');
    const settings = P.pobSettingsFiles(st.buildsDir, app.getPath('documents'), st.dir).find((f) => fs.existsSync(f)) || P.pobSettingsFiles(st.buildsDir, app.getPath('documents'), st.dir)[0];
    const before = fs.existsSync(settings) ? fs.readFileSync(settings, 'utf8') : '';
    if (before) fs.writeFileSync(`${settings}.poehelper-backup`, before, 'utf8');
    fs.writeFileSync(settings, P.withLastBuild(before, real, path.basename(real, '.xml')), 'utf8');
    const child = require('child_process').spawn(exe, [], { cwd: st.dir, detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true };
  });
  handle('pob:set', (a = {}) => {
    const cur = services.settings.get('pob') || {};
    const next = { ...cur };
    for (const k of ['dir', 'buildsDir', 'character', 'charView', 'watchClipboard', 'find']) if (k in a) next[k] = a[k];
    services.settings.set('pob', next);
    if ('watchClipboard' in a) applyPobClipboard();
    if ('dir' in a) pob?.stop();
    rebuildTrayMenu();
    return pobState();
  });
  handle('pob:pickDir', async (which) => {
    const r = await dialog.showOpenDialog(mainWin, { properties: ['openDirectory'], title: which === 'builds' ? 'Your Path of Building builds folder' : 'Your Path of Building folder' });
    if (r.canceled || !r.filePaths?.[0]) return pobState();
    const cur = services.settings.get('pob') || {};
    services.settings.set('pob', { ...cur, [which === 'builds' ? 'buildsDir' : 'dir']: r.filePaths[0] });
    if (which !== 'builds') pob?.stop();
    rebuildTrayMenu();
    return pobState();
  });
  handle('pob:openFolder', () => {
    const st = pobState();
    const dir = path.join(st.buildsDir, 'PoE Helper snapshots');
    shell.openPath(fs.existsSync(dir) ? dir : st.buildsDir);
    return true;
  });
  // your characters on pathofexile.com, for the snapshot picker (1 request, kept 10 minutes)
  handle('pob:characters', async (force) => {
    const list = await services.ggg.characters({ maxAgeMs: force ? 0 : 10 * 60 * 1000 });
    return list.map((c) => ({ name: c.name, league: c.league, class: c.class, level: c.level, lastActive: !!c.lastActive }));
  });
  handle('pob:snapshot', () => pobSnapshot());
  handle('clipboard:item', () => { const t = clipboard.readText(); return t && isPoeItemText(t) ? t : null; });
  // calculations on a build file (a snapshot or any PoB build): one at a time, PoB holds one build
  handle('pob:builds', () => {
    const st = pobState();
    if (!fs.existsSync(st.buildsDir)) return [];
    return require('./pob').listBuilds(st.buildsDir).map(({ file, name, mtime }) => ({ file, name, mtime, snapshot: /^PoE Helper snapshots \/ /.test(name) }));
  });
  handle('pob:stats', (file) => pobWith(file, async () => ({ ...(await pob.stats()), editable: pobIsSnapshot(file) })));
  // PoB's Configuration tab: read on any build, changed (and saved into the file) only on your snapshots
  handle('pob:config', (file) => pobWith(file, async () => ({ ...(await pob.config()), editable: pobIsSnapshot(file) })));
  handle('pob:setConfig', ({ file, values } = {}) => {
    if (!pobIsSnapshot(file)) throw new Error('Only snapshots are changed here; open your own builds in Path of Building to change them.');
    return pobWith(file, async () => {
      const r = await pob.setConfig(values || {}, { save: true, name: path.basename(file, '.xml') });
      if (!r.xml) throw new Error(r.error || 'Path of Building did not save the build.');
      fs.writeFileSync(file, r.xml, 'utf8');
      delete r.xml;
      // PoB has this build open as it is now in the file
      pob.loaded = { ...pob.loaded, mtime: fs.statSync(file).mtimeMs, summary: r };
      return r;
    });
  });
  // the main skill of a build, kept per build file (PoB's own choice when you never picked one)
  handle('pob:setMain', ({ file, group } = {}) => {
    const cur = services.settings.get('pob') || {};
    const mainGroups = { ...(cur.mainGroups || {}) };
    if (group) mainGroups[file] = group; else delete mainGroups[file];
    services.settings.set('pob', { ...cur, mainGroups });
    return pobWith(file, async () => ({ ...(await pob.stats()), editable: pobIsSnapshot(file) }));
  });
  // builds with several trees and gear/skill/config sets: switch which one is in use (saved into snapshots)
  handle('pob:buildSet', ({ file, kind, value, link } = {}) => {
    if (!pobIsSnapshot(file)) throw new Error('Only snapshots and imported builds are changed here; pick this in Path of Building for your own builds.');
    if (!['tree', 'items', 'skills', 'configs'].includes(kind)) throw new Error('Unknown set.');
    return pobWith(file, async () => {
      const r = await pob.buildSet(kind, Number(value), { link: !!link, save: true, name: path.basename(file, '.xml') });
      if (r.error) throw new Error(r.error);
      if (!r.xml) throw new Error('Path of Building did not save the build.');
      fs.writeFileSync(file, r.xml, 'utf8');
      delete r.xml;
      pob.loaded = { ...pob.loaded, mtime: fs.statSync(file).mtimeMs, summary: r };
      return { ...r, editable: true };
    });
  });
  // PoB's pickers under Main skill (Kinetic Blast: Projectile / Explosions, minion skills…), saved into snapshots
  handle('pob:skillOpt', ({ file, key, value } = {}) => {
    if (!pobIsSnapshot(file)) throw new Error('Only snapshots are changed here; pick this in Path of Building for your own builds.');
    if (!['active', 'part', 'stages', 'mines', 'minion', 'minionSkill'].includes(key)) throw new Error('Unknown option.');
    return pobWith(file, async () => {
      const r = await pob.skillOpt(key, typeof value === 'number' ? value : String(value ?? '').slice(0, 200), { save: true, name: path.basename(file, '.xml') });
      if (r.error) throw new Error(r.error);
      if (!r.xml) throw new Error('Path of Building did not save the build.');
      fs.writeFileSync(file, r.xml, 'utf8');
      delete r.xml;
      pob.loaded = { ...pob.loaded, mtime: fs.statSync(file).mtimeMs, summary: r };
      return { ...r, editable: true };
    });
  });
  // PoB's own item tooltip: the item, and what equipping it in each slot gives (its stat compares)
  handle('pob:itemTooltip', ({ file, text } = {}) => pobWith(file, () => pob.timeless('itemTooltip', { item: String(text || '').slice(0, 20000) })));
  handle('pob:upgrades', (a) => { const { file, asSkill } = typeof a === 'string' ? { file: a } : a || {}; return pobWith(file, () => pob.withSkill(asSkill, () => pob.upgrades())); });
  handle('pob:calcs', (file) => pobWith(file, () => pob.calcs()));
  handle('pob:breakdown', ({ file, ref } = {}) => pobWith(file, () => pob.breakdown(String(ref || ''))));
  handle('pob:autoConfig', (file) => pobWith(file, () => pob.timeless('autoConfig')));
  handle('pob:tree', (file) => pobWith(file, async () => ({ ...(await pob.tree()), editable: pobIsSnapshot(file) })));
  handle('pob:node', ({ file, id } = {}) => pobWith(file, () => pob.node(Number(id) || 0)));
  handle('pob:power', ({ file, from, count } = {}) => pobWith(file, () => pob.power(Number(from) || 0, Number(count) || 150)));
  // the tree optimiser, on snapshots only; nothing is saved until you keep the result
  handle('pob:optStart', ({ file, ...o } = {}) => {
    if (!pobIsSnapshot(file)) throw new Error('Only snapshots are optimised here; take a snapshot of your character first.');
    return pobWith(file, () => pob.optStart({ goal: ['d', 'l', 'e'].includes(o.goal) ? o.goal : 'd', lifePct: Number(o.lifePct ?? 100), ehpPct: Number(o.ehpPct ?? 95), dpsPct: Number(o.dpsPct ?? 90), keepRes: o.keepRes !== false, keepChaos: !!o.keepChaos, useFree: !!o.useFree, maxIter: Math.min(80, Math.max(1, Number(o.maxIter) || 40)) }));
  });
  handle('pob:optStep', ({ file } = {}) => pobWith(file, async () => ({ ...(await pob.optStep()), editable: true })));
  handle('pob:optEnd', ({ file, keep } = {}) => pobWith(file, async () => {
    const r = await pob.optEnd({ keep: !!keep, name: path.basename(file, '.xml') });
    if (keep) {
      if (!r.xml) throw new Error('Path of Building did not save the build.');
      fs.writeFileSync(file, r.xml, 'utf8');
      pob.loaded = { ...pob.loaded, mtime: fs.statSync(file).mtimeMs, summary: r.summary };
    } else pob.loaded = null; // opened again from the file: the tree as it was
    return { kept: !!keep };
  }));
  // the trade site with these timeless jewel seeds (cheapest first), in your league
  handle('pob:timelessTrade', async ({ ids, seeds } = {}) => {
    const league = await services.getLeague();
    const filters = (seeds || []).slice(0, 40).flatMap((seed) => (ids || []).filter((id) => /^explicit\.pseudo_timeless_jewel_\w+$/.test(id)).map((id) => ({ id, value: { min: Number(seed), max: Number(seed) } })));
    const q = { query: { status: { option: services.settings.get('tradeStatus') || 'securable' }, stats: [{ type: 'count', value: { min: 1 }, filters }] }, sort: { price: 'asc' } };
    openExternal(`https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(q))}`);
    return { ok: true };
  });
  // the passive tree's art from your Path of Building folder (TreeData: the files of the tree GGG publishes),
  // read from disk when you look at the tree, never shipped with the app
  const treeArtCache = new Map();
  handle('pob:treeArt', ({ version, files } = {}) => {
    const st = pobState();
    if (!st.dir || !/^[\w.-]{1,40}$/.test(String(version || ''))) return {};
    const out = {};
    for (const f of (files || []).slice(0, 20)) {
      if (!/^[\w.-]{1,80}\.(png|jpg|jpeg|webp)$/i.test(f)) continue;
      const key = `${version}/${f}`;
      if (!treeArtCache.has(key)) {
        const file = path.join(st.dir, 'TreeData', version, f);
        if (!fs.existsSync(file)) { treeArtCache.set(key, null); continue; }
        const ext = f.split('.').pop().toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
        treeArtCache.set(key, `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`);
      }
      if (treeArtCache.get(key)) out[f] = treeArtCache.get(key);
    }
    return out;
  });
  // the levelling plan: the order to take the tree in (gems per level come from pob:supportGems)
  handle('pob:levelPlan', ({ file, op, ...o } = {}) => {
    if (!['levelPlanStart', 'levelPlanStep', 'activeSkills', 'levelSkill'].includes(op)) throw new Error('Unknown levelling plan request.');
    return pobWith(file, () => pob.timeless(op, o));
  });
  // timeless jewels: every seed in one of your sockets, scored by PoB; "keep" puts the chosen one in the snapshot
  handle('pob:timeless', ({ file, op, ...o } = {}) => {
    const ops = ['timelessSockets', 'timelessStart', 'timelessStep', 'timelessResults', 'timelessShow', 'timelessEnd'];
    if (!ops.includes(op)) throw new Error('Unknown timeless jewel request.');
    if (op === 'timelessEnd' && o.keep && !pobIsSnapshot(file)) throw new Error('Only snapshots are changed here.');
    return pobWith(file, async () => {
      const r = await pob.timeless(op, op === 'timelessEnd' ? { keep: !!o.keep, seed: Number(o.seed) || null, save: !!o.keep, name: path.basename(file, '.xml') } : o);
      if (op === 'timelessEnd' && o.keep) {
        if (!r.xml) throw new Error('Path of Building did not save the build.');
        fs.writeFileSync(file, r.xml, 'utf8');
        delete r.xml;
        pob.loaded = { ...pob.loaded, mtime: fs.statSync(file).mtimeMs, summary: r.summary };
      }
      return r;
    });
  });
  // the best support gems for the main skill; "apply" puts them in the snapshot
  handle('pob:supportGems', ({ file, apply, ...o } = {}) => {
    if (apply && !pobIsSnapshot(file)) throw new Error('Only snapshots are changed here; change your own builds in Path of Building.');
    return pobWith(file, async () => {
      const opts = { level: Number(o.level) || null, quality: Number(o.quality ?? 20), awakened: !!o.awakened, exceptional: !!o.exceptional, keep: Array.isArray(o.keep) ? o.keep.map(Number) : [] };
      const r = await pob.supportGems({ ...opts, apply: !!apply, save: !!apply, name: path.basename(file, '.xml') });
      if (apply && r.xml) {
        fs.writeFileSync(file, r.xml, 'utf8');
        delete r.xml;
        pob.loaded = { ...pob.loaded, mtime: fs.statSync(file).mtimeMs, summary: r.summary };
      }
      return { ...r, editable: pobIsSnapshot(file) };
    });
  });
  // the tree of a snapshot changed here (your own builds are changed in Path of Building)
  handle('pob:treeEdit', ({ file, id, effect, undo } = {}) => {
    if (!pobIsSnapshot(file)) throw new Error('Only snapshots are changed here; open your own builds in Path of Building to change them.');
    return pobWith(file, async () => {
      const r = await pob.treeEdit({ id: Number(id) || null, effect: Number(effect) || null, undo: !!undo, save: true, name: path.basename(file, '.xml') });
      if (r.error || r.needEffect) return r;
      if (!r.xml) throw new Error('Path of Building did not save the build.');
      fs.writeFileSync(file, r.xml, 'utf8');
      delete r.xml;
      pob.loaded = { ...pob.loaded, mtime: fs.statSync(file).mtimeMs, summary: r.summary };
      return { ...r, editable: true };
    });
  });
  // "find the best item for me": a weighted-sum trade search made from what PoB says each stat is worth
  // (2 trade requests: the search and the top 10 listings, which PoB then tests in that slot)
  handle('pob:findItem', (a = {}) => pobWith(a.file, () => pob.withSkill(a.asSkill, () => pobFindItem(a))));
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
  // small pictures (the menu, Settings) use the version drawn for small sizes, so they don't turn muddy
  // 'mark': the flask alone, without its square, for the menu next to the app's name
  const smallIcon = (kind) => {
    if (!s.get('customAppIcon') && iconStyle() === 'flask') { const i = nativeImage.createFromPath(path.join(ASSETS, kind === 'mark' ? 'icon-mark.png' : 'icon-small.png')); if (!i.isEmpty()) return i.toDataURL(); }
    return appIconImage().resize({ width: 64, height: 64, quality: 'best' }).toDataURL();
  };
  handle('appIcon:get', (kind) => smallIcon(kind));
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
  handle('appIcon:style', (style) => {
    s.set('appIconStyle', style === 'classic' ? 'classic' : 'flask');
    s.set('customAppIcon', false);
    applyAppIcon();
    return smallIcon();
  });
  handle('appIcon:reset', () => {
    s.set('customAppIcon', false);
    applyAppIcon();
    return appIconImage().resize({ width: 64, height: 64, quality: 'best' }).toDataURL();
  });
  handle('icons:import', (a) => services.importIcon(a || {}));
  handle('icons:delete', (id) => services.deleteIcon(id));
  handle('sounds:data', (id) => services.soundData(id));
  handle('tiers:view', () => { const v = services.tierViewNow(); return v ? { ...v, scrolls: require('../core/filter/scrolls').scrollTiers(v) } : v; });
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

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// ---------------- Path of Building (your installed copy, run headless) ----------------
// It only runs to save a snapshot of your character, and stops again after a few idle minutes.
let pob = null;
let pobIdle = null;
function pobDirNow() {
  if (!services) return null;
  return require('./pob').findPobDir((services.settings.get('pob') || {}).dir);
}
function pobState() {
  const P = require('./pob');
  const st = services.settings.get('pob') || {};
  const dir = P.findPobDir(st.dir);
  const dirs = P.buildsDirs(app.getPath('documents'));
  const buildsDir = st.buildsDir && fs.existsSync(st.buildsDir) ? st.buildsDir : dirs.find((d) => fs.existsSync(d)) || dirs[dirs.length - 1];
  return {
    dir, dirFound: !!dir, buildsDir, character: st.character || null, charView: st.charView || {}, watchClipboard: st.watchClipboard !== false, find: st.find || null, last: st.last || null,
    state: pob?.state || 'off', error: pob?.error || null, platform: process.platform,
  };
}
async function pobReady(dir) {
  if (!pob) pob = new (require('./pob').PobEngine)({ utilityProcess, hostFile: path.join(__dirname, '..', 'pob', 'host.lua'), workerFile: path.join(__dirname, 'pob-worker.js'), cacheDir: path.join(app.getPath('userData'), 'pob-cache'), log });
  clearTimeout(pobIdle);
  try {
    await pob.start(dir);
  } catch (e) {
    log('pob', e.message);
    throw new Error(`Path of Building didn't start: ${e.message}`);
  }
}

async function pobFindItem({ slot, focus = 'balanced', maxLevel = null, maxPrice = null, unit = 'chaos', betterOnly = true }) {
  const T = require('../core/pob-trade');
  const P = require('./pob');
  const all = T.CANDIDATES;
  const w = await pob.weights(slot, all.map((c) => c.line));
  if (w.error) throw new Error(w.error);
  const cands = T.candidatesFor(w.type);
  if (!cands.length) throw new Error(`Searching for ${w.type || 'this kind of item'} isn't supported yet.`);
  const results = cands.map((c) => w.results[all.indexOf(c)]);
  const stats = await services.ggg.tradeStats();
  const loggedIn = services.ggg.hasSession();
  const found = T.weightsFrom(results, cands, stats, { focus });
  const { missing, scale } = found;
  const weights = T.limitWeights(found.weights, { loggedIn });
  if (!weights.length) throw new Error('None of the mods Path of Building tried make this build stronger in that slot, so there is nothing to search for.');
  const league = await services.getLeague();
  const divine = await services.ninja.divinePrice(league).catch(() => null);
  let maxPriceChaos = Number(maxPrice) || null;
  if (maxPriceChaos && unit === 'divine') {
    if (!divine) throw new Error('poe.ninja has no Divine Orb price right now; give the price in chaos.');
    maxPriceChaos *= divine;
  }
  // at least as good as your item: what it is worth in the same units, a little under to allow for rounding
  const f = T.FOCUS[focus] || T.FOCUS.balanced;
  const curWorth = (f.dps * (w.current.dpsPct || 0) + f.ehp * (w.current.ehpPct || 0)) * scale;
  const minSum = betterOnly && curWorth > 0 ? curWorth * 0.9 : 0;
  const make = (list, min) => T.buildWeightedQuery({ weights: list, category: T.CATEGORY[w.type], maxLevel, maxPriceChaos, minSum: min, status: services.settings.get('tradeStatus') || 'securable' });
  // the whole search, opened on the trade site itself (your browser is logged in there, so it allows more filters)
  const full = make(found.weights.slice(0, 35), minSum);
  const siteUrl = `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify({ query: full.query, sort: full.sort }))}`;
  // "Query is too complex": try again with fewer stats (the ones worth most); with fewer stats the sum of an item
  // as good as yours isn't known, so those searches only sort by it
  const sizes = [...new Set([weights.length, 15, 8, 5].filter((n) => n <= weights.length))];
  let res = null;
  let used = weights;
  let refused = null;
  for (const n of sizes) {
    used = weights.slice(0, n);
    const body = make(used, n === weights.length ? minSum : 0);
    try { res = await services.ggg.tradeSearch(league, body, { login: true }); refused = null; break; } catch (e) {
      log('pob trade search refused', n, e.message);
      refused = e;
      if (!/too complex|reduce the amount of filters/i.test(e.message)) break;
    }
  }
  const base = { slot, type: w.type, base: w.base, current: w.currentName, siteUrl, weights: used.map(({ text, tradeWeight, line }) => ({ text, weight: tradeWeight, line })), missing, minSum: used.length === weights.length ? minSum : 0, listings: [], loggedIn, leftOut: found.weights.length - used.length };
  if (!res) return { ...base, refused: refused?.message || 'The trade site refused the search.', url: siteUrl, total: 0 };
  const out = { ...base, url: services.ggg.tradeUrl(league, res.id), total: res.total ?? res.result?.length ?? 0 };
  if (!res.result?.length) return out;
  const fetched = await services.ggg.tradeFetch(res.id, res.result.slice(0, 10));
  for (const r of fetched.result || []) {
    if (!r?.item) continue;
    const text = T.itemTextFromTrade(r.item);
    const p = r.listing?.price;
    const chaos = p ? (p.currency === 'divine' && divine ? p.amount * divine : p.currency === 'chaos' ? p.amount : null) : null;
    let test = null;
    try {
      const c = await pob.compare(text);
      const s = P.summarise(c)?.slots.find((x) => x.slot === slot) || null;
      test = s ? { dps: s.changes.find((x) => x.key === 'dps') || null, changes: s.changes.filter((x) => x.key !== 'dps') } : null;
    } catch { /* PoB couldn't read it: still listed */ }
    out.listings.push({
      id: r.id, name: [r.item.name, r.item.typeLine].filter(Boolean).join(', ').replace(/<<[^>]*>>/g, ''), ilvl: r.item.ilvl, level: (r.item.requirements || []).find((q) => q.name === 'Level')?.values?.[0]?.[0] || null,
      price: p ? { amount: p.amount, currency: p.currency, chaos } : null, seller: r.listing?.account?.name || null, whisper: r.listing?.whisper || null,
      mods: [...(r.item.implicitMods || []).map((m) => `${m} (implicit)`), ...(r.item.explicitMods || []), ...(r.item.craftedMods || []).map((m) => `${m} (crafted)`)],
      text, test, full: !!w.full,
    });
  }
  // best first by what PoB says each one does to your build (the trade sum is an estimate)
  const score = (l) => (l.test ? f.dps * (l.test.dps?.pct || 0) + f.ehp * ((l.test.changes.find((c) => c.key === 'TotalEHP')?.pct) || 0) : -Infinity);
  out.listings.sort((a, b) => score(b) - score(a));
  return out;
}

/** A build file in the PoE Helper snapshots folder. */
function pobIsSnapshot(file) {
  if (!file) return false;
  const dir = path.join(pobState().buildsDir, 'PoE Helper snapshots');
  return path.resolve(path.dirname(file)).toLowerCase() === path.resolve(dir).toLowerCase();
}

let pobQueue = Promise.resolve();
function pobIdleLater() {
  clearTimeout(pobIdle);
  pobIdle = setTimeout(() => { pob?.stop(); mainWin?.webContents.send('pob:changed'); }, 5 * 60 * 1000);
}
/** Runs fn with that build loaded in PoB; calls wait their turn. */
function pobWith(file, fn) {
  // the build in use, for the compare hotkey
  try { const cur = services.settings.get('pob') || {}; if (file && cur.current !== file) services.settings.set('pob', { ...cur, current: file }); } catch { /* not important */ }
  const job = pobQueue.then(async () => {
    const st = pobState();
    if (!st.dir) throw new Error('Path of Building (Community) wasn\'t found. Choose its folder on the Path of Building page.');
    if (!file || !fs.existsSync(file)) throw new Error('That build file is gone. Pick another one.');
    try {
      await pobReady(st.dir);
      await pob.load(file, (services.settings.get('pob') || {}).mainGroups?.[file] || null);
      return await fn();
    } finally { pobIdleLater(); }
  });
  pobQueue = job.catch(() => {});
  return job;
}

// A snapshot of your character, like PoB's Import tab: your gear, gems, tree and jewels from pathofexile.com
// (2-3 requests with your POESESSID), made into a build by PoB itself and saved in your builds folder.
let pobSnapshotBusy = false;
function pobSnapshot() {
  const job = pobQueue.then(() => pobSnapshotNow());
  pobQueue = job.catch(() => {});
  return job;
}
async function pobSnapshotNow() {
  if (pobSnapshotBusy) throw new Error('A snapshot is already being saved.');
  pobSnapshotBusy = true;
  const P = require('./pob');
  try {
    const st = pobState();
    if (!st.dir) throw new Error('Path of Building (Community) wasn\'t found. Install it, or choose its folder on the Path of Building page.');
    const cfg = services.settings.get('pob') || {};
    const ggg = services.ggg;
    // ask pathofexile.com while PoB starts
    const started = pobReady(st.dir);
    started.catch(() => {});
    let character;
    let items;
    if (cfg.character) {
      items = await ggg.characterItems(cfg.character);
      character = { name: cfg.character, ...(items?.character || {}) };
    } else {
      const c = P.pickCharacter(await ggg.characters({ maxAgeMs: 60 * 1000 }));
      if (!c) throw new Error('No characters found on your account.');
      items = await ggg.characterItems(c.name);
      character = { ...c, ...(items?.character || {}) };
    }
    character.league = character.league || '';
    const passives = await ggg.characterPassives(character.name);
    await started;
    const file = P.snapshotFile(st.buildsDir, character.name);
    // your Configuration ticks from this character's last snapshot (set in the app or in PoB), so you don't tick them again
    let config = null;
    const prev = P.lastSnapshotOf(path.dirname(file), character.name);
    if (prev) {
      try {
        config = P.configFromXml(fs.readFileSync(prev, 'utf8'));
        for (const k of P.CONFIG_FROM_IMPORT) delete config[k];
      } catch { config = null; }
    }
    const r = await pob.importCharacter({ character, items, passives, name: path.basename(file, '.xml'), config });
    if (!r.xml) throw new Error(r.error || 'Path of Building made no build.');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, r.xml, 'utf8');
    delete r.xml;
    delete r.id;
    services.settings.set('pob', { ...(services.settings.get('pob') || {}), last: { file, at: Date.now(), character: character.name, summary: r } });
    log('pob snapshot', file);
    mainWin?.webContents.send('pob:changed');
    return { file, character: character.name, summary: r };
  } finally {
    pobSnapshotBusy = false;
    if (pob) pob.loaded = null; // the import replaced the build PoB had open
    pobIdleLater();
  }
}
async function pobSnapshotNotify() {
  try {
    const r = await pobSnapshot();
    notify(`Saved a Path of Building snapshot of ${r.character}.`);
  } catch (e) {
    notify(`Path of Building snapshot failed: ${e.message}`);
  }
}

app.whenReady().then(async () => {
  services = createServices({ dataDir: app.getPath('userData'), secrets, log, labBrowser });
  registerIpc();
  createMainWindow();
  createOverlay();
  createTray();
  if (services.settings.get("customAppIcon") || services.settings.get("appIconStyle") === "classic") applyAppIcon();
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
  applyPobClipboard();
  applyAutoSnapshot();
  applyFilterWatch();
  applyAutoTier();
  // Warm only what every price check needs (league + currency): 2 small poe.ninja requests, cached.
  services.getLeague().then((l) => services.ninja.category(l, 'Currency')).catch((e) => log('warmup', e.message));
  // your Path of Building build, loaded in the background so item checks can compare against it
  // Rewrite the "(helper)" filter at start, so a fix in a new version (or a FilterBlade update)
  // reaches the game without you having to change anything first.
  if (services.settings.get('economy')?.enabled) services.regenerateEconomy().catch(() => {});
  else if (services.filters.basePath()) { try { services.filters.write(); } catch (e) { log('startup write', e.message); } }
});

app.on('will-quit', () => {
  try { chatMacros?.stop(); } catch { /* ignore */ }
  globalShortcut.unregisterAll();
  stopHook();
  stopClipboardWatcher();
  services?.networth.stopAuto();
  services?.filters.unwatch();
  pob?.stop();
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', (e) => e.preventDefault());
