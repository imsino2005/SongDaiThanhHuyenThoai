const express = require('express');
const { ShopItem, User } = require('../models');

const router = express.Router();

// Danh sach nang cap vinh vien co the mua bang Gold. Moi lan mua tang 1 cap
// (luu o ShopItem.quantity), gia lan mua tiep theo tang dan theo cap dang co.
// Dinh nghia/mo ta khop voi js/data.js (UPGRADE_DEFS) o client.
const upgradeCatalog = [
  { itemKey: 'power_boost', itemType: 'upgrade', title: 'Suc Manh', statKey: 'damage', bonusPerLevel: 0.04, maxLevel: 10, basePrice: 80, priceGrowth: 1.35, description: 'Tang 4% sat thuong gay ra moi cap.' },
  { itemKey: 'vitality_boost', itemType: 'upgrade', title: 'Sinh Luc', statKey: 'maxHp', bonusPerLevel: 0.05, maxLevel: 10, basePrice: 80, priceGrowth: 1.35, description: 'Tang 5% mau toi da moi cap.' },
  { itemKey: 'agility_boost', itemType: 'upgrade', title: 'Nhanh Nhen', statKey: 'speed', bonusPerLevel: 0.03, maxLevel: 10, basePrice: 80, priceGrowth: 1.35, description: 'Tang 3% toc do di chuyen moi cap.' }
];

function priceForLevel(def, currentLevel) {
  return Math.round(def.basePrice * Math.pow(def.priceGrowth, currentLevel));
}

router.get('/catalog', (req, res) => {
  res.json({ catalog: upgradeCatalog });
});

router.get('/inventory', async (req, res, next) => {
  try {
    const inventory = await ShopItem.findAll({ where: { userId: req.user.id } });
    res.json({ inventory });
  } catch (error) {
    next(error);
  }
});

// Mua 1 cap nang cap. Neu chua so huu, tao ShopItem moi voi quantity = 1 (cap 1).
// Neu da so huu, tang quantity (cap) len 1, gia tinh theo cap hien tai truoc khi mua.
router.post('/purchase', async (req, res, next) => {
  try {
    const { itemKey } = req.body;
    const def = upgradeCatalog.find(x => x.itemKey === itemKey);
    if (!def) return res.status(404).json({ error: 'Item not found' });

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let owned = await ShopItem.findOne({ where: { userId: req.user.id, itemKey } });
    const currentLevel = owned ? owned.quantity : 0;

    if (currentLevel >= def.maxLevel) {
      return res.status(409).json({ error: 'Nang cap nay da dat cap toi da' });
    }

    const price = priceForLevel(def, currentLevel);
    if (user.gold < price) {
      return res.status(400).json({ error: `Khong du Gold. Ban co ${user.gold}, can ${price}.` });
    }

    user.gold -= price;
    await user.save();

    if (owned) {
      owned.quantity += 1;
      owned.price = price;
      await owned.save();
    } else {
      owned = await ShopItem.create({
        userId: req.user.id,
        itemKey,
        itemType: def.itemType,
        price,
        quantity: 1,
        metadata: JSON.stringify({ title: def.title })
      });
    }

    res.status(201).json({ shopItem: owned, goldBalance: user.gold });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
