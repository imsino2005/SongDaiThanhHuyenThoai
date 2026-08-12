const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');

const router = express.Router();

// Bỏ passwordHash + các field nội bộ của luồng reset mật khẩu trước khi trả
// về cho client — tránh lộ hash mật khẩu hay hash mã reset.
function sanitizeUser(user) {
  const { passwordHash, resetCodeHash, resetCodeExpiresAt, resetCodeAttempts, ...safe } = user.toJSON();
  return safe;
}

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
  body('username').optional().isLength({ min: 3, max: 32 }).withMessage('Username phải có từ 3-32 ký tự'),
  body('avatarUrl').optional().isURL().withMessage('Valid avatar URL is required'),
  body('jsonProfile').optional().isString().isLength({ max: 20000 }).withMessage('Dữ liệu jsonProfile quá lớn (tối đa 20000 ký tự)'),
  body('email').optional().isEmail().withMessage('Email không hợp lệ'),
  body('currentPassword').optional().isString(),
  body('newPassword').optional().isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { username, avatarUrl, jsonProfile, email, currentPassword, newPassword } = req.body;
    const wantsEmailChange = typeof email === 'string' && email !== user.email;
    const wantsPasswordChange = !!newPassword;

    // Đổi email hoặc đổi mật khẩu là thao tác nhạy cảm — bắt buộc xác nhận
    // lại mật khẩu hiện tại, tránh trường hợp lộ token bị lợi dụng đổi luôn
    // thông tin đăng nhập.
    if (wantsEmailChange || wantsPasswordChange) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại để xác nhận thay đổi.' });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
      }
    }

    if (username) user.username = username;
    if (avatarUrl) user.avatarUrl = avatarUrl;
    if (jsonProfile) user.jsonProfile = jsonProfile;
    if (wantsEmailChange) user.email = email;
    if (wantsPasswordChange) user.passwordHash = await bcrypt.hash(newPassword, 12);

    try {
      await user.save();
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        const field = error.errors && error.errors[0] && error.errors[0].path;
        const friendly = field === 'email'
          ? 'Email này đã được sử dụng bởi tài khoản khác.'
          : field === 'username'
            ? 'Tên người dùng này đã được sử dụng, vui lòng chọn tên khác.'
            : 'Thông tin bị trùng, vui lòng thử giá trị khác.';
        return res.status(409).json({ error: friendly });
      }
      throw error;
    }

    // Email/username đổi thì cấp lại JWT mới cho phiên hiện tại, để token
    // không còn mang thông tin cũ (mật khẩu đổi cũng cấp lại cho gọn, dù
    // token cũ ở các thiết bị khác vẫn còn hạn dùng — đây là giới hạn của
    // JWT stateless, muốn thu hồi hẳn cần thêm cơ chế blacklist/token version).
    let newToken;
    if (wantsEmailChange || wantsPasswordChange || username) {
      newToken = jwt.sign(
        { id: user.id, email: user.email, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
    }

    res.json({ profile: sanitizeUser(user), ...(newToken ? { token: newToken } : {}) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
