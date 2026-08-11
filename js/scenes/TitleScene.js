class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    const { width, height } = this.scale;
    // Background gradient-like glow
    this.add.rectangle(width / 2, height / 2, width, height, 0x070918);
    const bg = this.add.graphics();
    bg.fillStyle(0x2f1f75, 0.12);
    bg.fillCircle(width * 0.25, height * 0.25, 240);
    bg.fillStyle(0x5588ff, 0.1);
    bg.fillCircle(width * 0.75, height * 0.35, 220);
    bg.fillStyle(0xffcc88, 0.08);
    bg.fillCircle(width * 0.55, height * 0.7, 260);
    bg.fillStyle(0xffffff, 0.1);
    for (let i = 0; i < 4; i++) {
      bg.strokeCircle(width * 0.18 + i * 240, height * 0.18 + (i % 2) * 90, 100 + i * 20);
    }

    // Nhạc nền: cần 1 tương tác đầu tiên của người dùng để trình duyệt cho phép phát âm thanh
    GameAudio.init();
    const unlockAndPlay = () => {
      GameAudio.unlock();
      GameAudio.setMuted(GameAudio.muted);
      GameAudio.startMusic();
      this.input.off('pointerdown', unlockAndPlay);
      this.input.keyboard.off('keydown', unlockAndPlay);
    };
    this.input.once('pointerdown', unlockAndPlay);
    this.input.keyboard.once('keydown', unlockAndPlay);

    // Decorative circles
    for (let i = 0; i < 12; i++) {
      const c = this.add.circle(
        Phaser.Math.Between(50, width - 50),
        Phaser.Math.Between(50, height - 50),
        Phaser.Math.Between(2, 5),
        0x6c5ce7,
        Phaser.Math.FloatBetween(0.1, 0.35)
      );
      this.tweens.add({
        targets: c,
        alpha: 0.05,
        duration: Phaser.Math.Between(2000, 4000),
        yoyo: true,
        repeat: -1
      });
    }

    this.add.text(width / 2, height * 0.26, 'SỐNG ĐẠI THÀNH HUYỀN THOẠI', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#f7f2ff',
      stroke: '#6c5ce7',
      strokeThickness: 8,
      align: 'center',
      wordWrap: { width: width * 0.9 },
      shadow: { offsetX: 0, offsetY: 0, color: '#4a47ff', blur: 24, stroke: true, fill: true }
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.38, 'Vampire Survivors Style  •  4 Classes', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '18px',
      color: '#a0a0c0'
    }).setOrigin(0.5);

    const highScore = localStorage.getItem('vs_highscore') || '0';
    this.add.text(width / 2, height * 0.46, 'Best Time: ' + highScore + 's', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '18px',
      color: '#88ffaa'
    }).setOrigin(0.5);

    // Menu chính đặt ở trung tâm màn hình, không còn nút PLAY lớn hay Login ở góc.
    const menuBtn = this.add.text(width / 2, height * 0.66, '☰  MENU', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#5f5ce7',
      padding: { x: 48, y: 16 },
      shadow: { offsetX: 0, offsetY: 6, color: '#000000', blur: 14, stroke: false, fill: true }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    menuBtn.setStroke('#ffffff', 1);
    menuBtn.on('pointerover', () => {
      menuBtn.setStyle({ backgroundColor: '#7a72ff' });
      menuBtn.setScale(1.05);
    });
    menuBtn.on('pointerout', () => {
      menuBtn.setStyle({ backgroundColor: '#5f5ce7' });
      menuBtn.setScale(1);
    });
    menuBtn.on('pointerdown', () => {
      if (!window.AuthAPI) return;
      window.AuthAPI.showModal(window.AuthAPI.user ? 'menu' : 'login');
    });

    const updateMenuButton = () => {
      const user = window.AuthAPI ? window.AuthAPI.user : null;
      menuBtn.setText(user ? '☰  MENU' : '👤  LOGIN');
    };

    // Main Menu điều hướng trực tiếp vào chế độ chơi đơn.
    this._authPlayHandler = () => {
      if (this.scene.isActive()) this.scene.start('ClassSelectScene');
    };
    this._authStatusHandler = () => {
      updateMenuButton();
    };
    window.addEventListener('authPlayClicked', this._authPlayHandler);
    window.addEventListener('authStatusChanged', this._authStatusHandler);

    const openLoginIfNeeded = () => {
      if (window.AuthAPI && !window.AuthAPI.user) {
        window.AuthAPI.showModal('login');
      }
    };
    if (window.AuthAPI) {
      updateMenuButton();
      openLoginIfNeeded();
    } else {
      window.addEventListener('authReady', () => {
        updateMenuButton();
        openLoginIfNeeded();
      });
    }

    this.add.text(width / 2, height * 0.84, 'WASD / Arrows to move  •  Auto Attack  •  ESC Pause  •  M Mute', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '14px',
      color: '#b0b8ff',
      shadow: { offsetX: 0, offsetY: 0, color: '#000000', blur: 4, stroke: false, fill: true }
    }).setOrigin(0.5);

    // Nút bật/tắt âm thanh
    const muteBtn = this.add.text(width - 16, 16, GameAudio.muted ? '🔇' : '🔊', {
      fontSize: '24px'
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    muteBtn.on('pointerdown', () => {
      GameAudio.setMuted(!GameAudio.muted);
      localStorage.setItem('vs_muted', GameAudio.muted ? '1' : '0');
      muteBtn.setText(GameAudio.muted ? '🔇' : '🔊');
    });
  }
  shutdown() {
    if (this._authPlayHandler) window.removeEventListener('authPlayClicked', this._authPlayHandler);
    if (this._authStatusHandler) window.removeEventListener('authStatusChanged', this._authStatusHandler);
  }

}
