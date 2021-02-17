export const PROTOCOL_VERSION = 1;

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

function wsBase(host) {
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  if (!host) return proto + '//' + loc.host;
  if (/^wss?:\/\//.test(host)) return host.replace(/\/$/, '');
  if (/^https:\/\//.test(host)) return 'wss://' + host.slice('https://'.length).replace(/\/$/, '');
  if (/^http:\/\//.test(host)) return 'ws://' + host.slice('http://'.length).replace(/\/$/, '');
  return proto + '//' + host.replace(/\/$/, '');
}

class WsTransport {
  constructor(base) {
    this.kind = 'websocket';
    this.base = base;
    this.ws = null;
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
  }
  connect() {
    const ws = new WebSocket(this.base + '/pikichannel/ws');
    this.ws = ws;
    ws.onopen = () => this.onopen && this.onopen();
    ws.onmessage = (e) => this.onmessage && this.onmessage(e.data);
    ws.onclose = () => this.onclose && this.onclose();
    ws.onerror = () => this.onerror && this.onerror(new Error('websocket error'));
  }
  send(frame) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(frame); }
  close() { if (this.ws) { try { this.ws.close(); } catch (e) {} } }
  isOpen() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }
}

class RtcTransport {
  constructor(cfg) {
    this.kind = 'webrtc';
    this.base = cfg.base;
    this.rendezvous = cfg.rendezvous || null;
    this.nodeId = cfg.nodeId || null;
    this.pc = null; this.dc = null; this.signal = null;
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
  }
  async connect() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    const dc = pc.createDataChannel('piki', { ordered: true });
    this.dc = dc;

    let remoteSet = false;
    const pendingRemote = [];
    const onAnswer = async (sdp) => { await pc.setRemoteDescription({ type: 'answer', sdp }); remoteSet = true; for (const c of pendingRemote.splice(0)) { try { await pc.addIceCandidate(c); } catch (e) {} } };
    const onCandidate = async (cand) => { if (remoteSet) { try { await pc.addIceCandidate(cand); } catch (e) {} } else pendingRemote.push(cand); };

    dc.onopen = () => { this.onopen && this.onopen(); try { this.signal && this.signal.close(); } catch (e) {} };
    dc.onmessage = (e) => this.onmessage && this.onmessage(e.data);
    dc.onclose = () => this.onclose && this.onclose();
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed' || s === 'disconnected') this.onclose && this.onclose();
    };

    const useRendezvous = !!(this.rendezvous && this.nodeId);
    const signal = new WebSocket(useRendezvous ? this.rendezvous : this.base + '/pikichannel/signal');
    this.signal = signal;

    if (useRendezvous) {
      let sessionId = null;
      pc.onicecandidate = (e) => { if (e.candidate && sessionId && signal.readyState === WebSocket.OPEN) signal.send(JSON.stringify({ t: 'signal', sessionId, data: { kind: 'candidate', candidate: e.candidate.toJSON() } })); };
      signal.onopen = () => signal.send(JSON.stringify({ t: 'dial', nodeId: this.nodeId }));
      signal.onmessage = async (m) => {
        let msg; try { msg = JSON.parse(m.data); } catch (e) { return; }
        if (msg.t === 'dialed') {
          sessionId = msg.sessionId;
          const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
          signal.send(JSON.stringify({ t: 'signal', sessionId, data: { kind: 'offer', type: offer.type, sdp: offer.sdp } }));
        } else if (msg.t === 'signal' && msg.data) {
          const d = msg.data;
          if (d.kind === 'answer') await onAnswer(d.sdp);
          else if (d.kind === 'candidate' && d.candidate) await onCandidate(d.candidate);
          else if (d.kind === 'error') this.onerror && this.onerror(new Error(d.message || 'signaling error'));
        } else if (msg.t === 'error') { this.onerror && this.onerror(new Error(msg.message || 'rendezvous error')); }
        else if (msg.t === 'close') { this.onclose && this.onclose(); }
