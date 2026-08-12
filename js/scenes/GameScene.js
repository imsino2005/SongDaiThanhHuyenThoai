class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.classId = data.classId || 'archer';
    this.classData = CLASSES[this.classId];
    this.difficulty = data.difficulty || 'normal';
    // Cloud Save được truyền vào khi người chơi chọn Load Cloud Save từ menu.
    this.pendingCloudSave = data.cloudSave || null;
  }

  create() {
    this.worldSize = 3200;
    this.physics.world.setBounds(0, 0, this.worldSize, this.worldSize);

    // Background tiles
    this.add.rectangle(this.worldSize / 2, this.worldSize / 2, this.worldSize, this.worldSize, 0x0b0b16);
    const tileSize = 64;
    for (let x = 0; x < this.worldSize; x += tileSize) {
      for (let y = 0; y < this.worldSize; y += tileSize) {
        const key = ((x + y) / tileSize) % 5 === 0 ? 'tile_stone' : 'tile_floor';
        this.add.image(x + tileSize / 2, y + tileSize / 2, key).setDepth(0).setAlpha(0.95);
      }
    }
    // Deterministic decoration layout for the single-player map.
    const mapSeedSource = 'offline-map';
    let mapSeed = 2166136261;
    for (let i = 0; i < mapSeedSource.length; i++) {
      mapSeed ^= mapSeedSource.charCodeAt(i);
      mapSeed = Math.imul(mapSeed, 16777619);
    }
    const seededRandom = () => {
      mapSeed += 0x6D2B79F5;
      let t = mapSeed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 80; i++) {
      const dx = 40 + Math.floor(seededRandom() * (this.worldSize - 80));
      const dy = 40 + Math.floor(seededRandom() * (this.worldSize - 80));
      if (seededRandom() < 0.6) {
        this.add.image(dx, dy, 'deco_grass').setDepth(1).setAlpha(0.7).setScale(0.8 + seededRandom() * 0.6);
      } else {
        this.add.image(dx, dy, 'deco_rune').setDepth(1).setAlpha(0.35).setScale(0.7 + seededRandom() * 0.5);
      }
    }

    // Groups
    this.enemies = this.physics.add.group();
    this.projectiles = this.physics.add.group();
    this.gems = this.physics.add.group();
    this.magnets = this.physics.add.group();
    this.magnetizedGems = []; // gem đang bay vào người sau khi lụm Nam Châm
    this.chests = this.physics.add.group();
    this.turrets = this.physics.add.group();
    this.drones = this.physics.add.group();
    this.mines = this.physics.add.group();
    this.enemyProjectiles = this.physics.add.group();

    // Player - sprite theo class
    const charKey = 'char_' + this.classId + '_idle';
    this.player = this.physics.add.sprite(this.worldSize / 2, this.worldSize / 2, charKey);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.setScale(1.15);
    this.player.body.setCircle(14, 8, 10);

    // Shadow
    this.playerShadow = this.add.image(this.player.x, this.player.y + 18, 'shadow_' + this.classId)
      .setDepth(9).setAlpha(0.45);

    // Run bob state
    this.playerBob = 0;
    this.isMoving = false;
    this.playerState = 'idle';
    this.setupPlayerAnimations();
    this.setPlayerState('idle');

    // Stats
    const diffMul = { easy: 0.7, normal: 1, hard: 1.4 }[this.difficulty] || 1;
    this.diffMul = diffMul;

    // Bonus vĩnh viễn từ Shop (Sức Mạnh/Sinh Lực/Nhanh Nhẹn) - đọc từ các cấp đã mua,
    // lưu ở window.AuthAPI.user.upgrades (được refetch mỗi lần vào ClassSelectScene).
    const ownedUpgrades = window.AuthAPI && window.AuthAPI.user ? window.AuthAPI.user.upgrades : null;
    const upgradeMul = (statKey) => {
      if (!ownedUpgrades || typeof UPGRADE_DEFS === 'undefined') return 1;
      let mul = 1;
      Object.keys(UPGRADE_DEFS).forEach(key => {
        const def = UPGRADE_DEFS[key];
        if (def.statKey === statKey) {
          const level = ownedUpgrades[key] || 0;
          mul += def.bonusPerLevel * level;
        }
      });
      return mul;
    };

    const maxHp = Math.round(this.classData.baseStats.maxHp * upgradeMul('maxHp'));
    this.stats = {
      maxHp,
      hp: maxHp,
      speed: Math.round(this.classData.baseStats.speed * upgradeMul('speed')),
      damage: Math.round(this.classData.baseStats.damage * upgradeMul('damage')),
      attackSpeed: 1,
      armor: 0,
      pickupRange: Math.round(90 * upgradeMul('pickupRange')),
      xpGain: 1 * upgradeMul('xpGain'),
      crit: 0.05,
      area: 1,
      lifesteal: 0
    };

    // weaponLevels: { weaponId: level }  — tối đa MAX_WEAPONS
    this.weaponLevels = {};
    this.weaponLevels[this.classData.startWeapon] = 1;
    this.ownedPassives = [];
    this.weaponCooldowns = {};
    this.weaponCooldowns[this.classData.startWeapon] = 0;
    this.pendingStartDrone = false;

    this.level = 1;
    this.xp = 0;
    this.xpToNext = 18;
    this.kills = 0;
    this.killStreak = 0;
    this.killStreakTimer = 0;
    this.killStreakWindowMs = 2600; // giết tiếp trong 2.6s để giữ combo, quá thời gian sẽ reset
    this.bossKills = 0;
    this.chestsOpened = 0;
    this.timeAlive = 0;
    this.isPaused = false;
    this.isLevelingUp = false;
    this.isGameOver = false;
    this.enemySpawnTimer = 0;
    this.enemySpawnInterval = 1100;
    this.difficultyTimer = 0;
    this.droneAngle = 0;
    this.maxTurrets = 2;
    this.hpRegenTimer = 0;
    this.isRollingChest = false;

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBounds(0, 0, this.worldSize, this.worldSize);
    this.cameras.main.setZoom(1);

    // Controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    this.input.keyboard.on('keydown-M', () => this.toggleMute());

    // ===== Aim mode: Auto (ngắm quái gần nhất) <-> Mouse (ngắm theo chuột), toggle bằng Shift trái =====
    this.aimMode = 'auto';
    this.facingAngle = 0;
    this.input.keyboard.on('keydown', (event) => {
      if (event.code === 'ShiftLeft') this.toggleAimMode();
    });

    // Collisions
    this.physics.add.overlap(this.projectiles, this.enemies, this.onProjectileHitEnemy, null, this);
    this.physics.add.overlap(this.player, this.gems, this.onCollectGem, null, this);
    this.physics.add.overlap(this.player, this.magnets, this.onCollectMagnet, null, this);
    this.physics.add.overlap(this.player, this.chests, this.onCollectChest, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHitEnemy, null, this);
    this.physics.add.overlap(this.mines, this.enemies, this.onMineHitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemyProjectiles, this.onEnemyProjectileHitPlayer, null, this);

    // Particles
    this.hitParticles = this.add.particles(0, 0, 'particle', {
      speed: { min: 50, max: 140 },
      scale: { start: 0.7, end: 0 },
      lifespan: 350,
      emitting: false,
      tint: [0xff6666, 0xffaa44, 0xffffff]
    });

    this.xpParticles = this.add.particles(0, 0, 'particle', {
      speed: { min: 20, max: 60 },
      scale: { start: 0.5, end: 0 },
      lifespan: 400,
      emitting: false,
      tint: 0x44ff88
    });

    this.evoParticles = this.add.particles(0, 0, 'particle', {
      speed: { min: 80, max: 200 },
      scale: { start: 1, end: 0 },
      lifespan: 600,
      emitting: false,
      tint: [0xffee88, 0xffffff, 0xaaddff]
    });

    // Sound (tổng hợp bằng Web Audio qua GameAudio — nhạc nền + SFX thật, xem js/audio.js)
    GameAudio.init();
    GameAudio.setMuted(GameAudio.muted);
    if (!GameAudio.musicPlaying) GameAudio.startMusic();

    this.createUI();
    this.createPauseButton();
    this.updateSkillPanel();

    window.currentGameScene = this;


    // Player subtle glow (class color)
    try {
      if (this.player.preFX) {
        this.player.preFX.addGlow(this.classData.color, 1.5, 0, false, 0.08, 6);
      }
    } catch (e) {}

    this.setJoyZoneVisible(true);

    // Nếu scene được mở từ Load Cloud Save, áp dụng dữ liệu sau khi toàn bộ
    // player/UI/physics đã được khởi tạo. Không cộng dồn với save cũ.
    if (this.pendingCloudSave) {
      const saveData = this.pendingCloudSave;
      this.pendingCloudSave = null;
      this.time.delayedCall(0, () => {
        if (this.applySaveData(saveData)) {
          this.updateUI();
          this.updateSkillPanel();
          this.showToast('Đã load file save thành công!', true);
        }
      });
    }

    if (this.pendingStartDrone) {
      this.time.delayedCall(300, () => {
        this.spawnDrone({ damage: 10, cooldown: 600 }, 1);
      });
    }
  }

  // Bật/tắt vùng chạm joystick — chỉ bật khi đang thực sự điều khiển nhân vật,
  // tắt khi pause/level-up/game-over để không chặn tap vào các nút UI phía trên.
  setJoyZoneVisible(visible) {
    const el = document.getElementById('joyZone');
    if (el) el.style.display = visible ? 'block' : 'none';
    if (!visible && typeof TouchJoystick !== 'undefined') {
      TouchJoystick.active = false;
      TouchJoystick.vector.x = 0; TouchJoystick.vector.y = 0;
    }
  }

  // ========== SOUND ==========
  // Toàn bộ tổng hợp âm thanh thật nằm trong GameAudio (js/audio.js) — các hàm dưới
  // đây chỉ là lối tắt tiện dùng trong GameScene, kèm theo ngữ cảnh riêng (vfx, v.v.)
  sfxShoot(vfx) { GameAudio.shoot(vfx); }
  sfxSwordSwing() { GameAudio.swordSwing(); }
  sfxSwordHit() { GameAudio.swordHit(); }
  sfxHit() { GameAudio.hit(); }
  sfxLevel() { GameAudio.levelUp(); }
  sfxEvo() { GameAudio.evolve(); }
  sfxHurt() { GameAudio.hurt(); }
  sfxPickup() { GameAudio.pickup(); }
  sfxExplosion() { GameAudio.explosion(); }
  sfxBossSpawn() { GameAudio.bossSpawn(); }

  toggleMute() {
    GameAudio.setMuted(!GameAudio.muted);
    localStorage.setItem('vs_muted', GameAudio.muted ? '1' : '0');
    if (this.muteText) this.muteText.setText(GameAudio.muted ? '🔇' : '🔊');
  }

  // ========== UI ==========
  createUI() {
    const w = this.scale.width;
    const h = this.scale.height;

    // HUD panel
    this.hudPanel = this.add.rectangle(10, 10, 280, 132, 0x08111f, 0.78).setOrigin(0).setScrollFactor(0).setDepth(99);
    this.hudPanelStroke = this.add.rectangle(10, 10, 280, 132).setOrigin(0).setStrokeStyle(1, 0x4e6d9d, 0.8).setScrollFactor(0).setDepth(100);

    // HP
    this.hpBarBg = this.add.rectangle(24, 20, 232, 18, 0x111928).setOrigin(0).setScrollFactor(0).setDepth(101);
    // Thanh "chip damage" — hiển thị máu vừa mất, rút chậm dần để người chơi thấy rõ vừa bị đánh bao nhiêu
    this.hpBarTrail = this.add.rectangle(24, 20, 232, 18, 0xffa64d, 0.55).setOrigin(0).setScrollFactor(0).setDepth(101.5);
    this.hpBar = this.add.rectangle(24, 20, 232, 18, 0x44ff88).setOrigin(0).setScrollFactor(0).setDepth(102);
    this.hpText = this.add.text(24, 17, '', { fontSize: '12px', color: '#eef6ff', fontFamily: 'Segoe UI' }).setScrollFactor(0).setDepth(103);

    // XP
    this.xpBarBg = this.add.rectangle(24, 44, 232, 10, 0x111928).setOrigin(0).setScrollFactor(0).setDepth(101);
    this.xpBar = this.add.rectangle(24, 44, 0, 10, 0x6d94ff).setOrigin(0).setScrollFactor(0).setDepth(102);
    this.xpText = this.add.text(24, 53, '', { fontSize: '10px', color: '#a7c8ff', fontFamily: 'Segoe UI' }).setScrollFactor(0).setDepth(103);

    this.levelText = this.add.text(24, 66, 'Lv 1', {
      fontSize: '16px', color: '#ffd97a', fontFamily: 'Segoe UI', fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(103);

    this.classNameText = this.add.text(24, 88, this.classData.name, {
      fontSize: '13px', color: '#8ec7ff', fontFamily: 'Segoe UI'
    }).setScrollFactor(0).setDepth(103);

    this.skillPanelBg = this.add.rectangle(w - 16 - 282, h - 16 - 190, 282, 190, 0x08111f, 0.84)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(100).setStrokeStyle(1, 0x5d7cc3, 0.85);
    // Vệt sáng mảnh phía trên panel cho cảm giác có chiều sâu hơn khung phẳng đơn sắc.
    this.skillPanelAccent = this.add.rectangle(w - 16 - 282, h - 16 - 190, 282, 3, 0x7aa6ff, 0.55)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(101);
    this.skillPanelTitle = this.add.text(w - 16 - 14 - 282, h - 16 - 178, 'SKILL PANEL', {
      fontSize: '14px', color: '#b7d7ff', fontFamily: 'Segoe UI', fontStyle: 'bold'
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(102);
    this.skillPanelContainer = this.add.container(w - 16 - 272, h - 16 - 152).setScrollFactor(0).setDepth(102);

    // Tooltip dùng chung cho mọi icon skill (ẩn mặc định, hiện khi hover/tap).
    this.skillTooltipBg = this.add.rectangle(0, 0, 10, 10, 0x0b1220, 0.96)
      .setOrigin(0, 1).setScrollFactor(0).setDepth(600).setStrokeStyle(1, 0x6c9ee8, 0.9).setVisible(false);
    this.skillTooltipTitle = this.add.text(0, 0, '', {
      fontSize: '13px', color: '#ffe9a8', fontFamily: 'Segoe UI', fontStyle: 'bold'
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(601).setVisible(false);
    this.skillTooltipDesc = this.add.text(0, 0, '', {
      fontSize: '11px', color: '#c7d2ee', fontFamily: 'Segoe UI', wordWrap: { width: 210 }
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(601).setVisible(false);
    this._skillTooltipHideEvent = null;

    this.timeText = this.add.text(w - 16, 16, '0:00', {
      fontSize: '24px', color: '#fff', fontFamily: 'Segoe UI', fontStyle: 'bold'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102);

    this.killText = this.add.text(w - 16, 48, 'Kills: 0', {
      fontSize: '14px', color: '#ff9999', fontFamily: 'Segoe UI'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102);

    // Combo/Kill Streak - chỉ hiện khi đang có streak (>=2), tự ẩn khi hết combo
    this.comboText = this.add.text(w - 16, 68, '', {
      fontSize: '13px', color: '#ffd166', fontFamily: 'Segoe UI', fontStyle: 'bold'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102).setVisible(false);

    this.classText = this.add.text(w - 16, 92, this.classData.name, {
      fontSize: '14px', color: '#aaccff', fontFamily: 'Segoe UI'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102);

    // Aim mode indicator (toggle bằng Shift trái)
    this.aimText = this.add.text(w - 16, 114, 'Aim: AUTO (Shift)', {
      fontSize: '12px', color: '#88ddff', fontFamily: 'Segoe UI'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102);

    // Crosshair theo chuột — chỉ hiện khi ở mode Mouse
    this.aimCrosshair = this.add.circle(0, 0, 7, 0x000000, 0)
      .setStrokeStyle(2, 0xffdd66, 0.9).setDepth(50).setVisible(false);
    this.aimCrosshairDot = this.add.circle(0, 0, 1.5, 0xffdd66, 1).setDepth(50).setVisible(false);

    // Mute button
    this.muteText = this.add.text(w - 16, h - 20, GameAudio.muted ? '🔇' : '🔊', {
      fontSize: '22px'
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });
    this.muteText.on('pointerdown', () => this.toggleMute());

    // Minimap
    this.minimapSize = 120;
    this.minimapBg = this.add.rectangle(w - 16 - this.minimapSize / 2, h - 16 - this.minimapSize / 2, this.minimapSize + 4, this.minimapSize + 4, 0x111122, 0.85)
      .setScrollFactor(0).setDepth(100).setStrokeStyle(2, 0x445566);
    this.minimapGfx = this.add.graphics().setScrollFactor(0).setDepth(101);
  }

  updateWeaponIcons() {
    // Legacy function removed: we now render weapon/passive icons inside the skill panel.
  }

  setupPlayerAnimations() {
    const states = ['idle', 'run', 'attack', 'hit', 'death', 'victory'];
    states.forEach(state => {
      const key = `${this.classId}_${state}`;
      if (this.anims.exists(key)) return;
      const frames = [{ key: `char_${this.classId}_${state}` }];
      if (state === 'run') {
        frames.push({ key: `char_${this.classId}_idle` });
      }
      this.anims.create({
        key,
        frames,
        frameRate: state === 'run' ? 8 : 4,
        repeat: state === 'run' ? -1 : 0
      });
    });
  }

  setPlayerState(state) {
    if (!this.player || this.playerState === state) return;
    this.playerState = state;
    const animKey = `${this.classId}_${state}`;
    if (this.anims.exists(animKey)) {
      this.player.anims.play(animKey, true);
    } else {
      const tex = `char_${this.classId}_${state}`;
      if (this.textures.exists(tex)) this.player.setTexture(tex);
    }
  }

  hitStop(duration = 80, speed = 0.2) {
    if (!this.physics.world) return;
    if (this._hitStopTimer) this._hitStopTimer.remove(false);
    this.physics.world.timeScale = speed;
    this._hitStopTimer = this.time.delayedCall(duration, () => {
      if (this.physics && this.physics.world) this.physics.world.timeScale = 1;
    });
  }

  spawnScreenFlash(color = 0xffffff, alpha = 0.25, duration = 120) {
    const flash = this.add.rectangle(this.cameras.main.scrollX + this.cameras.main.width / 2,
      this.cameras.main.scrollY + this.cameras.main.height / 2,
      this.cameras.main.width, this.cameras.main.height, color, alpha)
      .setScrollFactor(0)
      .setDepth(300);
    this.tweens.add({ targets: flash, alpha: 0, duration, onComplete: () => flash.destroy() });
  }

  updateMinimap() {
    const g = this.minimapGfx;
    g.clear();
    const size = this.minimapSize;
    const x0 = this.scale.width - 16 - size;
    const y0 = this.scale.height - 16 - size;
    const scale = size / this.worldSize;

    // BG
    g.fillStyle(0x0a0a18, 0.9);
    g.fillRect(x0, y0, size, size);

    // Enemies
    g.fillStyle(0xff4444, 0.9);
    this.enemies.getChildren().forEach(e => {
      if (!e.active) return;
      g.fillCircle(x0 + e.x * scale, y0 + e.y * scale, 2);
    });

    // Local player
    g.fillStyle(0x44ff88, 1);
    g.fillCircle(x0 + this.player.x * scale, y0 + this.player.y * scale, 3.5);

    // Turrets
    g.fillStyle(0x66aaff, 1);
    this.turrets.getChildren().forEach(t => {
      if (t.active) g.fillCircle(x0 + t.x * scale, y0 + t.y * scale, 2.5);
    });
  }

  // ========== UPDATE ==========
  update(time, delta) {
    if (this.isPaused || this.isLevelingUp || this.isGameOver || this.isRollingChest) return;

    this.timeAlive += delta;
    this.difficultyTimer += delta;

    this.handleMovement();
    this.handleWeapons(delta);
    this.updateDrones(delta);
    this.updateTurrets(delta);
    this.spawnEnemies(delta);
    this.updateEnemies(delta);
    this.attractGems();
    this.updateMagnetizedGems(delta);
    this.updateHpRegen(delta);
    this.updateKillStreak(delta);
    this.updateUI();
    this.updateMinimap();
    this.updateAimCrosshair();
  }

  // ========== HP REGEN (mọi class tự hồi máu theo thời gian) ==========
  updateHpRegen(delta) {
    if (this.stats.hp <= 0 || this.stats.hp >= this.stats.maxHp) return;
    this.hpRegenTimer += delta;
    while (this.hpRegenTimer >= 1000) {
      this.hpRegenTimer -= 1000;
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + HP_REGEN_PER_SEC);
    }
  }

  // ========== KILL STREAK / COMBO ==========
  // Đếm số quái giết liên tục trong khoảng killStreakWindowMs. Hết thời gian mà
  // không giết thêm quái nào -> streak reset về 0 và ẩn chữ combo trên HUD.
  updateKillStreak(delta) {
    if (this.killStreak <= 0) return;
    this.killStreakTimer -= delta;
    if (this.killStreakTimer <= 0) {
      this.killStreak = 0;
      if (this.comboText) this.comboText.setVisible(false);
    }
  }

  registerKillStreak() {
    this.killStreak++;
    this.killStreakTimer = this.killStreakWindowMs;

    if (this.comboText) {
      this.comboText.setText(`🔥 Combo x${this.killStreak}`);
      this.comboText.setVisible(true);
    }

    // Mốc đáng ăn mừng - hiện chữ nổi ở giữa nhân vật + rung nhẹ camera + phóng to combo text.
    if (this.killStreak >= 3 && this.killStreak % 5 === 0) {
      const milestoneColor = this.killStreak >= 20 ? '#ff4466' : (this.killStreak >= 10 ? '#ff9944' : '#ffee44');
      this.showFloatingText(this.player.x, this.player.y - 55, `COMBO x${this.killStreak}!`, milestoneColor);
      this.cameras.main.shake(60, 0.004);
      if (this.comboText) {
        this.comboText.setScale(1.4);
        this.tweens.add({ targets: this.comboText, scale: 1, duration: 220, ease: 'Back.easeOut' });
      }
    }
  }

  // ========== AIM MODE (Auto / Mouse — toggle Shift trái) ==========
  toggleAimMode() {
    this.aimMode = this.aimMode === 'auto' ? 'manual' : 'auto';
    if (this.aimText) {
      this.aimText.setText(this.aimMode === 'auto' ? 'Aim: AUTO (Shift)' : 'Aim: MOUSE (Shift)');
      this.aimText.setColor(this.aimMode === 'auto' ? '#88ddff' : '#ffdd66');
    }
    if (this.aimCrosshair) this.aimCrosshair.setVisible(this.aimMode === 'manual');
    if (this.aimCrosshairDot) this.aimCrosshairDot.setVisible(this.aimMode === 'manual');
    GameAudio.toggleBeep(this.aimMode === 'manual');
  }

  updateAimCrosshair() {
    if (this.aimMode !== 'manual' || !this.aimCrosshair) return;
    const p = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(p.x, p.y);
    this.aimCrosshair.setPosition(world.x, world.y);
    this.aimCrosshairDot.setPosition(world.x, world.y);
  }

  // Trả về góc (radian) player đang nhắm tới, theo mode hiện tại.
  // Auto: hướng tới quái gần nhất trong tầm 'range'. Mouse: hướng tới chuột.
  // Nếu auto mà không có quái, giữ nguyên góc nhắm gần nhất trước đó (để vung kiếm vẫn có hướng hợp lý).
  getAimAngle(range) {
    if (this.aimMode === 'manual') {
      const p = this.input.activePointer;
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      this.facingAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, world.x, world.y);
      return this.facingAngle;
    }
    const nearest = this.findNearestEnemy(range || 700);
    if (nearest) {
      this.facingAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y);
    }
    return this.facingAngle;
  }

  handleMovement() {
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;

    // Joystick ảo (mobile) — ghi đè bàn phím khi ngón tay đang giữ
    if (typeof TouchJoystick !== 'undefined' && TouchJoystick.active) {
      vx = TouchJoystick.vector.x;
      vy = TouchJoystick.vector.y;
    }

    if (vx || vy) {
      const len = Math.sqrt(vx * vx + vy * vy);
      if (len > 1) { vx /= len; vy /= len; }
      this.isMoving = true;
      // flip sprite
      if (vx < 0) this.player.setFlipX(true);
      else if (vx > 0) this.player.setFlipX(false);
    } else {
      this.isMoving = false;
    }
    this.player.setVelocity(vx * this.stats.speed, vy * this.stats.speed);

    // Run animation and bob
    if (this.isMoving) {
      this.playerBob += 0.28;
      const bob = Math.sin(this.playerBob);
      this.player.setScale(1.15 + bob * 0.04, 1.15 - bob * 0.05);
      if (this.playerState !== 'attack' && this.playerState !== 'hit') {
        this.setPlayerState('run');
      }
    } else {
      this.player.setScale(1.15);
      if (this.playerState !== 'attack' && this.playerState !== 'hit') {
        this.setPlayerState('idle');
      }
    }
    if (this.playerShadow) {
      this.playerShadow.setPosition(this.player.x, this.player.y + 18);
      this.playerShadow.setScale(this.isMoving ? 0.85 + Math.abs(Math.sin(this.playerBob)) * 0.1 : 1);
      this.playerShadow.setAlpha(this.isMoving ? 0.35 : 0.45);
    }
  }

  // ========== WEAPONS ==========
  handleWeapons(delta) {
    Object.keys(this.weaponLevels).forEach(weaponId => {
      const base = getWeaponData(weaponId);
      if (!base) return;
      const data = scaleWeaponStats(base, this.weaponLevels[weaponId]);

      let cd = (data.cooldown || 500) / this.stats.attackSpeed;
      this.weaponCooldowns[weaponId] = (this.weaponCooldowns[weaponId] || 0) - delta;

      if (this.weaponCooldowns[weaponId] <= 0) {
        this.fireWeapon(weaponId, data);
        this.weaponCooldowns[weaponId] = cd;
      }
    });
  }

  fireWeapon(weaponId, data) {
    const dmgMul = this.stats.damage / this.classData.baseStats.damage;
    const type = data.type || 'ranged';

    // Engineer: nhân vật KHÔNG tự đánh — chỉ summon
    if (this.classId === 'engineer' && type !== 'summon') {
      return;
    }

    if (type === 'ranged') {
      this.fireRanged(data, dmgMul);
    } else if (type === 'melee') {
      this.fireMelee(data, dmgMul);
    } else if (type === 'orbit' || type === 'aura') {
      this.fireAura(data, dmgMul);
    } else if (type === 'summon') {
      if (weaponId.includes('drone') || weaponId.includes('swarm')) {
        this.spawnDrone(data, dmgMul);
      } else if (weaponId.includes('mine')) {
        this.placeMine(data, dmgMul);
      } else if (weaponId.includes('tesla') || weaponId.includes('coil') || weaponId.includes('storm_coil')) {
        this.placeTesla(data, dmgMul);
      } else if (weaponId.includes('repair')) {
        this.placeRepairBot(data, dmgMul);
      } else {
        // turret_kit, fortress_turret, default summon = turret
        this.placeTurret(data, dmgMul);
      }
    }
  }

  fireRanged(data, dmgMul) {
    let baseAngle;
    if (this.aimMode === 'manual') {
      // Ngắm theo chuột: luôn bắn về hướng chuột dù có quái trong tầm hay không
      baseAngle = this.getAimAngle();
    } else {
      const nearest = this.findNearestEnemy(700);
      if (!nearest) return;
      baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y);
      this.facingAngle = baseAngle;
    }

    this.setPlayerState('attack');
    this.time.delayedCall(120, () => {
      if (!this.isMoving && this.playerState === 'attack') this.setPlayerState('idle');
      if (this.isMoving && this.playerState === 'attack') this.setPlayerState('run');
    });

    const count = data.count || 1;
    const spread = data.spread || (count > 1 ? 18 : 0);
    const vfx = data.vfx || 'arrow';
    const tex = this.getProjectileTexture(vfx, data.id);
    const tint = this.getProjectileTint(vfx, data.id);

    // Muzzle flash tại player
    this.spawnMuzzleFlash(this.player.x, this.player.y, tint);

    for (let i = 0; i < count; i++) {
      let angle = baseAngle;
      if (count > 1) {
        angle += Phaser.Math.DegToRad(-spread / 2 + (spread / Math.max(1, count - 1)) * i);
      }

      const bullet = this.projectiles.create(this.player.x, this.player.y, tex);
      bullet.setScale(this.getProjectileScale(vfx));
      if (tint) bullet.setTint(tint);
      bullet.setDepth(6);
      bullet.setRotation(angle);
      bullet.damage = (data.damage || 10) * dmgMul;
      bullet.pierce = data.pierce || 0;
      bullet.hitList = new Set();
      bullet.explosionRadius = (data.explosionRadius || 0) * this.stats.area;
      bullet.chain = data.chain || 0;
      bullet.slow = data.slow || 0;
      bullet.vfxType = vfx;
      bullet.weaponId = data.id;

      // WebGL Glow shader (Phaser 3 FX)
      this.applyGlowFX(bullet, vfx, tint);

      const speed = data.projectileSpeed || 400;
      this.physics.velocityFromRotation(angle, speed, bullet.body.velocity);
      this.sfxShoot(vfx);

      // Trail particle theo đạn
      this.attachTrail(bullet, vfx, tint);

      this.time.delayedCall(2200, () => {
        if (bullet.active) {
          if (bullet.trailEmitter) bullet.trailEmitter.stop();
          bullet.destroy();
        }
      });
    }
  }

  getProjectileTexture(vfx, id) {
    if (vfx === 'fire' || (id && id.includes('fire')) || (id && id.includes('meteor')) || (id && id.includes('dragon')) || (id && id.includes('armageddon'))) return 'proj_fire';
    if (vfx === 'ice' || (id && (id.includes('ice') || id.includes('frost') || id.includes('absolute') || id.includes('glacier')))) return 'proj_ice';
    if (vfx === 'lightning' || (id && (id.includes('lightning') || id.includes('thunder') || id.includes('chain')))) return 'proj_lightning';
    if (vfx === 'orb' || (id && (id.includes('magic') || id.includes('arcane') || id.includes('barrage')))) return 'magic_orb';
    if (vfx === 'arrow' || vfx === 'pierce') return 'arrow';
    if (id && (id.includes('plasma') || id.includes('gun'))) return 'proj_plasma';
    return 'bullet';
  }

  getProjectileTint(vfx, id) {
    if (vfx === 'fire') return 0xff6622;
    if (vfx === 'ice') return 0x88ddff;
    if (vfx === 'lightning') return 0xffee44;
    if (vfx === 'orb') return 0xb388ff;
    if (vfx === 'pierce') return 0xaaffcc;
    if (vfx === 'explode') return 0xff8844;
    if (id && id.includes('blood')) return 0xff4466;
    if (id && id.includes('phantom')) return 0xccffee;
    if (id && id.includes('dragon')) return 0xff4400;
    return null;
  }

  getProjectileScale(vfx) {
    if (vfx === 'fire') return 1.1;
    if (vfx === 'orb') return 1.0;
    if (vfx === 'lightning') return 1.0;
    if (vfx === 'arrow' || vfx === 'pierce') return 1.15;
    return 0.9;
  }

  spawnMuzzleFlash(x, y, tint) {
    const c = this.add.circle(x, y, 8, tint || 0xffee88, 0.7).setDepth(7);
    this.tweens.add({
      targets: c, scale: 2.2, alpha: 0, duration: 120,
      onComplete: () => c.destroy()
    });
    this.hitParticles.emitParticleAt(x, y, 3);
  }

  applyGlowFX(obj, vfx, tint) {
    if (!obj || !obj.preFX) return; // cần WebGL
    try {
      // clear old
      if (obj.preFX.list && obj.preFX.list.length) obj.preFX.clear();
      let color = 0xffffff;
      let outer = 2;
      let inner = 0;
      if (vfx === 'fire' || vfx === 'explode') { color = 0xff6622; outer = 4; }
      else if (vfx === 'ice') { color = 0x66ccff; outer = 3; }
      else if (vfx === 'lightning') { color = 0xffee44; outer = 4; }
      else if (vfx === 'orb') { color = 0xaa66ff; outer = 3; }
      else if (vfx === 'pierce') { color = 0x88ffcc; outer = 3; }
      else if (vfx === 'arrow') { color = 0xffdd88; outer = 2; }
      else if (tint) { color = tint; outer = 2.5; }
      obj.preFX.addGlow(color, outer, inner, false, 0.1, 8);
    } catch (e) { /* Canvas fallback: no FX */ }
  }

  applyHitFlashFX(obj, color) {
    if (!obj || !obj.preFX) return;
    try {
      const glow = obj.preFX.addGlow(color || 0xffffff, 6, 1, false, 0.15, 10);
      this.time.delayedCall(80, () => {
        if (obj.active && obj.preFX) {
          try { obj.preFX.clear(); } catch (e) {}
        }
      });
    } catch (e) {}
  }

  applyPlayerHurtFX() {
    if (!this.player || !this.player.postFX) return;
    try {
      this.player.postFX.clear();
      this.player.postFX.addGlow(0xff0000, 4, 0, false, 0.2, 8);
      this.time.delayedCall(150, () => {
        if (this.player && this.player.postFX) {
          try { this.player.postFX.clear(); } catch (e) {}
        }
      });
    } catch (e) {}
  }

  attachTrail(bullet, vfx, tint) {
    // Trail riêng theo từng loại vũ khí thay vì 1 kiểu vòng tròn chung chung cho tất cả.
    bullet.trailEvent = this.time.addEvent({
      delay: vfx === 'lightning' ? 55 : 40,
      loop: true,
      callback: () => {
        if (!bullet.active) {
          if (bullet.trailEvent) bullet.trailEvent.remove(false);
          return;
        }
        const col = tint || 0xffffff;

        if (vfx === 'fire') {
          // Tàn lửa nhỏ bay lệch hướng và trôi nhẹ lên trên như tro tàn
          const ember = this.add.circle(bullet.x + Phaser.Math.Between(-3, 3), bullet.y + Phaser.Math.Between(-3, 3),
            Phaser.Math.Between(2, 5), Phaser.Math.RND.pick([0xff6622, 0xffaa33, 0xffdd66]), 0.85)
            .setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: ember, y: ember.y - 10, alpha: 0, scale: 0.2, duration: 320, onComplete: () => ember.destroy() });

        } else if (vfx === 'ice') {
          // Mảnh băng nhỏ xoay tròn, để lại vệt lạnh lẽo
          const shard = this.add.rectangle(bullet.x, bullet.y, 5, 5, 0x9be8ff, 0.8).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
          shard.setRotation(Math.random() * Math.PI);
          this.tweens.add({ targets: shard, alpha: 0, angle: '+=90', scale: 0.3, duration: 260, onComplete: () => shard.destroy() });

        } else if (vfx === 'lightning') {
          // Tia chớp nhỏ giật lệch ngẫu nhiên hai bên đường bay, sáng chói và biến mất nhanh
          const off = Phaser.Math.Between(-6, 6);
          const angle = bullet.rotation + Math.PI / 2;
          const zap = this.add.rectangle(
            bullet.x + Math.cos(angle) * off, bullet.y + Math.sin(angle) * off,
            10, 2, 0xffee66, 0.95
          ).setDepth(5).setRotation(bullet.rotation).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: zap, alpha: 0, duration: 140, onComplete: () => zap.destroy() });

        } else if (vfx === 'orb') {
          // Vệt cầu năng lượng mềm, to và mờ dần chậm, sáng cộng dồn (additive)
          const glow = this.add.circle(bullet.x, bullet.y, 7, col, 0.5).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: glow, alpha: 0, scale: 1.6, duration: 380, onComplete: () => glow.destroy() });

        } else if (vfx === 'arrow' || vfx === 'pierce') {
          // Vệt streak kéo dài theo hướng bay, giống luồng gió của mũi tên thay vì đốm tròn
          const streak = this.add.rectangle(bullet.x, bullet.y, 14, 2, col, 0.5)
            .setDepth(5).setRotation(bullet.rotation);
          this.tweens.add({ targets: streak, alpha: 0, scaleX: 0.3, duration: 180, onComplete: () => streak.destroy() });

        } else {
          // Mặc định: vòng tròn mờ dần như cũ, dùng cho đạn thường/plasma...
          const p = this.add.circle(bullet.x, bullet.y, 3, col, 0.55).setDepth(5);
          this.tweens.add({ targets: p, alpha: 0, scale: 0.2, duration: 200, onComplete: () => p.destroy() });
        }
      }
    });
  }

  fireMelee(data, dmgMul) {
    const range = (data.range || 70) * this.stats.area;
    let hit = false;
    const vfx = data.vfx || 'slash';
    const isBlood = data.id && data.id.includes('blood') || data.id === 'crimson_reaper';
    const isWave = vfx === 'wave' || (data.id && (data.id.includes('shock') || data.id.includes('quake') || data.id === 'excalibur'));

    // Sóng xung kích vẫn nổ 360° quanh người (đúng chất "shockwave"),
    // các vũ khí kiếm còn lại chém theo 1 cung hướng thật (không còn trúng quái phía sau lưng).
    const aimAngle = isWave ? 0 : this.getAimAngle(Math.max(500, range * 4));
    const halfSweep = Phaser.Math.DegToRad(58); // tổng cung chém ~116°

    this.enemies.getChildren().forEach(enemy => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist >= range) return;
      if (!isWave) {
        const angToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
        const diff = Math.abs(Phaser.Math.Angle.Wrap(angToEnemy - aimAngle));
        if (diff > halfSweep) return;
      }
      this.damageEnemy(enemy, (data.damage || 20) * dmgMul, data.lifesteal || this.stats.lifesteal);
      hit = true;
      // impact spark trên quái
      this.spawnHitSpark(enemy.x, enemy.y, isBlood ? 0xff2244 : 0xffeeaa);
    });

    if (isWave) {
      // Sóng xung kích lan ra
      const ring = this.add.circle(this.player.x, this.player.y, 20, 0xffcc44, 0.35).setDepth(4);
      ring.setStrokeStyle(3, 0xffee88, 0.8);
      this.tweens.add({
        targets: ring,
        scale: range / 20,
        alpha: 0,
        duration: 350,
        ease: 'Cubic.Out',
        onComplete: () => ring.destroy()
      });
      // second ring
      const ring2 = this.add.circle(this.player.x, this.player.y, 10, 0xffffff, 0.25).setDepth(4);
      this.tweens.add({
        targets: ring2, scale: range / 12, alpha: 0, duration: 280,
        onComplete: () => ring2.destroy()
      });
    } else {
      this.spawnSwordSwing(aimAngle, halfSweep, range, isBlood);
      // Quay nhân vật theo hướng vung kiếm để không bị "chém ngược mặt"
      if (Math.cos(aimAngle) < -0.15) this.player.setFlipX(true);
      else if (Math.cos(aimAngle) > 0.15) this.player.setFlipX(false);
    }

    this.sfxSwordSwing();
    if (hit) this.sfxSwordHit();
  }

  // Hiệu ứng vung kiếm thật: 1 lưỡi kiếm (sprite riêng) xoay quanh player từ mép này
  // sang mép kia của cung chém, kèm vệt sáng (arc trail) đi theo lưỡi kiếm.
  spawnSwordSwing(aimAngle, halfSweep, range, isBlood) {
    const startAngle = aimAngle - halfSweep;
    const endAngle = aimAngle + halfSweep;
    const bladeLen = Math.max(34, range * 1.05);
    const tint = isBlood ? 0xff3355 : this.classData.color;

    // Lưỡi kiếm thật, pivot đặt gần chuôi (origin.x nhỏ) để xoay như tay đang vung kiếm
    const blade = this.add.image(this.player.x, this.player.y, 'sword_blade')
      .setOrigin(0.08, 0.5)
      .setDepth(11)
      .setDisplaySize(bladeLen, bladeLen * 0.22)
      .setRotation(startAngle)
      .setTint(tint)
      .setAlpha(0.95);

    // Vệt cung sáng theo sau lưỡi kiếm khi vung
    const trailGfx = this.add.graphics().setDepth(10);

    this.tweens.add({
      targets: blade,
      rotation: endAngle,
      duration: 150,
      ease: 'Cubic.Out',
      onUpdate: () => {
        blade.setPosition(this.player.x, this.player.y);
        trailGfx.clear();
        trailGfx.lineStyle(Math.max(6, range * 0.24), tint, 0.3);
        trailGfx.beginPath();
        trailGfx.arc(this.player.x, this.player.y, range * 0.6, startAngle, blade.rotation, false);
        trailGfx.strokePath();
      },
      onComplete: () => {
        this.tweens.add({
          targets: blade, alpha: 0, duration: 100,
          onComplete: () => blade.destroy()
        });
        this.tweens.add({
          targets: trailGfx, alpha: 0, duration: 140,
          onComplete: () => trailGfx.destroy()
        });
      }
    });

    this.hitParticles.emitParticleAt(
      this.player.x + Math.cos(aimAngle) * range * 0.5,
      this.player.y + Math.sin(aimAngle) * range * 0.5,
      isBlood ? 6 : 3
    );
  }

  spawnHitSpark(x, y, color) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 50;
      const d = this.add.circle(x, y, 2 + Math.random() * 2, color || 0xffffff, 0.9).setDepth(8);
      this.tweens.add({
        targets: d,
        x: x + Math.cos(a) * sp,
        y: y + Math.sin(a) * sp,
        alpha: 0,
        scale: 0.2,
        duration: 250 + Math.random() * 100,
        onComplete: () => d.destroy()
      });
    }
  }

  fireAura(data, dmgMul) {
    const range = (data.range || 100) * this.stats.area;
    const vfx = data.vfx || 'aura';
    const isIce = vfx === 'ice' || (data.id && (data.id.includes('frost') || data.id.includes('glacier') || data.id.includes('ice')));
    const col = isIce ? 0x88ddff : (vfx === 'fire' ? 0xff6622 : this.classData.color);

    this.enemies.getChildren().forEach(enemy => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist < range) {
        this.damageEnemy(enemy, (data.damage || 8) * dmgMul * 0.35);
      }
    });

    // Pulse ring
    const ring = this.add.circle(this.player.x, this.player.y, range * 0.4, col, 0.12).setDepth(3);
    ring.setStrokeStyle(2, col, 0.5);
    this.tweens.add({
      targets: ring, scale: range / (range * 0.4), alpha: 0, duration: 320,
      onComplete: () => ring.destroy()
    });

    // Particles quanh aura
    if (Math.random() < 0.4) {
      for (let i = 0; i < 5; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = range * (0.5 + Math.random() * 0.5);
        const px = this.player.x + Math.cos(ang) * r;
        const py = this.player.y + Math.sin(ang) * r;
        const p = this.add.circle(px, py, 2 + Math.random() * 2, col, 0.7).setDepth(4);
        this.tweens.add({
          targets: p, y: py - 15, alpha: 0, duration: 400,
          onComplete: () => p.destroy()
        });
      }
    }

    // Frost nova big burst
    if (data.id && (data.id.includes('frost') || data.id.includes('glacier')) && data.cooldown > 1000) {
      const burst = this.add.circle(this.player.x, this.player.y, 30, 0xaaddff, 0.4).setDepth(4);
      this.tweens.add({
        targets: burst, scale: range / 30, alpha: 0, duration: 400,
        onComplete: () => burst.destroy()
      });
    }
  }

  // ========== ENGINEER SYSTEMS ==========
  placeTurret(data, dmgMul) {
    const maxT = data.maxTurrets || this.maxTurrets || 2;
    while (this.turrets.getLength() >= maxT) {
      const oldest = this.turrets.getChildren()[0];
      if (oldest) oldest.destroy();
      else break;
    }

    // Đặt trụ gần player (hơi lệch hướng di chuyển)
    const ox = Phaser.Math.Between(-60, 60);
    const oy = Phaser.Math.Between(-60, 60);
    const t = this.turrets.create(this.player.x + ox, this.player.y + oy, 'icon_turret_kit');
    t.setDisplaySize(40, 40);
    t.setDepth(8);
    t.hp = 100;
    t.damage = (data.damage || 20) * dmgMul;
    t.cooldown = 0;
    t.fireRate = 400;
    t.isTesla = false;
    t.body.setImmovable(true);
    this.applyGlowFX(t, 'orb', 0x66aaff);

    // Hiệu ứng đặt trụ
    this.hitParticles.emitParticleAt(t.x, t.y, 8);
    const beam = this.add.rectangle(t.x, t.y - 40, 6, 80, 0x66aaff, 0.6).setDepth(9);
    this.tweens.add({
      targets: beam, alpha: 0, scaleY: 0.2, y: t.y, duration: 300,
      onComplete: () => beam.destroy()
    });
    const ring = this.add.circle(t.x, t.y, 8, 0x66aaff, 0.5).setDepth(8);
    this.tweens.add({
      targets: ring, scale: 3, alpha: 0, duration: 350,
      onComplete: () => ring.destroy()
    });
    this.showFloatingText(t.x, t.y - 20, 'TURRET', '#66aaff');
  }

  placeTesla(data, dmgMul) {
    const maxT = data.maxTurrets || 2;
    while (this.turrets.getLength() >= maxT + 2) {
      const oldest = this.turrets.getChildren()[0];
      if (oldest) oldest.destroy();
      else break;
    }
    const t = this.turrets.create(
      this.player.x + Phaser.Math.Between(-70, 70),
      this.player.y + Phaser.Math.Between(-70, 70),
      'icon_tesla_coil'
    );
    t.setDisplaySize(38, 38);
    t.setDepth(8);
    t.hp = 70;
    t.damage = (data.damage || 15) * dmgMul;
    t.cooldown = 0;
    t.fireRate = 700;
    t.isTesla = true;
    t.body.setImmovable(true);
    this.showFloatingText(t.x, t.y - 20, 'TESLA', '#ffee44');
  }

  placeRepairBot(data, dmgMul) {
    // Đặt 1 trụ nhỏ + hồi máu player
    this.placeTurret({ damage: (data.damage || 8), maxTurrets: data.maxTurrets || 1 }, dmgMul * 0.7);
    const heal = 8 + this.level;
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + heal);
    this.showFloatingText(this.player.x, this.player.y - 30, '+' + heal + ' HP', '#66ff99');
  }

  updateTurrets(delta) {
    this.turrets.getChildren().forEach(t => {
      if (!t.active) return;
      t.cooldown -= delta;
      if (t.cooldown > 0) return;

      if (t.isTesla) {
        // Tesla: sát thương chain gần trụ
        const targets = [];
        this.enemies.getChildren().forEach(e => {
          if (!e.active) return;
          const d = Phaser.Math.Distance.Between(t.x, t.y, e.x, e.y);
          if (d < 200) targets.push(e);
        });
        targets.sort((a, b) =>
          Phaser.Math.Distance.Between(t.x, t.y, a.x, a.y) -
          Phaser.Math.Distance.Between(t.x, t.y, b.x, b.y)
        );
        let fromX = t.x, fromY = t.y;
        targets.slice(0, 4).forEach(e => {
          this.damageEnemy(e, t.damage);
          const line = this.add.line(0, 0, fromX, fromY, e.x, e.y, 0xffee44, 0.75).setDepth(7);
          line.setLineWidth(2);
          this.tweens.add({ targets: line, alpha: 0, duration: 180, onComplete: () => line.destroy() });
          fromX = e.x; fromY = e.y;
        });
        t.cooldown = t.fireRate || 700;
      } else {
        const nearest = this.findNearestEnemyFrom(t.x, t.y, 500);
        if (nearest) {
          const angle = Phaser.Math.Angle.Between(t.x, t.y, nearest.x, nearest.y);
          const bullet = this.projectiles.create(t.x, t.y, 'bullet');
          bullet.setScale(0.75);
          bullet.setTint(0x66aaff);
          bullet.damage = t.damage;
          bullet.pierce = 0;
          bullet.hitList = new Set();
          this.physics.velocityFromRotation(angle, 450, bullet.body.velocity);
          this.time.delayedCall(1800, () => { if (bullet.active) bullet.destroy(); });
          t.cooldown = t.fireRate || 400;
        }
      }
    });
  }

  spawnDrone(data, dmgMul) {
    const maxDrones = (data.id === 'assault_drone_swarm' || (data.description || '').includes('6')) ? 6 : 4;
    if (this.drones.getLength() >= maxDrones) return;

    const d = this.drones.create(this.player.x, this.player.y, 'icon_drone');
    d.setDisplaySize(28, 28);
    d.setDepth(9);
    d.damage = (data.damage || 12) * dmgMul;
    d.angleOffset = this.drones.getLength() * (Math.PI * 2 / maxDrones);
    d.cooldown = 0;
    this.showFloatingText(this.player.x, this.player.y - 25, 'DRONE', '#88ccff');
  }

  updateDrones(delta) {
    this.droneAngle += delta * 0.003;
    const radius = 70;

    this.drones.getChildren().forEach((d, i) => {
      if (!d.active) return;
      const ang = this.droneAngle + (d.angleOffset || i);
      d.x = this.player.x + Math.cos(ang) * radius;
      d.y = this.player.y + Math.sin(ang) * radius;

      d.cooldown -= delta;
      if (d.cooldown <= 0) {
        const nearest = this.findNearestEnemyFrom(d.x, d.y, 350);
        if (nearest) {
          const angle = Phaser.Math.Angle.Between(d.x, d.y, nearest.x, nearest.y);
          const bullet = this.projectiles.create(d.x, d.y, 'bullet');
          bullet.setScale(0.55);
          bullet.setTint(0xaaddff);
          bullet.damage = d.damage;
          bullet.pierce = 0;
          bullet.hitList = new Set();
          this.physics.velocityFromRotation(angle, 380, bullet.body.velocity);
          this.time.delayedCall(1500, () => { if (bullet.active) bullet.destroy(); });
          d.cooldown = 500;
        }
      }
    });
  }

  placeMine(data, dmgMul) {
    if (this.mines.getLength() >= 6) {
      const oldest = this.mines.getChildren()[0];
      if (oldest) oldest.destroy();
    }

    const m = this.mines.create(this.player.x, this.player.y, 'icon_mine_layer');
    m.setDisplaySize(28, 28);
    m.setDepth(4);
    m.damage = (data.damage || 40) * dmgMul;
    m.body.setImmovable(true);
  }

  onMineHitEnemy(mine, enemy) {
    if (!mine.active || !enemy.active) return;
    this.damageEnemy(enemy, mine.damage);
    // AoE
    this.enemies.getChildren().forEach(e => {
      if (!e.active || e === enemy) return;
      if (Phaser.Math.Distance.Between(mine.x, mine.y, e.x, e.y) < 90) {
        this.damageEnemy(e, mine.damage * 0.6);
      }
    });
    this.hitParticles.emitParticleAt(mine.x, mine.y, 12);
    this.cameras.main.shake(60, 0.006);
    mine.destroy();
  }

  // ========== ENEMIES ==========
  spawnEnemies(delta) {
    this.enemySpawnTimer += delta;
    const difficulty = (1 + this.difficultyTimer / 55000) * this.diffMul;
    const interval = Math.max(280, this.enemySpawnInterval / difficulty);

    if (this.enemySpawnTimer >= interval) {
      this.enemySpawnTimer = 0;
      const count = Math.min(10, 1 + Math.floor(this.difficultyTimer / 18000));
      for (let i = 0; i < count; i++) this.spawnOneEnemy(difficulty);
    }

    // Boss every 90s
    if (!this.lastBossAt) this.lastBossAt = 0;
    if (this.timeAlive - this.lastBossAt > 90000) {
      this.lastBossAt = this.timeAlive;
      this.spawnBoss(difficulty);
    }
  }

  // Vị trí spawn quanh viền camera (ngoài tầm nhìn), dùng chung cho quái thường + minion boss triệu hồi
  getSpawnPointAroundCamera(margin) {
    const cam = this.cameras.main;
    margin = margin || 90;
    let x, y;
    const side = Phaser.Math.Between(0, 3);
    if (side === 0) {
      x = Phaser.Math.Between(cam.scrollX - margin, cam.scrollX + cam.width + margin);
      y = cam.scrollY - margin;
    } else if (side === 1) {
      x = Phaser.Math.Between(cam.scrollX - margin, cam.scrollX + cam.width + margin);
      y = cam.scrollY + cam.height + margin;
    } else if (side === 2) {
      x = cam.scrollX - margin;
      y = Phaser.Math.Between(cam.scrollY - margin, cam.scrollY + cam.height + margin);
    } else {
      x = cam.scrollX + cam.width + margin;
      y = Phaser.Math.Between(cam.scrollY - margin, cam.scrollY + cam.height + margin);
    }
    x = Phaser.Math.Clamp(x, 30, this.worldSize - 30);
    y = Phaser.Math.Clamp(y, 30, this.worldSize - 30);
    return { x, y };
  }

  spawnOneEnemy(difficulty) {
    const pool = getEnemyPoolForTime(Math.floor(this.timeAlive / 1000));

    // Giới hạn quái bắn xa để màn chơi đỡ bị dồn đạn.
    // Tối đa 2 ranged enemy cùng lúc; nếu đủ thì chỉ chọn quái cận chiến.
    const rangedCount = this.enemies.getChildren().filter(e => e.active && e.isRanged).length;
    let availablePool = pool;
    if (rangedCount >= 2) {
      // Giữ NGUYÊN tổng số quái: chỉ thay slot ranged bằng quái thường/cận chiến.
      const nonRangedPool = pool.filter(key => !ENEMY_TYPES[key].ranged);
      if (nonRangedPool.length) {
        availablePool = nonRangedPool;
      } else {
        availablePool = ['grunt'];
      }
    }

    const typeKey = Phaser.Utils.Array.GetRandom(availablePool);
    this.spawnEnemyOfType(typeKey, difficulty);
  }

  spawnEnemyOfType(typeKey, difficulty, forcedPos) {
    const def = ENEMY_TYPES[typeKey] || ENEMY_TYPES.grunt;
    const pos = forcedPos || this.getSpawnPointAroundCamera(90);

    const enemy = this.enemies.create(pos.x, pos.y, def.texture);
    enemy.setDepth(5);
    enemy.enemyType = typeKey;
    enemy.hp = 18 * difficulty * def.hpMul;
    enemy.maxHp = enemy.hp;
    enemy.speed = (55 + difficulty * 12) * def.spdMul;
    enemy.damage = (7 + difficulty * 1.8) * def.dmgMul;
    enemy.body.setCircle(def.radius);
    // (grunt texture giờ đã có màu/shading đầy đủ sẵn, không cần tint đè nữa)
    if (def.ranged) {
      enemy.isRanged = true;
      enemy.atkRange = def.atkRange;
      enemy.shotCooldown = def.shotCooldown;
      enemy.boltSpeed = def.boltSpeed;
      enemy.lastShotAt = 0;
    }
    return enemy;
  }

  spawnBoss(difficulty) {
    // Xoay vòng qua 3 loại boss thay vì lặp lại 1 loại
    if (this.bossSpawnIndex === undefined) this.bossSpawnIndex = 0;
    const bossKeys = Object.keys(BOSS_TYPES);
    const bt = BOSS_TYPES[bossKeys[this.bossSpawnIndex % bossKeys.length]];
    this.bossSpawnIndex++;

    const cam = this.cameras.main;
    const x = cam.scrollX + cam.width + 100;
    const y = cam.scrollY + cam.height / 2;

    const boss = this.enemies.create(x, y, bt.texture);
    boss.setScale(bt.scale);
    boss.setDepth(6);
    boss.hp = 350 * difficulty * bt.hpMul;
    boss.maxHp = boss.hp;
    boss.speed = 45 * bt.spdMul;
    boss.baseSpeed = boss.speed;
    boss.damage = (18 + difficulty * 3) * bt.dmgMul;
    boss.isBoss = true;
    boss.bossType = bt;
    boss.bossDifficulty = difficulty;
    boss.abilityTimer = bt.abilityCooldown * 0.5; // boss dùng skill sớm hơn lần spawn kế
    boss.body.setCircle(14 * bt.scale);
    this.sfxBossSpawn();

    this.showFloatingText(this.player.x, this.player.y - 60, bt.intro, '#ff44aa');
  }

  updateEnemies(delta) {
    this.enemies.getChildren().forEach(enemy => {
      if (!enemy.active) return;

      if (enemy.isBoss) { this.updateBossBehavior(enemy, delta); return; }

      if (enemy.isRanged) {
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        if (dist > enemy.atkRange * 0.8) {
          // Tiến lại gần nếu còn ngoài tầm bắn
          this.physics.velocityFromRotation(angle, enemy.speed, enemy.body.velocity);
        } else {
          // Trong tầm: đứng lại và bắn
          enemy.setVelocity(0, 0);
          enemy.lastShotAt = (enemy.lastShotAt || 0) - delta;
          if (enemy.lastShotAt <= 0 && dist <= enemy.atkRange) {
            enemy.lastShotAt = enemy.shotCooldown;
            this.fireEnemyBolt(enemy, angle);
          }
        }
        return;
      }

      // Quái thường / dashing boss (khi không đang dash) đi thẳng vào người chơi
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      this.physics.velocityFromRotation(angle, enemy.speed, enemy.body.velocity);
    });
  }

  fireEnemyBolt(enemy, angle) {
    const bolt = this.enemyProjectiles.create(enemy.x, enemy.y, 'enemy_bolt');
    bolt.setDepth(5);
    bolt.damage = enemy.damage;
    this.physics.velocityFromRotation(angle, enemy.boltSpeed || 220, bolt.body.velocity);
    this.time.delayedCall(2500, () => { if (bolt.active) bolt.destroy(); });
  }

  onEnemyProjectileHitPlayer(player, bolt) {
    if (!bolt.active || this.isGameOver) return;
    bolt.destroy();
    const dmg = bolt.damage * (1 - this.stats.armor);
    this.stats.hp -= dmg;
    this.cameras.main.shake(80, 0.01);
    this.spawnScreenFlash(0x88ddff, 0.12, 90);
    this.hitStop(60, 0.25);
    this.sfxHurt();
    this.player.setTint(0x44ffee);
    this.applyPlayerHurtFX();
    this.setPlayerState('hit');
    this.time.delayedCall(140, () => {
      if (this.player.active && this.player) this.player.clearTint();
      if (this.playerState === 'hit') this.setPlayerState(this.isMoving ? 'run' : 'idle');
    });
    if (this.stats.hp <= 0) { this.stats.hp = 0; this.gameOver(); }
  }

  // Kỹ năng riêng của từng loại boss, gọi mỗi frame từ updateEnemies()
  updateBossBehavior(boss, delta) {
    const bt = boss.bossType;
    const angleToPlayer = Phaser.Math.Angle.Between(boss.x, boss.y, this.player.x, this.player.y);

    // Đang trong pha dash: giữ nguyên vector đã set, không tính lại hướng
    if (boss.dashingUntil && this.time.now < boss.dashingUntil) {
      return;
    } else if (boss.dashingUntil) {
      boss.dashingUntil = null;
      boss.setVelocity(0, 0);
      boss.speed = boss.baseSpeed;
    }

    this.physics.velocityFromRotation(angleToPlayer, boss.speed, boss.body.velocity);

    boss.abilityTimer = (boss.abilityTimer || 0) - delta;
    if (boss.abilityTimer > 0) return;
    boss.abilityTimer = bt.abilityCooldown;

    if (bt.ability === 'dash') {
      // Blood Reaper: lao thẳng cực nhanh về hướng người chơi hiện tại
      this.cameras.main.shake(120, 0.008);
      this.showFloatingText(boss.x, boss.y - 40, 'LAO TỚI!', '#ff4444');
      this.physics.velocityFromRotation(angleToPlayer, boss.baseSpeed * bt.dashSpeedMul, boss.body.velocity);
      boss.dashingUntil = this.time.now + bt.dashDuration;
    } else if (bt.ability === 'summon') {
      // Void Colossus: triệu hồi thêm quái nhỏ quanh nó
      this.showFloatingText(boss.x, boss.y - 50, 'TRIỆU HỒI!', '#b967ff');
      for (let i = 0; i < bt.summonCount; i++) {
        const a = (Math.PI * 2 / bt.summonCount) * i;
        const px = Phaser.Math.Clamp(boss.x + Math.cos(a) * 60, 30, this.worldSize - 30);
        const py = Phaser.Math.Clamp(boss.y + Math.sin(a) * 60, 30, this.worldSize - 30);
        this.spawnEnemyOfType(Phaser.Math.Between(0, 1) ? 'swarm' : 'fast', boss.bossDifficulty * 0.7, { x: px, y: py });
      }
    } else if (bt.ability === 'barrage') {
      // Storm Dragon: bắn loạt đạn toả tròn
      this.showFloatingText(boss.x, boss.y - 50, 'BẮN LOẠT!', '#4deeea');
      for (let i = 0; i < bt.barrageCount; i++) {
        const a = (Math.PI * 2 / bt.barrageCount) * i;
        const bolt = this.enemyProjectiles.create(boss.x, boss.y, 'enemy_bolt');
        bolt.setDepth(5); bolt.setScale(1.3);
        bolt.damage = boss.damage * 0.6;
        this.physics.velocityFromRotation(a, 260, bolt.body.velocity);
        this.time.delayedCall(2500, () => { if (bolt.active) bolt.destroy(); });
      }
    }
  }

  findNearestEnemy(maxDist) {
    return this.findNearestEnemyFrom(this.player.x, this.player.y, maxDist);
  }

  findNearestEnemyFrom(x, y, maxDist) {
    let nearest = null;
    let minD = maxDist;
    this.enemies.getChildren().forEach(e => {
      if (!e.active) return;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < minD) { minD = d; nearest = e; }
    });
    return nearest;
  }

  // ========== COMBAT ==========
  onProjectileHitEnemy(projectile, enemy) {
    if (!projectile.active || !enemy.active) return;
    if (projectile.hitList && projectile.hitList.has(enemy)) return;
    if (projectile.hitList) projectile.hitList.add(enemy);

    this.damageEnemy(enemy, projectile.damage);
    this.spawnHitSpark(enemy.x, enemy.y, this.getVfxImpactColor(projectile.vfxType));

    // Explosion VFX
    if (projectile.explosionRadius > 0) {
      this.enemies.getChildren().forEach(e => {
        if (!e.active || e === enemy) return;
        if (Phaser.Math.Distance.Between(enemy.x, enemy.y, e.x, e.y) < projectile.explosionRadius) {
          this.damageEnemy(e, projectile.damage * 0.55);
        }
      });
      this.spawnExplosion(enemy.x, enemy.y, projectile.explosionRadius, projectile.vfxType);
      this.sfxExplosion();
    }

    // Chain lightning VFX
    if (projectile.chain > 0) {
      let from = enemy;
      let remaining = projectile.chain;
      const hit = new Set([enemy]);
      while (remaining > 0) {
        let next = null;
        let minD = 240;
        this.enemies.getChildren().forEach(e => {
          if (!e.active || hit.has(e)) return;
          const d = Phaser.Math.Distance.Between(from.x, from.y, e.x, e.y);
          if (d < minD) { minD = d; next = e; }
        });
        if (!next) break;
        hit.add(next);
        this.damageEnemy(next, projectile.damage * 0.7);
        // Lightning bolt visual
        const col = 0xffee44;
        const line = this.add.line(0, 0, from.x, from.y, next.x, next.y, col, 0.9).setDepth(7);
        line.setLineWidth(3);
        const line2 = this.add.line(0, 0, from.x + 2, from.y, next.x + 2, next.y, 0xffffff, 0.5).setDepth(7);
        line2.setLineWidth(1);
        this.tweens.add({ targets: [line, line2], alpha: 0, duration: 220, onComplete: () => { line.destroy(); line2.destroy(); } });
        this.spawnHitSpark(next.x, next.y, 0xffee44);
        from = next;
        remaining--;
      }
    }

    // Pierce: flash on pass-through
    if (projectile.pierce !== undefined) {
      if (projectile.pierce > 0) {
        const flash = this.add.circle(enemy.x, enemy.y, 12, 0xffffff, 0.4).setDepth(7);
        this.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 100, onComplete: () => flash.destroy() });
      }
      projectile.pierce--;
      if (projectile.pierce < 0) {
        if (projectile.trailEvent) projectile.trailEvent.remove(false);
        projectile.destroy();
      }
    } else {
      if (projectile.trailEvent) projectile.trailEvent.remove(false);
      projectile.destroy();
    }
  }

  getVfxImpactColor(vfx) {
    if (vfx === 'fire') return 0xff6622;
    if (vfx === 'ice') return 0x88ddff;
    if (vfx === 'lightning') return 0xffee44;
    if (vfx === 'orb') return 0xb388ff;
    if (vfx === 'explode') return 0xff8844;
    if (vfx === 'pierce') return 0xaaffcc;
    return 0xffeeaa;
  }

  spawnExplosion(x, y, radius, vfx) {
    const isFire = vfx === 'fire' || vfx === 'explode';
    const col = isFire ? 0xff6622 : 0xffaa44;
    const col2 = isFire ? 0xffee44 : 0xffffff;

    // Shader glow core
    const glowCore = this.add.circle(x, y, 12, col2, 0.9).setDepth(8);
    this.applyGlowFX(glowCore, vfx === 'fire' ? 'fire' : 'explode', col);
    this.tweens.add({
      targets: glowCore, scale: Math.max(2.5, radius / 20), alpha: 0, duration: 280,
      onComplete: () => glowCore.destroy()
    });

    const ring = this.add.circle(x, y, 15, col, 0.5).setDepth(7);
    ring.setStrokeStyle(3, col2, 0.9);
    this.tweens.add({
      targets: ring,
      scale: Math.max(2, radius / 15),
      alpha: 0,
      duration: 350,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy()
    });

    const core = this.add.circle(x, y, 10, 0xffffff, 0.8).setDepth(8);
    this.tweens.add({
      targets: core, scale: 2.5, alpha: 0, duration: 200,
      onComplete: () => core.destroy()
    });

    this.hitParticles.emitParticleAt(x, y, 14);
    this.cameras.main.shake(40, 0.004);

    // Debris sparks
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const sp = radius * 0.4;
      const d = this.add.circle(x, y, 3, col, 0.9).setDepth(8);
      this.tweens.add({
        targets: d,
        x: x + Math.cos(a) * sp,
        y: y + Math.sin(a) * sp,
        alpha: 0,
        duration: 300,
        onComplete: () => d.destroy()
      });
    }
  }

  damageEnemy(enemy, damage, lifesteal = 0) {
    let finalDmg = damage;
    const isCrit = Math.random() < this.stats.crit;
    if (isCrit) finalDmg *= 2;

    enemy.hp -= finalDmg;
    this.hitParticles.emitParticleAt(enemy.x, enemy.y, isCrit ? 7 : 3);
    this.sfxHit();
    if (isCrit) this.cameras.main.shake(45, 0.003); // rung nhẹ camera khi chí mạng, tạo cảm giác nặng tay

    // Floating damage
    this.showFloatingText(enemy.x, enemy.y - 15, Math.floor(finalDmg) + (isCrit ? '!' : ''), isCrit ? '#ffee44' : '#ffffff');

    // Lifesteal
    if (lifesteal > 0) {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + finalDmg * lifesteal);
    }

    enemy.setTint(0xffffff);
    this.applyHitFlashFX(enemy, 0xffffff);
    this.time.delayedCall(50, () => {
      if (enemy.active) enemy.clearTint();
    });

    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    this.kills++;
    this.registerKillStreak();
    if (enemy.isBoss) this.bossKills++;
    const gem = this.gems.create(enemy.x, enemy.y, 'gem');
    gem.setDepth(3);

    // EXP nhân theo % thời gian sống (giữ chênh lệch giá trị giữa các loại quái/boss ở late-game,
    // thay vì cộng cứng như trước làm quái yếu và quái mạnh gần như cho cùng 1 lượng EXP).
    const timeScale = 1 + this.difficultyTimer / ENEMY_XP_TIME_SCALE_MS;
    const baseXp = enemy.isBoss ? BOSS_XP_BASE : (ENEMY_TYPES[enemy.enemyType] ? ENEMY_TYPES[enemy.enemyType].xp : 1);
    gem.xpValue = Math.max(1, Math.round(baseXp * timeScale));

    this.xpParticles.emitParticleAt(enemy.x, enemy.y, 5);

    if (enemy.isBoss) {
      // Boss chết luôn rớt Rương skill để roll passive
      this.spawnChest(enemy.x, enemy.y);
    } else if (Math.random() < MAGNET_DROP_CHANCE) {
      // Quái thường có tỉ lệ rớt Nam Châm — nhặt sẽ hút hết EXP chưa lụm trên bản đồ
      this.spawnMagnet(enemy.x, enemy.y);
    }

    enemy.destroy();
  }

  onCollectGem(player, gem) {
    if (!gem.active) return;
    this.xp += gem.xpValue * this.stats.xpGain;
    this.sfxPickup();
    gem.destroy();
    if (this.xp >= this.xpToNext) this.levelUp();
  }

  attractGems() {
    this.gems.getChildren().forEach(gem => {
      if (!gem.active || gem.isMagnetized) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, gem.x, gem.y);
      if (dist < this.stats.pickupRange) {
        const angle = Phaser.Math.Angle.Between(gem.x, gem.y, this.player.x, this.player.y);
        this.physics.velocityFromRotation(angle, 280, gem.body.velocity);
      } else {
        gem.setVelocity(0, 0);
      }
    });
  }

  // ========== NAM CHÂM (Magnet) — hút hết toàn bộ EXP chưa lụm trên bản đồ ==========
  spawnMagnet(x, y) {
    const magnet = this.magnets.create(x, y, 'magnet');
    magnet.setDepth(3);
  }

  onCollectMagnet(player, magnet) {
    if (!magnet.active) return;
    magnet.destroy();
    this.sfxPickup();
    this.showFloatingText(this.player.x, this.player.y - 40, 'NAM CHÂM!', '#ff6666');

    // Hút TOÀN BỘ exp đang tồn tại trên map (kể cả rớt từ trước), cho bay vào người rồi mới cộng điểm
    this.gems.getChildren().forEach((gem, i) => {
      if (!gem.active || gem.isMagnetized) return;
      gem.isMagnetized = true;
      if (gem.body) gem.body.enable = false;
      // bay tới người với độ trễ nhỏ tăng dần, tạo hiệu ứng dòng exp đổ về
      gem.magnetDelay = i * 20;
      gem.magnetSpeed = 900 + Math.random() * 300;
      this.magnetizedGems.push(gem);
    });
  }

  // Di chuyển các gem đã bị Nam Châm hút, cho chúng bay lượn vào người rồi cộng EXP
  updateMagnetizedGems(delta) {
    if (this.magnetizedGems.length === 0) return;
    const dt = delta / 1000;
    this.magnetizedGems = this.magnetizedGems.filter(gem => {
      if (!gem.active) return false;

      if (gem.magnetDelay > 0) {
        gem.magnetDelay -= delta;
        return true;
      }

      const dist = Phaser.Math.Distance.Between(gem.x, gem.y, this.player.x, this.player.y);
      if (dist < 14) {
        this.xpParticles.emitParticleAt(gem.x, gem.y, 4);
        this.xp += gem.xpValue * this.stats.xpGain;
        gem.destroy();
        if (this.xp >= this.xpToNext) this.levelUp();
        return false;
      }

      const angle = Phaser.Math.Angle.Between(gem.x, gem.y, this.player.x, this.player.y);
      const speed = gem.magnetSpeed * (1 + (1 - Math.min(dist, 600) / 600)); // càng gần càng lao nhanh
      gem.x += Math.cos(angle) * speed * dt;
      gem.y += Math.sin(angle) * speed * dt;
      gem.setScale(Math.max(0.4, gem.scale - dt * 0.6));
      return true;
    });
  }

  // ========== RƯƠNG (Chest) — rớt khi hạ boss, nhặt để roll 1 passive ngẫu nhiên ==========
  spawnChest(x, y) {
    const chest = this.chests.create(x, y, 'chest');
    chest.setDepth(3);
    this.tweens.add({
      targets: chest, y: y - 6, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut'
    });
  }

  onCollectChest(player, chest) {
    if (!chest.active || this.isLevelingUp || this.isRollingChest) return;
    chest.destroy();
    this.chestsOpened++;
    this.sfxEvo();
    this.showRollChestUI();
  }

  onPlayerHitEnemy(player, enemy) {
    if (!enemy.active || this.isGameOver) return;
    if (enemy.lastHit && this.time.now - enemy.lastHit < 550) return;
    enemy.lastHit = this.time.now;

    const dmg = enemy.damage * (1 - this.stats.armor);
    this.stats.hp -= dmg;
    this.cameras.main.shake(100, 0.012);
    this.spawnScreenFlash(0xff4444, 0.18, 90);
    this.hitStop(80, 0.2);
    this.sfxHurt();
    this.player.setTint(0xff4444);
    this.applyPlayerHurtFX();
    this.setPlayerState('hit');
    this.time.delayedCall(120, () => {
      if (this.player.active) this.player.clearTint();
      if (this.playerState === 'hit') this.setPlayerState(this.isMoving ? 'run' : 'idle');
    });

    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this.gameOver();
    }
  }

  // ========== LEVEL UP ==========
  // Đường cong EXP: dùng đệ quy (xpToNext_mới = xpToNext_cũ * hệ số) thay vì tính lại từ đầu bằng pow(),
  // để có thể giảm dần độ dốc ở level cao mà không bị "gãy khúc" (discontinuity) giữa các mốc.
  // Level 1-10: x1.22/level (nhanh, cảm giác lên cấp dồn dập đầu game)
  // Level 11-20: x1.15/level (chững lại vừa phải)
  // Level 21+:   x1.10/level (late-game vẫn lên cấp đều, không bị "ì" quá đà)
  xpGrowthRate(level) {
    if (level <= 10) return 1.22;
    if (level <= 20) return 1.15;
    return 1.10;
  }

  levelUp() {
    this.xp -= this.xpToNext;
    this.level++;
    this.xpToNext = Math.floor(this.xpToNext * this.xpGrowthRate(this.level));
    this.isLevelingUp = true;
    this.physics.pause();
    this.setJoyZoneVisible(false);
    this.sfxLevel();
    this.playLevelUpBurst();
    this.showLevelUpUI();
  }

  // Hiệu ứng nổ ánh sáng vàng quanh người chơi + flash thanh EXP mỗi khi lên cấp
  playLevelUpBurst() {
    // Flash nhanh trên thanh EXP để báo hiệu vừa đầy
    if (this.xpBar) {
      this.tweens.add({ targets: this.xpBar, alpha: 0.25, duration: 90, yoyo: true, repeat: 2 });
    }

    const ring = this.add.circle(this.player.x, this.player.y, 10, 0xffdd88, 0).setStrokeStyle(3, 0xffdd88, 1).setDepth(45);
    this.tweens.add({
      targets: ring,
      radius: 90,
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Cubic.Out',
      onUpdate: () => ring.setStrokeStyle(3, 0xffdd88, ring.alpha),
      onComplete: () => ring.destroy()
    });

    // Hạt sáng bắn tỏa tròn quanh player
    const burstCount = 14;
    for (let i = 0; i < burstCount; i++) {
      const angle = (Math.PI * 2 * i) / burstCount;
      const spark = this.add.circle(this.player.x, this.player.y, 3, 0xffe9a8, 1).setDepth(46);
      this.tweens.add({
        targets: spark,
        x: this.player.x + Math.cos(angle) * 70,
        y: this.player.y + Math.sin(angle) * 70,
        alpha: 0,
        duration: 450 + Math.random() * 150,
        ease: 'Cubic.Out',
        onComplete: () => spark.destroy()
      });
    }
  }

  showLevelUpUI() {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;

    this.levelUpContainer = this.add.container(0, 0).setDepth(200);
    this._levelUpGlowTweens = [];

    const overlay = this.add.rectangle(cx, cy, cam.width + 20, cam.height + 20, 0x000000, 0.72);
    this.levelUpContainer.add(overlay);

    const title = this.add.text(cx, cy - 195, `LEVEL UP  •  ${this.level}`, {
      fontSize: '34px', color: '#ffdd88', fontStyle: 'bold', fontFamily: 'Segoe UI'
    }).setOrigin(0.5).setAlpha(0);
    this.levelUpContainer.add(title);
    this.tweens.add({ targets: title, alpha: 1, y: cy - 185, duration: 250, ease: 'Back.Out' });

    const choices = this.generateLevelUpChoices();
    choices.forEach((choice, i) => {
      const y = cy - 90 + i * 100;
      const isEvo = choice.type === 'evolution';
      const isUp = choice.type === 'upgrade';
      const bg = isEvo ? 0x2a2040 : (isUp ? 0x1a2a22 : 0x1a1a2e);
      const stroke = isEvo ? 0xffdd88 : (isUp ? 0x66cc88 : 0x6c5ce7);
      const CARD_W = 540, CARD_H = 90;
      const card = this.add.rectangle(cx, y, CARD_W, CARD_H, bg)
        .setStrokeStyle(2, stroke)
        .setInteractive({ useHandCursor: true });

      // ---- Glow pulse riêng cho evolution: viền phát sáng nhấp nháy để
      // nổi bật lựa chọn mạnh nhất trong danh sách. Vẽ bằng Graphics tách
      // biệt (nằm dưới card) để không ảnh hưởng viền gốc của rectangle. ----
      let glow = null, glowTween = null;
      if (isEvo) {
        glow = this.add.graphics();
        const drawGlow = (thickness, alpha) => {
          glow.clear();
          glow.lineStyle(thickness, 0xffdd88, alpha);
          glow.strokeRoundedRect(cx - CARD_W / 2 - thickness, y - CARD_H / 2 - thickness,
            CARD_W + thickness * 2, CARD_H + thickness * 2, 10);
        };
        drawGlow(3, 0.5);
        const glowState = { t: 3, a: 0.5 };
        glowTween = this.tweens.add({
          targets: glowState,
          t: 7, a: 0.15,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          onUpdate: () => drawGlow(glowState.t, glowState.a)
        });
        this._levelUpGlowTweens.push(glowTween);
      }

      // ---- Huy hiệu rarity ở góc trên-phải thẻ ----
      const rarityMap = {
        evolution: { icon: '\u2726', color: '#ffdd88', bgColor: 0x3a2f18 }, // ✦
        upgrade: { icon: '\u2605', color: '#88ffb0', bgColor: 0x173a26 },   // ★
        weapon: { icon: '\u25C6', color: '#c9b3ff', bgColor: 0x2a2048 },   // ◆
        passive: { icon: '\u25C6', color: '#8fd0ff', bgColor: 0x1a2a3a }, // ◆
        stat: { icon: '\u25CF', color: '#dddddd', bgColor: 0x2a2a2a }     // ●
      };
      const rarity = rarityMap[choice.type] || rarityMap.stat;
      const badgeX = cx + CARD_W / 2 - 20;
      const badgeY = y - CARD_H / 2 + 16;
      const badgeBg = this.add.circle(badgeX, badgeY, 12, rarity.bgColor, 0.95)
        .setStrokeStyle(1.5, Phaser.Display.Color.HexStringToColor(rarity.color).color, 0.9);
      const badgeIcon = this.add.text(badgeX, badgeY, rarity.icon, {
        fontSize: '13px', color: rarity.color, fontStyle: 'bold', fontFamily: 'Segoe UI'
      }).setOrigin(0.5);

      let iconKey = null;
      if (choice.type === 'weapon' || choice.type === 'evolution' || choice.type === 'upgrade') {
        iconKey = 'icon_' + choice.id;
      } else if (choice.type === 'passive') {
        iconKey = 'icon_pas_' + choice.id;
      }

      let icon;
      if (iconKey && this.textures.exists(iconKey)) {
        icon = this.add.image(cx - 240, y - 6, iconKey).setDisplaySize(44, 44);
      } else {
        icon = this.add.rectangle(cx - 240, y - 6, 44, 44, isEvo ? 0x6655aa : 0x333355);
      }

      const label = this.add.text(cx - 205, y - 28, choice.title, {
        fontSize: '16px', color: isEvo ? '#ffeeaa' : '#ffffff', fontStyle: 'bold', fontFamily: 'Segoe UI'
      });
      const desc = this.add.text(cx - 205, y - 6, choice.desc || '', {
        fontSize: '12px', color: '#99aacc', fontFamily: 'Segoe UI', wordWrap: { width: 360 }
      });

      // ---- Requirement row: icons + text ----
      const reqItems = []; // game objects to animate
      const reqY = y + 28;
      let reqX = cx - 205;

      // Label prefix
      let prefix = '';
      if (choice.type === 'weapon' || choice.type === 'upgrade') prefix = 'Evo cần:';
      else if (choice.type === 'passive') prefix = 'Mở evo:';
      else if (choice.type === 'evolution') prefix = 'Đã đủ:';

      const prefixText = this.add.text(reqX, reqY, prefix, {
        fontSize: '11px', color: isEvo ? '#ffcc66' : '#88aa99', fontFamily: 'Segoe UI'
      }).setOrigin(0, 0.5);
      reqItems.push(prefixText);
      reqX += prefixText.width + 6;

      // Build list of related icons
      // choice.reqIcons = [{ key, owned, label }]
      const icons = choice.reqIcons || [];
      icons.forEach((ri, idx) => {
        if (idx > 0) {
          const plus = this.add.text(reqX, reqY, '+', {
            fontSize: '12px', color: '#888899', fontFamily: 'Segoe UI'
          }).setOrigin(0, 0.5);
          reqItems.push(plus);
          reqX += plus.width + 4;
        }
        const hasTex = ri.key && this.textures.exists(ri.key);
        let ric;
        if (hasTex) {
          ric = this.add.image(reqX + 12, reqY, ri.key).setDisplaySize(22, 22);
        } else {
          ric = this.add.rectangle(reqX + 12, reqY, 22, 22, 0x333355);
        }
        // dim if not owned yet
        if (ri.owned === false) ric.setAlpha(0.4);
        // green border if owned
        if (ri.owned === true) {
          const br = this.add.rectangle(reqX + 12, reqY, 24, 24).setStrokeStyle(1, 0x66ff88).setFillStyle();
          reqItems.push(br);
        }
        reqItems.push(ric);
        reqX += 28;
        if (ri.label) {
          const lt = this.add.text(reqX, reqY, ri.label, {
            fontSize: '10px', color: ri.owned ? '#aaffaa' : '#aa8888', fontFamily: 'Segoe UI'
          }).setOrigin(0, 0.5);
          reqItems.push(lt);
          reqX += lt.width + 8;
        }
      });

      if (!icons.length && choice.extra) {
        const extra = this.add.text(reqX, reqY, choice.extra, {
          fontSize: '11px', color: isEvo ? '#ffcc66' : '#77aa88', fontFamily: 'Segoe UI'
        }).setOrigin(0, 0.5);
        reqItems.push(extra);
      }

      // slide-in
      const allObjs = [card, ...(glow ? [glow] : []), badgeBg, badgeIcon, icon, label, desc, ...reqItems];
      allObjs.forEach(o => { o.x += 80; o.setAlpha(0); });
      this.levelUpContainer.add(allObjs);
      this.tweens.add({
        targets: allObjs,
        x: '-=80', alpha: 1, duration: 280, delay: i * 70, ease: 'Cubic.Out'
      });

      // ---- Particle nhỏ khi hover: vài hạt lấp lánh bay lên quanh viền
      // thẻ, dừng phát khi rời chuột và tự huỷ để không rò rỉ bộ nhớ. ----
      let hoverParticles = null;
      const startHoverParticles = () => {
        if (hoverParticles) return;
        hoverParticles = this.add.particles(0, 0, 'particle', {
          x: { min: cx - CARD_W / 2 + 10, max: cx + CARD_W / 2 - 10 },
          y: { min: y - CARD_H / 2, max: y + CARD_H / 2 },
          lifespan: 500,
          speedY: { min: -30, max: -10 },
          speedX: { min: -6, max: 6 },
          scale: { start: 0.35, end: 0 },
          alpha: { start: 0.8, end: 0 },
          tint: isEvo ? 0xffdd88 : (isUp ? 0x66cc88 : 0x9d8dff),
          frequency: 60,
          quantity: 1
        }).setDepth(199);
        this.levelUpContainer.add(hoverParticles);
      };
      const stopHoverParticles = () => {
        if (!hoverParticles) return;
        hoverParticles.stop();
        this.time.delayedCall(500, () => { if (hoverParticles) { hoverParticles.destroy(); hoverParticles = null; } });
      };

      card.on('pointerover', () => {
        card.setFillStyle(isEvo ? 0x3a3060 : 0x2a2a4e);
        card.setScale(1.02);
        badgeBg.setScale(1.15);
        startHoverParticles();
      });
      card.on('pointerout', () => {
        card.setFillStyle(bg);
        card.setScale(1);
        badgeBg.setScale(1);
        stopHoverParticles();
      });
      card.on('pointerdown', () => {
        if (glowTween) glowTween.stop();
        stopHoverParticles();
        this.applyChoice(choice);
        this.closeLevelUp();
      });
    });
  }

  generateLevelUpChoices() {
    const choices = [];
    const weaponIds = Object.keys(this.weaponLevels);
    const weaponCount = weaponIds.length;

    // 1) Evolutions sẵn sàng
    const evos = getAvailableEvolutions(this.weaponLevels, this.ownedPassives);
    evos.forEach(evo => {
      const wKey = 'icon_' + evo.requires.weapon;
      const pKey = 'icon_pas_' + evo.requires.passive;
      choices.push({
        type: 'evolution',
        id: evo.id,
        base: evo.base || evo.requires.weapon,
        title: '✦ ' + evo.name,
        desc: evo.description,
        extra: '',
        reqIcons: [
          { key: wKey, owned: true, label: getWeaponName(evo.requires.weapon) + ' MAX' },
          { key: pKey, owned: true, label: getPassiveName(evo.requires.passive) }
        ]
      });
    });

    // 2) Upgrade skill chưa max
    weaponIds.forEach(wid => {
      if (EVOLUTIONS[wid]) return;
      const base = WEAPONS[wid];
      if (!base) return;
      const lv = this.weaponLevels[wid] || 1;
      const maxL = base.maxLevel || MAX_WEAPON_LEVEL;
      if (lv < maxL) {
        const evo = getEvolutionForWeapon(wid);
        const reqIcons = [];
        if (evo) {
          const hasPas = this.ownedPassives.includes(evo.requires.passive);
          reqIcons.push({
            key: 'icon_pas_' + evo.requires.passive,
            owned: hasPas,
            label: getPassiveName(evo.requires.passive) + (hasPas ? ' ✓' : ' (chưa có)')
          });
          reqIcons.push({
            key: 'icon_' + wid,
            owned: lv >= maxL - 1,
            label: 'Lv' + lv + '→' + (lv + 1) + '/' + maxL
          });
        }
        choices.push({
          type: 'upgrade',
          id: wid,
          title: base.name + '  Lv' + lv + '→' + (lv + 1),
          desc: base.levelBonus || base.description,
          extra: evo ? ('Evo khi MAX + ' + getPassiveName(evo.requires.passive)) : '',
          reqIcons: reqIcons
        });
      }
    });

    // 3) Skill mới
    if (weaponCount < MAX_WEAPONS) {
      const possible = getWeaponsByClass(this.classId)
        .filter(w => !this.weaponLevels[w.id]);
      Phaser.Utils.Array.Shuffle(possible);
      possible.slice(0, 4).forEach(w => {
        const evo = getEvolutionForWeapon(w.id);
        const reqIcons = [];
        if (evo) {
          const hasPas = this.ownedPassives.includes(evo.requires.passive);
          reqIcons.push({
            key: 'icon_pas_' + evo.requires.passive,
            owned: hasPas,
            label: getPassiveName(evo.requires.passive) + (hasPas ? ' ✓' : '')
          });
        }
        choices.push({
          type: 'weapon',
          id: w.id,
          title: w.name,
          desc: w.description,
          extra: evo ? ('Evo: MAX + ' + getPassiveName(evo.requires.passive)) : 'Skill mới',
          reqIcons: reqIcons
        });
      });
    }

    // 4) Passive — hiện icon skill có thể evo
    if (this.ownedPassives.length < MAX_PASSIVES) {
      const possible = Object.values(PASSIVES)
        .filter(p => !this.ownedPassives.includes(p.id));
      Phaser.Utils.Array.Shuffle(possible);
      possible.slice(0, 4).forEach(p => {
        const usedBy = getEvolutionsUsingPassive(p.id)
          .filter(e => WEAPONS[e.requires.weapon] && WEAPONS[e.requires.weapon].class === this.classId);
        const reqIcons = [];
        usedBy.forEach(e => {
          const hasW = !!this.weaponLevels[e.requires.weapon];
          const lv = this.weaponLevels[e.requires.weapon] || 0;
          const maxL = (WEAPONS[e.requires.weapon] && WEAPONS[e.requires.weapon].maxLevel) || MAX_WEAPON_LEVEL;
          reqIcons.push({
            key: 'icon_' + e.requires.weapon,
            owned: hasW,
            label: getWeaponName(e.requires.weapon) + (hasW ? (' L' + lv + '/' + maxL) : ' (chưa có)')
          });
        });
        choices.push({
          type: 'passive',
          id: p.id,
          title: p.name,
          desc: p.description,
          extra: usedBy.length ? ('Evo với: ' + usedBy.map(e => getWeaponName(e.requires.weapon)).join(', ')) : 'Passive',
          reqIcons: reqIcons
        });
      });
    }

    if (choices.length === 0) {
      choices.push({ type: 'stat', id: 'damage', title: '+18% Damage', desc: 'Tăng sát thương vĩnh viễn', extra: '', reqIcons: [] });
      choices.push({ type: 'stat', id: 'hp', title: '+25 Max HP', desc: 'Tăng máu tối đa', extra: '', reqIcons: [] });
    }

    return Phaser.Utils.Array.Shuffle(choices).slice(0, LEVELUP_CHOICES);
  }

  applyChoice(choice) {
    if (choice.type === 'weapon') {
      this.weaponLevels[choice.id] = 1;
      this.weaponCooldowns[choice.id] = 0;
    } else if (choice.type === 'upgrade') {
      this.weaponLevels[choice.id] = (this.weaponLevels[choice.id] || 1) + 1;
    } else if (choice.type === 'passive') {
      this.ownedPassives.push(choice.id);
      this.applyPassive(choice.id);
    } else if (choice.type === 'evolution') {
      const base = choice.base;
      delete this.weaponLevels[base];
      delete this.weaponCooldowns[base];
      this.weaponLevels[choice.id] = 1;
      this.weaponCooldowns[choice.id] = 0;
      this.cameras.main.flash(350, 220, 200, 255);
      this.evoParticles.emitParticleAt(this.player.x, this.player.y, 24);
      this.showFloatingText(this.player.x, this.player.y - 50, 'EVOLVED!', '#ffee88');
      this.sfxEvo();
      this.playEvolveBurst();
    } else if (choice.type === 'stat') {
      if (choice.id === 'damage') this.stats.damage *= 1.18;
      if (choice.id === 'hp') {
        this.stats.maxHp += 25;
        this.stats.hp += 25;
      }
    }
    this.updateWeaponIcons();
  }

  // Hiệu ứng bùng nổ hào quang tím-vàng khi tiến hóa vũ khí — mạnh và dài hơi hơn level up
  // vì đây là mốc hiếm, đáng chú ý nhất trong 1 lượt chơi.
  playEvolveBurst() {
    this.cameras.main.shake(180, 0.006);

    // Hai vòng tròn lan ra lệch thời gian, tạo cảm giác dồn dập
    [0, 120].forEach(delay => {
      this.time.delayedCall(delay, () => {
        const ring = this.add.circle(this.player.x, this.player.y, 10, 0xd9aaff, 0)
          .setStrokeStyle(4, 0xffe6a8, 1).setDepth(45);
        this.tweens.add({
          targets: ring, radius: 130, alpha: { from: 1, to: 0 }, duration: 650, ease: 'Cubic.Out',
          onUpdate: () => ring.setStrokeStyle(4, 0xffe6a8, ring.alpha),
          onComplete: () => ring.destroy()
        });
      });
    });

    // Cột tia sáng bắn thẳng lên trời tại vị trí người chơi
    const beam = this.add.rectangle(this.player.x, this.player.y, 10, 220, 0xffe6a8, 0.65)
      .setOrigin(0.5, 1).setDepth(44).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: beam, alpha: 0, scaleX: 0.2, y: this.player.y - 20, duration: 500, ease: 'Cubic.Out',
      onComplete: () => beam.destroy()
    });

    // Hạt sáng bắn tỏa dày hơn level up thường, pha 2 màu tím/vàng
    const burstCount = 22;
    for (let i = 0; i < burstCount; i++) {
      const angle = (Math.PI * 2 * i) / burstCount + Math.random() * 0.2;
      const color = i % 2 === 0 ? 0xffe6a8 : 0xd9aaff;
      const spark = this.add.circle(this.player.x, this.player.y, 3.5, color, 1).setDepth(46);
      this.tweens.add({
        targets: spark,
        x: this.player.x + Math.cos(angle) * 100,
        y: this.player.y + Math.sin(angle) * 100,
        alpha: 0,
        duration: 550 + Math.random() * 200,
        ease: 'Cubic.Out',
        onComplete: () => spark.destroy()
      });
    }
  }

  applyPassive(id) {
    const p = PASSIVES[id];
    if (!p) return;
    switch (p.effect) {
      case 'attackSpeed': this.stats.attackSpeed += p.value; break;
      case 'damage': this.stats.damage *= (1 + p.value); break;
      case 'crit': this.stats.crit += p.value; break;
      case 'speed': this.stats.speed *= (1 + p.value); break;
      case 'armor': this.stats.armor = Math.min(0.6, this.stats.armor + p.value); break;
      case 'maxHp':
        this.stats.maxHp *= (1 + p.value);
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp * (1 + p.value));
        break;
      case 'lifesteal': this.stats.lifesteal += p.value; break;
      case 'xpGain': this.stats.xpGain += p.value; break;
      case 'pickup': this.stats.pickupRange *= (1 + p.value); break;
      case 'cooldown': this.stats.attackSpeed += p.value; break;
      case 'area': this.stats.area += p.value; break;
    }
  }

  closeLevelUp() {
    if (this._levelUpGlowTweens) {
      this._levelUpGlowTweens.forEach(t => t.stop());
      this._levelUpGlowTweens = null;
    }
    if (this.levelUpContainer) {
      this.levelUpContainer.destroy();
      this.levelUpContainer = null;
    }
    this.isLevelingUp = false;
    this.physics.resume();
    this.setJoyZoneVisible(true);
  }

  // ========== ROLL PASSIVE TỪ RƯƠNG BOSS ==========
  showRollChestUI() {
    this.isRollingChest = true;
    this.physics.pause();
    this.setJoyZoneVisible(false);

    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;

    this.chestRollContainer = this.add.container(0, 0).setDepth(200);

    const overlay = this.add.rectangle(cx, cy, cam.width + 20, cam.height + 20, 0x000000, 0.8);
    this.chestRollContainer.add(overlay);

    // Tia sáng vàng xoay chậm phía sau, tạo cảm giác "rương báu" thay vì nền đen trơn
    const rays = this.add.graphics().setAlpha(0.22);
    const rayCount = 10;
    for (let i = 0; i < rayCount; i++) {
      const a = (Math.PI * 2 * i) / rayCount;
      rays.fillStyle(0xffd166, 1);
      rays.beginPath();
      rays.moveTo(cx, cy);
      rays.arc(cx, cy, 900, a, a + 0.09, false);
      rays.closePath();
      rays.fillPath();
    }
    this.chestRollContainer.add(rays);
    const raysTween = this.tweens.add({
      targets: rays, rotation: Math.PI * 2, duration: 20000, repeat: -1, ease: 'Linear'
    });
    this._chestRollRaysTween = raysTween;

    // Glow tròn phát sáng phía sau tiêu đề
    const titleGlow = this.add.circle(cx, cy - 155, 130, 0xffd166, 0.18).setBlendMode(Phaser.BlendModes.ADD);
    this.chestRollContainer.add(titleGlow);
    const titleGlowTween = this.tweens.add({
      targets: titleGlow, scale: { from: 0.9, to: 1.15 }, alpha: { from: 0.22, to: 0.1 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut'
    });
    if (!this._chestGlowTweens) this._chestGlowTweens = [];
    this._chestGlowTweens.push(titleGlowTween);

    const chestIcon = this.add.text(cx, cy - 205, '💰', { fontSize: '40px' }).setOrigin(0.5).setScale(0);
    this.chestRollContainer.add(chestIcon);
    this.tweens.add({ targets: chestIcon, scale: 1, duration: 350, ease: 'Back.Out', delay: 80 });
    const iconWobbleTween = this.tweens.add({
      targets: chestIcon, angle: { from: -6, to: 6 }, duration: 700, yoyo: true, repeat: -1,
      ease: 'Sine.InOut', delay: 450
    });
    this._chestGlowTweens.push(iconWobbleTween);

    const title = this.add.text(cx, cy - 165, '✦ RƯƠNG BOSS — CHỌN 1 PASSIVE ✦', {
      fontSize: '26px', color: '#ffd166', fontStyle: 'bold', fontFamily: 'Segoe UI'
    }).setOrigin(0.5).setAlpha(0);
    this.chestRollContainer.add(title);
    this.tweens.add({ targets: title, alpha: 1, y: cy - 155, duration: 250, ease: 'Back.Out' });

    const choices = this.generateChestPassiveChoices();
    const startY = cy - 60;
    choices.forEach((choice, i) => {
      const y = startY + i * 100;
      const CARD_W = 540, CARD_H = 90;
      const card = this.add.rectangle(cx, y, CARD_W, CARD_H, 0x241a0d)
        .setStrokeStyle(2, 0xffd166)
        .setInteractive({ useHandCursor: true });

      // Viền vàng phát sáng nhấp nháy quanh mỗi lựa chọn — cả 3 đều là phần thưởng
      // hiếm từ rương boss nên xứng đáng có hào quang thay vì viền tĩnh như card thường.
      const glow = this.add.graphics();
      const drawGlow = (thickness, alpha) => {
        glow.clear();
        glow.lineStyle(thickness, 0xffd166, alpha);
        glow.strokeRoundedRect(cx - CARD_W / 2 - thickness, y - CARD_H / 2 - thickness,
          CARD_W + thickness * 2, CARD_H + thickness * 2, 10);
      };
      drawGlow(2, 0.35);
      const glowState = { t: 2, a: 0.35 };
      const glowTween = this.tweens.add({
        targets: glowState, t: 5, a: 0.12, duration: 900 + i * 120, yoyo: true, repeat: -1,
        ease: 'Sine.InOut', onUpdate: () => drawGlow(glowState.t, glowState.a)
      });
      if (!this._chestGlowTweens) this._chestGlowTweens = [];
      this._chestGlowTweens.push(glowTween);

      const iconKey = choice.type === 'passive' ? 'icon_pas_' + choice.id : null;
      const iconBadge = this.add.circle(cx - 240, y, 26, 0x3a2a12, 0.9).setStrokeStyle(1.5, 0xffd166, 0.7);
      let icon;
      if (iconKey && this.textures.exists(iconKey)) {
        icon = this.add.image(cx - 240, y, iconKey).setDisplaySize(38, 38);
      } else {
        icon = this.add.rectangle(cx - 240, y, 34, 34, 0x6b4423);
      }

      const label = this.add.text(cx - 205, y - 16, choice.title, {
        fontSize: '16px', color: '#ffffff', fontStyle: 'bold', fontFamily: 'Segoe UI'
      });
      const desc = this.add.text(cx - 205, y + 8, choice.desc || '', {
        fontSize: '12px', color: '#c9a876', fontFamily: 'Segoe UI', wordWrap: { width: 400 }
      });

      const allObjs = [card, glow, iconBadge, icon, label, desc];
      allObjs.forEach(o => { o.x += 80; o.setAlpha(0); });
      this.chestRollContainer.add(allObjs);
      this.tweens.add({
        targets: allObjs, x: '-=80', alpha: 1, duration: 280, delay: i * 70, ease: 'Cubic.Out'
      });

      card.on('pointerover', () => { card.setFillStyle(0x3a2a12); card.setScale(1.02); });
      card.on('pointerout', () => { card.setFillStyle(0x241a0d); card.setScale(1); });
      card.on('pointerdown', () => {
        if (this._chestGlowTweens) { this._chestGlowTweens.forEach(t => t.stop()); this._chestGlowTweens = null; }
        // Bùng sáng vàng ngay tại lựa chọn vừa chọn trước khi đóng UI
        for (let p = 0; p < 16; p++) {
          const spark = this.add.circle(card.x, card.y, 3, 0xffd166, 1).setDepth(210);
          const a = Math.random() * Math.PI * 2;
          this.tweens.add({
            targets: spark, x: card.x + Math.cos(a) * 80, y: card.y + Math.sin(a) * 80,
            alpha: 0, duration: 350, ease: 'Cubic.Out', onComplete: () => spark.destroy()
          });
        }
        this.applyChestChoice(choice);
        this.closeChestRoll();
      });
    });
  }

  generateChestPassiveChoices() {
    const choices = [];
    const possible = Object.values(PASSIVES).filter(p => !this.ownedPassives.includes(p.id));
    Phaser.Utils.Array.Shuffle(possible);
    possible.slice(0, CHEST_ROLL_CHOICES).forEach(p => {
      choices.push({ type: 'passive', id: p.id, title: p.name, desc: p.description });
    });
    // Nếu đã sở hữu hết passive (hoặc đạt MAX_PASSIVES), cho roll bonus stat thay thế
    while (choices.length < CHEST_ROLL_CHOICES) {
      choices.push({ type: 'stat', id: 'damage', title: '+10% Damage', desc: 'Tăng sát thương vĩnh viễn' });
    }
    return choices;
  }

  applyChestChoice(choice) {
    if (choice.type === 'passive' && this.ownedPassives.length < MAX_PASSIVES) {
      this.ownedPassives.push(choice.id);
      this.applyPassive(choice.id);
      this.showFloatingText(this.player.x, this.player.y - 50, '+' + PASSIVES[choice.id].name, '#ffd166');
    } else if (choice.type === 'stat') {
      this.stats.damage *= 1.1;
      this.showFloatingText(this.player.x, this.player.y - 50, '+10% Damage', '#ffd166');
    }
    this.updateWeaponIcons();
    this.updateSkillPanel();
  }

  closeChestRoll() {
    if (this._chestGlowTweens) { this._chestGlowTweens.forEach(t => t.stop()); this._chestGlowTweens = null; }
    if (this._chestRollRaysTween) { this._chestRollRaysTween.stop(); this._chestRollRaysTween = null; }
    if (this.chestRollContainer) {
      this.chestRollContainer.destroy();
      this.chestRollContainer = null;
    }
    this.isRollingChest = false;
    this.physics.resume();
    this.setJoyZoneVisible(true);
  }

  // ========== UI UPDATE ==========
  updateUI() {
    const hpRatio = Math.max(0, this.stats.hp / this.stats.maxHp);
    this.hpBar.width = 232 * hpRatio;

    // Trail "chip damage": khi mất máu, thanh cam rút chậm theo sau để thấy rõ vừa mất bao nhiêu;
    // khi hồi máu thì bám sát ngay lập tức (không có độ trễ khi hồi).
    if (this.hpTrailRatio === undefined) this.hpTrailRatio = hpRatio;
    this.hpTrailRatio = hpRatio >= this.hpTrailRatio ? hpRatio : Math.max(hpRatio, this.hpTrailRatio - 0.008);
    this.hpBarTrail.width = 232 * this.hpTrailRatio;

    if (hpRatio > 0.5) this.hpBar.setFillStyle(0x44ff88);
    else if (hpRatio > 0.25) this.hpBar.setFillStyle(0xffcc44);
    else {
      this.hpBar.setFillStyle(0xff4444);
      // pulse when low
      this.hpBar.setAlpha(0.7 + Math.sin(this.time.now / 150) * 0.3);
    }
    if (hpRatio > 0.25) this.hpBar.setAlpha(1);
    this.hpText.setText(`${Math.ceil(this.stats.hp)} / ${Math.ceil(this.stats.maxHp)}`);

    const xpRatio = Phaser.Math.Clamp(this.xp / this.xpToNext, 0, 1);
    // Fill mượt bằng lerp thay vì snap ngay, cảm giác "đổ" exp vào thanh tự nhiên hơn.
    if (this.xpDisplayRatio === undefined) this.xpDisplayRatio = xpRatio;
    this.xpDisplayRatio += (xpRatio - this.xpDisplayRatio) * 0.18;
    if (Math.abs(xpRatio - this.xpDisplayRatio) < 0.002) this.xpDisplayRatio = xpRatio;
    this.xpBar.width = 232 * this.xpDisplayRatio;
    this.levelText.setText(`Lv ${this.level}`);
    this.xpText.setText(`${Math.floor(this.xp)} / ${this.xpToNext} XP`);
    this.updateSkillPanel();

    const totalSec = Math.floor(this.timeAlive / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    this.timeText.setText(`${min}:${sec.toString().padStart(2, '0')}`);
    this.killText.setText(`Kills: ${this.kills}`);
  }

  showFloatingText(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontSize: '16px', color: color || '#fff', fontStyle: 'bold', fontFamily: 'Segoe UI', shadow: { offsetX: 0, offsetY: 0, color: '#000000', blur: 10, stroke: false, fill: true }
    }).setOrigin(0.5).setDepth(50).setScale(0.4);
    // Pop-in nhanh rồi mới bay lên mờ dần, thay vì hiện cứng ngay full size
    this.tweens.add({ targets: t, scale: 1, duration: 90, ease: 'Back.Out' });
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 700,
      delay: 90,
      onComplete: () => t.destroy()
    });
  }

  updateSkillPanel() {
    if (!this.skillPanelContainer) return;
    this.skillPanelContainer.removeAll(true);

    const iconSize = 26;
    const cellW = 36;
    const cellH = 48;
    const cols = 7;
    const maxIcons = 12;

    const weaponIds = Object.keys(this.weaponLevels);
    const passiveIds = this.ownedPassives || [];
    const entries = [];

    weaponIds.forEach(id => {
      const isEvo = typeof EVOLUTIONS !== 'undefined' && !!EVOLUTIONS[id];
      entries.push({ kind: isEvo ? 'evolution' : 'weapon', id, level: this.weaponLevels[id] });
    });
    passiveIds.forEach(id => {
      entries.push({ kind: 'passive', id, level: null });
    });

    if (entries.length === 0) {
      const hint = this.add.text(0, 0, 'Chưa có kỹ năng nào', {
        fontSize: '12px', color: '#8a9ab0', fontFamily: 'Segoe UI'
      }).setOrigin(0, 0);
      this.skillPanelContainer.add(hint);
      return;
    }

    entries.slice(0, maxIcons).forEach((entry, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * cellW + iconSize / 2;
      const y = row * cellH;

      // Màu theo loại: vũ khí = xanh dương, evolution = vàng/tím lấp lánh, passive = xanh lá.
      let borderColor, fillColor, glow;
      if (entry.kind === 'evolution') { borderColor = 0xffd166; fillColor = 0x2a2040; glow = true; }
      else if (entry.kind === 'passive') { borderColor = 0x6bcf7f; fillColor = 0x18291d; glow = false; }
      else { borderColor = 0x6cb0ff; fillColor = 0x142238; glow = false; }

      // Glow nhẹ phía sau icon evolution để nổi bật hơn các skill thường.
      if (glow) {
        const glowRect = this.add.rectangle(x, y + iconSize / 2, iconSize + 10, iconSize + 10, 0xffd166, 0.22)
          .setOrigin(0.5);
        this.skillPanelContainer.add(glowRect);
        this.tweens.add({
          targets: glowRect, alpha: { from: 0.12, to: 0.3 }, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }

      const slotBg = this.add.rectangle(x, y + iconSize / 2, iconSize + 6, iconSize + 6, fillColor, 0.95)
        .setOrigin(0.5).setStrokeStyle(1.5, borderColor, 0.95).setInteractive({ useHandCursor: true });
      this.skillPanelContainer.add(slotBg);

      const iconKey = entry.kind === 'passive' ? 'icon_pas_' + entry.id : 'icon_' + entry.id;
      let icon;
      if (this.textures.exists(iconKey)) {
        icon = this.add.image(x, y + iconSize / 2, iconKey).setDisplaySize(iconSize, iconSize);
      } else {
        icon = this.add.rectangle(x, y + iconSize / 2, iconSize - 4, iconSize - 4, borderColor, 0.35);
      }
      this.skillPanelContainer.add(icon);

      // Thanh tiến trình cấp độ mỏng ngay dưới icon (chỉ cho vũ khí/evolution, có maxLevel rõ ràng).
      const def = getWeaponData ? getWeaponData(entry.id) : null;
      const maxLv = def && def.maxLevel ? def.maxLevel : null;
      if (entry.level && maxLv) {
        const barW = iconSize + 4;
        const barBg = this.add.rectangle(x, y + iconSize + 6, barW, 3, 0x0c1524, 1).setOrigin(0.5);
        const pct = Phaser.Math.Clamp(entry.level / maxLv, 0, 1);
        const barFill = this.add.rectangle(x - barW / 2, y + iconSize + 6, barW * pct, 3, borderColor, 1).setOrigin(0, 0.5);
        this.skillPanelContainer.add([barBg, barFill]);
        const lv = this.add.text(x, y + iconSize + 11, entry.level + '/' + maxLv, {
          fontSize: '9px', color: '#c7d2ee', fontFamily: 'Segoe UI'
        }).setOrigin(0.5, 0);
        this.skillPanelContainer.add(lv);
      } else if (entry.kind === 'passive') {
        const lv = this.add.text(x, y + iconSize + 6, 'P', {
          fontSize: '9px', color: '#a4ff9c', fontFamily: 'Segoe UI', fontStyle: 'bold'
        }).setOrigin(0.5, 0);
        this.skillPanelContainer.add(lv);
      }

      // Tooltip: tên + mô tả, hiện khi hover (desktop) hoặc chạm (mobile).
      const meta = entry.kind === 'passive'
        ? (typeof PASSIVES !== 'undefined' ? PASSIVES[entry.id] : null)
        : def;
      const title = meta ? meta.name : entry.id;
      const desc = meta ? (meta.description || '') : '';
      const levelLine = entry.level ? (maxLv ? `Cấp ${entry.level}/${maxLv}` : `Cấp ${entry.level}`) : '';
      const fullDesc = levelLine ? `${levelLine}\n${desc}` : desc;

      slotBg.on('pointerover', () => this.showSkillTooltip(x, y, title, fullDesc, borderColor));
      slotBg.on('pointerout', () => this.hideSkillTooltip());
      slotBg.on('pointerdown', () => this.showSkillTooltip(x, y, title, fullDesc, borderColor, true));
    });
  }

  // Hiện tooltip nhỏ ngay trên icon skill được hover/tap. autoHide=true dùng cho mobile (tự ẩn sau 2.2s).
  showSkillTooltip(localX, localY, title, desc, colorHex, autoHide = false) {
    if (!this.skillTooltipBg) return;
    if (this._skillTooltipHideEvent) { this._skillTooltipHideEvent.remove(); this._skillTooltipHideEvent = null; }

    const containerX = this.skillPanelContainer.x;
    const containerY = this.skillPanelContainer.y;
    const worldX = containerX + localX;
    const worldY = containerY + localY - 6;

    this.skillTooltipTitle.setText(title).setColor('#' + colorHex.toString(16).padStart(6, '0'));
    this.skillTooltipDesc.setText(desc);

    const padX = 10, padY = 8, gap = 3;
    const contentW = Math.max(this.skillTooltipTitle.width, this.skillTooltipDesc.width);
    const contentH = this.skillTooltipTitle.height + gap + this.skillTooltipDesc.height;
    const boxW = contentW + padX * 2;
    const boxH = contentH + padY * 2;

    // Giữ tooltip trong màn hình (không tràn mép trái/phải).
    let boxX = Phaser.Math.Clamp(worldX - boxW / 2, 8, this.scale.width - boxW - 8);
    const boxBottomY = worldY;

    this.skillTooltipBg.setPosition(boxX, boxBottomY).setSize(boxW, boxH).setVisible(true);
    this.skillTooltipDesc.setPosition(boxX + padX, boxBottomY - padY).setVisible(true);
    this.skillTooltipTitle.setPosition(boxX + padX, boxBottomY - padY - this.skillTooltipDesc.height - gap).setVisible(true);

    if (autoHide) {
      this._skillTooltipHideEvent = this.time.delayedCall(2200, () => this.hideSkillTooltip());
    }
  }

  hideSkillTooltip() {
    if (!this.skillTooltipBg) return;
    this.skillTooltipBg.setVisible(false);
    this.skillTooltipTitle.setVisible(false);
    this.skillTooltipDesc.setVisible(false);
    if (this._skillTooltipHideEvent) { this._skillTooltipHideEvent.remove(); this._skillTooltipHideEvent = null; }
  }

  // ===== PAUSE UI =====
  // Dùng font hệ thống có đầy đủ ký tự tiếng Việt; tránh emoji vì Phaser Canvas
  // có thể fallback sang font khác gây lệch/đè chữ trên một số máy.
  createPauseButton() {
    if (this.pauseButton) this.pauseButton.destroy();
    const cam = this.cameras.main;
    const x = cam.width - 18;
    const y = 16;

    const bg = this.add.rectangle(x - 55, y + 22, 112, 40, 0x161b2d, 0.94)
      .setStrokeStyle(1.5, 0x6574a6, 0.9)
      .setScrollFactor(0)
      .setDepth(250)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(x - 55, y + 22, 'PAUSE', {
      fontFamily: 'Arial, Tahoma, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(251);

    const icon = this.add.text(x - 88, y + 22, '||', {
      fontFamily: 'Arial, Tahoma, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#9fb7ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(251);

    this.pauseButton = this.add.container(0, 0, [bg, label, icon])
      .setDepth(250)
      .setScrollFactor(0);
    this.pauseButton._bg = bg;
    this.pauseButton._label = label;
    this.pauseButton._icon = icon;

    bg.on('pointerover', () => {
      if (!this.isPaused) bg.setFillStyle(0x26345a, 1);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(this.isPaused ? 0x28543b : 0x161b2d, this.isPaused ? 1 : 0.94);
    });
    bg.on('pointerdown', () => this.togglePause());
  }

  updatePauseButton() {
    if (!this.pauseButton) return;
    const bg = this.pauseButton._bg;
    const label = this.pauseButton._label;
    const icon = this.pauseButton._icon;
    if (this.isPaused) {
      label.setText('TIẾP TỤC');
      icon.setText('>');
      bg.setSize(138, 40);
      bg.setFillStyle(0x28543b, 1);
    } else {
      label.setText('PAUSE');
      icon.setText('||');
      bg.setSize(112, 40);
      bg.setFillStyle(0x161b2d, 0.94);
    }
  }

  togglePause() {
    if (this.isGameOver || this.isLevelingUp || this.isRollingChest) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.physics.pause();
      this.setJoyZoneVisible(false);
      this._confirmingReset = false;
      this._confirmingExit = false;
      this.showPauseMenu();
      this.updatePauseButton();
      if (typeof GameAudio !== 'undefined') GameAudio.pauseMusic();
      this.saveCloudGame();
    } else {
      this.physics.resume();
      this.setJoyZoneVisible(true);
      this.hidePauseMenu();
      this.updatePauseButton();
      if (typeof GameAudio !== 'undefined') GameAudio.resumeMusic();
    }
  }

  async saveCloudGame() {
    const api = window.AuthAPI;
    if (!api || !api.token || !api.user || api.user.guest) {
      this.setPauseSaveStatus('Đăng nhập để sử dụng Cloud Save', false);
      return false;
    }

    try {
      this.setPauseSaveStatus('Đang lưu Cloud Save...', false);
      const result = await api.saveCloud(this.exportSaveData());
      this.setPauseSaveStatus('Cloud Save đã lưu thành công', true);
      return !!(result && result.saved);
    } catch (error) {
      console.error('Auto Cloud Save failed:', error);
      this.setPauseSaveStatus('Lưu Cloud thất bại: ' + (error.message || 'Lỗi kết nối'), false);
      return false;
    }
  }

  // ========== MENU TẠM DỪNG ==========
  showPauseMenu() {
    const cam = this.cameras.main;
    const w = cam.width;
    const h = cam.height;
    const topY = cam.scrollY;
    const cx = cam.scrollX + w / 2;
    const font = 'Arial, Tahoma, sans-serif';

    if (this.pauseContainer) this.pauseContainer.destroy();
    this.pauseContainer = this.add.container(0, 0).setDepth(300);
    // Các phần tử con (Text/hit) thuộc những nút ghép nhiều lớp (gradient
    // graphics + icon + label + hit) — loại khỏi animation scale-theo-vị-trí
    // ở cuối hàm để tránh tách lớp khỏi nền nút khi overshoot (xem cuối hàm).
    this._pauseButtonParts = [];

    // Nền tối + thẻ trung tâm
    const overlay = this.add.rectangle(cx, topY + h / 2, w, h, 0x05070d, 0.86).setAlpha(0);
    const cardH = Math.min(560, h - 28);
    const cardW = Math.min(760, w - 32);

    // Shadow đổ nhẹ phía sau thẻ để tạo chiều sâu.
    const cardShadow = this.add.rectangle(cx, topY + h / 2 + 8, cardW, cardH, 0x000000, 0.35);

    const card = this.add.rectangle(cx, topY + h / 2, cardW, cardH, 0x111827, 0.98)
      .setStrokeStyle(2, 0x4b5f91, 0.9);
    this.pauseContainer.add([overlay, cardShadow, card]);

    const title = this.add.text(cx, topY + 42, 'TẠM DỪNG', {
      fontSize: '30px', color: '#ffffff', fontStyle: 'bold', fontFamily: font
    }).setOrigin(0.5);
    this.pauseContainer.add(title);

    const subInfo = this.add.text(cx, topY + 76,
      `${this.classData.name}  |  Lv ${this.level}  |  Kills ${this.kills}  |  ${Math.floor(this.timeAlive / 60000)}:${Math.floor((this.timeAlive / 1000) % 60).toString().padStart(2, '0')}`,
      { fontSize: '13px', color: '#aebbd4', fontFamily: font }
    ).setOrigin(0.5);
    this.pauseContainer.add(subInfo);

    const listLabel = this.add.text(cx, topY + 110, 'KỸ NĂNG HIỆN CÓ', {
      fontSize: '14px', color: '#ffd978', fontStyle: 'bold', fontFamily: font
    }).setOrigin(0.5);
    this.pauseContainer.add(listLabel);

    const iconSize = 40;
    const cellW = 84;
    const cols = Math.max(3, Math.min(7, Math.floor((w - 60) / cellW)));
    const weaponIds = Object.keys(this.weaponLevels);
    const skillEntries = weaponIds.map(id => ({
      kind: 'weapon', id, key: 'icon_' + id,
      name: getWeaponName(id), sub: 'Lv ' + this.weaponLevels[id]
    })).concat(this.ownedPassives.map(id => ({
      kind: 'passive', id, key: 'icon_pas_' + id,
      name: getPassiveName(id), sub: 'Passive'
    })));

    const gridTop = topY + 136;
    const gridW = cols * cellW;
    const gridX0 = cx - gridW / 2 + cellW / 2;

    if (skillEntries.length === 0) {
      const hint = this.add.text(cx, gridTop + 12, 'Chưa có kỹ năng nào', {
        fontSize: '12px', color: '#8d9bb5', fontFamily: font
      }).setOrigin(0.5);
      this.pauseContainer.add(hint);
    } else {
      skillEntries.slice(0, cols * 2).forEach((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridX0 + col * cellW;
        const y = gridTop + row * 66;

        const bg = this.add.rectangle(x, y, iconSize + 10, iconSize + 10, 0x1a2338)
          .setStrokeStyle(1, s.kind === 'passive' ? 0x4caf73 : 0x53668f);
        this.pauseContainer.add(bg);

        const icon = this.textures.exists(s.key)
          ? this.add.image(x, y, s.key).setDisplaySize(iconSize, iconSize)
          : this.add.rectangle(x, y, iconSize, iconSize, 0x303b58);
        this.pauseContainer.add(icon);

        const nameT = this.add.text(x, y + iconSize / 2 + 7, s.name, {
          fontSize: '9px', color: '#dce4f7', fontFamily: font, align: 'center',
          wordWrap: { width: cellW - 4 }
        }).setOrigin(0.5, 0);
        this.pauseContainer.add(nameT);

        const subT = this.add.text(x, y + iconSize / 2 + 21, s.sub, {
          fontSize: '9px', color: s.kind === 'passive' ? '#9df0ad' : '#8fc9ff', fontFamily: font
        }).setOrigin(0.5, 0);
        this.pauseContainer.add(subT);
      });
    }

    const rows = Math.max(1, Math.ceil(Math.min(skillEntries.length, cols * 2) / cols));
    const listBottom = gridTop + rows * 66 + 8;

    // Trạng thái save nằm riêng, không đè lên nút.
    const statusY = Math.min(topY + h - 128, listBottom + 14);
    this.pauseSaveStatus = this.add.text(cx, statusY, '', {
      fontSize: '12px', color: '#c7d2e8', fontFamily: font, align: 'center'
    }).setOrigin(0.5);
    this.pauseContainer.add(this.pauseSaveStatus);

    const btnY = Math.min(topY + h - 86, Math.max(listBottom + 52, statusY + 34));

    // Nút bo góc kiểu "gradient" giả lập bằng graphics: lớp đáy tối hơn +
    // lớp trên sáng hơn tạo cảm giác chiều sâu, cộng shadow đổ phía dưới
    // và icon minh hoạ hành động.
    const BTN_W = 150, BTN_H = 46, BTN_R = 12;
    const makeBtn = (x, label, icon, colorTop, colorBottom, hoverTop, hoverBottom, onClick) => {
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.35);
      shadow.fillRoundedRect(-BTN_W / 2, -BTN_H / 2 + 4, BTN_W, BTN_H, BTN_R);
      shadow.setPosition(x, btnY);

      // g được vẽ tại gốc cục bộ (0,0) rồi setPosition ra vị trí thật, để
      // setScale() (dùng khi hover/click) phóng to đúng quanh tâm nút thay
      // vì lệch tâm — vẽ trực tiếp bằng toạ độ tuyệt đối trước đây khiến
      // graphics phình ra không đối xứng, "tràn" xuống/qua nút bên cạnh.
      const g = this.add.graphics();
      const drawFace = (top, bottom) => {
        g.clear();
        g.fillGradientStyle(top, top, bottom, bottom, 1);
        g.fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, BTN_R);
        g.lineStyle(1.5, 0xffffff, 0.22);
        g.strokeRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, BTN_R);
      };
      drawFace(colorTop, colorBottom);
      g.setPosition(x, btnY);

      const iconT = this.add.text(x - BTN_W / 2 + 24, btnY, icon, {
        fontSize: '16px', color: '#ffffff', fontStyle: 'bold', fontFamily: font
      }).setOrigin(0.5);

      const txt = this.add.text(x + 10, btnY, label, {
        fontSize: '15px', color: '#ffffff', fontStyle: 'bold', fontFamily: font
      }).setOrigin(0.5);

      const hit = this.add.rectangle(x, btnY, BTN_W, BTN_H, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });

      // icon/label scale quanh tâm chữ riêng của chúng (setOrigin 0.5 đã lo
      // việc đó) nên không cần setPosition đặc biệt — chỉ g cần vì nó vẽ
      // hình chữ nhật lệch tâm gốc.
      hit.on('pointerover', () => {
        drawFace(hoverTop, hoverBottom);
        this.tweens.add({ targets: [g, iconT, txt], scale: 1.04, duration: 90, ease: 'Sine.easeOut' });
      });
      hit.on('pointerout', () => {
        drawFace(colorTop, colorBottom);
        this.tweens.add({ targets: [g, iconT, txt], scale: 1, duration: 90, ease: 'Sine.easeOut' });
      });
      hit.on('pointerdown', () => {
        this.tweens.add({
          targets: [g, iconT, txt], scale: 0.94, duration: 60, ease: 'Sine.easeOut',
          yoyo: true, onComplete: () => onClick()
        });
      });

      this.pauseContainer.add([shadow, g, iconT, txt, hit]);
      this._pauseButtonParts.push(iconT, txt, hit);
      return { g, iconT, txt, hit, shadow };
    };

    makeBtn(cx - 170, 'TIẾP TỤC', '\u25B6', 0x2f7a4c, 0x1e4d2e, 0x3a9660, 0x275c38, () => this.togglePause());
    makeBtn(cx, 'CHƠI LẠI', '\u27F2', 0x8a7124, 0x5c4b18, 0xa88a2c, 0x6f5a1d, () => this.confirmResetGame());
    makeBtn(cx + 170, 'THOÁT', '\u2715', 0x8a3838, 0x5c2222, 0xa84545, 0x6f2b2b, () => this.confirmExitGame());

    // Nút Cloud Save dùng chung style bo góc/gradient/icon với 3 nút chính
    // ở trên, thay vì rectangle phẳng riêng biệt như trước (tránh lệch tông
    // và tránh chồng hình khi animation pop-in chạy).
    const CLOUD_BTN_W = 220, CLOUD_BTN_H = 36, CLOUD_BTN_R = 10;
    const cloudY = btnY + 58;
    const cloudShadow = this.add.graphics();
    cloudShadow.fillStyle(0x000000, 0.3);
    cloudShadow.fillRoundedRect(-CLOUD_BTN_W / 2, -CLOUD_BTN_H / 2 + 3, CLOUD_BTN_W, CLOUD_BTN_H, CLOUD_BTN_R);
    cloudShadow.setPosition(cx, cloudY);

    // cloudG vẽ tại gốc cục bộ (0,0) rồi setPosition, cùng lý do như g ở
    // makeBtn: setScale khi hover phải phóng to quanh tâm nút, không lệch.
    const cloudG = this.add.graphics();
    const drawCloudFace = (top, bottom) => {
      cloudG.clear();
      cloudG.fillGradientStyle(top, top, bottom, bottom, 1);
      cloudG.fillRoundedRect(-CLOUD_BTN_W / 2, -CLOUD_BTN_H / 2, CLOUD_BTN_W, CLOUD_BTN_H, CLOUD_BTN_R);
      cloudG.lineStyle(1.5, 0x6c9ee8, 0.6);
      cloudG.strokeRoundedRect(-CLOUD_BTN_W / 2, -CLOUD_BTN_H / 2, CLOUD_BTN_W, CLOUD_BTN_H, CLOUD_BTN_R);
    };
    drawCloudFace(0x2a4a78, 0x18304f);
    cloudG.setPosition(cx, cloudY);

    const cloudIcon = this.add.text(cx - CLOUD_BTN_W / 2 + 22, cloudY, '\u2601', {
      fontSize: '15px', color: '#bcdcff', fontFamily: font
    }).setOrigin(0.5);

    const saveTxt = this.add.text(cx + 8, cloudY, 'LƯU CLOUD NGAY', {
      fontSize: '12px', color: '#d9e9ff', fontStyle: 'bold', fontFamily: font
    }).setOrigin(0.5);

    const saveHit = this.add.rectangle(cx, cloudY, CLOUD_BTN_W, CLOUD_BTN_H, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });

    saveHit.on('pointerover', () => {
      drawCloudFace(0x365d92, 0x1f3b60);
      this.tweens.add({ targets: [cloudG, cloudIcon, saveTxt], scale: 1.03, duration: 90, ease: 'Sine.easeOut' });
    });
    saveHit.on('pointerout', () => {
      drawCloudFace(0x2a4a78, 0x18304f);
      this.tweens.add({ targets: [cloudG, cloudIcon, saveTxt], scale: 1, duration: 90, ease: 'Sine.easeOut' });
    });
    saveHit.on('pointerdown', () => {
      this.tweens.add({
        targets: [cloudG, cloudIcon, saveTxt], scale: 0.95, duration: 60, ease: 'Sine.easeOut',
        yoyo: true, onComplete: () => this.saveCloudGame()
      });
    });

    this.pauseContainer.add([cloudShadow, cloudG, cloudIcon, saveTxt, saveHit]);
    this._pauseButtonParts.push(cloudIcon, saveTxt, saveHit);

    const continueNote = this.add.text(cx, btnY + 88,
      'Game đã tự động lưu. Vào PROFILE để tải Cloud Save.', {
      fontFamily: font,
      fontSize: '11px',
      color: '#8f9db8',
      align: 'center',
      wordWrap: { width: Math.min(520, w - 40) }
    }).setOrigin(0.5);
    this.pauseContainer.add(continueNote);

    // ===== Animation pop-in khi mở menu =====
    // Overlay tối chỉ fade nhanh; nội dung thẻ (mọi thứ khác trong
    // container) scale-in nhẹ kèm fade từ tâm thẻ, tạo cảm giác "bật lên".
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: 160,
      ease: 'Sine.easeOut'
    });

    const cardCenterX = cx;
    const cardCenterY = topY + h / 2;
    const popTargets = this.pauseContainer.list.filter(o => o !== overlay);
    popTargets.forEach(o => {
      if (typeof o.setAlpha === 'function') o.setAlpha(0);
    });

    // Graphics (shadow/nút bo góc) được vẽ bằng toạ độ tuyệt đối nên
    // setScale trên chính nó sẽ scale lệch tâm — chỉ fade các phần tử này,
    // không scale. Các nút ghép từ nhiều phần tử (Graphics nền + Text +
    // hit rectangle trong suốt) cũng bị loại khỏi scale-theo-vị-trí vì mỗi
    // phần tử con sẽ overshoot khác nhau và tách lớp khỏi nhau — chỉ những
    // phần tử "đơn" (Text/Image/Rectangle độc lập, không thuộc 1 nút ghép)
    // mới được scale quanh tâm thẻ để tạo hiệu ứng "bật lên".
    const noScaleSet = new Set([
      ...popTargets.filter(o => o.type === 'Graphics'),
      ...(this._pauseButtonParts || [])
    ]);
    const scaleTargets = popTargets.filter(o => typeof o.setScale === 'function' && !noScaleSet.has(o));

    this.pauseContainer.setAlpha(1);
    const scaleHolder = { s: 0.85 };
    this.tweens.add({
      targets: scaleHolder,
      s: 1,
      duration: 220,
      ease: 'Back.easeOut',
      onUpdate: () => {
        scaleTargets.forEach(o => {
          if (o._popBaseX === undefined) { o._popBaseX = o.x; o._popBaseY = o.y; }
          o.x = cardCenterX + (o._popBaseX - cardCenterX) * scaleHolder.s;
          o.y = cardCenterY + (o._popBaseY - cardCenterY) * scaleHolder.s;
          o.setScale(scaleHolder.s);
        });
      }
    });
    this.tweens.add({
      targets: popTargets,
      alpha: 1,
      duration: 180,
      ease: 'Sine.easeOut'
    });
  }

  setPauseSaveStatus(text, success) {
    if (!this.pauseSaveStatus || !this.pauseContainer) return;
    this.pauseSaveStatus.setText(text);
    this.pauseSaveStatus.setColor(success ? '#8dffb0' : '#ffd08a');
  }

  // Thông báo nổi ngắn ở giữa màn hình (vd: báo load Cloud Save thành công).
  showToast(text, success = true) {
    const w = this.scale.width;
    const font = 'Arial, Tahoma, sans-serif';

    const bg = this.add.rectangle(w / 2, 70, 10, 40, 0x0b1626, 0.88)
      .setScrollFactor(0).setDepth(500).setStrokeStyle(1, success ? 0x4ee08a : 0xe0a24e, 0.9);
    const txt = this.add.text(w / 2, 70, text, {
      fontFamily: font,
      fontSize: '14px',
      fontStyle: 'bold',
      color: success ? '#8dffb0' : '#ffd08a'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501);

    bg.setSize(txt.width + 36, txt.height + 18);

    this.tweens.add({
      targets: [bg, txt],
      alpha: { from: 0, to: 1 },
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.time.delayedCall(1800, () => {
          this.tweens.add({
            targets: [bg, txt],
            alpha: 0,
            duration: 400,
            ease: 'Sine.easeIn',
            onComplete: () => {
              bg.destroy();
              txt.destroy();
            }
          });
        });
      }
    });
  }

  hidePauseMenu() {
    if (this.pauseContainer) {
      this.pauseContainer.destroy();
      this.pauseContainer = null;
    }
    this.pauseSaveStatus = null;
    this._pauseButtonParts = null;
  }

  // Bấm 1 lần sẽ đổi nút thành "Xác nhận?" để tránh out/reset nhầm, bấm lần 2 mới thực thi.
  confirmResetGame() {
    if (this._confirmingReset) {
      this.hidePauseMenu();
      this.isPaused = false;
      this.scene.restart({ classId: this.classId, difficulty: this.difficulty });
      return;
    }
    this._confirmingReset = true;
    this._confirmingExit = false;
    this.hidePauseMenu();
    this.showPauseMenu();
    this.flashConfirmHint('Bấm CHƠI LẠI lần nữa để xác nhận — mất tiến trình hiện tại!');
  }

  confirmExitGame() {
    if (this._confirmingExit) {
      this.hidePauseMenu();
      this.isPaused = false;
      this.scene.start('TitleScene');
      return;
    }
    this._confirmingExit = true;
    this._confirmingReset = false;
    this.hidePauseMenu();
    this.showPauseMenu();
    this.flashConfirmHint('Bấm THOÁT lần nữa để xác nhận — mất tiến trình hiện tại!');
  }

  flashConfirmHint(text) {
    if (!this.pauseContainer) return;
    const cam = this.cameras.main;
    const hintT = this.add.text(cam.scrollX + cam.width / 2, cam.scrollY + cam.height - 18, text, {
      fontSize: '12px', color: '#ffcc66', fontFamily: 'Segoe UI', align: 'center'
    }).setOrigin(0.5);
    this.pauseContainer.add(hintT);
  }

  exportSaveData() {
    return {
      version: 2,
      classId: this.classId,
      difficulty: this.difficulty,
      timeAlive: this.timeAlive,
      difficultyTimer: this.difficultyTimer,
      enemySpawnTimer: this.enemySpawnTimer,
      lastBossAt: this.lastBossAt || 0,
      kills: this.kills,
      bossKills: this.bossKills,
      chestsOpened: this.chestsOpened,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      killStreak: this.killStreak,
      killStreakTimer: this.killStreakTimer,
      player: {
        x: this.player ? this.player.x : 0,
        y: this.player ? this.player.y : 0
      },
      stats: {
        maxHp: this.stats.maxHp,
        hp: this.stats.hp,
        speed: this.stats.speed,
        damage: this.stats.damage,
        attackSpeed: this.stats.attackSpeed,
        armor: this.stats.armor,
        pickupRange: this.stats.pickupRange,
        xpGain: this.stats.xpGain,
        crit: this.stats.crit,
        area: this.stats.area,
        lifesteal: this.stats.lifesteal
      },
      // Clone để snapshot không bị thay đổi sau khi gửi request.
      weaponLevels: { ...this.weaponLevels },
      ownedPassives: [...this.ownedPassives],
      createdAt: new Date().toISOString()
    };
  }

  applySaveData(saveData) {
    if (!saveData || typeof saveData !== 'object') return false;
    if (saveData.classId && saveData.classId !== this.classId) return false;

    if (saveData.difficulty) this.difficulty = saveData.difficulty;
    if (typeof saveData.timeAlive === 'number') this.timeAlive = Math.max(0, saveData.timeAlive);
    if (typeof saveData.difficultyTimer === 'number') this.difficultyTimer = Math.max(0, saveData.difficultyTimer);
    if (typeof saveData.enemySpawnTimer === 'number') this.enemySpawnTimer = Math.max(0, saveData.enemySpawnTimer);
    if (typeof saveData.lastBossAt === 'number') this.lastBossAt = Math.max(0, saveData.lastBossAt);
    if (typeof saveData.kills === 'number') this.kills = Math.max(0, saveData.kills);
    if (typeof saveData.bossKills === 'number') this.bossKills = Math.max(0, saveData.bossKills);
    if (typeof saveData.chestsOpened === 'number') this.chestsOpened = Math.max(0, saveData.chestsOpened);
    if (typeof saveData.level === 'number') this.level = Math.max(1, saveData.level);
    if (typeof saveData.xp === 'number') this.xp = Math.max(0, saveData.xp);
    if (typeof saveData.xpToNext === 'number') this.xpToNext = Math.max(1, saveData.xpToNext);
    if (typeof saveData.killStreak === 'number') this.killStreak = Math.max(0, saveData.killStreak);
    if (typeof saveData.killStreakTimer === 'number') this.killStreakTimer = Math.max(0, saveData.killStreakTimer);

    if (saveData.stats && typeof saveData.stats === 'object') {
      this.stats = { ...this.stats, ...saveData.stats };
      this.stats.maxHp = Math.max(1, Number(this.stats.maxHp) || 1);
      this.stats.hp = Phaser.Math.Clamp(Number(this.stats.hp) || 0, 0, this.stats.maxHp);
    }

    // Save là snapshot hoàn chỉnh: thay thế, KHÔNG merge với trạng thái hiện tại.
    if (saveData.weaponLevels && typeof saveData.weaponLevels === 'object') {
      this.weaponLevels = { ...saveData.weaponLevels };
    }
    if (Array.isArray(saveData.ownedPassives)) {
      this.ownedPassives = [...new Set(saveData.ownedPassives)];
    }

    this.weaponCooldowns = {};
    Object.keys(this.weaponLevels).forEach(id => { this.weaponCooldowns[id] = 0; });

    if (saveData.player && this.player) {
      const x = Number(saveData.player.x);
      const y = Number(saveData.player.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        this.player.setPosition(Phaser.Math.Clamp(x, 0, this.worldSize), Phaser.Math.Clamp(y, 0, this.worldSize));
        this.player.setVelocity(0, 0);
      }
    }

    this.isGameOver = false;
    this.isLevelingUp = false;
    this.isRollingChest = false;
    this.isPaused = false;
    this.physics.resume();
    this.setJoyZoneVisible(true);
    this.updateSkillPanel();
    this.updateUI();
    return true;
  }

  gameOver() {
    this.isGameOver = true;
    this.physics.pause();
    this.setJoyZoneVisible(false);
    if (typeof GameAudio !== 'undefined') GameAudio.stopMusic();
    GameAudio.gameOver();
    const seconds = Math.floor(this.timeAlive / 1000);
    const old = parseInt(localStorage.getItem('vs_highscore') || '0');
    if (seconds > old) localStorage.setItem('vs_highscore', seconds);

    // Theo dõi các class đã từng chơi (lưu local, không cần đăng nhập) để tính
    // thành tựu "Toàn Năng" (chơi thử cả 4 class).
    let playedClasses = [];
    try {
      playedClasses = JSON.parse(localStorage.getItem('vs_classes_played') || '[]');
    } catch (e) {
      playedClasses = [];
    }
    if (!playedClasses.includes(this.classId)) playedClasses.push(this.classId);
    localStorage.setItem('vs_classes_played', JSON.stringify(playedClasses));
    const allClassesPlayed = Object.keys(CLASSES).every(id => playedClasses.includes(id));

    const resultData = {
      timeAlive: seconds,
      kills: this.kills,
      level: this.level,
      className: this.classData.name,
      bossKills: this.bossKills,
      chestsOpened: this.chestsOpened,
      difficulty: this.difficulty,
      allClassesPlayed
    };

    this.scene.start('ResultScene', resultData);
  }
  shutdown() {
    if (this.pauseButton) {
      this.pauseButton.destroy();
      this.pauseButton = null;
    }
    if (this.pauseContainer) {
      this.pauseContainer.destroy();
      this.pauseContainer = null;
    }
    window.currentGameScene = null;
  }
}
