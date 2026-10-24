// 士兵模型与动画
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from './materials.js';
import { buildGun } from './gunmodel.js';
import { textTexture } from './textures.js';

// 合并同一骨骼节点下的静态 mesh（按材质），减少每名士兵的 draw call
function mergeDirectMeshes(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const meshes = group.children.filter(o => o.isMesh);
  if (meshes.length < 2) return;
  const byMat = new Map();
  for (const mesh of meshes) {
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().copy(inv).multiply(mesh.matrixWorld));
    if (!byMat.has(mesh.material)) byMat.set(mesh.material, []);
    byMat.get(mesh.material).push(geo);
    group.remove(mesh);
  }
  for (const [material, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
}

export const STYLES = {
  ally: { fab: 'fab_ally', vest: 0x5e5440, helmet: 0x5a513d, head: 'helmet', nvg: true, face: 'skin' },
  enemy: { fab: 'fab_enemy', vest: 0x262626, helmet: 0x1e1e1e, head: 'helmet', face: 'balaclava' },
  insurgent: { fab: 'fab_snowB', vest: 0x4a4032, helmet: 0x8a7560, head: 'shemagh', face: 'skinDark' },
  snowA: { fab: 'fab_snowA', vest: 0xc9ced3, helmet: 0xd5d9de, head: 'helmet', nvg: true, face: 'skin' },
  snowB: { fab: 'fab_snowB', vest: 0x3a3a30, helmet: 0x2d2d26, head: 'beanie', face: 'balaclava' },
  urbanB: { fab: 'fab_urbanB', vest: 0x2a1a1a, helmet: 0x201515, head: 'helmet', face: 'balaclava' },
  hvt: { fab: 'fab_enemy', vest: 0x3a2e22, helmet: 0x7a1e1e, head: 'beret', face: 'skinDark' },
};

const vestMats = {};
function vestMat(c) {
  if (!vestMats[c]) vestMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  return vestMats[c];
}

function capsule(r, len, m, seg = 6, rings = 12) {
  const g = new THREE.CapsuleGeometry(r, len, seg, rings);
  return new THREE.Mesh(g, m);
}

export function createSoldierModel(styleName, weaponId, attachments = {}, camo = 'none') {
  const st = STYLES[styleName] || STYLES.ally;
  const cloth = mat(st.fab);
  const vest = vestMat(st.vest);
  const helm = vestMat(st.helmet);
  const dark = mat('darkMetal');
  const boot = mat('boot');
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const parts = { root, hips };
  // 近景装饰组：远距离时由调用方整体隐藏，省 draw call 和三角形
  const detailTorso = new THREE.Group(); const detailNeck = new THREE.Group();

  const detailGroups = [detailTorso, detailNeck];
  const mkLeg = (side) => {
    const leg = new THREE.Group(); leg.position.set(side * 0.11, 0, 0); hips.add(leg);
    const thigh = capsule(0.085, 0.3, cloth); thigh.position.y = -0.22; leg.add(thigh);
    const dLeg = new THREE.Group(); leg.add(dLeg);
    // 大腿外侧杂物袋 + 绑带（近景细节）
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.1, 0.075), vest); pocket.position.set(side * 0.065, -0.26, -0.01); dLeg.add(pocket);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.025, 0.08), vest); flap.position.set(side * 0.065, -0.205, -0.01); dLeg.add(flap);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.15), dark); strap.position.set(0, -0.4, -0.005); dLeg.add(strap);
    const knee = new THREE.Group(); knee.position.y = -0.44; leg.add(knee);
    const dKnee = new THREE.Group(); knee.add(dKnee);
    // 护膝：主体 + 两侧固定带 + 硬质护板
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), vest); pad.position.set(0, 0, -0.07); knee.add(pad);
    const padShell = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.03), dark); padShell.position.set(0, 0.005, -0.095); dKnee.add(padShell);
    for (const yy of [0.045, -0.045]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.016, 0.13), dark); band.position.set(0, yy, 0); dKnee.add(band); }
    const shin = capsule(0.075, 0.3, cloth); shin.position.y = -0.2; knee.add(shin);
    // 小腿护板 + 战术靴细节
    const shinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.18, 0.04), vest); shinGuard.position.set(0, -0.2, -0.06); dKnee.add(shinGuard);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.25), boot); b.position.set(0, -0.44, -0.05); knee.add(b);
    const ankle = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.07, 0.11), boot); ankle.position.set(0, -0.39, 0.0); dKnee.add(ankle);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.03, 0.27), dark); sole.position.set(0, -0.5, -0.05); dKnee.add(sole);
    for (let i = 0; i < 3; i++) { const lace = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.01), dark); lace.position.set(0, -0.375 + i * 0.018, -0.115); dKnee.add(lace); }
    detailGroups.push(dLeg, dKnee);
    mergeDirectMeshes(leg); mergeDirectMeshes(knee);
    mergeDirectMeshes(dLeg); mergeDirectMeshes(dKnee);
    return { leg, knee };
  };
  parts.legL = mkLeg(-1); parts.legR = mkLeg(1);

  const torso = new THREE.Group(); hips.add(torso); parts.torso = torso;
  const belly = capsule(0.16, 0.25, cloth); belly.scale.set(1.15, 1, 0.8); belly.position.y = 0.22; torso.add(belly);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.28), vest); chest.position.y = 0.34; torso.add(chest);
  // 胸前弹匣袋：袋体 + 翻盖 + 卡扣
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.14, 0.07), vest); p.position.set(i * 0.125, 0.25, -0.17); torso.add(p);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.107, 0.035, 0.078), vest); lid.position.set(i * 0.125, 0.315, -0.172); torso.add(lid);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.01), dark); buckle.position.set(i * 0.125, 0.298, -0.21); torso.add(buckle);
  }
  // 背心侧板与肩带
  for (const sx of [-1, 1]) {
    const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.18), vest); sidePanel.position.set(sx * 0.215, 0.32, -0.01); torso.add(sidePanel);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), dark); strap.position.set(sx * 0.15, 0.52, -0.06); torso.add(strap);
  }
  // 腰带：主体 + 扣具 + 两侧弹匣包 + 水壶
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.3), dark); belt.position.y = 0.05; torso.add(belt);
  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), dark); beltBuckle.position.set(0, 0.05, -0.155); torso.add(beltBuckle);
  for (const sx of [-1, 1]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.06), vest); pouch.position.set(sx * 0.15, 0.0, -0.15); torso.add(pouch);
  }
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.14), vest); pack.position.set(0, 0.36, 0.2); torso.add(pack);
  const packLid = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.15), vest); packLid.position.set(0, 0.5, 0.2); torso.add(packLid);
  const packStrap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.16), dark); packStrap.position.set(0, 0.4, 0.2); torso.add(packStrap);

  const neck = new THREE.Group(); neck.position.y = 0.6; torso.add(neck); parts.neck = neck;
  const headMat = st.face === 'balaclava' ? mat('glove') : mat(st.face);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), headMat); head.position.y = 0.1; head.scale.set(0.95, 1.1, 1); neck.add(head);
  parts.head = head;
  if (st.head === 'helmet') {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), helm);
    h.position.y = 0.13; neck.add(h);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.04), helm); rim.position.set(0, 0.14, -0.12); neck.add(rim);
    // 耳罩 + 盔带
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.1), helm); ear.position.set(sx * 0.125, 0.1, 0.0); neck.add(ear);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), dark); band.position.set(sx * 0.1, 0.04, -0.02); band.rotation.z = sx * 0.25; neck.add(band);
    }
    if (st.nvg) {
      // NVG：安装座 + 竖臂 + 双镜筒
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.035), dark); mount.position.set(0, 0.2, -0.115); neck.add(mount);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.03), dark); arm.position.set(0, 0.22, -0.14); neck.add(arm);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.032, 0.05), dark); bridge.position.set(0, 0.225, -0.165); neck.add(bridge);
      const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.5, 0.4) });
      for (const x of [-0.033, 0.033]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.06, 12).rotateX(Math.PI / 2), dark);
        tube.position.set(x, 0.225, -0.185); neck.add(tube);
        const e = new THREE.Mesh(new THREE.CircleGeometry(0.019, 12), eyeM); e.position.set(x, 0.225, -0.216); e.rotation.y = Math.PI; neck.add(e);
      }
    }
  } else if (st.head === 'shemagh') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), vestMat(0x9a8a74)); s.position.y = 0.12; s.scale.set(1, 1.05, 1.05); neck.add(s);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.03), vestMat(0x9a8a74)); band.position.set(0, 0.07, -0.11); neck.add(band);
    // 垂下的头巾尾端
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.03), vestMat(0x9a8a74)); tail.position.set(0.07, 0.02, 0.09); neck.add(tail);
    head.position.z = -0.02;
  } else if (st.head === 'beanie') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), vestMat(0x2a2a2a)); s.position.y = 0.12; neck.add(s);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.03, 16), vestMat(0x2a2a2a)); cuff.position.y = 0.083; neck.add(cuff);
  } else if (st.head === 'beret') {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.04, 16), helm); s.position.set(0.02, 0.2, 0); s.rotation.z = 0.2; neck.add(s);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.006), mat('brass')); badge.position.set(-0.08, 0.195, -0.12); neck.add(badge);
  }
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), dark); goggles.position.set(0, 0.12, -0.1); neck.add(goggles);
  // 护目镜镜片与绑带（近景细节）
  const gogLens = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.006), mat('glass')); gogLens.position.set(0, 0.12, -0.118); detailNeck.add(gogLens);
  for (const sx of [-1, 1]) { const gb = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.018, 0.09), dark); gb.position.set(sx * 0.115, 0.12, -0.06); detailNeck.add(gb); }
  const chinStrap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.1, 0.012), dark); chinStrap.position.set(0.075, 0.02, -0.02); chinStrap.rotation.z = -0.3; detailNeck.add(chinStrap);
  const chinStrap2 = chinStrap.clone(); chinStrap2.position.x = -0.075; chinStrap2.rotation.z = 0.3; detailNeck.add(chinStrap2);

  // 手臂与枪（持枪姿势）
  const gunInfo = buildGun(weaponId, attachments, camo, { low: true, merge: true });
  const gun = gunInfo.group;
  gun.position.set(0.08, 0.4, -0.3);
  torso.add(gun);
  parts.gun = gun; parts.muzzle = gunInfo.muzzle;
  const limb = (a, b, r, m) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mesh = capsule(r, len, m, 5, 10);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    torso.add(mesh);
  };
  const grip = gun.position.clone().add(new THREE.Vector3(0, -0.03, 0.04));
  const fore = gun.position.clone().add(gunInfo.leftHand);
  const shR = new THREE.Vector3(0.23, 0.5, 0), shL = new THREE.Vector3(-0.23, 0.5, 0);
  const elR = new THREE.Vector3(0.24, 0.3, -0.12), elL = new THREE.Vector3(-0.2, 0.3, -0.25);
  limb(shR, elR, 0.065, cloth); limb(elR, grip, 0.055, cloth);
  limb(shL, elL, 0.065, cloth); limb(elL, fore, 0.055, cloth);
  const shoulderPad = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), vest); shoulderPad.position.copy(shR); torso.add(shoulderPad);
  const sp2 = shoulderPad.clone(); sp2.position.copy(shL); torso.add(sp2);
  // 手套：握把处和护木处各一块，避免手臂末端悬空
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.085), mat('glove')); rHand.position.copy(grip); torso.add(rHand);
  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.1), mat('glove')); lHand.position.copy(fore); lHand.rotation.z = 0.4; torso.add(lHand);
  // 袖口
  const cuffR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), dark); cuffR.position.copy(elR).lerp(grip, 0.35); torso.add(cuffR);
  const cuffL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), dark); cuffL.position.copy(elL).lerp(fore, 0.35); torso.add(cuffL);

  // 背包天线（近景细节，只有带耳机的正规军才有）
  if (st.nvg) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.34, 6), dark); ant.position.set(0.12, 0.62, 0.2); detailTorso.add(ant);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), dark); base.position.set(0.12, 0.45, 0.2); detailTorso.add(base);
  }
  // 水袋软管
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), dark); hose.position.set(0.16, 0.5, 0.12); hose.rotation.set(0.4, 0, 0.5); detailTorso.add(hose);

  torso.add(detailTorso);
  neck.add(detailNeck);

  mergeDirectMeshes(torso);
  mergeDirectMeshes(neck);
  mergeDirectMeshes(detailTorso);
  mergeDirectMeshes(detailNeck);

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // 枪口火光
  const flashM = new THREE.SpriteMaterial({ color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flash = new THREE.Sprite(flashM); flash.scale.setScalar(0.45); flash.visible = false;
  gunInfo.muzzle.add(flash);
  parts.flash = flash;
  // 远距离降级：隐藏近景装饰（躯干、头部、双腿各自的分组）
  parts.setDetail = v => { for (const g of detailGroups) g.visible = v; };
  return parts;
}

export function setFlashTexture(t) { flashTex = t; }
let flashTex = null;
export function applyFlashTex(parts) { if (flashTex) { parts.flash.material.map = flashTex; parts.flash.material.needsUpdate = true; } }

export function makeNameTag(text, color) {
  const t = textTexture(text, { color, size: 54, w: 256, h: 64 });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.2, 0.3, 1); s.position.y = 2.15; s.renderOrder = 10;
  return s;
}

