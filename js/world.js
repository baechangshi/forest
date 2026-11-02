// 끝없는 숲: 플레이어 주변에 청크를 만들고 멀어지면 지움
import * as THREE from 'three';
import { hash2, rngFor, vnoise, fbm, smoothstep, lerp } from './noise.js';

export const CHUNK = 32;

/* ---------------- 지형 ---------------- */

// 발견 요소: 청크마다 해시로 결정 (지형 평탄화에도 사용)
const DISCOVERIES = [
  { type: 'cabin', name: '작은 오두막', r: 6 },
  { type: 'pond', name: '고요한 연못', r: 6 },
  { type: 'stones', name: '이끼 낀 돌무리', r: 6 },
  { type: 'mushrooms', name: '버섯 고리', r: 4 },
  { type: 'lantern', name: '오래된 석등', r: 3 },
  { type: 'bench', name: '쉬어가는 벤치', r: 3 },
  { type: 'bigtree', name: '천년 고목', r: 5 },
  { type: 'sign', name: '낡은 이정표', r: 2.5 },
];

export function discoveryOf(cx, cz) {
  if (Math.abs(cx) + Math.abs(cz) < 1) return null; // 시작 지점은 비워 둠
  if (hash2(cx, cz, 91) > 0.2) return null;
  const d = DISCOVERIES[Math.floor(hash2(cx, cz, 92) * DISCOVERIES.length)];
  const m = 9;
  return {
    ...d,
    key: cx + ',' + cz,
    x: cx * CHUNK + m + hash2(cx, cz, 93) * (CHUNK - 2 * m),
    z: cz * CHUNK + m + hash2(cx, cz, 94) * (CHUNK - 2 * m),
    rot: hash2(cx, cz, 95) * Math.PI * 2,
  };
}

function baseHeight(x, z) {
  return fbm(x * 0.011, z * 0.011, 1, 4) * 16 + vnoise(x * 0.06, z * 0.06, 2) * 1.2 - 8;
}

export function height(x, z) {
  let h = baseHeight(x, z);
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  const d = discoveryOf(cx, cz);
  if (d) {
    const dist = Math.hypot(x - d.x, z - d.z);
    const R = d.r + 3;
    if (dist < R) {
      const target = baseHeight(d.x, d.z) - (d.type === 'pond' ? 0.6 * smoothstep(d.r, 0, dist) : 0);
      h = lerp(target, h, smoothstep(d.r * 0.7, R, dist));
    }
  }
  return h;
}

// 실제로 그려진 지면(삼각형) 높이 — PlaneGeometry의 삼각형 분할과 동일하게 보간
export function groundY(x, z, res) {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), s = CHUNK / res;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const i = Math.min(res - 1, Math.floor((x - x0) / s)), j = Math.min(res - 1, Math.floor((z - z0) / s));
  const fx = (x - x0) / s - i, fz = (z - z0) / s - j;
  const X = x0 + i * s, Z = z0 + j * s;
  const hb = height(X, Z + s), hd = height(X + s, Z);
  if (fx + fz <= 1) { const ha = height(X, Z); return ha + (hd - ha) * fx + (hb - ha) * fz; }
  const hc = height(X + s, Z + s); return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}

// 숲이 성긴 초원 지대
const meadow = (x, z) => vnoise(x * 0.018, z * 0.018, 5);

/* ---------------- 공유 지오메트리·재질 ---------------- */

