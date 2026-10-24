// 训练场：没有敌人，只有固定靶和移动靶
import * as THREE from 'three';
import { Player } from './player.js';
import { mat } from './materials.js';
import { raySphere, damp, fmtTime } from './util.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const PLATE_R = 0.55;          // 靶面半径
const PLATE_Y = 1.35;          // 靶心离地高度
const HINGE_Y = 0.85;          // 翻转铰链高度
const RING_R = [PLATE_R * 0.25, PLATE_R * 0.72];   // 靶心 / 内环半径（对应靶面贴图的红圈）

// 靶面贴图：红白同心圆 + 十字线
let faceTexture = null;
function targetTexture() {
  if (faceTexture) return faceTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const circle = (r, color) => { g.fillStyle = color; g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.fill(); };
  circle(128, '#2a2e31');
  circle(120, '#ece7da');
  circle(92, '#b0352c');
  circle(62, '#ece7da');
  circle(32, '#b0352c');
  g.strokeStyle = 'rgba(24,26,28,.7)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(128, 8); g.lineTo(128, 248); g.moveTo(8, 128); g.lineTo(248, 128); g.stroke();
  faceTexture = new THREE.CanvasTexture(c);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  return faceTexture;
}

// 单个靶子：作为实体加入 game.entities，因此弹道/近战/爆炸都能命中
class RangeTarget {
  constructor(range, cfg) {
    this.range = range;
    this.game = range.game;
    this.isTarget = true;
    this.noBlood = true;              // 命中时溅火花而不是血
    this.moving = !!cfg.to;
    this.name = this.moving ? '移动靶' : '固定靶';
    this.team = 'R';                  // 与玩家队伍不同，弹道检测才会命中
    this.alive = true;
    // 靶子有耐久：单发命中只会让它后仰，累计伤害达到上限才倒下
    this.maxHp = cfg.hp || 160;
    this.hp = this.maxHp;
    this.down = false; this.downT = 0; this.flip = 0; this.kick = 0;
    this.a = (cfg.from || cfg.pos).clone();
    this.b = cfg.to ? cfg.to.clone() : null;
    this.baseY = this.moving ? 0.16 : 0;
    this.pos = this.a.clone();
    this.len = this.b ? this.a.distanceTo(this.b) : 0;
    this.t = cfg.phase ?? Math.random();
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.speed = (cfg.speed || 3) * range.speedMul;
    this.center = new THREE.Vector3();
    this.mesh = this.build();
    this.sync();
    this.game.scene.add(this.mesh);
  }

  build() {
    const root = new THREE.Group();
    // 底座 + 立柱
    if (!this.moving) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.5), mat('darkMetal'));
      base.position.y = 0.04; root.add(base);
    }
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, HINGE_Y, 0.12), mat('darkMetal'));
    post.position.y = HINGE_Y / 2; root.add(post);
    if (this.moving) {
      const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), mat('gunGreen'));
      trolley.position.y = -0.08; root.add(trolley);
    }
    // 铰链：被命中后绕此向前翻倒
    const pivot = new THREE.Group();
    pivot.position.y = HINGE_Y;
    root.add(pivot);
    const plate = new THREE.Mesh(new THREE.CircleGeometry(PLATE_R, 32), this.range.plateMat);
    plate.position.y = PLATE_Y - HINGE_Y;
    plate.castShadow = true;
    pivot.add(plate);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R, 0.04, 24).rotateX(Math.PI / 2), mat('gunMetal'));
    back.position.set(0, PLATE_Y - HINGE_Y, -0.03);
    pivot.add(back);
    this.pivot = pivot;
    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return root;
  }

  sync() {
    this.mesh.position.set(this.pos.x, this.baseY, this.pos.z);
    this.pivot.rotation.x = this.flip * (Math.PI * 0.5 - 0.06) - this.kick;
    this.center.set(this.pos.x, this.baseY + PLATE_Y, this.pos.z);
  }

  update(dt) {
    if (this.moving && this.len > 0.01) {
      this.t += dt * this.speed / this.len * this.dir;
      if (this.t >= 1) { this.t = 1; this.dir = -1; }
      else if (this.t <= 0) { this.t = 0; this.dir = 1; }
      this.pos.lerpVectors(this.a, this.b, this.t);
    }
    if (this.down) {
      this.downT -= dt;
      if (this.downT <= 0) this.down = false;
    }
    this.flip = damp(this.flip, this.down ? 1 : 0, 14, dt);
    this.kick = damp(this.kick, 0, 16, dt);
    this.sync();
  }

  chestPos(out) { return out.copy(this.center); }

  hitTest(o, d, maxT) {
    if (!this.alive || this.down || this.flip > 0.15) return null;
    const c = this.center;
    const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, c.x, c.y, c.z, PLATE_R);
    if (t < 0 || t >= maxT) return null;
    // 命中靶心按“爆头”结算，伤害数字与伤害倍率都会更高
    const hx = o.x + d.x * t - c.x, hy = o.y + d.y * t - c.y;
    return { t, part: Math.hypot(hx, hy) <= RING_R[0] ? 'head' : 'body' };
  }

  takeDamage(dmg, info) {
    if (!this.alive || this.down || this.flip > 0.2) return false;
    // 命中环数：按命中点相对靶心的横向/纵向偏移计算
    let ring = 2;
    if (info && info.point && !info.explosive) {
      const dx = info.point.x - this.center.x, dy = info.point.y - this.center.y;
      const r = Math.hypot(dx, dy);
      if (r <= RING_R[0]) ring = 0;
      else if (r <= RING_R[1]) ring = 1;
    }
    this.hp -= dmg;
    this.kick = Math.min(0.2, this.kick + 0.06);
    const knocked = this.hp <= 0;
    if (this.game.damageNumber) this.game.damageNumber(this, dmg, info || {}, knocked);
    if (knocked) {
      // 打空耐久才翻倒，立起后耐久回满
      this.hp = this.maxHp;
      this.down = true;
      this.downT = this.moving ? 1.3 : 1.8;
    }
    this.range.onHit(this, ring, info, knocked);
    return knocked;
  }

  dispose() { this.game.scene.remove(this.mesh); }
}

