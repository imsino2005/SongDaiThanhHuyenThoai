// ====================== UPGRADE DATA (Shop) ======================
// Nâng cấp vĩnh viễn mua bằng Gold trong Shop, cộng dồn theo cấp (level),
// áp dụng cho MỌI nhân vật/lượt chơi sau khi mua (đọc lại lúc vào GameScene).
// Giá tăng dần theo cấp hiện có: price(level) = round(basePrice * priceGrowth^level).
const UPGRADE_DEFS = {
  power_boost: {
    key: 'power_boost', name: 'Sức Mạnh', icon: '⚔️', statKey: 'damage',
    bonusPerLevel: 0.04, maxLevel: 10, basePrice: 80, priceGrowth: 1.35,
    description: 'Tăng 4% sát thương gây ra mỗi cấp.'
  },
  vitality_boost: {
    key: 'vitality_boost', name: 'Sinh Lực', icon: '❤️', statKey: 'maxHp',
    bonusPerLevel: 0.05, maxLevel: 10, basePrice: 80, priceGrowth: 1.35,
    description: 'Tăng 5% máu tối đa mỗi cấp.'
  },
  agility_boost: {
    key: 'agility_boost', name: 'Nhanh Nhẹn', icon: '💨', statKey: 'speed',
    bonusPerLevel: 0.03, maxLevel: 10, basePrice: 80, priceGrowth: 1.35,
    description: 'Tăng 3% tốc độ di chuyển mỗi cấp.'
  },
  wisdom_boost: {
    key: 'wisdom_boost', name: 'Thông Thái', icon: '📖', statKey: 'xpGain',
    bonusPerLevel: 0.05, maxLevel: 10, basePrice: 90, priceGrowth: 1.35,
    description: 'Tăng 5% lượng EXP nhận được mỗi cấp.'
  },
  magnetism_boost: {
    key: 'magnetism_boost', name: 'Từ Trường', icon: '🧲', statKey: 'pickupRange',
    bonusPerLevel: 0.08, maxLevel: 10, basePrice: 70, priceGrowth: 1.3,
    description: 'Tăng 8% tầm hút vật phẩm mỗi cấp.'
  }
};

// Trả về giá Gold cần trả để mua cấp tiếp theo, dựa trên cấp hiện đang sở hữu.
function getUpgradePrice(def, currentLevel) {
  return Math.round(def.basePrice * Math.pow(def.priceGrowth, currentLevel));
}

// ====================== CLASS DATA ======================
const CLASSES = {
  archer: {
    id: 'archer',
    name: 'Kiệt Xạ Thủ',
    color: 0x4ade80,
    description: 'Tấn công từ xa, tốc độ cao, bắn nhanh',
    baseStats: { maxHp: 100, speed: 180, damage: 12, attackSpeed: 0.45 },
    startWeapon: 'wooden_bow'
  },
  swordsman: {
    id: 'swordsman',
    name: 'Huy Máy Chém',
    color: 0xf87171,
    description: 'Cận chiến, sát thương cao, bền bỉ',
    baseStats: { maxHp: 140, speed: 150, damage: 22, attackSpeed: 0.7 },
    startWeapon: 'iron_sword'
  },
  engineer: {
    id: 'engineer',
    name: 'Thuận Thợ Đụng',
    color: 0x60a5fa,
    description: 'Chỉ đặt trụ — Turret / Drone / Mine tự động đánh',
    baseStats: { maxHp: 130, speed: 150, damage: 16, attackSpeed: 0.6 },
    startWeapon: 'turret_kit'
  },
  mage: {
    id: 'mage',
    name: 'Phước Ma Chít',
    color: 0xc084fc,
    description: 'Phép thuật AoE mạnh, hiệu ứng khống chế',
    baseStats: { maxHp: 90, speed: 160, damage: 18, attackSpeed: 0.65 },
    startWeapon: 'magic_missile'
  }
};

