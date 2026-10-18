// 地图定义
import * as THREE from 'three';
import { mulberry32, pick } from './util.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);

export const MAPS = {
  // ================= 沙丘镇 =================
  dune: {
    id: 'dune', name: '沙丘镇', size: 110, seed: 11, surface: 'sand', styles: ['ally', 'insurgent'],
    env: { sky: 'day', sunDir: [0.55, 0.62, 0.35], sunColor: 0xfff0d8, sun: 3.4, hemi: 0.75, sky2: 0xcfe2ff, ground: 0xb08a5a, fog: 0xd8c6a6, fogDensity: 0.0065, turbidity: 9, rayleigh: 1.3, mie: 0.006, exposure: 0.85, mountains: 'sand', envIntensity: 0.75, weather: 'dust', ambient: 'wind' },
    build(w) {
      w.ground('sand');
      w.bounds();
      // 主街道
      w.box(0, 0, 0, 104, 0.02, 9, 'dirt', { collide: false });
      // 北排建筑
      const N = [[-38, -15, 10, 10, 4.5, 'plaster'], [-24, -14, 9, 8, 4, 'plasterWhite'], [-8, -14, 12, 10, 4, 'plaster'], [8, -14, 9, 8, 5, 'plasterRed'], [22, -15, 10, 10, 4.2, 'plasterWhite'], [37, -14, 10, 8, 4.5, 'plaster']];
      N.forEach(([x, z, bw, bd, h, m], i) => {
        w.building(x, z, bw, bd, h, { mat: m, doors: { s: [i % 2 ? -1.5 : 1.5], n: [0] }, windows: { s: [i % 2 ? 2.5 : -2.5], e: [0], w: [0] }, parapet: i !== 2, roofMat: 'concreteDark', floor: 'tiles' });
      });
      // 可上的屋顶楼梯
      w.stairs(-5, -19.85, 1.4, 6, 4, 'e', 'concrete');
      // 南排
      const S = [[-37, 15, 10, 9, 4, 'plasterWhite'], [-23, 14, 9, 8, 4.6, 'plaster'], [-9, 15, 10, 9, 4, 'plasterRed'], [9, 15, 12, 9, 4.2, 'plaster'], [24, 14, 9, 8, 4, 'plasterBlue'], [38, 15, 10, 10, 4.8, 'plaster']];
      S.forEach(([x, z, bw, bd, h, m], i) => {
        w.building(x, z, bw, bd, h, { mat: m, doors: { n: [i % 2 ? 1.5 : -1.5], s: [0] }, windows: { n: [i % 2 ? -2.5 : 2.5], e: [0], w: [0] }, parapet: true, floor: 'tiles' });
      });
      // 集市摊位
      const cloths = ['clothRed', 'clothBlue', 'clothYellow', 'clothGreen'];
      [[-5, -3], [0, -3], [5, -3], [-5, 3], [0, 3], [5, 3]].forEach(([x, z], i) => {
        w.box(x, 0, z, 2.6, 0.9, 1.2, 'wood');
        w.awning(x, z + (z < 0 ? -0.2 : 0.2), 3, 1.8, 2.3, cloths[i % 4], z < 0 ? 0 : Math.PI);
        w.crate(x + 1.6, z, 0.7);
      });
      // 街道掩体
      w.car(-20, 1.5, 0.2, 0x7a6a50, true);
      w.car(16, -2, Math.PI + 0.1, 0x3a4a5a, true);
      w.jersey(-30, -2); w.jersey(30, 2);
      w.sandbags(-44, -3, 3, Math.PI / 2); w.sandbags(44, 3, 3, Math.PI / 2);
      w.crateStack(-14, 3); w.crateStack(12, -3.5);
      w.barrel(-11, -3, 'containerBlue'); w.barrel(26, 3, 'containerOrange'); w.barrel(26.7, 3.3, 'containerBlue');
      // 北部区域
      w.building(0, -38, 14, 12, 6, { mat: 'plasterWhite', doors: { s: [0], e: [2], w: [-2] }, windows: { s: [-4, 4], n: [-3, 3] }, parapet: true, floor: 'tiles' });
      const dome = w.mesh(new THREE.SphereGeometry(4.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), 'plasterBlue', 0, 6.3, -38);
      w.box(8.5, 0, -42, 2, 11, 2, 'plasterWhite');
      w.mesh(new THREE.ConeGeometry(1.3, 2.5, 8), 'plasterBlue', 8.5, 12.2, -42);
      w.wall(-30, -28, -12, -28, 2.4, 0.4, 'plaster', [{ c: 9, w: 2.5, y0: 0, y1: 2.4 }]);
      w.wall(12, -28, 30, -28, 2.4, 0.4, 'plaster', [{ c: 6, w: 2.5, y0: 0, y1: 2.4 }]);
      w.building(-32, -40, 10, 9, 4, { mat: 'plaster', doors: { e: [0], s: [2] }, windows: { n: [0] }, parapet: true });
      w.building(32, -40, 10, 9, 4, { mat: 'plasterRed', doors: { w: [0], s: [-2] }, windows: { n: [0] }, parapet: true });
      w.car(-18, -34, Math.PI / 2, 0x9a2020, false);
      w.tree(-20, -45, 1, 'palm'); w.tree(18, -46, 1.1, 'palm'); w.tree(-45, -30, 0.9, 'palm'); w.tree(46, -28, 1, 'palm');
      w.crateStack(20, -33); w.sandbags(-8, -30, 4, 0);
      // 南部区域
      w.wall(-48, 28, -14, 28, 2.2, 0.4, 'plasterWhite', [{ c: 12, w: 3, y0: 0, y1: 2.2 }, { c: 26, w: 2.4, y0: 0, y1: 2.2 }]);
      w.wall(14, 28, 48, 28, 2.2, 0.4, 'plaster', [{ c: 8, w: 3, y0: 0, y1: 2.2 }, { c: 24, w: 2.4, y0: 0, y1: 2.2 }]);
      w.building(-28, 40, 12, 10, 4.5, { mat: 'plaster', doors: { n: [0], e: [0] }, windows: { w: [0], s: [0] }, parapet: true });
      w.building(28, 40, 12, 10, 4.2, { mat: 'plasterWhite', doors: { n: [0], w: [0] }, windows: { e: [0], s: [0] }, parapet: true });
      w.car(0, 38, 0.5, 0x6a6a6a, true); w.car(-8, 33, -1.2, 0x2a3a5a, true);
      w.box(8, 0, 40, 4, 3, 4, 'concreteDark');
      w.sandbags(0, 30, 5, 0); w.barrier(-6, 44); w.barrier(6, 45, Math.PI / 2);
      w.tree(-45, 45, 1, 'palm'); w.tree(45, 45, 1, 'palm'); w.tree(14, 48, 0.9, 'palm');
      w.rock(-50, 20, 1.5, 'rock'); w.rock(50, -20, 1.8, 'rock'); w.rock(40, 25, 1.2, 'rock');
      // 出生点
      w.spawns.A = [V(-50, -3), V(-50, 3), V(-48, 8), V(-48, -8), V(-45, 22), V(-45, -22), V(-50, 0), V(-47, 36)];
      w.spawns.B = [V(50, -3), V(50, 3), V(48, 8), V(48, -8), V(45, 22), V(45, -22), V(50, 0), V(47, -36)];
      w.flagPos = [V(-36, 0), V(0, 0), V(36, 0)];
    },
  },

  // ================= 寒霜炼厂 =================
  frost: {
    id: 'frost', name: '寒霜炼厂', size: 120, seed: 21, surface: 'snow', styles: ['snowA', 'snowB'],
    env: { sky: 'day', sunDir: [-0.3, 0.35, -0.6], sunColor: 0xdde6f5, sun: 1.3, hemi: 0.8, sky2: 0xdfe8f5, ground: 0x9aa3ad, fog: 0xc4ccd6, fogDensity: 0.016, turbidity: 18, rayleigh: 0.6, mie: 0.05, exposure: 0.82, mountains: 'rockSnow', envIntensity: 0.7, weather: 'snow', ambient: 'wind' },
    build(w) {
      w.ground('snow');
      w.bounds();
      w.box(0, 0, 0, 116, 0.02, 8, 'asphalt', { collide: false });
      w.box(0, 0, 0, 8, 0.02, 116, 'asphalt', { collide: false });
      // 仓库1
      w.building(-28, -26, 26, 16, 8, { mat: 'metal', roofMat: 'metalRoof', doors: { s: [-6, 6], e: [0], w: [0], n: [0] }, windows: { n: [-8, 8] }, floor: 'concrete', light: 0xcfe0ff });
      w.box(-34, 0, -26, 6, 2.6, 2.4, 'containerBlue'); w.crateStack(-22, -28); w.crate(-26, -22, 1.2); w.box(-30, 0, -31, 8, 1.2, 1.2, 'wood');
      w.box(-20, 0, -20, 1.2, 3, 4, 'metal');
      // 仓库2
      w.building(28, 26, 22, 18, 7, { mat: 'containerGray', roofMat: 'metalRoof', doors: { n: [-5, 5], w: [0], e: [-3], s: [3] }, windows: { s: [-6] }, floor: 'concrete', light: 0xcfe0ff });
      w.box(24, 0, 28, 6, 2.6, 2.4, 'containerRed'); w.crateStack(32, 22); w.box(30, 0, 31, 1.2, 1.5, 6, 'wood');
      // 储油罐
      w.tank(20, -32, 5, 9, 'metal'); w.tank(36, -32, 4.5, 8, 'metal'); w.tank(28, -46, 4, 7, 'metal');
      w.pipe(10, -24, 44, -24, 3.2, 0.35); w.pipe(12, -38, 12, -50, 1.2, 0.5);
      // 行政楼
      w.building(-30, 26, 16, 10, 4, { mat: 'brick', doors: { n: [0], e: [0] }, windows: { n: [-5, 5], s: [-4, 0, 4], w: [0] }, parapet: true, floor: 'tiles', light: 0xffd9a0 });
      w.building(-30, 42, 10, 8, 3.6, { mat: 'brickDark', doors: { n: [2], w: [0] }, windows: { e: [0] }, parapet: true });
      // 集装箱区
      const cols = ['containerRed', 'containerBlue', 'containerGreen', 'containerOrange', 'containerGray', 'containerYellow'];
      const r = mulberry32(5);
      [[-10, -10, 0], [-10, -16, 0], [12, 10, Math.PI / 2], [16, 12, Math.PI / 2], [-14, 12, 0], [8, -12, Math.PI / 2], [-45, 0, Math.PI / 2], [46, 0, Math.PI / 2], [0, 44, 0], [4, -46, 0]].forEach(([x, z, rot]) => w.container(x, z, rot, cols[Math.floor(r() * cols.length)]));
      w.container(-10, -10, 0, 'containerYellow', 2.6);
      w.container(16, 12, Math.PI / 2, 'containerGreen', 2.6);
      w.jersey(-6, 5); w.jersey(6, -5); w.jersey(20, 3, Math.PI / 2); w.jersey(-20, -3, Math.PI / 2);
      w.sandbags(0, 14, 4); w.sandbags(0, -14, 4);
      w.truck(-6, 30, Math.PI / 2, 0x8a8f94); w.truckCollider(-6, 30, Math.PI / 2);
      w.car(40, 8, 0.1, 0x223344); w.car(-40, -8, Math.PI, 0x552222);
      w.pipe(-50, 12, -16, 12, 2.8, 0.3);
      for (let i = 0; i < 22; i++) {
        const a = r() * Math.PI * 2, d = 50 + r() * 7;
        w.tree(Math.cos(a) * d, Math.sin(a) * d, 0.9 + r() * 0.5, 'pineSnow');
      }
      w.tree(-8, 50, 1.2, 'pineSnow'); w.tree(40, 46, 1.1, 'pineSnow'); w.tree(-50, -44, 1.3, 'pineSnow');
      w.rock(-20, 45, 1.6, 'rockSnow'); w.rock(46, -12, 1.4, 'rockSnow'); w.rock(-48, 30, 1.2, 'rockSnow');
      w.lampPost(-4, 20, 0xcfe0ff, Math.PI / 2, 12); w.lampPost(4, -22, 0xcfe0ff, -Math.PI / 2, 12);
      w.spawns.A = [V(-54, -4), V(-54, 4), V(-52, 14), V(-52, -14), V(-50, 34), V(-50, -38), V(-54, 22)];
      w.spawns.B = [V(54, -4), V(54, 4), V(52, 14), V(52, -14), V(50, 38), V(50, -38), V(54, -22)];
      w.flagPos = [V(-30, 8), V(0, 0), V(30, -8)];
    },
  },

  // ================= 霓虹街区 =================
  neon: {
    id: 'neon', name: '霓虹街区', size: 100, seed: 31, surface: 'wet', night: false, styles: ['ally', 'urbanB'],
    env: { sky: 'night', sunDir: [-0.35, 0.65, -0.45], sunColor: 0x8ea8ff, sun: 0.45, hemi: 1.1, sky2: 0x505a90, ground: 0x2a2020, fog: 0x1a1630, fogDensity: 0.022, exposure: 1.45, envIntensity: 1.0, weather: 'rain', skyTop: 0x05060d, skyHorizon: 0x1e1830, cityGlow: 0x4a2050, ambient: 'rain' },
    build(w) {
      w.ground('asphaltWet');
      w.bounds();
      // 人行道
      const sw = (x, z, sx, sz) => w.box(x, 0, z, sx, 0.15, sz, 'sidewalk');
      sw(-28, -8, 44, 3); sw(28, -8, 44, 3); sw(-28, 8, 44, 3); sw(28, 8, 44, 3);
      sw(-8, -28, 3, 38); sw(8, -28, 3, 38); sw(-8, 28, 3, 38); sw(8, 28, 3, 38);
      // 车道线
      for (let i = -48; i < 48; i += 6) { w.box(i, 0.005, 0, 3, 0.01, 0.15, 'yellowPaint', { collide: false }); w.box(0, 0.005, i, 0.15, 0.01, 3, 'yellowPaint', { collide: false }); }
      for (let i = -4; i <= 4; i += 1.2) { w.box(i, 0.005, -11.5, 0.6, 0.01, 3, 'whitePaint', { collide: false }); }
      const lit = () => Math.random() < 0.35 ? 'windowLit' : 'windowDark';
      // 西北
      w.building(-15, -15, 10, 8, 4.5, { mat: 'concrete', doors: { s: [0], e: [0] }, windows: { s: [-3.2, 3.2], n: [0] }, floor: 'tiles', light: 0xffc890 });
      w.block(-15, -33, 12, 22, 20, 'brickDark', { windows: true, windowMat: lit });
      w.block(-38, -18, 14, 16, 16, 'concrete', { windows: true, windowMat: lit });
      w.block(-40, -40, 16, 24, 16, 'brick', { windows: true, windowMat: lit });
      w.box(-27, 0, -20, 1.5, 1.4, 3, 'containerGreen'); w.crate(-26, -28, 1); w.box(-27.5, 0, -34, 2, 1.2, 1.2, 'darkMetal');
      // 东北
      w.block(18, -18, 16, 18, 16, 'concrete', { windows: true, windowMat: lit });
      w.building(38, -15, 12, 10, 4.2, { mat: 'brick', doors: { s: [0], w: [0] }, windows: { s: [-3.5, 3.5] }, floor: 'tiles', light: 0x9ad0ff });
      w.block(36, -38, 18, 26, 18, 'brickDark', { windows: true, windowMat: lit });
      w.block(16, -42, 12, 12, 12, 'concrete', { windows: true, windowMat: lit });
      w.box(27, 0, -30, 2, 1.4, 1.5, 'containerBlue'); w.crateStack(26, -25);
      // 西南
      w.block(-18, 18, 16, 20, 16, 'brick', { windows: true, windowMat: lit });
      w.building(-38, 15, 12, 10, 4.2, { mat: 'concreteDark', doors: { n: [0], e: [0] }, windows: { n: [-3.5, 3.5] }, floor: 'tiles', light: 0xff9ad0 });
      w.block(-38, 38, 18, 14, 16, 'concrete', { windows: true, windowMat: lit });
      w.car(-20, 36, 0.05, 0x1a1a1a); w.car(-14, 40, 0.1, 0x6a1010); w.car(-18, 44, Math.PI / 2, 0xd0d0d0);
      // 东南 广场
      w.box(28, 0, 28, 3, 0.6, 3, 'concrete'); // 喷泉底座
      w.mesh(new THREE.CylinderGeometry(3, 3.2, 0.6, 24), 'concrete', 22, 0.3, 22);
      w.collider(19.5, 0, 19.5, 24.5, 0.6, 24.5);
      w.mesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 12), 'concrete', 22, 1.3, 22);
      [[14, 16], [30, 16], [14, 32], [36, 26], [26, 38]].forEach(([x, z]) => w.tree(x, z, 1, 'broad'));
      w.box(20, 0, 32, 4, 0.5, 0.6, 'wood'); w.box(32, 0, 20, 0.6, 0.5, 4, 'wood');
      w.building(40, 40, 10, 10, 4, { mat: 'concrete', doors: { n: [0], w: [0] }, windows: { n: [3] }, floor: 'tiles', light: 0xa0ffd0 });
      w.box(30, 0, 44, 6, 1.1, 0.5, 'concrete'); w.box(44, 0, 28, 0.5, 1.1, 6, 'concrete');
      // 街道车辆与掩体
      w.car(-30, -4, Math.PI / 2 + 0.1, 0x202a40); w.car(-2.5, -24, 0.05, 0xb8b020); w.car(3, 22, Math.PI - 0.1, 0x303030);
      w.car(26, 4, -Math.PI / 2, 0x8a1010); w.car(-44, 4, Math.PI / 2, 0x506070);
      // 公交车
      w.box(3.5, 0, -38, 2.6, 3, 11, 'containerOrange'); w.box(3.5, 1.4, -38, 2.65, 1, 10.5, 'windowLit', { collide: false });
      w.jersey(-18, 0, Math.PI / 2); w.jersey(18, 0, Math.PI / 2); w.jersey(0, 16); w.jersey(0, -16);
      w.barrier(-8.5, -3); w.barrier(8.5, 3);
      // 霓虹
      w.neon(-10.4, 5.5, -15, 4, 1.4, 0xff2aa0, Math.PI / 2);
      w.neon(-15, 5.6, -10.9, 5, 1.2, 0x20e0ff, 0);
      w.neon(32.7, 5, -15, 4, 1.2, 0xffe020, -Math.PI / 2);
      w.neon(-38, 5.5, 9.9, 5, 1.3, 0xa040ff, Math.PI);
      w.neon(-9.9, 8, 18, 5, 2, 0xff3040, Math.PI / 2);
      w.neon(9.9, 9, -18, 5, 2, 0x30ff90, -Math.PI / 2);
      w.neon(40, 4.8, 34.9, 4, 1, 0x20e0ff, Math.PI);
      // 灯光
      w.lampPost(-10.5, -30, 0xffd0a0, Math.PI / 2, 16); w.lampPost(10.5, 30, 0xffd0a0, -Math.PI / 2, 16);
      w.lampPost(-30, 10.5, 0xffd0a0, Math.PI, 16); w.lampPost(30, -10.5, 0xffd0a0, 0, 16);
      w.pointLight(-10.5, 5, -14, 0xff2aa0, 8, 14); w.pointLight(10.5, 8, -18, 0x30ff90, 8, 14);
      w.pointLight(-10.5, 7, 18, 0xff3040, 8, 14); w.pointLight(-38, 5, 9, 0xa040ff, 8, 12);
      w.spawns.A = [V(-46, -3), V(-46, 3), V(-44, -12), V(-44, 12), V(-30, 46), V(-46, 26), V(-30, -46)];
      w.spawns.B = [V(46, -3), V(46, 3), V(44, -12), V(44, 12), V(30, 46), V(46, 20), V(46, -26)];
      w.flagPos = [V(-28, 0), V(0, 0), V(26, 26)];
    },
  },

  // ================= 货柜场 =================
  yard: {
    id: 'yard', name: '货柜场', size: 56, seed: 41, surface: 'concrete', styles: ['ally', 'enemy'],
    env: { sky: 'day', sunDir: [-0.8, 0.14, 0.35], sunColor: 0xffa060, sun: 2.8, hemi: 0.55, sky2: 0x9a90c0, ground: 0x6a4a3a, fog: 0xc89070, fogDensity: 0.01, turbidity: 10, rayleigh: 3, mie: 0.02, exposure: 0.8, mountains: 'rock', envIntensity: 0.7, ambient: 'wind' },
    build(w) {
      w.ground('concrete');
      w.bounds();
      const cols = ['containerRed', 'containerBlue', 'containerGreen', 'containerOrange', 'containerGray', 'containerYellow'];
      const r = mulberry32(9);
      const grid = [];
      for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
        if (gx === 0 && gz === 0) continue;
        if (Math.abs(gx) === 2 && gz === 0) continue;
        grid.push([gx * 9 + (r() - 0.5) * 2, gz * 9 + (r() - 0.5) * 2, r() < 0.5 ? 0 : Math.PI / 2]);
      }
      grid.forEach(([x, z, rot], i) => {
        w.container(x, z, rot, cols[i % cols.length]);
        if (r() < 0.3) w.container(x, z, rot, cols[(i + 3) % cols.length], 2.6);
      });
      for (let i = 0; i < 10; i++) w.crate((r() - 0.5) * 44, (r() - 0.5) * 44, 1.1 + r() * 0.3, 0, r());
      w.crateStack(-3, 3); w.crateStack(2, -4);
      // 龙门吊
      for (const x of [-26, 26]) {
        w.box(x, 0, -24, 1, 14, 1, 'yellowPaint'); w.box(x, 0, 24, 1, 14, 1, 'yellowPaint');
        w.box(x, 14, 0, 1.2, 1.2, 50, 'yellowPaint');
      }
      w.box(0, 14, -24, 53, 1.2, 1.2, 'yellowPaint', { collide: false }); w.box(0, 14, 24, 53, 1.2, 1.2, 'yellowPaint', { collide: false });
      w.lampPost(0, -26, 0xffd8a0, 0, 10, true);
      w.spawns.A = [V(-25, -8), V(-25, 0), V(-25, 8), V(-22, -20), V(-22, 20)];
      w.spawns.B = [V(25, -8), V(25, 0), V(25, 8), V(22, -20), V(22, 20)];
      w.flagPos = [V(-18, 0), V(0, 0), V(18, 0)];
    },
  },

  // ================= 边境机场 =================
  // 400×400，面积约为寒霜炼厂（120×120）的 11 倍；三条进攻轴线：跑道 / 航站楼 / 货运区
  airfield: {
    id: 'airfield', name: '边境机场', size: 400, seed: 61, surface: 'sand', styles: ['ally', 'enemy'],
    env: { sky: 'day', sunDir: [-0.7, 0.28, 0.3], sunColor: 0xffd6a8, sun: 2.6, hemi: 0.75, sky2: 0x9fb8d8, ground: 0x7a6a52, fog: 0xc8b8a4, fogDensity: 0.0026, turbidity: 7, rayleigh: 2.4, mie: 0.008, exposure: 0.88, mountains: 'sand', envIntensity: 0.7, weather: 'dust', ambient: 'wind' },
    build(w) {
      w.ground('sand');
      w.bounds();
      const r = mulberry32(61);

      // ---------- 场地 ----------
      // 主跑道（东西向）
      w.box(-5, 0, 10, 310, 0.04, 26, 'asphalt', { collide: false });
      // 滑行道
      w.box(-15, 0, 41, 270, 0.04, 10, 'asphalt', { collide: false });
      // 联络道
      w.box(66, 0, 28, 12, 0.04, 28, 'asphalt', { collide: false });
      w.box(-120, 0, 28, 12, 0.04, 28, 'asphalt', { collide: false });
      // 航站楼前广场 / 机库坪 / 货运坪
      w.box(10, 0, 79, 110, 0.04, 58, 'concrete', { collide: false });
      w.box(-85, 0, -38, 122, 0.04, 44, 'concrete', { collide: false });
      w.box(137, 0, 44, 88, 0.04, 82, 'concrete', { collide: false });
      // 跑道中线与端头标线
      for (let x = -155; x <= 140; x += 20) w.box(x, 0.05, 10, 10, 0.01, 0.7, 'whitePaint', { collide: false });
      for (const ex of [-158, 147]) {
        for (let i = -3; i <= 3; i++) w.box(ex, 0.05, 10 + i * 3.2, 5, 0.01, 1.2, 'whitePaint', { collide: false });
      }
      // 围墙
      w.box(0, 0, -198, 396, 2.4, 0.5, 'concreteDark');
      w.box(0, 0, 198, 396, 2.4, 0.5, 'concreteDark');
      w.box(-198, 0, 0, 0.5, 2.4, 396, 'concreteDark');
      w.box(198, 0, 0, 0.5, 2.4, 396, 'concreteDark');

      // ---------- 航站楼 ----------
      w.building(10, 118, 96, 24, 8, {
        mat: 'concrete', roofMat: 'concreteDark', parapet: false, floor: 'tiles', light: 0xffd9a0,
        doors: { n: [-34, 0, 34], s: [-26, 26] },
        windows: { n: [-44, -22, -11, 11, 22, 44], s: [-38, 0, 38], e: [0], w: [0] },
      });
      // 屋顶女儿墙（东侧留空给楼梯）
      w.box(10, 8.3, 105.85, 96.4, 0.6, 0.3, 'plasterWhite');
      w.box(10, 8.3, 130.15, 96.4, 0.6, 0.3, 'plasterWhite');
      w.box(-38.25, 8.3, 118, 0.3, 0.6, 24.2, 'plasterWhite');
      // 屋顶设备掩体
      w.box(-18, 8.3, 118, 4.5, 1.3, 3.2, 'metal');
      w.box(22, 8.3, 114, 3, 1.1, 2.4, 'concreteDark');
      // 屋顶中控楼
      w.box(10, 8.3, 118, 28, 3.4, 16, 'plasterWhite');
      w.box(10, 9.4, 109.95, 24, 1.4, 0.1, 'windowDark', { collide: false });
      w.box(10, 9.4, 126.05, 24, 1.4, 0.1, 'windowLit', { collide: false });
      // 航站楼幕墙（门洞上方）与入口标识
      for (let x = -34; x <= 54; x += 8) {
        w.box(x, 3.2, 105.7, 7.4, 3.4, 0.12, (x > -18 && x < 38 ? 'windowDark' : 'windowLit'), { collide: false });
        w.box(x - 3.7, 3.2, 105.66, 0.35, 3.4, 0.16, 'darkMetal', { collide: false });
      }
      w.box(10, 3.05, 105.68, 96, 0.3, 0.16, 'darkMetal', { collide: false });
      w.box(10, 6.75, 105.68, 96, 0.3, 0.16, 'darkMetal', { collide: false });
      w.box(10, 7.1, 105.62, 20, 0.9, 0.2, 'darkMetal', { collide: false });
      w.box(10, 7.1, 105.5, 15, 0.28, 0.22, 'lampCold', { collide: false });
      // 内部隔断
      w.wall(-38, 118, 58, 118, 8, 0.3, 'plasterWhite', [{ c: 24, w: 5, y0: 0, y1: 3 }, { c: 62, w: 4, y0: 0, y1: 3 }]);
      w.wall(-26, 106, -26, 130, 8, 0.3, 'plasterWhite', [{ c: 12, w: 4, y0: 0, y1: 3 }]);
      w.wall(40, 106, 40, 130, 8, 0.3, 'plasterWhite', [{ c: 12, w: 4, y0: 0, y1: 3 }]);
      w.box(-10, 0, 115, 18, 1.1, 1.4, 'wood');
      w.box(24, 0, 115, 18, 1.1, 1.4, 'wood');
      w.box(-8, 0, 126, 2, 1.8, 3, 'wood'); w.crateStack(30, 126);
      w.box(45, 0, 111, 3, 2.2, 1.2, 'containerGray');
      // 屋顶楼梯
      w.stairs(63, 118, 3, 10, 8, 'w');
      // 门口雨棚与车辆
      w.awning(10, 101, 26, 8, 4.6, 'tarp', 0);
      w.car(-30, 98, Math.PI / 2, 0x223344); w.car(48, 98, -Math.PI / 2, 0x6a2020);
      w.truck(78, 90, Math.PI / 2, 0x8a8f94); w.truckCollider(78, 90, Math.PI / 2);
      w.sandbags(-14, 105, 5, 0); w.sandbags(30, 105, 5, 0);
      w.lampPost(-24, 92, 0xffd8a0, Math.PI / 2, 12);      // ---------- 机库区 ----------
      const hangar = (cx, cz, wid, dep, h, matName) => {
        const x0 = cx - wid / 2, x1 = cx + wid / 2, z0 = cz - dep / 2, z1 = cz + dep / 2;
        w.box(cx, h, cz, wid + 1.2, 0.5, dep + 1.2, 'metalRoof');
        w.wall(x0, z0, x0, z1, h, 0.45, matName);
        w.wall(x1, z0, x1, z1, h, 0.45, matName);
        w.wall(x0, z0, x1, z0, h, 0.45, matName);
        // 前脸（朝跑道一侧）留出大开口
        w.box(x0 + 1.2, 0, z1, 2.4, h, 0.45, matName);
        w.box(x1 - 1.2, 0, z1, 2.4, h, 0.45, matName);
        w.box(cx, h - 0.8, z1, wid, 0.8, 0.45, matName);
      };
      hangar(-120, -58, 44, 46, 9, 'metal');
      hangar(-66, -58, 42, 46, 9, 'containerGray');
      // 机库内 / 周围
      w.container(-126, -48, 0, 'containerBlue');
      w.container(-114, -48, 0, 'containerGreen');
      w.crateStack(-132, -66); w.crateStack(-108, -70);
      w.truck(-78, -52, Math.PI / 2, 0x4a5a3a); w.truckCollider(-78, -52, Math.PI / 2);
      w.box(-92, 0, -34, 3, 2.4, 2, 'containerOrange');
      w.sandbags(-96, -30, 7, 0);
      w.sandbags(-42, -30, 5, 0);
      w.barrel(-58, -34, 'containerRed'); w.barrel(-57.2, -33.4, 'containerBlue');
      // 维修车间
      w.building(-25, -64, 16, 14, 4.2, { mat: 'brickDark', doors: { s: [0], e: [0] }, windows: { s: [-4, 4] }, floor: 'concrete' });
      w.crateStack(-36, -60); w.crateStack(-14, -58);

      // ---------- 塔台 ----------
      w.box(100, 0, -86, 8, 10, 8, 'concrete');
      w.box(100, 10, -86, 13, 0.35, 13, 'darkMetal');
      w.box(100, 10.35, -86, 8, 4, 8, 'concreteDark');
      for (const [wx, wz, ww, wd] of [[100, -90.05, 6.4, 0.12], [100, -81.95, 6.4, 0.12], [96.05, -86, 0.12, 6.4], [103.95, -86, 0.12, 6.4]]) {
        w.box(wx, 11.3, wz, ww, 1.5, wd, 'windowLit', { collide: false });
      }
      w.box(100, 14.35, -86, 9, 0.4, 9, 'metalRoof');
      w.box(100, 14.75, -86, 0.22, 6, 0.22, 'darkMetal');
      w.stairs(100, -73, 3, 13, 10, 'n');
      w.sandbags(96, -94, 4, 0); w.sandbags(104, -94, 4, 0);

      // ---------- 北侧兵营与车库 ----------
      w.box(-95, 0, -105, 9, 0.02, 64, 'asphalt', { collide: false });
      w.box(-70, 0, -122, 60, 0.02, 9, 'asphalt', { collide: false });
      w.building(-118, -138, 30, 13, 6, { mat: 'plaster', roofMat: 'concreteDark', doors: { e: [-3, 3], s: [0] }, windows: { s: [-8, 0, 8], n: [-8, 8] }, parapet: true, floor: 'tiles' });
      w.building(-76, -138, 22, 12, 5.2, { mat: 'brick', doors: { w: [0], s: [-4] }, windows: { s: [4], n: [-4, 4] }, parapet: true, floor: 'tiles' });
      w.building(-40, -150, 20, 14, 5, { mat: 'metal', roofMat: 'metalRoof', doors: { s: [0] }, windows: { s: [-6, 6] }, floor: 'concrete' });
      w.tent(-104, -120, 4, 6, 0); w.tent(-96, -120, 4, 6, 0);
      w.crateStack(-100, -152); w.crateStack(-60, -154);
      w.truck(-30, -120, Math.PI / 2, 0x4a5a3a); w.truckCollider(-30, -120, Math.PI / 2);
      w.truck(-16, -120, Math.PI / 2, 0x6a5a40); w.truckCollider(-16, -120, Math.PI / 2);
      w.sandbags(-56, -128, 8, 0);
      w.wall(-132, -162, -8, -162, 2.2, 0.4, 'concreteDark', [{ c: 28, w: 6 }, { c: 92, w: 6 }]);

      // ---------- 东北雷达站 ----------
      w.box(126, 0, -144, 58, 0.04, 50, 'concrete', { collide: false });
      w.building(106, -160, 16, 10, 4, { mat: 'plasterWhite', doors: { s: [0] }, windows: { s: [-4, 4] }, floor: 'concrete' });
      w.box(132, 0, -145, 2, 12, 2, 'darkMetal');
      w.box(132, 12, -145, 8, 0.5, 8, 'darkMetal');
      w.mesh(new THREE.BoxGeometry(7, 4.5, 0.4), 'metal', 132, 14.2, -145);
      w.mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.4, 8), 'darkMetal', 132, 12.4, -145);
      w.box(140, 0, -152, 3, 2, 3, 'containerBlue');
      w.sandbags(118, -132, 7, 0);
      w.crateStack(112, -138);

      // ---------- 南侧仓储区 ----------
      w.box(-50, 0, 160, 74, 0.03, 42, 'asphalt', { collide: false });
      w.box(10, 0, 141, 9, 0.02, 24, 'dirt', { collide: false });
      w.building(-50, 168, 44, 16, 7, { mat: 'containerGray', roofMat: 'metalRoof', doors: { n: [-8, 8] }, windows: { n: [-16, 16] }, floor: 'concrete' });
      w.building(52, 162, 22, 16, 5, { mat: 'brick', doors: { n: [0] }, windows: { n: [-6, 6] }, parapet: true, floor: 'tiles' });
      for (const [x, z] of [[-104, 150], [-72, 150], [-8, 152], [24, 172], [76, 150]]) w.container(x, z, 0, ['containerRed', 'containerBlue', 'containerGreen', 'containerOrange', 'containerGray'][(Math.abs(x) / 2 | 0) % 5]);
      w.truck(-92, 176, Math.PI / 2, 0xb8b0a0); w.truckCollider(-92, 176, Math.PI / 2);
      w.crateStack(-24, 176); w.sandbags(2, 148, 6, 0);

      // ---------- 燃料库（西） ----------
      w.tank(-160, 55, 6.5, 11, 'metal');
      w.tank(-140, 78, 5.5, 9, 'metal');
      w.tank(-173, 88, 5, 8, 'metal');
      w.pipe(-160, 55, -140, 78, 4, 0.32);
      w.pipe(-160, 55, -173, 88, 3.2, 0.28);
      // 防火堤
      w.wall(-186, 36, -112, 36, 1.2, 0.5, 'concrete', [{ c: 40, w: 6, y0: 0, y1: 1.2 }]);
      w.wall(-186, 112, -112, 112, 1.2, 0.5, 'concrete', [{ c: 20, w: 5, y0: 0, y1: 1.2 }, { c: 56, w: 5, y0: 0, y1: 1.2 }]);
      w.wall(-186, 36, -186, 112, 1.2, 0.5, 'concrete');
      w.wall(-112, 36, -112, 112, 1.2, 0.5, 'concrete', [{ c: 30, w: 7, y0: 0, y1: 1.2 }]);
      w.truck(-125, 48, 0.2, 0xb8b0a0); w.truckCollider(-125, 48, 0.2);
      w.barrel(-146, 66, 'containerRed'); w.barrel(-145.2, 66.6, 'containerRed');
      w.barrel(-155, 96, 'burnt');
      w.crateStack(-132, 100); w.sandbags(-120, 60, 6, Math.PI / 2);

      // ---------- 货运区（东） ----------
      const cols = ['containerRed', 'containerBlue', 'containerGreen', 'containerOrange', 'containerGray', 'containerYellow'];
      const crates = [
        [104, 16, 0], [111, 16, 0], [104, 23, 0], [118, 16, 0],
        [104, 62, Math.PI / 2], [111, 62, Math.PI / 2], [104, 69, Math.PI / 2],
        [142, 18, 0], [149, 18, 0], [142, 25, 0], [156, 18, 0],
        [156, 62, Math.PI / 2], [163, 62, Math.PI / 2], [156, 69, Math.PI / 2],
        [174, 32, 0], [174, 39, 0],
      ];
      crates.forEach(([x, z, rot], i) => w.container(x, z, rot, cols[i % cols.length]));
      // 双层堆叠
      w.container(111, 16, 0, 'containerYellow', 2.6);
      w.container(149, 18, 0, 'containerGreen', 2.6);
      w.crateStack(125, 34); w.crateStack(132, 55);
      // 龙门吊
      for (const gx of [102, 172]) {
        for (const gz of [8, 80]) w.box(gx, 0, gz, 1, 14, 1, 'yellowPaint');
        w.box(gx, 14, 44, 1.2, 1.2, 74, 'yellowPaint', { collide: false });
      }
      w.box(137, 14, 44, 74, 1.2, 1.2, 'yellowPaint', { collide: false });
      w.lampPost(128, 78, 0xffd8a0, Math.PI, 14);

      // ---------- 坠机残骸（中央地标） ----------
      const fus = w.mesh(new THREE.CylinderGeometry(2.1, 1.3, 30, 16), 'burnt', -40, 3.2, 10);
      fus.rotation.z = Math.PI / 2;
      const wing = w.mesh(new THREE.BoxGeometry(9, 0.5, 34), 'containerGray', -40, 2.4, 10);
      const tail = w.mesh(new THREE.BoxGeometry(5, 5.5, 0.5), 'containerGray', -56, 5.2, 10);
      tail.rotation.z = 0.5;
      w.collider(-56, 0, 7, -24, 4.6, 13);
      w.collider(-45, 1.9, -7, -35, 2.9, 27);
      w.crateStack(-30, 23); w.barrel(-50, 22, 'burnt', true);
      w.box(-46, 0, -2, 3.4, 1.4, 2.6, 'burnt', { rotY: 0.4 });
      w.box(-20, 0, 10, 2, 0.8, 6, 'darkMetal', { rotY: 0.2 });

      // ---------- 掩体与载具 ----------
      for (const x of [-135, -105, -75, -10, 25, 60, 95, 125]) w.jersey(x, 26, Math.PI / 2);
      for (const x of [-120, -45, 20, 85]) w.sandbags(x, -6, 5, 0);
      w.jersey(-145, 50); w.jersey(120, 52);
      w.car(-90, 4, 0.1, 0x2a3a4a); w.car(30, 46, Math.PI / 2, 0x5a2a2a);
      w.box(-175, 0, -20, 4, 2.6, 4, 'containerGray');
      w.box(176, 0, 20, 4, 2.6, 4, 'containerBlue');

      // ---------- 检查站 ----------
      for (const [gx, gz] of [[-170, 68], [168, 68]]) {
        w.building(gx, gz, 7, 5, 3, { mat: 'concreteDark', doors: { s: [0] }, windows: { s: [-2, 2] }, floor: 'concrete' });
        w.sandbags(gx - 6, gz + 5, 5, 0);
        w.barrier(gx + 5, gz + 4); w.barrier(gx + 6.8, gz + 4);
      }
      w.watchtower(-176, 30, 4);
      w.watchtower(176, -30, 4);

      // ---------- 停机坪上的运输机 ----------
      w.mesh(new THREE.CylinderGeometry(1.9, 1.5, 30, 16), 'containerGray', 30, 3.1, 66).rotation.z = Math.PI / 2;
      w.mesh(new THREE.BoxGeometry(7, 0.4, 30), 'containerGray', 30, 2.2, 66);
      w.mesh(new THREE.BoxGeometry(4, 5, 0.4), 'containerGray', 16, 5, 66).rotation.z = 0.45;
      for (const dx of [24, 36]) {
        w.mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 10), 'darkMetal', dx, 1.9, 58).rotation.x = Math.PI / 2;
        w.mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 10), 'darkMetal', dx, 1.9, 74).rotation.x = Math.PI / 2;
      }
      w.collider(15, 0, 63.5, 45, 4.8, 68.5);
      w.collider(26, 1.8, 51, 34, 2.7, 81);

      // ---------- 出生区营地 ----------
      for (const sx of [-1, 1]) {
        const px = sx * 176;
        w.tent(px, -16, 4, 6, 0);
        w.tent(px, 16, 4, 6, 0);
        w.sandbags(px + sx * 4, 0, 6, Math.PI / 2);
        w.crateStack(px - sx * 6, -28);
        w.crateStack(px - sx * 6, 28);
        w.box(px, 0, 38, 3, 1.1, 2.5, 'wood');
      }

      // ---------- 植被与岩石 ----------
      const palms = [[-46, 100], [62, 102], [-170, 20], [180, -18], [-60, 92], [80, 108]];
      palms.forEach(([x, z], i) => w.tree(x, z, 0.95 + (i % 3) * 0.12, 'palm'));
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2, d = 165 + r() * 28;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.abs(x) > 186 || Math.abs(z) > 186) continue;
        w.tree(x, z, 0.7 + r() * 0.5, r() < 0.5 ? 'broad' : 'pine');
      }
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI * 2, d = 178 + r() * 16;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.abs(x) > 194 || Math.abs(z) > 194) continue;
        w.rock(x, z, 0.9 + r() * 1.4, 'rock');
      }
      w.rock(-110, 108, 1.6); w.rock(96, -112, 1.4); w.rock(118, 104, 1.2);

      // ---------- 刷新点 / 据点 ----------
      w.spawns.A = [V(-184, -30), V(-184, -15), V(-184, 0), V(-184, 15), V(-184, 30), V(-170, -50), V(-170, 50)];
      w.spawns.B = [V(184, -30), V(184, -15), V(184, 0), V(184, 15), V(184, 30), V(170, -50), V(170, 50)];
      w.flagPos = [V(-150, 62), V(0, 10), V(140, 42)];
    },
  },

  // ================= 战役：卡尔达什 =================
  kaldash: {
    id: 'kaldash', name: '卡尔达什村', size: 200, seed: 51, surface: 'dirt', night: true, styles: ['ally', 'insurgent'],
    env: { sky: 'night', sunDir: [0.35, 0.55, -0.6], sunColor: 0xa8b8ff, sun: 0.55, hemi: 0.22, sky2: 0x3a4a70, ground: 0x1a1510, fog: 0x0b1020, fogDensity: 0.016, exposure: 1.15, envIntensity: 0.3, skyTop: 0x02040a, skyHorizon: 0x0f1828, cityGlow: 0x0a0a14, mountains: 'rock', ambient: 'wind' },
    build(w) {
      w.ground('dirt');
      w.bounds();
      const r = mulberry32(77);
      // 土路
      w.box(0, 0, 0, 196, 0.02, 7, 'sand', { collide: false, texScale: 6 });
      // 草地斑块
      for (let i = 0; i < 14; i++) w.box(-95 + r() * 190, 0.005, -90 + r() * 180, 8 + r() * 14, 0.01, 8 + r() * 14, 'grass', { collide: false });
      // ---- 着陆区 ----
      for (let i = 0; i < 14; i++) { const x = -95 + r() * 45, z = (r() < 0.5 ? -1 : 1) * (8 + r() * 30); w.rock(x, z, 0.8 + r() * 1.5, 'rock'); }
      for (let i = 0; i < 26; i++) { const x = -95 + r() * 190, z = (r() < 0.5 ? -1 : 1) * (26 + r() * 60); if (Math.abs(x - 65) < 30 && Math.abs(z) < 32) continue; w.tree(x, z, 0.9 + r() * 0.5, r() < 0.5 ? 'pine' : 'broad'); }
      w.wall(-70, -6, -60, -6, 1.1, 0.5, 'rock'); w.wall(-68, 6, -58, 6, 1.0, 0.5, 'rock');
      w.car(-64, 10, 0.8, 0x333333, true);
      // ---- 前哨站 ----
      w.sandbags(-50, -7, 6, 0); w.sandbags(-50, 7, 6, 0); w.sandbags(-54, 0, 5, Math.PI / 2);
      w.sandbags(-40, -9, 5, 0);
      w.watchtower(-43, -12, 4);
      w.tent(-48, 12, 4, 5, 0); w.tent(-40, 12, 4, 5, 0);
      w.barrel(-45, 3.5, 'burnt', true);
      w.box(-37, 0, -4, 1.5, 1.2, 1, 'darkMetal'); // 发电机
      w.lampPost(-36, -6, 0xffd0a0, Math.PI, 10);
      w.crateStack(-46, -4); w.truck(-34, 6, 0.2, 0xb8b0a0); w.truckCollider(-34, 6, 0);
      // ---- 村庄 ----
      const houses = [[-12, -14, 8, 7, 3.2, 'plaster'], [-8, 14, 9, 8, 3.2, 'plasterWhite'], [6, -16, 10, 8, 3.5, 'plaster'], [10, 15, 8, 8, 3.2, 'plasterRed'], [22, -12, 7, 7, 3, 'plasterWhite'], [25, 14, 8, 7, 3.2, 'plaster']];
      houses.forEach(([x, z, bw, bd, h, m], i) => w.building(x, z, bw, bd, h, { mat: m, doors: { [z < 0 ? 's' : 'n']: [i % 2 ? 1 : -1], [i % 2 ? 'e' : 'w']: [0] }, windows: { [z < 0 ? 's' : 'n']: [i % 2 ? -2 : 2] }, parapet: true, floor: 'dirt' }));
      w.wall(-20, -24, 32, -24, 1.6, 0.4, 'plaster', [{ c: 18, w: 3, y0: 0, y1: 1.6 }, { c: 36, w: 3, y0: 0, y1: 1.6 }]);
      w.wall(-20, 24, 32, 24, 1.6, 0.4, 'plaster', [{ c: 14, w: 3, y0: 0, y1: 1.6 }, { c: 34, w: 3, y0: 0, y1: 1.6 }]);
      w.box(2, 0, 4, 2.5, 1.0, 1.4, 'wood'); w.crate(-2, -5, 1); w.crate(16, 5, 1.1); w.barrel(14, -5, 'containerBlue');
      w.mesh(new THREE.CylinderGeometry(1, 1, 0.9, 16), 'rock', 5, 0.45, -4); w.collider(4, 0, -5, 6, 0.9, -3);
      w.car(30, -4, 0.3, 0x5a4a30, true);
      w.box(-8, 1.1, 10.3, 1.2, 1.0, 0.05, 'windowLit', { collide: false });
      w.pointLight(-8, 2.2, 14, 0xffb070, 3, 9, true);
      w.box(25, 1.1, 10.3, 1.2, 1.0, 0.05, 'windowLit', { collide: false });
      // ---- 大院 ----
      const T = 0.4, H = 3.2;
      w.wall(45, -22, 88, -22, H, T, 'plaster', [{ c: 5, w: 3, y0: 0, y1: H }]);
      w.wall(45, 22, 88, 22, H, T, 'plaster', [{ c: 5, w: 3, y0: 0, y1: H }]);
      w.wall(45, -22, 45, 22, H, T, 'plaster', [{ c: 22, w: 6, y0: 0, y1: H }]);
      w.wall(88, -22, 88, 22, H, T, 'plaster', [{ c: 22, w: 5, y0: 0, y1: H }]);
      // 主楼
      const hx0 = 57, hx1 = 79, hz0 = -8, hz1 = 8, hh = 3.6;
      w.building(68, 0, 22, 16, hh, { mat: 'plasterWhite', doors: { w: [0], e: [0] }, windows: { n: [-6, 2, 7], s: [-6, 4] }, parapet: true, floor: 'tiles' });
      w.wall(hx0 + 0.15, -2.5, hx1 - 0.15, -2.5, hh, 0.2, 'plaster', [{ c: 5, w: 1.3 }, { c: 16, w: 1.3 }]);
      w.wall(hx0 + 0.15, 2.5, hx1 - 0.15, 2.5, hh, 0.2, 'plaster', [{ c: 8, w: 1.3 }, { c: 18, w: 1.3 }]);
      w.wall(68, hz0 + 0.15, 68, -2.6, hh, 0.2, 'plaster');
      w.wall(70, 2.6, 70, hz1 - 0.15, hh, 0.2, 'plaster');
      // 情报室
      w.box(75, 0, -6.2, 2.2, 0.8, 1.0, 'wood');
      w.laptopPos = V(75, -6.2); w.laptopPos.y = 0.85;
      w.box(75, 0.8, -6.3, 0.4, 0.02, 0.3, 'darkMetal', { collide: false });
      w.box(75, 0.8, -6.45, 0.4, 0.28, 0.02, 'lampCold', { collide: false });
      w.box(71, 0, -7.4, 1.8, 2, 0.6, 'wood'); w.crate(77.5, -3.8, 0.9);
      w.box(60, 0, -6, 2, 0.5, 3, 'clothRed'); w.box(62, 0, 6.5, 2.5, 0.8, 1, 'wood'); w.box(76, 0, 6, 1, 1.8, 2, 'wood');
      w.pointLight(62, 3, 0, 0xffc080, 3, 10, true);
      w.pointLight(74, 3, -5, 0xffc080, 2.5, 8, true);
      // 庭院
      w.truck(51, -12, Math.PI / 2 + 0.2, 0xd9d4c4); w.truckCollider(51, -12, Math.PI / 2);
      w.crateStack(49, 12); w.sandbags(53, 4, 4, Math.PI / 2); w.sandbags(53, -4, 3, Math.PI / 2);
      w.barrel(55, 16, 'burnt', true);
      w.box(83, 0, -15, 3, 1.5, 3, 'crate', { texScale: 1.5 }); w.box(82, 0, 14, 2, 2.5, 4, 'wood');
      w.ammoCrate = V(55, -18);
      w.box(55, 0, -18.5, 1.2, 0.6, 0.7, 'gunGreen');
      w.lampPost(47, 18, 0xffc080, -Math.PI / 2, 10);
      // 撤离区
      w.lzPos = V(94, 0);
      w.rock(96, -12, 1.8); w.rock(97, 14, 1.4);
      w.points = {
        start: V(-88, 0), outpost: V(-45, 0), village: V(10, 0), gate: V(44, 0), house: V(58, 0),
      };
      w.spawns.A = [V(-88, 0)]; w.spawns.B = [V(40, 0)];
      w.flagPos = [];
    },
  },
};
