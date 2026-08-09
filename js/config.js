const GAME_WIDTH = window.innerWidth;
const GAME_HEIGHT = window.innerHeight;

const PHASER_CONFIG = {
  type: Phaser.AUTO, // ưu tiên WEBGL → bật được shader FX (Glow...)
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#0d0d1a',
  scale: {
    mode: Phaser.Scale.RESIZE, // full màn hình thật, không viền đen trên mobile
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false
  },
  scene: []
};
