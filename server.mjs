#!/usr/bin/env node
// 现代战线 · 局域网联机服务器
// 用法：node server.mjs [端口]   （默认 8080）
// 零依赖：静态资源服务 + 房间制 WebSocket 中继（自实现协议帧）
// 局域网玩家用浏览器打开 http://<本机局域网IP>:<端口> 即可加入房间。

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const MAX_MSG = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// ---------------- WebSocket 帧编解码 ----------------
// RFC 6455 §1.3 的魔法字符串（校验用样例 key dGhlIHNhbXBsZSBub25jZQ== → s3pPLMBiTxaQ9kYGzzhZRbK+xOo=）
const WSGUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const encFrame = str => {
  const p = Buffer.from(str), n = p.length;
  let h;
  if (n < 126) { h = Buffer.alloc(2); h[1] = n; }
  else if (n < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  h[0] = 0x81;
  return Buffer.concat([h, p]);
};

function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return false; }
  const acc = crypto.createHash('sha1').update(key + WSGUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  return true;
}

// 解析 TCP 缓冲区中的帧，逐条回调文本消息；返回剩余未处理字节
function wsParse(buf, onText, onClose) {
  let off = 0;
  while (off + 2 <= buf.length) {
    const b0 = buf[off], b1 = buf[off + 1];
    const opcode = b0 & 0x0f, masked = b1 & 0x80;
    let len = b1 & 0x7f, need = 2;
    if (len === 126) { if (off + 4 > buf.length) break; len = buf.readUInt16BE(off + 2); need = 4; }
    else if (len === 127) { if (off + 10 > buf.length) break; len = Number(buf.readBigUInt64BE(off + 2)); need = 10; }
    if (len > MAX_MSG) { onClose && onClose(); return -1; }
    const maskOff = off + need;
    const total = need + (masked ? 4 : 0) + len;
    if (off + total > buf.length) break;
    let payload = buf.subarray(maskOff + (masked ? 4 : 0), off + total);
    if (masked) {
      const mask = buf.subarray(maskOff, maskOff + 4);
      const out = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
      payload = out;
    }
    off += total;
    if (opcode === 1) { const s = payload.length ? payload.toString('utf8') : ''; try { onText(s); } catch (e) { console.error(e); } }
    else if (opcode === 8) { onClose && onClose(); return -1; }
    // 0=continued 2=binary 9=ping 10=pong：小负载下浏览器总是单帧文本，忽略其余
  }
  return off;
}

// ---------------- 房间与会话 ----------------
let nextCid = 1;
const rooms = new Map();      // id -> {id, name, ss:[socket...], cfg, playing}
const sess = new Map();       // socket -> {cid, name, room, host}
const uid = () => crypto.randomBytes(3).toString('hex');

function send(socket, obj) {
  if (!socket || socket.destroyed || !socket.writable) return;
  try { socket.write(encFrame(JSON.stringify(obj))); } catch { }
}
function roomOf(socket) { return sess.get(socket)?.room; }

function broadcastLobby(room) {
  if (!room) return;
  const players = room.ss.map(s => { const x = sess.get(s) || {}; return { c: x.cid, n: x.name, h: !!x.host }; });
  const msg = { t: 'lobby', id: room.id, name: room.name, players, playing: room.playing, cfg: room.cfg };
  for (const s of room.ss) send(s, msg);
}
function removeSocket(socket) {
  const x = sess.get(socket);
  if (!x) return;
  const room = x.room;
  sess.delete(socket);
  if (room) {
    const i = room.ss.indexOf(socket);
    if (i >= 0) room.ss.splice(i, 1);
    if (x.host && room.ss.length) {
      const n = room.ss[0];
      const ns = sess.get(n);
      if (ns) { ns.host = true; send(n, { t: 'host' }); }
    }
    if (!room.ss.length) rooms.delete(room.id);
    else broadcastLobby(room);
  }
}
function listRooms() {
  const list = [];
  for (const r of rooms.values()) list.push({ id: r.id, name: r.name, n: r.ss.length, playing: r.playing, cfg: r.cfg });
  return list;
}

