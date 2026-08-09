// Khi frontend được server (server/app.js) phục vụ cùng origin (đúng như cách
// app đã deploy lên Azure Web App), dùng đường dẫn tương đối '/api' để gọi đúng
// domain đang chạy. Chỉ khi mở file tĩnh ở localhost khác cổng với server thì mới
// trỏ về localhost:4000 để tiện test riêng frontend.
const API_BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  && location.port && location.port !== '4000'
  ? 'http://localhost:4000/api'
  : '/api';

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
    // Việc chuyển màn được thực hiện tại nơi gọi (renderLogin/renderRegister/renderGuestLogin)
    // sau khi đã hiển thị thông báo thành công cho người dùng thấy.
  },

  setGuestSession(username) {
    const user = { username, email: '', guest: true };
    this.setSession(null, user);
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
          <span id="authModalTitle">Login</span>
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
        background: rgba(0, 0, 0, 0.78);
        z-index: 9999;
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
      .authActionButton:hover,
      .authMenuButton:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(76, 92, 255, 0.24);
        background: linear-gradient(135deg, #7d78ff, #5f5cf0);
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
      .authMenuButton {
        border-radius: 16px;
        min-height: 56px;
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
    `;
    document.head.appendChild(style);
  },

  showModal(section) {
    this.modal.style.display = 'flex';
    this.renderContent(section);
  },

  hideModal() {
    this.modal.style.display = 'none';
  },

  dispatchAuthStatusChanged() {
    window.dispatchEvent(new Event('authStatusChanged'));
  },

  renderContent(section) {
    if (!this.contentArea) return;
    this.contentArea.innerHTML = '';
    switch (section) {
      case 'login':
        this.renderLogin();
        break;
      case 'register':
        this.renderRegister();
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
    this.modal.querySelector('#authModalTitle').textContent = 'Login';
    this.contentArea.innerHTML = `
      <form class="authForm" id="authLoginForm">
        <label>Email</label>
        <input type="email" name="email" required />
        <label>Password</label>
        <input type="password" name="password" required />
        <button type="submit">Login</button>
        <div class="authResult" id="authFeedback"></div>
      </form>
      <div class="authButtonRow">
        <button type="button" id="authGuestBtn">Continue as Guest</button>
        <button type="button" id="authRegisterNavBtn">Register</button>
      </div>
    `;
    const form = document.getElementById('authLoginForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return; // chặn double-submit
      const formData = new FormData(form);
      const email = formData.get('email');
      const password = formData.get('password');
      const feedback = document.getElementById('authFeedback');
      submitBtn.disabled = true;
      feedback.style.color = '#ffd689';
      feedback.textContent = 'Đang đăng nhập...';
      try {
        await this.login(email, password);
        feedback.style.color = '#8affb0';
        feedback.textContent = 'Đăng nhập thành công!';
        setTimeout(() => this.renderContent('menu'), 600);
      } catch (error) {
        feedback.style.color = '#ff8a8a';
        feedback.textContent = error.message;
        submitBtn.disabled = false;
      }
    });
    document.getElementById('authGuestBtn').addEventListener('click', () => {
      this.renderGuestLogin();
    });
    document.getElementById('authRegisterNavBtn').addEventListener('click', () => {
      this.renderRegister();
    });
  },

  renderGuestLogin() {
    this.modal.querySelector('#authModalTitle').textContent = 'Play as Guest';
    this.contentArea.innerHTML = `
      <form class="authForm" id="authGuestForm">
        <label>Guest name</label>
        <input type="text" name="username" placeholder="Enter a name" required />
        <button type="submit">Continue as Guest</button>
        <div class="authResult" id="authFeedback"></div>
      </form>
      <div class="authButtonRow">
        <button type="button" id="authGuestBackBtn">Back to Login</button>
      </div>
    `;
    const form = document.getElementById('authGuestForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return; // chặn double-submit
      const formData = new FormData(form);
      const username = formData.get('username').trim();
      const feedback = document.getElementById('authFeedback');
      if (!username) {
        feedback.style.color = '#ff8a8a';
        feedback.textContent = 'Please enter a guest name.';
        return;
      }
      submitBtn.disabled = true;
      this.setGuestSession(username);
      feedback.style.color = '#8affb0';
      feedback.textContent = 'Guest mode enabled';
      setTimeout(() => this.renderContent('menu'), 600);
    });
    document.getElementById('authGuestBackBtn').addEventListener('click', () => {
      this.renderLogin();
    });
  },

  renderRegister() {
    this.modal.querySelector('#authModalTitle').textContent = 'Register';
    this.contentArea.innerHTML = `
      <form class="authForm" id="authRegisterForm">
        <label>Email</label>
        <input type="email" name="email" required />
        <label>Username</label>
        <input type="text" name="username" required />
        <label>Password</label>
        <input type="password" name="password" required />
        <button type="submit">Register</button>
        <div class="authResult" id="authFeedback"></div>
      </form>
      <div class="authButtonRow">
        <button type="button" id="authLoginNavBtn">Back to Login</button>
      </div>
    `;
    const form = document.getElementById('authRegisterForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return; // chặn double-submit
      const formData = new FormData(form);
      const email = formData.get('email');
      const username = formData.get('username');
      const password = formData.get('password');
      const feedback = document.getElementById('authFeedback');
      submitBtn.disabled = true;
      feedback.style.color = '#ffd689';
      feedback.textContent = 'Đang đăng ký...';
      try {
        await this.register(email, username, password);
        feedback.style.color = '#8affb0';
        feedback.textContent = 'Đăng ký thành công!';
        setTimeout(() => this.renderContent('menu'), 600);
      } catch (error) {
        feedback.style.color = '#ff8a8a';
        feedback.textContent = error.message;
        submitBtn.disabled = false;
      }
    });
    document.getElementById('authLoginNavBtn').addEventListener('click', () => {
      this.renderLogin();
    });
  },

  renderMenu() {
    this.modal.querySelector('#authModalTitle').textContent = 'Main Menu';
    const userLabel = this.user ? (this.user.guest ? `Guest: ${this.user.username}` : `User: ${this.user.username}`) : 'Welcome';
    const goldLabel = this.user && !this.user.guest ? ` &nbsp;•&nbsp; <span id="menuGoldLabel">🪙 ${this.user.gold ?? 0} Gold</span>` : '';
    this.contentArea.innerHTML = `
      <p style="margin-bottom:16px; color:#c8d0ff; font-size:15px;">${userLabel}${goldLabel}</p>
      <div class="authMenuGrid">
        <button class="authMenuButton" id="menuPlayBtn">Play</button>
        <button class="authMenuButton" id="menuProfileBtn">Profile</button>
        <button class="authMenuButton" id="menuLeaderboardBtn">Leaderboard</button>
        <button class="authMenuButton" id="menuShopBtn">Kho Đồ</button>
        <button class="authMenuButton" id="menuAchievementsBtn">Achievements</button>
        <button class="authMenuButton" id="menuLogoutBtn">Logout</button>
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
      this.logout();
      this.hideModal();
    });

    // Làm mới Gold trong nền (không chặn hiển thị menu), để nếu người dùng
    // vừa mua nâng cấp ở máy khác thì vẫn thấy đúng số dư khi vào lại.
    if (this.token && this.user && !this.user.guest) {
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
      this.contentArea.innerHTML = `
        <p><strong>Email:</strong> ${profile.email}</p>
        <p><strong>Username:</strong> ${profile.username}</p>
        <p><strong>🪙 Gold:</strong> ${profile.gold ?? 0}</p>
        <p><strong>Avatar:</strong> ${profile.avatarUrl || 'None'}</p>
        <p><strong>Saved cloud file:</strong> ${profile.cloudSaveUrl ? `<a href="${profile.cloudSaveUrl}" target="_blank">Open</a>` : 'None'}</p>
        <div class="authButtonRow">
          <button id="authLogoutBtn">Logout</button>
          <button id="authLoadSaveBtn">Load Cloud Save</button>
          <button id="authSaveCloudBtn">Save Current Game</button>
        </div>
        <div class="authResult" id="authProfileFeedback"></div>
      `;
      document.getElementById('authLogoutBtn').addEventListener('click', () => {
        this.logout();
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
        feedback.textContent = 'Loading save...';
        try {
          const result = await this.loadCloud();
          if (result.cloudSave && window.currentGameScene && window.currentGameScene.applySaveData) {
            window.currentGameScene.applySaveData(result.cloudSave);
            feedback.textContent = 'Cloud save loaded into current game.';
          } else {
            feedback.textContent = 'No active game to load save.';
          }
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
    this.contentArea.innerHTML = '<p>Loading leaderboard...</p>';
    try {
      const { leaderboard } = await this.getLeaderboard();
      if (!leaderboard.length) {
        this.contentArea.innerHTML = '<p>No scores yet.</p>';
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const rows = leaderboard.map((entry, i) => {
        const isMe = this.user && !this.user.guest && entry.user && entry.user.username === this.user.username;
        return `
        <tr${isMe ? ' style="background:rgba(108,92,231,0.25); font-weight:600;"' : ''}>
          <td>${medals[i] || (i + 1)}</td>
          <td>${entry.user ? entry.user.username : 'Guest'}${isMe ? ' (Bạn)' : ''}</td>
          <td>${entry.score}</td>
          <td>${entry.kills}</td>
          <td>${entry.levelReached}</td>
          <td>${entry.gameMode}</td>
        </tr>
      `;
      }).join('');
      this.contentArea.innerHTML = `
        <p style="color:#a0a0c0; font-size:13px; margin-bottom:10px;">Hiển thị điểm cao nhất của mỗi người chơi.</p>
        <table class="authTable">
          <thead><tr><th>#</th><th>User</th><th>Score</th><th>Kills</th><th>Level</th><th>Mode</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } catch (error) {
      this.contentArea.innerHTML = `<p>Error: ${error.message}</p>`;
    }
  },

  async renderShop() {
    this.modal.querySelector('#authModalTitle').textContent = 'Kho Đồ - Nâng Cấp';
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

      const myGold = this.user && !this.user.guest ? (this.user.gold ?? 0) : 0;
      const loggedIn = !!(this.token && this.user && !this.user.guest);
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
