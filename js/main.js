// Khởi tạo game
const game = new Phaser.Game({
  ...PHASER_CONFIG,
  scene: [BootScene, TitleScene, ClassSelectScene, GameScene, ResultScene]
});

// Cho phép AuthAPI/Cloud Save điều khiển scene từ UI HTML.
window.game = game;
