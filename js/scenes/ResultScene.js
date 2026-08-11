class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.result = data;
  }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x080812);
    const gb = this.add.graphics();
    gb.fillStyle(0x3f2f7c, 0.08);
    gb.fillCircle(width * 0.3, height * 0.2, 180);
    gb.fillStyle(0x44aaff, 0.06);
    gb.fillCircle(width * 0.7, height * 0.28, 160);
    gb.fillStyle(0xffffff, 0.12);
    gb.fillCircle(width * 0.5, height * 0.7, 220);

    const panel = this.add.rectangle(width / 2, height / 2, 620, 480, 0x0f1225, 0.88)
      .setStrokeStyle(2, 0x5a6ee0, 0.95);

    this.add.text(width / 2, height * 0.18, 'GAME OVER', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#ff6666'
    }).setOrigin(0.5);

    const lines = [
      `Class: ${this.result.className}`,
      `Time Survived: ${this.result.timeAlive}s`,
      `Level Reached: ${this.result.level}`,
      `Enemies Killed: ${this.result.kills}`
    ];

    lines.forEach((txt, i) => {
      this.add.text(width / 2, height * 0.38 + i * 36, txt, {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '22px',
        color: '#ddddff'
      }).setOrigin(0.5);
    });

    // High score check
    const high = localStorage.getItem('vs_highscore') || '0';
    this.add.text(width / 2, height * 0.62, `Best Time: ${high}s`, {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '18px',
      color: '#88ffaa'
    }).setOrigin(0.5);

    // Gửi điểm lên bảng xếp hạng cloud (chỉ khi đã đăng nhập thật, không áp dụng cho Guest)
    const cloudStatus = this.add.text(width / 2, height * 0.70, '', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '15px',
      color: '#f7d774'
    }).setOrigin(0.5);

    const auth = window.AuthAPI;
    if (auth && auth.token && auth.user && !auth.user.guest) {
      const computedScore = Math.round(this.result.timeAlive * 10 + this.result.kills * 5 + this.result.level * 20);
      cloudStatus.setText('Đang lưu điểm lên bảng xếp hạng...');
      auth.submitScore({
        score: computedScore,
        kills: this.result.kills,
        levelReached: this.result.level,
        gameMode: this.result.className
      }).then((res) => {
        auth.updateLocalGold(res.goldBalance);
        cloudStatus.setText(`+${res.goldEarned} 🪙 Gold  •  Đã lưu vào bảng xếp hạng`);
      }).catch((err) => {
        cloudStatus.setText('Không lưu được điểm lên bảng xếp hạng: ' + err.message);
      });
    } else {
      cloudStatus.setText('Đăng nhập để lưu điểm lên bảng xếp hạng & nhận Gold');
    }

    // Kiểm tra & mở khóa Achievements đạt được trong trận này (chỉ áp dụng cho
    // tài khoản đã đăng nhập thật — giống logic lưu điểm ở trên). Server tự bỏ
    // qua nếu thành tựu đã mở khóa từ trước (findOrCreate), nên chỉ những cái
    // thật sự MỚI (không có field "message" trong response) mới được hiển thị.
    const achievementText = this.add.text(width / 2, height * 0.75, '', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffe066',
      align: 'center',
      wordWrap: { width: 560 }
    }).setOrigin(0.5);

    if (auth && auth.token && auth.user && !auth.user.guest && typeof ACHIEVEMENT_DEFS !== 'undefined') {
      const runStats = {
        kills: this.result.kills,
        level: this.result.level,
        timeAlive: this.result.timeAlive,
        difficulty: this.result.difficulty,
        bossKills: this.result.bossKills || 0,
        chestsOpened: this.result.chestsOpened || 0,
        allClassesPlayed: this.result.allClassesPlayed
      };
      const metThisRun = ACHIEVEMENT_DEFS.filter(a => a.check(runStats));
      if (metThisRun.length) {
        Promise.all(metThisRun.map(a =>
          auth.unlockAchievement(a.key, a.title, a.description)
            .then((res) => ({ def: a, isNew: !res.message }))
            .catch(() => null)
        )).then((results) => {
          const newlyUnlocked = results.filter((r) => r && r.isNew);
          if (newlyUnlocked.length) {
            GameAudio.levelUp();
            achievementText.setText('🏆 Thành tựu mới: ' + newlyUnlocked.map((r) => `${r.def.icon} ${r.def.title}`).join('   •   '));
          }
        });
      }
    }

    // Buttons
    const retryBtn = this.add.text(width / 2, height * 0.82, '▶  PLAY AGAIN', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#6c5ce7',
      padding: { x: 30, y: 12 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    retryBtn.on('pointerover', () => retryBtn.setStyle({ backgroundColor: '#8b7cf7' }));
    retryBtn.on('pointerout', () => retryBtn.setStyle({ backgroundColor: '#6c5ce7' }));
    retryBtn.on('pointerdown', async () => {
      this.scene.start('ClassSelectScene');
    });

    const menuBtn = this.add.text(width / 2, height * 0.92, 'Back to Title', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '18px',
      color: '#aaaacc'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerdown', async () => {
      this.scene.start('TitleScene');
    });
  }
}
