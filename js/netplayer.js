// 远端玩家的本地实体：复制士兵模型 + 状态插值 + 命中上报（伤害由受害者本地结算）
// 与 Bot / Player 共享 game.entities 接口：chestPos/eyePos/hitTest/pos/team/name/alive
import * as THREE from 'three';
import { createSoldierModel, animateSoldier, makeNameTag, applyFlashTex } from './soldier.js';
import { buildGun } from './gunmodel.js';
import { damp, raySphere, rayAABB } from './util.js';
import { computeStats } from './data.js';

const _a = new THREE.Vector3();

export class NetPlayer {
  constructor(game, o) {
    this.game = game;
    this.id = o.cid;                        // 不与 Bot.id 混用
    this.cid = o.cid;
    this.name = o.name || '玩家';
    this.team = o.team;
    this.weaponId = o.weaponId || 'm4';
    this.maxHp = 100; this.hp = 100; this.alive = true;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.kills = 0; this.deaths = 0; this.score = 0; this.streak = 0; this.captures = 0;
    this.revealT = 0; this.perks = new Set(); this.stats = computeStats(this.weaponId, {});
    this.model = createSoldierModel(o.style || 'ally', this.weaponId, {}, 'none');
    applyFlashTex(this.model);
    this.model.root.visible = false;
    game.scene.add(this.model.root);
    if (o.tag) { this.tag = makeNameTag(this.name, '#6cf'); this.model.root.add(this.tag); }
    this.anim = { speed: 0, phase: Math.random() * 6, crouch: 0, pitch: 0, dead: false, deadT: 0, fallDir: 1, fallRoll: 0, recoil: 0 };
    this.startT = 0;
    this.tPos = new THREE.Vector3(); this.tYaw = 0; this.tPitch = 0; this.tCrouch = 0;
    this.hasState = false;
    this.flashT = 0;
    this.radius = 0.35;
  }
  // 状态包: [x,y,z, yaw,pitch, crouch(0..1), hp, alive01, kills, deaths, score, weaponId]
  applyState(d) {
    this.tPos.set(d[0], d[1], d[2]);
    this.tYaw = d[3]; this.tPitch = d[4]; this.tCrouch = d[5];
    this.hp = d[6]; const alive = !!d[7];
    this.kills = d[8]; this.deaths = d[9]; this.score = d[10];
    if (this.weaponId !== d[11] && d[11]) this.setWeapon(d[11]);
    if (alive) { if (!this.alive) this.revive(); }
    else if (this.alive) this.die();
    this.hasState = true;
    this.tposT = this.game.time;
  }
  setWeapon(id) {
    this.weaponId = id; this.stats = computeStats(id, {});
    if (this.gunGroup) this.model.torso.remove(this.gunGroup);
    const info = buildGun(id, {}, 'none', { low: true, merge: true });
    info.group.position.set(0.08, 0.4, -0.3);
    this.model.torso.add(info.group);
    this.gunGroup = info.group;
    this.model.muzzle = info.muzzle;
  }
  die() {
    this.alive = false; this.hp = 0;
    if (this.anim.dead) return;
    this.anim.dead = true; this.anim.deadT = 0;
    this.anim.fallDir = 1; this.anim.fallRoll = (Math.random() - 0.5) * 0.6;
    this.model.flash.visible = false;
    if (this.tag) this.tag.visible = false;
  }
  revive() {
    this.alive = true; this.anim.dead = false; this.anim.deadT = 0;
    this.model.root.rotation.set(0, this.yaw, 0);
    if (this.tag) this.tag.visible = true;
    this.model.root.visible = this.hasState;
  }
  markShot(suppressed) { this.flashT = suppressed ? 0 : 0.05; if (!suppressed) this.revealT = 1.5; }

  eyePos(out) { return out.set(this.pos.x, this.pos.y + 1.6 - this.anim.crouch * 0.5, this.pos.z); }
  chestPos(out) { return out.set(this.pos.x, this.pos.y + 1.2 - this.anim.crouch * 0.4, this.pos.z); }
  forward(out) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  hitTest(o, d, maxT) {
    if (!this.alive || !this.hasState) return null;
    const c = this.anim.crouch;
    const hy = this.pos.y + 1.68 - c * 0.5;
    let t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, this.pos.x, hy, this.pos.z, 0.15);
    if (t >= 0 && t < maxT) return { t, part: 'head' };
    const lt = 0.9 - c * 0.35;
    const b = { x0: this.pos.x - 0.27, x1: this.pos.x + 0.27, y0: this.pos.y + lt, y1: hy - 0.13, z0: this.pos.z - 0.27, z1: this.pos.z + 0.27 };
    t = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, b, maxT);
    if (t >= 0) return { t, part: 'body' };
    const l = { x0: this.pos.x - 0.2, x1: this.pos.x + 0.2, y0: this.pos.y, y1: this.pos.y + lt, z0: this.pos.z - 0.2, z1: this.pos.z + 0.2 };
    t = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, l, maxT);
    if (t >= 0) return { t, part: 'legs' };
    return null;
  }
  // 被本地武器击中：只做本地表现，真正的结算发回受害者客户端
  takeDamage(dmg, info) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.anim.recoil = 0.6;
    const net = this.game.net;
    const pl = this.game.player;
    if (net && (info.attacker === pl)) {
      net.dm(this.cid, {
        e: 'hit', dmg: Math.round(dmg * 10) / 10, part: info.part || 'body',
        w: info.weapon || '', head: !!info.head, exp: !!info.explosive, burn: !!info.burn, melee: !!info.melee,
        from: info.attacker ? [info.attacker.pos.x, info.attacker.pos.y, info.attacker.pos.z] : (info.point ? [info.point.x, info.point.y, info.point.z] : [0, 0, 0]),
      });
    }
    return this.hp <= 0;
  }
  stun() { }
  update(dt) {
    const A = this.anim;
    if (!this.hasState) { this.model.root.visible = false; return; }
    this.model.root.visible = true;
    if (this.alive) {
      const prevX = this.pos.x, prevZ = this.pos.z;
      this.pos.x = damp(this.pos.x, this.tPos.x, 18, dt);
      this.pos.y = damp(this.pos.y, this.tPos.y, 18, dt);
      this.pos.z = damp(this.pos.z, this.tPos.z, 18, dt);
      this.crouchT = damp(this.crouchT ?? (this.crouchT = this.tCrouch), this.tCrouch, 12, dt);
      A.crouch = this.crouchT;
      // yaw 最短路径
      this.yaw = this.approachAngle(this.yaw, this.tYaw, 14, dt);
      this.pitch = damp(this.pitch, this.tPitch, 12, dt);
      const spd = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ) / dt;
      this.vel.set(this.tPos.x - this.pos.x, 0, this.tPos.z - this.pos.z).normalize();
      A.speed = Math.min(spd, 9); A.phase += dt * Math.min(spd, 9) * 2.2;
      A.pitch = this.pitch;
      this.revealT -= dt; this.flashT -= dt;
      this.model.flash.visible = this.flashT > 0;
      const muzzleW = this.model.muzzle ? this.model.muzzle.getWorldPosition(new THREE.Vector3()) : this.pos;
      A.recoil = damp(A.recoil, 0, 10, dt);
    } else {
      A.deadT += dt;
    }
    animateSoldier(this.model, A, dt);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }
  approachAngle(a, b, k, dt) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * (1 - Math.exp(-k * dt));
  }
  dispose() { this.game.scene.remove(this.model.root); }
}
