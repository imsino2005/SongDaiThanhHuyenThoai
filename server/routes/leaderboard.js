const express = require('express');
const { Score, User } = require('../models');
const { verifyJwt } = require('../middleware/auth');

const router = express.Router();

// Cong thuc tinh Gold thuong sau moi van choi, dua tren diem/so quai/level dat duoc.
// Da giam he so so voi truoc (base /10 -> /25, killBonus 2 -> 1, levelBonus 5 -> 2)
// vi Gold gio dung de mua Nang Cap vinh vien (tang dame/mau/toc do) thay vi Aura
// trang tri, nen can lam cho toc do kiem tien / len cap cham hon de can bang.
function calculateGoldReward({ score, kills, levelReached }) {
  const base = Math.floor((score || 0) / 25);
  const killBonus = Math.floor((kills || 0) * 1);
  const levelBonus = (levelReached || 1) * 2;
  return Math.max(0, base + killBonus + levelBonus);
}

router.get('/', async (req, res, next) => {
  try {
    // Lay nhieu ban ghi diem gan day roi rut gon ve "diem cao nhat cua moi nguoi choi"
    // o tang ung dung - tranh 1 nguoi choi nhieu van chiem het top bang xep hang.
    const recentScores = await Score.findAll({
      order: [['score', 'DESC']],
      limit: 500,
      include: [{ model: User, attributes: ['id', 'username', 'avatarUrl'] }]
    });

    const bestByUser = new Map();
    for (const entry of recentScores) {
      if (!entry.userId || bestByUser.has(entry.userId)) continue;
      bestByUser.set(entry.userId, entry);
    }

    const top = Array.from(bestByUser.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    res.json({
      leaderboard: top.map(entry => ({
        id: entry.id,
        score: entry.score,
        kills: entry.kills,
        levelReached: entry.levelReached,
        gameMode: entry.gameMode,
        createdAt: entry.createdAt,
        user: entry.User ? { id: entry.User.id, username: entry.User.username, avatarUrl: entry.User.avatarUrl } : null
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', verifyJwt, async (req, res, next) => {
  try {
    const { score, kills, levelReached, gameMode } = req.body;
    const userId = req.user.id;

    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Valid score is required' });
    }

    const entry = await Score.create({
      userId,
      score,
      kills: kills || 0,
      levelReached: levelReached || 1,
      gameMode: gameMode || 'default'
    });

    const goldEarned = calculateGoldReward({ score, kills, levelReached });
    const user = await User.findByPk(userId);
    let goldBalance = user ? user.gold : 0;
    if (user && goldEarned > 0) {
      user.gold += goldEarned;
      await user.save();
      goldBalance = user.gold;
    }

    res.status(201).json({ entry, goldEarned, goldBalance });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
