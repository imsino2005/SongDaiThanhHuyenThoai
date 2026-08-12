class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    // QUAN TRỌNG: Phaser KHÔNG tự gọi phương thức shutdown() bên dưới khi scene
    // dừng/khởi động lại — phải đăng ký nó vào event emitter của scene thì mới
    // thực sự chạy. Thiếu dòng này, mỗi lần quay lại Title (sau khi chơi xong,
    // logout, v.v.) các window.addEventListener ở cuối create() sẽ CHỒNG THÊM
    // một bộ mới mà không bao giờ được dọn — gây lỗi chập chờn: nút Play/trạng
    // thái đăng nhập lúc phản ứng đúng, lúc phản ứng sai/nhiều lần do có nhiều
    // listener cũ (tham chiếu tới scene instance đã huỷ) cùng chạy song song.
    this.events.once('shutdown', this.shutdown, this);

    const { width, height } = this.scale;
    // Background gradient-like glow
    this.add.rectangle(width / 2, height / 2, width, height, 0x070918);

    // ---- Parallax layers ----
    // 3 lớp graphics độc lập di chuyển với tốc độ khác nhau theo con trỏ
    // chuột (desktop) / con quay hồi chuyển nhẹ tự động (mobile không có
    // pointer di chuyển liên tục), tạo cảm giác chiều sâu cho nền.
    this._parallaxLayers = [];

    const glowLayer = this.add.graphics();
    glowLayer.fillStyle(0x2f1f75, 0.14);
    glowLayer.fillCircle(width * 0.25, height * 0.25, 240);
    glowLayer.fillStyle(0x5588ff, 0.11);
    glowLayer.fillCircle(width * 0.75, height * 0.35, 220);
    glowLayer.fillStyle(0xffcc88, 0.09);
    glowLayer.fillCircle(width * 0.55, height * 0.7, 260);
    this._parallaxLayers.push({ obj: glowLayer, factor: 14, baseX: 0, baseY: 0 });

    const ringLayer = this.add.graphics();
    ringLayer.lineStyle(1.5, 0xffffff, 0.1);
    for (let i = 0; i < 4; i++) {
      ringLayer.strokeCircle(width * 0.18 + i * 240, height * 0.18 + (i % 2) * 90, 100 + i * 20);
    }
    this._parallaxLayers.push({ obj: ringLayer, factor: 26, baseX: 0, baseY: 0 });

    // Con trỏ chuột điều khiển parallax; trên thiết bị cảm ứng dùng dao
    // động sin nhẹ tự động để nền vẫn "sống" mà không cần tương tác.
    this._pointerTarget = { x: width / 2, y: height / 2 };
    this.input.on('pointermove', (p) => {
      this._pointerTarget.x = p.x;
      this._pointerTarget.y = p.y;
    });
    this._autoParallaxT = 0;

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

    // ---- Particle bay lơ lửng chất lượng hơn ----
    // Thay vòng lặp circle tween cũ bằng particle emitter thật: trôi chậm
    // lên trên, lắc nhẹ ngang, nhấp nháy độ sáng, đổi tint ngẫu nhiên giữa
    // vài sắc tím/xanh để đồng bộ tông màu tiêu đề.
    if (this.textures.exists('particle')) {
      this.floatParticles = this.add.particles(0, 0, 'particle', {
        x: { min: 0, max: width },
        y: { min: 0, max: height },
        lifespan: { min: 4000, max: 8000 },
        speedY: { min: -18, max: -6 },
        speedX: { min: -8, max: 8 },
        scale: { min: 0.15, max: 0.5 },
        alpha: { values: [0, 0.5, 0.5, 0], duration: 4000 },
        quantity: 1,
        frequency: 220,
        tint: [0x6c5ce7, 0x5588ff, 0xc084fc, 0xffcc88]
      }).setDepth(1);
    } else {
      // Fallback nếu thiếu texture 'particle': giữ lại circle tween nhẹ như cũ.
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
    }

    // ---- Tiêu đề: có hào quang mờ phía sau + hiệu ứng xuất hiện + "thở" nhẹ liên tục ----
    const titleGlow = this.add.text(width / 2, height * 0.26, 'SỐNG DAI THÀNH HUYỀN THOẠI', {
      fontFamily: 'Segoe UI, Arial', fontSize: '44px', fontStyle: 'bold', color: '#6c5ce7'
    }).setOrigin(0.5).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setScale(1.06);

    const titleText = this.add.text(width / 2, height * 0.26, 'SỐNG DAI THÀNH HUYỀN THOẠI', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#f7f2ff',
      stroke: '#6c5ce7',
      strokeThickness: 8,
      align: 'center',
      wordWrap: { width: width * 0.9 },
      shadow: { offsetX: 0, offsetY: 0, color: '#4a47ff', blur: 24, stroke: true, fill: true }
    }).setOrigin(0.5).setAlpha(0).setScale(0.9);

    this.tweens.add({ targets: [titleText], alpha: 1, scale: 1, duration: 550, ease: 'Back.Out' });
    this.tweens.add({
      targets: [titleGlow], scale: { from: 1.02, to: 1.1 }, alpha: { from: 0.45, to: 0.18 },
      duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 550
    });

    const subtitle = this.add.text(width / 2, height * 0.38, 'Vampire Survivors Style  •  4 Classes', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '18px',
      color: '#a0a0c0'
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: subtitle, alpha: 1, y: height * 0.38, duration: 400, delay: 250, ease: 'Cubic.Out' });

    // ---- Best Time: khung huy hiệu nhỏ thay vì text trần ----
    const highScore = localStorage.getItem('vs_highscore') || '0';
    const badgeW = 190;
    const badge = this.add.container(width / 2, height * 0.47).setAlpha(0);
    const badgeBg = this.add.rectangle(0, 0, badgeW, 34, 0x121428, 0.75).setStrokeStyle(1, 0x4d5aa8, 0.8);
    const badgeText = this.add.text(6, 0, '🏆  Best Time: ' + highScore + 's', {
      fontFamily: 'Segoe UI, Arial', fontSize: '15px', color: '#a8ffc4', fontStyle: 'bold'
    }).setOrigin(0.5);
    badge.add([badgeBg, badgeText]);
    this.tweens.add({ targets: badge, alpha: 1, duration: 400, delay: 380, ease: 'Cubic.Out' });

    // Menu chính đặt ở trung tâm màn hình, không còn nút PLAY lớn hay Login ở góc.
    // Vòng glow mềm phía sau nút, nhấp nháy chậm để hút mắt vào lựa chọn chính.
    const menuBtnGlow = this.add.ellipse(width / 2, height * 0.66, 260, 76, 0x7a72ff, 0.28)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.tweens.add({
      targets: menuBtnGlow, scaleX: { from: 0.95, to: 1.08 }, scaleY: { from: 0.95, to: 1.08 },
      alpha: { from: 0.3, to: 0.12 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 700
    });

    const menuBtn = this.add.text(width / 2, height * 0.66, '☰  MENU', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#5f5ce7',
      padding: { x: 48, y: 16 },
      shadow: { offsetX: 0, offsetY: 6, color: '#000000', blur: 14, stroke: false, fill: true }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0).setScale(0.7);
    menuBtn.setStroke('#ffffff', 1);
    this.tweens.add({
      targets: [menuBtn, menuBtnGlow], alpha: 1, scale: 1, duration: 420, delay: 500, ease: 'Back.Out'
    });
    menuBtn.on('pointerover', () => {
      menuBtn.setStyle({ backgroundColor: '#7a72ff' });
      menuBtn.setScale(1.05);
    });
    menuBtn.on('pointerout', () => {
      menuBtn.setStyle({ backgroundColor: '#5f5ce7' });
      menuBtn.setScale(1);
    });
    menuBtn.on('pointerdown', () => {
      // Bùng nhẹ khi bấm để phản hồi cảm giác rõ ràng hơn
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const spark = this.add.circle(menuBtn.x, menuBtn.y, 3, 0xd9d4ff, 1).setDepth(50);
        this.tweens.add({
          targets: spark, x: menuBtn.x + Math.cos(a) * 60, y: menuBtn.y + Math.sin(a) * 60,
          alpha: 0, duration: 300, ease: 'Cubic.Out', onComplete: () => spark.destroy()
        });
      }
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

    // Lưu ý: KHÔNG tự ép mở lại modal Login ở đây nữa. AuthAPI.init() đã tự mở
    // modal Login/Menu ngay khi trang tải xong (chạy độc lập, không phụ thuộc
    // Phaser load xong hay chưa), và nút "👤 LOGIN" trên Title luôn hiển thị
    // sẵn để người chơi tự mở lại bất cứ lúc nào. Trước đây code có gọi thêm
    // showModal('login') ở đây sau khi Phaser boot xong — nếu người chơi bấm
    // nhanh vào Register/Guest/Quên mật khẩu trong lúc Phaser còn đang load,
    // lệnh này sẽ ép modal quay lại Login, xoá mất form đang thao tác (bug:
    // bấm như không phản ứng gì, phải reload mới bấm được). Bỏ hẳn đoạn ép
    // mở lại để loại trừ hoàn toàn race condition này.
    if (window.AuthAPI) {
      updateMenuButton();
    } else {
      window.addEventListener('authReady', updateMenuButton);
    }

    const hintText = this.add.text(width / 2, height * 0.84, 'WASD / Arrows to move  •  Auto Attack  •  ESC Pause  •  M Mute', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '14px',
      color: '#b0b8ff',
      shadow: { offsetX: 0, offsetY: 0, color: '#000000', blur: 4, stroke: false, fill: true }
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: hintText, alpha: 1, duration: 500, delay: 750, ease: 'Cubic.Out' });

    // Nút bật/tắt âm thanh — thêm nền tròn để bấm dễ hơn trên mobile + hiệu ứng hover
    const muteBg = this.add.circle(width - 34, 34, 22, 0x121428, 0.55).setStrokeStyle(1, 0x4d5aa8, 0.7)
      .setInteractive({ useHandCursor: true });
    const muteBtn = this.add.text(width - 34, 34, GameAudio.muted ? '🔇' : '🔊', {
      fontSize: '22px'
    }).setOrigin(0.5);
    const toggleMute = () => {
      GameAudio.setMuted(!GameAudio.muted);
      localStorage.setItem('vs_muted', GameAudio.muted ? '1' : '0');
      muteBtn.setText(GameAudio.muted ? '🔇' : '🔊');
      this.tweens.add({ targets: muteBtn, scale: { from: 0.7, to: 1 }, duration: 200, ease: 'Back.Out' });
    };
    muteBg.on('pointerover', () => muteBg.setFillStyle(0x1e2148, 0.75));
    muteBg.on('pointerout', () => muteBg.setFillStyle(0x121428, 0.55));
    muteBg.on('pointerdown', toggleMute);
  }

  update(time, delta) {
    // Parallax: các lớp graphics dịch chuyển ngược hướng lệch của con trỏ
    // so với tâm màn hình, lớp có "factor" lớn hơn dịch chuyển nhiều hơn
    // -> cảm giác lớp đó ở gần camera hơn (foreground), lớp factor nhỏ ở xa.
    if (this._parallaxLayers && this._parallaxLayers.length) {
      const { width, height } = this.scale;
      const dx = (this._pointerTarget.x - width / 2) / (width / 2);
      const dy = (this._pointerTarget.y - height / 2) / (height / 2);
      this._parallaxLayers.forEach(layer => {
        const targetX = layer.baseX - dx * layer.factor;
        const targetY = layer.baseY - dy * layer.factor;
        layer.obj.x += (targetX - layer.obj.x) * 0.04;
        layer.obj.y += (targetY - layer.obj.y) * 0.04;
      });
    }
  }

  shutdown() {
    if (this._authPlayHandler) window.removeEventListener('authPlayClicked', this._authPlayHandler);
    if (this._authStatusHandler) window.removeEventListener('authStatusChanged', this._authStatusHandler);
    if (this.floatParticles) { this.floatParticles.destroy(); this.floatParticles = null; }
  }

}
