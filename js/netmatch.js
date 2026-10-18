// 局域网联机对局：继承 MPMatch，真人玩家互射
// 权威模型：每个客户端对自己玩家的位置/血量权威；伤害按「击中者上报 → 受害者本地结算」路由；
// 爆炸/投掷物只在发起端结算伤害，其余端只做表现。比分/计时/据点由本地事件流推导，双方一致。
import * as THREE from 'three';
import { MPMatch, Heli, Sentry } from './mp.js';
import { Player } from './player.js';
import { NetPlayer } from './netplayer.js';
import { MAPS } from './maps.js';
import { KILLSTREAKS } from './data.js';
import { Projectile } from './combat.js';
import { clamp } from './util.js';

const V3 = a => new THREE.Vector3(a[0], a[1], a[2]);
const rp = v => Math.round(v * 100) / 100;

export class NetMatch extends MPMatch {
  constructor(game, cfg) {
    cfg.kind = 'net';
    super(game, cfg);
    this.net = game.net;
    this.myCid = game.net.cid;
    this.roster = cfg.roster || [];
    this.isHost = game.net.isHost;
    this.players = new Map();   // cid -> NetPlayer
    this.sendT = 0; this.dropT = 0; this.stResetT = 0;
    this.wpTeam = null;
    const me = this.roster.find(r => r.c === this.myCid) || {};
    this.nameOf = me.n || game.net.name || '玩家';
  }
  get isNet() { return true; }
  teamOf(cid) { const r = this.roster.find(x => x.c === cid); return r ? r.t : ''; }
  styleOf(cid) { const r = this.roster.find(x => x.c === cid); return r ? r.s : 'ally'; }
  who(p) {
    if (!p) return null;
    if (p.c === this.myCid) return this.game.player;
    return this.players.get(p.c) || { name: p.n || '?', team: p.t || 'B', pos: new THREE.Vector3() };
  }
  myMeta() { const pl = this.game.player; return { c: this.myCid, n: pl.name, t: pl.team }; }

  start() {
    const game = this.game, def = MAPS[this.cfg.map];
    const pteam = this.teamOf(this.myCid) || 'A';
    game.playerSleeve = def.styles[0] === 'snowA' ? 'fab_snowA' : 'fab_ally';
    const lo = this.buildLoadout(game.profile.classes[game.profile.selClass]);
    const sp = this.spawnPoint(pteam);
    const pl = game.player = new Player(game, { team: pteam, pos: sp.pos, yaw: sp.yaw, name: this.nameOf });
    pl.stats.name = this.nameOf;
    pl.equip(lo);
    game.entities.push(pl);
    this.streakDefs = game.profile.streaks.map(id => KILLSTREAKS.find(k => k.id === id)).sort((a, b) => a.kills - b.kills);
    this.streakState = this.streakDefs.map(d => ({ id: d.id, ready: false, used: false, cost: Math.max(2, d.kills - (pl.hasPerk('hardline') ? 1 : 0)) }));
    if (this.type === 'dom') this.flags = def ? this.initFlags() : null;
    const mname = { tdm: '团队死斗', dom: '占领', ffa: '自由混战' }[this.type];
    game.hud.reset();
    game.hud.announce(mname, `局域网 · ${def.name} · ${this.ffa ? '率先达到 ' + this.scoreLimit + ' 次击杀' : '目标分数 ' + this.scoreLimit}`, 4);
    game.audio.say(mname + '，行动开始');
    this.updateStreakHUD();
    // 向别人通报自己的出生点，远端立即渲染
    this.net.bc({ e: 'spawn', p: [+sp.pos.x.toFixed(2), +sp.pos.y.toFixed(2), +sp.pos.z.toFixed(2)], y: +sp.yaw.toFixed(3) });
    // 绑定消息
    this.unsub = [];
    for (const k of ['p', 'shot', 'nade', 'hit', 'kill', 'drop', 'spawn', 'uav', 'cluster', 'heli', 'sentry', 'wp', 'end', 'err', 'lobby', 'closed'])
      this.unsub.push(this.net.on(k, m => this.handle(k, m)));
  }
  initFlags() {
    // 与 MPMatch 一致：占用开始时由 update 计算
    const w = this.game.world;
    return w.flagPos.map((p, i) => ({ name: 'ABC'[i], pos: p.clone(), owner: null, prog: 0, capTeam: null, mesh: this.flagMesh(p) }));
  }