// ====================== ACHIEVEMENTS ======================
// Mỗi thành tựu có key (định danh lưu ở server), title/description hiển thị,
// và check(stats) chạy ở client khi kết thúc trận (GameScene -> ResultScene)
// để xác định trận vừa rồi có đạt điều kiện hay không. Vài thành tựu (vd mua nâng cấp)
// không dựa trên stats 1 trận nên check() luôn trả false — được mở khoá thủ công
// ở đúng chỗ xảy ra hành động đó (vd trong Shop khi mua thành công).
const ACHIEVEMENT_DEFS = [
  {
    key: 'first_blood',
    title: 'Vấy Máu Đầu Tiên',
    description: 'Hạ gục kẻ địch đầu tiên.',
    icon: '🗡️',
    check: (s) => s.kills >= 1
  },
  {
    key: 'slayer_50',
    title: 'Sát Thủ Săn Quái',
    description: 'Hạ gục 50 kẻ địch trong 1 trận.',
    icon: '⚔️',
    check: (s) => s.kills >= 50
  },
  {
    key: 'slayer_200',
    title: 'Cỗ Máy Diệt Quái',
    description: 'Hạ gục 200 kẻ địch trong 1 trận.',
    icon: '💀',
    check: (s) => s.kills >= 200
  },
  {
    key: 'level_10',
    title: 'Tôi Luyện',
    description: 'Đạt Level 10 trong 1 trận.',
    icon: '⭐',
    check: (s) => s.level >= 10
  },
  {
    key: 'level_20',
    title: 'Đỉnh Cao Sức Mạnh',
    description: 'Đạt Level 20 trong 1 trận.',
    icon: '🌟',
    check: (s) => s.level >= 20
  },
  {
    key: 'survivor_5',
    title: 'Kiên Cường',
    description: 'Sống sót 5 phút trong 1 trận.',
    icon: '🛡️',
    check: (s) => s.timeAlive >= 300
  },
  {
    key: 'survivor_10',
    title: 'Bất Tử',
    description: 'Sống sót 10 phút trong 1 trận.',
    icon: '⏳',
    check: (s) => s.timeAlive >= 600
  },
  {
    key: 'boss_slayer',
    title: 'Khắc Tinh Trùm',
    description: 'Hạ gục 1 Boss.',
    icon: '👑',
    check: (s) => s.bossKills >= 1
  },
  {
    key: 'hard_mode',
    title: 'Không Ngán Khó',
    description: 'Sống sót 5 phút ở độ khó Hard.',
    icon: '🔥',
    check: (s) => s.difficulty === 'hard' && s.timeAlive >= 300
  },
  {
    key: 'chest_hunter',
    title: 'Thợ Săn Rương',
    description: 'Mở 5 rương báu trong 1 trận.',
    icon: '🎁',
    check: (s) => s.chestsOpened >= 5
  },
  {
    key: 'all_classes',
    title: 'Toàn Năng',
    description: 'Chơi thử qua cả 4 class.',
    icon: '🎭',
    check: (s) => !!s.allClassesPlayed
  },
  {
    key: 'first_purchase',
    title: 'Khách Sộp',
    description: 'Mua thành công 1 cấp Nâng Cấp tại Kho Đồ.',
    icon: '🛍️',
    check: () => false
  }
];

const MAX_WEAPONS = 5;
const MAX_PASSIVES = 5;
const MAX_WEAPON_LEVEL = 5;
const LEVELUP_CHOICES = 3;

// ====================== HP REGEN / DROP CONFIG ======================
const HP_REGEN_PER_SEC = 1;       // tất cả class tự hồi 1 máu mỗi giây
const MAGNET_DROP_CHANCE = 0.05;  // quái thường: 5% rớt ra Nam Châm (hút hết EXP chưa lụm)
const CHEST_ROLL_CHOICES = 3;     // số passive để chọn khi mở rương boss

// ====================== EXP TUNING ======================
const ENEMY_XP_TIME_SCALE_MS = 240000; // quái thường: EXP nhân theo % (x2 mỗi 4 phút) thay vì cộng cứng, giữ chênh lệch giữa các loại quái
const BOSS_XP_BASE = 45;               // EXP gốc của boss — tăng từ 12 lên 45 cho xứng đáng với độ khó/rủi ro

