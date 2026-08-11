# Survivors - Vampire Survivors Style Game

Game web dùng Phaser 3, 4 class, hệ thống Weapon + Passive + Evolution, chế độ chơi đơn và Cloud Save.

## Cách chạy

1. Mở file `index.html` bằng trình duyệt (Chrome / Edge / Firefox)
2. Hoặc dùng Live Server trong VS Code

## Điều khiển

- **WASD** hoặc **Arrow Keys**: Di chuyển
- **ESC** / **P**: Pause
- **M**: Bật/tắt tiếng

## Class

1. **Archer** – Bắn xa, tốc độ cao
2. **Swordsman** – Cận chiến, sát thương cao
3. **Engineer** – Súng + Turret + Drone + Mine
4. **Mage** – Phép AoE, chain, aura

## Tính năng

- Level up chọn Weapon / Passive
- Evolution khi đủ cặp Weapon + Passive
- Boss xuất hiện định kỳ
- Minimap
- Độ khó Easy / Normal / Hard
- Lưu high score (localStorage)
- Âm thanh cơ bản (Web Audio)

## Cập nhật mới
- **Touch control cho mobile**: joystick ảo góc trái dưới màn hình (tự ẩn khi ở menu/pause/level-up), nút Pause dạng nút bấm ở góc phải, canvas giờ full màn hình thật (RESIZE) thay vì khung cố định 1280x720.
- **Đa dạng hoá quái thường**: 5 loại — Grunt (thường), Bat (nhanh, máu mỏng), Ogre (trâu bò, chậm), Cultist (đứng bắn xa), Rat (rất yếu nhưng đông), xuất hiện dần theo thời gian sống sót.
- **Đa dạng hoá boss**: 3 boss riêng biệt xoay vòng — Blood Reaper (lao thẳng/dash cực nhanh), Void Colossus (triệu hồi thêm quái nhỏ), Storm Dragon (bắn loạt đạn toả tròn tầm xa).

## Deploy Azure

- **Netlify**: Kéo thả cả thư mục vào netlify.com/drop
- **GitHub Pages**: Push lên repo → Settings → Pages
- **itch.io**: Upload dạng HTML

## Cấu trúc

```
index.html
js/
  config.js
  data.js          # Class, Weapon, Passive, Evolution
  main.js
  scenes/
    BootScene.js
    TitleScene.js
    ClassSelectScene.js
    GameScene.js   # Logic chính
    ResultScene.js
```

