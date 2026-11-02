import * as THREE from 'three';
import { World, CHUNK, groundY, MAT } from './world.js';
import { Sky } from './sky.js';
import { Controls } from './controls.js';
import { ForestAudio } from './audio.js';
import { Traces } from './traces.js';
import { Account } from './account.js';
import { Animals } from './animals.js';
import { checkMessage } from './filter.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

const Q = mobile
  ? { radius: 2, groundRes: 10, treeStep: 4.3, bushes: 9, rocks: 4, grass: 55, rainDrops: 600, fireflies: 45, viewDist: 78, dpr: 1.5, aa: false }
  : { radius: 3, groundRes: 12, treeStep: 3.7, bushes: 15, rocks: 6, grass: 150, rainDrops: 1400, fireflies: 90, viewDist: 108, dpr: 2, aa: true };

/* ---------- 렌더러·씬 ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr));
renderer.setSize(innerWidth, innerHeight);
$('#app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(mobile ? 70 : 65, innerWidth / innerHeight, 0.1, Q.viewDist * 1.05);
camera.rotation.order = 'YXZ';
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const ground = (x, z) => groundY(x, z, Q.groundRes);
const world = new World(scene, Q);
const sky = new Sky(scene, Q);
const controls = new Controls(renderer.domElement, $('#joy'), $('#knob'));
const audio = new ForestAudio();
const account = new Account();
const traces = new Traces(scene, ground, $('#labels'), account);
const animals = new Animals(scene, ground);

/* ---------- 저장된 상태 ---------- */
const saved = (() => { try { return JSON.parse(localStorage.getItem('forest.state')) || {}; } catch { return {}; } })();
const st = {
  x: saved.x ?? (Math.random() - 0.5) * 6, z: saved.z ?? (Math.random() - 0.5) * 6,
  dist: saved.dist || 0, time: saved.time || 0, found: new Set(saved.found || []),
};
controls.yaw = saved.yaw ?? 0;
let walkedThisSession = 0, cloudMark = -1;
function persist() {
  try { localStorage.setItem('forest.state', JSON.stringify({ x: st.x, z: st.z, yaw: controls.yaw, dist: st.dist, time: st.time, found: [...st.found].slice(-2000), savedAt: walkedThisSession > 1 ? Date.now() : saved.savedAt || 0 })); } catch {}
}
// 구글 로그인 중이면 걷던 자리를 클라우드에도 저장 (움직였을 때만)
function cloudSave() {
  if (!account.isGoogle || Math.abs(st.dist - cloudMark) < 2) return;
  cloudMark = st.dist;
  account.saveProfile({ x: st.x, z: st.z, yaw: controls.yaw, dist: st.dist, time: st.time, found: [...st.found] });
}
setInterval(persist, 3000);
setInterval(cloudSave, 45000);
const onLeave = () => { persist(); traces.flush(); cloudSave(); };
addEventListener('pagehide', onLeave);
document.addEventListener('visibilitychange', () => { if (document.hidden) onLeave(); });

/* ---------- 미리 숲 만들기 ---------- */
camera.position.set(st.x, ground(st.x, st.z) + 1.65, st.z);
while (world.update(st.x, st.z, 99) > 0);

const override = {};
if (params.has('t')) override.t = parseFloat(params.get('t'));
if (params.has('w')) { const w = params.get('w'); override.weather = { rain: w === 'rain' ? 1 : 0, mist: w === 'mist' ? 1 : 0, type: w }; }
const hasOverride = Object.keys(override).length > 0;
let skyState = sky.update(0, camera, ground, hasOverride ? override : null);

