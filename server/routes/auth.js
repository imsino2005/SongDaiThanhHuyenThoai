const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User } = require('../models');
const { sendResetCodeEmail } = require('../services/mailer');

const router = express.Router();

const RESET_CODE_TTL_MS = 10 * 60 * 1000; // 10 phút
const RESET_CODE_MAX_ATTEMPTS = 5;
// Chặn spam bấm "gửi lại mã": mỗi email chỉ được yêu cầu 1 lần / 60 giây.
// Lưu trong bộ nhớ tiến trình là đủ cho nhu cầu hiện tại (1 instance server);
// nếu scale nhiều instance sau này thì nên chuyển sang Redis.
const forgotPasswordCooldown = new Map();

router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const emailNormalized = String(req.body.email || '').trim().toLowerCase();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const existing = await User.findOne({ where: { [Op.or]: [{ email: emailNormalized }, { username }] } });
    if (existing) {
      return res.status(409).json({ error: 'Email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email: emailNormalized, username, passwordHash, jsonProfile: '{}' });
    const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.status(201).json({ token, user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatarUrl, gold: user.gold } });
  } catch (error) {
    next(error);
  }
});

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const emailNormalized = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ where: { email: emailNormalized } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({ token, user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatarUrl, gold: user.gold } });
  } catch (error) {
    next(error);
  }
});

// Bước 1 của "Quên mật khẩu": gửi mã 6 số về email.
// Luôn trả về cùng 1 thông báo chung dù email có tồn tại hay không, để tránh
// bị lợi dụng dò xem email nào đã đăng ký (user enumeration).
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Email không hợp lệ')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const email = String(req.body.email || '').trim().toLowerCase();
    const genericMessage = 'Nếu email tồn tại trong hệ thống, mã xác nhận đã được gửi tới.';

    const cooldownUntil = forgotPasswordCooldown.get(email);
    if (cooldownUntil && cooldownUntil > Date.now()) {
      const waitSec = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return res.status(429).json({ error: `Vui lòng đợi ${waitSec}s trước khi yêu cầu gửi lại mã.` });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Không tiết lộ việc email không tồn tại — vẫn trả 200 như bình thường.
      return res.json({ message: genericMessage });
    }

    const code = crypto.randomInt(100000, 1000000).toString(); // mã 6 số, luôn đủ 6 chữ số
    user.resetCodeHash = await bcrypt.hash(code, 10);
    user.resetCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
    user.resetCodeAttempts = 0;
    await user.save();

    try {
      await sendResetCodeEmail(email, code);
    } catch (mailError) {
      console.error('Gửi email reset mật khẩu thất bại:', mailError);
      // Không khóa người dùng 60 giây nếu SMTP thất bại.
      forgotPasswordCooldown.delete(email);
      return res.status(500).json({ error: 'Không gửi được email lúc này, vui lòng thử lại sau.' });
    }

    forgotPasswordCooldown.set(email, Date.now() + 60 * 1000);
    res.json({ message: genericMessage });
  } catch (error) {
    next(error);
  }
});

// Bước 2: xác nhận mã 6 số + đặt mật khẩu mới.
router.post('/reset-password', [
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Mã xác nhận gồm 6 chữ số'),
  body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const emailNormalized = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '');
    const user = await User.findOne({ where: { email: emailNormalized } });

    // Thông báo lỗi chung chung cho mọi trường hợp sai (email không tồn tại,
    // mã sai, mã hết hạn) — tránh lộ thông tin cho kẻ dò mã.
    const invalidMessage = 'Mã xác nhận không đúng hoặc đã hết hạn.';

    if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt) {
      return res.status(400).json({ error: invalidMessage });
    }
    if (user.resetCodeExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: invalidMessage });
    }
    if (user.resetCodeAttempts >= RESET_CODE_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu gửi mã mới.' });
    }

    const isMatch = await bcrypt.compare(code, user.resetCodeHash);
    if (!isMatch) {
      user.resetCodeAttempts += 1;
      await user.save();
      return res.status(400).json({ error: invalidMessage });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.resetCodeHash = null;
    user.resetCodeExpiresAt = null;
    user.resetCodeAttempts = 0;
    await user.save();

    res.json({ message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
