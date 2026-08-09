// ====================== AUDIO ENGINE ======================
// Toàn bộ nhạc nền + SFX được TỔNG HỢP trực tiếp bằng Web Audio API (oscillator +
// noise buffer + envelope + filter), không cần load file mp3/wav ngoài nên chạy
// mượt kể cả offline. Đây là 1 singleton dùng chung cho mọi scene.
const GameAudio = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  muted: false,
  musicPlaying: false,
  _musicTimer: null,
  _nextNoteTime: 0,
  _step: 0,
  _unlocked: false,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.17;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
    } catch (e) { this.ctx = null; }
  },

  // Trình duyệt chặn audio tới khi có tương tác người dùng đầu tiên (click/phím/chạm).
  // Gọi hàm này trong 1 listener 'pointerdown'/'keydown' bất kỳ ở đầu game.
  unlock() {
    this.init();
    if (!this.ctx || this._unlocked) return;
    this._unlocked = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.now(), 0.05);
  },

  now() { return this.ctx ? this.ctx.currentTime : 0; },

  // ---------- Low-level building blocks ----------
  tone(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t0 = this.now() + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },

  sweep(freqFrom, freqTo, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t0 = this.now() + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },

  noiseBurst(dur, vol = 0.2, when = 0, filterFreq = 2000, filterType = 'lowpass') {
    if (!this.ctx) return;
    const t0 = this.now() + when;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    noise.start(t0);
    noise.stop(t0 + dur + 0.02);
  },

  // ---------- SFX ----------
  swordSwing() {
    this.noiseBurst(0.13, 0.15, 0, 3200, 'bandpass');
    this.sweep(950, 220, 0.11, 'triangle', 0.09, 0.01);
  },
  swordHit() {
    this.tone(190, 0.07, 'square', 0.15);
    this.noiseBurst(0.05, 0.13, 0, 1500, 'bandpass');
  },
  shoot(vfx) {
    if (vfx === 'fire') { this.sweep(520, 180, 0.12, 'sawtooth', 0.11); }
    else if (vfx === 'ice') { this.tone(1150, 0.07, 'sine', 0.09); this.tone(1550, 0.05, 'sine', 0.05, 0.02); }
    else if (vfx === 'lightning') { this.noiseBurst(0.05, 0.13, 0, 5200, 'highpass'); this.tone(1650, 0.05, 'square', 0.07); }
    else if (vfx === 'orb') { this.tone(700, 0.09, 'sine', 0.09); this.tone(880, 0.06, 'triangle', 0.05, 0.02); }
    else { this.tone(760, 0.05, 'square', 0.08); this.tone(1040, 0.04, 'triangle', 0.05, 0.015); }
  },
  hit() {
    this.tone(160, 0.08, 'sawtooth', 0.1);
    this.tone(90, 0.11, 'square', 0.07, 0.008);
  },
  explosion() {
    this.noiseBurst(0.3, 0.2, 0, 900, 'lowpass');
    this.sweep(220, 40, 0.26, 'sawtooth', 0.13);
  },
  hurt() {
    this.tone(110, 0.13, 'sawtooth', 0.13);
    this.noiseBurst(0.08, 0.09, 0, 1200, 'lowpass');
  },
  pickup() {
    this.tone(988, 0.06, 'sine', 0.07);
    this.tone(1318, 0.07, 'sine', 0.05, 0.03);
  },
  levelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.11, i * 0.07));
  },
  evolve() {
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.12, i * 0.06));
  },
  bossSpawn() {
    this.sweep(80, 260, 0.55, 'sawtooth', 0.15);
    this.noiseBurst(0.5, 0.11, 0.05, 400, 'lowpass');
  },
  gameOver() {
    [440, 392, 349.23, 293.66].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.11, i * 0.18));
  },
  toggleBeep(on) {
    this.tone(on ? 720 : 480, 0.06, 'sine', 0.08);
  },

  // ---------- Background music (procedural loop, chiptune-ish) ----------
  // Bassline (triangle) + lead melody (square, lọc lowpass cho êm) + hi-hat nhẹ.
  // Dùng scheduler "lookahead" chuẩn Web Audio để giữ nhịp chính xác dù tab bị throttle.
  _pattern: {
    bpm: 100,
    // Am - F - C - G vibe, 8 bước bass (nốt tròn/2)
    bass: [110, 110, 87.31, 87.31, 130.81, 130.81, 98, 98],
    // Lead 16 bước (nốt 8), 0 = nghỉ
    lead: [0, 440, 0, 523.25, 440, 0, 349.23, 0, 0, 392, 0, 440, 349.23, 0, 293.66, 0]
  },

  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this._step = 0;
    const stepTime = 60 / this._pattern.bpm / 2; // nốt 8
    this._nextNoteTime = this.now() + 0.05;
    const scheduleAheadTime = 0.2;

    const scheduler = () => {
      if (!this.musicPlaying || !this.ctx) return;
      while (this._nextNoteTime < this.now() + scheduleAheadTime) {
        this._scheduleMusicStep(this._step, this._nextNoteTime, stepTime);
        this._step = (this._step + 1) % this._pattern.lead.length;
        this._nextNoteTime += stepTime;
      }
      this._musicTimer = setTimeout(scheduler, 60);
    };
    scheduler();
  },

  _scheduleMusicStep(step, t, stepTime) {
    // Bass: mỗi 2 bước đổi 1 nốt (giữ trường độ dài hơn cho ấm)
    if (step % 2 === 0) {
      const bassNote = this._pattern.bass[(step / 2) % this._pattern.bass.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bassNote, t);
      osc.connect(gain); gain.connect(this.musicGain);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + stepTime * 1.85);
      osc.start(t); osc.stop(t + stepTime * 2);
    }
    // Lead melody
    const leadNote = this._pattern.lead[step];
    if (leadNote > 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 2200;
      osc.type = 'square';
      osc.frequency.setValueAtTime(leadNote, t);
      osc.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.26, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + stepTime * 0.9);
      osc.start(t); osc.stop(t + stepTime);
    }
    // Hi-hat nhẹ mỗi bước lẻ để giữ nhịp, không quá ồn
    if (step % 2 === 1) {
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * 0.03));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 6000;
      const gain = this.ctx.createGain();
      noise.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      noise.start(t); noise.stop(t + 0.04);
    }
  },

  stopMusic() {
    this.musicPlaying = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
  }
};

// Áp trạng thái mute đã lưu (nếu có) ngay khi script load
GameAudio.muted = localStorage.getItem('vs_muted') === '1';
