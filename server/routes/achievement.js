const express = require('express');
const { Achievement } = require('../models');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const achievements = await Achievement.findAll({ where: { userId: req.user.id }, order: [['unlockedAt', 'DESC']] });
    res.json({ achievements });
  } catch (error) {
    next(error);
  }
});

router.post('/unlock', async (req, res, next) => {
  try {
    const { key, title, description } = req.body;
    if (!key || !title || !description) {
      return res.status(400).json({ error: 'Key, title and description are required' });
    }

    const [achievement, created] = await Achievement.findOrCreate({
      where: { userId: req.user.id, key },
      defaults: { title, description, unlockedAt: new Date() }
    });

    if (!created) {
      return res.json({ achievement, message: 'Already unlocked' });
    }

    res.status(201).json({ achievement });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