  dispose() {
    if (this.unsub) for (const u of this.unsub) u();
    this.unsub = null;
    super.dispose();
    this.net.setPlaying(false);
  }

  // ---------------- 网络事件调度 ----------------
  handle(kind, m) {
    const fn = this['on_' + kind];
    if (fn) fn.call(this, m);
  }
  on_lobby(m) {
    const game = this.game;
    const seen = this._seen || new Set();
    for (const p of m.players) {
      if (p.c !== this.myCid && !seen.has(p.c)) game.hud.popup(`${p.n} 加入了房间`, '#9cf');
    }
    // 移除已经离开房间的远端玩家
    for (const [cid, np] of this.players) {
      if (!m.players.find(p => p.c === cid)) {
        game.bots = game.bots.filter(b => b !== np);
        game.entities = game.entities.filter(e => e !== np);
        np.dispose();
        this.players.delete(cid);
        game.hud.popup(`${np.name} 已离开对局`, '#aaa');
      }
    }
    this._seen = new Set(m.players.map(p => p.c));
  }
  on_err(m) { if (this.game.hud) this.game.hud.popup('联机错误：' + m, '#f66'); }
  on_closed() { if (!this.over && this.game.hud) this.game.hud.announce('连接已断开', '检查房主的服务器是否在运行', 4); }

