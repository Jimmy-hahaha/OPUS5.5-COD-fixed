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
// 面部小部件共用材质，避免每名士兵重复创建
const faceMats = {
  eye: new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.35 }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x7a4a42, roughness: 0.8 }),
};
function vestMat(c) {
  if (!vestMats[c]) vestMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.86, metalness: 0.04 });
  return vestMats[c];
}

function capsule(r, len, m, seg = 6, rings = 12) {
  const g = new THREE.CapsuleGeometry(r, len, seg, rings);
  return new THREE.Mesh(g, m);
}

// 带肌肉起伏的肢体几何：两端半径不同，中段略微隆起
function limbGeometry(rA, rB, len) {
  const pts = [];
  const n = 6;
  const mid = Math.max(rA, rB) * 1.07;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = t < 0.5
      ? rA + (mid - rA) * (t / 0.5)
      : mid + (rB - mid) * ((t - 0.5) / 0.5);
    pts.push(new THREE.Vector2(Math.max(0.012, r), t * len));
  }
  return new THREE.LatheGeometry(pts, 9);
}

export function createSoldierModel(styleName, weaponId, attachments = {}, camo = 'none', gear = {}) {
  const st = STYLES[styleName] || STYLES.ally;
  const cloth = mat(st.fab);
  const vest = vestMat(st.vest);
  const helm = vestMat(st.helmet);
  const dark = mat('darkMetal');
  // 配装外观：头盔 / 防弹衣（未指定时沿用士兵样式默认，AI 与战役角色不受影响）
  const helmetKind = gear.helmet || (st.head === 'helmet' ? (st.nvg ? 'nvg' : 'standard') : st.head);
  const nvgOn = gear.helmet ? helmetKind === 'nvg' : !!st.nvg;
  const vestKind = gear.vest || 'standard';
  const hasVest = vestKind !== 'none';
  const hasPack = vestKind === 'standard' || vestKind === 'heavy';
  const heavyVest = vestKind === 'heavy';
  const pouchMat = hasVest ? vest : cloth;
  const boot = mat('boot');
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const parts = { root, hips };
  // 近景装饰组：远距离时由调用方整体隐藏，省 draw call 和三角形
  const detailTorso = new THREE.Group(); const detailNeck = new THREE.Group();

  const detailGroups = [detailTorso, detailNeck];
  const mkLeg = (side) => {
    const leg = new THREE.Group(); leg.position.set(side * 0.11, 0, 0); hips.add(leg);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.072, 0.36, 9), cloth); thigh.position.y = -0.22; leg.add(thigh);
    const dLeg = new THREE.Group(); leg.add(dLeg);
    // 大腿外侧杂物袋 + 绑带（近景细节）
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.1, 0.075), pouchMat); pocket.position.set(side * 0.065, -0.26, -0.01); dLeg.add(pocket);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.025, 0.08), pouchMat); flap.position.set(side * 0.065, -0.205, -0.01); dLeg.add(flap);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.15), dark); strap.position.set(0, -0.4, -0.005); dLeg.add(strap);
    // 裤腿褶皱
    const crease = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.012), cloth); crease.position.set(0, -0.36, -0.086); dLeg.add(crease);
    const knee = new THREE.Group(); knee.position.y = -0.44; leg.add(knee);
    const dKnee = new THREE.Group(); knee.add(dKnee);
    // 护膝：主体 + 两侧固定带 + 硬质护板
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), vest); pad.position.set(0, 0, -0.07); knee.add(pad);
    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.072, 8, 6), cloth); kneeJoint.position.set(0, 0, 0.015); knee.add(kneeJoint);
    const padShell = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.03), dark); padShell.position.set(0, 0.005, -0.095); dKnee.add(padShell);
    for (const yy of [0.045, -0.045]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.016, 0.13), dark); band.position.set(0, yy, 0); dKnee.add(band); }
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.34, 9), cloth); shin.position.y = -0.2; knee.add(shin);
    // 小腿护板 + 战术靴细节
    const shinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.18, 0.04), vest); shinGuard.position.set(0, -0.2, -0.06); dKnee.add(shinGuard);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.25), boot); b.position.set(0, -0.44, -0.05); knee.add(b);
    const ankle = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.07, 0.11), boot); ankle.position.set(0, -0.39, 0.0); dKnee.add(ankle);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.03, 0.27), dark); sole.position.set(0, -0.5, -0.05); dKnee.add(sole);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.06, 0.06), boot); heel.position.set(0, -0.465, 0.07); dKnee.add(heel);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.055, 0.06), boot); toe.position.set(0, -0.465, -0.145); dKnee.add(toe);
    // 靴口裤脚堆积
    const cuffFold = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.062, 0.045, 8), cloth); cuffFold.position.set(0, -0.345, 0); dKnee.add(cuffFold);
    for (let i = 0; i < 3; i++) { const lace = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.01), dark); lace.position.set(0, -0.375 + i * 0.018, -0.115); dKnee.add(lace); }
    detailGroups.push(dLeg, dKnee);
    mergeDirectMeshes(leg); mergeDirectMeshes(knee);
    mergeDirectMeshes(dLeg); mergeDirectMeshes(dKnee);
    return { leg, knee };
  };
  parts.legL = mkLeg(-1); parts.legR = mkLeg(1);

  const torso = new THREE.Group(); hips.add(torso); parts.torso = torso;
  const belly = capsule(0.16, 0.25, cloth); belly.scale.set(1.15, 1, 0.8); belly.position.y = 0.22; torso.add(belly);
  // 防弹衣：无甲时只保留作战服；轻甲薄板；制式/重型加厚
  if (hasVest) {
    const thin = vestKind === 'light';
    const chest = new THREE.Mesh(new THREE.BoxGeometry(thin ? 0.38 : 0.42, thin ? 0.3 : 0.4, thin ? 0.22 : 0.28), vest);
    chest.position.y = thin ? 0.36 : 0.34; torso.add(chest);
    // 胸前弹匣袋：袋体 + 翻盖 + 卡扣
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.14, 0.07), vest); p.position.set(i * 0.125, 0.25, -0.17); torso.add(p);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.107, 0.035, 0.078), vest); lid.position.set(i * 0.125, 0.315, -0.172); torso.add(lid);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.01), dark); buckle.position.set(i * 0.125, 0.298, -0.21); torso.add(buckle);
    }
    // 背心侧板（轻甲没有）与重型腹部护板
    if (!thin) {
      for (const sx of [-1, 1]) {
        const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.18), vest); sidePanel.position.set(sx * 0.215, 0.32, -0.01); torso.add(sidePanel);
      }
    }
    if (heavyVest) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.07, 12), vest); collar.position.y = 0.53; torso.add(collar);
      const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.08), vest); abdomen.position.set(0, 0.12, -0.17); torso.add(abdomen);
      const groin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.07), vest); groin.position.set(0, 0.0, -0.17); torso.add(groin);
    }
  }
  // 肩带
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), dark); strap.position.set(sx * 0.15, 0.52, -0.06); torso.add(strap);
  }
  // 腰带：主体 + 扣具 + 两侧弹匣包 + 水壶
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.3), dark); belt.position.y = 0.05; torso.add(belt);
  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), dark); beltBuckle.position.set(0, 0.05, -0.155); torso.add(beltBuckle);
  for (const sx of [-1, 1]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.06), pouchMat); pouch.position.set(sx * 0.15, 0.0, -0.15); torso.add(pouch);
  }
  // 背包：轻甲与无甲不携带
  if (hasPack) {
    const packD = heavyVest ? 0.18 : 0.14;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, packD), vest); pack.position.set(0, 0.36, 0.2); torso.add(pack);
    const packLid = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, packD + 0.01), vest); packLid.position.set(0, 0.5, 0.2); torso.add(packLid);
    const packStrap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, packD + 0.02), dark); packStrap.position.set(0, 0.4, 0.2); torso.add(packStrap);
    // 背包侧袋、提手与织带
    for (const sx of [-1, 1]) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), vest); pouch.position.set(sx * 0.19, 0.36, 0.2); torso.add(pouch);
      const webbing = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.015), dark); webbing.position.set(sx * 0.1, 0.37, 0.275); detailTorso.add(webbing);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.03), dark); handle.position.set(0, 0.556, 0.2); torso.add(handle);
  }
  // 肩部三角肌与肩甲、胸前织带
  for (const sx of [-1, 1]) {
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), cloth); delt.position.set(sx * 0.21, 0.47, 0); delt.scale.set(1, 1.1, 0.9); torso.add(delt);
    if (hasVest && vestKind !== 'light') {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(heavyVest ? 0.15 : 0.13, heavyVest ? 0.08 : 0.06, heavyVest ? 0.18 : 0.16), vest);
      pad.position.set(sx * 0.2, heavyVest ? 0.54 : 0.532, 0); torso.add(pad);
    }
  }
  const chestStrap = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.035, 0.02), dark); chestStrap.position.set(0, 0.47, -0.155); detailTorso.add(chestStrap);
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.28, 0.01), dark); zip.position.set(0, 0.35, -0.147); detailTorso.add(zip);
  // 肩背带与腹部布料褶皱（近景）
  for (const sx of [-1, 1]) {
    const sling = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.34, 0.018), dark);
    sling.position.set(sx * 0.125, 0.37, -0.152); sling.rotation.z = sx * 0.07; detailTorso.add(sling);
  }
  for (let i = 0; i < 3; i++) {
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.22 + i * 0.02, 0.012, 0.012), cloth);
    fold.position.set(0, 0.12 + i * 0.045, -0.136); detailTorso.add(fold);
  }

  const neck = new THREE.Group(); neck.position.y = 0.6; torso.add(neck); parts.neck = neck;
  // 脖子与衣领
  const neckMesh = capsule(0.052, 0.07, cloth, 5, 8); neckMesh.position.y = 0.01; neck.add(neckMesh);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.078, 0.035, 10), cloth); collar.position.y = -0.018; neck.add(collar);
  const headMat = st.face === 'balaclava' ? mat('glove') : mat(st.face);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), headMat); head.position.y = 0.1; head.scale.set(0.95, 1.1, 1); neck.add(head);
  parts.head = head;
  // 面部：眼睛、眉毛、鼻子、嘴、耳朵（只对露脸样式）
  if (st.face !== 'balaclava') {
    const eyeM = faceMats.eye;
    const mouthM = faceMats.mouth;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eyeM); eye.position.set(sx * 0.036, 0.115, -0.098); neck.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.007, 0.01), headMat); brow.position.set(sx * 0.036, 0.136, -0.1); neck.add(brow);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), headMat); ear.position.set(sx * 0.104, 0.1, 0); ear.scale.set(0.5, 1, 0.8); neck.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.032, 6), headMat); nose.position.set(0, 0.098, -0.115); nose.rotation.x = -Math.PI / 2; neck.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.006, 0.008), mouthM); mouth.position.set(0, 0.066, -0.104); neck.add(mouth);
  }
  if (helmetKind === 'helmet' || helmetKind === 'standard' || helmetKind === 'nvg' || helmetKind === 'heavy') {
    const heavyHelm = helmetKind === 'heavy';
    const h = new THREE.Mesh(new THREE.SphereGeometry(heavyHelm ? 0.145 : 0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * (heavyHelm ? 0.6 : 0.55)), helm);
    h.position.y = heavyHelm ? 0.125 : 0.13; neck.add(h);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(heavyHelm ? 0.28 : 0.26, heavyHelm ? 0.045 : 0.03, 0.04), helm); rim.position.set(0, heavyHelm ? 0.135 : 0.14, -0.12); neck.add(rim);
    // 侧轨、后颈护片与顶部织带
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.11), dark); rail.position.set(sx * (heavyHelm ? 0.146 : 0.136), 0.155, -0.02); neck.add(rail);
    }
    const nape = new THREE.Mesh(new THREE.BoxGeometry(0.19, heavyHelm ? 0.09 : 0.06, 0.03), helm); nape.position.set(0, 0.07, 0.115); nape.rotation.x = 0.25; neck.add(nape);
    const topStrap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.005, 0.2), vestMat(0x3d3a30)); topStrap.position.set(0, heavyHelm ? 0.255 : 0.245, 0); neck.add(topStrap);
    // 耳罩 + 盔带
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(heavyHelm ? 0.045 : 0.035, heavyHelm ? 0.11 : 0.09, 0.1), helm);
      ear.position.set(sx * (heavyHelm ? 0.135 : 0.125), 0.1, 0.0); neck.add(ear);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), dark); band.position.set(sx * 0.1, 0.04, -0.02); band.rotation.z = sx * 0.25; neck.add(band);
    }
    if (heavyHelm) {
      // 重型头盔：可翻起的护目面罩支架 + 前额加厚护板
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.05), helm); brow.position.set(0, 0.175, -0.115); neck.add(brow);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.015), mat('glass')); visor.position.set(0, 0.14, -0.145); visor.rotation.x = 0.25; neck.add(visor);
      const visorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.022), dark); visorFrame.position.set(0, 0.178, -0.142); neck.add(visorFrame);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.05), helm); jaw.position.set(0, 0.055, -0.115); neck.add(jaw);
    }
    if (nvgOn) {
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
  } else if (helmetKind === 'none') {
    // 不戴头盔：只戴一顶紧身头套，保留护目镜
    const skull = vestMat(0x2f2d28);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), skull); cap.position.y = 0.135; neck.add(cap);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.124, 0.026, 16), skull); cuff.position.y = 0.097; neck.add(cuff);
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
  const limb = (a, b, rA, rB, m) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mesh = new THREE.Mesh(limbGeometry(rA, rB, len), m);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    torso.add(mesh);
  };
  const grip = gun.position.clone().add(new THREE.Vector3(0, -0.03, 0.04));
  const fore = gun.position.clone().add(gunInfo.leftHand);
  const shR = new THREE.Vector3(0.23, 0.5, 0), shL = new THREE.Vector3(-0.23, 0.5, 0);
  const elR = new THREE.Vector3(0.24, 0.3, -0.12), elL = new THREE.Vector3(-0.2, 0.3, -0.25);
  limb(shR, elR, 0.075, 0.052, cloth); limb(elR, grip, 0.052, 0.042, cloth);
  limb(shL, elL, 0.075, 0.052, cloth); limb(elL, fore, 0.052, 0.042, cloth);
  const shoulderPad = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), vest); shoulderPad.position.copy(shR); torso.add(shoulderPad);
  const sp2 = shoulderPad.clone(); sp2.position.copy(shL); torso.add(sp2);
  // 手套：握把处和护木处各一块，避免手臂末端悬空
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.085), mat('glove')); rHand.position.copy(grip); torso.add(rHand);
  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.1), mat('glove')); lHand.position.copy(fore); lHand.rotation.z = 0.4; torso.add(lHand);
  // 袖口
  const cuffR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), dark); cuffR.position.copy(elR).lerp(grip, 0.35); torso.add(cuffR);
  const cuffL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), dark); cuffL.position.copy(elL).lerp(fore, 0.35); torso.add(cuffL);
  // 肘部护具与手套手指（近景）
  for (const el of [elR, elL]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), vest); pad.position.copy(el); pad.scale.set(1, 1.15, 1); detailTorso.add(pad);
  }
  for (const [c, dir] of [[grip, 1], [fore, -1]]) {
    for (let i = -1; i <= 1; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.045, 0.02), mat('glove'));
      f.position.set(c.x + i * 0.018, c.y - 0.028, c.z - 0.012); f.rotation.x = dir * 0.5;
      detailTorso.add(f);
    }
  }

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
  p._t = (p._t || 0) + dt;
  // s: {speed, phase, crouch(0..1), pitch, dead, deadT, recoil}
  if (s.dead) {
    const k = Math.min(1, s.deadT / 0.55);
    const e = 1 - Math.pow(1 - k, 3);
    p.root.rotation.x = e * (Math.PI / 2) * s.fallDir;
    p.root.rotation.z = e * s.fallRoll;
    p.hips.position.y = 0.95 - e * 0.75;
    p.hips.rotation.z = e * s.fallRoll * 0.6;
    p.legL.leg.rotation.x = e * 0.3; p.legR.leg.rotation.x = -e * 0.2;
    p.legL.knee.rotation.x = -e * 0.9; p.legR.knee.rotation.x = -e * 0.5;
    p.torso.rotation.x = 0;
    p.torso.rotation.z = e * 0.12;
    p.neck.rotation.x = -e * 0.6;
    if (p.gun) { p.gun.rotation.x = 0; p.gun.rotation.z = 0; }
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
  // 待机呼吸 + 行走起伏 / 重心侧移
  const settle = 1 - Math.min(1, s.speed / 4);
  const breathe = Math.sin(p._t * 1.7) * 0.006 * settle;
  const bob = moving ? Math.abs(Math.cos(s.phase)) * 0.04 * amp : breathe;
  p.hips.position.y = 0.95 - c * 0.36 + bob;
  p.hips.rotation.z = moving ? Math.sin(s.phase) * 0.025 * amp : Math.sin(p._t * 0.9) * 0.006;
  // 躯干：前倾 + 侧倾 + 后坐
  p.torso.rotation.x = s.pitch * 0.8 - c * 0.1 + (s.recoil || 0) * 0.12 + Math.min(1, s.speed / 6) * 0.05;
  p.torso.rotation.y = moving ? sw * 0.06 : 0;
  p.torso.rotation.z = (moving ? -Math.sin(s.phase) * 0.03 * amp : 0) + Math.sin(p._t * 1.1) * 0.008;
  // 头部：俯仰跟随，行走时轻微反向摆动，待机时缓慢环视
  p.neck.rotation.x = s.pitch * 0.2;
  p.neck.rotation.y = moving ? -sw * 0.04 : Math.sin(p._t * 0.6) * 0.05;
  // 枪口随呼吸轻晃、受击时枪身回弹
  if (p.gun) {
    p.gun.position.y = 0.4 + Math.sin(p._t * 1.6) * 0.003 * settle - (s.recoil || 0) * 0.01;
    p.gun.rotation.x = (s.recoil || 0) * 0.03;
    p.gun.rotation.z = (s.recoil || 0) * 0.04;
  }
}