export class TrainingRange {
  constructor(game, cfg = {}) {
    this.game = game; this.cfg = cfg;
    this.kind = 'training';
    this.canChangeClass = true;
    this.nvgAvailable = false;
    this.interactPrompt = false;
    this.score = 0; this.hits = 0; this.hitShots = 0; this.bullseyes = 0; this.downs = 0;
    this.lastHitTime = -1;
    this.elapsed = 0; this.respawnT = 0; this.over = false;
    this.speedMul = cfg.speed || 1;
    this.targets = [];
    this.best = +(localStorage.getItem('mf_range_best') || 0);
    this.plateMat = new THREE.MeshStandardMaterial({ map: targetTexture(), roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  }

  start() {
    const game = this.game, w = game.world;
    game.playerSleeve = 'fab_ally';
    this.spawn = ((w.spawns.A && w.spawns.A[0]) || V(0, 22)).clone();
    const pl = game.player = new Player(game, { team: 'A', pos: this.spawn.clone(), yaw: 0, name: '你' });
    pl.equip(this.loadout(game.profile.classes[game.profile.selClass || 0]));
    game.entities.push(pl);
    this.crate = (w.ammoCrate || V(3, 22)).clone();
    // 训练场里没有任何敌人，只有靶子
    const defs = w.rangeTargets || { static: [], moving: [] };
    for (const pos of defs.static) this.addTarget({ pos });
    for (const m of defs.moving) this.addTarget(m);
    // 死亡界面可能被战役/训练隐藏过按钮，这里恢复默认
    const btns = document.querySelector('#deathScreen .death-btns');
    if (btns) btns.style.display = '';
    game.hud.reset();
    game.hud.announce('射击训练场', '固定靶 · 移动靶 · 无敌人', 4);
    game.audio.say('射击训练，自由开火');
    this.updateHud();
  }

  addTarget(cfg) {
    const t = new RangeTarget(this, cfg);
    this.targets.push(t);
    this.game.entities.push(t);
    return t;
  }

  loadout(cls) {
    return {
      primary: { id: cls.primary, att: cls.patt || {}, camo: cls.pcamo },
      secondary: { id: cls.secondary, att: cls.satt || {}, camo: cls.scamo },
      lethal: cls.lethal, tactical: cls.tactical, perks: cls.perks,
      gear: { helmet: cls.helmet, vest: cls.vest },
    };
  }

  applyClass(idx) {
    const P = this.game.profile;
    P.selClass = idx; this.game.saveProfile();
    if (this.game.player) this.game.player.equip(this.loadout(P.classes[idx]));
  }

  // 命中结算：环数 0=靶心 1=内环 2=靶面；knocked 表示这一发打空了耐久、靶子倒下
  onHit(target, ring, info, knocked = false) {
    const pts = [150, 100, 50][ring] ?? 50;
    this.score += pts; this.hits++;
    // 同一次射击（霰弹的多发弹丸）命中多个靶时，只算一次有效射击
    if (this.lastHitTime !== this.game.time) { this.lastHitTime = this.game.time; this.hitShots++; }
    if (ring === 0) this.bullseyes++;
    const hud = this.game.hud;
    if (knocked) {
      this.downs++; this.score += 50;
      hud.popup('靶子击倒 +50', '#8fe06a', true);
    } else {
      hud.popup(`+${pts}${ring === 0 ? ' 靶心' : ''}`, ring === 0 ? '#ffd24a' : '#fff', ring === 0);
    }
    this.game.audio.click(ring === 0 ? 2600 : 1750, 0.06, 0.45, target.center);
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('mf_range_best', String(this.best));
    }
  }

  update(dt, inp) {
    const game = this.game, pl = game.player;
    if (this.over) return;
    this.elapsed += dt;
    for (const t of this.targets) t.update(dt);

    // 弹药箱：靠近按 F 补满弹药与装备
    this.interactPrompt = false;
    if (pl && pl.alive) {
      const d = Math.hypot(pl.pos.x - this.crate.x, pl.pos.z - this.crate.z);
      if (d < 2.4) {
        this.interactPrompt = true;
        game.hud.prompt('<b>F</b> 补充弹药与装备');
        if (inp.interactPressed) {
          pl.ws.fullAmmo();
          for (const s of pl.ws.slots) s.reserve = s.stats.reserve * 2;
          if (pl.lethal) pl.lethal.count = pl.lethal.max;
          if (pl.tactical) pl.tactical.count = pl.tactical.max;
          game.hud.popup('弹药与装备已补充', '#9cf');
          game.audio.reload('in');
        }
      }
    }

    this.updateHud();

    // 训练中只会因自己扔的手雷等自伤阵亡
    if (game.dead) {
      this.respawnT -= dt;
      document.getElementById('respawnText').textContent = this.respawnT > 0 ? '正在重新部署…' : '按 [空格] 重新部署';
      if (this.respawnT <= 0 && (game.input.keys.Space || this.respawnT < -4)) this.respawn();
    }
  }

  updateHud() {
    const pl = this.game.player;
    const shots = pl ? pl.stats.shots : 0;
    const acc = shots ? Math.min(100, Math.round(this.hitShots / shots * 100)) : 0;
    this.game.hud.scorebar(`<div class="sb-time">${fmtTime(this.elapsed)}　得分 <b>${this.score}</b>　精度 <b>${acc}%</b>　靶心 <b>${this.bullseyes}</b></div>`);
    this.game.hud.objective('射击训练场', `命中 ${this.hitShots} / ${shots} 发 · 击倒 ${this.downs} 个靶子`, `弹药箱：靠近后按 F 补给 · 最高分 ${this.best}`);
  }

  onKill(killer, victim) {
    if (!victim || !victim.isPlayer) return;
    const game = this.game;
    game.dead = true; game.deathKiller = killer;
    this.respawnT = 3;
    document.getElementById('deathScreen').classList.remove('hidden');
    document.getElementById('killerInfo').innerHTML = '你在训练中阵亡了';
    if (document.pointerLockElement) document.exitPointerLock();
  }

  respawn() {
    const game = this.game, pl = game.player;
    pl.respawn(this.spawn, 0);
    game.dead = false;
    this.respawnT = 0;
    document.getElementById('deathScreen').classList.add('hidden');
    game.lock();
  }

  scoreboardHTML() {
    const pl = this.game.player;
    const shots = pl ? pl.stats.shots : 0;
    const acc = shots ? Math.min(100, Math.round(this.hitShots / shots * 100)) : 0;
    const rows = [
      ['得分', this.score], ['命中 / 射击', `${this.hitShots} / ${shots}`], ['精度', acc + '%'],
      ['靶心', this.bullseyes], ['击倒靶子', this.downs], ['用时', fmtTime(this.elapsed)], ['最高分', this.best],
    ];
    return `<table class="sbt A"><tr><th>射击训练场</th><th>数值</th></tr>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  }

  minimapMarkers() {
    return this.targets.map(t => ({ x: t.pos.x, z: t.pos.z, color: t.moving ? '#ffd24a' : '#8fe06a' }));
  }

  dispose() {
    for (const t of this.targets) {
      t.dispose();
      this.game.entities = this.game.entities.filter(e => e !== t);
    }
    this.targets = [];
    this.plateMat.dispose();
    const hud = this.game.hud;
    if (hud) { hud.scorebar(''); hud.objective('', ''); hud.prompt(null); }
  }
}
