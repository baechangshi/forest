// 다른 접속자의 흔적: 빛나는 발자국 + 짧은 메시지 (Firebase Firestore)
import * as THREE from 'three';
import { CHUNK } from './world.js';
import { GLOW_TEX } from './sky.js';

const TRAIL_DAYS = 2;            // 발자국은 최근 이틀 치만
const MSG_DAYS = 30;             // 메시지는 30일 동안 보임
const DAY = 86400000;
const MAX_PRINTS = 3000;
const LS = { local: 'forest.localMsgs', hidden: 'forest.hiddenMsgs', rate: 'forest.msgRate' };

const cellXY = (x, z) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];
const cellKey = (cx, cz) => cx + ',' + cz;
const dayIdx = (t = Date.now()) => Math.floor(t / DAY);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function ago(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return '방금'; if (m < 60) return m + '분 전';
  const h = Math.floor(m / 60); if (h < 24) return h + '시간 전';
  return Math.floor(h / 24) + '일 전';
}

export class Traces {
  constructor(scene, groundFn, labelsEl, account) {
    this.scene = scene; this.ground = groundFn; this.labelsEl = labelsEl; this.account = account;
    this.online = false; this.sid = Math.random().toString(36).slice(2, 12);
    this.trails = new Map();     // cell -> [{pts, t}]
    this.msgs = new Map();       // id -> {id,x,z,text,t,cell,mine}
    this.fetched = new Map();    // cell -> 마지막 조회 시각
    this.hidden = new Set(load(LS.hidden, []));
    this.my = { pts: [], cell: null, last: null, since: Date.now() };
    this.dirty = false; this.curCell = null;

    const g = new THREE.CircleGeometry(0.075, 7).rotateX(-Math.PI / 2).scale(0.75, 1, 1.35);
    this.printMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    this.prints = new THREE.InstancedMesh(g, this.printMat, MAX_PRINTS);
    this.prints.count = 0; this.prints.frustumCulled = false;
    this.prints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.prints);