// 动画状态机
export function animateSoldier(p, s, dt) {
  // s: {speed, phase, crouch(0..1), pitch, dead, deadT, recoil}
  if (s.dead) {
    const k = Math.min(1, s.deadT / 0.55);
    const e = 1 - Math.pow(1 - k, 3);
    p.root.rotation.x = e * (Math.PI / 2) * s.fallDir;
    p.root.rotation.z = e * s.fallRoll;
    p.hips.position.y = 0.95 - e * 0.75;
    p.legL.leg.rotation.x = e * 0.3; p.legR.leg.rotation.x = -e * 0.2;
    p.torso.rotation.x = 0;
    return;
  }
  const c = s.crouch;
  const moving = s.speed > 0.3;
  const sw = moving ? Math.sin(s.phase) : 0;
  const amp = Math.min(1, s.speed / 5) * (1 - c * 0.5);
  const baseThigh = c * 1.25, baseKnee = -c * 1.7;
  p.legL.leg.rotation.x = baseThigh + sw * 0.55 * amp;
  p.legR.leg.rotation.x = baseThigh - sw * 0.55 * amp;
  p.legL.knee.rotation.x = baseKnee - Math.max(0, -Math.cos(s.phase)) * 0.9 * amp;
  p.legR.knee.rotation.x = baseKnee - Math.max(0, Math.cos(s.phase)) * 0.9 * amp;
  p.hips.position.y = 0.95 - c * 0.36 + (moving ? Math.abs(Math.cos(s.phase)) * 0.04 * amp : 0);
  p.torso.rotation.x = s.pitch * 0.8 - c * 0.1 + (s.recoil || 0) * 0.12;
  p.torso.rotation.y = moving ? sw * 0.06 : 0;
  p.neck.rotation.x = s.pitch * 0.2;
}