function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
function merge(geoms) {
  const gs = geoms.map((g) => (g.index ? g.toNonIndexed() : g));
  let len = 0; gs.forEach((g) => (len += g.attributes.position.count * 3));
  const pos = new Float32Array(len); let o = 0;
  gs.forEach((g) => { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}
const V = (x, y) => new THREE.Vector2(x, y);

const G = {
  trunk: flat(new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0)),
  pine: flat(new THREE.LatheGeometry(
    [V(0, 0), V(1.7, 0.35), V(0.75, 1.55), V(1.35, 1.6), V(0.5, 2.8), V(0.95, 2.85), V(0, 4.3)], 7)),
  broad: merge([
    new THREE.IcosahedronGeometry(1.5, 0).translate(0, 1.3, 0),
    new THREE.IcosahedronGeometry(1.05, 0).translate(0.7, 2.1, 0.3),
    new THREE.IcosahedronGeometry(0.95, 0).translate(-0.6, 1.9, -0.4),
  ]),
  bush: flat(new THREE.DodecahedronGeometry(0.6, 0).scale(1, 0.7, 1)),
  rock: flat(new THREE.DodecahedronGeometry(0.5, 0).scale(1.2, 0.7, 1)),
  grass: merge([
    new THREE.PlaneGeometry(0.06, 0.45).translate(0, 0.22, 0).rotateZ(0.15),
    new THREE.PlaneGeometry(0.06, 0.38).translate(0.05, 0.19, 0).rotateY(1.2).rotateZ(-0.2),
    new THREE.PlaneGeometry(0.06, 0.4).translate(-0.04, 0.2, 0).rotateY(2.2).rotateZ(0.1),
  ]),
  flower: flat(new THREE.IcosahedronGeometry(0.07, 0).translate(0, 0.32, 0)),
  box: flat(new THREE.BoxGeometry(1, 1, 1)),
  cyl: flat(new THREE.CylinderGeometry(0.5, 0.5, 1, 7)),
};

export const MAT = {
  ground: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  inst: new THREE.MeshLambertMaterial({ flatShading: true }),
  grass: new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
  wood: new THREE.MeshLambertMaterial({ color: 0x7a5434, flatShading: true }),
  darkWood: new THREE.MeshLambertMaterial({ color: 0x4f3524, flatShading: true }),
  roof: new THREE.MeshLambertMaterial({ color: 0x5b3a2e, flatShading: true }),
  stone: new THREE.MeshLambertMaterial({ color: 0x8a8d86, flatShading: true }),
  moss: new THREE.MeshLambertMaterial({ color: 0x5b7d3a, flatShading: true }),
  water: new THREE.MeshPhongMaterial({ color: 0x3f6f7d, transparent: true, opacity: 0.85, shininess: 90, specular: 0x99bbcc, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffc670 }),
  capRed: new THREE.MeshLambertMaterial({ color: 0xc23a2b, flatShading: true }),
  capGlow: new THREE.MeshLambertMaterial({ color: 0xe8dcc0, emissive: 0x88ffcc, emissiveIntensity: 0, flatShading: true }),
};

/* ---------------- 청크 생성 ---------------- */

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

function instanced(geo, list, mat = MAT.inst) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => {
    tmpE.set(it.rx || 0, it.ry || 0, it.rz || 0);
    tmpQ.setFromEuler(tmpE);
    tmpP.set(it.x, it.y, it.z);
    tmpS.set(it.sx, it.sy, it.sz);
    tmpM.compose(tmpP, tmpQ, tmpS);
    m.setMatrixAt(i, tmpM);
    m.setColorAt(i, tmpC.setHex(it.c));
  });
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

const hsl = (h, s, l) => tmpC.setHSL(h, s, l).getHex();