  on_spawn(m) {
    const cid = m.s;
    if (cid === this.myCid) return;
    let np = this.players.get(cid);
    if (!np) { np = this.ensureNP(cid); if (!np) return; }
    np.tPos.set(m.p[0], m.p[1], m.p[2]);
    np.pos.set(m.p[0], m.p[1], m.p[2]);
    np.tYaw = m.y || 0; np.tPitch = 0;
    np.hasState = true; np.alive = true; np.revive();
    np.model.root.position.copy(np.pos);
  }
  ensureNP(cid) {
    const game = this.game;
    const roster = this.roster.find(r => r.c === cid);
    if (!roster) return null;
    const np = new NetPlayer(game, {
      cid, name: roster.n || '玩家' + cid, team: roster.t || 'B', style: (roster.s || 'ally'),
      weaponId: 'm4', tag: this.teamOf(cid) === game.player.team && !this.ffa,
    });
    this.players.set(cid, np);
    game.addBot(np);
    return np;
  }
  on_p(m) {
    const cid = m.s;
    if (cid === this.myCid) return;
    let np = this.players.get(cid);
    if (!np) { np = this.ensureNP(cid); if (!np) return; }
    np.applyState(m.d);
  }
  on_shot(m) {
    const np = m.s === this.myCid ? this.game.player : this.players.get(m.s);
    if (!np) return;
    if (np !== this.game.player && np.model) {
      np.model.root.rotation.y = np.yaw;
      np.markShot(!!m.sup);
    }
    const p = m.s === this.myCid ? new THREE.Vector3() : (np.model && np.model.muzzle ? np.model.muzzle.getWorldPosition(new THREE.Vector3()) : np.pos.clone());
    const d = V3(m.d);
    this.game.audio.shot(m.sn || 'm4', p, !!m.sup);
    if (!m.sup) this.game.effects.flashLight(p, 0xffb060, 3, 0.05, 8);
    if (m.tr) this.game.effects.tracer(p.clone().addScaledVector(d, 0.5), p.clone().addScaledVector(d, m.tr), [1.4, 1.0, 0.55]);
  }
  on_nade(m) {
    const owner = this.who({ c: m.s });
    const proj = new Projectile(this.game, m.ty, V3(m.p), V3(m.v), owner, m.f, { netVis: true });
    this.game.projectiles.push(proj);
  }
  on_drop(m) {
    if (m.s === this.myCid) return;
    this.game.spawnPickup(m.w, m.att || {}, V3(m.p), m.mag, m.res);
  }
  on_hit(m) {
    const game = this.game, pl = game.player;
    if (!pl || !pl.alive || m.s === this.myCid) return;
    const atk = this.players.get(m.s) || { name: '?', team: 'B', pos: new THREE.Vector3() };
    const dir = new THREE.Vector3(m.from[0] - pl.pos.x, m.from[1] - (pl.pos.y + 1.2), m.from[2] - pl.pos.z).normalize();
    pl.takeDamage(m.dmg, {
      attacker: atk, dir, weapon: m.w || '', head: m.h, explosive: m.exp, burn: m.burn, melee: m.melee,
      point: new THREE.Vector3(m.from[0], m.from[1], m.from[2]),
    });
  }
  on_kill(m) {
    if (this.over) return;
    const game = this.game, pl = game.player;
    const vSelf = m.v.c === this.myCid;
    const self = m.k && !vSelf && m.k.c === this.myCid;
    const suicide = !m.k || m.k.c === m.v.c;
    const K = suicide ? null : this.who(m.k);
    const V = this.who(m.v);
    game.hud.killfeed(K, V, m.w, m.h);
    if (!this.firstBlood && K) this.firstBlood = true;
    if (K && K !== V) {
      const kTeam = K.team;
      if (!this.ffa && this.type === 'tdm') this.scores[kTeam === pl.team ? 'A' : 'B'] = (this.scores[kTeam === pl.team ? 'A' : 'B'] || 0) + 1;
      const knp = this.players.get(m.k.c);
      if (knp) { knp.kills++; knp.score += 100; knp.streak = (knp.streak || 0) + 1; }
      if (self) {
        const victimEnt = this.players.get(m.v.c) || Object.assign(Object.create(null), { pos: pl.pos.clone() });
        this.playerKill(victimEnt, m.w, m.h, m.i || {});
        this.chargeStreak(1);
        if (this.ffa && pl.stats.kills >= this.scoreLimit) this.end(pl);
      }
    }
    const vnp = this.players.get(m.v.c);
    if (vnp) vnp.die();
  }
  // 连杀奖励广播
  on_uav(m) { this.uav[m.t] = m.d || 30; if (m.t === this.game.player.team) this.game.hud.announce('UAV 已上线', '', 2); else this.game.hud.announce('敌方UAV已上线', '保持移动或使用幽灵Perk', 3); this.game.audio.say(m.t === this.game.player.team ? '友方无人机已上线' : '敌方无人机已上线'); }
  on_cluster(m) { this.clusterVisual(V3(m.p), m.a, m.s); }
  on_heli(m) { const team = this.teamOf(m.s) || 'B'; this.spawnHeliVis(team, m.s); }
  on_sentry(m) { this.spawnSentryVis(V3(m.p), m.y, m.s); }
  on_wp(m) {
    const game = this.game, pl = game.player;
    game.hud.announce('白磷弹投放', '', 3); game.audio.say('白磷弹来袭');
    this.wpT = m.d || 10; this.wpTeam = m.t;   // 远端只做表现，伤害由发起端路由
  }
  on_end(m) {
    // m.w: 'draw' | { t: 'A'|'B' } | { k: cid }   —— t 为绝对战队字母（与 pl.team 直接比较）
    if (this.over) return;
    let winner;
    if (m.w === 'draw') winner = 'draw';
    else if (m.w && m.w.t) winner = m.w.t;
    else if (m.w && m.w.k !== undefined) winner = this.who({ c: m.w.k });
    else return;
    this.setupRestart();
    super.end(winner);
  }

  // 结束后「再来一局」：房主按当前房间名单重新编排并广播新 cfg
  setupRestart() {
    this.again = () => {
      const g = this.game;
      if (g.net.isHost && g.net.room) {
        const cfg = buildNetCfg(g.net.room, { mode: this.cfg.mode, map: this.cfg.map, scoreLimit: this.cfg.scoreLimit, timeLimit: this.cfg.timeLimit });
        g.net.start(cfg);
        g.startGame('net', cfg);
        g.net.setPlaying(true);
      }
    };
    this.noAgain = !this.game.net.isHost;
  }

