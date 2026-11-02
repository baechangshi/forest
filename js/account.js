// 계정: 기본은 익명(발자국만), 메시지 작성·기기 간 이어 걷기는 구글 로그인
import { FIREBASE_CONFIG } from './config.js';

const ERR = {
  'auth/popup-blocked': '팝업이 막혔어요. 브라우저에서 팝업을 허용해 주세요.',
  'auth/unauthorized-domain': '이 주소가 Firebase 승인된 도메인에 없어요. (README의 "Firebase 연결" 2번 참고)',
  'auth/operation-not-supported-in-this-environment': '홈 화면 앱에서는 로그인할 수 없어요. Safari·Chrome에서 열어 주세요.',
  'auth/network-request-failed': '네트워크가 불안정해요. 잠시 후 다시 해 주세요.',
};

export class Account {
  constructor() { this.fb = null; this.user = null; this.ready = false; this.subs = new Set(); }

  get enabled() { return !!FIREBASE_CONFIG.apiKey; }
  get uid() { return this.user?.uid || null; }
  get isGoogle() { return !!this.user && !this.user.isAnonymous && this.user.providerData.some((p) => p.providerId === 'google.com'); }

  onChange(fn) { this.subs.add(fn); }
  emit() { this.subs.forEach((fn) => fn(this)); }

  async init() {
    if (!this.enabled) return false;
    const fb = await import('../lib/firebase.js');
    const app = fb.initializeApp(FIREBASE_CONFIG);
    this.fb = fb; this.auth = fb.getAuth(app); this.db = fb.getFirestore(app);
    await this.auth.authStateReady();                         // 지난번 로그인 상태 복원
    if (!this.auth.currentUser) await fb.signInAnonymously(this.auth);
    this.user = this.auth.currentUser; this.ready = true;
    fb.onAuthStateChanged(this.auth, (u) => {
      const prev = this.uid; this.user = u;
      if (!u) fb.signInAnonymously(this.auth).catch(() => {});   // 로그아웃 후에도 발자국은 남도록
      else if (u.uid !== prev) this.emit();
    });
    this.emit();
    return true;
  }

  // 반드시 클릭 핸들러 안에서 await 없이 바로 호출 (iOS 팝업 차단 방지)
  signInGoogle() {
    if (!this.ready) return Promise.reject(new Error('숲과 연결하는 중이에요. 잠시 후 다시 해 주세요.'));
    const p = new this.fb.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return this.fb.signInWithPopup(this.auth, p).catch((e) => {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') throw Object.assign(new Error(''), { quiet: true });
      throw new Error(ERR[e.code] || '로그인하지 못했어요. 잠시 후 다시 해 주세요.');
    });
  }
  signOut() { return this.ready ? this.fb.signOut(this.auth) : Promise.resolve(); }

  /* ---------- 기기 간 이어 걷기: users/{uid} ---------- */
  async loadProfile() {
    if (!this.isGoogle) return null;
    const snap = await this.fb.getDoc(this.fb.doc(this.db, 'users', this.uid));
    if (!snap.exists()) return null;
    const v = snap.data();
    return { ...v, savedAt: v.updatedAt?.toMillis?.() ?? 0 };
  }
  saveProfile(s) {
    if (!this.isGoogle) return Promise.resolve();
    const r = (n) => Math.round(n * 100) / 100;
    return this.fb.setDoc(this.fb.doc(this.db, 'users', this.uid), {
      x: r(s.x), z: r(s.z), yaw: r(s.yaw), dist: Math.round(s.dist), time: Math.round(s.time),
      found: s.found.slice(-1000), updatedAt: this.fb.serverTimestamp(),
    }).catch((e) => console.warn('[forest] profile', e));
  }
}