/* ---------- UI ---------- */
const fmtTime = (s) => { const m = Math.floor(s / 60); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`; };
const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
let toastT = 0;
function toast(msg, ms = 3600) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}
$('#hint').textContent = mobile ? '왼쪽을 눌러 걷고, 오른쪽을 밀어 둘러보세요 · 멀리 밀면 빨리 걸어요' : 'WASD·방향키로 걷고, 마우스를 끌어 둘러보세요 · Shift 빨리 걷기';
if (st.dist > 1) $('#resume').textContent = `지금까지 ${fmtDist(st.dist)}를 걸었어요. 이어서 걸어요.`;

/* ---------- 계정·이어 걷기 ---------- */
function teleport(p) {
  st.x = p.x; st.z = p.z; controls.yaw = p.yaw ?? controls.yaw; vel.set(0, 0);
  while (world.update(st.x, st.z, 99) > 0);
  camY = ground(st.x, st.z) + 1.65;
}
async function syncProfile() {
  if (!account.isGoogle) return;
  try {
    const p = await account.loadProfile();
    const localAt = walkedThisSession > 1 ? Date.now() : saved.savedAt || 0;
    if (p) {
      (p.found || []).forEach((k) => st.found.add(k));
      if (p.savedAt > localAt && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        teleport(p); st.dist = Math.max(p.dist || 0, 0); st.time = Math.max(p.time || 0, 0);
        toast('지난번 걷던 자리에서 이어 걸어요');
        if (st.dist > 1) $('#resume').textContent = `지금까지 ${fmtDist(st.dist)}를 걸었어요. 이어서 걸어요.`;
      }
    }
    cloudMark = -1; cloudSave(); persist();
  } catch (e) { console.warn('[forest] profile sync', e); }
}
function updateAccountUI() {
  const on = traces.online, g = account.isGoogle;
  $('#btnAcct').hidden = !on;
  $('#btnAcct').classList.toggle('signed', g);
  $('#startLogin').hidden = !on || g;
  if (on) {
    $('#netState').textContent = g ? '구글 계정으로 이어 걷는 중 · 다른 이들의 흔적이 보이는 숲' : '다른 이들의 흔적이 보이는 숲';
  }
  $('#acctText').textContent = g ? '구글 계정으로 연결돼 있어요.' : '로그인하지 않고 걷는 중이에요.';
  $('#acctSub').textContent = g
    ? '내가 남긴 메시지는 민트빛으로 보이고, 어느 기기에서 들어와도 걷던 자리에서 이어 걸어요. 숲에는 이름·이메일이 표시되지 않아요.'
    : 'Google로 로그인하면 메시지를 남길 수 있고, 내가 남긴 메시지를 알아볼 수 있으며, 다른 기기에서도 걷던 자리에서 이어 걸을 수 있어요.';
  $('#acctBtn').textContent = g ? '로그아웃' : 'Google로 로그인';
  $('#acctBtn').className = g ? 'ghost' : 'google';
  const need = on && !g;
  $('#msgLoginBox').hidden = !need; $('#msgFields').hidden = need;
  modal.classList.toggle('need-login', need);
}
function login(errEl) {
  errEl.textContent = '';
  return account.signInGoogle().then(() => true).catch((e) => { if (!e.quiet) errEl.textContent = e.message; return false; });
}
account.onChange(() => { updateAccountUI(); syncProfile(); });

traces.init().then((ok) => {
  if (!ok) $('#netState').textContent = '혼자 걷는 숲 (흔적 공유는 Firebase 연결 후)';
  $('#netState').classList.toggle('on', ok);
  updateAccountUI();
});
$('#startLogin').addEventListener('click', () => login($('#netState')));

$('#enter').addEventListener('click', () => {
  audio.start();
  controls.enabled = true;
  $('#start').classList.add('off');
  document.body.classList.add('playing');
  setTimeout(() => $('#hint').classList.add('off'), 7000);
});

const setBtn = (sel, on) => $(sel).classList.toggle('muted', !on);
$('#btnSound').addEventListener('click', () => { audio.sfxOn = !audio.sfxOn; setBtn('#btnSound', audio.sfxOn); });
$('#btnMusic').addEventListener('click', () => { audio.musicOn = !audio.musicOn; setBtn('#btnMusic', audio.musicOn); });
const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
if (!fsOk) $('#btnFull').remove();
else $('#btnFull').addEventListener('click', () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
});

// 계정 창
const acct = $('#acctModal');
$('#btnAcct').addEventListener('click', () => { $('#acctErr').textContent = ''; acct.classList.add('on'); controls.enabled = false; controls.keys.clear(); });
$('#acctClose').addEventListener('click', () => { acct.classList.remove('on'); controls.enabled = true; });
$('#acctBtn').addEventListener('click', () => {
  if (account.isGoogle) { cloudSave(); account.signOut().then(() => { acct.classList.remove('on'); controls.enabled = true; toast('로그아웃했어요'); }); }
  else login($('#acctErr')).then((ok) => { if (ok) { acct.classList.remove('on'); controls.enabled = true; toast('구글 계정으로 연결했어요'); } });
});

// 메시지 남기기
const modal = $('#msgModal'), ta = $('#msgText'), err = $('#msgErr');
$('#msgLoginBtn').addEventListener('click', () => login($('#msgLoginErr')).then((ok) => ok && setTimeout(() => ta.focus(), 50)));
$('#btnMsg').addEventListener('click', () => {
  const c = traces.canPost();
  err.textContent = c.ok ? '' : c.why;
  $('#msgNote').textContent = traces.online ? '숲을 지나는 누군가가 이 자리에서 읽게 돼요. 30일 뒤 사라져요.' : '지금은 혼자 걷는 숲이라 이 기기에서만 보여요.';
  modal.classList.add('on'); controls.enabled = false; controls.keys.clear();
  $('#msgLoginErr').textContent = '';
  if (!modal.classList.contains('need-login')) setTimeout(() => ta.focus(), 50);
});
const closeModal = () => { modal.classList.remove('on'); controls.enabled = true; ta.blur(); };
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (modal.classList.contains('on')) closeModal(); if (acct.classList.contains('on')) $('#acctClose').click(); } });
$('#msgCancel').addEventListener('click', closeModal);
ta.addEventListener('input', () => { $('#msgCount').textContent = `${ta.value.length}/40`; err.textContent = ''; });
$('#msgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = checkMessage(ta.value);
  if (!r.ok) { err.textContent = r.why; return; }
  const fx = -Math.sin(controls.yaw), fz = -Math.cos(controls.yaw);
  $('#msgSend').disabled = true;
  try {
    await traces.post(r.text, st.x + fx * 2.6, st.z + fz * 2.6);
    ta.value = ''; $('#msgCount').textContent = '0/40'; closeModal(); toast('이 자리에 흔적을 남겼어요');
  } catch (ex) { err.textContent = ex.message || '남기지 못했어요. 잠시 후 다시 해 주세요.'; }
  $('#msgSend').disabled = false;
});

/* ---------- 메인 루프 ---------- */
const vel = new THREE.Vector2();
let bob = 0, stepAcc = 0, last = performance.now(), camY = camera.position.y, hudT = 0;
const glowNight = new THREE.Color(0xffc670), glowDay = new THREE.Color(0x8c6c44);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (document.hidden) return;

  // 이동
  const inp = controls.input();
  const speed = inp.run ? 4.2 : 2.1;
  const s = Math.sin(controls.yaw), c = Math.cos(controls.yaw);
  const tx = (-s * inp.y + c * inp.x) * speed, tz = (-c * inp.y - s * inp.x) * speed;
  const k = 1 - Math.exp(-dt * 7);
  vel.x += (tx - vel.x) * k; vel.y += (tz - vel.y) * k;
  let nx = st.x + vel.x * dt, nz = st.z + vel.y * dt;
  // 충돌 (나무·바위·건물)
  for (const list of world.collidersNear(nx, nz)) for (const o of list) {
    const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), r = o.r + 0.3;
    if (d < r && d > 1e-4) { nx = o.x + (dx / d) * r; nz = o.z + (dz / d) * r; }
  }
  const moved = Math.hypot(nx - st.x, nz - st.z);
  st.x = nx; st.z = nz;
  const moving = moved > 0.002;
  if (controls.enabled) st.time += dt;
  st.dist += moved; walkedThisSession += moved;

  // 발소리·머리 흔들림
  if (moving) {
    bob += moved * (inp.run ? 2.6 : 3.2);
    stepAcc += moved;
    if (stepAcc > (inp.run ? 1.05 : 0.8)) { stepAcc = 0; audio.step(inp.run); }
  }
  const spd = moved / Math.max(dt, 1e-3);
  const gy = ground(st.x, st.z) + 1.65;
  camY += (gy - camY) * (1 - Math.exp(-dt * 10));
  camera.position.set(st.x, camY + Math.sin(bob) * 0.045 * Math.min(1, spd / 2), st.z);
  camera.rotation.set(controls.pitch, controls.yaw, Math.sin(bob * 0.5) * 0.004 * Math.min(1, spd / 2));

  world.update(st.x, st.z, 1);
  skyState = sky.update(dt, camera, ground, hasOverride ? override : null);
  traces.update(st.x, st.z, camera, skyState, moving && controls.enabled);
  animals.update(dt, st.x, st.z, controls.yaw, skyState);
  audio.update(skyState, moving);

  // 밤이면 창문·석등에 불이 켜짐
  MAT.glow.color.copy(glowDay).lerp(glowNight, Math.min(1, skyState.night + skyState.rain * 0.4 + 0.15));
  MAT.capGlow.emissiveIntensity = skyState.night * 0.7;

  // 발견
  world.forEachDiscovery((d) => {
    if (st.found.has(d.key)) return;
    if (Math.hypot(d.x - st.x, d.z - st.z) < d.r + 4.5) {
      st.found.add(d.key); audio.chime();
      toast(`발견 · ${d.name}  (${st.found.size}번째)`);
    }
  });

  hudT -= dt;
  if (hudT < 0) {
    hudT = 0.5;
    $('#hudPhase').textContent = skyState.label;
    $('#hudStat').textContent = `${fmtDist(st.dist)} · ${fmtTime(st.time)}${st.found.size ? ` · 발견 ${st.found.size}` : ''}`;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// 테스트·디버그용
window.__forest = { account, updateAccountUI, st, controls, world, sky, traces, renderer, camera, scene, Q, CHUNK };
