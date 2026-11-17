// Peer-to-peer link (WebRTC via PeerJS). One host, one guest; the host shares a short room code.
// Static hosting is enough: PeerJS's public broker only introduces the two browsers.
//
// Two channels ride the same peer connection:
//   reliable  (PeerJS default)  - start / bye / again: rare, must arrive.
//   fast      (unordered, no retransmit) - snapshots and inputs: the newest packet is all that matters, and a lost
//             one must never hold up the ones behind it (that head-of-line blocking is what made a poor link freeze
//             and then fast-forward). If the fast channel can't open, sendFast() quietly falls back to reliable.
const NET = {
  peer: null, conn: null, fast: null, code: '', host: false,
  onMsg: null,      // (msg) => void
  onStatus: null,   // ('waiting'|'connecting'|'connected'|'closed'|'error', info) => void
  ICE: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }] },
  _status(s, i) { if (this.onStatus) this.onStatus(s, i); },
  _id(code) { return 'bubble-dragons-game-' + code; },
  _openFast(conn) {
    this.fast = null;
    try {
      const pc = conn.peerConnection; if (!pc) return;
      // negotiated channel with a fixed id: both sides create it, no signalling round-trip needed
      const ch = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0, negotiated: true, id: 7 });
      ch.onmessage = e => { if (this.conn !== conn) return; try { if (this.onMsg) this.onMsg(JSON.parse(e.data)); } catch (err) { } };
      this.fast = ch;
    } catch (e) { this.fast = null; }
  },
  _wire(conn) {
    this.conn = conn;
    const opened = () => { if (this.conn !== conn || this._wired === conn) return; this._wired = conn; this._openFast(conn); this._status('connected'); };
    conn.on('open', opened);
    conn.on('data', m => { if (this.onMsg) this.onMsg(m); });
    conn.on('close', () => { if (this.conn === conn) this._status('closed'); });
    conn.on('error', e => this._status('error', String(e && e.message || e)));
    if (conn.open) opened();
  },
  close() {
    const p = this.peer, c = this.conn; this.peer = null; this.conn = null; this.fast = null; this._wired = null;
    try { if (c) c.close(); } catch (e) { } try { if (p) p.destroy(); } catch (e) { }
  },
  send(m) { if (this.conn && this.conn.open) this.conn.send(m); },
  sendFast(m) {
    const f = this.fast;
    if (f && f.readyState === 'open') { try { f.send(JSON.stringify(m, (k, v) => typeof v === 'number' && v % 1 ? Math.round(v * 100) / 100 : v)); return; } catch (e) { } }
    this.send(m);
  },
  get fastOpen() { return !!(this.fast && this.fast.readyState === 'open'); },
  get connected() { return !!(this.conn && this.conn.open); },
  // Guest: the link went dead mid-game (no close event ever came). Throw the old connection away and dial the host again.
  rejoin() {
    const peer = this.peer; if (this.host || !peer || peer.destroyed) return false;
    if (peer.disconnected) { try { peer.reconnect(); } catch (e) { } return true; }
    const old = this.conn; this.conn = null; this.fast = null; this._wired = null; try { if (old) old.close(); } catch (e) { }
    try { this._wire(peer.connect(this._id(this.code), { reliable: true })); } catch (e) { return false; }
    return true;
  },
  // Host: create a room. Retries with a new code if the id is taken.
  hostRoom(tries = 0) {
    this.close(); this.host = true;
    if (typeof Peer === 'undefined') return this._status('error', 'Network library failed to load.');
    const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let code = '';
    for (let i = 0; i < 4; i++) code += alpha[Math.floor(Math.random() * alpha.length)];
    const peer = new Peer(this._id(code), { config: this.ICE }); this.peer = peer; this.code = code;
    peer.on('open', () => this._status('waiting', code));
    // a second connection is only accepted when the current one is dead (guest re-joining after a drop); canReplace() is supplied by the game
    peer.on('connection', c => {
      if (this.conn && this.conn.open) {
        if (!(this.canReplace && this.canReplace())) { c.close(); return; }
        const old = this.conn; this.conn = null; this.fast = null; this._wired = null; try { old.close(); } catch (e) { }
      }
      this._wire(c);
    });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 5) return this.hostRoom(tries + 1);
      this._status('error', e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the matchmaking server.' : String(e.type || e));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
  },
  // Guest: join a room by code.
  joinRoom(code) {
    this.close(); this.host = false; code = String(code || '').trim().toUpperCase();
    if (typeof Peer === 'undefined') return this._status('error', 'Network library failed to load.');
    if (code.length !== 4) return this._status('error', 'Room codes are 4 characters.');
    const peer = new Peer(undefined, { config: this.ICE }); this.peer = peer; this.code = code; this._status('connecting');
    peer.on('open', () => {
      const c = peer.connect(this._id(code), { reliable: true });
      const t = setTimeout(() => { if (!c.open) this._status('error', 'No answer. Check the code and try again.'); }, 20000);
      c.on('open', () => clearTimeout(t));
      this._wire(c);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });   // lost the matchmaking socket: get it back so we can re-join
    peer.on('error', e => this._status('error', e.type === 'peer-unavailable' ? 'No room with that code.' : e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the matchmaking server.' : String(e.type || e)));
  },
};
