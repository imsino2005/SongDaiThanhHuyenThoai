class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.classId = data.classId || 'archer';
    this.classData = CLASSES[this.classId];
    this.difficulty = data.difficulty || 'normal';
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
    // Decorative props
    for (let i = 0; i < 80; i++) {
      const dx = Phaser.Math.Between(40, this.worldSize - 40);
      const dy = Phaser.Math.Between(40, this.worldSize - 40);
      if (Math.random() < 0.6) {
        this.add.image(dx, dy, 'deco_grass').setDepth(1).setAlpha(0.7).setScale(Phaser.Math.FloatBetween(0.8, 1.4));
      } else {
        this.add.image(dx, dy, 'deco_rune').setDepth(1).setAlpha(0.35).setScale(Phaser.Math.FloatBetween(0.7, 1.2));
      }
    }

    // Groups
    this.enemies = this.physics.add.group();
    this.projectiles = this.physics.add.group();
    this.gems = this.physics.add.group();
    this.magnets = this.physics.add.group();
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
      pickupRange: 90,
      xpGain: 1,
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
    this.updateSkillPanel();

    window.currentGameScene = this;

    // Player subtle glow (class color)
    try {
      if (this.player.preFX) {
        this.player.preFX.addGlow(this.classData.color, 1.5, 0, false, 0.08, 6);
      }
    } catch (e) {}

    this.setJoyZoneVisible(true);

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

    this.skillPanelBg = this.add.rectangle(w - 16 - 282, h - 16 - 164, 282, 164, 0x08111f, 0.82)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(100).setStrokeStyle(1, 0x5d7cc3, 0.8);
    this.skillPanelTitle = this.add.text(w - 16 - 14 - 282, h - 16 - 156, 'SKILL PANEL', {
      fontSize: '14px', color: '#b7d7ff', fontFamily: 'Segoe UI', fontStyle: 'bold'
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(102);
    this.skillPanelContainer = this.add.container(w - 16 - 272, h - 16 - 130).setScrollFactor(0).setDepth(102);

    this.timeText = this.add.text(w - 16, 16, '0:00', {
      fontSize: '24px', color: '#fff', fontFamily: 'Segoe UI', fontStyle: 'bold'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102);

    this.killText = this.add.text(w - 16, 48, 'Kills: 0', {
      fontSize: '14px', color: '#ff9999', fontFamily: 'Segoe UI'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102);

    this.classText = this.add.text(w - 16, 70, this.classData.name, {
      fontSize: '14px', color: '#aaccff', fontFamily: 'Segoe UI'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102);

    // Aim mode indicator (toggle bằng Shift trái)
    this.aimText = this.add.text(w - 16, 92, 'Aim: AUTO (Shift)', {
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

    // Player
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
    this.updateHpRegen(delta);
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
    // Lightweight trail: small fading circles along path via timer
    bullet.trailEvent = this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => {
        if (!bullet.active) {
          if (bullet.trailEvent) bullet.trailEvent.remove(false);
          return;
        }
        const col = tint || 0xffffff;
        const p = this.add.circle(bullet.x, bullet.y, vfx === 'fire' ? 5 : 3, col, 0.55).setDepth(5);
        this.tweens.add({
          targets: p, alpha: 0, scale: 0.2, duration: 200,
          onComplete: () => p.destroy()
        });
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
    const typeKey = Phaser.Utils.Array.GetRandom(pool);
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
      if (!gem.active) return;
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

    let gained = 0;
    this.gems.getChildren().forEach(gem => {
      if (!gem.active) return;
      gained += gem.xpValue;
      this.xpParticles.emitParticleAt(gem.x, gem.y, 4);
      gem.destroy();
    });
    if (gained > 0) {
      this.xp += gained * this.stats.xpGain;
      if (this.xp >= this.xpToNext) this.levelUp();
    }
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
    this.showLevelUpUI();
  }

  showLevelUpUI() {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;

    this.levelUpContainer = this.add.container(0, 0).setDepth(200);

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
      const card = this.add.rectangle(cx, y, 540, 90, bg)
        .setStrokeStyle(2, stroke)
        .setInteractive({ useHandCursor: true });

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
      const allObjs = [card, icon, label, desc, ...reqItems];
      allObjs.forEach(o => { o.x += 80; o.setAlpha(0); });
      this.levelUpContainer.add(allObjs);
      this.tweens.add({
        targets: allObjs,
        x: '-=80', alpha: 1, duration: 280, delay: i * 70, ease: 'Cubic.Out'
      });

      card.on('pointerover', () => { card.setFillStyle(isEvo ? 0x3a3060 : 0x2a2a4e); card.setScale(1.02); });
      card.on('pointerout', () => { card.setFillStyle(bg); card.setScale(1); });
      card.on('pointerdown', () => {
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
    } else if (choice.type === 'stat') {
      if (choice.id === 'damage') this.stats.damage *= 1.18;
      if (choice.id === 'hp') {
        this.stats.maxHp += 25;
        this.stats.hp += 25;
      }
    }
    this.updateWeaponIcons();
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

    const overlay = this.add.rectangle(cx, cy, cam.width + 20, cam.height + 20, 0x000000, 0.78);
    this.chestRollContainer.add(overlay);

    const title = this.add.text(cx, cy - 165, '✦ RƯƠNG BOSS — CHỌN 1 PASSIVE ✦', {
      fontSize: '26px', color: '#ffd166', fontStyle: 'bold', fontFamily: 'Segoe UI'
    }).setOrigin(0.5).setAlpha(0);
    this.chestRollContainer.add(title);
    this.tweens.add({ targets: title, alpha: 1, y: cy - 155, duration: 250, ease: 'Back.Out' });

    const choices = this.generateChestPassiveChoices();
    const startY = cy - 60;
    choices.forEach((choice, i) => {
      const y = startY + i * 100;
      const card = this.add.rectangle(cx, y, 540, 90, 0x241a0d)
        .setStrokeStyle(2, 0xffd166)
        .setInteractive({ useHandCursor: true });

      const iconKey = choice.type === 'passive' ? 'icon_pas_' + choice.id : null;
      let icon;
      if (iconKey && this.textures.exists(iconKey)) {
        icon = this.add.image(cx - 240, y, iconKey).setDisplaySize(44, 44);
      } else {
        icon = this.add.rectangle(cx - 240, y, 44, 44, 0x6b4423);
      }

      const label = this.add.text(cx - 205, y - 16, choice.title, {
        fontSize: '16px', color: '#ffffff', fontStyle: 'bold', fontFamily: 'Segoe UI'
      });
      const desc = this.add.text(cx - 205, y + 8, choice.desc || '', {
        fontSize: '12px', color: '#c9a876', fontFamily: 'Segoe UI', wordWrap: { width: 400 }
      });

      const allObjs = [card, icon, label, desc];
      allObjs.forEach(o => { o.x += 80; o.setAlpha(0); });
      this.chestRollContainer.add(allObjs);
      this.tweens.add({
        targets: allObjs, x: '-=80', alpha: 1, duration: 280, delay: i * 70, ease: 'Cubic.Out'
      });

      card.on('pointerover', () => { card.setFillStyle(0x3a2a12); card.setScale(1.02); });
      card.on('pointerout', () => { card.setFillStyle(0x241a0d); card.setScale(1); });
      card.on('pointerdown', () => {
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
    this.xpBar.width = 232 * xpRatio;
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
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy()
    });
  }

  updateSkillPanel() {
    if (!this.skillPanelContainer) return;
    this.skillPanelContainer.removeAll(true);

    const rowY = 0;
    const iconSize = 30;
    const padding = 8;
    const maxIcons = 7;
    const entries = [];

    const weaponIds = Object.keys(this.weaponLevels);
    weaponIds.forEach((id, index) => {
      if (index >= maxIcons) return;
      const key = 'icon_' + id;
      const icon = this.textures.exists(key)
        ? this.add.image(index * (iconSize + padding), rowY, key).setDisplaySize(iconSize, iconSize)
        : this.add.rectangle(index * (iconSize + padding), rowY, iconSize, iconSize, 0x22334a);
      icon.setOrigin(0, 0);
      this.skillPanelContainer.add(icon);
      const lv = this.add.text(index * (iconSize + padding) + iconSize / 2, rowY + iconSize + 4, 'L' + this.weaponLevels[id], {
        fontSize: '10px', color: '#d7d7ff', fontFamily: 'Segoe UI', fontStyle: 'bold'
      }).setOrigin(0.5, 0);
      this.skillPanelContainer.add(lv);
      entries.push(icon, lv);
    });

    if (this.ownedPassives.length > 0 && weaponIds.length < maxIcons) {
      const offset = weaponIds.length * (iconSize + padding);
      this.ownedPassives.slice(0, maxIcons - weaponIds.length).forEach((id, index) => {
        const key = 'icon_pas_' + id;
        const icon = this.textures.exists(key)
          ? this.add.image(offset + index * (iconSize + padding), rowY, key).setDisplaySize(iconSize, iconSize)
          : this.add.rectangle(offset + index * (iconSize + padding), rowY, iconSize, iconSize, 0x22334a);
        icon.setOrigin(0, 0);
        this.skillPanelContainer.add(icon);
        const label = this.add.text(offset + index * (iconSize + padding) + iconSize / 2, rowY + iconSize + 4, 'P', {
          fontSize: '10px', color: '#a4ff9c', fontFamily: 'Segoe UI', fontStyle: 'bold'
        }).setOrigin(0.5, 0);
        this.skillPanelContainer.add(label);
        entries.push(icon, label);
      });
    }

    if (entries.length === 0) {
      const hint = this.add.text(0, rowY, 'No skills equipped yet', {
        fontSize: '12px', color: '#8a9ab0', fontFamily: 'Segoe UI'
      }).setOrigin(0, 0);
      this.skillPanelContainer.add(hint);
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
    } else {
      this.physics.resume();
      this.setJoyZoneVisible(true);
      this.hidePauseMenu();
    }
  }

  // ========== MENU TẠM DỪNG (ESC / P) ==========
  showPauseMenu() {
    // Dùng toạ độ theo camera (world-space), giống UI level-up/chest-roll đã hoạt động ổn định,
    // tránh lỗi hit-area bị lệch khi mix scrollFactor(0) bên trong Container.
    const cam = this.cameras.main;
    const w = cam.width;
    const h = cam.height;
    const topY = cam.scrollY;
    const cx = cam.scrollX + w / 2;

    this.pauseContainer = this.add.container(0, 0).setDepth(300);

    const overlay = this.add.rectangle(cx, topY + h / 2, w, h, 0x000000, 0.82);
    this.pauseContainer.add(overlay);

    const title = this.add.text(cx, topY + 46, 'TẠM DỪNG', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold', fontFamily: 'Segoe UI'
    }).setOrigin(0.5);
    this.pauseContainer.add(title);

    const subInfo = this.add.text(cx, topY + 76,
      `${this.classData.name}  •  Lv ${this.level}  •  Kills ${this.kills}  •  ${Math.floor(this.timeAlive / 60000)}:${Math.floor((this.timeAlive / 1000) % 60).toString().padStart(2, '0')}`,
      { fontSize: '13px', color: '#99aacc', fontFamily: 'Segoe UI' }
    ).setOrigin(0.5);
    this.pauseContainer.add(subInfo);

    // ---- Danh sách kỹ năng đang có (weapon + passive) ----
    const listLabel = this.add.text(cx, topY + 108, 'Kỹ năng hiện có:', {
      fontSize: '14px', color: '#ffdd88', fontStyle: 'bold', fontFamily: 'Segoe UI'
    }).setOrigin(0.5);
    this.pauseContainer.add(listLabel);

    const iconSize = 40;
    const cellW = 84;
    const cols = Math.max(3, Math.min(7, Math.floor((w - 40) / cellW)));
    const weaponIds = Object.keys(this.weaponLevels);
    const skillEntries = weaponIds.map(id => ({
      kind: 'weapon', id, key: 'icon_' + id,
      name: getWeaponName(id), sub: 'Lv ' + this.weaponLevels[id]
    })).concat(this.ownedPassives.map(id => ({
      kind: 'passive', id, key: 'icon_pas_' + id,
      name: getPassiveName(id), sub: 'Passive'
    })));

    const gridTop = topY + 132;
    const gridW = cols * cellW;
    const gridX0 = cx - gridW / 2 + cellW / 2;

    if (skillEntries.length === 0) {
      const hint = this.add.text(cx, gridTop + 10, 'Chưa có kỹ năng nào', {
        fontSize: '12px', color: '#8a9ab0', fontFamily: 'Segoe UI'
      }).setOrigin(0.5);
      this.pauseContainer.add(hint);
    } else {
      skillEntries.forEach((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridX0 + col * cellW;
        const y = gridTop + row * 66;

        const bg = this.add.rectangle(x, y, iconSize + 8, iconSize + 8, 0x1a1a2e)
          .setStrokeStyle(1, s.kind === 'passive' ? 0x44aa66 : 0x555577);
        this.pauseContainer.add(bg);

        const icon = this.textures.exists(s.key)
          ? this.add.image(x, y, s.key).setDisplaySize(iconSize, iconSize)
          : this.add.rectangle(x, y, iconSize, iconSize, 0x333355);
        this.pauseContainer.add(icon);

        const nameT = this.add.text(x, y + iconSize / 2 + 8, s.name, {
          fontSize: '9px', color: '#d7d7ff', fontFamily: 'Segoe UI', align: 'center', wordWrap: { width: cellW - 4 }
        }).setOrigin(0.5, 0);
        this.pauseContainer.add(nameT);

        const subT = this.add.text(x, y + iconSize / 2 + 22, s.sub, {
          fontSize: '9px', color: s.kind === 'passive' ? '#a4ff9c' : '#88ccff', fontFamily: 'Segoe UI'
        }).setOrigin(0.5, 0);
        this.pauseContainer.add(subT);
      });
    }

    const rows = Math.max(1, Math.ceil(skillEntries.length / cols));
    const listBottom = gridTop + rows * 66 + 10;

    // ---- Nút: Tiếp tục / Chơi lại / Thoát ----
    const btnY = Math.min(topY + h - 50, listBottom + 40);
    const makeBtn = (x, label, bg, hoverBg, onClick) => {
      const btn = this.add.rectangle(x, btnY, 150, 46, bg)
        .setStrokeStyle(2, 0xffffff, 0.25)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, btnY, label, {
        fontSize: '15px', color: '#ffffff', fontStyle: 'bold', fontFamily: 'Segoe UI'
      }).setOrigin(0.5);
      btn.on('pointerover', () => btn.setFillStyle(hoverBg));
      btn.on('pointerout', () => btn.setFillStyle(bg));
      btn.on('pointerdown', onClick);
      this.pauseContainer.add([btn, txt]);
      return btn;
    };

    makeBtn(cx - 170, 'TIẾP TỤC', 0x2a5a3a, 0x36774a, () => this.togglePause());
    makeBtn(cx, 'CHƠI LẠI', 0x5a4a1a, 0x77641f, () => this.confirmResetGame());
    makeBtn(cx + 170, 'THOÁT', 0x5a1a1a, 0x772222, () => this.confirmExitGame());
  }

  hidePauseMenu() {
    if (this.pauseContainer) {
      this.pauseContainer.destroy();
      this.pauseContainer = null;
    }
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
      classId: this.classId,
      difficulty: this.difficulty,
      timeAlive: this.timeAlive,
      kills: this.kills,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
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
      weaponLevels: this.weaponLevels,
      ownedPassives: this.ownedPassives,
      createdAt: new Date().toISOString()
    };
  }

  applySaveData(saveData) {
    if (!saveData || typeof saveData !== 'object') return false;
    if (saveData.classId && saveData.classId !== this.classId) return false;
    if (saveData.difficulty) this.difficulty = saveData.difficulty;
    if (typeof saveData.level === 'number') this.level = saveData.level;
    if (typeof saveData.xp === 'number') this.xp = saveData.xp;
    if (typeof saveData.xpToNext === 'number') this.xpToNext = saveData.xpToNext;
    if (saveData.stats) {
      this.stats = { ...this.stats, ...saveData.stats };
      if (this.stats.hp > this.stats.maxHp) this.stats.hp = this.stats.maxHp;
    }
    if (saveData.weaponLevels) this.weaponLevels = { ...this.weaponLevels, ...saveData.weaponLevels };
    if (Array.isArray(saveData.ownedPassives)) {
      this.ownedPassives = Array.from(new Set([...this.ownedPassives, ...saveData.ownedPassives]));
    }
    this.updateSkillPanel();
    return true;
  }

  gameOver() {
    this.isGameOver = true;
    this.physics.pause();
    this.setJoyZoneVisible(false);
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

    this.scene.start('ResultScene', {
      timeAlive: seconds,
      kills: this.kills,
      level: this.level,
      className: this.classData.name,
      bossKills: this.bossKills,
      chestsOpened: this.chestsOpened,
      difficulty: this.difficulty,
      allClassesPlayed
    });
  }
}
