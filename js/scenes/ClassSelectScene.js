class ClassSelectScene extends Phaser.Scene {
  constructor() {
    super('ClassSelectScene');
  }

  init() {
  }

  create() {
    // Reset lại cờ chặn double-click mỗi khi vào scene này — nếu không reset,
    // sau lần đầu chọn nhân vật (startingGame = true), những lần quay lại
    // ClassSelectScene sau đó (vd bấm "Chơi lại" từ ResultScene) sẽ không
    // bấm chọn được nhân vật nào nữa vì Phaser tái sử dụng cùng scene instance.
    this.startingGame = false;

    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a18);

    // Vài quầng sáng mờ phía sau để đồng bộ tông màu với màn hình Menu chính,
    // tránh cảm giác nền trơn tách biệt hẳn khỏi Title.
    const bgGlow = this.add.graphics();
    bgGlow.fillStyle(0x2f1f75, 0.1);
    bgGlow.fillCircle(width * 0.12, height * 0.15, 200);
    bgGlow.fillStyle(0x5588ff, 0.08);
    bgGlow.fillCircle(width * 0.9, height * 0.85, 220);

    const title = this.add.text(width / 2, 50, 'CHỌN CLASS', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#f0f0ff',
      shadow: { offsetX: 0, offsetY: 0, color: '#4a47ff', blur: 18, stroke: true, fill: true }
    }).setOrigin(0.5).setAlpha(0).setScale(0.85);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 400, ease: 'Back.Out' });

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
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0);
      this.tweens.add({ targets: btn, alpha: 1, duration: 300, delay: 120 + i * 60, ease: 'Cubic.Out' });

      btn.on('pointerover', () => { if (this.selectedDiff !== d.id) btn.setStyle({ backgroundColor: '#25253f' }); });
      btn.on('pointerout', () => { if (this.selectedDiff !== d.id) btn.setStyle({ backgroundColor: '#1a1a2a' }); });
      btn.on('pointerdown', () => {
        this.selectedDiff = d.id;
        this.diffButtons.forEach((b, j) => {
          b.setStyle({
            color: diffs[j].id === this.selectedDiff ? '#ffffff' : '#888899',
            backgroundColor: diffs[j].id === this.selectedDiff ? '#333355' : '#1a1a2a'
          });
          b.setScale(diffs[j].id === this.selectedDiff ? 1 : 1);
        });
        this.tweens.add({ targets: btn, scale: { from: 1.15, to: 1 }, duration: 180, ease: 'Back.Out' });
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
      const CARD_H = 360;

      // ---- Border-glow theo màu class thay cho khung viền phẳng ----
      // Glow vẽ bằng Graphics riêng (nằm dưới card), nhấp nháy chậm liên
      // tục để mỗi thẻ có "sức sống" ngay cả khi chưa hover; khi hover thì
      // glow bừng sáng rõ hơn hẳn.
      const glow = this.add.graphics().setAlpha(0);
      const drawGlow = (thickness, alpha) => {
        glow.clear();
        glow.lineStyle(thickness, cls.color, alpha);
        glow.strokeRoundedRect(x - cardW / 2 - thickness, y - CARD_H / 2 - thickness,
          cardW + thickness * 2, CARD_H + thickness * 2, 14);
      };
      drawGlow(3, 0.35);
      const glowState = { t: 3, a: 0.35 };
      const idleGlowTween = this.tweens.add({
        targets: glowState,
        t: 6, a: 0.15,
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => drawGlow(glowState.t, glowState.a)
      });

      const card = this.add.rectangle(x, y, cardW, CARD_H, 0x142033)
        .setStrokeStyle(2, cls.color, 0.55)
        .setInteractive({ useHandCursor: true }).setAlpha(0);

      const cardBg = this.add.rectangle(x, y, cardW - 12, 340, 0x101822, 0.7).setStrokeStyle(1, 0x3c4f72, 0.8).setAlpha(0);
      this.add.container(0, 0, [cardBg, card]);

      // Character preview — bobbing nhẹ liên tục để thẻ có sức sống, không đứng im hoàn toàn
      const charKey = 'char_' + id + '_idle';
      let charObj;
      if (this.textures.exists(charKey)) {
        charObj = this.add.image(x, y - 110, charKey).setDisplaySize(72, 72).setAlpha(0);
      } else {
        charObj = this.add.circle(x, y - 110, 38, cls.color).setAlpha(0);
      }
      const bobTween = this.tweens.add({
        targets: charObj, y: y - 118, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 650 + i * 100
      });

      const nameText = this.add.text(x, y - 50, cls.name, {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff'
      }).setOrigin(0.5).setAlpha(0);

      const descText = this.add.text(x, y + 10, cls.description, {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '13px',
        color: '#aaaabb',
        align: 'center',
        wordWrap: { width: 170 }
      }).setOrigin(0.5).setAlpha(0);

      const stats = cls.baseStats;
      const statsText = this.add.text(x, y + 90, 'HP ' + stats.maxHp + '   SPD ' + stats.speed + '\nDMG ' + stats.damage, {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '13px',
        color: '#88bbff',
        align: 'center'
      }).setOrigin(0.5).setAlpha(0);

      const playHint = this.add.text(x, y + 140, 'Click to play', {
        fontFamily: 'Segoe UI, Arial',
        fontSize: '12px',
        color: '#c8d7ff'
      }).setOrigin(0.5).setAlpha(0);
      // Nhấp nháy mời gọi bấm, lệch nhịp theo từng thẻ cho đỡ đồng loạt máy móc
      this.tweens.add({
        targets: playHint, alpha: { from: 1, to: 0.35 }, duration: 900, yoyo: true, repeat: -1,
        ease: 'Sine.InOut', delay: 900 + i * 150
      });

      // Entrance: cả thẻ trượt nhẹ từ dưới lên + fade in, so le theo thứ tự class
      const cardElems = [cardBg, card, charObj, nameText, descText, statsText, playHint, glow];
      cardElems.forEach(o => { o.y += 24; });
      this.tweens.add({ targets: cardElems, y: '-=24', duration: 380, delay: 150 + i * 90, ease: 'Cubic.Out' });
      this.tweens.add({ targets: [cardBg, card, charObj, nameText, descText, statsText, playHint], alpha: 1, duration: 380, delay: 150 + i * 90, ease: 'Cubic.Out' });
      this.tweens.add({ targets: glow, alpha: 1, duration: 380, delay: 150 + i * 90, ease: 'Cubic.Out' });

      card.on('pointerover', () => {
        card.setFillStyle(0x1e1e3a);
        card.setScale(1.03);
        idleGlowTween.pause();
        drawGlow(7, 0.75);
      });
      card.on('pointerout', () => {
        card.setFillStyle(0x141428);
        card.setScale(1);
        idleGlowTween.resume();
      });
      card.on('pointerdown', () => {
        if (this.startingGame) return; // tránh bấm nhiều lần khi đang chờ refetch nâng cấp
        this.startingGame = true;
        bobTween.pause();
        this.startGameWithFreshUpgrades(id);
      });

      this._classCardTweens = this._classCardTweens || [];
      this._classCardTweens.push(idleGlowTween, bobTween);
    });

    const backBtn = this.add.text(70, height - 36, '← Back', {
      fontFamily: 'Segoe UI, Arial',
      fontSize: '18px',
      color: '#9999bb'
    }).setInteractive({ useHandCursor: true });
    backBtn.on('pointerover', () => backBtn.setStyle({ color: '#ffffff' }));
    backBtn.on('pointerout', () => backBtn.setStyle({ color: '#9999bb' }));
    backBtn.on('pointerdown', async () => {
      this.scene.start('TitleScene');
    });
  }

  shutdown() {
    if (this._classCardTweens) {
      this._classCardTweens.forEach(t => t.stop());
      this._classCardTweens = null;
    }
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
        // Lỗi mạng/token — vẫn cho vào game với các nâng cấp đã có sẵn.
      }
    }

    this.scene.start('GameScene', {
      classId,
      difficulty: this.selectedDiff
    });
  }

}