// ====================== WEAPONS (nhiều hơn, mỗi class ~7) ======================
const WEAPONS = {
  // ----- ARCHER (7) -----
  wooden_bow: {
    id: 'wooden_bow', name: 'Wooden Bow', class: 'archer', type: 'ranged',
    damage: 11, cooldown: 480, projectileSpeed: 420, count: 1, pierce: 0,
    maxLevel: 5, vfx: 'arrow',
    description: 'Bắn 1 mũi tên về phía quái gần nhất',
    levelBonus: 'Mỗi level: +damage, -cooldown nhẹ'
  },
  crossbow: {
    id: 'crossbow', name: 'Crossbow', class: 'archer', type: 'ranged',
    damage: 26, cooldown: 920, projectileSpeed: 500, count: 1, pierce: 0,
    maxLevel: 5, vfx: 'arrow',
    description: 'Sát thương cao, bắn chậm',
    levelBonus: 'Mỗi level: +damage mạnh'
  },
  twin_bow: {
    id: 'twin_bow', name: 'Twin Bow', class: 'archer', type: 'ranged',
    damage: 9, cooldown: 520, projectileSpeed: 400, count: 2, pierce: 0,
    maxLevel: 5, vfx: 'arrow',
    description: 'Bắn 2 mũi tên cùng lúc',
    levelBonus: 'Mỗi level: +1 mũi tên (tối đa +2)'
  },
  explosive_bow: {
    id: 'explosive_bow', name: 'Explosive Bow', class: 'archer', type: 'ranged',
    damage: 16, cooldown: 720, projectileSpeed: 380, count: 1, pierce: 0,
    explosionRadius: 75, maxLevel: 5, vfx: 'explode',
    description: 'Mũi tên nổ khi chạm quái',
    levelBonus: 'Mỗi level: +vùng nổ'
  },
  storm_bow: {
    id: 'storm_bow', name: 'Storm Bow', class: 'archer', type: 'ranged',
    damage: 13, cooldown: 560, projectileSpeed: 450, count: 1, pierce: 2,
    maxLevel: 5, vfx: 'pierce',
    description: 'Mũi tên xuyên quái',
    levelBonus: 'Mỗi level: +pierce'
  },
  sniper_bow: {
    id: 'sniper_bow', name: 'Sniper Bow', class: 'archer', type: 'ranged',
    damage: 40, cooldown: 1400, projectileSpeed: 650, count: 1, pierce: 1,
    maxLevel: 5, vfx: 'arrow',
    description: 'Bắn cực mạnh, tầm xa, hồi chiêu lâu',
    levelBonus: 'Mỗi level: +damage, +tốc độ đạn'
  },
  fan_shot: {
    id: 'fan_shot', name: 'Fan Shot', class: 'archer', type: 'ranged',
    damage: 8, cooldown: 600, projectileSpeed: 390, count: 5, spread: 50,
    maxLevel: 5, vfx: 'arrow',
    description: 'Bắn quạt 5 mũi tên',
    levelBonus: 'Mỗi level: +spread control + damage'
  },

  // ----- SWORDSMAN (7) -----
  iron_sword: {
    id: 'iron_sword', name: 'Iron Sword', class: 'swordsman', type: 'melee',
    damage: 20, cooldown: 700, range: 68, maxLevel: 5, vfx: 'slash',
    description: 'Chém phía trước',
    levelBonus: 'Mỗi level: +damage, +range nhẹ'
  },
  greatsword: {
    id: 'greatsword', name: 'Greatsword', class: 'swordsman', type: 'melee',
    damage: 42, cooldown: 1200, range: 100, maxLevel: 5, vfx: 'slash',
    description: 'Chém chậm, sát thương và phạm vi lớn',
    levelBonus: 'Mỗi level: +damage, +range'
  },
  dual_blades: {
    id: 'dual_blades', name: 'Dual Blades', class: 'swordsman', type: 'melee',
    damage: 13, cooldown: 340, range: 58, maxLevel: 5, vfx: 'slash',
    description: 'Chém cực nhanh',
    levelBonus: 'Mỗi level: -cooldown'
  },
  spinning_blade: {
    id: 'spinning_blade', name: 'Spinning Blade', class: 'swordsman', type: 'orbit',
    damage: 15, cooldown: 100, range: 88, maxLevel: 5, vfx: 'orbit',
    description: 'Kiếm xoay quanh người',
    levelBonus: 'Mỗi level: +damage, +range'
  },
  blood_sword: {
    id: 'blood_sword', name: 'Blood Sword', class: 'swordsman', type: 'melee',
    damage: 18, cooldown: 650, range: 72, lifesteal: 0.12, maxLevel: 5, vfx: 'slash',
    description: 'Hút máu khi đánh trúng',
    levelBonus: 'Mỗi level: +lifesteal, +damage'
  },
  shockwave: {
    id: 'shockwave', name: 'Shockwave', class: 'swordsman', type: 'melee',
    damage: 24, cooldown: 900, range: 110, maxLevel: 5, vfx: 'wave',
    description: 'Chém ra sóng xung kích',
    levelBonus: 'Mỗi level: +range sóng'
  },
  blade_wall: {
    id: 'blade_wall', name: 'Blade Wall', class: 'swordsman', type: 'melee',
    damage: 16, cooldown: 1100, range: 130, maxLevel: 5, vfx: 'slash',
    description: 'Tường kiếm phía trước trong chớp mắt',
    levelBonus: 'Mỗi level: +damage, +width'
  },

  // ----- ENGINEER (7) pure summon -----
  turret_kit: {
    id: 'turret_kit', name: 'Turret Kit', class: 'engineer', type: 'summon',
    damage: 18, cooldown: 3600, maxTurrets: 2, maxLevel: 5, vfx: 'summon',
    description: 'Đặt trụ súng tự động bắn',
    levelBonus: 'Mỗi level: +damage trụ, -cooldown đặt'
  },
  drone: {
    id: 'drone', name: 'Drone', class: 'engineer', type: 'summon',
    damage: 11, cooldown: 4200, maxLevel: 5, vfx: 'summon',
    description: 'Triệu hồi drone bay quanh người tự bắn',
    levelBonus: 'Mỗi level: +damage, thêm slot drone'
  },
  mine_layer: {
    id: 'mine_layer', name: 'Mine Layer', class: 'engineer', type: 'summon',
    damage: 42, cooldown: 2800, maxLevel: 5, vfx: 'explode',
    description: 'Đặt mìn — nổ khi quái chạm',
    levelBonus: 'Mỗi level: +damage nổ, -cooldown'
  },
  repair_bot: {
    id: 'repair_bot', name: 'Repair Bot', class: 'engineer', type: 'summon',
    damage: 8, cooldown: 5500, maxTurrets: 1, maxLevel: 5, vfx: 'heal',
    description: 'Đặt trụ phụ + hồi máu nhẹ',
    levelBonus: 'Mỗi level: +heal, +trụ phụ'
  },
  tesla_coil: {
    id: 'tesla_coil', name: 'Tesla Coil', class: 'engineer', type: 'summon',
    damage: 14, cooldown: 4500, maxTurrets: 2, maxLevel: 5, vfx: 'lightning',
    description: 'Trụ điện — sét nhảy giữa quái gần',
    levelBonus: 'Mỗi level: +chain, +damage'
  },
  mortar: {
    id: 'mortar', name: 'Mortar', class: 'engineer', type: 'summon',
    damage: 35, cooldown: 5000, maxTurrets: 1, maxLevel: 5, vfx: 'explode',
    description: 'Trụ pháo — bắn đạn nổ tầm xa chậm',
    levelBonus: 'Mỗi level: +vùng nổ, +damage'
  },
  shield_generator: {
    id: 'shield_generator', name: 'Shield Generator', class: 'engineer', type: 'summon',
    damage: 5, cooldown: 8000, maxTurrets: 1, maxLevel: 5, vfx: 'aura',
    description: 'Trụ khiên — giảm damage nhận gần trụ',
    levelBonus: 'Mỗi level: +giảm damage, +radius'
  },

  // ----- MAGE (7) -----
  magic_missile: {
    id: 'magic_missile', name: 'Magic Missile', class: 'mage', type: 'ranged',
    damage: 15, cooldown: 560, projectileSpeed: 360, count: 1, maxLevel: 5, vfx: 'orb',
    description: 'Cầu phép đơn',
    levelBonus: 'Mỗi level: +count nhẹ, +damage'
  },
  fireball: {
    id: 'fireball', name: 'Fireball', class: 'mage', type: 'ranged',
    damage: 24, cooldown: 900, projectileSpeed: 320, explosionRadius: 95, maxLevel: 5, vfx: 'fire',
    description: 'Cầu lửa nổ AoE',
    levelBonus: 'Mỗi level: +vùng nổ, +damage'
  },
  lightning_orb: {
    id: 'lightning_orb', name: 'Lightning Orb', class: 'mage', type: 'ranged',
    damage: 13, cooldown: 720, projectileSpeed: 300, chain: 3, maxLevel: 5, vfx: 'lightning',
    description: 'Sét nhảy giữa các quái',
    levelBonus: 'Mỗi level: +chain'
  },
  ice_shard: {
    id: 'ice_shard', name: 'Ice Shard', class: 'mage', type: 'ranged',
    damage: 11, cooldown: 500, projectileSpeed: 400, count: 3, slow: 0.35, maxLevel: 5, vfx: 'ice',
    description: 'Băng làm chậm + sát thương',
    levelBonus: 'Mỗi level: +count, +slow'
  },
  arcane_aura: {
    id: 'arcane_aura', name: 'Arcane Aura', class: 'mage', type: 'aura',
    damage: 7, cooldown: 200, range: 105, maxLevel: 5, vfx: 'aura',
    description: 'Vòng phép sát thương quanh người',
    levelBonus: 'Mỗi level: +range, +damage'
  },
  meteor_seed: {
    id: 'meteor_seed', name: 'Meteor Seed', class: 'mage', type: 'ranged',
    damage: 45, cooldown: 1600, projectileSpeed: 200, explosionRadius: 120, maxLevel: 5, vfx: 'fire',
    description: 'Thiên thạch chậm nhưng cực mạnh',
    levelBonus: 'Mỗi level: +damage, +AoE'
  },
  frost_nova: {
    id: 'frost_nova', name: 'Frost Nova', class: 'mage', type: 'aura',
    damage: 18, cooldown: 2500, range: 140, slow: 0.5, maxLevel: 5, vfx: 'ice',
    description: 'Bùng nổ băng quanh người theo chu kỳ',
    levelBonus: 'Mỗi level: +range, +slow duration'
  }
};

