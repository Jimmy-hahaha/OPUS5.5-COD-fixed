// 世界：几何构建、碰撞、射线、导航网格、光照天空
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mat } from './materials.js';
import { rayAABB, BinaryHeap, TileNoise, mulberry32, clamp } from './util.js';

function boxGeo(w, h, d, s) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s);
    }
  }
  return g;
}

// 把静态道具组内的 mesh 按材质合并，减少树木/车辆的 draw call
function mergeGroup(group) {
  const meshes = group.children.filter(o => o.isMesh);
  if (meshes.length < 2) return;
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
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

export class World {
  constructor(game, def) {
    this.game = game;
    this.scene = game.scene;
    this.def = def;
    this.boxes = [];
    this.geoLists = new Map();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.half = def.size / 2;
    this.spawns = { A: [], B: [], ffa: [] };
    this.flags = [];
    this.points = {};
    this.lights = [];
    this.animated = [];
    this.rng = mulberry32(def.seed || 7);
  }

  // ---------- 基础构建 ----------
  box(cx, y0, cz, w, h, d, matName = 'concrete', opt = {}) {
    const m = mat(matName);
    if (opt.visible !== false) {
      const g = boxGeo(w, h, d, opt.texScale || m.userData.texScale || 2);
      if (opt.rotY) g.rotateY(opt.rotY);
      g.translate(cx, y0 + h / 2, cz);
      if (!this.geoLists.has(m)) this.geoLists.set(m, []);
      this.geoLists.get(m).push(g);
    }
    if (opt.collide !== false) {
      let hw = w / 2, hd = d / 2;
      if (opt.rotY && Math.abs(Math.sin(opt.rotY)) > 0.7) { hw = d / 2; hd = w / 2; }
      const b = { x0: cx - hw, x1: cx + hw, y0, y1: y0 + h, z0: cz - hd, z1: cz + hd, mat: matName, pen: opt.pen };
      this.boxes.push(b);
      return b;
    }
    return null;
  }
  collider(x0, y0, z0, x1, y1, z1) {
    const b = { x0, y0, z0, x1, y1, z1 };
    this.boxes.push(b); return b;
  }
  mesh(geo, matName, x, y, z, opt = {}) {
    const m = new THREE.Mesh(geo, typeof matName === 'string' ? mat(matName) : matName);
    m.position.set(x, y, z);
    if (opt.rotY) m.rotation.y = opt.rotY;
    m.castShadow = opt.cast !== false; m.receiveShadow = true;
    (opt.parent || this.root).add(m);
    return m;
  }

  // 带开口的墙 (轴对齐)
  wall(x0, z0, x1, z1, h, t, matName, openings = [], y0 = 0) {
    const horiz = Math.abs(z1 - z0) < 0.001;
    const len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const sx = Math.min(x0, x1), sz = Math.min(z0, z1);
    const seg = (a, b, ya, yb) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      const c = (a + b) / 2;
      if (horiz) this.box(sx + c, y0 + ya, z0, b - a, yb - ya, t, matName);
      else this.box(x0, y0 + ya, sz + c, t, yb - ya, b - a, matName);
    };
    const ops = openings.map(o => ({ a: o.c - o.w / 2, b: o.c + o.w / 2, y0: o.y0 || 0, y1: o.y1 || 2.3 })).sort((p, q) => p.a - q.a);
    let cur = 0;
    for (const o of ops) {
      seg(cur, o.a, 0, h);
      seg(o.a, o.b, 0, o.y0);
      seg(o.a, o.b, o.y1, h);
      cur = o.b;
    }
    seg(cur, len, 0, h);
  }

  // 可进入建筑 doors/windows: {n:[offset...], s:[], e:[], w:[]}, offset 以墙中心为0
  building(cx, cz, w, d, h, opt = {}) {
    const m = opt.mat || 'plaster', t = 0.3;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const mk = (side, len) => {
      const arr = [];
      for (const c of (opt.doors?.[side] || [])) arr.push({ c: len / 2 + c, w: 1.5, y0: 0, y1: 2.4 });
      for (const c of (opt.windows?.[side] || [])) arr.push({ c: len / 2 + c, w: 1.3, y0: 1.0, y1: 2.1 });
      return arr;
    };
    this.wall(x0, z0, x1, z0, h, t, m, mk('n', w));
    this.wall(x0, z1, x1, z1, h, t, m, mk('s', w));
    this.wall(x0, z0 + t / 2, x0, z1 - t / 2, h, t, m, mk('w', d - t));
    this.wall(x1, z0 + t / 2, x1, z1 - t / 2, h, t, m, mk('e', d - t));
    if (opt.roof !== false) {
      this.box(cx, h, cz, w + 0.4, 0.3, d + 0.4, opt.roofMat || 'concreteDark');
      if (opt.parapet) {
        const pm = opt.roofMat || m;
        this.box(cx, h + 0.3, z0 - 0.05, w + 0.4, 0.6, 0.3, m);
        this.box(cx, h + 0.3, z1 + 0.05, w + 0.4, 0.6, 0.3, m);
        this.box(x0 - 0.05, h + 0.3, cz, 0.3, 0.6, d, m);
        this.box(x1 + 0.05, h + 0.3, cz, 0.3, 0.6, d, m);
      }
    }
    if (opt.floor !== false) this.box(cx, 0, cz, w - 0.3, 0.03, d - 0.3, opt.floor || 'tiles', { collide: false });
    if (opt.light) this.pointLight(cx, h - 0.4, cz, opt.light, 1.2, 10);
    return { x0, x1, z0, z1 };
  }

  // 实心建筑（大楼）
  block(cx, cz, w, h, d, matName = 'concrete', opt = {}) {
    this.box(cx, 0, cz, w, h, d, matName);
    if (opt.windows) {
      // 窗户面板（装饰）
      const rows = Math.floor((h - 1) / 3.2);
      const wm = opt.windowMat || 'windowDark';
      for (let r = 0; r < rows; r++) {
        const y = 1.6 + r * 3.2 + (r === 0 && opt.shopfront ? 0 : 0);
        const colsX = Math.floor(w / 3), colsZ = Math.floor(d / 3);
        for (let c = 0; c < colsX; c++) {
          const x = cx - w / 2 + (c + 0.5) * (w / colsX);
          const lit = typeof wm === 'function' ? wm() : wm;
          this.box(x, y, cz - d / 2 - 0.02, 1.4, 1.6, 0.06, lit, { collide: false });
          this.box(x, y, cz + d / 2 + 0.02, 1.4, 1.6, 0.06, typeof wm === 'function' ? wm() : wm, { collide: false });
        }
        for (let c = 0; c < colsZ; c++) {
          const z = cz - d / 2 + (c + 0.5) * (d / colsZ);
          this.box(cx - w / 2 - 0.02, y, z, 0.06, 1.6, 1.4, typeof wm === 'function' ? wm() : wm, { collide: false });
          this.box(cx + w / 2 + 0.02, y, z, 0.06, 1.6, 1.4, typeof wm === 'function' ? wm() : wm, { collide: false });
        }
      }
    }
    if (opt.roofEdge) this.box(cx, h, cz, w + 0.3, 0.4, d + 0.3, opt.roofEdge);
  }

  crate(x, z, s = 1.2, y = 0, rot = 0) {
    const g = new THREE.Group();
    const o = s / 2, t = s * 0.075;
    const panel = new THREE.Mesh(boxGeo(s * 0.96, s * 0.96, s * 0.96, s), mat('crate'));
    panel.position.y = s / 2; g.add(panel);
    const wm = mat('wood');
    const bar = (w, h, d, px, py, pz) => {
      const m = new THREE.Mesh(boxGeo(w, h, d, s * 0.7), wm);
      m.position.set(px, py, pz); g.add(m);
    };
    // 四根竖框
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(t, s, t, sx * (o - t / 2), s / 2, sz * (o - t / 2));
    // 上下横框
    for (const sy of [t / 2 + 0.01, s - t / 2 - 0.01]) {
      for (const sz of [-1, 1]) bar(s, t, t, 0, sy, sz * (o - t / 2));
      for (const sx of [-1, 1]) bar(t, t, s, sx * (o - t / 2), sy, 0);
    }
    // 前后交叉斜撑
    const diag = s * 0.88;
    for (const sz of [-1, 1]) for (const dir of [-1, 1]) {
      const m = new THREE.Mesh(boxGeo(diag, t * 0.8, t * 0.5, s * 0.7), wm);
      m.position.set(0, s / 2, sz * (o + 0.001));
      m.rotation.z = dir * Math.PI / 4; g.add(m);
    }
    // 四角包角铁皮：贴在外表面并略微凸出，避免与木框共面造成闪烁
    const ct = s * 0.02, cl = s * 0.18;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [-1, 1]) {
      const py = s / 2 + sy * (o - cl / 2 - t * 0.4);
      const inner = o - cl / 2 - t * 0.4;
      const bx = new THREE.Mesh(boxGeo(ct, cl, cl, s), mat('darkMetal'));
      bx.position.set(sx * (o + ct / 2 + 0.002), py, sz * inner); g.add(bx);
      const bz = new THREE.Mesh(boxGeo(cl, cl, ct, s), mat('darkMetal'));
      bz.position.set(sx * inner, py, sz * (o + ct / 2 + 0.002)); g.add(bz);
    }
    // 前面的喷漆标识
    const label = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.34, s * 0.14), mat('yellowPaint'));
    label.position.set(0, s * 0.62, o + 0.008); g.add(label);
    // 正面金属锁扣与背面铰链
    const latchM = mat('darkMetal');
    for (const sx of [-1, 1]) {
      const plate = new THREE.Mesh(boxGeo(s * 0.07, s * 0.12, s * 0.012, s), latchM);
      plate.position.set(sx * s * 0.24, s * 0.55, o + 0.01); g.add(plate);
      const hook = new THREE.Mesh(boxGeo(s * 0.035, s * 0.03, s * 0.022, s), latchM);
      hook.position.set(sx * s * 0.24, s * 0.49, o + 0.02); g.add(hook);
      const hinge = new THREE.Mesh(boxGeo(s * 0.08, s * 0.1, s * 0.014, s), latchM);
      hinge.position.set(sx * s * 0.22, s * 0.78, -o - 0.01); g.add(hinge);
    }
    // 底部磨损与泥污
    const wearM = mat('rust');
    for (const sz of [-1, 1]) {
      const strip = new THREE.Mesh(boxGeo(s * 0.92, s * 0.05, 0.006, s), wearM);
      strip.position.set(0, s * 0.06, sz * (o + 0.004)); g.add(strip);
    }
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(boxGeo(0.006, s * 0.05, s * 0.92, s), wearM);
      strip.position.set(sx * (o + 0.004), s * 0.06, 0); g.add(strip);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mergeGroup(g);
    g.position.set(x, y, z); g.rotation.y = rot;
    this.root.add(g);
    this.box(x, y, z, s, s, s, 'crate', { visible: false, rotY: rot });
    return g;
  }
  crateStack(x, z) {
    this.crate(x, z, 1.2); this.crate(x + 1.25, z, 1.2); this.crate(x + 0.6, z, 1.1, 1.2, 0.3);
  }
  container(x, z, rotY = 0, color = 'containerRed', y = 0, doorOpen = false) {
    const L = 6.06, W = 2.44, H = 2.6;
    const along = Math.abs(Math.sin(rotY)) > 0.7;
    const w = along ? W : L, d = along ? L : W;
    this.box(x, y, z, w, H, d, color);
    // 顶部框架条纹
    this.box(x, y + H - 0.05, z, w + 0.04, 0.1, d + 0.04, 'darkMetal', { collide: false });
    this.box(x, y, z, w + 0.04, 0.12, d + 0.04, 'darkMetal', { collide: false });
    // 侧面波纹板（略微凸出的竖条，靠光照形成起伏）
    for (let i = -2; i <= 2; i++) {
      if (along) {
        this.box(x - w / 2 - 0.025, y + 0.14, z + i * 1.05, 0.05, H - 0.3, 0.22, color, { collide: false });
        this.box(x + w / 2 + 0.025, y + 0.14, z + i * 1.05, 0.05, H - 0.3, 0.22, color, { collide: false });
      } else {
        this.box(x + i * 1.05, y + 0.14, z - d / 2 - 0.025, 0.22, H - 0.3, 0.05, color, { collide: false });
        this.box(x + i * 1.05, y + 0.14, z + d / 2 + 0.025, 0.22, H - 0.3, 0.05, color, { collide: false });
      }
    }
    // 四角角柱
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.box(x + sx * (w / 2 - 0.07), y + 0.02, z + sz * (d / 2 - 0.07), 0.14, H - 0.04, 0.14, 'darkMetal', { collide: false });
    }
    // 端面门框与锁杆
    for (const sz of [-1, 1]) {
      for (const xx of [-0.55, 0.55]) {
        const px = along ? x + sz * (w / 2 + 0.05) : x + xx;
        const pz = along ? z + xx : z + sz * (d / 2 + 0.05);
        this.box(px, y + 0.16, pz, 0.06, H - 0.36, 0.06, 'darkMetal', { collide: false });
      }
      const px = along ? x + sz * (w / 2 + 0.05) : x;
      const pz = along ? z : z + sz * (d / 2 + 0.05);
      this.box(px, y + H * 0.5, pz, along ? 0.05 : 0.06, H - 0.3, along ? 0.06 : 0.05, 'darkMetal', { collide: false });
      // 门把手
      this.box(px, y + 1.25, pz, along ? 0.09 : 0.16, 0.05, along ? 0.16 : 0.09, 'steel', { collide: false });
    }
    if (doorOpen) {
      const px = along ? x + w / 2 + 0.9 : x + 1.6;
      const pz = along ? z + 1.6 : z + d / 2 + 0.9;
      this.box(px, y, pz, along ? 0.08 : 1.2, H - 0.2, along ? 1.2 : 0.08, color, { collide: false });
    }
    // 顶部横向加强梁与底部叉车槽
    for (let i = -1; i <= 1; i++) {
      if (along) this.box(x, y + H + 0.02, z + i * 1.9, w + 0.02, 0.06, 0.12, 'darkMetal', { collide: false });
      else this.box(x + i * 1.9, y + H + 0.02, z, 0.12, 0.06, d + 0.02, 'darkMetal', { collide: false });
    }
    for (const sz of [-1, 1]) {
      if (along) this.box(x + sz * 0.8, y + 0.04, z, 0.22, 0.08, d - 0.4, 'darkMetal', { collide: false });
      else this.box(x, y + 0.04, z + sz * 0.8, w - 0.4, 0.08, 0.22, 'darkMetal', { collide: false });
    }
  }
  sandbags(x, z, len, rotY = 0, h = 1.0) {
    const along = Math.abs(Math.sin(rotY)) > 0.7;
    const rows = Math.round(h / 0.25);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 0.25;
      const n = Math.floor((len - off) / 0.55);
      // 沙袋：低段数胶囊（视觉接近原版），比原来的高面数胶囊省 4 倍顶点
      const baseBag = this._bagBase || (this._bagBase = new THREE.CapsuleGeometry(0.13, 0.32, 1, 5));
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + off + 0.28 + i * 0.55;
        const g = baseBag.clone();
        g.rotateZ(Math.PI / 2);
        g.scale(1.05, 1.0, 1.3);
        if (along) g.rotateY(Math.PI / 2 + (this.rng() - 0.5) * 0.2);
        else g.rotateY((this.rng() - 0.5) * 0.2);
        const px = along ? x : x + t, pz = along ? z + t : z;
        g.translate(px, r * 0.24 + 0.12, pz);
        const m = mat('sandbag');
        if (!this.geoLists.has(m)) this.geoLists.set(m, []);
        this.geoLists.get(m).push(g);
      }
    }
    this.box(x, 0, z, along ? 0.6 : len, h, along ? len : 0.6, 'sandbag', { visible: false });
  }
  barrier(x, z, rotY = 0) { // 混凝土防爆墙
    const along = Math.abs(Math.sin(rotY)) > 0.7;
    this.box(x, 0, z, along ? 0.9 : 2.2, 0.35, along ? 2.2 : 0.9, 'concrete');
    this.box(x, 0.35, z, along ? 0.35 : 2.2, 2.6, along ? 2.2 : 0.35, 'concrete');
  }
  jersey(x, z, rotY = 0) {
    const along = Math.abs(Math.sin(rotY)) > 0.7;
    this.box(x, 0, z, along ? 0.6 : 3, 0.3, along ? 3 : 0.6, 'concrete');
    this.box(x, 0.3, z, along ? 0.3 : 3, 0.6, along ? 3 : 0.3, 'concrete');
  }
  car(x, z, rotY = 0, color = 0x8a1c1c, burnt = false) {
    const g = new THREE.Group();
    const paint = burnt ? mat('burnt') : new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.15 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), paint); body.position.y = 0.65;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.2), paint); cabin.position.set(0, 1.25, 0.2);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.42, 2.0), burnt ? mat('burnt') : mat('windowDark')); glass.position.set(0, 1.27, 0.2);
    g.add(body, cabin, glass);
    const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 16); wg.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
      const w = new THREE.Mesh(wg, mat('rubber')); w.position.set(wx, 0.34, wz); g.add(w);
    }
    const lg = new THREE.BoxGeometry(0.3, 0.12, 0.05);
    if (!burnt) {
      for (const lx of [-0.6, 0.6]) {
        const l = new THREE.Mesh(lg, mat('lampCold')); l.position.set(lx, 0.75, -2.11); g.add(l);
        const r = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 2 })); r.position.set(lx, 0.8, 2.11); g.add(r);
      }
    }
    // 保险杠、格栅、后视镜、轮毂与车牌
    const trim = burnt ? mat('burnt') : mat('darkMetal');
    for (const bz of [-2.14, 2.14]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.16, 0.18), trim); b.position.set(0, 0.5, bz); g.add(b);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.07), trim); grille.position.set(0, 0.72, -2.13); g.add(grille);
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), mat('steel')); bar.position.set(i * 0.18, 0.72, -2.17); g.add(bar);
    }
    for (const sx of [-1, 1]) {
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.1), trim); mir.position.set(sx * 0.95, 1.2, -0.85); g.add(mir);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), trim); arm.position.set(sx * 0.86, 1.2, -0.85); g.add(arm);
    }
    for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.27, 12), mat('steel'));
      hub.rotation.z = Math.PI / 2; hub.position.set(wx, 0.34, wz); g.add(hub);
    }
    // 车门缝、门把手与油箱盖
    for (const sx of [-1, 1]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.52, 0.02), mat('burnt'));
      seam.position.set(sx * 0.902, 0.7, -0.1); g.add(seam);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.12), trim);
      handle.position.set(sx * 0.915, 0.94, 0.25); g.add(handle);
      const fuel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 10), mat('steel'));
      fuel.rotation.z = Math.PI / 2; fuel.position.set(sx * 0.905, 0.62, 1.62); g.add(fuel);
    }
    if (!burnt) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.03), mat('whitePaint')); plate.position.set(0, 0.48, 2.23); g.add(plate);
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.75, 5), trim); antenna.position.set(0.6, 1.6, 1.0); g.add(antenna);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mergeGroup(g);
    g.position.set(x, 0, z); g.rotation.y = rotY;
    this.root.add(g);
    const along = Math.abs(Math.sin(rotY)) > 0.7;
    this.collider(x - (along ? 2.1 : 0.9), 0, z - (along ? 0.9 : 2.1), x + (along ? 2.1 : 0.9), 1.1, z + (along ? 0.9 : 2.1));
    this.collider(x - (along ? 1.1 : 0.8), 1.1, z - (along ? 0.8 : 1.1), x + (along ? 1.1 : 0.8), 1.55, z + (along ? 0.8 : 1.1));
    return g;
  }
  truck(x, z, rotY = 0, color = 0xd9d4c4) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 1.8), paint); cab.position.set(0, 1.3, -1.6);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 1.2), paint); hood.position.set(0, 1.0, -2.9);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.82), mat('windowDark')); glass.position.set(0, 1.55, -1.6);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 3.2), paint); bed.position.set(0, 0.9, 0.9);
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 3.2), paint); s1.position.set(-1.0, 1.3, 0.9);
    const s2 = s1.clone(); s2.position.x = 1.0;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 0.08), paint); tail.position.set(0, 1.3, 2.5);
    g.add(cab, hood, glass, bed, s1, s2, tail);
    const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16); wg.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-0.95, -2.7], [0.95, -2.7], [-0.95, 1.4], [0.95, 1.4]]) {
      const w = new THREE.Mesh(wg, mat('rubber')); w.position.set(wx, 0.42, wz); g.add(w);
    }
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), mat('lampCold'));
    hl.position.set(-0.7, 1.05, -3.52); g.add(hl); const hl2 = hl.clone(); hl2.position.x = 0.7; g.add(hl2);
    // 轮毂、侧护栏、油箱、排气管与踏板
    for (const [wx, wz] of [[-0.95, -2.7], [0.95, -2.7], [-0.95, 1.4], [0.95, 1.4]]) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 12), mat('steel'));
      hub.rotation.z = Math.PI / 2; hub.position.set(wx, 0.42, wz); g.add(hub);
    }
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 3.1), mat('darkMetal')); rail.position.set(sx * 1.04, 1.62, 0.9); g.add(rail);
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.7), mat('darkMetal')); step.position.set(sx * 1.02, 0.4, -1.5); g.add(step);
    }
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.8), mat('darkMetal')); tank.position.set(-0.98, 0.72, 0.05); g.add(tank);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), mat('steel')); pipe.position.set(0.99, 0.68, -0.9); g.add(pipe);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 0.14), mat('darkMetal')); bumper.position.set(0, 0.62, -3.6); g.add(bumper);
    // 车门缝、门把手与后视镜
    for (const sx of [-1, 1]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.85, 0.02), mat('burnt'));
      seam.position.set(sx * 1.002, 1.32, -1.0); g.add(seam);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), mat('darkMetal'));
      handle.position.set(sx * 1.012, 1.4, -1.35); g.add(handle);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.06), mat('darkMetal'));
      mirror.position.set(sx * 1.14, 1.62, -2.35); g.add(mirror);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mergeGroup(g);
    g.position.set(x, 0, z); g.rotation.y = rotY;
    this.root.add(g);
    return g;
  }
  truckCollider(x, z, rotY) {
    const along = Math.abs(Math.sin(rotY)) > 0.7;
    this.collider(x - (along ? 3.5 : 1.05), 0, z - (along ? 1.05 : 3.5), x + (along ? 3.5 : 1.05), 1.6, z + (along ? 1.05 : 3.5));
  }
  barrel(x, z, matName = 'containerBlue', fire = false) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20, 1), mat(matName));
    body.position.y = 0.45; g.add(body);
    // 桶箍
    for (const yy of [0.14, 0.45, 0.76]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.055, 20), mat('darkMetal'));
      ring.position.y = yy; g.add(ring);
    }
    // 顶盖、底圈、加注口
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.035, 20), mat('darkMetal'));
    lid.position.y = 0.925; g.add(lid);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.312, 0.312, 0.045, 20), mat('darkMetal'));
    rim.position.y = 0.03; g.add(rim);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), mat('steel'));
    cap.position.set(0.15, 0.95, 0.02); g.add(cap);
    // 纵向焊缝与出口塞
    const weld = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.86, 5), mat('darkMetal'));
    weld.position.set(0.3, 0.45, 0); g.add(weld);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 8), mat('steel'));
    vent.position.set(-0.16, 0.94, 0.02); g.add(vent);
    // 锈斑（贴在桶身外侧）
    for (const [ang, yy, w, h] of [[0.7, 0.34, 0.11, 0.14], [-1.2, 0.62, 0.08, 0.1], [2.4, 0.2, 0.12, 0.08]]) {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat('rust'));
      patch.position.set(Math.sin(ang) * 0.302, yy, Math.cos(ang) * 0.302);
      patch.rotation.y = ang;
      g.add(patch);
    }
    // 桶身标识
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), mat('yellowPaint'));
    label.position.set(0, 0.58, 0.303); g.add(label);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mergeGroup(g);
    g.position.set(x, 0, z);
    this.root.add(g);
    this.collider(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3);
    if (fire) {
      this.game.effects && this.game.effects.addFireSource(new THREE.Vector3(x, 0.95, z), 0.4);
      this.pointLight(x, 1.6, z, 0xff8a3a, 2.5, 12, true);
    }
    return g;
  }
  tank(x, z, r, h, matName = 'metal') {
    this.mesh(new THREE.CylinderGeometry(r, r, h, 32), matName, x, h / 2, z);
    this.mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), matName, x, h, z).scale.y = 0.25;
    // 碰撞：近似为内接方框 + 边角
    const s = r * 0.85;
    this.collider(x - s, 0, z - s, x + s, h, z + s);
    this.collider(x - r, 0, z - r * 0.5, x + r, h, z + r * 0.5);
    this.collider(x - r * 0.5, 0, z - r, x + r * 0.5, h, z + r);
    // 楼梯环/扶手
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.05, 6, 32), mat('darkMetal'));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, h * 0.5, z); this.root.add(ring);
  }
  pipe(x0, z0, x1, z1, y, r = 0.4, collide = true) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.CylinderGeometry(r, r, len, 16);
    g.rotateZ(Math.PI / 2);
    const m = this.mesh(g, 'metal', (x0 + x1) / 2, y, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    if (collide) this.collider(Math.min(x0, x1) - r, y - r, Math.min(z0, z1) - r, Math.max(x0, x1) + r, y + r, Math.max(z0, z1) + r);
    // 支架
    const n = Math.floor(len / 6);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0.5;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      this.box(px, 0, pz, 0.2, y - r, 0.2, 'darkMetal');
    }
  }
  tree(x, z, s = 1, kind = 'broad') {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 3 * s, 8), mat('trunk'));
    trunk.position.y = 1.5 * s; g.add(trunk);
    if (kind === 'pine' || kind === 'pineSnow') {
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry((1.8 - i * 0.35) * s, 2.2 * s, 9), mat(i % 2 && kind === 'pineSnow' ? 'pineSnow' : 'pine'));
        c.position.y = (2.2 + i * 1.2) * s; c.rotation.y = i; g.add(c);
      }
    } else if (kind === 'palm') {
      trunk.scale.set(0.8, 2, 0.8); trunk.position.y = 3 * s; trunk.rotation.z = 0.08;
      for (let i = 0; i < 8; i++) {
        const lg = new THREE.PlaneGeometry(0.7 * s, 3.2 * s, 1, 4);
        const pos = lg.attributes.position;
        for (let v = 0; v < pos.count; v++) { const yy = pos.getY(v) + 1.6 * s; pos.setY(v, yy); pos.setZ(v, -yy * yy * 0.12 / s); }
        lg.rotateX(-Math.PI / 2 + 0.6);
        const l = new THREE.Mesh(lg, mat('palm'));
        l.position.y = 6 * s; l.rotation.y = i / 8 * Math.PI * 2; g.add(l);
      }
    } else {
      const r = mulberry32(Math.floor(x * 13 + z * 7));
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry((1.1 + r() * 0.6) * s, 1), mat('leaves'));
        c.position.set((r() - 0.5) * 1.6 * s, (3.2 + r() * 1.4) * s, (r() - 0.5) * 1.6 * s); g.add(c);
      }
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mergeGroup(g);
    g.position.set(x, 0, z);
    this.root.add(g);
    this.collider(x - 0.25 * s, 0, z - 0.25 * s, x + 0.25 * s, 4 * s, z + 0.25 * s);
  }
  rock(x, z, s = 1, matName = 'rock', collide = true) {
    const g = new THREE.DodecahedronGeometry(s, 1);
    const p = g.attributes.position; const r = mulberry32(Math.floor(x * 31 + z * 17));
    for (let i = 0; i < p.count; i++) { const k = 0.75 + r() * 0.45; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
    g.computeVertexNormals();
    const m = this.mesh(g, matName, x, s * 0.25, z);
    m.rotation.y = r() * 6;
    if (collide) this.collider(x - s * 0.7, 0, z - s * 0.7, x + s * 0.7, s * 0.8, z + s * 0.7);
  }
  lampPost(x, z, color = 0xffd8a0, rotY = 0, intensity = 18, light = true) {
    // 底座 + 基座 + 分段灯杆
    this.box(x, 0, z, 0.46, 0.1, 0.46, 'darkMetal');
    this.box(x, 0.1, z, 0.3, 0.42, 0.3, 'darkMetal');
    this.box(x, 0.52, z, 0.17, 5.0, 0.17, 'darkMetal');
    this.box(x, 5.42, z, 0.24, 0.12, 0.24, 'darkMetal', { collide: false });
    this.box(x, 5.86, z, 0.1, 0.2, 0.1, 'darkMetal', { collide: false });
    // 检修门
    this.box(x, 0.8, z + 0.09, 0.14, 0.4, 0.03, 'steel', { collide: false });
    const ax = Math.sin(rotY) * 1.25, az = Math.cos(rotY) * 1.25;
    // 横臂
    this.box(x + ax / 2, 5.58, z + az / 2, Math.abs(ax) + 0.1, 0.09, Math.abs(az) + 0.1, 'darkMetal', { collide: false });
    // 灯罩：外壳 + 底部发光面
    this.box(x + ax, 5.48, z + az, 0.52, 0.16, 0.52, 'darkMetal', { collide: false });
    this.box(x + ax, 5.39, z + az, 0.4, 0.05, 0.4, 'lamp', { collide: false });
    this.box(x + ax, 5.57, z + az, 0.58, 0.04, 0.58, 'darkMetal', { collide: false });
    if (light) this.spotLight(x + ax, 5.3, z + az, color, intensity);
  }
  pointLight(x, y, z, color, intensity, dist, flicker = false) {
    if (this.lights.length >= (this.game.settings.maxLights ?? (this.game.settings.quality === 'low' ? 4 : 10))) return null;
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    this.root.add(l); this.lights.push(l);
    if (flicker) this.animated.push(t => { l.intensity = intensity * (0.8 + Math.sin(t * 17 + x) * 0.1 + Math.random() * 0.15); });
    return l;
  }
  spotLight(x, y, z, color, intensity) {
    if (this.lights.length >= (this.game.settings.maxLights ?? (this.game.settings.quality === 'low' ? 4 : 10))) return null;
    const l = new THREE.SpotLight(color, intensity * 3, 24, 0.9, 0.6, 1.6);
    l.position.set(x, y, z); l.target.position.set(x, 0, z);
    this.root.add(l, l.target); this.lights.push(l);
    return l;
  }
  neon(x, y, z, w, h, color, rotY = 0) {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 5 });
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), mat('darkMetal'));
    const tube = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.08, 0.1), m); tube.position.set(0, h / 2 - 0.12, 0.05);
    const tube2 = tube.clone(); tube2.position.y = -h / 2 + 0.12;
    const vt = new THREE.Mesh(new THREE.BoxGeometry(0.08, h - 0.2, 0.1), m); vt.position.set(-w / 2 + 0.12, 0, 0.05);
    const vt2 = vt.clone(); vt2.position.x = w / 2 - 0.12;
    g.add(frame, tube, tube2, vt, vt2);
    // 文字条
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry((w - 0.8) * (0.5 + 0.5 * ((i * 7) % 3) / 2), 0.06, 0.1), m);
      bar.position.set(0, (i - 1) * h * 0.22, 0.05); g.add(bar);
    }
    g.position.set(x, y, z); g.rotation.y = rotY;
    this.root.add(g);
    const flick = Math.random() < 0.3;
    if (flick) this.animated.push(t => { m.emissiveIntensity = Math.sin(t * 23 + x) > 0.93 ? 0.3 : 5; });
    return g;
  }
  awning(x, z, w, d, y, matName, rotY = 0) {
    const g = new THREE.PlaneGeometry(w, d);
    const m = this.mesh(g, matName, x, y, z);
    m.rotation.set(-Math.PI / 2 + 0.25, rotY, 0, 'YXZ');
    // 支柱
    this.box(x - w / 2 + 0.1, 0, z + d / 2 - 0.1, 0.08, y - 0.1, 0.08, 'wood', { collide: false });
    this.box(x + w / 2 - 0.1, 0, z + d / 2 - 0.1, 0.08, y - 0.1, 0.08, 'wood', { collide: false });
  }
  stairs(x, z, w, len, h, dir = 'n', matName = 'concrete') {
    const n = Math.ceil(h / 0.3), sh = h / n, sl = len / n;
    for (let i = 0; i < n; i++) {
      const hh = sh * (i + 1);
      let cx = x, cz = z, bw = w, bd = sl;
      if (dir === 'n') cz = z + len / 2 - sl * (i + 0.5);
      if (dir === 's') cz = z - len / 2 + sl * (i + 0.5);
      if (dir === 'e') { bw = sl; bd = w; cx = x - len / 2 + sl * (i + 0.5); }
      if (dir === 'w') { bw = sl; bd = w; cx = x + len / 2 - sl * (i + 0.5); }
      this.box(cx, 0, cz, bw, hh, bd, matName);
    }
  }
  watchtower(x, z, h = 4) {
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) this.box(x + dx, 0, z + dz, 0.2, h + 1.2, 0.2, 'wood');
    this.box(x, h, z, 3.2, 0.2, 3.2, 'wood');
    this.box(x, h + 0.2, z - 1.55, 3.2, 1.0, 0.1, 'wood');
    this.box(x, h + 0.2, z + 1.55, 3.2, 1.0, 0.1, 'wood');
    this.box(x - 1.55, h + 0.2, z, 0.1, 1.0, 3.2, 'wood');
    this.box(x + 1.55, h + 0.2, z, 0.1, 1.0, 3.2, 'wood');
    this.box(x, h + 2.2, z, 3.6, 0.15, 3.6, 'metalRoof');
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) this.box(x + dx, h + 1.2, z + dz, 0.12, 1.0, 0.12, 'wood', { collide: false });
  }
  tent(x, z, w, d, rotY = 0) {
    const g = new THREE.CylinderGeometry(w / 2, w / 2, d, 3, 1, true);
    g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2 + rotY);
    const m = this.mesh(g, 'tarp', x, w * 0.25, z);
    m.rotation.x = 0;
    const along = Math.abs(Math.sin(rotY)) > 0.7;
    // 四角地钉 + 门口踏板
    const hw = along ? d / 2 : w / 2, hd = along ? w / 2 : d / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.box(x + sx * hw * 0.92, 0, z + sz * hd * 0.92, 0.06, 0.14, 0.06, 'darkMetal', { collide: false });
    }
    this.box(x, 0, z + hd, along ? 1.0 : 0.6, 0.03, along ? 0.6 : 1.0, 'wood', { collide: false });
    this.collider(x - (along ? d / 2 : w / 2) * 0.9, 0, z - (along ? w / 2 : d / 2) * 0.9, x + (along ? d / 2 : w / 2) * 0.9, w * 0.6, z + (along ? w / 2 : d / 2) * 0.9);
  }

  // ---------- 环境 ----------
  setupEnvironment(env) {
    const game = this.game, scene = this.scene;
    this.env = env;
    scene.fog = new THREE.FogExp2(env.fog, env.fogDensity);
    game.renderer.toneMappingExposure = env.exposure ?? 1;
    const hemi = new THREE.HemisphereLight(env.sky2 || 0xbfd6ff, env.ground || 0x6b5a45, env.hemi ?? 0.6);
    this.root.add(hemi);
    const sun = new THREE.DirectionalLight(env.sunColor, env.sun);
    const sd = new THREE.Vector3(...env.sunDir).normalize();
    this.sunDir = sd;
    sun.castShadow = true;
    const q = game.settings.quality;
    // 大地图（如 400m 机场）阴影贴图降一档，避免高分辨率阴影拖慢帧率
    const big = this.def.size > 250;
    const ss = q === 'high' ? (big ? 2048 : 4096) : q === 'medium' ? 2048 : 1024;
    sun.shadow.mapSize.set(ss, ss);
    const sc = sun.shadow.camera;
    const R = Math.min(70, this.half + 10);
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    sun.position.copy(sd).multiplyScalar(150);
    this.root.add(sun, sun.target);
    this.sun = sun; this.hemi = hemi;
    // 天空
    let skyMesh;
    if (env.sky === 'night') {
      skyMesh = nightSky(sd, env);
    } else {
      const sky = new Sky();
      sky.scale.setScalar(1800);
      const u = sky.material.uniforms;
      u.turbidity.value = env.turbidity ?? 6; u.rayleigh.value = env.rayleigh ?? 1.5;
      u.mieCoefficient.value = env.mie ?? 0.005; u.mieDirectionalG.value = 0.85;
      u.sunPosition.value.copy(sd);
      skyMesh = sky;
    }
    this.root.add(skyMesh);
    // 环境贴图
    const pm = new THREE.PMREMGenerator(game.renderer);
    const envScene = new THREE.Scene();
    envScene.add(skyMesh.clone());
    if (env.sky === 'night') envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: 0x070a14, side: THREE.BackSide })));
    const rt = pm.fromScene(envScene, 0.04, 0.1, 2000);
    scene.environment = rt.texture;
    scene.environmentIntensity = env.envIntensity ?? 0.6;
    this._envRT = rt; pm.dispose();
    // 远山
    if (env.mountains) this.mountains(env.mountains);
  }
  mountains(matName) {
    const n = new TileNoise(3, 64);
    const segs = 96, rIn = this.half + 60, rOut = this.half + 260;
    const g = new THREE.CylinderGeometry(rIn, rOut, 1, segs, 1, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const a = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
      if (y > 0) { p.setY(i, 20 + n.fbm(a, 0.3, 6, 4) * 90); }
      else p.setY(i, -1);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(matName));
    m.material = m.material.clone(); m.material.side = THREE.DoubleSide;
    m.receiveShadow = false;
    this.root.add(m);
  }
  ground(matName, size) {
    const s = size || this.def.size + 80;
    this.box(0, -1, 0, s, 1, s, matName, { texScale: mat(matName).userData.texScale });
  }
  bounds() {
    const h = this.half;
    this.collider(-h - 1, -1, -h - 1, h + 1, 30, -h);
    this.collider(-h - 1, -1, h, h + 1, 30, h + 1);
    this.collider(-h - 1, -1, -h, -h, 30, h);
    this.collider(h, -1, -h, h + 1, 30, h);
  }

  finalize() {
    for (const [m, list] of this.geoLists) {
      // 移除非索引/索引差异：统一非索引
      const geos = list.map(g => g.index ? g.toNonIndexed() : g);
      geos.forEach(g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); });
      const merged = mergeGeometries(geos, false);
      list.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = m !== mat('sand') && m !== mat('snow');
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    this.geoLists.clear();
    this.batchStatic();
    this.buildGrid();
    this.buildTopDown();
  }

  // 把所有静态道具按材质合并成少量大网格：显著降低 draw call（AI/载具/树木较多的地图收益最大）
  batchStatic() {
    const meshes = [];
    this.root.updateMatrixWorld(true);
    this.root.traverse(o => {
      if (!o.isMesh || !o.material || Array.isArray(o.material) || o.material.isShaderMaterial) return;
      meshes.push(o);
    });
    if (meshes.length < 2) return;
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const byMat = new Map();
    for (const mesh of meshes) {
      let geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().copy(inv).multiply(mesh.matrixWorld));
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      let e = byMat.get(mesh.material);
      if (!e) { e = { geos: [], cast: false, receive: false }; byMat.set(mesh.material, e); }
      e.geos.push(geo);
      e.cast = e.cast || mesh.castShadow;
      e.receive = e.receive || mesh.receiveShadow;
      mesh.parent.remove(mesh);
    }
    for (const [material, e] of byMat) {
      const merged = e.geos.length === 1 ? e.geos[0] : mergeGeometries(e.geos, false);
      if (!merged) {
        // 合并失败时退回独立网格，绝不丢几何
        for (const geo of e.geos) this.root.add(new THREE.Mesh(geo, material));
        continue;
      }
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = e.cast; mesh.receiveShadow = e.receive;
      this.root.add(mesh);
    }
  }

  update(dt, t, camPos) {
    for (const f of this.animated) f(t, dt);
    if (this.sun && camPos) {
      const tx = Math.round(camPos.x / 4) * 4, tz = Math.round(camPos.z / 4) * 4;
      this.sun.target.position.set(tx, 0, tz);
      this.sun.position.set(tx, 0, tz).addScaledVector(this.sunDir, 150);
    }
  }

  // ---------- 碰撞查询 ----------
  raycast(o, d, maxT, ignorePen = false) {
    let best = maxT, hit = null;
    const bx = this.boxes;
    for (let i = 0; i < bx.length; i++) {
      const b = bx[i];
      const t = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, b, best);
      if (t >= 0 && t < best) { best = t; hit = b; }
    }
    if (!hit) return null;
    const px = o.x + d.x * best, py = o.y + d.y * best, pz = o.z + d.z * best;
    const e = 0.002;
    let nx = 0, ny = 0, nz = 0;
    if (Math.abs(px - hit.x0) < e) nx = -1; else if (Math.abs(px - hit.x1) < e) nx = 1;
    else if (Math.abs(py - hit.y0) < e) ny = -1; else if (Math.abs(py - hit.y1) < e) ny = 1;
    else if (Math.abs(pz - hit.z0) < e) nz = -1; else nz = 1;
    return { t: best, point: new THREE.Vector3(px, py, pz), normal: new THREE.Vector3(nx, ny, nz), box: hit };
  }
  // 两点之间是否有遮挡
  lineBlocked(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.01) return false;
    const ix = dx / L, iy = dy / L, iz = dz / L;
    const bx = this.boxes;
    for (let i = 0; i < bx.length; i++) {
      if (rayAABB(a.x, a.y, a.z, ix, iy, iz, bx[i], L - 0.05) >= 0) return true;
    }
    return false;
  }
  // 圆柱体与方块碰撞，修改 pos，返回是否着地
  collide(pos, vel, radius, height, step = 0.45) {
    const bx = this.boxes;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < bx.length; i++) {
        const b = bx[i];
        if (b.y1 <= pos.y + step || b.y0 >= pos.y + height) continue;
        if (pos.x + radius < b.x0 || pos.x - radius > b.x1 || pos.z + radius < b.z0 || pos.z - radius > b.z1) continue;
        const cx = clamp(pos.x, b.x0, b.x1), cz = clamp(pos.z, b.z0, b.z1);
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = radius - d;
          dx /= d; dz /= d;
          pos.x += dx * push; pos.z += dz * push;
          const vn = vel.x * dx + vel.z * dz;
          if (vn < 0) { vel.x -= vn * dx; vel.z -= vn * dz; }
        } else {
          // 中心在盒内
          const l = pos.x - b.x0, r = b.x1 - pos.x, n = pos.z - b.z0, s = b.z1 - pos.z;
          const m = Math.min(l, r, n, s);
          if (m === l) pos.x = b.x0 - radius; else if (m === r) pos.x = b.x1 + radius;
          else if (m === n) pos.z = b.z0 - radius; else pos.z = b.z1 + radius;
        }
      }
    }
  }
  groundHeight(x, z, feetY, radius, step = 0.45) {
    let g = 0;
    const bx = this.boxes;
    const r = radius * 0.7;
    for (let i = 0; i < bx.length; i++) {
      const b = bx[i];
      if (b.y1 > feetY + step || b.y1 <= g) continue;
      if (x + r < b.x0 || x - r > b.x1 || z + r < b.z0 || z - r > b.z1) continue;
      g = b.y1;
    }
    return g;
  }
  ceilingHeight(x, z, feetY, radius) {
    let c = Infinity;
    const r = radius * 0.7;
    for (const b of this.boxes) {
      if (b.y0 < feetY + 0.5 || b.y0 >= c) continue;
      if (x + r < b.x0 || x - r > b.x1 || z + r < b.z0 || z - r > b.z1) continue;
      c = b.y0;
    }
    return c;
  }
  insideBuilding(p) { // 头顶有遮挡
    return this.ceilingHeight(p.x, p.z, p.y, 0.1) < p.y + 8;
  }

  // ---------- 导航网格 ----------
  buildGrid() {
    const cs = this.cs = 1;
    const n = this.gn = Math.ceil(this.def.size / cs);
    this.grid = new Uint8Array(n * n);
    const inf = 0.4;
    for (const b of this.boxes) {
      if (b.y1 <= 0.45 || b.y0 >= 1.7) continue;
      const ix0 = Math.floor((b.x0 - inf + this.half) / cs), ix1 = Math.floor((b.x1 + inf + this.half) / cs);
      const iz0 = Math.floor((b.z0 - inf + this.half) / cs), iz1 = Math.floor((b.z1 + inf + this.half) / cs);
      for (let z = Math.max(0, iz0); z <= Math.min(n - 1, iz1); z++)
        for (let x = Math.max(0, ix0); x <= Math.min(n - 1, ix1); x++) {
          // 细检查：单元中心是否在膨胀盒内
          const wx = (x + 0.5) * cs - this.half, wz = (z + 0.5) * cs - this.half;
          if (wx > b.x0 - inf - 0.5 && wx < b.x1 + inf + 0.5 && wz > b.z0 - inf - 0.5 && wz < b.z1 + inf + 0.5) {
            if (wx >= b.x0 - inf && wx <= b.x1 + inf && wz >= b.z0 - inf && wz <= b.z1 + inf) this.grid[z * n + x] = 1;
          }
        }
    }
    for (let i = 0; i < n; i++) { this.grid[i] = 1; this.grid[(n - 1) * n + i] = 1; this.grid[i * n] = 1; this.grid[i * n + n - 1] = 1; }
  }
  cellOf(x, z) { return [Math.floor((x + this.half) / this.cs), Math.floor((z + this.half) / this.cs)]; }
  walkable(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.gn && iz < this.gn && this.grid[iz * this.gn + ix] === 0; }
  nearestWalkable(ix, iz) {
    if (this.walkable(ix, iz)) return [ix, iz];
    for (let r = 1; r < 8; r++)
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
        if ((Math.abs(dx) === r || Math.abs(dz) === r) && this.walkable(ix + dx, iz + dz)) return [ix + dx, iz + dz];
    return null;
  }
  randomWalkable(cx = 0, cz = 0, rad = 1e9) {
    for (let i = 0; i < 60; i++) {
      const x = cx + (Math.random() * 2 - 1) * Math.min(rad, this.half - 2), z = cz + (Math.random() * 2 - 1) * Math.min(rad, this.half - 2);
      const [ix, iz] = this.cellOf(x, z);
      if (this.walkable(ix, iz) && this.ceilingHeight(x, z, 0, 0.3) > 2) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(cx, 0, cz);
  }
  gridLOS(ax, az, bx, bz) {
    let x0 = ax, z0 = az; const dx = Math.abs(bx - ax), dz = Math.abs(bz - az);
    const sx = ax < bx ? 1 : -1, sz = az < bz ? 1 : -1; let err = dx - dz;
    while (true) {
      if (!this.walkable(x0, z0)) return false;
      if (x0 === bx && z0 === bz) return true;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
      if (e2 > -dz && e2 < dx && (!this.walkable(x0 - sx, z0) || !this.walkable(x0, z0 - sz))) return false;
    }
  }
  findPath(from, to) {
    const n = this.gn;
    let s = this.cellOf(from.x, from.z), e = this.cellOf(to.x, to.z);
    s = this.nearestWalkable(s[0], s[1]); e = this.nearestWalkable(e[0], e[1]);
    if (!s || !e) return null;
    const si = s[1] * n + s[0], ei = e[1] * n + e[0];
    // 复用寻路缓冲区：400×400 大地图每帧 3 次寻路，避免反复分配数 MB 内存
    let buf = this._pathBuf;
    if (!buf || buf.n !== n) {
      buf = this._pathBuf = { n, g: new Float32Array(n * n), par: new Int32Array(n * n), closed: new Uint8Array(n * n), f: new Float32Array(n * n) };
    }
    const g = buf.g, par = buf.par, closed = buf.closed, f = buf.f;
    g.fill(1e9); par.fill(-1); closed.fill(0);
    const heap = new BinaryHeap(i => f[i]);
    g[si] = 0; f[si] = 0; heap.push(si);
    const ex = e[0], ez = e[1];
    const maxIter = n > 250 ? 24000 : 12000;
    let iter = 0, found = false;
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.size && iter++ < maxIter) {
      const c = heap.pop();
      if (c === ei) { found = true; break; }
      if (closed[c]) continue; closed[c] = 1;
      const cx = c % n, cz = (c / n) | 0;
      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (!this.walkable(nx, nz)) continue;
        if (dx && dz && (!this.walkable(cx + dx, cz) || !this.walkable(cx, cz + dz))) continue;
        const ni = nz * n + nx;
        if (closed[ni]) continue;
        const ng = g[c] + cost;
        if (ng < g[ni]) {
          g[ni] = ng; par[ni] = c;
          const hx = Math.abs(nx - ex), hz = Math.abs(nz - ez);
          f[ni] = ng + (hx + hz) + (1.414 - 2) * Math.min(hx, hz);
          heap.push(ni);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = ei; c !== -1; c = par[c]) cells.push(c);
    cells.reverse();
    // 路径平滑
    const pts = [];
    let anchor = 0;
    pts.push(cells[0]);
    for (let i = 2; i < cells.length; i++) {
      const a = cells[anchor], b = cells[i];
      if (!this.gridLOS(a % n, (a / n) | 0, b % n, (b / n) | 0)) { anchor = i - 1; pts.push(cells[anchor]); }
    }
    pts.push(cells[cells.length - 1]);
    const out = pts.map(c => new THREE.Vector3((c % n + 0.5) * this.cs - this.half, 0, (((c / n) | 0) + 0.5) * this.cs - this.half));
    out.shift();
    out.push(new THREE.Vector3(to.x, 0, to.z));
    return out;
  }

  // ---------- 小地图 ----------
  buildTopDown() {
    const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(30,34,30,0.9)'; ctx.fillRect(0, 0, N, N);
    const k = N / this.def.size;
    const sorted = [...this.boxes].filter(b => b.y1 > 0.3 && b.y1 < 40 && (b.x1 - b.x0) < this.def.size).sort((a, b) => a.y1 - b.y1);
    for (const b of sorted) {
      const v = Math.min(200, 70 + b.y1 * 12);
      ctx.fillStyle = `rgb(${v},${v},${v * 0.95})`;
      ctx.fillRect((b.x0 + this.half) * k, (b.z0 + this.half) * k, (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    }
    this.topDown = cv; this.topK = k;
  }

  dispose() {
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
    this.scene.remove(this.root);
    if (this._envRT) this._envRT.dispose();
    this.scene.environment = null;
    this.scene.fog = null;
  }
}

function nightSky(sunDir, env) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { moon: { value: sunDir.clone() }, top: { value: new THREE.Color(env.skyTop || 0x040814) }, hor: { value: new THREE.Color(env.skyHorizon || 0x1a2238) }, glow: { value: new THREE.Color(env.cityGlow || 0x000000) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 moon; uniform vec3 top; uniform vec3 hor; uniform vec3 glow;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 c = mix(hor, top, pow(h, 0.45));
        c += glow * pow(1.0 - h, 6.0);
        vec3 sp = floor(d * 420.0);
        float s = hash(sp);
        if (s > 0.9975 && d.y > 0.05) c += vec3(0.8 + 0.2*hash(sp+1.0)) * (s - 0.9975) * 380.0 * h;
        float md = dot(d, normalize(moon));
        c += vec3(0.9,0.95,1.0) * smoothstep(0.9993, 0.9996, md) * 3.0;
        c += vec3(0.25,0.3,0.4) * pow(max(md,0.0), 60.0) * 0.4;
        if (d.y < 0.0) c = hor * 0.6;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), m);
  s.frustumCulled = false;
  return s;
}
