// 하늘·시간·날씨 — 모든 접속자가 같은 시각·같은 날씨를 공유 (실제 시계 기반)
import * as THREE from 'three';
import { hash2, clamp, smoothstep } from './noise.js';

export const DAY_MS = 20 * 60 * 1000;     // 숲의 하루 = 실제 20분
const WEATHER_MS = 6 * 60 * 1000;         // 날씨는 6분 단위로 바뀔 수 있음
const DAY_OFFSET = 0.3;                   // 기준 시각 보정

const C = (h) => new THREE.Color(h);
const PAL = {
  top: { night: C(0x0c1a38), day: C(0x4f8fd0), dusk: C(0x34407a) },
  hor: { night: C(0x17243c), day: C(0xc9e0e6), dusk: C(0xf09a66) },
  grayDay: C(0x9ba6a8), grayNight: C(0x262c33),
};

function weatherType(slot) {
  const h = hash2(slot, 7, 401);
  return h < 0.5 ? 'clear' : h < 0.75 ? 'mist' : 'rain';
}

export function forestTime(now = Date.now()) {
  return ((now / DAY_MS) + DAY_OFFSET) % 1;
}

export function weatherNow(now = Date.now()) {
  const slot = Math.floor(now / WEATHER_MS), p = (now % WEATHER_MS) / WEATHER_MS;
  const cur = weatherType(slot), prev = weatherType(slot - 1);
  const w = smoothstep(0, 0.2, p);
  const amt = (t) => (prev === t ? 1 - w : 0) + (cur === t ? w : 0);
  return { rain: amt('rain'), mist: amt('mist'), type: cur };
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const GLOW_TEX = glowTexture();

export class Sky {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality;
    scene.fog = new THREE.Fog(0xcfe0e6, 10, quality.viewDist);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3a20, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(this.hemi, this.sun, this.sun.target);

    this.uniforms = {
      top: { value: new THREE.Color() }, hor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, night: { value: 0 }, haze: { value: 0 },
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(quality.viewDist * 0.9, 24, 12), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top, hor, sunDir, sunCol; uniform float night, haze; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(hor, top, pow(clamp(h,0.0,1.0), 0.55));
          float s = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(s, 900.0) * 4.0 + pow(s, 10.0) * 0.35) * (1.0 - haze*0.8);
          float m = max(dot(d, -sunDir), 0.0);
          col += vec3(0.85,0.9,1.0) * pow(m, 1600.0) * 2.5 * night * (1.0 - haze*0.8);
          col = mix(col, hor, haze * (1.0 - clamp(h*1.5,0.0,1.0)) );
          gl_FragColor = vec4(col, 1.0); }`,
    }));
    dome.renderOrder = -10; dome.frustumCulled = false;
    this.dome = dome; scene.add(dome);

    // 별
    const sp = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.08, th = u * Math.PI * 2, r = quality.viewDist * 0.85;
      const y = v, rr = Math.sqrt(1 - y * y);
      sp.set([Math.cos(th) * rr * r, y * r, Math.sin(th) * rr * r], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -9; scene.add(this.stars);

    // 비
    const N = quality.rainDrops; this.rainN = N;
    const rp = new Float32Array(N * 6); this.rainSeed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this.rainSeed.set([Math.random() * 30 - 15, Math.random() * 18, Math.random() * 30 - 15], i * 3);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaebccc, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false; scene.add(this.rain);

    // 반딧불이
    const F = quality.fireflies; this.ffN = F;
    const fp = new Float32Array(F * 3), fc = new Float32Array(F * 3);
    this.ff = []; for (let i = 0; i < F; i++) this.ff.push({ x: Math.random() * 40 - 20, y: 0.4 + Math.random() * 2.2, z: Math.random() * 40 - 20, ph: Math.random() * 100, sp: 0.3 + Math.random() * 0.7 });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.7, map: GLOW_TEX, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.fireflies.frustumCulled = false; scene.add(this.fireflies);

    this.state = { t: 0, day: 1, night: 0, rain: 0, mist: 0, label: '' };
    this._sd = new THREE.Vector3(); this._c = new THREE.Color(); this._c2 = new THREE.Color();
  }

  update(dt, cam, heightFn, override) {
    const now = Date.now();
    const t = override?.t ?? forestTime(now);
    const w = override?.weather ?? weatherNow(now);
    const a = (t - 0.25) * Math.PI * 2;
    const el = Math.sin(a);
    const sunDir = this._sd.set(Math.cos(a), el, 0.35).normalize();
    const day = smoothstep(-0.12, 0.3, el), night = 1 - smoothstep(-0.28, 0.02, el);
    const dusk = clamp(1 - Math.abs(el) / 0.32, 0, 1);
    const haze = clamp(w.mist * 0.85 + w.rain * 0.75, 0, 1);

    const top = this.uniforms.top.value, hor = this.uniforms.hor.value;
    top.copy(PAL.top.night).lerp(PAL.top.day, day).lerp(PAL.top.dusk, dusk * 0.6);
    hor.copy(PAL.hor.night).lerp(PAL.hor.day, day).lerp(PAL.hor.dusk, dusk * 0.75);
    const gray = this._c.copy(PAL.grayNight).lerp(PAL.grayDay, day);
    top.lerp(gray, haze * 0.85); hor.lerp(gray, haze * 0.8);
    this.uniforms.sunDir.value.copy(sunDir);
    this.uniforms.sunCol.value.setRGB(1, 0.75 + day * 0.2, 0.5 + day * 0.4).multiplyScalar(smoothstep(-0.08, 0.05, el));
    this.uniforms.night.value = night; this.uniforms.haze.value = haze;

    const fog = this.scene.fog;
    fog.color.copy(hor);
    const far = this.q.viewDist * (1 - w.mist * 0.62 - w.rain * 0.4) * (1 - night * 0.25);
    fog.far = far; fog.near = Math.min(8, far * 0.2);

    this.hemi.color.copy(this._c2.setRGB(0.55, 0.65, 0.95).lerp(this._c.setRGB(0.95, 0.97, 1), day));
    this.hemi.groundColor.setRGB(0.22, 0.2, 0.12).multiplyScalar(0.4 + day * 0.6);
    this.hemi.intensity = 0.7 + day * 1.1 + dusk * 0.35 - haze * 0.15;
    const moonUp = clamp(-el * 3, 0, 1);
    if (el > -0.05) {
      this.sun.color.setRGB(1, 0.72 + day * 0.25, 0.5 + day * 0.45);
      this.sun.intensity = smoothstep(-0.05, 0.25, el) * 2.1 * (1 - haze * 0.6);
      this.sun.position.copy(sunDir).multiplyScalar(100).add(cam.position);
    } else {
      this.sun.color.setRGB(0.6, 0.7, 1);
      this.sun.intensity = moonUp * 0.45 * (1 - haze * 0.6);
      this.sun.position.copy(sunDir).multiplyScalar(-100).add(cam.position);
    }
    this.sun.target.position.copy(cam.position);

    this.dome.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.stars.rotation.y = t * Math.PI * 2 * 0.2;
    this.stars.material.opacity = night * (1 - haze);

    // 비 업데이트
    this.rain.material.opacity = w.rain * 0.55;
    this.rain.visible = w.rain > 0.02;
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position.array, s = this.rainSeed;
      for (let i = 0; i < this.rainN; i++) {
        let y = s[i * 3 + 1] - dt * 14; if (y < 0) y += 18; s[i * 3 + 1] = y;
        const x = cam.position.x + s[i * 3], z = cam.position.z + s[i * 3 + 2], yy = cam.position.y - 6 + y;
        p[i * 6] = x; p[i * 6 + 1] = yy; p[i * 6 + 2] = z; p[i * 6 + 3] = x + 0.04; p[i * 6 + 4] = yy + 0.55; p[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // 반딧불이
    const ffA = night * (1 - w.rain) * 1.0;
    this.fireflies.visible = ffA > 0.02;
    if (this.fireflies.visible) {
      const p = this.fireflies.geometry.attributes.position.array, c = this.fireflies.geometry.attributes.color.array;
      const tt = now / 1000;
      for (let i = 0; i < this.ffN; i++) {
        const f = this.ff[i];
        let dx = f.x - cam.position.x, dz = f.z - cam.position.z;
        if (dx > 20) f.x -= 40; if (dx < -20) f.x += 40; if (dz > 20) f.z -= 40; if (dz < -20) f.z += 40;
        f.x += Math.sin(tt * f.sp + f.ph) * dt * 0.4; f.z += Math.cos(tt * f.sp * 0.8 + f.ph) * dt * 0.4;
        const x = f.x + Math.sin(tt * 0.7 + f.ph) * 0.5, z = f.z;
        p[i * 3] = x; p[i * 3 + 1] = heightFn(x, z) + f.y + Math.sin(tt * f.sp * 1.3 + f.ph) * 0.3; p[i * 3 + 2] = z;
        const b = Math.max(0, Math.sin(tt * (1.2 + f.sp) + f.ph * 3)) ** 3 * ffA;
        c[i * 3] = 0.85 * b; c[i * 3 + 1] = 1 * b; c[i * 3 + 2] = 0.45 * b;
      }
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      this.fireflies.geometry.attributes.color.needsUpdate = true;
    }

    const hour = (t * 24) % 24;
    const phase = hour < 4.5 ? '깊은 밤' : hour < 6.5 ? '새벽' : hour < 10 ? '아침' : hour < 15 ? '한낮' : hour < 17.5 ? '오후' : hour < 19.5 ? '노을' : '밤';
    const wl = w.rain > 0.5 ? '비' : w.mist > 0.5 ? '안개' : (night > 0.5 && w.rain < 0.3 ? '반딧불이' : '맑음');
    Object.assign(this.state, { t, day, night, dusk, rain: w.rain, mist: w.mist, label: `${phase} · ${wl}`, hour });
    return this.state;
  }
}
