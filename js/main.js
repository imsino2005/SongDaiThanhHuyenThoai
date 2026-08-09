// Khởi tạo game
const game = new Phaser.Game({
  ...PHASER_CONFIG,
  scene: [BootScene, TitleScene, ClassSelectScene, GameScene, ResultScene]
});