function groundMesh(cx, cz, res) {
  const g = new THREE.PlaneGeometry(CHUNK, CHUNK, res, res).rotateX(-Math.PI / 2).toNonIndexed();
  const p = g.attributes.position, ox = cx * CHUNK + CHUNK / 2, oz = cz * CHUNK + CHUNK / 2;
  for (let i = 0; i < p.count; i++) p.setY(i, height(ox + p.getX(i), oz + p.getZ(i)));
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), n = g.attributes.normal;
  const palette = [0x4c7536, 0x3f6630, 0x5d8238, 0x6f8a3c, 0x55703a];
  for (let i = 0; i < p.count; i += 3) {
    const x = ox + (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const z = oz + (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const slope = 1 - n.getY(i);
    let c = palette[Math.floor(vnoise(x * 0.15, z * 0.15, 8) * palette.length)];
    if (meadow(x, z) > 0.62) c = 0x6e9440;
    if (slope > 0.22 || vnoise(x * 0.08, z * 0.08, 9) > 0.86) c = 0x6b5a3c;
    tmpC.setHex(c).offsetHSL(0, 0, (hash2(Math.floor(x * 3), Math.floor(z * 3), 3) - 0.5) * 0.04);
    for (let k = 0; k < 3; k++) tmpC.toArray(col, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, MAT.ground);
  m.position.set(ox, 0, oz);
  return m;
}

function addDiscovery(d, group, colliders) {
  const root = new THREE.Group();
  const y = height(d.x, d.z);
  root.position.set(d.x, y, d.z);
  root.rotation.y = d.rot;
  const add = (geo, mat, x, yy, z, sx, sy, sz, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); m.scale.set(sx, sy, sz); m.rotation.set(0, ry, rz); root.add(m); return m;
  };
  const col = (lx, lz, r) => {
    const c = Math.cos(d.rot), s = Math.sin(d.rot);
    colliders.push({ x: d.x + lx * c + lz * s, z: d.z - lx * s + lz * c, r });
  };
  const roofGeo = flat(new THREE.CylinderGeometry(1, 1, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2));
  switch (d.type) {
    case 'cabin': {
      add(G.box, MAT.wood, 0, 1.1, 0, 4, 2.4, 3.2);
      add(roofGeo, MAT.roof, 0, 3.0, 0, 4.6, 1.4, 2.05);
      add(G.box, MAT.darkWood, 0, 0.9, 1.62, 0.9, 1.8, 0.1);
      add(G.box, MAT.glow, 1.3, 1.4, 1.62, 0.6, 0.5, 0.06).userData.window = true;
      add(G.box, MAT.glow, -1.3, 1.4, 1.62, 0.6, 0.5, 0.06).userData.window = true;
      add(G.box, MAT.stone, 1.2, 3.6, -0.6, 0.45, 1.4, 0.45);
      add(G.box, MAT.darkWood, -2.6, 0.35, 0.6, 0.5, 0.7, 0.5);
      col(0, 0, 2.6); col(1.4, 0, 2); col(-1.4, 0, 2);
      break;
    }
    case 'pond': {
      add(flat(new THREE.CircleGeometry(4.2, 9).rotateX(-Math.PI / 2)), MAT.water, 0, 0.32, 0, 1, 1, 1);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2, r = 4.3 + hash2(i, 3, 61) * 0.6;
        add(G.rock, MAT.stone, Math.cos(a) * r, 0.4, Math.sin(a) * r, 0.7 + hash2(i, 1, 61), 0.6, 0.8, a);
      }
      for (let i = 0; i < 14; i++) {
        const a = hash2(i, 9, 62) * 6.28, r = 3.6 + hash2(i, 8, 62);
        add(G.grass, MAT.moss, Math.cos(a) * r, 0.25, Math.sin(a) * r, 1.5, 2.4, 1.5, a);
      }
      add(G.box, MAT.moss, 1.2, 0.34, 0.8, 0.5, 0.02, 0.4, 0.3); // 연잎
      add(G.box, MAT.moss, -1.5, 0.34, -0.6, 0.4, 0.02, 0.4, 0.8);
      col(0, 0, 3.8);
      break;
    }
    case 'stones': {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, h = 1.6 + hash2(i, 2, 63) * 1.2;
        add(G.box, MAT.stone, Math.cos(a) * 4, h / 2 - 0.2, Math.sin(a) * 4, 0.8, h, 0.55, -a, (hash2(i, 4, 63) - 0.5) * 0.15);
        col(Math.cos(a) * 4, Math.sin(a) * 4, 0.6);
      }
      add(G.rock, MAT.moss, 0, 0, 0, 2.2, 0.6, 2.2);
      break;
    }
    case 'mushrooms': {
      for (let i = 0; i < 13; i++) {
        const a = (i / 13) * Math.PI * 2, r = 2.6 + hash2(i, 5, 64) * 0.5, s = 0.6 + hash2(i, 6, 64) * 0.8;
        add(G.cyl, MAT.capGlow, Math.cos(a) * r, 0.15 * s, Math.sin(a) * r, 0.08 * s, 0.3 * s, 0.08 * s);
        const cap = add(flat(new THREE.ConeGeometry(0.2, 0.15, 7)), i % 3 ? MAT.capRed : MAT.capGlow, Math.cos(a) * r, 0.33 * s, Math.sin(a) * r, s, s, s);
        cap.userData.cap = true;
      }
      break;
    }
    case 'lantern': {
      add(G.box, MAT.stone, 0, 0.2, 0, 0.9, 0.4, 0.9);
      add(G.cyl, MAT.stone, 0, 0.9, 0, 0.3, 1.0, 0.3);
      add(G.box, MAT.stone, 0, 1.45, 0, 0.8, 0.12, 0.8);
      add(G.box, MAT.glow, 0, 1.75, 0, 0.42, 0.45, 0.42).userData.window = true;
      add(flat(new THREE.ConeGeometry(0.75, 0.5, 4)), MAT.stone, 0, 2.2, 0, 1, 1, 1, Math.PI / 4);
      col(0, 0, 0.6);
      break;
    }
    case 'bench': {
      add(G.box, MAT.wood, 0, 0.48, 0, 1.8, 0.08, 0.5);
      add(G.box, MAT.wood, 0, 0.85, -0.25, 1.8, 0.35, 0.06);
      [-0.75, 0.75].forEach((x) => add(G.box, MAT.darkWood, x, 0.24, 0, 0.08, 0.48, 0.45));
      col(0, 0, 0.8);
      break;
    }
    case 'bigtree': {
      add(flat(new THREE.CylinderGeometry(0.9, 1.6, 9, 8).translate(0, 4.5, 0)), MAT.darkWood, 0, -0.3, 0, 1, 1, 1);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(G.box, MAT.darkWood, Math.cos(a) * 1.6, 0.2, Math.sin(a) * 1.6, 1.8, 0.4, 0.4, -a);
      }
      const leaf = new THREE.MeshLambertMaterial({ color: 0x3a6a2c, flatShading: true });
      [[0, 10, 0, 4.6], [2.6, 9, 1.2, 3.2], [-2.4, 9.4, -1.4, 3.4], [0.8, 12, -1.6, 3], [-1, 8.4, 2.4, 2.8]].forEach(([x, yy, z, s]) =>
        add(new THREE.IcosahedronGeometry(1, 0), leaf, x, yy, z, s, s * 0.85, s));
      col(0, 0, 1.8);
      break;
    }
    case 'sign': {
      add(G.box, MAT.darkWood, 0, 1.1, 0, 0.15, 2.2, 0.15);
      add(G.box, MAT.wood, 0.45, 1.8, 0, 1.1, 0.28, 0.06, 0.15);
      add(G.box, MAT.wood, -0.4, 1.4, 0, 1.0, 0.26, 0.06, 2.9);
      col(0, 0, 0.4);
      break;
    }
  }
  group.add(root);
  return root;
}