// ====================== PASSIVES ======================
const PASSIVES = {
  bracer: { id: 'bracer', name: 'Bracer', effect: 'attackSpeed', value: 0.12, description: '+12% tốc độ đánh' },
  spinach: { id: 'spinach', name: 'Spinach', effect: 'damage', value: 0.15, description: '+15% sát thương' },
  clover: { id: 'clover', name: 'Clover', effect: 'crit', value: 0.08, description: '+8% chí mạng' },
  candelabrador: { id: 'candelabrador', name: 'Candelabrador', effect: 'area', value: 0.15, description: '+15% phạm vi' },
  empty_tome: { id: 'empty_tome', name: 'Empty Tome', effect: 'cooldown', value: 0.1, description: '-10% hồi chiêu / +tốc đánh' },
  wings: { id: 'wings', name: 'Wings', effect: 'speed', value: 0.12, description: '+12% tốc độ di chuyển' },
  armor: { id: 'armor', name: 'Armor', effect: 'armor', value: 0.1, description: '-10% sát thương nhận' },
  hollow_heart: { id: 'hollow_heart', name: 'Hollow Heart', effect: 'maxHp', value: 0.15, description: '+15% máu tối đa' },
  pummarola: { id: 'pummarola', name: 'Pummarola', effect: 'lifesteal', value: 0.05, description: '+5% hút máu' },
  spellbinder: { id: 'spellbinder', name: 'Spellbinder', effect: 'duration', value: 0.2, description: '+20% thời gian / hiệu ứng' },
  wisdom: { id: 'wisdom', name: 'Wisdom', effect: 'xpGain', value: 0.15, description: '+15% XP nhận được' },
  attractorb: { id: 'attractorb', name: 'Attractorb', effect: 'pickup', value: 0.25, description: '+25% tầm hút gem' }
};

