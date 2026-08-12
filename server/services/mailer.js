const nodemailer = require('nodemailer');

// Gửi mail qua Gmail SMTP bằng App Password (KHÔNG dùng mật khẩu Gmail thường —
// Google chặn đăng nhập SMTP bằng mật khẩu tài khoản từ lâu rồi).
// Cách tạo App Password:
//   1. Bật xác thực 2 bước (2FA) cho tài khoản Gmail sẽ dùng để gửi mail.
//   2. Vào https://myaccount.google.com/apppasswords, tạo 1 App Password mới
//      (chọn app "Mail", thiết bị "Other" -> đặt tên tuỳ ý, ví dụ "VS Game Server").
//   3. Google trả về 1 chuỗi 16 ký tự — copy chuỗi đó, KHÔNG copy kèm khoảng trắng.
// Set 2 biến môi trường trên server (file .env hoặc Azure App Settings):
//   GMAIL_USER=your-account@gmail.com
//   GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Thiếu cấu hình GMAIL_USER / GMAIL_APP_PASSWORD trên server.');
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
  return transporter;
}

async function sendResetCodeEmail(toEmail, code) {
  const mailer = getTransporter();
  await mailer.sendMail({
    from: `"Vampire Survivors Clone" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Mã đặt lại mật khẩu: ${code}`,
    text: `Mã xác nhận đặt lại mật khẩu của bạn là: ${code}\n\nMã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color: #4d4eee;">Đặt lại mật khẩu</h2>
        <p>Mã xác nhận của bạn là:</p>
        <p style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2f6fbf;">${code}</p>
        <p>Mã có hiệu lực trong <b>10 phút</b>. Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.</p>
      </div>
    `
  });
}

module.exports = { sendResetCodeEmail };
