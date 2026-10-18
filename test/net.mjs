// 联机冒烟测试：两个浏览器上下文 → 建房/加入 → 开局 → 状态流 → 通过 dm 路由打一整套「击杀」流程
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:8080/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 600 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); };
    document.exitPointerLock = () => { };
  });
  return page;
};
const errors = [];
const a = await mk(); const b = await mk();

const boot = async p => {
  await p.goto(URL, { timeout: 30000 });
  await p.waitForFunction(() => window.game && window.game.state === 'menu', null, { timeout: 240000 });
};
await boot(a); await boot(b);
const log = (t, x) => console.log(`[net] ${t}${x !== undefined ? ': ' + JSON.stringify(x) : ''}`);
const err = m => { errors.push(m); };

// A 连接并建房
await a.evaluate(async () => { await game.net.connect(); game.net.setName('房主甲'); });
await a.evaluate(() => game.net.create('测试房', null));
await a.waitForFunction(() => game.net.room && game.net.room.players.length === 1, null, { timeout: 5000 }).catch(() => err('A 建房失败'));
log('A 房间', await a.evaluate(() => game.net.room && { id: game.net.room.id, players: game.net.room.players.length }));

// B 列表 + 加入
await b.evaluate(async () => { await game.net.connect(); game.net.setName('队员乙'); });
await b.evaluate(() => new Promise((res, rej) => {
  game.net.refresh();
  const off = game.net.on('rooms', list => {
    const r = list.find(x => x.n >= 1 && !x.playing);
    if (r) { off(); game.net.join(r.id); res(r.id); }
  });
  setTimeout(() => { off(); rej(new Error('房间列表没有可用房间')); }, 5000);
})).catch(e => err('B 加入失败: ' + e.message));
await a.waitForFunction(() => game.net.room && game.net.room.players.length === 2, null, { timeout: 5000 }).catch(() => err('A 未看到 2 名玩家'));

// 房主编 cfg 并开局（用房间名单 → buildNetCfg）
await a.evaluate(() => new Promise((res, rej) => import('./js/netmatch.js').then(({ buildNetCfg }) => {
  const cfg = buildNetCfg(game.net.room, { mode: 'tdm', map: 'dune', scoreLimit: 50, timeLimit: 10 });
  game.net.start(cfg);
  game.startGame('net', cfg);
  game.net.setPlaying(true);
  res();
}))).catch(e => err('A 开局失败: ' + e.message));

const toPlay = async (p, tag) => p.waitForFunction(() => game.state === 'play' && game.mode && game.mode.isNet, null, { timeout: 60000 })
  .then(() => log(tag + ' 进场')).catch(() => err(tag + ' 未进入 net 对局'));
await Promise.all([toPlay(a, 'A'), toPlay(b, 'B')]);
await a.waitForTimeout(2500); await b.waitForTimeout(2500); // 给 20Hz 状态流一点时间

// 两侧都应看到对方远端实体且有复制状态
for (const [p, tag] of [[a, 'A'], [b, 'B']]) {
  const info = await p.evaluate(() => ({
    remote: [...game.mode.players.values()].map(n => ({ cid: n.cid, name: n.name, hasState: n.hasState, alive: n.alive, pos: [n.pos.x, n.pos.y, n.pos.z].map(v => +v.toFixed(1)) })),
    frags: game.bots.length,
    me: game.player && game.player.team,
  })).catch(e => { err(tag + ' info 失败: ' + e.message); return null; });
  log(tag + ' 实体', info);
  if (info && (!info.frags || !info.remote[0] || !info.remote[0].hasState)) err(tag + ' 远端实体/状态缺失');
}

// 击杀路由：A → dm hit → B 本地结算死亡 → B 广播 kill → A 记分 + killfeed
const res = await a.evaluate(() => new Promise((res, rej) => {
  const n = [...game.mode.players.values()][0];
  if (!n) return rej(new Error('没有远端玩家'));
  game.net.dm(n.cid, { e: 'hit', dmg: 500, w: 'm4', from: [n.pos.x, n.pos.y + 2, n.pos.z] });
  setTimeout(() => res({
    kills: game.player.stats.kills, score: game.player.stats.score,
    feed: document.querySelectorAll('#killfeed .kf').length,
    remoteDead: [...game.mode.players.values()].map(x => !x.alive),
  }), 1500);
})).catch(e => { err('击杀路由失败: ' + e.message); return null; });
log('A 击杀结算', res);
if (res && res.kills !== 1) err('击杀未路由到击杀端统计: kills=' + res.kills);

// B 侧应处于死亡状态，且 killfeed 有记录
const bside = await b.evaluate(() => ({
  alive: game.player && game.player.alive, deaths: game.player && game.player.stats.deaths,
  feed: document.querySelectorAll('#killfeed .kf').length,
  screen: document.getElementById('deathScreen').classList.contains('hidden') ? 'hidden' : 'shown',
})).catch(e => { err('B 状态失败: ' + e.message); return null; });
log('B 被击杀侧', bside);
if (bside && bside.alive) err('B 未死亡');
if (bside && bside.feed < 1) err('B 自己的 killfeed 没有记录');

// 比分一致性：击杀产生的队伍分会同步到每个客户端（A 显示 1:0 / B 显示 0:1）
await a.waitForTimeout(400); await b.waitForTimeout(400);
const sc = async p => p.evaluate(() => [...document.querySelectorAll('#scorebar .sb-team')].map(x => x.textContent.trim()).map(Number));
const [sa, sb] = await Promise.all([sc(a), sc(b)]);
log('比分 A / B', [sa, sb]);
if (!sa || !sb) err('读不到比分');
else {
  if (sa[0] !== 1 || sa[1] !== 0) err('A 端比分异常: ' + JSON.stringify(sa));
  if (sb[0] !== 0 || sb[1] !== 1) err('B 端比分异常: ' + JSON.stringify(sb));
}

// 截图
try { await a.screenshot({ path: 'test/net_a.png' }); await b.screenshot({ path: 'test/net_b.png' }); } catch { }

console.log(errors.length ? '---- 问题 ----\n' + errors.join('\n') : '---- 全部通过 ----');
await browser.close();
