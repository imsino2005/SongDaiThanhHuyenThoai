class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.createAllTextures();
  }

  createAllTextures() {
    this.makeMapTiles();
    // ========== PLAYER CHARACTERS ==========
    this.makeArcher();
    this.makeSwordsman();
    this.makeEngineer();
    this.makeMage();
    this.makeCharAnimFrames();

    // ========== ENEMY / BOSS ==========
    this.makeEnemy();
    this.makeBoss();
    this.makeEnemyVariants();
    this.makeBossVariants();
    this.makeEnemyBolt();

    // ========== PROJECTILES ==========
    this.makeBullet();
    this.makeArrow();
    this.makeMagicOrb();
    this.makeFireball();
    this.makeIceProj();
    this.makeLightningProj();
    this.makePlasma();
    this.makeSlash();
    this.makeBloodSlash();
    this.makeWaveRing();
    this.makeSwordBlade();

    // ========== PICKUPS ==========
    this.makeGem();
    this.makeMagnet();
    this.makeChest();

    // ========== WEAPON ICONS (32x32) ==========
    const weaponIds = [
      'wooden_bow','crossbow','twin_bow','explosive_bow','storm_bow','sniper_bow','fan_shot',
      'iron_sword','greatsword','dual_blades','spinning_blade','blood_sword','shockwave','blade_wall',
      'drone','turret_kit','mine_layer','repair_bot','tesla_coil','mortar','shield_generator',
      'magic_missile','fireball','lightning_orb','ice_shard','arcane_aura','meteor_seed','frost_nova',
      'phantom_bow','heavy_crossbow','heavens_rain','dragon_arrow','tempest_bow','death_sniper','hurricane_fan',
      'excalibur','titan_blade','blade_dance','blade_cyclone','crimson_reaper','quake_slash','iron_fortress',
      'assault_drone_swarm','fortress_turret','plasma_mine','mega_repair_bot','storm_coil','siege_mortar','aegis_generator',
      'arcane_barrage','meteor','chain_thunder','absolute_zero','void_zone','armageddon','glacier'
    ];
    weaponIds.forEach(id => this.makeWeaponIcon(id));

    // ========== PASSIVE ICONS ==========
    Object.keys(PASSIVES).forEach(id => this.makePassiveIcon(id));

    // Particle
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.destroy();
  }

  // ----- MAP TILES -----
  makeMapTiles() {
    // floor tile
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x12121f, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x1c1c30, 0.8);
    g.strokeRect(0.5, 0.5, 63, 63);
    // subtle cracks
    g.lineStyle(1, 0x2a2a40, 0.4);
    g.lineBetween(8, 20, 28, 18);
    g.lineBetween(40, 44, 55, 50);
    g.fillStyle(0x16162a, 0.5);
    g.fillCircle(48, 16, 3);
    g.fillCircle(12, 50, 2);
    g.generateTexture('tile_floor', 64, 64);
    g.destroy();

    // dark stone variant
    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x0e0e18, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x222238, 0.6);
    g.strokeRect(1, 1, 62, 62);
    g.fillStyle(0x1a1a28, 1);
    g.fillRect(10, 10, 20, 14);
    g.fillRect(36, 34, 18, 16);
    g.generateTexture('tile_stone', 64, 64);
    g.destroy();

    // grass tuft deco
    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x1a3a22, 0.9);
    g.fillTriangle(8, 16, 4, 4, 12, 4);
    g.fillTriangle(14, 16, 10, 2, 18, 6);
    g.fillTriangle(6, 16, 2, 8, 10, 8);
    g.generateTexture('deco_grass', 20, 18);
    g.destroy();

    // rune glow deco
    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.lineStyle(2, 0x6c5ce7, 0.7);
    g.strokeCircle(12, 12, 8);
    g.lineStyle(1, 0xa99bff, 0.5);
    g.lineBetween(12, 4, 12, 20);
    g.lineBetween(4, 12, 20, 12);
    g.generateTexture('deco_rune', 24, 24);
    g.destroy();
  }

  makeCharAnimFrames() {
    // Simple bob frames: duplicate char textures scaled slightly for "run" illusion
    // We generate run overlay indicators
    const classes = ['archer', 'swordsman', 'engineer', 'mage'];
    classes.forEach(id => {
      const key = 'char_' + id;
      // shadow under feet
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(16, 8, 28, 12);
      g.generateTexture('shadow_' + id, 32, 16);
      g.destroy();
    });
  }

  // ----- CHARACTERS -----
  makeClassChar(id, drawFn) {
    const states = ['idle', 'run', 'attack', 'hit', 'death', 'victory'];
    states.forEach(state => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      drawFn(g, state);
      g.generateTexture(`char_${id}_${state}`, 44, 48);
      g.destroy();
    });
    const shadow = this.make.graphics({ x: 0, y: 0, add: false });
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillEllipse(16, 8, 28, 12);
    shadow.generateTexture(`shadow_${id}`, 32, 16);
    shadow.destroy();
  }

  makeArcher() {
    this.makeClassChar('archer', (g, state) => {
      const bodyY = state === 'run' ? 20 : 18;
      const skinColor = 0xf0c8a0;
      const cloak = 0x3a7a32;
      const body = 0x2d5a27;

      g.fillStyle(body, 1);
      g.fillRoundedRect(10, bodyY, 20, 22, 4);
      if (state === 'attack') g.fillRoundedRect(10, bodyY - 2, 20, 24, 4);

      g.fillStyle(skinColor, 1);
      g.fillCircle(20, 12, 9);

      g.fillStyle(cloak, 1);
      g.fillTriangle(8, 14, 20, 2, 32, 14);
      if (state === 'victory') {
        g.lineStyle(2, 0xffdd88, 1);
        g.strokeTriangle(8, 14, 20, 2, 32, 14);
      }

      g.lineStyle(3, 0x8b5a2b, 1);
      g.strokeCircle(34, 22, 10);
      g.lineBetween(34, 12, 34, 32);
      if (state === 'attack') {
        g.lineStyle(2, 0xffee88, 1);
        g.lineBetween(6, 12, 28, 12);
      }

      g.fillStyle(0x111111, 1);
      g.fillCircle(17, 11, 1.5);
      g.fillCircle(23, 11, 1.5);
      if (state === 'hit') {
        g.fillStyle(0xff4444, 0.2);
        g.fillCircle(20, 18, 12);
      }
      if (state === 'death') {
        g.fillStyle(0x000000, 0.5);
        g.fillRect(12, 4, 20, 18);
      }
    });
  }

  makeSwordsman() {
    this.makeClassChar('swordsman', (g, state) => {
      const body = 0x8b2020;
      const skin = 0xf0c8a0;
      const metal = 0x555555;

      g.fillStyle(body, 1);
      g.fillRoundedRect(10, 18, 20, 24, 3);
      if (state === 'run') g.fillRoundedRect(10, 20, 20, 22, 3);

      g.fillStyle(skin, 1);
      g.fillCircle(20, 12, 9);

      g.fillStyle(metal, 1);
      g.fillTriangle(9, 14, 20, 1, 31, 14);
      g.fillRect(12, 8, 16, 6);
      if (state === 'victory') {
        g.lineStyle(2, 0xffdd88, 1);
        g.strokeTriangle(9, 14, 20, 1, 31, 14);
      }

      g.fillStyle(0xccccdd, 1);
      g.fillRect(33, 8, 4, 28);
      g.fillStyle(0x8b5a2b, 1);
      g.fillRect(31, 34, 8, 4);
      if (state === 'attack') {
        g.lineStyle(3, 0xffffff, 0.9);
        g.lineBetween(34, 12, 44, 22);
      }

      g.fillStyle(0x111111, 1);
      g.fillCircle(17, 12, 1.5);
      g.fillCircle(23, 12, 1.5);
      if (state === 'hit') {
        g.fillStyle(0xff4444, 0.2);
        g.fillCircle(20, 20, 12);
      }
      if (state === 'death') {
        g.fillStyle(0x111111, 1);
        g.fillTriangle(16, 6, 20, 12, 24, 6);
      }
    });
  }

  makeEngineer() {
    this.makeClassChar('engineer', (g, state) => {
      const coat = 0x2a4a6a;
      const skin = 0xf0c8a0;
      const glow = 0x44aaff;

      g.fillStyle(coat, 1);
      g.fillRoundedRect(10, 18, 20, 24, 3);
      if (state === 'run') g.fillRoundedRect(10, 20, 20, 22, 3);

      g.fillStyle(skin, 1);
      g.fillCircle(20, 12, 9);

      g.fillStyle(glow, 0.9);
      g.fillCircle(16, 11, 4);
      g.fillCircle(24, 11, 4);
      g.lineStyle(2, 0x222222, 1);
      g.strokeCircle(16, 11, 4);
      g.strokeCircle(24, 11, 4);
      if (state === 'attack') {
        g.lineStyle(2, glow, 0.9);
        g.lineBetween(10, 10, 30, 12);
      }

      g.fillStyle(0xaaaaaa, 1);
      g.fillRect(32, 16, 5, 18);
      g.fillStyle(0x888888, 1);
      g.fillCircle(34.5, 14, 5);

      g.lineStyle(2, glow, 1);
      g.lineBetween(20, 3, 20, 0);
      g.fillStyle(0xff4444, 1);
      g.fillCircle(20, 0, 2);
      if (state === 'victory') {
        g.fillStyle(0x66ffcc, 0.23);
        g.fillCircle(20, 0, 6);
      }
      if (state === 'hit') {
        g.fillStyle(0xff4444, 0.2);
        g.fillCircle(20, 20, 12);
      }
    });
  }

  makeMage() {
    this.makeClassChar('mage', (g, state) => {
      const robe = 0x5a2a8a;
      const skin = 0xf0c8a0;
      const hat = 0x3a1a6a;
      const orb = 0x88aaff;

      g.fillStyle(robe, 1);
      g.fillRoundedRect(8, 18, 24, 26, 5);
      if (state === 'run') g.fillRoundedRect(8, 20, 24, 24, 5);

      g.fillStyle(skin, 1);
      g.fillCircle(20, 13, 9);

      g.fillStyle(hat, 1);
      g.fillTriangle(6, 16, 20, -2, 34, 16);
      g.fillStyle(0xffdd44, 1);
      g.fillCircle(20, 4, 3);
      if (state === 'attack') {
        g.lineStyle(2, orb, 1);
        g.lineBetween(8, 14, 32, 14);
      }

      g.fillStyle(0x8b5a2b, 1);
      g.fillRect(34, 10, 3, 30);
      g.fillStyle(orb, 1);
      g.fillCircle(35.5, 8, 6);
      g.fillStyle(0x111111, 1);
      g.fillCircle(17, 13, 1.5);
      g.fillCircle(23, 13, 1.5);
      if (state === 'hit') {
        g.fillStyle(0x88ddff, 0.2);
        g.fillCircle(20, 20, 12);
      }
      if (state === 'victory') {
        g.fillStyle(0x88ddff, 0.25);
        g.fillCircle(20, 8, 8);
      }
    });
  }

  // ====================== CREATURE SHADING HELPERS ======================
  // Vẽ khối cầu có bóng đổ + highlight bóng loáng, thay vì 1 khối màu phẳng.
  _sphereBody(g, cx, cy, r, darkColor, midColor, highlightAlpha = 0.22) {
    g.fillStyle(darkColor, 1);
    g.fillCircle(cx, cy, r);
    g.fillStyle(midColor, 1);
    g.fillCircle(cx, cy - r * 0.05, r * 0.8);
    g.fillStyle(0xffffff, highlightAlpha);
    g.fillCircle(cx - r * 0.26, cy - r * 0.3, r * 0.34);
    g.lineStyle(1.5, 0x000000, 0.4);
    g.strokeCircle(cx, cy, r);
  }
  // Mắt sáng có quầng glow (giả gradient bằng nhiều vòng alpha giảm dần)
  _glowEye(g, x, y, r, color) {
    g.fillStyle(color, 0.16);
    g.fillCircle(x, y, r * 2.4);
    g.fillStyle(color, 0.32);
    g.fillCircle(x, y, r * 1.6);
    g.fillStyle(color, 1);
    g.fillCircle(x, y, r);
    g.fillStyle(0x110a05, 1);
    g.fillCircle(x, y, r * 0.42);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(x - r * 0.28, y - r * 0.28, r * 0.22);
  }
  // Viền sáng nhẹ dọc mép khối vuông (dùng cho quái/boss dạng hộp)
  _boxHighlight(g, x, y, w, h, radius, color) {
    g.lineStyle(2, color, 0.35);
    g.strokeRoundedRect(x, y, w, h * 0.45, radius);
  }

  makeEnemy() {
    // Grunt: quái quỷ đỏ máu, có sừng nhỏ + mắt phát sáng + răng nanh sắc
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // Sừng
    g.fillStyle(0x5a0e0e, 1);
    g.fillTriangle(7, 6, 5, 0, 10, 7);
    g.fillTriangle(21, 6, 23, 0, 18, 7);
    this._sphereBody(g, 14, 15, 12, 0x5c0f0f, 0xcc2222);
    // Vằn da tối
    g.lineStyle(1.2, 0x8b1a1a, 0.5);
    g.beginPath(); g.arc(14, 15, 9, 0.3, 1.3, false); g.strokePath();
    // Mắt phát sáng
    this._glowEye(g, 10, 13, 2.4, 0xffee44);
    this._glowEye(g, 18, 13, 2.4, 0xffee44);
    // Răng nanh
    g.fillStyle(0xfffdf0, 1);
    g.fillTriangle(11, 20, 12.5, 25.5, 14, 20);
    g.fillTriangle(14, 20, 15.5, 25.5, 17, 20);
    g.lineStyle(1, 0x000000, 0.3);
    g.strokeTriangle(11, 20, 12.5, 25.5, 14, 20);
    g.strokeTriangle(14, 20, 15.5, 25.5, 17, 20);
    g.generateTexture('enemy', 28, 28);
    g.destroy();
  }

  makeBoss() {
    // Boss chung (dự phòng) — quỷ tím có vương miện gai
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x2a0630, 1);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      g.fillTriangle(24, 24, 24 + Math.cos(a) * 26, 24 + Math.sin(a) * 26, 24 + Math.cos(a + 0.35) * 20, 24 + Math.sin(a + 0.35) * 20);
    }
    this._sphereBody(g, 24, 25, 20, 0x4a0a4a, 0xaa22aa, 0.2);
    this._glowEye(g, 16, 20, 3.8, 0xff44cc);
    this._glowEye(g, 32, 20, 3.8, 0xff44cc);
    g.fillStyle(0xfff6ff, 1);
    g.fillTriangle(17, 31, 24, 42, 22, 31);
    g.fillTriangle(31, 31, 24, 42, 26, 31);
    g.generateTexture('boss', 48, 48);
    g.destroy();
  }

  // ====================== ENEMY VARIANTS ======================
  // Quái thường 'enemy' (grunt) đã có ở makeEnemy(). Thêm 4 biến thể khác nhau
  // về hình dáng/màu để người chơi phân biệt được ngay khi nhìn — mỗi loại giờ có
  // shading, viền outline và glow mắt riêng để nhìn "có khối" thay vì phẳng.
  makeEnemyVariants() {
    // --- FAST: Bat, nhỏ, cánh nhọn, thân thon (lao thẳng vào người chơi) ---
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    // Cánh
    g.fillStyle(0x1c0630, 0.9);
    g.fillTriangle(11, 8, 0, 4, 9, 16);
    g.fillTriangle(11, 8, 24, 4, 13, 16);
    g.lineStyle(1, 0x8a2be2, 0.5);
    g.strokeTriangle(11, 8, 0, 4, 9, 16);
    g.strokeTriangle(11, 8, 24, 4, 13, 16);
    // Thân
    g.fillStyle(0x1a0538, 1);
    g.fillTriangle(11, 1, 1, 21, 21, 21);
    g.fillStyle(0x8a2be2, 1);
    g.fillTriangle(11, 5, 5, 18, 17, 18);
    g.fillStyle(0xffffff, 0.16);
    g.fillTriangle(11, 6, 8, 12, 13, 12);
    this._glowEye(g, 8, 13, 1.8, 0xffee44);
    this._glowEye(g, 14, 13, 1.8, 0xffee44);
    g.generateTexture('enemy_fast', 22, 22);
    g.destroy();

    // --- TANK: Ogre, to, vuông vức, giáp da dày, máu trâu ---
    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x0e2010, 1);
    g.fillRoundedRect(1, 5, 38, 34, 9);
    g.fillStyle(0x1a3a1a, 1);
    g.fillRoundedRect(4, 8, 32, 28, 8);
    g.fillStyle(0x3b6b3b, 1);
    g.fillRoundedRect(7, 11, 26, 22, 6);
    // Highlight mảng sáng phía trên
    g.fillStyle(0xffffff, 0.1);
    g.fillRoundedRect(9, 12, 22, 8, 4);
    // Đường giáp/sẹo
    g.lineStyle(1.4, 0x1a3a1a, 0.6);
    g.beginPath(); g.moveTo(10, 16); g.lineTo(30, 20); g.strokePath();
    this._glowEye(g, 15, 20, 3, 0xffee44);
    this._glowEye(g, 25, 20, 3, 0xffee44);
    g.fillStyle(0xfffdf0, 1);
    g.fillTriangle(14, 30, 17, 39, 20, 30);
    g.fillTriangle(20, 30, 23, 39, 26, 30);
    g.lineStyle(2, 0x0e2010, 0.6);
    g.strokeRoundedRect(1, 5, 38, 34, 9);
    g.generateTexture('enemy_tank', 40, 40);
    g.destroy();

    // --- RANGED: Cultist, tím, áo choàng, đứng bắn từ xa ---
    g = this.make.graphics({ x: 0, y: 0, add: false });
    // Áo choàng (tam giác rộng phía dưới)
    g.fillStyle(0x2a0e3a, 1);
    g.fillTriangle(13, 8, 0, 26, 26, 26);
    this._sphereBody(g, 13, 14, 11, 0x3a1240, 0x8a4a8a, 0.18);
    // Vòng năng lượng huyền bí
    g.lineStyle(2, 0x44ffee, 0.7);
    g.strokeCircle(13, 15, 13);
    g.lineStyle(1, 0x44ffee, 0.3);
    g.strokeCircle(13, 15, 16);
    this._glowEye(g, 9, 12, 2, 0x44ffee);
    this._glowEye(g, 17, 12, 2, 0x44ffee);
    g.generateTexture('enemy_ranged', 26, 26);
    g.destroy();

    // --- SWARM: Rat, rất nhỏ, yếu, đông ---
    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x2a1a0a, 1);
    g.fillTriangle(1, 12, 0, 9, 1, 9); // đuôi
    this._sphereBody(g, 9, 10, 8, 0x3a2410, 0x8a5a2a, 0.16);
    // Tai
    g.fillStyle(0x6a3a1a, 1);
    g.fillCircle(4, 5, 2.6);
    g.fillCircle(14, 5, 2.6);
    g.fillStyle(0xcc8866, 1);
    g.fillCircle(4, 5, 1.3);
    g.fillCircle(14, 5, 1.3);
    this._glowEye(g, 6.5, 9, 1.3, 0xff4444);
    this._glowEye(g, 11.5, 9, 1.3, 0xff4444);
    g.generateTexture('enemy_swarm', 18, 18);
    g.destroy();
  }

  // Đạn của quái bắn xa / boss rồng
  makeEnemyBolt() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x44ffee, 0.25);
    g.fillCircle(7, 7, 7);
    g.fillStyle(0x44ffee, 1);
    g.fillCircle(7, 7, 5);
    g.fillStyle(0xccffee, 0.9);
    g.fillCircle(7, 7, 2.5);
    g.generateTexture('enemy_bolt', 14, 14);
    g.destroy();
  }

  // ====================== BOSS VARIANTS ======================
  // 3 boss riêng biệt, mỗi con có kỹ năng đặc trưng xử lý trong GameScene:
  //  - boss_reaper   : lao (dash) thẳng vào người chơi theo chu kỳ
  //  - boss_colossus : triệu hồi thêm quái nhỏ xung quanh theo chu kỳ
  //  - boss_dragon   : bắn loạt đạn (barrage) tầm xa theo chu kỳ
  // Mỗi boss giờ có shading khối cầu/hộp thật, glow mắt, viền outline và chi tiết
  // riêng (lưỡi hái, gai giáp, vảy rồng) để nhìn hoành tráng hơn quái thường.
  makeBossVariants() {
    // Blood Reaper - đỏ, dạng lưỡi hái đôi 2 bên
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    // Lưỡi hái (vẽ trước để nằm dưới thân)
    g.fillStyle(0xdddddd, 1);
    g.fillTriangle(6, 12, 0, 42, 17, 29);
    g.fillTriangle(42, 12, 48, 42, 31, 29);
    g.lineStyle(1.2, 0x888888, 0.8);
    g.strokeTriangle(6, 12, 0, 42, 17, 29);
    g.strokeTriangle(42, 12, 48, 42, 31, 29);
    g.fillStyle(0x3a2020, 1);
    g.fillRect(15, 27, 4, 14);
    g.fillRect(29, 27, 4, 14);
    this._sphereBody(g, 24, 25, 20, 0x3a0a0a, 0x8a1c3a, 0.22);
    // Vết nứt/gân đỏ phát sáng
    g.lineStyle(1.3, 0xff4444, 0.55);
    g.beginPath(); g.moveTo(14, 18); g.lineTo(20, 26); g.lineTo(16, 34); g.strokePath();
    g.beginPath(); g.moveTo(34, 18); g.lineTo(28, 26); g.lineTo(32, 34); g.strokePath();
    this._glowEye(g, 16, 20, 4.2, 0xff4444);
    this._glowEye(g, 32, 20, 4.2, 0xff4444);
    g.generateTexture('boss_reaper', 48, 48);
    g.destroy();

    // Void Colossus - tím đậm, to vuông, gai giáp, triệu hồi
    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x140a2a, 1);
    g.fillRoundedRect(2, 4, 52, 48, 12);
    g.fillStyle(0x1c1044, 1);
    g.fillRoundedRect(6, 8, 44, 40, 11);
    g.fillStyle(0x2a1c5c, 1);
    g.fillRoundedRect(9, 11, 38, 34, 10);
    // Highlight mảng sáng phía trên
    g.fillStyle(0xffffff, 0.09);
    g.fillRoundedRect(12, 13, 30, 12, 6);
    // Gai giáp 2 vai
    g.fillStyle(0xb967ff, 1);
    g.fillTriangle(4, 14, 0, 4, 12, 12);
    g.fillTriangle(44, 14, 50, 4, 36, 12);
    this._glowEye(g, 18, 25, 4.6, 0xb967ff);
    this._glowEye(g, 38, 25, 4.6, 0xb967ff);
    // Ký hiệu huyền bí ở giữa
    g.lineStyle(1.5, 0xb967ff, 0.6);
    g.strokeCircle(28, 36, 5);
    g.lineStyle(3, 0xb967ff, 0.5);
    g.strokeRoundedRect(2, 4, 52, 48, 12);
    g.generateTexture('boss_colossus', 56, 56);
    g.destroy();

    // Storm Dragon - xanh dương, thon dài, vảy, sừng, bắn xa
    g = this.make.graphics({ x: 0, y: 0, add: false });
    // Sừng
    g.fillStyle(0x0a1c3a, 1);
    g.fillTriangle(14, 4, 10, 0, 19, 6);
    g.fillTriangle(32, 4, 36, 0, 27, 6);
    this._sphereBody(g, 23, 25, 21, 0x0a1c3a, 0x1c5c8a, 0.2);
    // Vảy (chuỗi cung nhỏ)
    g.lineStyle(1.2, 0x4deeea, 0.35);
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.arc(23, 18 + i * 7, 15 - i * 2, 0.6, 2.5, false); g.strokePath();
    }
    this._glowEye(g, 15, 19, 4, 0x4deeea);
    this._glowEye(g, 31, 19, 4, 0x4deeea);
    g.fillStyle(0x9fdfff, 1);
    g.fillTriangle(23, 1, 11, 17, 35, 17);
    g.lineStyle(1, 0x0a1c3a, 0.5);
    g.strokeTriangle(23, 1, 11, 17, 35, 17);
    g.generateTexture('boss_dragon', 46, 46);
    g.destroy();
  }

  makeBullet() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffee88, 1);
    g.fillCircle(6, 6, 6);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(6, 6, 3);
    g.generateTexture('bullet', 12, 12);
    g.destroy();
  }

  makeArrow() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xddaa44, 1);
    g.fillTriangle(0, 4, 14, 0, 14, 8);
    g.fillStyle(0x8b5a2b, 1);
    g.fillRect(12, 3, 10, 2);
    g.generateTexture('arrow', 24, 8);
    g.destroy();
  }

  makeMagicOrb() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x8866ff, 0.9);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xccbbff, 0.7);
    g.fillCircle(8, 8, 4);
    g.generateTexture('magic_orb', 16, 16);
    g.destroy();
  }

  makeFireball() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xff4400, 1);
    g.fillCircle(10, 10, 10);
    g.fillStyle(0xffaa22, 1);
    g.fillCircle(10, 10, 6);
    g.fillStyle(0xffee88, 1);
    g.fillCircle(10, 8, 3);
    g.generateTexture('proj_fire', 20, 20);
    g.destroy();
  }

  makeIceProj() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x88ddff, 1);
    g.fillTriangle(0, 8, 16, 0, 16, 16);
    g.fillStyle(0xffffff, 0.9);
    g.fillTriangle(4, 8, 14, 3, 14, 13);
    g.generateTexture('proj_ice', 16, 16);
    g.destroy();
  }

  makeLightningProj() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffee44, 1);
    g.fillTriangle(8, 0, 2, 10, 8, 10);
    g.fillTriangle(8, 6, 14, 18, 8, 14);
    g.generateTexture('proj_lightning', 16, 18);
    g.destroy();
  }

  makePlasma() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x44aaff, 1);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xaaddff, 1);
    g.fillCircle(8, 8, 4);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 2);
    g.generateTexture('proj_plasma', 16, 16);
    g.destroy();
  }

  makeBloodSlash() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.lineStyle(5, 0xff2244, 0.9);
    g.beginPath();
    g.arc(20, 20, 16, -1, 1, false);
    g.strokePath();
    g.lineStyle(3, 0xffaaaa, 0.7);
    g.beginPath();
    g.arc(20, 20, 12, -0.9, 0.9, false);
    g.strokePath();
    g.generateTexture('slash_blood', 40, 40);
    g.destroy();
  }

  makeWaveRing() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.lineStyle(4, 0xffcc44, 0.85);
    g.strokeCircle(24, 24, 20);
    g.lineStyle(2, 0xffeeaa, 0.6);
    g.strokeCircle(24, 24, 14);
    g.generateTexture('wave_ring', 48, 48);
    g.destroy();
  }

  makeSlash() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.lineStyle(4, 0xffffff, 0.8);
    g.beginPath();
    g.arc(20, 20, 16, -0.8, 0.8, false);
    g.strokePath();
    g.generateTexture('slash', 40, 40);
    g.destroy();
  }

  // Lưỡi kiếm thật (blade) dùng để xoay/vung quanh player — origin sẽ đặt ở chuôi
  // khi add.image, để khi rotate trông giống động tác vung kiếm thật sự.
  makeSwordBlade() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // Chuôi kiếm
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(0, 9, 10, 6);
    g.fillStyle(0xd8b46a, 1);
    g.fillRect(8, 7, 5, 10);
    // Lưỡi kiếm (thon dần về mũi nhọn)
    g.fillStyle(0xe8ecf2, 1);
    g.beginPath();
    g.moveTo(13, 8);
    g.lineTo(78, 10);
    g.lineTo(96, 12);
    g.lineTo(78, 14);
    g.lineTo(13, 16);
    g.closePath();
    g.fillPath();
    // Sống kiếm sáng ở giữa (rãnh máu)
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(16, 12);
    g.lineTo(90, 12);
    g.strokePath();
    g.generateTexture('sword_blade', 100, 24);
    g.destroy();
  }

  makeGem() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x22cc66, 1);
    g.fillCircle(8, 8, 7);
    g.fillStyle(0xaaffcc, 0.9);
    g.fillCircle(6, 6, 3);
    g.generateTexture('gem', 16, 16);
    g.destroy();
  }

  // Nam châm — quái thường có tỉ lệ rớt ra, nhặt sẽ hút hết toàn bộ EXP (gem) chưa lụm trên bản đồ
  makeMagnet() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const s = 22;
    // Thân nam châm hình chữ U màu đỏ/bạc
    g.lineStyle(4, 0xff4d4d, 1);
    g.beginPath();
    g.arc(11, 12, 7, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
    g.strokePath();
    g.fillStyle(0xff4d4d, 1);
    g.fillRect(2, 12, 5, 8);
    g.fillRect(15, 12, 5, 8);
    g.fillStyle(0xe8e8e8, 1);
    g.fillRect(2, 17, 5, 3);
    g.fillRect(15, 17, 5, 3);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(11, 8, 2);
    g.generateTexture('magnet', s, s + 2);
    g.destroy();
  }

  // Rương skill — rớt ra khi hạ boss, nhặt để roll 1 passive ngẫu nhiên
  makeChest() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const s = 30;
    g.fillStyle(0x6b4423, 1);
    g.fillRoundedRect(2, 12, 26, 16, 3);
    g.fillStyle(0x8a5a2f, 1);
    g.fillRoundedRect(2, 6, 26, 10, 3);
    g.lineStyle(2, 0xffd166, 1);
    g.strokeRoundedRect(2, 12, 26, 16, 3);
    g.strokeRoundedRect(2, 6, 26, 10, 3);
    g.fillStyle(0xffd166, 1);
    g.fillRect(13, 12, 4, 8);
    g.fillCircle(15, 17, 2.4);
    g.generateTexture('chest', s, s);
    g.destroy();
  }

  // ----- WEAPON ICONS -----
  makeWeaponIcon(id) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const s = 32;
    // bg
    g.fillStyle(0x1a1a2e, 1);
    g.fillRoundedRect(0, 0, s, s, 4);

    const isEvo = ['phantom_bow','heavy_crossbow','heavens_rain','dragon_arrow','tempest_bow',
      'excalibur','titan_blade','blade_dance','blade_cyclone','crimson_reaper',
      'plasma_pistol','thunder_shotgun','assault_drone_swarm','fortress_turret','plasma_mine',
      'arcane_barrage','meteor','chain_thunder','absolute_zero','void_zone'].includes(id);

    if (isEvo) {
      g.lineStyle(2, 0xffdd66, 1);
      g.strokeRoundedRect(1, 1, s - 2, s - 2, 4);
    }

    // Draw simple icon by type
    if (id.includes('bow') || id.includes('arrow') || id.includes('rain') || id.includes('tempest') || id.includes('phantom') || id.includes('dragon') || id.includes('heavens')) {
      g.lineStyle(2, 0x8b5a2b, 1);
      g.strokeCircle(16, 16, 10);
      g.lineBetween(16, 6, 16, 26);
      g.fillStyle(0xddaa44, 1);
      g.fillTriangle(22, 14, 30, 16, 22, 18);
    } else if (id.includes('sword') || id.includes('blade') || id.includes('excalibur') || id.includes('titan') || id.includes('reaper') || id.includes('cyclone') || id.includes('dance')) {
      g.fillStyle(0xccccdd, 1);
      g.fillRect(14, 4, 4, 20);
      g.fillStyle(0x8b5a2b, 1);
      g.fillRect(11, 22, 10, 4);
      g.fillStyle(0xff6666, 0.6);
      g.fillCircle(16, 8, 3);
    } else if (id.includes('gun') || id.includes('pistol') || id.includes('shotgun') || id.includes('thunder_shot')) {
      g.fillStyle(0x555566, 1);
      g.fillRect(6, 12, 18, 8);
      g.fillRect(22, 14, 6, 4);
      g.fillStyle(0x333344, 1);
      g.fillRect(8, 20, 6, 6);
    } else if (id.includes('drone') || id.includes('swarm')) {
      g.fillStyle(0x66aaff, 1);
      g.fillCircle(16, 16, 8);
      g.fillStyle(0xaaddff, 1);
      g.fillCircle(16, 16, 4);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(12, 12, 2);
      g.fillCircle(20, 12, 2);
    } else if (id.includes('turret') || id.includes('fortress')) {
      g.fillStyle(0x6688aa, 1);
      g.fillRect(8, 14, 16, 12);
      g.fillStyle(0x445566, 1);
      g.fillRect(12, 6, 8, 10);
      g.fillStyle(0xffaa44, 1);
      g.fillCircle(16, 8, 3);
    } else if (id.includes('mine') || id.includes('plasma_mine')) {
      g.fillStyle(0xffaa22, 1);
      g.fillCircle(16, 16, 10);
      g.fillStyle(0xff4400, 1);
      g.fillCircle(16, 16, 4);
    } else if (id.includes('mortar') || id.includes('siege')) {
      g.fillStyle(0x556677, 1);
      g.fillRect(8, 14, 16, 12);
      g.fillStyle(0x334455, 1);
      g.fillRect(12, 4, 8, 12);
      g.fillStyle(0xff8844, 1);
      g.fillCircle(16, 6, 4);
    } else if (id.includes('shield') || id.includes('aegis')) {
      g.fillStyle(0x4488cc, 1);
      g.fillCircle(16, 16, 11);
      g.fillStyle(0xaaddff, 0.7);
      g.fillCircle(16, 16, 6);
    } else if (id.includes('sniper') || id.includes('death_sniper')) {
      g.fillStyle(0x5a4a3a, 1);
      g.fillRect(4, 14, 24, 4);
      g.fillStyle(0x333333, 1);
      g.fillRect(22, 10, 6, 12);
    } else if (id.includes('fan') || id.includes('hurricane')) {
      g.fillStyle(0x88aa44, 1);
      for (let a = -1; a <= 1; a++) {
        g.fillTriangle(8, 16 + a * 6, 28, 16 + a * 2, 8, 16 + a * 2);
      }
    } else if (id.includes('shock') || id.includes('quake')) {
      g.fillStyle(0xccaa44, 1);
      g.fillTriangle(6, 22, 16, 4, 26, 22);
      g.fillStyle(0xffee88, 1);
      g.fillTriangle(10, 20, 16, 10, 22, 20);
    } else if (id.includes('frost') || id.includes('glacier')) {
      g.fillStyle(0x88ddff, 1);
      g.fillCircle(16, 16, 10);
      g.fillStyle(0xffffff, 1);
      g.fillRect(14, 6, 4, 20);
      g.fillRect(6, 14, 20, 4);
    } else if (id.includes('tesla') || id.includes('coil') || id.includes('storm_coil')) {
      g.fillStyle(0x445566, 1);
      g.fillRect(10, 18, 12, 10);
      g.fillStyle(0xffee44, 1);
      g.fillCircle(16, 12, 7);
      g.lineStyle(2, 0xffffff, 0.9);
      g.lineBetween(16, 5, 12, 14);
      g.lineBetween(16, 5, 20, 14);
    } else if (id.includes('repair')) {
      g.fillStyle(0x66cc88, 1);
      g.fillCircle(16, 16, 9);
      g.fillStyle(0xffffff, 1);
      g.fillRect(14, 9, 4, 14);
      g.fillRect(9, 14, 14, 4);
    } else if (id.includes('magic') || id.includes('missile') || id.includes('barrage') || id.includes('arcane')) {
      g.fillStyle(0x8866ff, 1);
      g.fillCircle(16, 16, 9);
      g.fillStyle(0xccbbff, 1);
      g.fillCircle(16, 16, 4);
    } else if (id.includes('fire') || id.includes('meteor')) {
      g.fillStyle(0xff6622, 1);
      g.fillCircle(16, 16, 9);
      g.fillStyle(0xffaa44, 1);
      g.fillCircle(16, 14, 5);
      g.fillStyle(0xffee88, 1);
      g.fillCircle(16, 12, 2);
    } else if (id.includes('lightning') || id.includes('thunder') || id.includes('chain')) {
      g.fillStyle(0xffee44, 1);
      g.fillTriangle(16, 4, 10, 16, 16, 16);
      g.fillTriangle(16, 14, 22, 28, 16, 22);
    } else if (id.includes('ice') || id.includes('absolute') || id.includes('zero')) {
      g.fillStyle(0x88ddff, 1);
      g.fillCircle(16, 16, 9);
      g.lineStyle(2, 0xffffff, 0.9);
      g.lineBetween(16, 6, 16, 26);
      g.lineBetween(6, 16, 26, 16);
    } else if (id.includes('aura') || id.includes('void')) {
      g.lineStyle(3, 0xaa66ff, 1);
      g.strokeCircle(16, 16, 10);
      g.fillStyle(0x6622aa, 0.5);
      g.fillCircle(16, 16, 6);
    } else {
      // default
      g.fillStyle(0x8888aa, 1);
      g.fillCircle(16, 16, 8);
    }

    g.generateTexture('icon_' + id, s, s);
    g.destroy();
  }

  makePassiveIcon(id) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const s = 28;
    g.fillStyle(0x1a2a1a, 1);
    g.fillRoundedRect(0, 0, s, s, 4);
    g.lineStyle(1, 0x44aa66, 1);
    g.strokeRoundedRect(0.5, 0.5, s - 1, s - 1, 4);

    const colors = {
      bracer: 0xcc8844, spinach: 0x44cc44, clover: 0x44ff88,
      candelabrador: 0xffcc44, empty_tome: 0xaaaaff, wings: 0x88ccff,
      armor: 0x888899, hollow_heart: 0xff6688, pummarola: 0xff4466,
      spellbinder: 0xcc88ff, wisdom: 0xffdd88, attractorb: 0x66ffaa
    };
    const col = colors[id] || 0x88aa88;
    g.fillStyle(col, 1);
    g.fillCircle(14, 14, 8);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(11, 11, 3);

    g.generateTexture('icon_pas_' + id, s, s);
    g.destroy();
  }

  create() {
    this.scene.start('TitleScene');
  }
}
