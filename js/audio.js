// 사운드: 환경음 루프(바람·새·풀벌레·비) + BGM + 발소리·발견 효과음
const FILES = ['wind', 'birds', 'crickets', 'rain', 'bgm', 'step1', 'step2', 'step3', 'step4', 'chime'];
const LOOPS = ['wind', 'birds', 'crickets', 'rain', 'bgm'];

export class ForestAudio {
  constructor(base = './assets/audio/') {
    this.base = base; this.ctx = null; this.buf = {}; this.loops = {}; this.ready = false;
    this.sfxOn = true; this.musicOn = true;
  }
  // 반드시 사용자 탭(제스처) 안에서 호출
  async start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.ctx.resume();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      document.hidden ? this.ctx.suspend() : this.ctx.resume();
    });
    await Promise.all(FILES.map(async (f) => {
      try {
        const r = await fetch(this.base + f + '.mp3');
        const ab = await r.arrayBuffer();
        this.buf[f] = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
      } catch (e) { console.warn('audio load failed', f, e); }
    }));
    for (const f of LOOPS) {
      const b = this.buf[f]; if (!b) continue;
      const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
      // MP3 앞뒤 무음(인코더 패딩)을 잘라 끊김 없이 반복
      src.loopStart = 0.06; src.loopEnd = b.duration - 0.06;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g).connect(this.master); src.start(0, Math.random() * b.duration * 0.8);
      this.loops[f] = g;
    }
    this.ready = true;
  }
  set(name, v, t = 1.5) {
    const g = this.loops[name]; if (!g) return;
    g.gain.setTargetAtTime(v, this.ctx.currentTime, t);
  }
  update(s, moving) {
    if (!this.ready) return;
    const sfx = this.sfxOn ? 1 : 0;
    this.set('wind', sfx * (0.28 + s.mist * 0.15 + s.rain * 0.25));
    this.set('birds', sfx * 0.55 * s.day * (1 - s.rain * 0.85));
    this.set('crickets', sfx * 0.4 * s.night * (1 - s.rain * 0.7));
    this.set('rain', sfx * 0.7 * s.rain);
    this.set('bgm', this.musicOn ? 0.32 : 0, 2.5);
  }
  one(name, vol = 0.5, rate = 1) {
    if (!this.ready || !this.sfxOn || !this.buf[name]) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.buf[name]; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g).connect(this.master); src.start();
  }
  step(run) { this.one('step' + (1 + Math.floor(Math.random() * 4)), run ? 0.38 : 0.28, 0.85 + Math.random() * 0.3); }
  chime() { this.one('chime', 0.45); }
}
