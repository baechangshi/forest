// 가끔 마주치는 동물: 사슴·토끼(지상), 새 떼(하늘)
import * as THREE from 'three';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const BOX = new THREE.BoxGeometry(1, 1, 1);

function part(g, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(BOX, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m;
}
function leg(g, mat, x, z, h, w) {
  const pivot = new THREE.Group(); pivot.position.set(x, h, z); g.add(pivot);
  const m = new THREE.Mesh(BOX, mat); m.position.y = -h / 2; m.scale.set(w, h, w); pivot.add(m); return pivot;
}

function makeDeer() {
  const g = new THREE.Group(), body = lam(0x8a5a36), dark = lam(0x5c3a22), light = lam(0xd9c3a0);
  part(g, body, 0, 1.0, 0, 0.42, 0.42, 1.05);
  part(g, light, 0, 1.12, -0.52, 0.14, 0.14, 0.08);
  const neck = new THREE.Group(); neck.position.set(0, 1.15, 0.45); g.add(neck);
  const n = part(neck, body, 0, 0.25, 0.08, 0.2, 0.55, 0.22); n.rotation.x = -0.35;
  part(neck, body, 0, 0.55, 0.24, 0.22, 0.22, 0.38);
  part(neck, dark, 0, 0.52, 0.45, 0.1, 0.1, 0.06);
  part(neck, body, 0.12, 0.68, 0.14, 0.05, 0.16, 0.1); part(neck, body, -0.12, 0.68, 0.14, 0.05, 0.16, 0.1);
  [[0.06, 0.08], [-0.06, -0.08]].forEach(([x, r]) => { const a = part(neck, dark, x * 2, 0.88, 0.16, 0.03, 0.3, 0.03); a.rotation.z = r * 3; });
  const legs = [[0.14, 0.4], [-0.14, 0.4], [0.14, -0.4], [-0.14, -0.4]].map(([x, z]) => leg(g, dark, x, z, 0.82, 0.08));
  return { g, legs, neck, speed: 1.2, flee: 6.5, scare: 11 };
}
function makeRabbit() {
  const g = new THREE.Group(), fur = lam(0x9d8b78), w = lam(0xece6dc);
  part(g, fur, 0, 0.16, 0, 0.22, 0.2, 0.32);
  part(g, fur, 0, 0.26, 0.17, 0.16, 0.16, 0.16);
  part(g, fur, 0.04, 0.42, 0.14, 0.04, 0.18, 0.05); part(g, fur, -0.04, 0.42, 0.14, 0.04, 0.18, 0.05);
  part(g, w, 0, 0.2, -0.17, 0.08, 0.08, 0.06);
  return { g, legs: [], hop: true, speed: 0.6, flee: 5, scare: 6 };
}
function makeFlock() {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0x2a2a30, side: THREE.DoubleSide, fog: true });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, -0.5, 0, -0.1, 0, 0, -0.1, 0, 0, 0.15, 0.5, 0, -0.1, 0, 0, -0.1], 3));
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(geo.clone(), mat);
    b.position.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2, -Math.abs(i - 3) * 1.4 + (Math.random() - 0.5));
    b.userData.ph = Math.random() * 6; g.add(b); birds.push(b);
  }
  return { g, birds, flock: true };
}

export class Animals {
  constructor(scene, ground) { this.scene = scene; this.ground = ground; this.list = []; this.timer = 8; }
  spawn(px, pz, yaw, sky) {
    const ahead = yaw + (Math.random() - 0.5) * 1.6;
    if (sky.day > 0.3 && sky.rain < 0.5 && Math.random() < 0.35) {
      const f = makeFlock(), a = Math.random() * 6.28;
      f.pos = new THREE.Vector3(px + Math.cos(a) * 70, 0, pz + Math.sin(a) * 70);
      f.dir = new THREE.Vector3(px - f.pos.x + (Math.random() - 0.5) * 40, 0, pz - f.pos.z + (Math.random() - 0.5) * 40).normalize();
      f.alt = 18 + Math.random() * 12; f.life = 25;
      this.scene.add(f.g); this.list.push(f); return;
    }
    const a = Math.random() < (sky.night > 0.6 ? 0.25 : 0.55) ? makeDeer() : makeRabbit();
    const d = 20 + Math.random() * 14;
    a.pos = new THREE.Vector3(px - Math.sin(ahead) * d, 0, pz - Math.cos(ahead) * d);
    a.heading = Math.random() * 6.28; a.state = 'graze'; a.t = 0; a.stateT = 2 + Math.random() * 4; a.life = 90;
    this.scene.add(a.g); this.list.push(a);
  }
  update(dt, px, pz, yaw, sky) {
    this.timer -= dt;
    if (this.timer < 0 && this.list.length < 3) { this.spawn(px, pz, yaw, sky); this.timer = 25 + Math.random() * 35; }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i]; a.life -= dt;
      if (a.flock) {
        a.pos.addScaledVector(a.dir, dt * 7);
        a.g.position.set(a.pos.x, this.ground(a.pos.x, a.pos.z) + a.alt, a.pos.z);
        a.g.rotation.y = Math.atan2(a.dir.x, a.dir.z);
        const t = performance.now() / 1000;
        a.birds.forEach((b) => { const f = Math.sin(t * 9 + b.userData.ph) * 0.6; const p = b.geometry.attributes.position; p.setY(1, f * 0.5); p.setY(4, f * 0.5); p.needsUpdate = true; });
        if (a.life < 0) this.remove(i);
        continue;
      }
      const dx = a.pos.x - px, dz = a.pos.z - pz, dist = Math.hypot(dx, dz);
      a.t += dt; a.stateT -= dt;
      if (dist < a.scare && a.state !== 'flee') { a.state = 'flee'; a.heading = Math.atan2(dx, dz); a.stateT = 6; }
      if (a.stateT < 0) {
        if (a.state === 'flee' && dist > 25) { this.remove(i); continue; }
        a.state = a.state === 'walk' ? 'graze' : 'walk';
        a.stateT = 2 + Math.random() * 5; a.heading += (Math.random() - 0.5) * 2;
      }
      const sp = a.state === 'flee' ? a.flee : a.state === 'walk' ? a.speed : 0;
      if (a.state === 'flee') a.heading = a.heading * 0.95 + Math.atan2(dx, dz) * 0.05;
      a.pos.x += Math.sin(a.heading) * sp * dt; a.pos.z += Math.cos(a.heading) * sp * dt;
      const y = this.ground(a.pos.x, a.pos.z);
      a.g.position.set(a.pos.x, y, a.pos.z);
      a.g.rotation.y = a.heading;
      if (a.hop) a.g.position.y += sp > 0 ? Math.abs(Math.sin(a.t * (sp > 2 ? 14 : 8))) * 0.25 : 0;
      const cyc = a.t * (sp > 2 ? 12 : 6);
      a.legs.forEach((l, k) => (l.rotation.x = sp > 0 ? Math.sin(cyc + (k % 2 ? Math.PI : 0) + (k > 1 ? 0.6 : 0)) * (sp > 2 ? 0.7 : 0.35) : 0));
      if (a.neck) a.neck.rotation.x = a.state === 'graze' ? 0.9 + Math.sin(a.t * 2) * 0.05 : 0;
      if (a.life < 0 || dist > 70) this.remove(i);
    }
  }
  remove(i) { this.scene.remove(this.list[i].g); this.list.splice(i, 1); }
}
