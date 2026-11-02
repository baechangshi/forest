// 결정적(seeded) 난수·노이즈 — 모든 접속자가 똑같은 숲을 보게 함
export const SEED = 20261102;

export function hash2(x, z, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul((s + SEED) | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rngFor(cx, cz, s = 0) {
  let a = Math.floor(hash2(cx, cz, s) * 4294967296);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sm = (t) => t * t * (3 - 2 * t);
export function vnoise(x, z, s = 0) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = sm(x - xi), zf = sm(z - zi);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
}

export function fbm(x, z, s = 0, oct = 4) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, z * f, s + i * 17) * amp;
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return v / norm;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
