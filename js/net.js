// 局域网联机：连接、房间、消息总线
// 协议（与 server.mjs 对应）：
//   C→S {t:'name'|'rooms'|'create'|'join'|'leave'|'cfg'|'playing'|'start'|'bc'|'dm'}
//   S→C {t:'ok'|'rooms'|'err'|'lobby'|'host'|'start'|'bc'}   bc: 广播/定向中继的消息体在 m 里
export class Net {
  constructor(game) {
    this.game = game;
    this.state = 'off';        // off / connecting / on
    this.cid = 0;
    this.name = localStorage.getItem('mf_netname') || '';
    this.room = null;          // {id, name, players:[{c,n,h}], playing, cfg}
    this.error = null;
    this.handlers = new Map(); // kind -> Set<fn>
  }

  on(kind, fn) {
    if (!this.handlers.has(kind)) this.handlers.set(kind, new Set());
    this.handlers.get(kind).add(fn);
    return () => this.handlers.get(kind)?.delete(fn);
  }
  emit(kind, msg) {
    const set = this.handlers.get(kind);
    if (set) for (const fn of [...set]) { try { fn(msg); } catch (e) { console.error(e); } }
  }

  // 连到启动页面用的同一台服务器（必须由 node server.mjs 提供页面才能找到 ws 服务）
  connect() {
    if (this.state === 'on') return Promise.resolve();
    if (this.pend && this.pend.ws && this.pend.ws.readyState === 0) return this.pend.p;
    const self = this;
    let ws;
    const p = new Promise((res, rej) => {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      try { ws = new WebSocket(url); } catch (e) { rej(new Error('无法创建连接')); return; }
      let done = false;
      const fail = err => { if (!done) { done = true; self.state = 'off'; rej(new Error(err)); } };
      ws.onopen = () => {
        done = true; self.ws = ws; self.state = 'on'; self.error = null;
        self.send({ t: 'name', n: self.name });
        res();
      };
      ws.onerror = () => {
        if (!done) fail('ws失败');
        else return;
        self.error = '网关错误';
      };
      ws.onclose = () => {
        self.state = 'off'; self.ws = null; self.room = null; self.cid = 0;
        self.emit('closed', {});
        if (!done) fail('网关关闭');
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        self.recv(m);
      };
      setTimeout(() => { if (!done) fail('连接超时：请确认是由 node server.mjs 提供的页面'); }, 4000);
    });
    this.pend = { ws, p };
    return p;
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  setName(n) {
    this.name = String(n).slice(0, 10);
    localStorage.setItem('mf_netname', this.name);
    this.send({ t: 'name', n: this.name });
    if (this.room) this.room.players.forEach(p => { if (p.c === this.cid) p.n = this.name; });
  }
  refresh() { this.send({ t: 'rooms' }); }
  create(name, cfg) { this.send({ t: 'create', name, cfg }); }
  join(id) { this.send({ t: 'join', id }); }
  leave() { this.room = null; this.send({ t: 'leave' }); }
  setCfg(cfg) { this.send({ t: 'cfg', cfg }); }
  start(cfg) { this.send({ t: 'start', cfg }); }
  setPlaying(v) { this.send({ t: 'playing', v }); }
  // 游戏内广播 / 定向
  bc(m) { this.send({ t: 'bc', m }); }
  dm(cid, m) { this.send({ t: 'dm', cid, m }); }

  recv(m) {
    switch (m.t) {
      case 'ok': this.cid = m.c; break;
      case 'rooms': this.emit('rooms', m.list); break;
      case 'err': this.emit('err', m.msg); break;
      case 'lobby': {
        this.room = { id: m.id, name: m.name, players: m.players, playing: m.playing, cfg: m.cfg };
        this.isHost = !!m.players.find(p => p.c === this.cid)?.h;
        this.emit('lobby', this.room);
        break;
      }
      case 'host': this.isHost = true; if (this.room) this.emit('lobby', this.room); break;
      case 'start': this.emit('start', m.cfg); break;
      case 'bc': this.emit(m.m?.e, Object.assign({ s: m.c }, m.m)); break;
      case 'closed': break;
    }
  }

  dispose() {
    try { this.ws && this.ws.close(); } catch { }
    this.state = 'off'; this.ws = null; this.room = null;
  }
}