// ---------------- 消息处理 ----------------
function onMsg(socket, text) {
  let m;
  try { m = JSON.parse(text); } catch { return; }
  const x = sess.get(socket);
  if (!x) return;
  switch (m.t) {
    case 'name': x.name = String(m.n || '').slice(0, 10) || '指挥官'; if (x.room) broadcastLobby(x.room); break;
    case 'rooms': send(socket, { t: 'rooms', list: listRooms() }); break;
    case 'create': {
      if (x.room) break;
      const id = uid(), r = { id, name: String(m.name || '无名房间').slice(0, 16), ss: [socket], cfg: m.cfg || null, playing: false };
      rooms.set(id, r);
      x.room = r; x.host = true;
      broadcastLobby(r);
      break;
    }
    case 'join': {
      if (x.room) break;
      const r = rooms.get(m.id);
      if (!r) { send(socket, { t: 'err', msg: '房间不存在或已解散' }); break; }
      if (r.ss.length >= 16) { send(socket, { t: 'err', msg: '房间已满（最多 16 人）' }); break; }
      r.ss.push(socket); x.room = r; x.host = false;
      broadcastLobby(r);
      break;
    }
    case 'leave': {
      const r = x.room; if (!r) break;
      const i = r.ss.indexOf(socket); if (i >= 0) r.ss.splice(i, 1);
      x.room = null;
      if (x.host && r.ss.length) { const ns = sess.get(r.ss[0]); if (ns) { ns.host = true; send(r.ss[0], { t: 'host' }); } }
      if (!r.ss.length) rooms.delete(r.id); else broadcastLobby(r);
      break;
    }
    case 'cfg': {
      const r = roomOf(socket); if (!r || !x.host) break;
      r.cfg = m.cfg || null;
      broadcastLobby(r);
      break;
    }
    case 'playing': {
      const r = roomOf(socket); if (!r || !x.host) break;
      r.playing = !!m.v;
      broadcastLobby(r);
      break;
    }
    case 'start': {
      const r = roomOf(socket); if (!r || !x.host) break;
      r.playing = true;
      for (const s of r.ss) if (s !== socket) send(s, { t: 'start', cfg: m.cfg });
      broadcastLobby(r);
      break;
    }
    case 'bc': {
      const r = roomOf(socket); if (!r) break;
      const out = { t: 'bc', c: x.cid, m: m.m };
      for (const s of r.ss) if (s !== socket) send(s, out);
      break;
    }
    case 'dm': {
      const r = roomOf(socket); if (!r) break;
      const to = r.ss.find(s => sess.get(s)?.cid === m.cid);
      if (to) send(to, { t: 'bc', c: x.cid, m: m.m });
      break;
    }
  }
}

// ---------------- 服务器 ----------------
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0].split('#')[0];
  let p = url === '/' ? '/index.html' : decodeURIComponent(url);
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  socket.on('error', () => { });
  if (!wsHandshake(req, socket)) return;
  const x = { cid: nextCid++, name: '指挥官' + nextCid, room: null, host: false, buf: null };
  sess.set(socket, x);
  send(socket, { t: 'ok', c: x.cid });
  socket.on('data', chunk => {
    try {
      let data = x.buf && x.buf.length ? Buffer.concat([x.buf, chunk]) : chunk;
      while (true) {
        const left = wsParse(data, s => onMsg(socket, s), () => socket.destroy());
        if (left === -1) { sess.delete(socket); try { socket.destroy(); } catch { } return; }
        if (left <= 0 || left >= data.length) { x.buf = left > 0 && left < data.length ? data.slice(left) : null; break; }
        data = data.slice(left);
      }
    } catch (e) { console.error(e); }
  });
  socket.on('close', () => removeSocket(socket));
  socket.on('error', () => removeSocket(socket));
});

setInterval(() => {
  for (const [socket, x] of sess) {
    try { socket.write(Buffer.from([0x89, 0x00])); } catch { }
  }
}, 25000);

const ips = [];
for (const [_, ifs] of Object.entries(os.networkInterfaces()))
  for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);

console.log('==========================================');
console.log('  现代战线 · 局域网联机服务器已启动');
console.log(`  本机访问：  http://localhost:${PORT}`);
for (const ip of ips) console.log(`  局域网访问： http://${ip}:${PORT}`);
console.log('  其他玩家在浏览器地址栏输入上面的「局域网访问」地址加入。');
console.log('  停止请在终端按 Ctrl+C。');
console.log('==========================================');
server.listen(PORT, '0.0.0.0', () => { });