// ====================== EVOLUTIONS (cần weapon MAX LEVEL + passive) ======================
const EVOLUTIONS = {
  // Archer
  phantom_bow: {
    id: 'phantom_bow', name: 'Phantom Bow',
    requires: { weapon: 'wooden_bow', passive: 'bracer', weaponMax: true },
    base: 'wooden_bow', type: 'ranged',
    damage: 18, cooldown: 260, pierce: 4, count: 1, projectileSpeed: 480, vfx: 'pierce',
    description: 'Bắn cực nhanh + xuyên quái'
  },
  heavy_crossbow: {
    id: 'heavy_crossbow', name: 'Heavy Crossbow',
    requires: { weapon: 'crossbow', passive: 'spinach', weaponMax: true },
    base: 'crossbow', type: 'ranged',
    damage: 55, cooldown: 800, projectileSpeed: 520, vfx: 'arrow',
    description: 'Sát thương rất cao + đẩy lùi'
  },
  heavens_rain: {
    id: 'heavens_rain', name: "Heaven's Rain",
    requires: { weapon: 'twin_bow', passive: 'clover', weaponMax: true },
    base: 'twin_bow', type: 'ranged',
    damage: 12, cooldown: 580, count: 10, spread: 40, projectileSpeed: 400, vfx: 'arrow',
    description: 'Mưa tên diện rộng'
  },
  dragon_arrow: {
    id: 'dragon_arrow', name: 'Dragon Arrow',
    requires: { weapon: 'explosive_bow', passive: 'candelabrador', weaponMax: true },
    base: 'explosive_bow', type: 'ranged',
    damage: 28, cooldown: 620, explosionRadius: 140, projectileSpeed: 380, vfx: 'explode',
    description: 'Nổ lớn + đốt cháy'
  },
  tempest_bow: {
    id: 'tempest_bow', name: 'Tempest Bow',
    requires: { weapon: 'storm_bow', passive: 'empty_tome', weaponMax: true },
    base: 'storm_bow', type: 'ranged',
    damage: 20, cooldown: 380, pierce: 6, projectileSpeed: 500, vfx: 'pierce',
    description: 'Mũi tên xé gió + xuyên mạnh'
  },
  death_sniper: {
    id: 'death_sniper', name: 'Death Sniper',
    requires: { weapon: 'sniper_bow', passive: 'spinach', weaponMax: true },
    base: 'sniper_bow', type: 'ranged',
    damage: 90, cooldown: 1100, pierce: 3, projectileSpeed: 700, vfx: 'arrow',
    description: 'Bắn chết chóc — sát thương cực đại'
  },
  hurricane_fan: {
    id: 'hurricane_fan', name: 'Hurricane Fan',
    requires: { weapon: 'fan_shot', passive: 'bracer', weaponMax: true },
    base: 'fan_shot', type: 'ranged',
    damage: 14, cooldown: 480, count: 9, spread: 60, projectileSpeed: 420, vfx: 'arrow',
    description: 'Bão tên — quạt dày đặc'
  },

  // Swordsman
  excalibur: {
    id: 'excalibur', name: 'Excalibur',
    requires: { weapon: 'iron_sword', passive: 'spinach', weaponMax: true },
    base: 'iron_sword', type: 'melee',
    damage: 36, cooldown: 600, range: 95, vfx: 'wave',
    description: 'Chém ra sóng kiếm bay xa'
  },
  titan_blade: {
    id: 'titan_blade', name: 'Titan Blade',
    requires: { weapon: 'greatsword', passive: 'armor', weaponMax: true },
    base: 'greatsword', type: 'melee',
    damage: 70, cooldown: 1000, range: 145, vfx: 'slash',
    description: 'Phạm vi cực lớn + sát thương khủng'
  },
  blade_dance: {
    id: 'blade_dance', name: 'Blade Dance',
    requires: { weapon: 'dual_blades', passive: 'bracer', weaponMax: true },
    base: 'dual_blades', type: 'melee',
    damage: 18, cooldown: 200, range: 70, vfx: 'slash',
    description: 'Chém liên hoàn cực nhanh'
  },
  blade_cyclone: {
    id: 'blade_cyclone', name: 'Blade Cyclone',
    requires: { weapon: 'spinning_blade', passive: 'candelabrador', weaponMax: true },
    base: 'spinning_blade', type: 'orbit',
    damage: 24, cooldown: 70, range: 130, vfx: 'orbit',
    description: 'Xoay hút quái + sát thương liên tục'
  },
  crimson_reaper: {
    id: 'crimson_reaper', name: 'Crimson Reaper',
    requires: { weapon: 'blood_sword', passive: 'pummarola', weaponMax: true },
    base: 'blood_sword', type: 'melee',
    damage: 30, cooldown: 520, range: 85, lifesteal: 0.28, vfx: 'slash',
    description: 'Hút máu mạnh + nổ máu'
  },
  quake_slash: {
    id: 'quake_slash', name: 'Quake Slash',
    requires: { weapon: 'shockwave', passive: 'candelabrador', weaponMax: true },
    base: 'shockwave', type: 'melee',
    damage: 40, cooldown: 750, range: 160, vfx: 'wave',
    description: 'Sóng địa chấn diện rộng'
  },
  iron_fortress: {
    id: 'iron_fortress', name: 'Iron Fortress',
    requires: { weapon: 'blade_wall', passive: 'armor', weaponMax: true },
    base: 'blade_wall', type: 'melee',
    damage: 28, cooldown: 900, range: 170, vfx: 'slash',
    description: 'Tường kiếm dày + phản sát thương nhẹ'
  },

  // Engineer
  fortress_turret: {
    id: 'fortress_turret', name: 'Fortress Turret',
    requires: { weapon: 'turret_kit', passive: 'armor', weaponMax: true },
    base: 'turret_kit', type: 'summon',
    damage: 34, cooldown: 2800, maxTurrets: 4, vfx: 'summon',
    description: 'Nhiều trụ hơn + sát thương cao'
  },
  assault_drone_swarm: {
    id: 'assault_drone_swarm', name: 'Assault Drone Swarm',
    requires: { weapon: 'drone', passive: 'wings', weaponMax: true },
    base: 'drone', type: 'summon',
    damage: 16, cooldown: 3200, vfx: 'summon',
    description: 'Tối đa 6 drone bắn liên thanh'
  },
  plasma_mine: {
    id: 'plasma_mine', name: 'Plasma Mine',
    requires: { weapon: 'mine_layer', passive: 'clover', weaponMax: true },
    base: 'mine_layer', type: 'summon',
    damage: 85, cooldown: 2000, vfx: 'explode',
    description: 'Mìn plasma nổ cực mạnh'
  },
  mega_repair_bot: {
    id: 'mega_repair_bot', name: 'Mega Repair Bot',
    requires: { weapon: 'repair_bot', passive: 'hollow_heart', weaponMax: true },
    base: 'repair_bot', type: 'summon',
    damage: 14, cooldown: 4500, maxTurrets: 2, vfx: 'heal',
    description: 'Bot lớn: nhiều trụ + hồi máu mạnh'
  },
  storm_coil: {
    id: 'storm_coil', name: 'Storm Coil',
    requires: { weapon: 'tesla_coil', passive: 'empty_tome', weaponMax: true },
    base: 'tesla_coil', type: 'summon',
    damage: 24, cooldown: 3600, maxTurrets: 3, vfx: 'lightning',
    description: 'Trụ sét mạnh — chain nhiều quái'
  },
  siege_mortar: {
    id: 'siege_mortar', name: 'Siege Mortar',
    requires: { weapon: 'mortar', passive: 'spinach', weaponMax: true },
    base: 'mortar', type: 'summon',
    damage: 60, cooldown: 4000, maxTurrets: 2, vfx: 'explode',
    description: 'Pháo công thành — nổ cực lớn'
  },
  aegis_generator: {
    id: 'aegis_generator', name: 'Aegis Generator',
    requires: { weapon: 'shield_generator', passive: 'armor', weaponMax: true },
    base: 'shield_generator', type: 'summon',
    damage: 8, cooldown: 6500, maxTurrets: 2, vfx: 'aura',
    description: 'Khiên mạnh — giảm damage lớn trong vùng'
  },

  // Mage
  arcane_barrage: {
    id: 'arcane_barrage', name: 'Arcane Barrage',
    requires: { weapon: 'magic_missile', passive: 'empty_tome', weaponMax: true },
    base: 'magic_missile', type: 'ranged',
    damage: 14, cooldown: 320, count: 5, projectileSpeed: 380, vfx: 'orb',
    description: 'Bắn nhiều cầu phép liên tục'
  },
  meteor: {
    id: 'meteor', name: 'Meteor',
    requires: { weapon: 'fireball', passive: 'spinach', weaponMax: true },
    base: 'fireball', type: 'ranged',
    damage: 58, cooldown: 1000, explosionRadius: 165, projectileSpeed: 280, vfx: 'fire',
    description: 'Thiên thạch cực mạnh'
  },
  chain_thunder: {
    id: 'chain_thunder', name: 'Chain Thunder',
    requires: { weapon: 'lightning_orb', passive: 'candelabrador', weaponMax: true },
    base: 'lightning_orb', type: 'ranged',
    damage: 18, cooldown: 520, chain: 7, projectileSpeed: 320, vfx: 'lightning',
    description: 'Sét nhảy rất nhiều lần'
  },
  absolute_zero: {
    id: 'absolute_zero', name: 'Absolute Zero',
    requires: { weapon: 'ice_shard', passive: 'spellbinder', weaponMax: true },
    base: 'ice_shard', type: 'ranged',
    damage: 18, cooldown: 420, count: 6, slow: 0.6, projectileSpeed: 420, vfx: 'ice',
    description: 'Đóng băng diện rộng'
  },
  void_zone: {
    id: 'void_zone', name: 'Void Zone',
    requires: { weapon: 'arcane_aura', passive: 'wisdom', weaponMax: true },
    base: 'arcane_aura', type: 'aura',
    damage: 14, cooldown: 140, range: 165, vfx: 'aura',
    description: 'Vùng hủy diệt quanh người'
  },
  armageddon: {
    id: 'armageddon', name: 'Armageddon',
    requires: { weapon: 'meteor_seed', passive: 'spinach', weaponMax: true },
    base: 'meteor_seed', type: 'ranged',
    damage: 90, cooldown: 1300, explosionRadius: 200, projectileSpeed: 220, vfx: 'fire',
    description: 'Mưa thiên thạch hủy diệt'
  },
  glacier: {
    id: 'glacier', name: 'Glacier',
    requires: { weapon: 'frost_nova', passive: 'spellbinder', weaponMax: true },
    base: 'frost_nova', type: 'aura',
    damage: 30, cooldown: 1800, range: 190, slow: 0.7, vfx: 'ice',
    description: 'Băng hà — đóng băng + damage lớn'
  }
};

