const express = require('express');
const { ShopItem, User } = require('../models');

const router = express.Router();

// Danh sach Aura co the mua bang Gold. Gia/mo ta khop voi js/data.js (AURA_DEFS) o client.
const shopCatalog = [
  { itemKey: 'aura_fire', itemType: 'aura', title: 'Hao Quang Lua', price: 150, description: 'Vong lua do cam bao quanh nhan vat.' },
  { itemKey: 'aura_ice', itemType: 'aura', title: 'Hao Quang Bang', price: 150, description: 'Vong bang xanh lanh bao quanh nhan vat.' },
  { itemKey: 'aura_thunder', itemType: 'aura', title: 'Hao Quang Sam Set', price: 200, description: 'Vong dien tim bao quanh nhan vat.' },
  { itemKey: 'aura_holy', itemType: 'aura', title: 'Hao Quang Than Thanh', price: 300, description: 'Vong anh sang vang kim bao quanh nhan vat.' }
];

router.get('/catalog', (req, res) => {
  res.json({ catalog: shopCatalog });
});

router.get('/inventory', async (req, res, next) => {
  try {
    const inventory = await ShopItem.findAll({ where: { userId: req.user.id } });
    res.json({ inventory });
  } catch (error) {
    next(error);
  }
});

router.post('/purchase', async (req, res, next) => {
  try {
    const { itemKey } = req.body;
    const item = shopCatalog.find(x => x.itemKey === itemKey);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existing = await ShopItem.findOne({ where: { userId: req.user.id, itemKey } });
    if (existing) {
      return res.status(409).json({ error: 'Ban da so huu vat pham nay roi' });
    }

    if (user.gold < item.price) {
      return res.status(400).json({ error: `Khong du Gold. Ban co ${user.gold}, can ${item.price}.` });
    }

    user.gold -= item.price;
    await user.save();

    const shopItem = await ShopItem.create({
      userId: req.user.id,
      itemKey,
      itemType: item.itemType,
      price: item.price,
      quantity: 1,
      metadata: JSON.stringify({ title: item.title })
    });
    res.status(201).json({ shopItem, goldBalance: user.gold });
  } catch (error) {
    next(error);
  }
});

// Trang bi 1 aura da so huu (hoac go trang bi voi itemKey = 'none').
// Luu lua chon vao jsonProfile cua User de client doc lai khi vao game.
router.post('/equip', async (req, res, next) => {
  try {
    const { itemKey } = req.body;
    if (!itemKey) return res.status(400).json({ error: 'itemKey is required' });

    if (itemKey !== 'none') {
      const owned = await ShopItem.findOne({ where: { userId: req.user.id, itemKey, itemType: 'aura' } });
      if (!owned) return res.status(403).json({ error: 'Ban chua so huu vat pham nay' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let profileData = {};
    try {
      profileData = JSON.parse(user.jsonProfile || '{}');
    } catch (e) {
      profileData = {};
    }
    profileData.equippedAura = itemKey === 'none' ? null : itemKey;
    user.jsonProfile = JSON.stringify(profileData);
    await user.save();

    res.json({ equippedAura: profileData.equippedAura });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