export function buildChunk(cx, cz, q) {
  const group = new THREE.Group();
  const rnd = rngFor(cx, cz, 1);
  const colliders = [];
  group.add(groundMesh(cx, cz, q.groundRes));
  const disc = discoveryOf(cx, cz);
  let discRoot = null;
  if (disc) discRoot = addDiscovery(disc, group, colliders);
  const blocked = (x, z, pad) => disc && Math.hypot(x - disc.x, z - disc.z) < disc.r + pad;
  const spawnClear = (x, z) => Math.hypot(x, z) < 4;

  const trunks = [], pines = [], broads = [], bushes = [], rocks = [], grass = [], flowers = [];
  const x0 = cx * CHUNK, z0 = cz * CHUNK;

  // 나무 — 간단한 지터 격자 방식
  const step = q.treeStep;
  for (let gx = 0; gx < CHUNK; gx += step) for (let gz = 0; gz < CHUNK; gz += step) {
    const x = x0 + gx + rnd() * step, z = z0 + gz + rnd() * step;
    const dens = vnoise(x * 0.03, z * 0.03, 11);
    if (rnd() > 0.35 + dens * 0.65) continue;
    if (meadow(x, z) > 0.6 + rnd() * 0.06 || blocked(x, z, 1.5) || spawnClear(x, z)) continue;
    const y = height(x, z) - 0.2, s = 0.75 + rnd() * 0.7, ry = rnd() * 6.28;
    const kind = vnoise(x * 0.025, z * 0.025, 12) + (rnd() - 0.5) * 0.35;
    if (kind < 0.55) { // 소나무
      const th = 2.5 + rnd() * 1.3;
      trunks.push({ x, y, z, sx: s, sy: th * s, sz: s, ry, c: 0x5a4030 });
      pines.push({ x, y: y + th * s * 0.85, z, sx: s, sy: s * (0.9 + rnd() * 0.4), sz: s, ry, c: hsl(0.3 + rnd() * 0.05, 0.38, 0.22 + rnd() * 0.07) });
    } else if (kind < 0.85) { // 활엽수
      const th = 2.9 + rnd() * 1.3;
      trunks.push({ x, y, z, sx: s * 1.1, sy: th * s, sz: s * 1.1, ry, c: 0x6a4a34 });
      broads.push({ x, y: y + th * s * 0.8, z, sx: s, sy: s, sz: s, ry, c: hsl(0.22 + rnd() * 0.08, 0.45, 0.3 + rnd() * 0.08) });
    } else { // 자작나무
      const th = 3.6 + rnd();
      trunks.push({ x, y, z, sx: s * 0.7, sy: th * s, sz: s * 0.7, ry, c: 0xe8e4da });
      broads.push({ x, y: y + th * s * 0.85, z, sx: s * 0.7, sy: s * 0.9, sz: s * 0.7, ry, c: hsl(0.17 + rnd() * 0.05, 0.5, 0.42) });
    }
    colliders.push({ x, z, r: 0.3 * s + 0.25 });
  }

  const scatter = (n, fn) => { for (let i = 0; i < n; i++) { const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK; if (!blocked(x, z, 0.3)) fn(x, z, height(x, z)); } };
  scatter(q.bushes, (x, z, y) => { const s = 0.6 + rnd() * 0.9; bushes.push({ x, y: y + 0.15 * s, z, sx: s, sy: s, sz: s, ry: rnd() * 6, c: hsl(0.25 + rnd() * 0.06, 0.4, 0.24 + rnd() * 0.08) }); });
  scatter(q.rocks, (x, z, y) => { const s = 0.4 + rnd() * 1.4; rocks.push({ x, y: y + 0.05, z, sx: s, sy: s, sz: s, ry: rnd() * 6, c: hsl(0.1, 0.05, 0.42 + rnd() * 0.12) }); if (s > 1.1) colliders.push({ x, z, r: 0.5 * s }); });
  scatter(q.grass, (x, z, y) => {
    const mw = meadow(x, z) > 0.58;
    const s = 0.7 + rnd() * 0.8;
    grass.push({ x, y: y - 0.02, z, sx: s, sy: s * (mw ? 1.4 : 1), sz: s, ry: rnd() * 6, c: hsl(0.24 + rnd() * 0.06, 0.45, 0.28 + rnd() * 0.12) });
    if (mw && rnd() < 0.35) flowers.push({ x, y: y - 0.02, z, sx: s, sy: s * 1.4, sz: s, c: [0xf2e6a0, 0xd9a0d6, 0xf4f4f0, 0x9fb8f0, 0xf0a070][Math.floor(rnd() * 5)] });
  });

  [instanced(G.trunk, trunks), instanced(G.pine, pines), instanced(G.broad, broads), instanced(G.bush, bushes), instanced(G.rock, rocks),
    instanced(G.grass, grass, MAT.grass), instanced(G.flower, flowers)].forEach((m) => m && group.add(m));

  return { group, colliders, disc, discRoot };
}

