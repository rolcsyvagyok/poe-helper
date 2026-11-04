'use strict';
/**
 * Automatic updates from GitHub Releases (rolcsyvagyok/poe-helper), via electron-updater.
 *
 * Only the installed app updates itself. Running from the source folder (Start PoE Helper.cmd)
 * reports "dev" so nothing is downloaded there. The check is one small request to GitHub at start
 * and every 4 hours; it has nothing to do with GGG's API.
 */

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

function createUpdater({ app, log = () => {}, onStatus = () => {} }) {
  let status = { state: 'idle', version: app.getVersion() };
  let updater = null;
  let timer = null;

  const set = (patch) => {
    status = { ...status, ...patch, at: Date.now() };
    onStatus(status);
  };

  if (!app.isPackaged) {
    status = { state: 'dev', version: app.getVersion(), message: 'Updates are installed automatically in the installed app. This copy runs from the source folder.' };
  } else {
    try {
      ({ autoUpdater: updater } = require('electron-updater'));
    } catch (e) {
      log('updater unavailable', e.message);
      status = { state: 'error', version: app.getVersion(), message: 'The updater is missing from this build.' };
    }
  }

  if (updater) {
    updater.autoDownload = true; // download in the background
    updater.autoInstallOnAppQuit = true; // or install the next time you quit
    updater.logger = { info: (m) => log('update', m), warn: (m) => log('update warn', m), error: (m) => log('update error', m), debug: () => {} };
    updater.on('checking-for-update', () => set({ state: 'checking' }));
    updater.on('update-available', (i) => set({ state: 'downloading', latest: i?.version, percent: 0 }));
    updater.on('update-not-available', (i) => set({ state: 'none', latest: i?.version || app.getVersion() }));
    updater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p?.percent || 0) }));
    updater.on('update-downloaded', (i) => set({ state: 'ready', latest: i?.version, notes: typeof i?.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 600) : null }));
    updater.on('error', (e) => set({ state: 'error', message: friendly(e) }));
  }

  function friendly(e) {
    const m = String(e?.message || e || '');
    if (/404|Not Found/i.test(m)) return 'No release found on GitHub yet.';
    if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|net::/i.test(m)) return 'Could not reach GitHub. Updates are checked again later.';
    return m.split('\n')[0].slice(0, 200);
  }

  async function check() {
    if (!updater) return status;
    try { await updater.checkForUpdates(); } catch (e) { set({ state: 'error', message: friendly(e) }); }
    return status;
  }

  function start() {
    if (!updater) return;
    setTimeout(check, 15 * 1000); // let the app settle first
    timer = setInterval(check, CHECK_EVERY_MS);
  }

  /** Restart now into the downloaded version. */
  function install() {
    if (!updater || status.state !== 'ready') return false;
    setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  }

  function stop() { clearInterval(timer); }

  return { start, check, install, stop, status: () => status };
}

module.exports = { createUpdater };