  // ---------------- 发送 ----------------
  netShot(origin, dir, tr, st) {
    this.net.bc({
      e: 'shot',
      // 远端直接用自己的复制实体模型枪口位置渲染
      d: [+dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3)],
      tr: tr || 60,
      sup: st.suppressed ? 1 : 0, sn: st.sound || 'm4',
    });
  }
  netNade(type, pos, vel, fuse) {
    this.net.bc({ e: 'nade', ty: type, p: [rp(pos.x), rp(pos.y), rp(pos.z)], v: [+vel.x.toFixed(2), +vel.y.toFixed(2), +vel.z.toFixed(2)], f: +fuse.toFixed(2) });
  }
  netDrop(weaponId, att, pos, mag, reserve) {
    this.net.bc({ e: 'drop', w: weaponId, att: att || {}, p: [rp(pos.x), rp(pos.y), rp(pos.z)], mag, res: reserve });
  }
  sendState() {
    const pl = this.game.player;
    if (!pl) return;
    const w = pl.ws && pl.ws.w;
    const d = [
      rp(pl.pos.x), rp(pl.pos.y), rp(pl.pos.z),
      +pl.yaw.toFixed(3), +pl.pitch.toFixed(3), +pl.crouchT.toFixed(2),
      Math.round(pl.hp), pl.alive ? 1 : 0,
      pl.stats.kills, pl.stats.deaths, pl.stats.score,
      w ? w.id : '',
    ];
    this.net.bc({ e: 'p', d });
  }

  // ---------------- 连杀奖励（广播版） ----------------
  useStreak(i) {
    const s = this.streakState[i];
    if (!s || !s.ready) return;
    const game = this.game, pl = game.player;
    const team = pl.team;
    if (s.id === 'uav') { this.uav[team] = 30; this.net.bc({ e: 'uav', t: team, d: 30 }); game.hud.announce('UAV 已上线', '', 2); game.audio.say('无人机已上线'); }
    else if (s.id === 'cluster') { this.targeting = { s, type: 'cluster' }; game.hud.announce('选择空袭目标', '左键确认 · 右键取消', 2.5); return; }
    else if (s.id === 'sentry') {
      const f = pl.forward(new THREE.Vector3()); f.y = 0; f.normalize();
      const p = pl.pos.clone().addScaledVector(f, 2);
      if (game.world.lineBlocked(pl.pos.clone().setY(pl.pos.y + 0.5), p.clone().setY(p.y + 0.5))) { game.hud.popup('无法在此部署', '#f66'); return; }
      this.active.push(new Sentry(game, p, pl));
      const y = p.clone(); y.y = game.world.groundHeight(p.x, p.z, p.y + 0.5, 0.3);
      this.net.bc({ e: 'sentry', p: [rp(y.x), rp(y.y), rp(y.z)] });
      game.audio.say('哨戒机枪已部署');
    } else if (s.id === 'heli') {
      this.spawnHeli(team, pl);
      this.net.bc({ e: 'heli' });
      game.audio.say('武装直升机已就位');
    } else if (s.id === 'wp') {
      // 本地（发起端）：效果 + 伤害经由远端玩家的本地复制实体路由结算
      game.hud.announce('白磷弹投放', '', 3); game.audio.say('白磷弹来袭');
      this.wpT = 10; this.wpTeam = team; this.wpMine = true;
      for (const e of this.enemiesOf(team)) e.takeDamage(55, { attacker: pl, weapon: '白磷弹', explosive: true, dir: new THREE.Vector3(0, -1, 0) });
      for (let i = 0; i < 12; i++) {
        const p = game.world.randomWalkable();
        setTimeout(() => { if (game.world) { game.effects.explosion(p, 0.8); game.audio.explosion(p, 0.5); game.effects.addFireSource(p.clone().setY(0.1), 1.5, 8); } }, i * 250);
      }
      this.net.bc({ e: 'wp', t: team, d: 10 });
    }
    s.ready = false; s.used = true;
    this.updateStreakHUD();
  }
  spawnHeliVis(team, fromCid) {
    const owner = { team, isPlayer: false, name: '武装直升机', alive: true };
    this.active.push(new Heli(this.game, team, owner, { noFire: true }));
  }
  spawnSentryVis(pos, yaw, fromCid) {
    const owner = { team: this.teamOf(fromCid) || 'B', isPlayer: false, alive: true, name: '哨戒机枪' };
    const se = new Sentry(this.game, pos, owner, { noFire: true });
    se.yaw = yaw || owner.yaw;
    this.active.push(se);
  }
  // 空袭表现（远端）：全套特效但不结算伤害
  clusterVisual(pos, ang, fromCid) {
    const game = this.game;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    game.audio.whoosh(pos);
    setTimeout(() => {
      if (!game.world) return;
      for (let i = 0; i < 9; i++) {
        const p = pos.clone().addScaledVector(dir, (i - 4) * 3.2).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
        const start = p.clone().addScaledVector(dir, -25); start.y = 45;
        const v = p.clone().sub(start); const T = 1.6;
        const vel = new THREE.Vector3(v.x / T, (v.y + 0.5 * 12 * T * T) / T, v.z / T);
        setTimeout(() => {
          if (!game.world) return;
          const b = new Projectile(game, 'bomb', start, vel, { team: this.teamOf(fromCid) || 'B', isPlayer: false, alive: true }, 2, { netVis: true });
          b.netVis = true;
          game.projectiles.push(b);
        }, i * 110);
      }
    }, 1400);
  }
  updateTargeting(inp) {
    const game = this.game, t = this.targeting;
    if (!t) { if (this.tgtMesh) this.tgtMesh.visible = false; return; }
    if (!this.tgtMesh) {
      this.tgtMesh = new THREE.Mesh(new THREE.RingGeometry(3, 3.5, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.2), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
      this.tgtMesh.rotation.x = -Math.PI / 2; game.world.root.add(this.tgtMesh);
    }
    const cam = game.camera, d = cam.getWorldDirection(new THREE.Vector3());
    const hit = game.world.raycast(cam.position, d, 200);
    this.tgtMesh.visible = !!hit;
    if (hit) this.tgtMesh.position.copy(hit.point).setY(hit.point.y + 0.1);
    game.hud.prompt('<b>左键</b>确认空袭目标 · <b>右键</b>取消');
    if (inp.firePressed && hit) {
      this.clusterStrike(hit.point.clone(), game.player, game.player.yaw + Math.PI / 2);
      const ang = game.player.yaw + Math.PI / 2;
      this.net.bc({ e: 'cluster', p: [rp(hit.point.x), rp(hit.point.y), rp(hit.point.z)], a: +ang.toFixed(3) });
      t.s.ready = false; t.s.used = true; this.targeting = null; game.hud.prompt(null);
      game.audio.say('集束空袭已确认'); this.updateStreakHUD();
      game.player.ws.cool = 0.3;
    } else if (inp.adsPressed) { this.targeting = null; game.hud.prompt(null); }
  }

  // ---------------- 击杀（广播版） ----------------
  onKill(killer, victim, weapon, head, info) {
    const game = this.game, pl = game.player;
    if (this.over) return;
    if (!victim.isPlayer) { super.onKill(killer, victim, weapon, head, info); return; }
    // 本地玩家死亡：本地 killfeed（自己收不到自己的广播）+ 广播击杀事件 + 掉落武器
    game.hud.killfeed(killer, victim, weapon, !!head);
    const kMeta = killer && killer !== victim ? (killer.isPlayer ? this.myMeta() : (killer.cid != null ? { c: killer.cid, n: killer.name, t: killer.team } : null)) : null;
    this.net.bc({ e: 'kill', k: killer && killer !== victim ? kMeta : null, v: this.myMeta(), w: weapon, h: head, i: { melee: !!(info && info.melee), explosive: !!(info && info.explosive) } });
    // 自己收不到自己的广播：补上 on_kill 对其他客户端做的簿记（击杀者远端统计 + 团队比分）
    const K = kMeta ? this.who(kMeta) : null;
    if (K && K !== pl) {
      if (!this.ffa && this.type === 'tdm') this.scores[K.team === pl.team ? 'A' : 'B'] = (this.scores[K.team === pl.team ? 'A' : 'B'] || 0) + 1;
      const knp = kMeta && this.players.get(kMeta.c);
      if (knp) { knp.kills++; knp.score += 100; knp.streak = (knp.streak || 0) + 1; }
    }
    const cur = pl.ws && pl.ws.slots[pl.ws.cur];
    if (cur && cur.id) {
      this.game.spawnPickup(cur.id, cur.att, pl.pos, cur.mag, cur.reserve);
      this.netDrop(cur.id, cur.att, pl.pos, cur.mag, cur.reserve);
    }
    // 死亡画面
    game.dead = true; game.deathKiller = killer;
    this.respawns.push({ e: victim, t: 4.5 });
    const el = document.getElementById('deathScreen');
    el.classList.remove('hidden');
    document.getElementById('killerInfo').innerHTML = killer && killer !== victim ? `被 <b>${killer.name}</b> 使用 ${weapon || ''} ${head ? '爆头' : ''}击杀` : '你自杀了';
    pl.stats.streak = 0;
    this.streakKills = 0;
    this.updateStreakHUD();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------------- 主循环（广播版） ----------------
  update(dt, inp) {
    if (this.over) { return; }
    const game = this.game, pl = game.player;
    this.timeLeft -= dt;
    this.sendT -= dt; if (this.sendT <= 0) { this.sendT = 0.05; this.sendState(); }
    // 复活
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      r.t -= dt;
      if (r.e.isPlayer) {
        document.getElementById('respawnText').textContent = r.t > 0 ? `${Math.ceil(r.t)} 秒后重新部署…` : '按 [空格] 重新部署';
        if (r.t <= 0 && (game.input.keys.Space || r.t < -4)) {
          const sp = this.spawnPoint(pl.team);
          if (this.nextLoadout) { pl.equip(this.nextLoadout); this.nextLoadout = null; this.streakState.forEach(s => s.cost = Math.max(2, KILLSTREAKS.find(k => k.id === s.id).kills - (pl.hasPerk('hardline') ? 1 : 0))); }
          pl.respawn(sp.pos, sp.yaw);
          game.dead = false;
          document.getElementById('deathScreen').classList.add('hidden');
          game.menu.hideClassSelect();
          this.respawns.splice(i, 1);
          game.lock();
          this.net.bc({ e: 'spawn', p: [+sp.pos.x.toFixed(2), +sp.pos.y.toFixed(2), +sp.pos.z.toFixed(2)], y: +sp.yaw.toFixed(3) });
        }
      }
    }
    // 占领（本地模拟；远端位置已复制，各端结果一致）
    if (this.flags) {
      for (const f of this.flags) {
        const cnt = {};
        for (const e of game.entities) {
          if (!e.alive || !e.pos || e.targetable === false || e.isTurret || (e instanceof NetPlayer && !e.hasState)) continue;
          if (Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z) < 4.5 && Math.abs(e.pos.y - f.pos.y) < 3) cnt[e.team] = (cnt[e.team] || 0) + 1;
        }
        const teams = Object.keys(cnt);
        if (teams.length === 1 && teams[0] !== f.owner) {
          const t = teams[0];
          if (f.capTeam !== t) { f.capTeam = t; f.prog = 0; }
          f.prog += dt * (0.18 + 0.07 * Math.min(3, cnt[t]));
          if (pl.alive && t === pl.team && Math.hypot(pl.pos.x - f.pos.x, pl.pos.z - f.pos.z) < 4.5) game.hud.progress(f.prog);
          if (f.prog >= 1) {
            f.owner = t; f.prog = 0; f.capTeam = null;
            const mine = t === pl.team;
            game.hud.announce(`${mine ? '已占领' : '失去'} ${f.name} 点`, '', 2);
            game.audio.say(mine ? `已占领${f.name}点` : `${f.name}点已失守`);
            if (mine && pl.alive && Math.hypot(pl.pos.x - f.pos.x, pl.pos.z - f.pos.z) < 4.5) { pl.stats.score += 200; pl.stats.captures++; game.hud.popup('+200 占领', '', true); }
            for (const b of game.bots) if (b.team === t && b.alive && Math.hypot(b.pos.x - f.pos.x, b.pos.z - f.pos.z) < 4.5) { b.score += 200; b.captures++; }
            game.hud.progress(null);
          }
        } else if (teams.length !== 1) {
          if (f.capTeam && teams.length === 0) f.prog = Math.max(0, f.prog - dt * 0.1);
          if (pl.alive && Math.hypot(pl.pos.x - f.pos.x, pl.pos.z - f.pos.z) < 4.5 && teams.length > 1) game.hud.progress(f.prog);
        } else if (f.owner === teams[0] && pl.alive && Math.hypot(pl.pos.x - f.pos.x, pl.pos.z - f.pos.z) < 4.5) game.hud.progress(null);
        if (pl.alive && Math.hypot(pl.pos.x - f.pos.x, pl.pos.z - f.pos.z) >= 4.5 && this.nearFlag === f) game.hud.progress(null);
        if (pl.alive && Math.hypot(pl.pos.x - f.pos.x, pl.pos.z - f.pos.z) < 4.5) this.nearFlag = f; else if (this.nearFlag === f) this.nearFlag = null;
        const col = f.owner === pl.team ? 0x4fb4ff : f.owner ? 0xff4a3d : 0xffffff;
        f.mesh.userData.ring.material.color.setHex(col);
        f.mesh.userData.cloth.material.color.setHex(col); f.mesh.userData.cloth.material.emissive.setHex(col);
        f.mesh.userData.cloth.rotation.y = Math.sin(game.time * 2 + f.pos.x) * 0.3;
        if (f.owner) this.scores[f.owner === pl.team ? 'A' : 'B'] += dt * 0.6;
      }
    }
    // UAV
    for (const t in this.uav) {
      this.uav[t] -= dt;
      if (this.uav[t] > 0 && t !== pl.team) {
        this.uavPing = (this.uavPing || 0) - dt;
        if (this.uavPing <= 0) this.uavPing = 2.5;
      }
    }
    if (this.wpT > 0) {
      this.wpT -= dt; game.grade.uniforms.wp.value = Math.min(1, this.wpT / 3) * 0.6;
      // 白磷伤害仅由发起端的本地模拟结算（远端玩家走复制实体的 hit 路由）
    } else game.grade.uniforms.wp.value = 0;
    // 连杀奖励
    for (const a of this.active) a.update(dt);
    this.active = this.active.filter(a => a.alive);
    if (pl.alive && inp.streak >= 0) this.useStreak(inp.streak);
    this.updateTargeting(inp);
    // HUD
    this.hudScore();
    const markers = [];
    if (this.flags) for (const f of this.flags) markers.push({ id: 'f' + f.name, pos: f.pos.clone().setY(f.mesh.position.y + 3.6), label: f.name, cls: 'flag ' + (f.owner === pl.team ? 'ally' : f.owner ? 'enemy' : 'neutral') });
    game.hud.setMarkers(markers);
    // 结束
    if (!this.ffa) {
      if (this.scores.A >= this.scoreLimit) this.end('A');
      else if (this.scores.B >= this.scoreLimit) this.end('B');
    }
    if (this.timeLeft <= 0) {
      if (this.ffa) { const all = this.ranking(); this.end(all[0].e); }
      else this.end(this.scores.A > this.scores.B ? 'A' : this.scores.B > this.scores.A ? 'B' : 'draw');
    }
  }

  // 「相对本机」的 A/B 记分键 → 绝对战队的字母（实体与 'draw' 原样返回）
  absOf(winner) {
    if (winner !== 'A' && winner !== 'B') return winner;
    return winner === 'A' ? this.game.player.team : (this.game.player.team === 'A' ? 'B' : 'A');
  }

  end(winner) {
    if (this.over) return;
    // 广播一次终局信号（其余端几乎同时判出，重复广播被 over 守卫吞掉）
    // A/B 都是「相对本机」的记分键，转成绝对战队字母后再广播，避免各端胜负解读相反
    let bw;
    if (winner === 'draw') bw = 'draw';
    else if (winner === 'A' || winner === 'B') bw = { t: this.absOf(winner) };
    else bw = { k: winner && winner.isPlayer ? this.myCid : (winner ? winner.cid : null) };
    this.net.bc({ e: 'end', w: bw });
    this.setupRestart();
    super.end(this.absOf(winner));
  }
}

// 房间 → 对局配置（menu 与 NetMatch 复用）
export function buildNetCfg(room, o) {
  const def = MAPS[o.map];
  const styles = (def && def.styles) || ['ally', 'enemy'];
  const roster = (room.players || []).map((p, i) => ({
    c: p.c, n: p.n || '玩家' + p.c,
    t: o.mode === 'ffa' ? 'P' + p.c : (i % 2 ? 'B' : 'A'),
    s: styles[i % styles.length],
  }));
  return { kind: 'net', mode: o.mode, map: o.map, scoreLimit: o.scoreLimit, timeLimit: o.timeLimit, roster };
}
