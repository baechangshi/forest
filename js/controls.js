// 조작: PC(WASD/방향키 + 마우스 드래그·포인터락), 모바일(왼쪽 가상 조이스틱 + 오른쪽 드래그 시점)
export class Controls {
  constructor(el, joyEl, knobEl) {
    this.el = el; this.joyEl = joyEl; this.knobEl = knobEl;
    this.yaw = 0; this.pitch = 0;
    this.move = { x: 0, y: 0 }; // x: 좌우, y: 앞뒤 (+앞)
    this.run = false; this.keys = new Set(); this.enabled = false;
    this.joy = null; this.look = null; this.mouse = null;
    this.sens = 0.0042;

    addEventListener('keydown', (e) => { if (e.target.closest('input,textarea')) return; this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.moveP(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e));
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
    el.addEventListener('mousemove', (e) => { if (this.locked) this.turn(e.movementX, e.movementY); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  turn(dx, dy, k = 1) {
    this.yaw -= dx * this.sens * k;
    this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - dy * this.sens * k));
  }
  down(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      this.mouse = { x: e.clientX, y: e.clientY, id: e.pointerId };
      return;
    }
    const left = e.clientX < innerWidth * 0.45;
    if (left && !this.joy) {
      this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.joyEl.style.left = e.clientX + 'px'; this.joyEl.style.top = e.clientY + 'px';
      this.joyEl.classList.add('on'); this.knobEl.style.transform = 'translate(-50%,-50%)';
    } else if (!this.look) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }
  moveP(e) {
    if (this.mouse && e.pointerId === this.mouse.id && !this.locked) {
      this.turn(e.clientX - this.mouse.x, e.clientY - this.mouse.y);
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    }
    if (this.joy && e.pointerId === this.joy.id) {
      const R = 56;
      let dx = e.clientX - this.joy.x, dy = e.clientY - this.joy.y;
      const d = Math.hypot(dx, dy); this.run = d > R * 1.5; if (d > R) { dx *= R / d; dy *= R / d; }
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.move.x = dx / R; this.move.y = -dy / R;
    }
    if (this.look && e.pointerId === this.look.id) {
      this.turn(e.clientX - this.look.x, e.clientY - this.look.y, 1.25);
      this.look.x = e.clientX; this.look.y = e.clientY;
    }
  }
  up(e) {
    if (this.mouse && e.pointerId === this.mouse.id) this.mouse = null;
    if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.move.x = this.move.y = 0; this.run = false; this.joyEl.classList.remove('on'); }
    if (this.look && e.pointerId === this.look.id) this.look = null;
  }
  // 키보드 + 조이스틱 합친 입력
  input() {
    const k = this.keys;
    let x = this.move.x, y = this.move.y;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
      if (k.has('KeyA')) x -= 1;
      if (k.has('KeyD')) x += 1;
      if (k.has('ArrowLeft')) this.yaw += 0.03;
      if (k.has('ArrowRight')) this.yaw -= 0.03;
      if (k.has('KeyQ')) this.yaw += 0.03;
      if (k.has('KeyE')) this.yaw -= 0.03;
    }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    const run = this.run || k.has('ShiftLeft') || k.has('ShiftRight');
    return { x, y, run };
  }
}
