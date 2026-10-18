// 红点瞄准镜 ADS 可见性验证 v2：隐藏遮罩、高清截图 + 中心像素红点检测
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); if (m.text().startsWith('S ')) console.log(m.text()); });
page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
await page.addInitScript(q => localStorage.setItem('mf_settings', JSON.stringify({ quality: q })), process.env.Q || 'low');
await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; });
await page.goto('http://localhost:8080/index.html');
await page.waitForFunction(() => window.game && window.game.state === 'menu', null, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('clickToPlay').style.display = 'none';
  document.getElementById('hud').style.visibility = 'visible';
  // 藏掉准星/计分等干扰元素，只看画面
  for (const id of ['cross', 'scoreboard']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  game.startGame('mp', { mode: 'tdm', map: 'yard', diff: 0, allies: 0, enemies: 0, scoreLimit: 50, timeLimit: 10 });
});
await page.waitForFunction(() => game.state === 'play');
await page.evaluate(() => {
  const p = game.player;
  p.pos.set(0, 0, 0); p.pos.y = game.world.groundHeight(0, 0, 30, 0.3);
  p.yaw = 0; p.pitch = 0;
  const ws = p.ws;
  ws.replaceSlot(0, { id: 'm4', att: { optic: 'reddot' } });
  game.input.buttons = 4;
  const inp = game.snapshotInput();
  for (let i = 0; i < 45; i++) game.update(1 / 30, inp);
  console.log('S adsT', ws.adsT, 'optic', ws.w.info.optic, 'reticle', !!ws.w.info.reticle);
});
await page.waitForTimeout(800);
function redScan() {
  const cv = document.querySelector('canvas');
  const gl = cv.getContext('webgl2') || cv.getContext('webgl');
  gl.preserveDrawingBuffer || (console.log('S no-preserve-buffer'), 0);
  const cx = cv.width / 2, cy = cv.height / 2;
  const buf = new Uint8Array(4 * 41 * 41);
  gl.readPixels(cx - 20, cy - 20, 41, 41, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const hits = [];
  for (let i = 0; i < buf.length; i += 4) { const r = buf[i], g = buf[i + 1], b = buf[i + 2]; if (r > 140 && r > g * 1.8 && r > b * 1.8) hits.push([r, g, b]); }
  return `red pixels in center 41x41: ${hits.length}, sample: ${JSON.stringify(hits.slice(0, 3))}`;
}
await page.screenshot({ path: 'test/reddot-ads.png' });
console.log('S', await page.evaluate(redScan));
// 中心特写（2x 已经放大）裁剪中间区域
await page.screenshot({ path: 'test/reddot-center.png', clip: { x: 590, y: 310, width: 100, height: 100 } });
// 半 ADS 过渡态
await page.evaluate(() => {
  game.input.buttons = 0;
  const inp = game.snapshotInput();
  for (let i = 0; i < 6; i++) game.update(1 / 60, inp);
  game.input.buttons = 4;
  for (let i = 0; i < 14; i++) game.update(1 / 60, inp);
  console.log('S adsT-half', game.player.ws.adsT.toFixed(2));
});
await page.screenshot({ path: 'test/reddot-half.png' });
console.log('OK', errs.slice(0, 20).join('\n'));
await browser.close(); process.exit(0);