export function disposeChunk(c) {
  c.group.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    else if (o.isMesh && o.material === MAT.ground) o.geometry.dispose();
  });
}

/* ---------------- 청크 관리자 ---------------- */

export class World {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality; this.chunks = new Map(); this.queue = [];
  }
  key(cx, cz) { return cx + ',' + cz; }
  update(px, pz, budget = 1) {
    const R = this.q.radius, pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const want = new Set();
    const missing = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const cx = pcx + dx, cz = pcz + dz, k = this.key(cx, cz);
      // 원형으로 로드
      const ccx = cx * CHUNK + CHUNK / 2, ccz = cz * CHUNK + CHUNK / 2;
      if (Math.hypot(ccx - px, ccz - pz) > (R + 0.75) * CHUNK) continue;
      want.add(k);
      if (!this.chunks.has(k)) missing.push([cx, cz, Math.hypot(ccx - px, ccz - pz)]);
    }
    for (const [k, c] of this.chunks) if (!want.has(k)) { this.scene.remove(c.group); disposeChunk(c); this.chunks.delete(k); }
    missing.sort((a, b) => a[2] - b[2]);
    for (let i = 0; i < Math.min(budget, missing.length); i++) {
      const [cx, cz] = missing[i];
      const c = buildChunk(cx, cz, this.q);
      this.chunks.set(this.key(cx, cz), c);
      this.scene.add(c.group);
    }
    return missing.length;
  }
  collidersNear(x, z) {
    const out = [], cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = this.chunks.get(this.key(cx + dx, cz + dz));
      if (c) out.push(c.colliders);
    }
    return out;
  }
  forEachDiscovery(fn) { for (const c of this.chunks.values()) if (c.disc) fn(c.disc, c.discRoot); }
}