// ====================== HELPERS ======================
function getWeaponsByClass(classId) {
  return Object.values(WEAPONS).filter(w => w.class === classId);
}

function getWeaponData(id) {
  return WEAPONS[id] || EVOLUTIONS[id] || null;
}

/** Evolution nếu weapon đạt max level + có đúng passive */
function getAvailableEvolutions(weaponLevels, ownedPassives) {
  const result = [];
  for (const evo of Object.values(EVOLUTIONS)) {
    const req = evo.requires;
    const lvl = weaponLevels[req.weapon] || 0;
    const maxLvl = (WEAPONS[req.weapon] && WEAPONS[req.weapon].maxLevel) || MAX_WEAPON_LEVEL;
    if (lvl >= maxLvl && ownedPassives.includes(req.passive)) {
      // chưa sở hữu evo và vẫn còn base (chưa evolve)
      if (!weaponLevels[evo.id] && weaponLevels[req.weapon]) {
        result.push(evo);
      }
    }
  }
  return result;
}

function getEvolutionForWeapon(weaponId) {
  for (const evo of Object.values(EVOLUTIONS)) {
    if (evo.requires.weapon === weaponId) return evo;
  }
  return null;
}

function getEvolutionsUsingPassive(passiveId) {
  return Object.values(EVOLUTIONS).filter(e => e.requires.passive === passiveId);
}

