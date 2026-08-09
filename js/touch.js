// ====================== TOUCH JOYSTICK (mobile) ======================
// Joystick ảo dùng DOM, độc lập với Phaser input để không đụng UI/level-up.
// GameScene đọc TouchJoystick.vector.x / .y (mỗi giá trị -1..1) mỗi frame.
const TouchJoystick = {
  active: false,
  vector: { x: 0, y: 0 },
  pointerId: null,
  _inited: false,

  init() {
    if (this._inited) return;
    this._inited = true;

    const zone = document.getElementById('joyZone');
    const base = document.getElementById('joyBase');
    const stick = document.getElementById('joyStick');
    if (!zone || !base || !stick) return;

    let originX = 0, originY = 0;
    const maxDist = 52;

    const start = (e) => {
      if (this.pointerId !== null) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      this.pointerId = t.identifier ?? 'mouse';
      originX = t.clientX; originY = t.clientY;
      base.style.left = (originX - 55) + 'px'; base.style.top = (originY - 55) + 'px';
      stick.style.left = (originX - 25) + 'px'; stick.style.top = (originY - 25) + 'px';
      base.style.display = 'block'; stick.style.display = 'block';
      this.active = true;
      e.preventDefault();
    };
    const move = (e) => {
      if (!this.active) return;
      const touches = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const t = touches.find(t => (t.identifier ?? 'mouse') === this.pointerId);
      if (!t) return;
      let dx = t.clientX - originX, dy = t.clientY - originY;
      const d = Math.hypot(dx, dy);
      if (d > maxDist) { dx = dx / d * maxDist; dy = dy / d * maxDist; }
      stick.style.left = (originX + dx - 25) + 'px'; stick.style.top = (originY + dy - 25) + 'px';
      this.vector.x = dx / maxDist; this.vector.y = dy / maxDist;
      e.preventDefault();
    };
    const end = (e) => {
      if (!this.active) return;
      const touches = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const found = touches.find(t => (t.identifier ?? 'mouse') === this.pointerId);
      if (!found && e.type !== 'mouseup') return;
      this.active = false; this.pointerId = null; this.vector.x = 0; this.vector.y = 0;
      base.style.display = 'none'; stick.style.display = 'none';
    };

    zone.addEventListener('touchstart', start, { passive: false });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end, { passive: false });
    zone.addEventListener('touchcancel', end, { passive: false });
    // Hỗ trợ chuột (test trên desktop) song song với bàn phím
    zone.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }
};
TouchJoystick.init();

// Phát hiện thiết bị cảm ứng để tự hiện/ẩn vùng joystick + nút pause mobile
const IS_TOUCH_DEVICE = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
