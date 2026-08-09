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

    const playBtn = this.add.text(width / 2, height * 0.58, '▶  PLAY', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#5f5ce7',
      padding: { x: 44, y: 16 },
      shadow: { offsetX: 0, offsetY: 0, color: '#ffffff', blur: 8, stroke: false, fill: true }
    }).setOrigin(0.5);
    playBtn.setStroke('#ffffff', 2);
    playBtn.setVisible(false);
    playBtn.disableInteractive();

    const updatePlayButton = () => {
      const user = window.AuthAPI ? window.AuthAPI.user : null;
      if (user) {
        playBtn.setVisible(true);
        playBtn.setInteractive({ useHandCursor: true });
      } else {
        playBtn.setVisible(false);
        playBtn.disableInteractive();
      }
    };

    // Nút Tài khoản/Login cố định ở góc trên trái: cho phép người dùng
    // mở lại modal đăng nhập (nếu chưa đăng nhập) hoặc mở lại Main Menu
    // (nếu đã đăng nhập) bất cứ lúc nào, kể cả khi đã lỡ đóng modal trước đó.
    const accountBtn = this.add.text(16, 16, '👤 Login', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '15px',
      color: '#ffffff',
      backgroundColor: '#2c2f55',
      padding: { x: 14, y: 8 }
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    accountBtn.on('pointerover', () => accountBtn.setStyle({ backgroundColor: '#3d4177' }));
    accountBtn.on('pointerout', () => accountBtn.setStyle({ backgroundColor: '#2c2f55' }));
    accountBtn.on('pointerdown', () => {
      if (!window.AuthAPI) return;
      window.AuthAPI.showModal(window.AuthAPI.user ? 'menu' : 'login');
    });
    const updateAccountButton = () => {
      const user = window.AuthAPI ? window.AuthAPI.user : null;
      accountBtn.setText(user ? `👤 ${user.username}` : '👤 Login');
    };

    // Nút "Play" bên trong Main Menu (modal) bắn sự kiện này sau khi tự đóng modal;
    // cần lắng nghe ở đây để thực sự vào màn chọn nhân vật, nếu không nút đó sẽ không làm gì cả.
    window.addEventListener('authPlayClicked', () => {
      this.scene.start('ClassSelectScene');
    });

    window.addEventListener('authStatusChanged', () => {
      updatePlayButton();
      updateAccountButton();
    });

    const openLoginIfNeeded = () => {
      if (window.AuthAPI && !window.AuthAPI.user) {
        window.AuthAPI.showModal('login');
      }
    };
    if (window.AuthAPI) {
      // api.js đã init xong trước khi scene này chạy (trường hợp thường gặp)
      updatePlayButton();
      updateAccountButton();
      openLoginIfNeeded();
    } else {
      // Phòng khi authReady chưa kịp bắn (trường hợp hiếm)
      window.addEventListener('authReady', () => {
        updatePlayButton();
        updateAccountButton();
        openLoginIfNeeded();
      });
    }

    playBtn.on('pointerover', () => {
      if (!playBtn.visible) return;
      playBtn.setStyle({ backgroundColor: '#8b7cf7' });
      playBtn.setScale(1.05);
    });
    playBtn.on('pointerout', () => {
      if (!playBtn.visible) return;
      playBtn.setStyle({ backgroundColor: '#6c5ce7' });
      playBtn.setScale(1);
    });
    playBtn.on('pointerdown', () => {
      if (window.AuthAPI && typeof window.AuthAPI.hideModal === 'function') {
        window.AuthAPI.hideModal();
      }
      this.scene.start('ClassSelectScene');
    });

    this.add.text(width / 2, height * 0.88, 'WASD / Arrows to move  •  Auto Attack  •  ESC Pause  •  M Mute', {
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
}