    this.markerGroup = new THREE.Group(); scene.add(this.markerGroup);
    this.stoneGeo = new THREE.DodecahedronGeometry(0.22, 0);
    this.stoneMat = new THREE.MeshLambertMaterial({ color: 0x8e918a, flatShading: true });
    this.orbMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffd38a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.myOrbMat = new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0x9ff0d8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }); // 내가 남긴 메시지는 민트빛
    this.markers = new Map(); this.labels = new Map();
  }

  async init() {
    const a = this.account;
    if (!a.enabled) { this.loadLocal(); return false; }
    try {
      await a.init();
      this.db = a.db; this.fb = a.fb; this.online = true;
      a.onChange(() => this.refreshMine());
      return true;
    } catch (e) {
      console.warn('[forest] Firebase 연결 실패 — 혼자 걷는 모드로 전환', e);
      this.error = e.code || e.message || String(e);
      this.loadLocal(); return false;
    }
  }
  get uid() { return this.account.uid; }
  get canWrite() { return !this.online || this.account.isGoogle; }

  // 로그인 상태가 바뀌면 '내 메시지' 표시를 다시 계산
  refreshMine() {
    for (const [id, m] of this.msgs) {
      if (!m.uid) continue;
      const mine = m.uid === this.uid;
      if (mine === m.mine) continue;
      m.mine = mine;
      const g = this.markers.get(id); if (g) g.userData.orb.material = mine ? this.myOrbMat : this.orbMat;
      const l = this.labels.get(id); if (l) l.remove(); this.labels.delete(id);
    }
  }

  loadLocal() {
    for (const m of load(LS.local, [])) if (Date.now() - m.t < MSG_DAYS * DAY) this.addMsg({ ...m, mine: true });
  }

  /* ---------- 내 발자취 기록·업로드 ---------- */
  record(x, z) {
    const [cx, cz] = cellXY(x, z), cell = cellKey(cx, cz);
    if (this.my.cell !== cell) { this.flush(); this.my.cell = cell; this.my.pts = []; this.my.last = null; this.my.since = Date.now(); }
    const l = this.my.last;
    if (!l || Math.hypot(x - l[0], z - l[1]) > 1.4) {
      this.my.pts.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
      this.my.last = [x, z];
    }
    if (this.my.pts.length >= 150 || (Date.now() - this.my.since > 60000 && this.my.pts.length >= 8)) {
      const keep = this.my.pts.slice(-2); this.flush(); this.my.pts = keep; this.my.since = Date.now();
    }
  }
  flush() {
    const pts = this.my.pts;
    if (!this.online || !this.uid || pts.length < 8 || !this.my.cell) return;
    const now = Date.now();
    const doc = { k: this.my.cell + '|' + dayIdx(now), cell: this.my.cell, pts: pts.slice(0, 160), sid: this.sid, t: this.fb.serverTimestamp(), exp: this.fb.Timestamp.fromMillis(now + (TRAIL_DAYS + 1) * DAY) };
    this.fb.addDoc(this.fb.collection(this.db, 'trails'), doc).catch((e) => console.warn('[forest] trail', e));
  }

  /* ---------- 주변 흔적 불러오기 ---------- */
  async fetchAround(cx, cz) {
    const cells = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const k = cellKey(cx + dx, cz + dz), f = this.fetched.get(k);
      if (!f || Date.now() - f > 120000) cells.push(k);
    }
    if (!cells.length || !this.online) return;
    cells.forEach((k) => this.fetched.set(k, Date.now()));
    const fb = this.fb, d = dayIdx();
    const keys = [];
    cells.forEach((c) => { for (let i = 0; i < TRAIL_DAYS; i++) keys.push(c + '|' + (d - i)); });
    try {
      const [ts, ms] = await Promise.all([
        fb.getDocs(fb.query(fb.collection(this.db, 'trails'), fb.where('k', 'in', keys.slice(0, 30)), fb.limit(250))),
        fb.getDocs(fb.query(fb.collection(this.db, 'messages'), fb.where('cell', 'in', cells), fb.limit(150))),
      ]);
      cells.forEach((c) => this.trails.set(c, []));
      ts.forEach((doc) => {
        const v = doc.data(); if (v.sid === this.sid || !Array.isArray(v.pts)) return;
        const t = v.t?.toMillis?.() ?? Date.now();
        if (Date.now() - t > TRAIL_DAYS * DAY) return;
        (this.trails.get(v.cell) || this.trails.set(v.cell, []).get(v.cell)).push({ pts: v.pts, t });
      });
      ms.forEach((doc) => {
        const v = doc.data(), t = v.t?.toMillis?.() ?? Date.now();
        if (Date.now() - t > MSG_DAYS * DAY || typeof v.text !== 'string') return;
        this.addMsg({ id: doc.id, x: v.x, z: v.z, text: v.text.slice(0, 60), t, cell: v.cell, uid: v.uid, mine: !!this.uid && v.uid === this.uid });
      });
      this.dirty = true;
    } catch (e) { console.warn('[forest] fetch', e); cells.forEach((k) => this.fetched.delete(k)); }
  }

  /* ---------- 메시지 ---------- */
  canPost() {
    const r = load(LS.rate, { day: 0, n: 0, last: 0 });
    if (r.day !== dayIdx()) { r.day = dayIdx(); r.n = 0; }
    if (r.n >= 5) return { ok: false, why: '오늘은 흔적을 충분히 남겼어요. 내일 다시 남겨 주세요.' };
    if (Date.now() - r.last < 30000) return { ok: false, why: '잠시 후에 다시 남길 수 있어요.' };
    return { ok: true, r };
  }
  async post(text, x, z) {
    const c = this.canPost(); if (!c.ok) throw new Error(c.why);
    if (!this.canWrite) throw new Error('구글 로그인 후에 남길 수 있어요.');
    const [cx, cz] = cellXY(x, z), cell = cellKey(cx, cz), now = Date.now();
    x = Math.round(x * 10) / 10; z = Math.round(z * 10) / 10;
    let id = 'local-' + now;
    if (this.online) {
      const fb = this.fb;
      const ref = await fb.addDoc(fb.collection(this.db, 'messages'), { cell, x, z, text, sid: this.sid, uid: this.uid, t: fb.serverTimestamp(), exp: fb.Timestamp.fromMillis(now + (MSG_DAYS + 1) * DAY) });
      id = ref.id;
    } else {
      const list = load(LS.local, []); list.push({ id, x, z, text, t: now, cell }); save(LS.local, list.slice(-50));
    }
    c.r.n++; c.r.last = now; save(LS.rate, c.r);
    this.addMsg({ id, x, z, text, t: now, cell, uid: this.online ? this.uid : null, mine: true });
  }
  // 내가 남긴 메시지 지우기
  async remove(id) {
    if (this.online) await this.fb.deleteDoc(this.fb.doc(this.db, 'messages', id));
    else save(LS.local, load(LS.local, []).filter((m) => m.id !== id));
    this.drop(id);
  }
  drop(id) {
    const g = this.markers.get(id); if (g) this.markerGroup.remove(g);
    this.markers.delete(id); this.msgs.delete(id);
    const l = this.labels.get(id); if (l) l.remove(); this.labels.delete(id);
  }
  addMsg(m) {
    if (this.msgs.has(m.id) || this.hidden.has(m.id)) return;
    this.msgs.set(m.id, m);
    const g = new THREE.Group();
    const y = this.ground(m.x, m.z);
    g.position.set(m.x, y, m.z);
    [[0, 0.1, 0, 1.2], [0.05, 0.3, 0.02, 0.85], [-0.02, 0.46, 0, 0.6]].forEach(([x, yy, z, s]) => {
      const st = new THREE.Mesh(this.stoneGeo, this.stoneMat); st.position.set(x, yy, z); st.scale.set(s, s * 0.6, s); st.rotation.y = s * 5; g.add(st);
    });
    const orb = new THREE.Sprite(m.mine ? this.myOrbMat : this.orbMat); orb.scale.setScalar(0.38); orb.position.y = 1.05; g.add(orb);
    g.userData = { orb, ph: Math.random() * 6 };
    this.markerGroup.add(g); this.markers.set(m.id, g);
  }
  hide(id) {
    this.hidden.add(id); save(LS.hidden, [...this.hidden].slice(-300));
    this.drop(id);
  }

  /* ---------- 발자국 다시 그리기 ---------- */
  rebuild() {
    this.dirty = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    let n = 0;
    for (const list of this.trails.values()) for (const tr of list) {
      const pts = tr.pts, fresh = Math.max(0.35, 1 - (Date.now() - tr.t) / (TRAIL_DAYS * DAY));
      let side = 1, carry = 0;
      for (let i = 2; i < pts.length && n < MAX_PRINTS; i += 2) {
        const x0 = pts[i - 2], z0 = pts[i - 1], dx = pts[i] - x0, dz = pts[i + 1] - z0, L = Math.hypot(dx, dz);
        if (L < 0.01 || L > 6) continue;
        const ux = dx / L, uz = dz / L, ang = Math.atan2(ux, uz);
        for (let d = carry; d < L && n < MAX_PRINTS; d += 0.72) {
          const x = x0 + ux * d + uz * 0.12 * side, z = z0 + uz * d - ux * 0.12 * side;
          p.set(x, this.ground(x, z) + 0.035, z); q.setFromAxisAngle(up, ang);
          m.compose(p, q, s); this.prints.setMatrixAt(n, m);
          this.prints.setColorAt(n, col.setRGB(1, 0.86, 0.55).multiplyScalar(fresh)); n++; side = -side; carry = d + 0.72 - L;
        }
        if (carry < 0) carry = 0;
      }
    }
    this.prints.count = n;
    this.prints.instanceMatrix.needsUpdate = true;
    if (this.prints.instanceColor) this.prints.instanceColor.needsUpdate = true;
  }

  /* ---------- 매 프레임 ---------- */
  update(px, pz, cam, sky, moving) {
    if (moving) this.record(px, pz);
    const [cx, cz] = cellXY(px, pz), cell = cellKey(cx, cz);
    if (cell !== this.curCell) {
      this.curCell = cell;
      // 멀어진 칸 정리
      for (const k of this.trails.keys()) { const [a, b] = k.split(',').map(Number); if (Math.abs(a - cx) > 2 || Math.abs(b - cz) > 2) { this.trails.delete(k); this.fetched.delete(k); this.dirty = true; } }
      for (const [id, mm] of this.msgs) if (!mm.mine || this.online) {
        const [a, b] = cellXY(mm.x, mm.z);
        if (Math.abs(a - cx) > 2 || Math.abs(b - cz) > 2) this.drop(id);
      }
      this.fetchAround(cx, cz);
    } else if (this.online && Math.random() < 0.004) this.fetchAround(cx, cz);
    if (this.dirty) this.rebuild();

    this.printMat.opacity = 0.35 + sky.night * 0.6;
    const t = performance.now() / 1000;
    this.orbMat.opacity = this.myOrbMat.opacity = 0.55 + sky.night * 0.45;
    for (const g of this.markers.values()) {
      g.userData.orb.position.y = 1.0 + Math.sin(t * 1.3 + g.userData.ph) * 0.08;
    }
    this.updateLabels(px, pz, cam);
  }

  updateLabels(px, pz, cam) {
    const v = new THREE.Vector3();
    const W = innerWidth, H = innerHeight;
    for (const [id, m] of this.msgs) {
      const d = Math.hypot(m.x - px, m.z - pz);
      let el = this.labels.get(id);
      if (d > 9) { if (el) { el.remove(); this.labels.delete(id); } continue; }
      v.set(m.x, this.ground(m.x, m.z) + 1.45, m.z).project(cam);
      if (v.z > 1 || v.z < -1) { if (el) el.style.opacity = 0; continue; }
      if (!el) {
        el = document.createElement('div'); el.className = 'msg';
        el.innerHTML = `<div class="msg-text"></div><div class="msg-meta"><span class="msg-age"></span>${m.mine ? '<span class="msg-mine">· 내가 남김</span><button class="msg-hide msg-del" type="button">지우기</button>' : '<button class="msg-hide" type="button">숨기기</button>'}</div>`;
        if (m.mine) el.classList.add('mine');
        el.querySelector('.msg-text').textContent = m.text;
        el.querySelector('.msg-hide')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!m.mine) return this.hide(id);
          const b = e.currentTarget;
          if (b.dataset.sure) this.remove(id).catch(() => { b.textContent = '지우지 못했어요'; });
          else { b.dataset.sure = '1'; b.textContent = '정말 지울까요?'; }
        });
        this.labelsEl.appendChild(el); this.labels.set(id, el);
      }
      el.querySelector('.msg-age').textContent = ago(m.t);
      const o = Math.min(1, (9 - d) / 3);
      el.style.opacity = o;
      el.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px) scale(${Math.max(0.75, Math.min(1.1, 4 / d))})`;
    }
  }
}
