'use strict';
// The stream window: the part of the screen the game is on, price check popups included, drawn here so
// Discord can share this one window. Nothing is recorded or sent anywhere; it only draws what's on screen.
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });
  const msg = document.getElementById('msg');
  const tip = document.getElementById('tip');
  const video = document.createElement('video');
  video.muted = true;
  let src = null;
  let srcId = null;

  const say = (html) => { msg.innerHTML = html; msg.style.display = html ? '' : 'none'; };

  async function start(id) {
    try { video.srcObject?.getTracks().forEach((t) => t.stop()); } catch { /* none */ }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxFrameRate: 60, maxWidth: 7680, maxHeight: 4320 } },
      });
    } catch {
      // newer Electron: the screen is picked in the main process (see setDisplayMediaRequestHandler)
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: false });
    }
    video.srcObject = stream;
    await video.play();
    srcId = id;
  }

  async function refresh() {
    try {
      src = await window.poe.call('stream:source');
      if (!src) return say('Can\'t see the screen. Restart PoE Helper and try again.');
      // only the game is ever shown: nothing of your desktop while it isn't running
      if (!src.game) { srcId && video.srcObject?.getTracks().forEach((t) => t.stop()); srcId = null; video.srcObject = null; return say('<b>Waiting for Path of Exile.</b><br>Start the game (Windowed or Windowed Fullscreen); it shows here with your price checks on top.'); }
      if (src.id !== srcId) await start(src.id);
      say('');
    } catch (e) { say(`Can't capture the screen: ${String(e.message || e).replace(/</g, '&lt;')}`); }
  }

  function draw() {
    requestAnimationFrame(draw);
    if (!video.videoWidth || !src?.game) { if (canvas.width) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); } return; }
    const w = Math.round(canvas.clientWidth * devicePixelRatio); const h = Math.round(canvas.clientHeight * devicePixelRatio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    // the game's area (in the video's pixels; the video can be scaled from the screen's own size)
    let sx = 0; let sy = 0; let sw = video.videoWidth; let sh = video.videoHeight;
    const c = src?.crop;
    if (c && c.screenW) {
      const kx = video.videoWidth / c.screenW; const ky = video.videoHeight / c.screenH;
      sx = Math.max(0, c.x * kx); sy = Math.max(0, c.y * ky);
      sw = Math.min(video.videoWidth - sx, c.width * kx); sh = Math.min(video.videoHeight - sy, c.height * ky);
    }
    if (sw < 2 || sh < 2) return;
    const k = Math.min(w / sw, h / sh);
    const dw = sw * k; const dh = sh * k;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(video, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  refresh();
  setInterval(refresh, 2000); // the game window moved, went to another screen, or started
  requestAnimationFrame(draw);
  setTimeout(() => { tip.style.opacity = '0'; }, 12000);
})();
