// Khi frontend được server (server/app.js) phục vụ cùng origin (đúng như cách
// app đã deploy lên Azure Web App), dùng đường dẫn tương đối '/api' để gọi đúng
// domain đang chạy. Chỉ khi mở file tĩnh ở localhost khác cổng với server thì mới
// trỏ về localhost:4000 để tiện test riêng frontend.
const API_BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  && location.port && location.port !== '4000'
  ? 'http://localhost:4000/api'
  : '/api';

// Danh sách avatar có sẵn để người chơi chọn trong Profile — dùng ảnh SVG
// sinh từ DiceBear (URL công khai, ổn định theo seed) nên không cần upload
// file hay lưu ảnh trên server, chỉ cần lưu avatarUrl là 1 URL hợp lệ.
const AVATAR_PRESETS = [
  'Felix', 'Aneka', 'Milo', 'Zoe', 'Leo', 'Nova', 'Rex', 'Luna', 'Kai', 'Mimi'
].map(seed => `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`);

const AuthAPI = {
  token: null,
  user: null,
  overlay: null,
  modal: null,
  statusText: null,
  contentArea: null,

  init() {
    this.token = localStorage.getItem('vs_token');
    const userJson = localStorage.getItem('vs_user');
    this.user = userJson ? JSON.parse(userJson) : null;
    this.createUI();
    if (this.user) {
      this.showModal('menu');
    } else {
      this.showModal('login');
    }
    window.dispatchEvent(new Event('authReady'));
  },

  get headers() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  },

  async request(path, { method = 'GET', body = null } = {}) {
    try {
      const res = await fetch(API_BASE_URL + path, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (data.errors ? data.errors.map(e => e.msg).join(', ') : 'Request failed'));
      return data;
    } catch (error) {
      throw error;
    }
  },

  async login(email, password) {
    const data = await this.request('/auth/login', { method: 'POST', body: { email, password } });
    this.setSession(data.token, data.user);
    return data;
  },

  async register(email, username, password) {
    const data = await this.request('/auth/register', { method: 'POST', body: { email, username, password } });
    this.setSession(data.token, data.user);
    return data;
  },

  async getProfile() {
    return this.request('/profile');
  },

  async updateProfile(payload) {
    return this.request('/profile', { method: 'PATCH', body: payload });
  },

  async forgotPassword(email) {
    return this.request('/auth/forgot-password', { method: 'POST', body: { email } });
  },

  async resetPassword(email, code, newPassword) {
    return this.request('/auth/reset-password', { method: 'POST', body: { email, code, newPassword } });
  },

  async getLeaderboard() {
    return this.request('/leaderboard');
  },

  async submitScore(payload) {
    return this.request('/leaderboard', { method: 'POST', body: payload });
  },

  // Cập nhật số Gold đang giữ trong bộ nhớ + localStorage sau khi nhận thưởng/mua đồ,
  // không cần gọi lại API profile.
  updateLocalGold(goldBalance) {
    if (typeof goldBalance !== 'number' || !this.user) return;
    this.user.gold = goldBalance;
    localStorage.setItem('vs_user', JSON.stringify(this.user));
  },

  // Cập nhật avatarUrl đang giữ trong bộ nhớ + localStorage sau khi người chơi
  // đổi avatar trong Profile, để Menu chính hiển thị đúng luôn không cần tải lại.
  updateLocalAvatar(avatarUrl) {
    if (!this.user) return;
    this.user.avatarUrl = avatarUrl;
    localStorage.setItem('vs_user', JSON.stringify(this.user));
  },

  // Sau khi PATCH /profile đổi email/mật khẩu, backend có thể trả về token
  // mới (vì payload JWT chứa email). Đồng bộ lại token + username/email
  // đang lưu cục bộ để không bị lệch với server.
  applyProfileResponse(data) {
    if (!this.user || !data || !data.profile) return;
    if (typeof data.profile.email === 'string') this.user.email = data.profile.email;
    if (typeof data.profile.username === 'string') this.user.username = data.profile.username;
    if (data.token) {
      this.token = data.token;
      localStorage.setItem('vs_token', data.token);
    }
    localStorage.setItem('vs_user', JSON.stringify(this.user));
  },

  async getCatalog() {
    return this.request('/shop/catalog');
  },

  async getInventory() {
    return this.request('/shop/inventory');
  },

  async purchase(itemKey) {
    return this.request('/shop/purchase', { method: 'POST', body: { itemKey } });
  },

  async getAchievements() {
    return this.request('/achievements');
  },

  async unlockAchievement(key, title, description) {
    return this.request('/achievements/unlock', { method: 'POST', body: { key, title, description } });
  },

  async saveCloud(saveData) {
    return this.request('/cloud-saves', { method: 'POST', body: { saveData } });
  },

  async loadCloud() {
    return this.request('/cloud-saves');
  },

  setSession(token, user) {
    this.token = token;
    this.user = user;
    if (token) {
      localStorage.setItem('vs_token', token);
    } else {
      localStorage.removeItem('vs_token');
    }
    if (user) {
      localStorage.setItem('vs_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('vs_user');
    }
    this.dispatchAuthStatusChanged();
    // Lưu ý: không tự chuyển sang màn Main Menu ở đây nữa.
    // Việc chuyển màn được thực hiện tại nơi gọi (renderLogin/renderRegister)
    // sau khi đã hiển thị thông báo thành công cho người dùng thấy.
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('vs_token');
    localStorage.removeItem('vs_user');
    this.dispatchAuthStatusChanged();
    this.showModal('login');
  },

  createUI() {
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.innerHTML = `
      <div id="authModalContent">
        <div id="authModalHeader">
          <span id="authModalTitle">Đăng nhập</span>
          <button id="authModalClose" type="button">✕</button>
        </div>
        <div id="authModalBody"></div>
      </div>
    `;
    document.body.appendChild(modal);

    this.modal = modal;
    this.contentArea = document.getElementById('authModalBody');

    document.getElementById('authModalClose').addEventListener('click', () => this.hideModal());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hideModal();
    });

    this.createStyles();
    this.renderContent('login');
  },

  createStyles() {
    if (document.getElementById('authStyles')) return;
    const style = document.createElement('style');
    style.id = 'authStyles';
    style.textContent = `
      #authModal {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0);
        z-index: 9999;
        transition: background 0.22s ease;
      }
      #authModal.authModalOpen {
        background: rgba(0, 0, 0, 0.78);
      }
      #authModalContent {
        width: min(460px, 92vw);
        max-height: 92vh;
        overflow-y: auto;
        background: #0b1025;
        border-radius: 24px;
        border: 1px solid rgba(94, 104, 255, 0.95);
        padding: 24px;
        box-shadow: 0 0 48px rgba(0, 0, 0, 0.45);
        color: #eef1ff;
        opacity: 0;
        transform: scale(0.9) translateY(10px);
        transition: opacity 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      #authModal.authModalOpen #authModalContent {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      #authModalContent.leaderboardModal {
        width: min(760px, 94vw);
        max-height: 88vh;
      }
      #authModalContent.leaderboardModal #authModalBody {
        max-height: calc(88vh - 88px);
        overflow-y: auto;
        overflow-x: auto;
        padding-right: 4px;
      }
      .leaderboardWrap {
        width: 100%;
        overflow-x: auto;
      }
      .leaderboardWrap .authTable {
        min-width: 640px;
      }

      #authModalHeader {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 18px;
      }
      #authModalTitle {
        font-size: 22px;
        font-weight: 800;
      }
      #authModalClose {
        border: none;
        background: transparent;
        color: #d8e0ff;
        font-size: 22px;
        cursor: pointer;
      }
      .authForm label {
        display: block;
        margin-bottom: 8px;
        color: #c7d1ff;
        font-size: 14px;
      }
      .authForm input {
        width: 100%;
        padding: 12px 14px;
        margin-bottom: 14px;
        border-radius: 12px;
        border: 1px solid rgba(110, 118, 255, 0.45);
        background: rgba(15, 20, 40, 0.95);
        color: #f4f7ff;
        font-size: 14px;
      }
      .authForm input::placeholder { color: #6f789c; }
      .authForm input:focus {
        outline: none;
        border-color: #8b88ff;
        box-shadow: 0 0 0 3px rgba(110, 109, 255, 0.16), 0 8px 24px rgba(0,0,0,.16);
      }
      .authField { position: relative; margin-bottom: 14px; }
      .authField label { margin-bottom: 7px; }
      .authField input { margin-bottom: 0; }
      .authPasswordWrap { position: relative; }
      .authPasswordWrap input { padding-right: 48px; }
      .authEyeBtn {
        position: absolute !important; right: 7px; top: 50%; transform: translateY(-50%) !important;
        width: 34px !important; min-width: 34px !important; height: 34px; padding: 0 !important;
        border-radius: 9px !important; background: transparent !important; box-shadow: none !important;
        color: #9ca8d4 !important; font-size: 15px !important;
      }
      .authEyeBtn:hover { background: rgba(255,255,255,.06) !important; transform: translateY(-50%) !important; }
      .authPrimaryBtn { margin-top: 4px; }
      .authSecondaryBtn {
        width: 100%; border: 1px solid rgba(139,136,255,.28); border-radius: 12px; padding: 11px 14px;
        background: rgba(255,255,255,.045); color: #d8ddff; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .authSecondaryBtn:hover { background: rgba(139,136,255,.10); }
      .authNavLinks { display:flex; justify-content:center; gap:8px; margin-top:12px; }
      .authLinkBtn { background:none !important; border:none !important; box-shadow:none !important; width:auto !important; padding:6px 8px !important;
        color:#9ebfff !important; font-size:13px !important; cursor:pointer; }
      .authLinkBtn:hover { color:#d5e2ff !important; text-decoration:underline; transform:none !important; }
      .authDivider { height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.13),transparent); margin:16px 0 14px; }
      .authHint { color:#8792b8; font-size:12px; line-height:1.45; margin:0 0 14px; }
      .authHeaderBadge { display:inline-flex; align-items:center; gap:6px; margin-bottom:8px; padding:5px 9px; border-radius:999px;
        background:rgba(110,109,255,.11); border:1px solid rgba(139,136,255,.18); color:#bfc4ff; font-size:11px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
      .authStep { color:#8f9abe; font-size:11px; font-weight:700; margin-bottom:7px; }
      .authForm button,
      .authActionButton,
      .authMenuButton {
        width: 100%;
        border: none;
        border-radius: 14px;
        padding: 14px 16px;
        background: linear-gradient(135deg, #6e6dff, #4d4eee);
        color: #fff;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
      }
      .authForm button:hover,
      .authActionButton:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(76, 92, 255, 0.24);
        background: linear-gradient(135deg, #7d78ff, #5f5cf0);
      }
      .authMenuButton:hover {
        transform: translateY(-1px);
      }
      .authResult {
        min-height: 18px;
        margin-top: 10px;
        color: #ffd689;
        font-size: 13px;
      }
      .authButtonRow {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .authButtonRow button {
        flex: 1 1 48%;
        min-width: 120px;
      }
      .authMenuGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(160px, 1fr));
        gap: 14px;
        margin-top: 16px;
      }
      @keyframes menuBtnIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .authMenuGrid .authMenuButton {
        animation: menuBtnIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .authMenuGrid .authMenuButton:nth-child(1) { animation-delay: 0.02s; }
      .authMenuGrid .authMenuButton:nth-child(2) { animation-delay: 0.06s; }
      .authMenuGrid .authMenuButton:nth-child(3) { animation-delay: 0.1s; }
      .authMenuGrid .authMenuButton:nth-child(4) { animation-delay: 0.14s; }
      .authMenuGrid .authMenuButton:nth-child(5) { animation-delay: 0.18s; }
      .authMenuGrid .authMenuButton:nth-child(6) { animation-delay: 0.22s; }
      .authMenuButton {
        border-radius: 16px;
        min-height: 56px;
        display: flex;
        align-items: center;
        gap: 12px;
        justify-content: flex-start;
        padding-left: 14px;
        position: relative;
        overflow: hidden;
      }
      .authMenuButton .menuBtnIcon {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 17px;
        background: rgba(255, 255, 255, 0.16);
      }
      .authMenuButton .menuBtnLabel {
        font-size: 15px;
        font-weight: 700;
        text-align: left;
      }
      .authMenuButton.menuPrimary { background: linear-gradient(135deg, #7d78ff, #4d4eee); box-shadow: 0 6px 18px rgba(93, 89, 255, 0.28); }
      .authMenuButton.menuUpgrade { background: linear-gradient(135deg, #57b579, #2f7a4c); box-shadow: 0 6px 18px rgba(58, 150, 100, 0.26); }
      .authMenuButton.menuProfile { background: linear-gradient(135deg, #4fa3e0, #2f6fbf); box-shadow: 0 6px 18px rgba(60, 130, 200, 0.26); }
      .authMenuButton.menuLeaderboard { background: linear-gradient(135deg, #f0b950, #d98c2b); box-shadow: 0 6px 18px rgba(220, 160, 60, 0.26); }
      .authMenuButton.menuAchievements { background: linear-gradient(135deg, #ef7fae, #cf4f8c); box-shadow: 0 6px 18px rgba(210, 90, 150, 0.26); }
      .authMenuButton.menuLogout {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 120, 120, 0.35);
        box-shadow: none;
        color: #ffb3b3;
      }
      .authMenuButton.menuLogout .menuBtnIcon { background: rgba(255, 100, 100, 0.16); }
      .authMenuButton.menuLogout:hover {
        background: rgba(255, 90, 90, 0.14);
        box-shadow: 0 6px 16px rgba(255, 90, 90, 0.18);
      }
      .authMenuButton:hover { filter: brightness(1.08); }
      .authMenuUserCard {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(120, 130, 230, 0.18);
        border-radius: 16px;
        padding: 10px 14px;
        margin-bottom: 4px;
      }
      .authMenuUserCard .authAvatar {
        width: 42px;
        height: 42px;
        font-size: 17px;
      }
      .authMenuUserInfo { min-width: 0; flex: 1; }
      .authMenuUserName {
        font-size: 14.5px;
        font-weight: 700;
        color: #f0f2ff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .authMenuGoldPill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-top: 3px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12.5px;
        font-weight: 700;
        color: #3a2a08;
        background: linear-gradient(135deg, #ffe08a, #f0b950);
      }
      .authTable {
        width: 100%;
        border-collapse: collapse;
        margin-top: 14px;
      }
      .authTable th,
      .authTable td {
        padding: 10px;
        border: 1px solid rgba(120, 130, 230, 0.18);
        text-align: left;
      }
      .authTable th {
        background: rgba(72, 87, 199, 0.15);
      }
      .authSmallLabel {
        color: #94a0c4;
        font-size: 12px;
      }
      .authProfileHeader {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 18px;
      }
      .authAvatar {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 26px;
        font-weight: 800;
        color: #fff;
        background: linear-gradient(135deg, #6e6dff, #4d4eee);
        border: 2px solid rgba(255, 255, 255, 0.25);
        box-shadow: 0 4px 16px rgba(76, 92, 255, 0.35);
        overflow: hidden;
      }
      .authAvatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .authProfileNames { min-width: 0; }
      .authProfileUsername {
        font-size: 19px;
        font-weight: 800;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .authProfileEmail {
        font-size: 12.5px;
        color: #94a0c4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .authProgressRow {
        margin-bottom: 14px;
      }
      .authProgressLabel {
        display: flex;
        justify-content: space-between;
        font-size: 12.5px;
        color: #c7d1ff;
        margin-bottom: 6px;
      }
      .authProgressLabel .authProgressValue {
        color: #ffd689;
        font-weight: 700;
      }
      .authProgressBar {
        width: 100%;
        height: 10px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
        position: relative;
      }
      .authProgressFill {
        height: 100%;
        border-radius: 6px;
        transition: width 0.5s cubic-bezier(0.34, 1.2, 0.64, 1);
      }
      .authProgressFill.goldFill {
        background: linear-gradient(90deg, #e6b95c, #ffd689);
      }
      .authInfoCard {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(120, 130, 230, 0.16);
        border-radius: 14px;
        padding: 12px 14px;
        margin-bottom: 10px;
        font-size: 13.5px;
        color: #dbe1ff;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .authInfoCard .authInfoIcon {
        font-size: 16px;
        width: 22px;
        text-align: center;
        flex-shrink: 0;
      }
      #authEmailForm, #authPasswordForm {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(120, 130, 230, 0.16);
        border-radius: 14px;
        padding: 14px 14px 4px;
        margin-bottom: 10px;
      }
      #authEmailForm input, #authPasswordForm input {
        margin-bottom: 12px;
      }
      .authInfoCard.avatarCard {
        justify-content: space-between;
      }
      .authInfoCard .authInfoText {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .authAvatarPickBtn {
        flex-shrink: 0;
        border: 1px solid rgba(120, 158, 232, 0.4);
        background: rgba(108, 145, 255, 0.14);
        color: #cfe0ff;
        font-size: 12px;
        font-weight: 700;
        padding: 6px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .authAvatarPickBtn:hover {
        background: rgba(108, 145, 255, 0.28);
      }
      .authAvatarGrid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 10px;
        padding: 12px 14px 4px;
      }
      .authAvatarOption {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.04);
        cursor: pointer;
        padding: 0;
        transition: border-color 0.15s ease, transform 0.15s ease;
      }
      .authAvatarOption:hover {
        transform: scale(1.06);
        border-color: rgba(143, 194, 255, 0.6);
      }
      .authAvatarOption.selected {
        border-color: #6e6dff;
        box-shadow: 0 0 0 2px rgba(110, 109, 255, 0.35);
      }
      .authAvatarOption img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .authCloudRow {
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(108, 145, 255, 0.08);
        border: 1px solid rgba(120, 158, 232, 0.35);
        border-radius: 14px;
        padding: 12px 14px;
        margin-bottom: 14px;
      }
      .authCloudIcon {
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .authCloudIcon svg { width: 100%; height: 100%; }
      .authCloudText {
        font-size: 12.5px;
        color: #c7d6ff;
        line-height: 1.35;
      }
      .authCloudText a { color: #8fc2ff; }
    `;
    document.head.appendChild(style);
  },

  showModal(section) {
    this.modal.style.display = 'flex';
    // Đợi 1 frame để trình duyệt áp dụng display:flex trước khi thêm class
    // kích hoạt transition — nếu thêm class ngay lập tức, CSS transition
    // sẽ không chạy (từ display:none sang có nội dung luôn ở trạng thái cuối).
    requestAnimationFrame(() => {
      this.modal.classList.add('authModalOpen');
    });
    this.renderContent(section);
  },

  hideModal() {
    this.modal.classList.remove('authModalOpen');
    // Chờ animation đóng (khớp với thời lượng transition trong CSS) rồi mới
    // ẩn hẳn phần tử, tránh việc nội dung biến mất đột ngột giữa animation.
    clearTimeout(this._hideModalTimeout);
    this._hideModalTimeout = setTimeout(() => {
      this.modal.style.display = 'none';
    }, 220);
  },

  dispatchAuthStatusChanged() {
    window.dispatchEvent(new Event('authStatusChanged'));
  },

  clearAuthTimers() {
    clearTimeout(this._authNavTimer);
    clearTimeout(this._hideModalTimeout);
    this._authNavTimer = null;
  },

  escapeHtml(value) {
    return String(value || '').replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[ch]));
  },

  renderContent(section) {
    this.clearAuthTimers();
    if (!this.contentArea) return;
    const modalContent = this.modal.querySelector('#authModalContent');
    if (modalContent) modalContent.classList.toggle('leaderboardModal', section === 'leaderboard');
    this.contentArea.innerHTML = '';
    switch (section) {
      case 'login':
        this.renderLogin();
        break;
      case 'register':
        this.renderRegister();
        break;
      case 'forgot-password':
        this.renderForgotPassword();
        break;
      case 'menu':
        this.renderMenu();
        break;
      case 'profile':
        this.renderProfile();
        break;
      case 'leaderboard':
        this.renderLeaderboard();
        break;
      case 'shop':
        this.renderShop();
        break;
      case 'achievements':
        this.renderAchievements();
        break;
      default:
        this.renderLogin();
        break;
    }
  },

  renderLogin() {
    this.modal.querySelector('#authModalTitle').textContent = 'Chào mừng trở lại';
    this.contentArea.innerHTML = `
      <div class="authHeaderBadge">⚡ SỐNG DAI THÀNH HUYỀN THOẠI</div>
      <p class="authHint">Đăng nhập để tiếp tục tiến trình, lưu thành tích và đồng bộ dữ liệu.</p>
      <form class="authForm" id="authLoginForm">
        <div class="authField">
          <label>Email</label>
          <input type="email" name="email" autocomplete="email" placeholder="you@example.com" required />
        </div>
        <div class="authField">
          <label>Mật khẩu</label>
          <div class="authPasswordWrap">
            <input type="password" name="password" autocomplete="current-password" placeholder="Nhập mật khẩu của bạn" required />
            <button type="button" class="authEyeBtn" data-password-target="loginPassword" aria-label="Hiện mật khẩu">◉</button>
          </div>
        </div>
        <button class="authPrimaryBtn" type="submit">ĐĂNG NHẬP</button>
        <div class="authResult" id="authFeedback"></div>
      </form>
      <div class="authNavLinks">
        <button type="button" class="authLinkBtn" id="authForgotPasswordLink">Quên mật khẩu?</button>
        <span style="color:#505a80; padding-top:6px;">•</span>
        <button type="button" class="authLinkBtn" id="authRegisterNavBtn">Tạo tài khoản</button>
      </div>
    `;
    const form = document.getElementById('authLoginForm');
    const passwordInput = form.querySelector('[name="password"]');
    const eye = form.querySelector('.authEyeBtn');
    eye.addEventListener('click', () => {
      const visible = passwordInput.type === 'text';
      passwordInput.type = visible ? 'password' : 'text';
      eye.textContent = visible ? '◉' : '◌';
      eye.setAttribute('aria-label', visible ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim().toLowerCase();
      const password = String(formData.get('password') || '');
      const feedback = document.getElementById('authFeedback');
      if (!email || !password) { feedback.style.color = '#ff8a8a'; feedback.textContent = 'Vui lòng nhập email và mật khẩu.'; return; }
      submitBtn.disabled = true;
      feedback.style.color = '#ffd689';
      feedback.textContent = 'Đang đăng nhập...';
      try {
        await this.login(email, password);
        feedback.style.color = '#8affb0';
        feedback.textContent = 'Đăng nhập thành công!';
        this._authNavTimer = setTimeout(() => this.renderContent('menu'), 450);
      } catch (error) {
        feedback.style.color = '#ff8a8a';
        feedback.textContent = error.message || 'Đăng nhập thất bại. Vui lòng thử lại.';
        submitBtn.disabled = false;
      }
    });
    document.getElementById('authRegisterNavBtn').addEventListener('click', () => this.renderRegister());
    document.getElementById('authForgotPasswordLink').addEventListener('click', () => this.renderForgotPassword());
  },

  // step: 'request' (nhập email để nhận mã) hoặc 'verify' (nhập mã + mật khẩu mới).
  renderForgotPassword(step = 'request', email = '') {
    this.modal.querySelector('#authModalTitle').textContent = 'Quên mật khẩu';

    if (step === 'request') {
      this.contentArea.innerHTML = `
        <div class="authHeaderBadge">🔐 Khôi phục tài khoản</div>
        <div class="authStep">BƯỚC 1 / 2</div>
        <p class="authHint">Nhập email tài khoản. Nếu email tồn tại, hệ thống sẽ gửi mã xác nhận 6 chữ số.</p>
        <form class="authForm" id="authForgotForm">
          <div class="authField">
            <label>Email tài khoản</label>
            <input type="email" name="email" autocomplete="email" placeholder="you@example.com" required value="${this.escapeHtml(email)}" />
          </div>
          <button class="authPrimaryBtn" type="submit">GỬI MÃ XÁC NHẬN</button>
          <div class="authResult" id="authFeedback"></div>
        </form>
        <button type="button" class="authSecondaryBtn" id="authForgotBackBtn">← Quay lại đăng nhập</button>
      `;
      const form = document.getElementById('authForgotForm');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn.disabled) return;
        const inputEmail = String(new FormData(form).get('email') || '').trim().toLowerCase();
        const feedback = document.getElementById('authFeedback');
        submitBtn.disabled = true;
        feedback.style.color = '#ffd689';
        feedback.textContent = 'Đang gửi mã xác nhận...';
        try {
          await this.forgotPassword(inputEmail);
          feedback.style.color = '#8affb0';
          feedback.textContent = 'Nếu email tồn tại, mã xác nhận đã được gửi. Hãy kiểm tra hộp thư đến và thư rác.';
          this._authNavTimer = setTimeout(() => this.renderForgotPassword('verify', inputEmail), 650);
        } catch (error) {
          feedback.style.color = '#ff8a8a';
          feedback.textContent = error.message || 'Không thể gửi mã xác nhận. Vui lòng thử lại.';
          submitBtn.disabled = false;
        }
      });
      document.getElementById('authForgotBackBtn').addEventListener('click', () => this.renderLogin());
      return;
    }

    this.contentArea.innerHTML = `
      <div class="authHeaderBadge">🔐 Xác nhận mật khẩu</div>
      <div class="authStep">BƯỚC 2 / 2</div>
      <p class="authHint">Nhập mã xác nhận 6 chữ số đã gửi tới <b>${this.escapeHtml(email)}</b>, sau đó đặt mật khẩu mới.</p>
      <form class="authForm" id="authResetForm">
        <div class="authField">
          <label>Email</label>
          <input type="email" name="email" autocomplete="email" required value="${this.escapeHtml(email)}" />
        </div>
        <div class="authField">
          <label>Mã xác nhận</label>
          <input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required placeholder="123456" />
        </div>
        <div class="authField">
          <label>Mật khẩu mới</label>
          <div class="authPasswordWrap">
            <input id="resetPasswordInput" type="password" name="newPassword" autocomplete="new-password" required minlength="6" placeholder="Ít nhất 6 ký tự" />
            <button type="button" class="authEyeBtn" id="resetEyeBtn" aria-label="Hiện mật khẩu">◉</button>
          </div>
        </div>
        <button class="authPrimaryBtn" type="submit">ĐẶT LẠI MẬT KHẨU</button>
        <div class="authResult" id="authFeedback"></div>
      </form>
      <div class="authNavLinks">
        <button type="button" class="authLinkBtn" id="authResendCodeBtn">Gửi lại mã</button>
        <span style="color:#505a80; padding-top:6px;">•</span>
        <button type="button" class="authLinkBtn" id="authForgotBackBtn">Quay lại đăng nhập</button>
      </div>
    `;
    const form = document.getElementById('authResetForm');
    const resetInput = document.getElementById('resetPasswordInput');
    const resetEye = document.getElementById('resetEyeBtn');
    resetEye.addEventListener('click', () => {
      const visible = resetInput.type === 'text';
      resetInput.type = visible ? 'password' : 'text';
      resetEye.textContent = visible ? '◉' : '◌';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      const data = new FormData(form);
      const inputEmail = String(data.get('email') || '').trim().toLowerCase();
      const code = String(data.get('code') || '').trim();
      const newPassword = String(data.get('newPassword') || '');
      const feedback = document.getElementById('authFeedback');
      if (!/^\d{6}$/.test(code)) { feedback.style.color = '#ff8a8a'; feedback.textContent = 'Mã xác nhận phải gồm 6 chữ số.'; return; }
      if (newPassword.length < 6) { feedback.style.color = '#ff8a8a'; feedback.textContent = 'Mật khẩu phải có ít nhất 6 ký tự.'; return; }
      submitBtn.disabled = true;
      feedback.style.color = '#ffd689';
      feedback.textContent = 'Đang xác nhận...';
      try {
        await this.resetPassword(inputEmail, code, newPassword);
        this.contentArea.innerHTML = `<div style="text-align:center;padding:26px 8px 10px;"><div style="font-size:42px;margin-bottom:10px;">✓</div><div style="font-size:18px;font-weight:800;color:#8affb0;margin-bottom:8px;">Đã cập nhật mật khẩu</div><div style="font-size:13px;color:#aab4d7;">Đang quay lại trang đăng nhập...</div></div>`;
        this._authNavTimer = setTimeout(() => this.renderLogin(), 1100);
      } catch (error) {
        feedback.style.color = '#ff8a8a';
        feedback.textContent = error.message || 'Không thể đặt lại mật khẩu.';
        submitBtn.disabled = false;
      }
    });
    document.getElementById('authResendCodeBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      const feedback = document.getElementById('authFeedback');
      const currentEmail = form.querySelector('[name="email"]').value.trim().toLowerCase();
      btn.disabled = true;
      feedback.style.color = '#ffd689';
      feedback.textContent = 'Đang gửi mã mới...';
      try {
        await this.forgotPassword(currentEmail);
        feedback.style.color = '#8affb0';
        feedback.textContent = 'Đã gửi mã mới.';
      } catch (error) {
        feedback.style.color = '#ff8a8a';
        feedback.textContent = error.message || 'Không thể gửi lại mã.';
      } finally {
        setTimeout(() => { if (btn.isConnected) btn.disabled = false; }, 1200);
      }
    });
    document.getElementById('authForgotBackBtn').addEventListener('click', () => this.renderLogin());
  },

  renderRegister() {
    this.modal.querySelector('#authModalTitle').textContent = 'Tạo tài khoản';
    this.contentArea.innerHTML = `
      <div class="authHeaderBadge">✨ Người chơi mới</div>
      <p class="authHint">Tạo tài khoản để lưu tiến trình, mở khóa thành tích và xuất hiện trên bảng xếp hạng.</p>
      <form class="authForm" id="authRegisterForm">
        <div class="authField">
          <label>Email</label>
          <input type="email" name="email" autocomplete="email" placeholder="you@example.com" required />
        </div>
        <div class="authField">
          <label>Tên người chơi</label>
          <input type="text" name="username" minlength="3" maxlength="64" autocomplete="username" placeholder="Nhập tên người chơi" required />
        </div>
        <div class="authField">
          <label>Mật khẩu</label>
          <div class="authPasswordWrap">
            <input id="registerPasswordInput" type="password" name="password" minlength="6" autocomplete="new-password" placeholder="Ít nhất 6 ký tự" required />
            <button type="button" class="authEyeBtn" id="registerEyeBtn" aria-label="Hiện mật khẩu">◉</button>
          </div>
        </div>
        <div class="authField">
          <label>Xác nhận mật khẩu</label>
          <div class="authPasswordWrap">
            <input id="registerConfirmInput" type="password" name="confirmPassword" minlength="6" autocomplete="new-password" placeholder="Nhập lại mật khẩu" required />
            <button type="button" class="authEyeBtn" id="registerConfirmEyeBtn" aria-label="Hiện mật khẩu">◉</button>
          </div>
        </div>
        <button class="authPrimaryBtn" type="submit">TẠO TÀI KHOẢN</button>
        <div class="authResult" id="authFeedback"></div>
      </form>
      <div class="authDivider"></div>
      <button type="button" class="authSecondaryBtn" id="authLoginNavBtn">← Đã có tài khoản? Đăng nhập</button>
    `;

    const form = document.getElementById('authRegisterForm');
    const togglePassword = (input, btn) => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      btn.textContent = visible ? '◉' : '◌';
    };
    togglePassword;
    document.getElementById('registerEyeBtn').addEventListener('click', () => togglePassword(document.getElementById('registerPasswordInput'), document.getElementById('registerEyeBtn')));
    document.getElementById('registerConfirmEyeBtn').addEventListener('click', () => togglePassword(document.getElementById('registerConfirmInput'), document.getElementById('registerConfirmEyeBtn')));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      const data = new FormData(form);
      const email = String(data.get('email') || '').trim().toLowerCase();
      const username = String(data.get('username') || '').trim();
      const password = String(data.get('password') || '');
      const confirmPassword = String(data.get('confirmPassword') || '');
      const feedback = document.getElementById('authFeedback');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { feedback.style.color='#ff8a8a'; feedback.textContent='Vui lòng nhập email hợp lệ.'; return; }
      if (username.length < 3) { feedback.style.color='#ff8a8a'; feedback.textContent='Tên người chơi phải có ít nhất 3 ký tự.'; return; }
      if (password.length < 6) { feedback.style.color='#ff8a8a'; feedback.textContent='Mật khẩu phải có ít nhất 6 ký tự.'; return; }
      if (password !== confirmPassword) { feedback.style.color='#ff8a8a'; feedback.textContent='Mật khẩu xác nhận không khớp.'; return; }
      submitBtn.disabled = true;
      feedback.style.color = '#ffd689';
      feedback.textContent = 'Đang tạo tài khoản...';
      try {
        await this.register(email, username, password);
        feedback.style.color = '#8affb0';
        feedback.textContent = 'Tạo tài khoản thành công!';
        this._authNavTimer = setTimeout(() => this.renderContent('menu'), 500);
      } catch (error) {
        feedback.style.color = '#ff8a8a';
        feedback.textContent = error.message || 'Đăng ký thất bại. Vui lòng thử lại.';
        submitBtn.disabled = false;
      }
    });
    document.getElementById('authLoginNavBtn').addEventListener('click', () => this.renderLogin());
  },

  renderMenu() {
    this.modal.querySelector('#authModalTitle').textContent = 'Main Menu';
    const initial = this.user ? this.user.username.charAt(0).toUpperCase() : '?';
    const userName = this.user ? this.user.username : 'Welcome';
    const goldPill = this.user
      ? `<span class="authMenuGoldPill" id="menuGoldLabel">🪙 ${this.user.gold ?? 0} Gold</span>`
      : '';
    const menuAvatarInner = this.user && this.user.avatarUrl
      ? `<img src="${this.user.avatarUrl}" alt="avatar" />`
      : initial;
    this.contentArea.innerHTML = `
      <div class="authMenuUserCard">
        <div class="authAvatar">${menuAvatarInner}</div>
        <div class="authMenuUserInfo">
          <div class="authMenuUserName">${userName}</div>
          ${goldPill}
        </div>
      </div>
      <div class="authMenuGrid">
        <button class="authMenuButton menuPrimary" id="menuPlayBtn">
          <span class="menuBtnIcon">▶</span><span class="menuBtnLabel">Play</span>
        </button>
        <button class="authMenuButton menuUpgrade" id="menuShopBtn">
          <span class="menuBtnIcon">⬆️</span><span class="menuBtnLabel">Nâng Cấp</span>
        </button>
        <button class="authMenuButton menuProfile" id="menuProfileBtn">
          <span class="menuBtnIcon">👤</span><span class="menuBtnLabel">Profile</span>
        </button>
        <button class="authMenuButton menuLeaderboard" id="menuLeaderboardBtn">
          <span class="menuBtnIcon">🏆</span><span class="menuBtnLabel">Leaderboard</span>
        </button>
        <button class="authMenuButton menuAchievements" id="menuAchievementsBtn">
          <span class="menuBtnIcon">🏅</span><span class="menuBtnLabel">Achievements</span>
        </button>
        <button class="authMenuButton menuLogout" id="menuLogoutBtn">
          <span class="menuBtnIcon">↪</span><span class="menuBtnLabel">Logout</span>
        </button>
      </div>
    `;
    document.getElementById('menuPlayBtn').addEventListener('click', () => {
      this.hideModal();
      window.dispatchEvent(new Event('authPlayClicked'));
    });
    document.getElementById('menuProfileBtn').addEventListener('click', () => this.renderProfile());
    document.getElementById('menuLeaderboardBtn').addEventListener('click', () => this.renderLeaderboard());
    document.getElementById('menuShopBtn').addEventListener('click', () => this.renderShop());
    document.getElementById('menuAchievementsBtn').addEventListener('click', () => this.renderAchievements());
    document.getElementById('menuLogoutBtn').addEventListener('click', () => {
      // logout() đã tự mở lại modal Login — KHÔNG được gọi hideModal() ở đây,
      // nếu không modal vừa mở sẽ bị đóng ngay lập tức (bug: bấm Logout tưởng
      // như không có phản ứng gì).
      this.logout();
    });

    // Làm mới Gold trong nền (không chặn hiển thị menu), để nếu người dùng
    // vừa mua nâng cấp ở máy khác thì vẫn thấy đúng số dư khi vào lại.
    if (this.token && this.user) {
      this.getProfile().then(({ profile }) => {
        this.updateLocalGold(profile.gold);
        const goldEl = this.contentArea.querySelector('#menuGoldLabel');
        if (goldEl) goldEl.textContent = `🪙 ${this.user.gold ?? 0} Gold`;
      }).catch(() => { /* im lặng bỏ qua, không làm phiền người dùng vì lỗi nền */ });
    }
  },

  async renderProfile() {
    this.modal.querySelector('#authModalTitle').textContent = 'Profile';
    if (!this.token) {
      this.contentArea.innerHTML = '<p>Please log in to view profile.</p>';
      return;
    }
    this.contentArea.innerHTML = '<p>Loading profile...</p>';
    try {
      const { profile } = await this.getProfile();
      this.modal.querySelector('#authModalTitle').textContent = `Profile: ${profile.username}`;
      this.updateLocalGold(profile.gold);

      const gold = profile.gold ?? 0;
      // Không có field "level" tài khoản ở backend — dùng mốc Gold kế tiếp
      // (bội số của 1000) làm thanh tiến độ trực quan cho lượng vàng đang có.
      const goldTierSize = 1000;
      const goldTier = Math.floor(gold / goldTierSize);
      const goldIntoTier = gold - goldTier * goldTierSize;
      const goldPct = Math.min(100, Math.round((goldIntoTier / goldTierSize) * 100));
      const goldNextTarget = (goldTier + 1) * goldTierSize;

      const initials = (profile.username || '?').trim().slice(0, 2).toUpperCase();
      const avatarInner = profile.avatarUrl
        ? `<img src="${profile.avatarUrl}" alt="avatar" />`
        : initials;

      const cloudIconSvg = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.2 8.06 4 4 0 0 1 17 16H7z"
            stroke="#8fc2ff" stroke-width="1.6" stroke-linejoin="round" fill="rgba(143,194,255,0.12)"/>
          <path d="M12 11v6m0 0-2.2-2.2M12 17l2.2-2.2" stroke="#bcdcff" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

      this.contentArea.innerHTML = `
        <div class="authProfileHeader">
          <div class="authAvatar">${avatarInner}</div>
          <div class="authProfileNames">
            <div class="authProfileUsername">${profile.username}</div>
            <div class="authProfileEmail">${profile.email}</div>
          </div>
        </div>

        <div class="authProgressRow">
          <div class="authProgressLabel">
            <span>🪙 Gold</span>
            <span class="authProgressValue" id="authGoldValueLabel">${gold} / ${goldNextTarget}</span>
          </div>
          <div class="authProgressBar">
            <div class="authProgressFill goldFill" id="authGoldFill" style="width:0%"></div>
          </div>
        </div>

        <div class="authInfoCard avatarCard">
          <span class="authInfoText">
            <span class="authInfoIcon">🖼️</span>
            <span>Avatar: ${profile.avatarUrl ? 'Đã đặt' : 'Chưa đặt (dùng chữ cái đầu)'}</span>
          </span>
          <button class="authAvatarPickBtn" id="authAvatarPickBtn" type="button">Đổi avatar</button>
        </div>
        <div class="authAvatarGrid" id="authAvatarGrid" style="display:none;">
          ${AVATAR_PRESETS.map(url => `
            <button class="authAvatarOption${profile.avatarUrl === url ? ' selected' : ''}" type="button" data-avatar-url="${url}">
              <img src="${url}" alt="avatar option" />
            </button>
          `).join('')}
        </div>

        <div class="authCloudRow">
          <div class="authCloudIcon">${cloudIconSvg}</div>
          <div class="authCloudText">
            ${profile.cloudSaveUrl
              ? `Đã có Cloud Save — <a href="${profile.cloudSaveUrl}" target="_blank">mở file</a>`
              : 'Chưa có Cloud Save nào được lưu.'}
          </div>
        </div>

        <div class="authInfoCard">
          <span class="authInfoText">
            <span class="authInfoIcon">🔐</span>
            <span>Bảo mật tài khoản</span>
          </span>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="authAvatarPickBtn" id="authChangeEmailBtn" type="button">Đổi email</button>
            <button class="authAvatarPickBtn" id="authChangePasswordBtn" type="button">Đổi mật khẩu</button>
          </div>
        </div>
        <form class="authForm" id="authEmailForm" style="display:none;">
          <label>Email mới</label>
          <input type="email" name="email" required value="${profile.email}" />
          <label>Mật khẩu hiện tại (để xác nhận)</label>
          <input type="password" name="currentPassword" required autocomplete="current-password" />
          <button type="submit">Cập nhật email</button>
          <div class="authResult" id="authEmailFeedback"></div>
        </form>
        <form class="authForm" id="authPasswordForm" style="display:none;">
          <label>Mật khẩu hiện tại</label>
          <input type="password" name="currentPassword" required autocomplete="current-password" />
          <label>Mật khẩu mới (tối thiểu 6 ký tự)</label>
          <input type="password" name="newPassword" required minlength="6" autocomplete="new-password" />
          <button type="submit">Cập nhật mật khẩu</button>
          <div class="authResult" id="authPasswordFeedback"></div>
        </form>

        <div class="authButtonRow">
          <button id="authLogoutBtn">Logout</button>
          <button id="authLoadSaveBtn">Load Cloud Save</button>
          <button id="authSaveCloudBtn">Save Current Game</button>
        </div>
        <div class="authResult" id="authProfileFeedback"></div>
      `;

      // Animate thanh Gold từ 0 lên đúng % sau khi DOM đã render, để có
      // hiệu ứng "chạy vào" thay vì hiện tĩnh ngay lập tức.
      requestAnimationFrame(() => {
        const fill = document.getElementById('authGoldFill');
        if (fill) fill.style.width = goldPct + '%';
      });

      document.getElementById('authLogoutBtn').addEventListener('click', () => {
        this.logout();
      });
      document.getElementById('authAvatarPickBtn').addEventListener('click', () => {
        const grid = document.getElementById('authAvatarGrid');
        const isOpen = grid.style.display !== 'none';
        grid.style.display = isOpen ? 'none' : 'grid';
        document.getElementById('authAvatarPickBtn').textContent = isOpen ? 'Đổi avatar' : 'Đóng';
      });
      this.contentArea.querySelectorAll('.authAvatarOption').forEach(btn => {
        btn.addEventListener('click', async () => {
          const feedback = document.getElementById('authProfileFeedback');
          const url = btn.getAttribute('data-avatar-url');
          if (url === profile.avatarUrl) return;
          feedback.textContent = 'Đang cập nhật avatar...';
          try {
            await this.updateProfile({ avatarUrl: url });
            this.updateLocalAvatar(url);
            feedback.textContent = 'Đã đổi avatar!';
            this.renderProfile();
          } catch (error) {
            feedback.textContent = error.message;
          }
        });
      });

      // Đổi email / đổi mật khẩu: hai form nhỏ ẩn/hiện độc lập, mở cái này
      // thì đóng cái kia lại cho gọn giao diện.
      const emailForm = document.getElementById('authEmailForm');
      const passwordForm = document.getElementById('authPasswordForm');
      document.getElementById('authChangeEmailBtn').addEventListener('click', () => {
        passwordForm.style.display = 'none';
        emailForm.style.display = emailForm.style.display === 'none' ? 'block' : 'none';
      });
      document.getElementById('authChangePasswordBtn').addEventListener('click', () => {
        emailForm.style.display = 'none';
        passwordForm.style.display = passwordForm.style.display === 'none' ? 'block' : 'none';
      });
      emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('authEmailFeedback');
        const formData = new FormData(emailForm);
        const email = formData.get('email').trim();
        const currentPassword = formData.get('currentPassword');
        feedback.style.color = '';
        feedback.textContent = 'Đang cập nhật...';
        try {
          const result = await this.updateProfile({ email, currentPassword });
          this.applyProfileResponse(result);
          feedback.style.color = '#8affb0';
          feedback.textContent = 'Đã cập nhật email!';
          setTimeout(() => this.renderProfile(), 600);
        } catch (error) {
          feedback.style.color = '#ff8a8a';
          feedback.textContent = error.message;
        }
      });
      passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('authPasswordFeedback');
        const formData = new FormData(passwordForm);
        const currentPassword = formData.get('currentPassword');
        const newPassword = formData.get('newPassword');
        feedback.style.color = '';
        feedback.textContent = 'Đang cập nhật...';
        try {
          const result = await this.updateProfile({ currentPassword, newPassword });
          this.applyProfileResponse(result);
          feedback.style.color = '#8affb0';
          feedback.textContent = 'Đã đổi mật khẩu!';
          passwordForm.reset();
        } catch (error) {
          feedback.style.color = '#ff8a8a';
          feedback.textContent = error.message;
        }
      });
      document.getElementById('authSaveCloudBtn').addEventListener('click', async () => {
        const feedback = document.getElementById('authProfileFeedback');
        feedback.textContent = 'Saving...';
        const saveData = window.currentGameScene && window.currentGameScene.exportSaveData ? window.currentGameScene.exportSaveData() : null;
        if (!saveData) {
          feedback.textContent = 'No game in progress to save.';
          return;
        }
        try {
          const result = await this.saveCloud(saveData);
          feedback.textContent = 'Cloud save saved.';
          this.renderProfile();
        } catch (error) {
          feedback.textContent = error.message;
        }
      });
      document.getElementById('authLoadSaveBtn').addEventListener('click', async () => {
        const feedback = document.getElementById('authProfileFeedback');
        feedback.textContent = 'Đang tải Cloud Save...';
        try {
          const result = await this.loadCloud();
          if (!result.cloudSave) {
            feedback.textContent = 'Không tìm thấy Cloud Save.';
            return;
          }

          const save = result.cloudSave;
          const scene = window.game ? window.game.scene.getScene('GameScene') : null;

          // Nếu đang ở GameScene: nạp snapshot trực tiếp.
          if (scene && scene.scene.isActive() && scene.applySaveData) {
            const wasPaused = !!scene.isPaused;
            if (wasPaused) scene.hidePauseMenu?.();
            const ok = scene.applySaveData(save);
            if (!ok && wasPaused) {
              scene.isPaused = true;
              scene.physics.pause();
              scene.setJoyZoneVisible(false);
              scene.showPauseMenu();
            }
            feedback.textContent = ok ? 'Đã load file save thành công!' : 'Cloud Save không phù hợp với class hiện tại.';
            if (ok && scene.showToast) scene.showToast('Đã load file save thành công!', true);
            return;
          }

          // Nếu đang ở Title/Menu: mở một GameScene mới theo class của save rồi
          // truyền snapshot vào init(). Người chơi không cần chọn lại class.
          if (!window.game || !window.game.scene) {
            throw new Error('Game chưa sẵn sàng để load Cloud Save.');
          }
          const classId = save.classId || 'archer';
          if (typeof CLASSES === 'undefined' || !CLASSES[classId]) {
            throw new Error('Class trong Cloud Save không còn tồn tại.');
          }

          this.hideModal();
          window.game.scene.start('GameScene', {
            classId,
            difficulty: save.difficulty || 'normal',
            cloudSave: save
          });
        } catch (error) {
          feedback.textContent = error.message;
        }
      });
    } catch (error) {
      this.contentArea.innerHTML = `<p>Error loading profile: ${error.message}</p>`;
    }
  },

  async renderLeaderboard() {
    this.modal.querySelector('#authModalTitle').textContent = 'Leaderboard';
    this.modal.querySelector('#authModalContent').classList.add('leaderboardModal');
    this.contentArea.innerHTML = '<p>Loading leaderboard...</p>';
    try {
      const { leaderboard } = await this.getLeaderboard();
      if (!leaderboard.length) {
        this.contentArea.innerHTML = '<p>No scores yet.</p>';
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const rows = leaderboard.map((entry, i) => {
        const isMe = this.user && entry.user && entry.user.username === this.user.username;
        return `
        <tr${isMe ? ' style="background:rgba(108,92,231,0.25); font-weight:600;"' : ''}>
          <td>${medals[i] || (i + 1)}</td>
          <td>${entry.user ? entry.user.username : 'Unknown'}${isMe ? ' (Bạn)' : ''}</td>
          <td>${entry.score}</td>
          <td>${entry.kills}</td>
          <td>${entry.levelReached}</td>
          <td>${entry.gameMode}</td>
        </tr>
      `;
      }).join('');
      this.contentArea.innerHTML = `
        <p style="color:#a0a0c0; font-size:13px; margin-bottom:10px;">Hiển thị điểm cao nhất của mỗi người chơi.</p>
        <div class="leaderboardWrap">
          <table class="authTable">
            <thead><tr><th>#</th><th>User</th><th>Score</th><th>Kills</th><th>Level</th><th>Mode</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    } catch (error) {
      this.contentArea.innerHTML = `<p>Error: ${error.message}</p>`;
    }
  },

  async renderShop() {
    this.modal.querySelector('#authModalTitle').textContent = 'Nâng Cấp';
    this.contentArea.innerHTML = '<p>Loading shop...</p>';
    try {
      const catalogData = await this.getCatalog();
      const inventoryData = this.token ? await this.getInventory() : { inventory: [] };
      if (this.token) {
        try {
          const { profile } = await this.getProfile();
          this.updateLocalGold(profile.gold);
        } catch (e) { /* lỗi mạng - bỏ qua, dùng số Gold đã có sẵn */ }
      }

      const myGold = this.user ? (this.user.gold ?? 0) : 0;
      const loggedIn = !!(this.token && this.user);
      const levelByKey = {};
      inventoryData.inventory.forEach(i => { levelByKey[i.itemKey] = i.quantity; });

      const catalogRows = catalogData.catalog.map(item => {
        const def = typeof UPGRADE_DEFS !== 'undefined' ? UPGRADE_DEFS[item.itemKey] : null;
        const currentLevel = levelByKey[item.itemKey] || 0;
        const maxed = currentLevel >= item.maxLevel;
        const nextPrice = Math.round(item.basePrice * Math.pow(item.priceGrowth, currentLevel));
        const canAfford = loggedIn && myGold >= nextPrice;
        let action;
        if (!loggedIn) action = `<button disabled title="Đăng nhập để mua">Mua</button>`;
        else if (maxed) action = `<span style="color:#8affb0;">Tối đa</span>`;
        else if (!canAfford) action = `<button disabled title="Không đủ Gold">Không đủ Gold</button>`;
        else action = `<button class="shopBuyBtn" data-key="${item.itemKey}">Mua • 🪙 ${nextPrice}</button>`;
        return `
        <tr>
          <td>${def ? def.icon + ' ' : ''}${item.title}</td>
          <td>${currentLevel} / ${item.maxLevel}</td>
          <td>${item.description}</td>
          <td>${action}</td>
        </tr>
      `;
      }).join('');

      this.contentArea.innerHTML = `
        <p style="color:#f7d774; font-weight:600; margin-bottom:12px;">🪙 Số dư của bạn: ${loggedIn ? myGold : '—'} Gold</p>
        <p style="color:#a0a0c0; font-size:13px; margin-bottom:10px;">Nâng cấp vĩnh viễn, cộng dồn theo cấp, áp dụng cho mọi lượt chơi. Giá tăng dần mỗi cấp.</p>
        <div><strong>Cửa hàng Nâng Cấp</strong></div>
        <table class="authTable">
          <thead><tr><th>Nâng cấp</th><th>Cấp</th><th>Mô tả</th><th>Hành động</th></tr></thead>
          <tbody>${catalogRows}</tbody>
        </table>
        <div class="authResult" id="authShopFeedback"></div>
      `;
      document.querySelectorAll('.shopBuyBtn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const feedback = document.getElementById('authShopFeedback');
          feedback.style.color = '#ffd689';
          feedback.textContent = 'Đang mua...';
          try {
            const result = await this.purchase(btn.dataset.key);
            this.updateLocalGold(result.goldBalance);
            feedback.style.color = '#8affb0';
            feedback.textContent = 'Mua thành công!';
            // Mở khóa thành tựu "Khách Sộp" (mua nâng cấp đầu tiên) — findOrCreate ở
            // server tự bỏ qua nếu đã mở khóa từ trước, gọi lại vô hại.
            if (typeof ACHIEVEMENT_DEFS !== 'undefined') {
              const def = ACHIEVEMENT_DEFS.find(a => a.key === 'first_purchase');
              if (def) this.unlockAchievement(def.key, def.title, def.description).catch(() => {});
            }
            this.renderShop();
          } catch (error) {
            feedback.style.color = '#ff8a8a';
            feedback.textContent = error.message;
          }
        });
      });
    } catch (error) {
      this.contentArea.innerHTML = `<p>Error: ${error.message}</p>`;
    }
  },

  async renderAchievements() {
    this.modal.querySelector('#authModalTitle').textContent = 'Achievements';
    if (!this.token) {
      this.contentArea.innerHTML = '<p>Please log in to view achievements.</p>';
      return;
    }
    this.contentArea.innerHTML = '<p>Loading achievements...</p>';
    try {
      const { achievements } = await this.getAchievements();
      const unlockedMap = new Map(achievements.map(item => [item.key, item]));
      const catalog = typeof ACHIEVEMENT_DEFS !== 'undefined' ? ACHIEVEMENT_DEFS : [];

      const progressLabel = catalog.length
        ? `<p style="color:#a0a0c0; font-size:13px; margin-bottom:10px;">Đã mở khóa ${unlockedMap.size}/${catalog.length}</p>`
        : '';

      const rows = catalog.length
        ? catalog.map(def => {
            const unlocked = unlockedMap.get(def.key);
            return `
        <tr${unlocked ? '' : ' style="opacity:0.45;"'}>
          <td style="font-size:20px;">${unlocked ? def.icon : '🔒'}</td>
          <td>${def.title}</td>
          <td>${def.description}</td>
          <td>${unlocked ? new Date(unlocked.unlockedAt).toLocaleString() : '—'}</td>
        </tr>
      `;
          }).join('')
        // Fallback nếu vì lý do nào đó ACHIEVEMENT_DEFS chưa load: vẫn hiện các mục đã mở khóa từ server.
        : achievements.map(item => `
        <tr>
          <td>🏆</td>
          <td>${item.title}</td>
          <td>${item.description}</td>
          <td>${new Date(item.unlockedAt).toLocaleString()}</td>
        </tr>
      `).join('');

      this.contentArea.innerHTML = `
        ${progressLabel}
        <table class="authTable">
          <thead><tr><th></th><th>Title</th><th>Description</th><th>Unlocked</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" style="color:#a0a0c0;">Chưa có dữ liệu thành tựu.</td></tr>'}</tbody>
        </table>
      `;
    } catch (error) {
      this.contentArea.innerHTML = `<p>Error: ${error.message}</p>`;
    }
  }
};

window.AuthAPI = AuthAPI;
window.addEventListener('DOMContentLoaded', () => AuthAPI.init());
