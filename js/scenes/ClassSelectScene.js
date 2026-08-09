class ClassSelectScene extends Phaser.Scene {
  constructor() {
    super('ClassSelectScene');
  }

  create() {
    // Reset lại cờ chặn double-click mỗi khi vào scene này — nếu không reset,
    // sau lần đầu chọn nhân vật (startingGame = true), những lần quay lại
    // ClassSelectScene sau đó (vd bấm "Chơi lại" từ ResultScene) sẽ không
    // bấm chọn được nhân vật nào nữa vì Phaser tái sử dụng cùng scene instance.
    this.startingGame = false;

    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a18);

    this.add.text(width / 2, 50, 'CHỌN CLASS', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#f0f0ff'
    }).setOrigin(0.5);

    this.selectedDiff = 'normal';
    const diffs = [
      { id: 'easy', label: 'Easy' },
      { id: 'normal', label: 'Normal' },
      { id: 'hard', label: 'Hard' }
    ];

    this.diffButtons = [];
    diffs.forEach((d, i) => {
      const x = width / 2 - 140 + i * 140;
      const btn = this.add.text(x, 105, d.label, {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '18px',
        color: d.id === 'normal' ? '#ffffff' : '#888899',
        backgroundColor: d.id === 'normal' ? '#333355' : '#1a1a2a',
        padding: { x: 16, y: 8 }
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        this.selectedDiff = d.id;
        this.diffButtons.forEach((b, j) => {
          b.setStyle({
            color: diffs[j].id === this.selectedDiff ? '#ffffff' : '#888899',
            backgroundColor: diffs[j].id === this.selectedDiff ? '#333355' : '#1a1a2a'
          });
        });
      });
      this.diffButtons.push(btn);
    });

    const classIds = ['archer', 'swordsman', 'engineer', 'mage'];
    const cardW = 220;
    const gap = 22;
    const totalW = 4 * cardW + 3 * gap;
    const startX = (width - totalW) / 2 + cardW / 2;

    classIds.forEach((id, i) => {
      const cls = CLASSES[id];
      const x = startX + i * (cardW + gap);
      const y = height / 2 + 30;

      const card = this.add.rectangle(x, y, cardW, 360, 0x142033)
        .setStrokeStyle(3, cls.color)
        .setInteractive({ useHandCursor: true });

      const cardBg = this.add.rectangle(x, y, cardW - 12, 340, 0x101822, 0.7).setStrokeStyle(1, 0x3c4f72, 0.8);
      this.add.container(0, 0, [cardBg, card]);

      // Character preview
      const charKey = 'char_' + id + '_idle';
      if (this.textures.exists(charKey)) {
        this.add.image(x, y - 110, charKey).setDisplaySize(72, 72);
      } else {
        this.add.circle(x, y - 110, 38, cls.color);
      }

      this.add.text(x, y - 50, cls.name, {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff'
      }).setOrigin(0.5);

      this.add.text(x, y + 10, cls.description, {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '13px',
        color: '#aaaabb',
        align: 'center',
        wordWrap: { width: 170 }
      }).setOrigin(0.5);

      const stats = cls.baseStats;
      this.add.text(x, y + 90, 'HP ' + stats.maxHp + '   SPD ' + stats.speed + '\nDMG ' + stats.damage, {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '13px',
        color: '#88bbff',
        align: 'center'
      }).setOrigin(0.5);

      this.add.text(x, y + 140, 'Click to play', {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '12px',
        color: '#c8d7ff'
      }).setOrigin(0.5);

      card.on('pointerover', () => {
        card.setFillStyle(0x1e1e3a);
        card.setScale(1.03);
      });
      card.on('pointerout', () => {
        card.setFillStyle(0x141428);
        card.setScale(1);
      });
      card.on('pointerdown', () => {
        if (this.startingGame) return; // tránh bấm nhiều lần khi đang chờ refetch nâng cấp
        this.startingGame = true;
        this.startGameWithFreshUpgrades(id);
      });
    });

    const backBtn = this.add.text(70, height - 36, '← Back', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '18px',
      color: '#9999bb'
    }).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.scene.start('TitleScene'));
  }

  // Đảm bảo các cấp Nâng Cấp (Sức Mạnh/Sinh Lực/Nhanh Nhẹn) mới nhất từ server trước
  // khi vào game — tránh trường hợp người chơi vừa mua nâng cấp ở Shop rồi bấm Play
  // ngay, lúc window.AuthAPI.user.upgrades chưa kịp cập nhật từ lần fetch nền trước đó.
  async startGameWithFreshUpgrades(classId) {
    if (window.AuthAPI && window.AuthAPI.token && window.AuthAPI.user && !window.AuthAPI.user.guest) {
      try {
        const { inventory } = await window.AuthAPI.getInventory();
        const upgrades = {};
        inventory.forEach(item => { upgrades[item.itemKey] = item.quantity; });
        window.AuthAPI.user.upgrades = upgrades;
        localStorage.setItem('vs_user', JSON.stringify(window.AuthAPI.user));
      } catch (e) {
        // Lỗi mạng/token — vẫn cho vào game với các cấp nâng cấp đã có sẵn, không chặn người chơi.
      }
    }
    this.scene.start('GameScene', { classId, difficulty: this.selectedDiff });
  }
}
