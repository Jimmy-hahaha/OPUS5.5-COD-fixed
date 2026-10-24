// 程序化枪械模型（含配件可视化）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPONS } from './data.js';
import { mat, camoMaterial } from './materials.js';

const geoCache = new Map();
function bgeo(w, h, d) {
  const k = `b${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
function cgeo(r1, r2, len, seg = 14, open = false) {
  const k = `c${r1},${r2},${len},${seg},${open ? 1 : 0}`;
  if (!geoCache.has(k)) { const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open); g.rotateX(Math.PI / 2); geoCache.set(k, g); }
  return geoCache.get(k);
}

export function buildGun(weaponId, att = {}, camo = 'none', opts = {}) {
  const info = buildGunInner(weaponId, att, camo, opts);
  if (opts.merge) mergeStaticMeshes(info.group);
  return info;
}

// 把静态枪模按材质合并，大幅减少 AI 士兵/掉落武器的 draw call（第一人称枪模不走这里）
function mergeStaticMeshes(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().copy(inv).multiply(mesh.matrixWorld));
    if (!byMat.has(mesh.material)) byMat.set(mesh.material, []);
    byMat.get(mesh.material).push(geo);
    mesh.parent.remove(mesh);
  }
  for (const [material, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = false; mesh.receiveShadow = false;
    root.add(mesh);
  }
}

function buildGunInner(weaponId, att = {}, camo = 'none', opts = {}) {
  const def = WEAPONS[weaponId];
  const M = def.model;
  const root = new THREE.Group();
  const info = { group: root, muzzle: new THREE.Object3D(), sight: new THREE.Vector3(), mag: null, leftHand: new THREE.Vector3(0, 0, -0.2), eject: new THREE.Vector3(0.03, 0.05, -0.05), optic: 'iron', reticle: null };
  const low = !!opts.low;
  // 第一人称/近景用高精度几何，AI、掉落武器和网络玩家用 low 低模
  const SEG = low ? 14 : 18;
  // 只在近景级别添加的小细节（螺钉、销钉、刻槽等）
  const det = low ? () => null : (...a) => add(...a);
  const steel = mat('gunSteel');
  const dark = mat('darkMetal');

  const furnBase = M.color === 'wood' ? mat('gunWood') : M.color === 'tan' ? mat('gunTan') : M.color === 'green' ? mat('gunGreen') : M.color === 'steel' ? mat('gunSteel') : mat('gunPoly');
  const metal = M.color === 'steel' ? mat('gunSteel') : mat('gunMetal');
  const furn = camoMaterial(camo, furnBase);
  const body = camo !== 'none' ? camoMaterial(camo, metal) : metal;
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = root) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = !opts.noShadow; mesh.receiveShadow = false;
    parent.add(mesh); return mesh;
  };

  if (M.rpg) {
    add(cgeo(0.042, 0.042, 0.95), furn, 0, 0.06, -0.15);
    add(cgeo(0.05, 0.05, 0.25), mat('gunWood'), 0, 0.06, -0.05);
    add(cgeo(0.06, 0.03, 0.14), metal, 0, 0.06, 0.37);
    const wh = new THREE.Group(); wh.position.set(0, 0.06, -0.62); root.add(wh);
    add(cgeo(0.04, 0.045, 0.12), mat('gunGreen'), 0, 0, 0, 0, 0, 0, wh);
    add(new THREE.ConeGeometry(0.07, 0.25, 14).rotateX(-Math.PI / 2), mat('gunGreen'), 0, 0, -0.18, 0, 0, 0, wh);
    add(cgeo(0.07, 0.07, 0.12), mat('gunGreen'), 0, 0, -0.03, 0, 0, 0, wh);
    add(bgeo(0.03, 0.1, 0.04), mat('gunPoly'), 0, -0.03, 0.02, 0.2);
    add(bgeo(0.03, 0.1, 0.04), mat('gunPoly'), 0, -0.03, -0.2, 0.1);
    add(bgeo(0.02, 0.05, 0.02), metal, 0, 0.12, -0.1);
    add(bgeo(0.02, 0.04, 0.02), metal, 0, 0.12, 0.08);
    info.mag = wh;
    info.muzzle.position.set(0, 0.06, -0.8);
    info.sight.set(0, 0.14, 0.14);
    info.leftHand.set(0, -0.02, -0.2);
    root.add(info.muzzle);
    return info;
  }

  if (M.pistol) {
    if (M.revolver) {
      add(bgeo(0.028, 0.035, 0.16), body, 0, 0.055, -0.1);
      add(cgeo(0.011, 0.011, 0.2), body, 0, 0.06, -0.14);
      add(cgeo(0.028, 0.028, 0.05, 12), metal, 0, 0.05, -0.02);
      add(bgeo(0.03, 0.1, 0.045), mat('gunWood'), 0, -0.02, 0.04, 0.3);
      add(bgeo(0.004, 0.012, 0.01), metal, 0, 0.078, -0.23);
      info.muzzle.position.set(0, 0.06, -0.25);
      info.sight.set(0, 0.083, 0.02);
      info.mag = add(bgeo(0.001, 0.001, 0.001), metal, 0, 0.05, -0.02);
    } else if (M.poly) {
      // QSZ-92：多边形套筒、平移击针、无外露击锤、双排长弹匣
      add(bgeo(0.03, 0.03, 0.2), body, 0, 0.052, -0.07, 0, 0, Math.PI / 4);
      add(bgeo(0.032, 0.02, 0.19), body, 0, 0.036, -0.07);
      add(bgeo(0.028, 0.025, 0.16), metal, 0, 0.018, -0.06);
      add(bgeo(0.03, 0.1, 0.045), furn, 0, -0.032, 0.03, 0.22);
      add(bgeo(0.005, 0.03, 0.04), metal, 0, 0.0, -0.035);
      add(bgeo(0.004, 0.01, 0.008), metal, 0, 0.073, -0.16);
      add(bgeo(0.018, 0.01, 0.01), metal, 0, 0.073, 0.02);
      info.mag = add(bgeo(0.024, 0.11, 0.036), metal, 0, -0.04, 0.03, 0.22);
      info.muzzle.position.set(0, 0.052, -0.18);
      info.sight.set(0, 0.08, 0.03);
      if (att.mag) info.mag.scale.y = 1.5;
    } else {
      add(bgeo(0.03, 0.032, 0.2), body, 0, 0.05, -0.07);
      add(bgeo(0.028, 0.025, 0.16), metal, 0, 0.022, -0.06);
      add(bgeo(0.03, 0.1, 0.045), furn, 0, -0.03, 0.03, 0.25);
      add(bgeo(0.005, 0.03, 0.04), metal, 0, 0.0, -0.035);
      add(bgeo(0.004, 0.01, 0.008), metal, 0, 0.071, -0.16);
      add(bgeo(0.02, 0.01, 0.01), metal, 0, 0.071, 0.02);
      info.mag = add(bgeo(0.024, 0.09, 0.035), metal, 0, -0.03, 0.03, 0.25);
      info.muzzle.position.set(0, 0.05, -0.18);
      info.sight.set(0, 0.076, 0.03);
      if (att.mag) info.mag.scale.y = 1.6;
    }
    if (!low) {
      // —— 近景细节：套筒防滑纹、抛壳窗、扳机、导轨、弹匣底板 ——
      const sy = M.revolver ? 0.055 : (M.poly ? 0.052 : 0.05);
      const sz0 = M.revolver ? -0.05 : -0.02;
      for (let i = 0; i < 5; i++) add(bgeo(0.0315, 0.024, 0.0025), dark, 0, sy, sz0 + i * 0.012);
      add(bgeo(0.002, 0.014, 0.028), dark, 0.0155, sy + 0.004, -0.07);          // 抛壳窗
      add(bgeo(0.008, 0.02, 0.006), steel, 0, M.revolver ? 0.02 : 0.012, -0.035, -0.3); // 扳机
      add(bgeo(0.018, 0.004, 0.036), metal, 0, M.revolver ? -0.004 : 0.0, -0.035);      // 扳机护圈下缘
      add(bgeo(0.022, 0.006, 0.05), dark, 0, 0.008, -0.1);                       // 下挂导轨
      for (let i = 0; i < 3; i++) add(bgeo(0.024, 0.002, 0.004), metal, 0, 0.006, -0.085 - i * 0.012);
      if (M.revolver) {
        add(cgeo(0.03, 0.03, 0.045, SEG), steel, 0, 0.05, -0.02, 0, 0, Math.PI / 2); // 转轮
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(cgeo(0.006, 0.006, 0.048, 8), dark, 0, 0.05 + Math.cos(a) * 0.019, -0.02 + Math.sin(a) * 0.019, 0, 0, Math.PI / 2); }
        add(bgeo(0.008, 0.022, 0.012), steel, 0, 0.078, 0.03, 0.3);                // 击锤
        add(bgeo(0.004, 0.028, 0.006), steel, 0, 0.02, 0.04, 0.3);                 // 转轮锁
      }
      if (info.mag && info.mag.isMesh) {
        const my = M.revolver ? 0 : (M.poly ? -0.052 : -0.042);
        add(bgeo(0.03, 0.008, 0.042), dark, 0, my, 0, 0, 0, 0, info.mag);
      }
    }
    if (att.muzzle === 'suppressor') { add(cgeo(0.018, 0.018, 0.14), mat('gunPoly'), 0, 0.05, -0.25); info.muzzle.position.z -= 0.14; }
    else if (att.muzzle) { add(cgeo(0.014, 0.014, 0.04), metal, 0, 0.05, -0.2); info.muzzle.position.z -= 0.04; }
    if (att.laser) { add(bgeo(0.025, 0.022, 0.05), mat('gunPoly'), 0, 0.005, -0.12); addLaser(add, 0, 0.005, -0.146); }
    if (att.optic === 'reddot') {
      add(bgeo(0.03, 0.006, 0.04), metal, 0, 0.07, -0.02);
      add(bgeo(0.004, 0.035, 0.012), metal, -0.016, 0.09, -0.035);
      add(bgeo(0.004, 0.035, 0.012), metal, 0.016, 0.09, -0.035);
      add(bgeo(0.036, 0.004, 0.012), metal, 0, 0.108, -0.035);
      add(new THREE.PlaneGeometry(0.028, 0.03), mat('lens'), 0, 0.09, -0.035);
      info.reticle = add(new THREE.CircleGeometry(0.0012, 10), mat('reticle'), 0, 0.09, -0.036);
      info.sight.set(0, 0.09, 0.04);
      info.optic = 'reddot';
    }
    info.leftHand.set(-0.01, -0.03, 0.02);
    root.add(info.muzzle);
    return info;
  }

  // ---------- 长枪 ----------
  const recv = M.recv, hand = M.hand;
  const bullpup = !!M.bullpup;          // 无托：握把前移、弹匣移到握把后方
  const topMag = M.mag === 'top';       // P90 顶置弹匣
  let barrel = M.barrel;
  if (att.barrel === 'long') barrel += 0.1;
  if (att.barrel === 'short') barrel -= 0.08;
  const zRear = 0.07, zFront = zRear - recv;
  const recvH = M.stock === 'scar' ? 0.075 : 0.065;
  // 机匣
  add(bgeo(0.052, recvH, recv), body, 0, 0.03, (zRear + zFront) / 2);
  add(bgeo(0.046, 0.04, recv * 0.8), metal, 0, -0.012, (zRear + zFront) / 2 + 0.02);
  const railY = 0.03 + recvH / 2;
  add(bgeo(0.024, 0.012, recv), metal, 0, railY + 0.006, (zRear + zFront) / 2);
  const cz = (zRear + zFront) / 2;
  if (!low) {
    for (let i = 0; i < Math.floor(recv / 0.02); i++) add(bgeo(0.026, 0.004, 0.008), metal, 0, railY + 0.014, zRear - 0.01 - i * 0.02);
    // 抛壳窗：外框 + 深色内衬 + 半开的挡板
    add(bgeo(0.004, 0.03, 0.068), metal, 0.0265, 0.035, -0.03);
    add(bgeo(0.002, 0.022, 0.056), dark, 0.0286, 0.035, -0.03);
    add(bgeo(0.002, 0.02, 0.05), steel, 0.0305, 0.033, -0.03, 0, 0, 0.12);
    // 上下机匣分界缝
    add(bgeo(0.054, 0.003, recv * 0.94), dark, 0, 0.002, cz);
    // 冲压机匣侧面的加强凹槽
    for (const sx of [-1, 1]) add(bgeo(0.002, 0.016, recv * 0.5), dark, sx * 0.0268, 0.042, cz);
    // 快慢机拨杆 + 销轴
    add(cgeo(0.004, 0.004, 0.006, 10), steel, 0.027, 0.005, zRear - 0.055, 0, 0, Math.PI / 2);
    add(bgeo(0.003, 0.018, 0.005), steel, 0.028, 0.014, zRear - 0.055, 0, 0, 0.4);
    // 机匣销钉
    for (const zz of [zRear - 0.03, zRear - recv * 0.72]) for (const sx of [-1, 1]) add(cgeo(0.0035, 0.0035, 0.004, 8), steel, sx * 0.0265, 0.012, zz, 0, 0, Math.PI / 2);
    // 弹匣井喇叭口
    add(bgeo(0.058, 0.014, 0.02), metal, 0, -0.028, bullpup ? 0.12 : -0.03);
    // 拉机柄：柄体 + 圆柱柄头
    add(bgeo(0.02, 0.01, 0.03), metal, 0.03, 0.045, zRear - 0.04);
    add(cgeo(0.006, 0.006, 0.018, 10), steel, 0.042, 0.045, zRear - 0.04, 0, 0, Math.PI / 2);
    // 后部背带环
    add(cgeo(0.006, 0.006, 0.004, 8), steel, -0.028, 0.02, zRear - 0.01, 0, 0, Math.PI / 2);
  }
  // 护木
  const hz0 = zFront, hz1 = zFront - hand;
  const handH = M.color === 'wood' ? 0.05 : 0.06;
  add(bgeo(0.056, handH, hand), furn, 0, 0.03, (hz0 + hz1) / 2);
  if (!low) {
    if (M.color !== 'wood') {
      for (let i = 0; i < 4; i++) add(bgeo(0.058, 0.006, 0.03), metal, 0, 0.03 + (i % 2 ? -0.012 : 0.012), hz0 - 0.03 - i * (hand / 4.5));
      // M-LOK 槽：两侧与底部各开一组，用深色内衬表现
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) add(bgeo(0.002, 0.01, 0.026), dark, sx * 0.0285, 0.024, hz0 - 0.035 - i * (hand / 5));
      for (let i = 0; i < 3; i++) add(bgeo(0.022, 0.002, 0.024), dark, 0, 0.002, hz0 - 0.045 - i * (hand / 4));
    } else {
      // 木质护木：上下护木之间的接缝与散热缝
      for (let i = 0; i < 4; i++) add(bgeo(0.058, 0.002, 0.006), mat('rubber'), 0, 0.012, hz0 - 0.035 - i * (hand / 5));
    }
    // 护木端帽 + 前端 QD 背带孔
    add(bgeo(0.06, handH + 0.008, 0.014), metal, 0, 0.03, hz1 + 0.007);
    add(cgeo(0.0055, 0.0055, 0.005, 10), steel, -0.03, 0.018, hz1 + 0.02, 0, 0, Math.PI / 2);
    // 护木底部导轨
    add(bgeo(0.026, 0.008, hand * 0.8), metal, 0, 0.03 - handH / 2 - 0.004, (hz0 + hz1) / 2);
  }
  if (M.color !== 'wood') add(bgeo(0.022, 0.01, hand), metal, 0, 0.03 + handH / 2 + 0.005, (hz0 + hz1) / 2);
  info.leftHand.set(0, -0.005, hz0 - hand * 0.55);
  // 枪管
  const bz0 = hz1, bz1 = hz1 - barrel;
  add(cgeo(0.0095, 0.0095, barrel + 0.05, SEG), mat('gunMetal'), 0, 0.035, (bz0 + bz1) / 2 + 0.025);
  let muzzleZ = bz1;
  if (!low) {
    // 枪管螺母 + 导气箍 + 前段加粗枪管
    add(cgeo(0.0135, 0.0135, 0.018, SEG), metal, 0, 0.035, bz0 - 0.008);
    if (barrel > 0.18) {
      add(bgeo(0.026, 0.026, 0.026), metal, 0, 0.052, bz0 - barrel * 0.36);
      add(cgeo(0.0042, 0.0042, hand * 0.16, 8), steel, 0, 0.066, bz0 - barrel * 0.22);
      add(cgeo(0.0115, 0.0115, barrel * 0.3, SEG), metal, 0, 0.035, bz1 + barrel * 0.2);
    }
  }
  if (M.mag === 'tube') add(cgeo(0.015, 0.015, hand + barrel * 0.7), metal, 0, 0.005, hz0 - (hand + barrel * 0.7) / 2);
  if (M.stock === 'ak' && M.color === 'wood') add(cgeo(0.012, 0.012, hand * 0.9), metal, 0, 0.07, (hz0 + hz1) / 2); // 导气管
  // 枪口
  const mz = att.muzzle;
  if (M.integralSupp) {
    // 一体式消音器（QCW-05）：粗大的管状消音器
    add(cgeo(0.024, 0.026, 0.21, SEG), mat('gunPoly'), 0, 0.035, muzzleZ - 0.105);
    add(cgeo(0.026, 0.026, 0.012, SEG), metal, 0, 0.035, muzzleZ - 0.01);
    for (let i = 0; i < 4; i++) det(cgeo(0.0245, 0.0245, 0.004, SEG), dark, 0, 0.035, muzzleZ - 0.045 - i * 0.04);
    det(cgeo(0.021, 0.021, 0.006, SEG), dark, 0, 0.035, muzzleZ - 0.212);
    muzzleZ -= 0.21;
  } else if (mz === 'suppressor') {
    add(cgeo(0.022, 0.022, 0.19, SEG), mat('gunPoly'), 0, 0.035, muzzleZ - 0.095);
    for (let i = 0; i < 3; i++) det(cgeo(0.0225, 0.0225, 0.004, SEG), dark, 0, 0.035, muzzleZ - 0.04 - i * 0.05);
    muzzleZ -= 0.19;
  } else if (mz === 'comp') {
    add(bgeo(0.03, 0.03, 0.06), metal, 0, 0.035, muzzleZ - 0.03);
    for (let i = 0; i < 2; i++) { det(cgeo(0.007, 0.007, 0.002, 10), dark, 0.0155, 0.035, muzzleZ - 0.018 - i * 0.02, 0, 0, Math.PI / 2); det(cgeo(0.007, 0.007, 0.002, 10), dark, -0.0155, 0.035, muzzleZ - 0.018 - i * 0.02, 0, 0, Math.PI / 2); }
    muzzleZ -= 0.06;
  } else if (mz === 'brake') {
    add(cgeo(0.017, 0.017, 0.06, SEG), metal, 0, 0.035, muzzleZ - 0.03);
    add(bgeo(0.04, 0.008, 0.02), metal, 0, 0.035, muzzleZ - 0.03);
    for (let i = 0; i < 3; i++) det(bgeo(0.004, 0.012, 0.008), dark, 0.019, 0.035, muzzleZ - 0.014 - i * 0.016);
    muzzleZ -= 0.06;
  } else if (mz === 'flash') {
    add(cgeo(0.014, 0.018, 0.07, SEG), metal, 0, 0.035, muzzleZ - 0.035);
    for (let i = 0; i < 4; i++) det(bgeo(0.003, 0.008, 0.014), dark, 0.017 - i * 0.0008, 0.035, muzzleZ - 0.018 - i * 0.013, 0, 0.5, 0);
    muzzleZ -= 0.07;
  } else {
    add(cgeo(0.013, 0.013, 0.04, SEG), metal, 0, 0.035, muzzleZ - 0.02);
    det(cgeo(0.0125, 0.0125, 0.003, SEG), steel, 0, 0.035, muzzleZ - 0.038);
    muzzleZ -= 0.04;
  }
  info.muzzle.position.set(0, 0.035, muzzleZ);
  // 机械瞄具
  const optic = att.optic || (def.defaultOptic && !att.optic ? def.defaultOptic : null);
  const opticLift = topMag ? 0.05 : 0; // P90 的顶置弹匣把瞄具整体抬高
  const sightY = railY + 0.035 + opticLift;
  if (!optic) {
    const fy = railY + 0.006 + opticLift, py = railY + 0.02 + opticLift;
    add(bgeo(0.02, 0.012, 0.012), metal, 0, fy, hz1 + 0.02);                 // 准星座
    add(bgeo(0.004, 0.035, 0.006), steel, 0, py, hz1 + 0.02);                // 准星柱
    det(bgeo(0.0035, 0.03, 0.004), metal, -0.014, py + 0.004, hz1 + 0.02);   // 准星护翼
    det(bgeo(0.0035, 0.03, 0.004), metal, 0.014, py + 0.004, hz1 + 0.02);
    add(bgeo(0.022, 0.022, 0.016), metal, 0, py, zRear - 0.02);              // 后照门座
    det(bgeo(0.014, 0.005, 0.006), metal, 0, py + 0.014, zRear - 0.02);      // 照门横梁
    det(bgeo(0.003, 0.006, 0.003), dark, 0, py + 0.018, zRear - 0.02);       // 缺口
    info.sight.set(0, railY + 0.034 + opticLift, zRear + 0.13);
  }
  // 提把：95 式 / 95 班机的标志性造型
  if (M.carry) {
    const cy = railY + 0.032;
    const cf = hz1 + 0.02;                       // 提把前端（护木前部上方）
    const cb = zFront + recv * 0.3;              // 提把后端（机匣前段，给瞄具留位置）
    if (optic) {
      // 装了瞄具时提把让位：只保留两侧矮安装座，避免横梁挡住瞄准线
      add(bgeo(0.007, 0.016, cf - cb), metal, -0.026, railY + 0.012, (cf + cb) / 2);
      add(bgeo(0.007, 0.016, cf - cb), metal, 0.026, railY + 0.012, (cf + cb) / 2);
      add(bgeo(0.024, 0.018, 0.014), metal, 0, railY + 0.016, zRear - 0.025);
    } else {
      add(bgeo(0.017, 0.014, cf - cb), metal, 0, cy, (cf + cb) / 2);
      add(bgeo(0.013, 0.045, 0.016), metal, 0, railY + 0.022, cf - 0.03);      // 前支柱
      add(bgeo(0.022, 0.032, 0.016), metal, 0, railY + 0.018, cb + 0.02);      // 后支柱
      add(bgeo(0.026, 0.018, 0.02), metal, 0, cy + 0.014, cf - 0.03);          // 前准星护圈
      add(bgeo(0.004, 0.022, 0.006), metal, 0, cy + 0.022, cf - 0.03);         // 准星
      add(bgeo(0.024, 0.02, 0.014), metal, 0, railY + 0.04, zRear - 0.025);    // 后照门
      info.sight.set(0, cy + 0.026, zRear + 0.12);
    }
  }
  // 瞄具
  info.optic = optic || 'iron';
  const oz = zRear - recv * 0.45;
  if (optic === 'reddot') {
    // 与手枪红点同款：开放式框架 + 小镜片（镜筒会在 ADS 时形成一圈黑边）
    const ry = sightY + 0.002;
    add(bgeo(0.032, 0.008, 0.045), metal, 0, railY + 0.016 + opticLift, oz);
    add(bgeo(0.005, 0.038, 0.014), metal, -0.019, ry, oz - 0.016);
    add(bgeo(0.005, 0.038, 0.014), metal, 0.019, ry, oz - 0.016);
    add(bgeo(0.043, 0.005, 0.014), metal, 0, ry + 0.0215, oz - 0.016);
    add(new THREE.PlaneGeometry(0.032, 0.03), mat('lens'), 0, ry, oz - 0.016);
    // 底座螺钉 + 俯仰/风偏调节旋钮
    det(bgeo(0.005, 0.005, 0.02), dark, -0.011, railY + 0.006 + opticLift, oz - 0.008);
    det(bgeo(0.005, 0.005, 0.02), dark, 0.011, railY + 0.006 + opticLift, oz - 0.008);
    det(cgeo(0.006, 0.006, 0.008, 12), steel, 0, ry + 0.026, oz - 0.016, Math.PI / 2);
    det(cgeo(0.005, 0.005, 0.008, 12), steel, 0.024, ry, oz - 0.016, 0, 0, Math.PI / 2);
    // 红点贴在镜片后面，按瞄具到眼睛的距离等比缩小，和手枪红点观感一致
    info.reticle = add(new THREE.CircleGeometry(0.00045, 10), mat('reticle'), 0, ry, oz - 0.017);
    info.reticle.renderOrder = 10;
    info.sight.set(0, ry, oz + 0.1);
  } else if (optic === 'holo') {
    add(bgeo(0.04, 0.016, 0.07), metal, 0, railY + 0.02 + opticLift, oz);
    add(bgeo(0.005, 0.04, 0.05), metal, -0.021, sightY + 0.005, oz - 0.01);
    add(bgeo(0.005, 0.04, 0.05), metal, 0.021, sightY + 0.005, oz - 0.01);
    add(bgeo(0.047, 0.005, 0.05), metal, 0, sightY + 0.026, oz - 0.01);
    add(new THREE.PlaneGeometry(0.036, 0.034), mat('lens'), 0, sightY + 0.004, oz - 0.03);
    // 全息镜的电池仓、亮度按键和调节旋钮
    det(bgeo(0.02, 0.012, 0.03), metal, 0.026, railY + 0.024 + opticLift, oz + 0.005);
    det(cgeo(0.005, 0.005, 0.006, 12), steel, -0.022, railY + 0.024 + opticLift, oz + 0.01, 0, 0, Math.PI / 2);
    det(cgeo(0.0065, 0.0065, 0.007, 12), steel, 0, sightY + 0.032, oz - 0.01, Math.PI / 2);
    const ret = new THREE.Group(); ret.position.set(0, sightY, oz - 0.031); root.add(ret);
    add(new THREE.RingGeometry(0.0045, 0.0052, 24), mat('reticle'), 0, 0, 0, 0, 0, 0, ret);
    add(new THREE.CircleGeometry(0.0007, 8), mat('reticle'), 0, 0, 0, 0, 0, 0, ret);
    // 最后绘制，避免被半透明镜片压暗；depthTest 仍开启，镜框可正常遮挡
    ret.traverse(o => { if (o.isMesh) o.renderOrder = 10; });
    info.reticle = ret;
    info.sight.set(0, sightY, oz + 0.12);
  } else if (optic === 'acog' || optic === 'thermal') {
    add(bgeo(0.03, 0.02, 0.05), metal, 0, railY + 0.02 + opticLift, oz);
    add(cgeo(0.019, 0.019, 0.12, SEG), metal, 0, sightY + 0.005, oz);
    add(cgeo(0.024, 0.019, 0.03, SEG), metal, 0, sightY + 0.005, oz - 0.07);
    add(cgeo(0.022, 0.019, 0.025, SEG), metal, 0, sightY + 0.005, oz + 0.065);
    if (optic === 'thermal') {
      add(bgeo(0.03, 0.03, 0.05), mat('gunPoly'), 0.025, sightY + 0.005, oz + 0.02);
      det(bgeo(0.016, 0.014, 0.02), mat('gunPoly'), -0.026, sightY + 0.008, oz + 0.015);
    }
    // 镜筒防滑纹 + 顶部/侧面调节旋钮 + 镜片镀膜圈
    for (let i = 0; i < 3; i++) det(cgeo(0.0202, 0.0202, 0.004, SEG), dark, 0, sightY + 0.005, oz + 0.03 - i * 0.02);
    det(cgeo(0.007, 0.007, 0.01, 12), steel, 0, sightY + 0.028, oz + 0.005, Math.PI / 2);
    det(cgeo(0.006, 0.006, 0.01, 12), steel, 0.024, sightY + 0.005, oz + 0.005, 0, 0, Math.PI / 2);
    det(new THREE.RingGeometry(0.0195, 0.0215, SEG), steel, 0, sightY + 0.005, oz - 0.0865);
    add(new THREE.CircleGeometry(0.02, SEG), mat('lensDark'), 0, sightY + 0.005, oz - 0.086);
    info.sight.set(0, sightY + 0.005, oz + 0.14);
  } else if (optic === 'sniper') {
    const sy = sightY + 0.018;
    add(bgeo(0.02, 0.03, 0.02), metal, 0, railY + 0.02 + opticLift, oz - 0.06);
    add(bgeo(0.02, 0.03, 0.02), metal, 0, railY + 0.02 + opticLift, oz + 0.06);
    add(cgeo(0.016, 0.016, 0.26, SEG), metal, 0, sy, oz);
    add(cgeo(0.028, 0.017, 0.08, SEG), metal, 0, sy, oz - 0.15);
    add(cgeo(0.022, 0.016, 0.05, SEG), metal, 0, sy, oz + 0.14);
    add(cgeo(0.02, 0.02, 0.03, 12), metal, 0, sy + 0.025, oz, Math.PI / 2);
    // 镜环、调焦环、目镜防滑纹
    det(cgeo(0.0185, 0.0185, 0.008, SEG), dark, 0, sy, oz - 0.05);
    det(cgeo(0.0185, 0.0185, 0.008, SEG), dark, 0, sy, oz + 0.05);
    det(cgeo(0.0198, 0.0198, 0.006, SEG), dark, 0, sy, oz + 0.108);
    det(cgeo(0.0185, 0.0185, 0.006, SEG), dark, 0, sy, oz + 0.126);
    det(cgeo(0.0265, 0.0265, 0.012, SEG), metal, 0, sy, oz - 0.185);
    add(new THREE.CircleGeometry(0.027, SEG), mat('lensDark'), 0, sy, oz - 0.191);
    info.sight.set(0, sy, oz + 0.2);
  }
  // 激光
  if (att.laser) {
    add(bgeo(0.022, 0.025, 0.06), mat('gunPoly'), 0.038, 0.03, hz1 + 0.05);
    addLaser(add, 0.038, 0.03, hz1 + 0.019);
  }
  // 下挂
  if (att.under === 'vgrip') add(bgeo(0.03, 0.09, 0.03), mat('gunPoly'), 0, -0.035, hz0 - hand * 0.55);
  else if (att.under === 'agrip') add(bgeo(0.03, 0.035, 0.08), mat('gunPoly'), 0, -0.01, hz0 - hand * 0.5, -0.4);
  else if (att.under === 'bipod') {
    add(bgeo(0.035, 0.02, 0.03), metal, 0, -0.005, hz1 + 0.03);
    add(cgeo(0.006, 0.006, 0.16), metal, -0.012, -0.015, hz1 + 0.1, -0.12);
    add(cgeo(0.006, 0.006, 0.16), metal, 0.012, -0.015, hz1 + 0.1, -0.12);
  }
  if (att.under) info.leftHand.set(0, -0.06, hz0 - hand * 0.55);
  // 握把
  const gripM = att.rear === 'rubber' ? mat('rubber') : furnBase === mat('gunWood') ? mat('gunPoly') : furnBase;
  if (M.grip === 'p90') {
    // P90 的拇指孔握把：前后两根支柱 + 底部连桥
    add(bgeo(0.042, 0.095, 0.028), gripM, 0, -0.038, -0.04, 0.15);
    add(bgeo(0.042, 0.095, 0.028), gripM, 0, -0.038, 0.075, -0.2);
    add(bgeo(0.044, 0.02, 0.11), gripM, 0, -0.085, 0.018);
  } else if (M.grip === 'sniper') {
    const gg = new THREE.Group(); gg.position.set(0, -0.035, bullpup ? -0.02 : 0.07); gg.rotation.x = 0.35; root.add(gg);
    add(bgeo(0.03, 0.09, 0.045), gripM, 0, 0, 0, 0, 0, 0, gg);
    if (!low) { for (let i = 0; i < 3; i++) add(bgeo(0.032, 0.006, 0.004), mat('rubber'), 0, -0.022 + i * 0.02, -0.024, 0, 0, 0, gg); add(bgeo(0.031, 0.008, 0.047), dark, 0, -0.046, 0, 0, 0, 0, gg); }
  } else {
    const gz = bullpup ? -0.03 : 0.035, gr = bullpup ? 0.18 : 0.3;
    const gg = new THREE.Group(); gg.position.set(0, -0.04, gz); gg.rotation.x = gr; root.add(gg);
    add(bgeo(0.028, 0.095, 0.04), gripM, 0, 0, 0, 0, 0, 0, gg);
    if (!low) {
      for (let i = 0; i < 3; i++) add(bgeo(0.03, 0.006, 0.004), mat('rubber'), 0, -0.03 + i * 0.022, -0.021, 0, 0, 0, gg);
      add(bgeo(0.03, 0.008, 0.044), dark, 0, -0.048, 0, 0, 0, 0, gg);
    }
  }
  add(bgeo(0.006, 0.006, 0.07), metal, 0, -0.032, bullpup ? -0.055 : -0.005); // 扳机护圈
  det(bgeo(0.006, 0.022, 0.008), steel, 0, -0.026, bullpup ? -0.045 : 0.005, 0.28); // 扳机
  // 弹匣
  const magG = new THREE.Group();
  magG.position.set(0, topMag ? railY + 0.033 : -0.01, topMag ? -recv * 0.25 : (bullpup ? 0.14 : -0.035));
  root.add(magG);
  info.mag = magG;
  const ext = att.mag === 'ext' ? 1.45 : 1;
  const mm = mat('gunMetal');
  if (att.mag === 'drum') {
    add(cgeo(0.075, 0.075, 0.07, 20), mm, 0, -0.1, 0, 0, Math.PI / 2, 0, magG);
    add(bgeo(0.028, 0.06, 0.05), mm, 0, -0.03, 0, 0, 0, 0, magG);
  } else if (M.mag === 'top') {
    // P90 顶置 50 发弹匣：横跨枪身顶部
    add(bgeo(0.05, 0.032, recv * 1.5), mat('gunPoly'), 0, 0, 0, 0, 0, 0, magG);
    add(bgeo(0.052, 0.006, recv * 1.5), mat('rubber'), 0, 0.019, 0, 0, 0, 0, magG);
  } else if (M.mag === 'straight' || M.mag === 'pistol_long') {
    const L = (M.mag === 'pistol_long' ? 0.15 : 0.17) * ext;
    const tilt = bullpup ? -0.06 : 0.12;
    add(bgeo(0.026, L, 0.065), M.color === 'tan' && M.mag === 'straight' ? mat('gunTan') : mm, 0, -L / 2, 0, tilt, 0, 0, magG);
    if (att.mag === 'fast') add(bgeo(0.026, L, 0.065), mm, 0.03, -L / 2, 0, tilt, 0, 0, magG);
    det(bgeo(0.03, 0.014, 0.07), dark, 0, -L + 0.004, 0, tilt, 0, 0, magG);              // 底板
    det(bgeo(0.004, L * 0.55, 0.018), steel, 0.0135, -L * 0.52, 0, tilt, 0, 0, magG);    // 侧面加强筋
    det(bgeo(0.004, 0.008, 0.02), dark, 0.0145, -L * 0.18, 0, tilt, 0, 0, magG);         // 观察孔
  } else if (M.mag === 'curved' || M.mag === 'curved_small') {
    const n = Math.round((M.mag === 'curved_small' ? 4 : 5) * ext);
    const seg = 0.04;
    const magM = weaponId === 'ak' || weaponId === 'qbz03' ? mat('containerOrange') : mm;
    for (let i = 0; i < n; i++) {
      const a = i * 0.1 + 0.1;
      add(bgeo(0.026, seg + 0.004, 0.06 - (M.mag === 'curved_small' ? 0.02 : 0)), magM === mm ? mm : mat('gunMetal'), 0, -i * seg * 0.98 - seg / 2, -i * i * 0.004 - i * 0.008, a, 0, 0, magG);
    }
    if (att.mag === 'fast') for (let i = 0; i < n; i++) add(bgeo(0.026, seg + 0.004, 0.06), mm, 0.03, -i * seg * 0.98 - seg / 2, -i * i * 0.004 - i * 0.008, i * 0.1 + 0.1, 0, 0, magG);
    // 弹匣底板与侧壁加强筋
    det(bgeo(0.03, 0.012, 0.062), dark, 0, -(n - 1) * seg * 0.98 - seg + 0.002, -(n - 1) * (n - 1) * 0.004 - (n - 1) * 0.008, n * 0.1, 0, 0, magG);
    det(bgeo(0.0035, n * seg * 0.8, 0.014), steel, 0.0138, -n * seg * 0.45, -n * n * 0.0015, n * 0.05, 0, 0, magG);
  } else if (M.mag === 'drum') {
    // 95 班机的圆形弹鼓
    add(cgeo(0.085, 0.085, 0.065, 20), mat('gunGreen'), 0, -0.09, 0, 0, Math.PI / 2, 0, magG);
    add(cgeo(0.03, 0.03, 0.075, 16), mm, 0, -0.02, 0, 0, Math.PI / 2, 0, magG);
  } else if (M.mag === 'belt') {
    // M249 弹链箱 + 供弹链
    add(bgeo(0.095, 0.11, 0.135), mat('gunGreen'), -0.05, -0.075, 0, 0, 0, 0, magG);
    add(bgeo(0.03, 0.02, 0.11), mm, 0.02, 0.03, 0, 0, 0, 0, magG);
    add(bgeo(0.02, 0.012, 0.1), mat('brass'), 0.01, 0.045, -0.02, 0.5, 0, 0, magG);
  } else if (M.mag === 'box') {
    add(bgeo(0.1, 0.11, 0.12), mat('gunGreen'), -0.03, -0.07, 0, 0, 0, 0, magG);
    add(bgeo(0.03, 0.02, 0.1), mm, 0.02, 0.03, 0, 0, 0, 0, magG);
  } else if (M.mag === 'box5' || M.mag === 'box10') {
    const L = (M.mag === 'box10' ? 0.07 : 0.06) * ext;
    add(bgeo(0.03, L, 0.08), mm, 0, -L / 2, 0, 0, 0, 0, magG);
    if (att.mag === 'fast') add(bgeo(0.03, L, 0.08), mm, 0.035, -L / 2, 0, 0, 0, 0, magG);
  } else if (M.mag === 'tube') {
    magG.position.set(0, -0.02, -0.03);
    add(bgeo(0.02, 0.012, 0.03), mat('brass'), 0, 0, 0, 0, 0, 0, magG);
  }
  // 枪托
  const st = att.stock || null;
  const sz = zRear;
  if (bullpup) {
    // 无托布局：机匣直接延伸成一体式枪托
    add(bgeo(0.05, 0.075, 0.15), furn, 0, 0.025, sz + 0.085);
    add(bgeo(0.054, 0.1, 0.02), mat('rubber'), 0, 0.012, sz + 0.17);
    add(bgeo(0.03, 0.014, 0.08), furn, 0, railY + 0.012, sz + 0.05); // 贴腮板
  } else if (st === 'none') {
    add(bgeo(0.03, 0.04, 0.03), metal, 0, 0.03, sz + 0.015);
  } else {
    const kind = st === 'heavy' ? 'heavy' : st === 'tac' ? 'tac' : M.stock;
    const sm = furn;
    if (kind === 'm4' || kind === 'tac') {
      add(cgeo(0.016, 0.016, 0.2, SEG), metal, 0, 0.03, sz + 0.1);
      add(bgeo(0.045, 0.09, 0.14), sm, 0, 0.005, sz + 0.2);
      add(bgeo(0.047, 0.1, 0.02), mat('rubber'), 0, 0.0, sz + 0.28);
      if (kind === 'tac') add(bgeo(0.03, 0.03, 0.1), sm, 0, 0.06, sz + 0.2);
      // 缓冲管调节孔 + 托底 QD 背带环 + 贴腮板螺钉
      for (let i = 0; i < 4; i++) det(cgeo(0.003, 0.003, 0.004, 8), dark, 0, 0.03, sz + 0.035 + i * 0.035, 0, 0, Math.PI / 2);
      det(cgeo(0.0055, 0.0055, 0.005, 10), steel, -0.022, -0.01, sz + 0.285, 0, 0, Math.PI / 2);
      det(bgeo(0.005, 0.005, 0.008), steel, 0.021, 0.03, sz + 0.19);
    } else if (kind === 'ak' || kind === 'fixed') {
      const g = new THREE.Group(); g.position.set(0, 0.015, sz); g.rotation.x = kind === 'ak' ? -0.12 : -0.06; root.add(g);
      add(bgeo(0.042, 0.06, 0.2), sm, 0, 0, 0.1, 0, 0, 0, g);
      add(bgeo(0.044, 0.11, 0.12), sm, 0, -0.02, 0.24, 0, 0, 0, g);
      add(bgeo(0.046, 0.12, 0.015), mat('gunPoly'), 0, -0.02, 0.305, 0, 0, 0, g);
      // 托底钢制底板 + 固定螺钉 + 背带环
      det(bgeo(0.042, 0.1, 0.01), steel, 0, -0.02, 0.312, 0, 0, 0, g);
      det(cgeo(0.004, 0.004, 0.006, 8), dark, 0, -0.02, 0.318, 0, 0, Math.PI / 2, g);
      det(cgeo(0.006, 0.006, 0.004, 8), steel, -0.026, 0.02, 0.3, Math.PI / 2, 0, 0, g);
    } else if (kind === 'mp5') {
      add(bgeo(0.008, 0.008, 0.22), metal, -0.02, 0.04, sz + 0.11);
      add(bgeo(0.008, 0.008, 0.22), metal, 0.02, 0.04, sz + 0.11);
      add(bgeo(0.05, 0.08, 0.02), metal, 0, 0.02, sz + 0.22);
      det(bgeo(0.05, 0.02, 0.025), dark, 0, -0.012, sz + 0.22);
    } else if (kind === 'scar') {
      add(bgeo(0.045, 0.06, 0.12), sm, 0, 0.035, sz + 0.06);
      add(bgeo(0.045, 0.11, 0.1), sm, 0, 0.01, sz + 0.17);
      add(bgeo(0.048, 0.12, 0.02), mat('rubber'), 0, 0.01, sz + 0.23);
      det(cgeo(0.0055, 0.0055, 0.005, 10), steel, 0, 0.005, sz + 0.238, 0, 0, Math.PI / 2);
      det(bgeo(0.004, 0.016, 0.06), dark, 0.023, 0.02, sz + 0.14);
    } else if (kind === 'skeleton') {
      // 191 式镂空枪托：上下两根梁 + 中空 + 橡胶托底
      add(bgeo(0.042, 0.028, 0.22), sm, 0, 0.052, sz + 0.12);
      add(bgeo(0.042, 0.024, 0.22), sm, 0, -0.022, sz + 0.12);
      add(bgeo(0.044, 0.09, 0.018), sm, 0, 0.014, sz + 0.23);
      add(bgeo(0.048, 0.02, 0.08), sm, 0, 0.062, sz + 0.02);
      add(bgeo(0.05, 0.11, 0.02), mat('rubber'), 0, 0.012, sz + 0.245);
      det(bgeo(0.03, 0.014, 0.06), dark, 0, 0.01, sz + 0.11);
      det(cgeo(0.005, 0.005, 0.005, 8), steel, -0.026, 0.014, sz + 0.25, 0, 0, Math.PI / 2);
    } else if (kind === 'fold') {
      // 折叠骨架托：两侧细金属管 + 托底板
      add(cgeo(0.01, 0.012, 0.24, 8), metal, -0.019, 0.045, sz + 0.12, 0, 0, Math.PI / 2);
      add(cgeo(0.01, 0.012, 0.24, 8), metal, 0.019, 0.045, sz + 0.12, 0, 0, Math.PI / 2);
      add(bgeo(0.046, 0.085, 0.018), mat('rubber'), 0, 0.02, sz + 0.24);
      add(bgeo(0.022, 0.02, 0.03), metal, 0, 0.045, sz + 0.015);
      det(bgeo(0.012, 0.03, 0.02), dark, 0, 0.045, sz + 0.02);
    } else if (kind === 'mp7') {
      // MP7 短伸缩托
      add(cgeo(0.009, 0.009, 0.13, 10), metal, -0.016, 0.04, sz + 0.07);
      add(cgeo(0.009, 0.009, 0.13, 10), metal, 0.016, 0.04, sz + 0.07);
      add(bgeo(0.04, 0.075, 0.02), mat('rubber'), 0, 0.02, sz + 0.135);
      det(bgeo(0.045, 0.012, 0.016), dark, 0, 0.02, sz + 0.142);
    } else if (kind === 'p90') {
      // P90 尾部托垫
      add(bgeo(0.052, 0.07, 0.02), mat('rubber'), 0, 0.01, sz + 0.02);
    } else if (kind === 'sniper' || kind === 'heavy') {
      add(bgeo(0.05, 0.07, 0.26), sm, 0, 0.01, sz + 0.13);
      add(bgeo(0.05, 0.13, 0.12), sm, 0, -0.01, sz + 0.24);
      add(bgeo(0.04, 0.025, 0.14), sm, 0, 0.06, sz + 0.16);
      add(bgeo(0.052, 0.14, 0.02), mat('rubber'), 0, -0.01, sz + 0.31);
      // 贴腮板调节螺钉 + 托底缓冲垫分缝 + 背带环
      det(bgeo(0.006, 0.012, 0.006), steel, 0, 0.075, sz + 0.1);
      det(bgeo(0.006, 0.012, 0.006), steel, 0, 0.075, sz + 0.22);
      for (let i = 0; i < 3; i++) det(bgeo(0.05, 0.003, 0.004), dark, 0, -0.012 + i * 0.02, sz + 0.322);
      det(cgeo(0.0055, 0.0055, 0.005, 10), steel, -0.026, 0.01, sz + 0.18, 0, 0, Math.PI / 2);
    }
  }
  root.add(info.muzzle);
  return info;
}

function addLaser(add, x, y, z) {
  add(new THREE.CircleGeometry(0.004, 8), mat('laserDot'), x, y, z, 0, Math.PI, 0);
}

// 第一人称手臂
export function buildArms(gunInfo, sleeveMat) {
  const g = new THREE.Group();
  const glove = mat('glove');
  const limb = (a, b, r, m) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const geo = new THREE.CapsuleGeometry(r, len, 4, 10);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(mesh);
    return mesh;
  };
  // 右手（握把）
  const rh = new THREE.Vector3(0.0, -0.035, 0.05);
  const re = new THREE.Vector3(0.1, -0.16, 0.22);
  const rs = new THREE.Vector3(0.16, -0.3, 0.5);
  limb(rh, re, 0.032, glove);
  limb(re.clone().lerp(rh, 0.35), re, 0.042, sleeveMat);
  limb(re, rs, 0.055, sleeveMat);
  const rhand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.09), glove); rhand.position.copy(rh).add(new THREE.Vector3(0.012, 0, 0)); g.add(rhand);
  // 左手（护木）
  const lh = gunInfo.leftHand.clone().add(new THREE.Vector3(-0.012, -0.015, 0));
  const le = new THREE.Vector3(-0.14, -0.14, lh.z + 0.2);
  const ls = new THREE.Vector3(-0.22, -0.3, lh.z + 0.55);
  limb(lh, le, 0.032, glove);
  limb(le.clone().lerp(lh, 0.3), le, 0.042, sleeveMat);
  limb(le, ls, 0.055, sleeveMat);
  const lhand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), glove); lhand.position.copy(lh); lhand.rotation.z = 0.5; g.add(lhand);
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}