function getPassiveName(id) {
  return (PASSIVES[id] && PASSIVES[id].name) || id;
}

function getWeaponName(id) {
  const w = getWeaponData(id);
  return w ? w.name : id;
}

/** Scaled stats by weapon level 1..max */
function scaleWeaponStats(baseData, level) {
  if (!baseData) return baseData;
  const lv = Math.max(1, level || 1);
  const t = (lv - 1) / Math.max(1, (baseData.maxLevel || MAX_WEAPON_LEVEL) - 1); // 0..1
  const out = { ...baseData };
  out.damage = Math.round((baseData.damage || 10) * (1 + t * 0.9));
  if (baseData.cooldown) out.cooldown = Math.round(baseData.cooldown * (1 - t * 0.25));
  if (baseData.range) out.range = Math.round(baseData.range * (1 + t * 0.35));
  if (baseData.count) out.count = baseData.count + Math.floor(t * 2);
  if (baseData.pierce != null) out.pierce = (baseData.pierce || 0) + Math.floor(t * 2);
  if (baseData.explosionRadius) out.explosionRadius = Math.round(baseData.explosionRadius * (1 + t * 0.5));
  if (baseData.chain) out.chain = (baseData.chain || 0) + Math.floor(t * 2);
  if (baseData.slow) out.slow = Math.min(0.75, (baseData.slow || 0) + t * 0.15);
  if (baseData.lifesteal) out.lifesteal = (baseData.lifesteal || 0) + t * 0.1;
  if (baseData.maxTurrets) out.maxTurrets = (baseData.maxTurrets || 1) + Math.floor(t * 1.5);
  out._level = lv;
  return out;
}

