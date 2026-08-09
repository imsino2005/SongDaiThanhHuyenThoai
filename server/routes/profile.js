const express = require('express');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'email', 'username', 'avatarUrl', 'jsonProfile', 'cloudSaveUrl', 'gold', 'createdAt'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ profile: user });
  } catch (error) {
    next(error);
  }
});

router.patch('/', [
  body('username').optional().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('avatarUrl').optional().isURL().withMessage('Valid avatar URL is required'),
  body('jsonProfile').optional().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { username, avatarUrl, jsonProfile } = req.body;
    if (username) user.username = username;
    if (avatarUrl) user.avatarUrl = avatarUrl;
    if (jsonProfile) user.jsonProfile = jsonProfile;

    await user.save();
    res.json({ profile: user });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