// ====================== ENEMY TYPES (đa dạng hoá quái thường) ======================
// texture: key texture đã tạo ở BootScene. hpMul/spdMul/dmgMul nhân với công thức
// difficulty gốc trong spawnOneEnemy(). ranged=true -> đứng bắn xa thay vì lao vào.
const ENEMY_TYPES = {
  grunt: { texture: 'enemy', hpMul: 1, spdMul: 1, dmgMul: 1, xp: 1, radius: 10, weight: 5 },
  fast: { texture: 'enemy_fast', hpMul: 0.55, spdMul: 2.1, dmgMul: 0.8, xp: 1, radius: 8, weight: 3, minTime: 20 },
  tank: { texture: 'enemy_tank', hpMul: 4.2, spdMul: 0.55, dmgMul: 1.8, xp: 3, radius: 17, weight: 2, minTime: 45 },
  ranged: { texture: 'enemy_ranged', hpMul: 0.9, spdMul: 0.75, dmgMul: 0.7, xp: 2, radius: 11, weight: 2, minTime: 60, ranged: true, atkRange: 320, boltSpeed: 230, shotCooldown: 1700 },
  swarm: { texture: 'enemy_swarm', hpMul: 0.3, spdMul: 1.6, dmgMul: 0.5, xp: 1, radius: 6, weight: 6, minTime: 0 }
};

/** Trả về pool loại quái khả dụng theo thời gian sống (giây) */
function getEnemyPoolForTime(seconds) {
  return Object.entries(ENEMY_TYPES)
    .filter(([, def]) => (def.minTime || 0) <= seconds)
    .flatMap(([key, def]) => Array(def.weight).fill(key)); // trọng số random
}

// ====================== BOSS TYPES (đa dạng hoá boss) ======================
// mỗi boss có 1 kỹ năng riêng (ability) được GameScene xử lý theo chu kỳ abilityCooldown
const BOSS_TYPES = {
  boss_reaper: {
    id: 'boss_reaper', name: 'Blood Reaper', texture: 'boss_reaper',
    hpMul: 1, spdMul: 1, dmgMul: 1, scale: 1.4,
    ability: 'dash', abilityCooldown: 3800, dashSpeedMul: 6, dashDuration: 320,
    intro: 'BLOOD REAPER XUẤT HIỆN!'
  },
  boss_colossus: {
    id: 'boss_colossus', name: 'Void Colossus', texture: 'boss_colossus',
    hpMul: 1.9, spdMul: 0.6, dmgMul: 1.3, scale: 1.55,
    ability: 'summon', abilityCooldown: 5500, summonCount: 4,
    intro: 'VOID COLOSSUS THỨC TỈNH!'
  },
  boss_dragon: {
    id: 'boss_dragon', name: 'Storm Dragon', texture: 'boss_dragon',
    hpMul: 1.35, spdMul: 1.15, dmgMul: 0.9, scale: 1.3,
    ability: 'barrage', abilityCooldown: 3200, barrageCount: 8,
    intro: 'STORM DRAGON GẦM THÉT!'
  }
};
