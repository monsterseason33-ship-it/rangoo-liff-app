// ============================================================================
// BOSS Mobile Stock - Lightweight Web App for Admin
// High performance, 1-Tap Copy, Real-time Stock Sync
// ============================================================================

const PRESET_SHOPS = [
  {
    id: "shop_admin",
    name: "ร้านแอดมิน (Cloudflare D1)",
    type: "cloudflare_d1",
    url: "https://winter-boat-b3d1.monsterseason33.workers.dev",
    key: "cloudflare_d1_unlimited"
  },
  {
    id: "shop_rangoo",
    name: "ร้านกู",
    type: "supabase",
    url: "https://teeporxvxrwzwmnsnjyw.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZXBvcnh2eHJ3endtbnNuanl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDU3NjcxMCwiZXhwIjoyMTAwMTUyNzEwfQ.Bgjp3EEFzRYAolKKb485LaRdShztnKJj3g7EDC8zGkk"
  }
];

// App State (Default: ร้านแอดมิน Cloudflare D1)
let currentShop = PRESET_SHOPS[0];
let rawAccounts = [];
let rawApps = [];
let rawPackages = [];
let activeAppFilter = "all";
let searchQuery = "";
let isPasswordHidden = false;
let appGroups = {};

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW failed', err));
  });
}

// ----------------------------------------------------------------------------
// Initialization
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadSavedShop();
  initUIEventListeners();
  loadData();
});

function loadSavedShop() {
  const savedId = localStorage.getItem("boss_stock_active_shop_id");
  if (savedId) {
    const found = PRESET_SHOPS.find(s => s.id === savedId);
    if (found) {
      currentShop = found;
    } else {
      currentShop = PRESET_SHOPS[0]; // Default: ร้านแอดมิน (Cloudflare D1)
    }
  } else {
    currentShop = PRESET_SHOPS[0]; // Default: ร้านแอดมิน (Cloudflare D1)
  }
  updateShopBadgeText();
}

function updateShopBadgeText() {
  const badge = document.getElementById("shop-name-badge");
  if (badge) badge.textContent = currentShop.name;
}

function initUIEventListeners() {
  // Search
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      if (searchClear) searchClear.style.display = searchQuery ? "block" : "none";
      renderStockFeed();
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      searchQuery = "";
      searchClear.style.display = "none";
      renderStockFeed();
    });
  }

  // Refresh
  const refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      haptic();
      showToast("⏳ กำลังโหลดข้อมูลล่าสุด...");
      loadData(true);
    });
  }

  // Password toggle
  const pwdToggle = document.getElementById("btn-toggle-pwd");
  if (pwdToggle) {
    pwdToggle.addEventListener("click", () => {
      haptic();
      isPasswordHidden = !isPasswordHidden;
      pwdToggle.textContent = isPasswordHidden ? "👁️ แสดงรหัส" : "🙈 ซ่อนรหัส";
      renderStockFeed();
    });
  }

  // Bottom action: Copy all
  const copyAllBtn = document.getElementById("btn-copy-all-stock");
  if (copyAllBtn) {
    copyAllBtn.addEventListener("click", copyAllStockScript);
  }

  // Modal shop switch
  const shopBadgeBtn = document.getElementById("shop-badge-btn");
  if (shopBadgeBtn) {
    shopBadgeBtn.addEventListener("click", openShopModal);
  }
}

// ----------------------------------------------------------------------------
// Data Fetching
// ----------------------------------------------------------------------------
async function loadData(force = false) {
  try {
    const feed = document.getElementById("stock-feed");
    if (!rawAccounts.length && feed) {
      feed.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <div class="empty-title">กำลังดึงข้อมูลสต็อก...</div>
        </div>
      `;
    }

    if (currentShop.type === "supabase") {
      await loadFromSupabase();
    } else {
      await loadFromCloudflare();
    }

    processData();
    renderChips();
    renderStockFeed();
    updateMetrics();

  } catch (err) {
    console.error("Fetch data error:", err);
    showToast("⚠️ โหลดข้อมูลไม่สำเร็จ: " + err.message);
  }
}

async function loadFromSupabase() {
  const headers = {
    "apikey": currentShop.key,
    "Authorization": `Bearer ${currentShop.key}`,
    "Content-Type": "application/json"
  };

  const [accRes, appsRes, pkgsRes] = await Promise.all([
    fetch(`${currentShop.url}/rest/v1/accounts?status=eq.available&select=*`, { headers }),
    fetch(`${currentShop.url}/rest/v1/apps?select=*`, { headers }),
    fetch(`${currentShop.url}/rest/v1/packages?select=*`, { headers })
  ]);

  if (!accRes.ok) throw new Error("Accounts API Error " + accRes.status);
  rawAccounts = await accRes.json();
  rawApps = appsRes.ok ? await appsRes.json() : [];
  rawPackages = pkgsRes.ok ? await pkgsRes.json() : [];
}

async function loadFromCloudflare() {
  const headers = {
    "Authorization": `Bearer ${currentShop.key}`,
    "Content-Type": "application/json"
  };

  const [accRes, appsRes, pkgsRes] = await Promise.all([
    fetch(`${currentShop.url}/api/accounts?status=available`, { headers }),
    fetch(`${currentShop.url}/api/apps`, { headers }),
    fetch(`${currentShop.url}/api/packages`, { headers })
  ]);

  rawAccounts = accRes.ok ? await accRes.json() : [];
  rawApps = appsRes.ok ? await appsRes.json() : [];
  rawPackages = pkgsRes.ok ? await pkgsRes.json() : [];
}

// ----------------------------------------------------------------------------
// Data Processing & Filtering (100% Exclude Expired & <24H)
// ----------------------------------------------------------------------------
function processData() {
  const now = new Date();
  const MS_IN_24_HOURS = 24 * 60 * 60 * 1000;

  // 1. Filter out expired or <24h accounts
  const validAccounts = rawAccounts.filter(a => {
    if (a.status !== "available") return false;
    if (a.expiry_date) {
      const expDate = new Date(a.expiry_date);
      if (!isNaN(expDate.getTime()) && (expDate.getTime() - now.getTime()) <= MS_IN_24_HOURS) {
        return false;
      }
    }
    return true;
  });

  // 2. Group by App and Package
  appGroups = {};

  validAccounts.forEach(acc => {
    const app = rawApps.find(a => a.id === acc.app_id);
    const appName = app ? (app.display_name || app.name) : "อื่นๆ";
    const appId = app ? app.id : (acc.app_id || "other");

    const pkgObj = acc.package_id ? rawPackages.find(p => p.id === acc.package_id) : null;
    const pkgName = (pkgObj ? pkgObj.name : (acc.package_name || "")).trim();

    const groupKey = `${appId}____${pkgName}`;

    if (!appGroups[groupKey]) {
      appGroups[groupKey] = {
        appId: appId,
        appName: appName,
        pkgName: pkgName,
        accountsByEmail: {},
        totalScreens: 0
      };
    }

    const emailKey = (acc.email || "no_email").trim();
    if (!appGroups[groupKey].accountsByEmail[emailKey]) {
      appGroups[groupKey].accountsByEmail[emailKey] = {
        email: acc.email || "-",
        password: acc.password || "-",
        expiry_date: acc.expiry_date,
        screens: []
      };
    }

    appGroups[groupKey].totalScreens++;
    appGroups[groupKey].accountsByEmail[emailKey].screens.push(acc);
  });
}

// ----------------------------------------------------------------------------
// Metrics
// ----------------------------------------------------------------------------
function updateMetrics() {
  let totalScreens = 0;
  const emailsSet = new Set();
  const appsSet = new Set();

  Object.values(appGroups).forEach(group => {
    totalScreens += group.totalScreens;
    appsSet.add(group.appId);
    Object.keys(group.accountsByEmail).forEach(e => emailsSet.add(e));
  });

  const screenEl = document.getElementById("stat-screens");
  const accEl = document.getElementById("stat-accounts");
  const appEl = document.getElementById("stat-apps");
  const bottomBadge = document.getElementById("bottom-stat-badge");

  if (screenEl) screenEl.textContent = totalScreens;
  if (accEl) accEl.textContent = emailsSet.size;
  if (appEl) appEl.textContent = appsSet.size;
  if (bottomBadge) bottomBadge.textContent = `${totalScreens} จอว่าง | ${emailsSet.size} บัญชี`;
}

// ----------------------------------------------------------------------------
// App Brand Theme & Styling Metadata
// ----------------------------------------------------------------------------
function getAppTheme(appName = "") {
  const norm = (appName || "").toLowerCase();
  if (norm.includes("netflix")) {
    return {
      color: "#e50914",
      gradient: "linear-gradient(135deg, rgba(229, 9, 20, 0.22) 0%, rgba(20, 2, 4, 0.6) 100%)",
      border: "rgba(229, 9, 20, 0.38)",
      icon: "🍿",
      tag: "NETFLIX UHD 4K"
    };
  }
  if (norm.includes("prime") || norm.includes("amazon")) {
    return {
      color: "#00a8e1",
      gradient: "linear-gradient(135deg, rgba(0, 168, 225, 0.22) 0%, rgba(2, 20, 35, 0.6) 100%)",
      border: "rgba(0, 168, 225, 0.38)",
      icon: "📦",
      tag: "PRIME VIDEO"
    };
  }
  if (norm.includes("disney") || norm.includes("hotstar")) {
    return {
      color: "#00d2ff",
      gradient: "linear-gradient(135deg, rgba(0, 99, 229, 0.25) 0%, rgba(0, 210, 255, 0.15) 100%)",
      border: "rgba(0, 210, 255, 0.38)",
      icon: "🏰",
      tag: "DISNEY+"
    };
  }
  if (norm.includes("youtube")) {
    return {
      color: "#ff0000",
      gradient: "linear-gradient(135deg, rgba(255, 0, 0, 0.22) 0%, rgba(30, 0, 0, 0.6) 100%)",
      border: "rgba(255, 0, 0, 0.38)",
      icon: "▶️",
      tag: "YOUTUBE"
    };
  }
  if (norm.includes("viu")) {
    return {
      color: "#ffbc00",
      gradient: "linear-gradient(135deg, rgba(255, 188, 0, 0.22) 0%, rgba(35, 25, 2, 0.6) 100%)",
      border: "rgba(255, 188, 0, 0.38)",
      icon: "💛",
      tag: "VIU"
    };
  }
  if (norm.includes("wetv")) {
    return {
      color: "#ff8200",
      gradient: "linear-gradient(135deg, rgba(255, 130, 0, 0.22) 0%, rgba(0, 180, 100, 0.15) 100%)",
      border: "rgba(255, 130, 0, 0.38)",
      icon: "🧡",
      tag: "WETV VIP"
    };
  }
  if (norm.includes("bilibili") || norm.includes("bili")) {
    return {
      color: "#00a1d6",
      gradient: "linear-gradient(135deg, rgba(0, 161, 214, 0.22) 0%, rgba(251, 114, 153, 0.15) 100%)",
      border: "rgba(0, 161, 214, 0.38)",
      icon: "📺",
      tag: "BILIBILI"
    };
  }
  if (norm.includes("iqiyi")) {
    return {
      color: "#00c234",
      gradient: "linear-gradient(135deg, rgba(0, 194, 52, 0.2) 0%, rgba(2, 30, 10, 0.6) 100%)",
      border: "rgba(0, 194, 52, 0.38)",
      icon: "🥝",
      tag: "IQIYI"
    };
  }
  if (norm.includes("hbo") || norm.includes("max")) {
    return {
      color: "#a855f7",
      gradient: "linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(30, 10, 45, 0.6) 100%)",
      border: "rgba(168, 85, 247, 0.4)",
      icon: "🎬",
      tag: "HBO MAX"
    };
  }
  if (norm.includes("canva")) {
    return {
      color: "#00c4cc",
      gradient: "linear-gradient(135deg, rgba(0, 196, 204, 0.25) 0%, rgba(125, 42, 232, 0.2) 100%)",
      border: "rgba(0, 196, 204, 0.38)",
      icon: "🎨",
      tag: "CANVA PRO"
    };
  }
  if (norm.includes("spotify")) {
    return {
      color: "#1db954",
      gradient: "linear-gradient(135deg, rgba(29, 185, 84, 0.2) 0%, rgba(4, 25, 12, 0.6) 100%)",
      border: "rgba(29, 185, 84, 0.38)",
      icon: "🎧",
      tag: "SPOTIFY"
    };
  }
  if (norm.includes("monomax") || norm.includes("mono")) {
    return {
      color: "#ed1c24",
      gradient: "linear-gradient(135deg, rgba(237, 28, 36, 0.22) 0%, rgba(30, 2, 4, 0.6) 100%)",
      border: "rgba(237, 28, 36, 0.38)",
      icon: "🔴",
      tag: "MONOMAX"
    };
  }
  return {
    color: "#38bdf8",
    gradient: "linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%)",
    border: "rgba(56, 189, 248, 0.25)",
    icon: "🎬",
    tag: appName.toUpperCase()
  };
}

// ----------------------------------------------------------------------------
// Render Chips (App Filters with Authentic Brand Accents)
// ----------------------------------------------------------------------------
function renderChips() {
  const container = document.getElementById("chips-container");
  if (!container) return;

  // Calculate screens per app
  const appTotals = {};
  let overallScreens = 0;

  Object.values(appGroups).forEach(g => {
    appTotals[g.appId] = (appTotals[g.appId] || 0) + g.totalScreens;
    overallScreens += g.totalScreens;
  });

  let html = `
    <button type="button" class="chip-btn ${activeAppFilter === 'all' ? 'active' : ''}" onclick="selectChip('all')">
      <span>🌐</span>
      <span>ทั้งหมด</span>
      <span class="chip-count">${overallScreens}</span>
    </button>
  `;

  // Get distinct apps that actually have stock
  const distinctAppIds = Object.keys(appTotals);
  distinctAppIds.forEach(appId => {
    const app = rawApps.find(a => a.id === appId);
    const appName = app ? (app.display_name || app.name) : appId;
    const count = appTotals[appId] || 0;
    const theme = getAppTheme(appName);

    const isCurrentActive = activeAppFilter === appId;
    const dynamicStyle = isCurrentActive
      ? `border-color: ${theme.color}; box-shadow: 0 4px 14px ${theme.color}40;`
      : ``;

    html += `
      <button type="button" class="chip-btn ${isCurrentActive ? 'active' : ''}" style="${dynamicStyle}" onclick="selectChip('${appId}')">
        <span>${theme.icon}</span>
        <span>${escapeHtml(appName)}</span>
        <span class="chip-count" style="${isCurrentActive ? `background: ${theme.color}; color: #04101e;` : ''}">${count}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

window.selectChip = function(appId) {
  haptic();
  activeAppFilter = appId;
  renderChips();
  renderStockFeed();
};

// ----------------------------------------------------------------------------
// Render Stock Feed Cards (Brand Themed + Interactive Capsules)
// ----------------------------------------------------------------------------
function renderStockFeed() {
  const feed = document.getElementById("stock-feed");
  if (!feed) return;

  const now = new Date();
  const filteredGroups = Object.entries(appGroups).filter(([key, group]) => {
    // 1. App filter
    if (activeAppFilter !== "all" && group.appId !== activeAppFilter) return false;

    // 2. Search query
    if (searchQuery) {
      const matchApp = group.appName.toLowerCase().includes(searchQuery);
      const matchPkg = group.pkgName.toLowerCase().includes(searchQuery);
      const matchEmail = Object.keys(group.accountsByEmail).some(e => e.toLowerCase().includes(searchQuery));
      if (!matchApp && !matchPkg && !matchEmail) return false;
    }

    return true;
  });

  if (filteredGroups.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">ไม่พบสต็อกพร้อมขาย</div>
        <p style="font-size:12px; color:var(--text-dim); margin-top:4px;">ไม่มีบัญชีสถานะว่าง หรือบัญชีกำลังจะหมดอายุใน 24 ชม.</p>
      </div>
    `;
    return;
  }

  let html = "";

  filteredGroups.forEach(([groupKey, group]) => {
    const emailKeys = Object.keys(group.accountsByEmail);
    const theme = getAppTheme(group.appName);

    html += `
      <div class="group-card" style="--brand-color: ${theme.color}; --brand-gradient: ${theme.gradient}; --brand-border: ${theme.border};">
        <div class="group-header">
          <div class="group-title-wrap">
            <div class="group-app-name">
              <span class="app-brand-badge">${theme.icon}</span>
              <span>${escapeHtml(group.appName.toUpperCase())}</span>
            </div>
            ${group.pkgName ? `<span class="group-pkg-name">[${escapeHtml(group.pkgName)}]</span>` : ""}
          </div>
          <button type="button" class="group-copy-app-btn" onclick="copyAppStockScript('${group.appId}')" title="คัดลอกสต็อกทั้งแอปนี้">
            📋 ก็อปปี้ทั้งแอป (${group.totalScreens})
          </button>
        </div>
    `;

    emailKeys.forEach(emailKey => {
      const acc = group.accountsByEmail[emailKey];
      const pwdText = isPasswordHidden ? "••••••••" : acc.password;

      // Expiry calculation & Health Badge
      let expiryDisplay = "-";
      let expiryStatusClass = "healthy";
      let diffDays = 0;
      if (acc.expiry_date) {
        const expDate = new Date(acc.expiry_date);
        if (!isNaN(expDate.getTime())) {
          const dd = String(expDate.getDate()).padStart(2, '0');
          const mm = String(expDate.getMonth() + 1).padStart(2, '0');
          const yyyy = expDate.getFullYear();
          diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 3) {
            expiryStatusClass = "danger";
          } else if (diffDays <= 7) {
            expiryStatusClass = "warning";
          }
          expiryDisplay = `${dd}/${mm}/${yyyy} (เหลือ ${Math.max(1, diffDays)} วัน)`;
        }
      }

      // Sort screens
      const sortedScreens = [...acc.screens].sort((a, b) => {
        const nameA = a.profile_name || "";
        const nameB = b.profile_name || "";
        const numMatchA = nameA.match(/\d+/);
        const numMatchB = nameB.match(/\d+/);
        if (numMatchA && numMatchB) {
          const diff = parseInt(numMatchA[0], 10) - parseInt(numMatchB[0], 10);
          if (diff !== 0) return diff;
        }
        return nameA.localeCompare(nameB, "th", { numeric: true, sensitivity: "base" });
      });

      html += `
        <div class="account-card">
          <div class="acc-cred-row">
            <!-- Email row with 1-tap copy capsule -->
            <div class="cred-item">
              <span class="cred-label">🔹 อีเมล:</span>
              <div class="cred-pill-box" onclick="copySingleValue('${escapeHtml(acc.email)}', 'อีเมล', this.querySelector('.btn-mini-copy'))" title="แตะเพื่อคัดลอกอีเมล">
                <span class="cred-val">${escapeHtml(acc.email)}</span>
                <button type="button" class="btn-mini-copy" onclick="event.stopPropagation(); copySingleValue('${escapeHtml(acc.email)}', 'อีเมล', this)">คัดลอก</button>
              </div>
            </div>

            <!-- Password row with inline toggle + 1-tap copy capsule -->
            <div class="cred-item">
              <span class="cred-label">🔑 รหัส:</span>
              <div class="cred-pill-box" onclick="copySingleValue('${escapeHtml(acc.password)}', 'รหัสผ่าน', this.querySelector('.btn-mini-copy'))" title="แตะเพื่อคัดลอกรหัสผ่าน">
                <span class="cred-val pwd" data-real-pwd="${escapeHtml(acc.password)}" data-hidden="${isPasswordHidden ? 'true' : 'false'}">${escapeHtml(pwdText)}</span>
                <button type="button" class="btn-inline-pwd-toggle" onclick="event.stopPropagation(); toggleInlinePwd(this)" title="ซ่อน/แสดงรหัส">${isPasswordHidden ? '👁️' : '🙈'}</button>
                <button type="button" class="btn-mini-copy" onclick="event.stopPropagation(); copySingleValue('${escapeHtml(acc.password)}', 'รหัสผ่าน', this)">คัดลอก</button>
              </div>
            </div>

            <!-- Expiry row -->
            <div class="acc-expiry-box">
              <span class="cred-label">📅 หมดอายุ:</span>
              <span class="acc-expiry-badge ${expiryStatusClass}">
                <span>${expiryStatusClass === 'healthy' ? '🟢' : expiryStatusClass === 'warning' ? '🟡' : '🔴'}</span>
                <span>${escapeHtml(expiryDisplay)}</span>
              </span>
            </div>
          </div>

          <!-- Screens Slot List -->
          <div class="screens-section">
            <div class="screens-title">
              <span class="live-pulse-dot"></span>
              <span>จอว่างพร้อมส่ง (${sortedScreens.length} จอ)</span>
            </div>
            <div class="screens-grid">
              ${sortedScreens.map(s => {
                const pName = s.profile_name || "จอว่าง";
                const hasPin = Boolean(s.pin_code && s.pin_code !== "-" && s.pin_code.trim() !== "");
                const pinTxt = hasPin ? `🔒 PIN: ${s.pin_code}` : "🔓 ไม่มี PIN";
                return `
                  <div class="screen-item">
                    <div class="screen-name-col">
                      <span class="live-pulse-dot"></span>
                      <span class="screen-slot-badge">${escapeHtml(pName)}</span>
                    </div>
                    <div class="screen-actions-col">
                      <span class="screen-pin-tag ${hasPin ? 'has-pin' : ''}">${escapeHtml(pinTxt)}</span>
                      <button type="button" class="btn-screen-send" onclick="copySingleScreen('${escapeHtml(group.appName)}', '${escapeHtml(acc.email)}', '${escapeHtml(acc.password)}', '${escapeHtml(pName)}', '${escapeHtml(pinTxt)}', '${escapeHtml(expiryDisplay)}', this)">
                        🚀 ส่งจอนี้
                      </button>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <!-- Hero 1-Tap Copy Account Script Button -->
          <button type="button" class="btn-copy-account-script" onclick="copyAccountScript('${groupKey}', '${emailKey}', this)">
            <span>📋</span>
            <span>1-Tap ก็อปปี้สคริปต์บัญชีนี้ (พร้อมส่ง)</span>
          </button>
        </div>
      `;
    });

    html += `</div>`;
  });

  feed.innerHTML = html;
}

// Inline toggle password
window.toggleInlinePwd = function(btnEl) {
  haptic();
  const pwdEl = btnEl.previousElementSibling;
  if (!pwdEl) return;
  const isHidden = pwdEl.dataset.hidden === "true";
  if (isHidden) {
    pwdEl.textContent = pwdEl.dataset.realPwd;
    pwdEl.dataset.hidden = "false";
    btnEl.textContent = "🙈";
  } else {
    pwdEl.textContent = "••••••••";
    pwdEl.dataset.hidden = "true";
    btnEl.textContent = "👁️";
  }
};

// ----------------------------------------------------------------------------
// 1-Tap Copy Logic (Exact User Template Format + Micro-Animations)
// ----------------------------------------------------------------------------

// 1. Copy Account Script (Exact Format)
window.copyAccountScript = async function(groupKey, emailKey, btnEl) {
  haptic();
  const group = appGroups[groupKey];
  if (!group) return;
  const acc = group.accountsByEmail[emailKey];
  if (!acc) return;

  const now = new Date();
  let expiryStr = "-";
  if (acc.expiry_date) {
    const expDate = new Date(acc.expiry_date);
    if (!isNaN(expDate.getTime())) {
      const dd = String(expDate.getDate()).padStart(2, '0');
      const mm = String(expDate.getMonth() + 1).padStart(2, '0');
      const yyyy = expDate.getFullYear();
      const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expiryStr = `${dd}/${mm}/${yyyy} (เหลือ ${Math.max(1, diffDays)} วัน)`;
    }
  }

  const sortedScreens = [...acc.screens].sort((a, b) => {
    const nameA = a.profile_name || "";
    const nameB = b.profile_name || "";
    const numMatchA = nameA.match(/\d+/);
    const numMatchB = nameB.match(/\d+/);
    if (numMatchA && numMatchB) {
      const diff = parseInt(numMatchA[0], 10) - parseInt(numMatchB[0], 10);
      if (diff !== 0) return diff;
    }
    return nameA.localeCompare(nameB, "th", { numeric: true, sensitivity: "base" });
  });

  let text = `🎬 *${group.appName.toUpperCase()}*\n`;
  if (group.pkgName && group.pkgName.trim() !== "") {
    text += `[${group.pkgName.trim()}]\n`;
  }
  text += `──────────────────────────\n`;
  text += `🔹 อีเมลล์: ${acc.email}\n`;
  text += `🔑 รหัสผ่าน: ${acc.password}\n`;
  if (expiryStr !== "-") {
    text += `📅 วันหมดอายุ: ${expiryStr}\n`;
  }
  text += `  จอว่างพร้อมส่ง:\n`;
  sortedScreens.forEach(s => {
    const profName = s.profile_name || "จอว่าง";
    const pinStr = (s.pin_code && s.pin_code !== "-") ? `PIN: ${s.pin_code}` : "ไม่มี PIN";
    text += `    • 🟢 ${profName} | ${pinStr}\n`;
  });
  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  await copyToClipboard(text);

  // Micro-interaction animation on the button
  if (btnEl) {
    const originalContent = btnEl.innerHTML;
    btnEl.innerHTML = `<span>✅</span><span>คัดลอกสคริปต์แล้ว!</span>`;
    btnEl.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)";
    btnEl.style.color = "#ffffff";
    btnEl.style.borderColor = "#34d399";
    setTimeout(() => {
      btnEl.innerHTML = originalContent;
      btnEl.style.background = "";
      btnEl.style.color = "";
      btnEl.style.borderColor = "";
    }, 1500);
  }

  showToast(`⚡ คัดลอกสคริปต์ ${group.appName} สำเร็จ!`);
};

// 2. Copy Single Screen Handover
window.copySingleScreen = async function(appName, email, password, screenName, pinTxt, expiryDisplay, btnEl) {
  haptic();
  let text = `🎬 *${appName.toUpperCase()}*\n`;
  text += `──────────────────────────\n`;
  text += `🔹 อีเมลล์: ${email}\n`;
  text += `🔑 รหัสผ่าน: ${password}\n`;
  if (expiryDisplay && expiryDisplay !== "-") {
    text += `📅 วันหมดอายุ: ${expiryDisplay}\n`;
  }
  text += `👤 โปรไฟล์: 🟢 ${screenName}\n`;
  text += `🔢 ${pinTxt}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🙏 ขอบคุณที่อุดหนุนครับ เข้าใช้งานได้ทันทีเลยครับ ✨`;

  await copyToClipboard(text);

  if (btnEl) {
    const originalText = btnEl.innerHTML;
    btnEl.innerHTML = `<span>✓</span><span>ส่งจอนี้แล้ว</span>`;
    btnEl.style.background = "rgba(16, 185, 129, 0.35)";
    btnEl.style.color = "#34d399";
    setTimeout(() => {
      btnEl.innerHTML = originalText;
      btnEl.style.background = "";
      btnEl.style.color = "";
    }, 1200);
  }

  showToast(`📋 คัดลอกข้อมูล ${screenName} สำเร็จ!`);
};

// 3. Copy Single Value
window.copySingleValue = async function(val, label, btnEl) {
  haptic();
  await copyToClipboard(val);

  if (btnEl) {
    const originalText = btnEl.innerHTML;
    btnEl.innerHTML = `✓ ก็อปแล้ว`;
    btnEl.style.color = "#34d399";
    btnEl.style.borderColor = "rgba(52, 211, 153, 0.5)";
    setTimeout(() => {
      btnEl.innerHTML = originalText;
      btnEl.style.color = "";
      btnEl.style.borderColor = "";
    }, 1200);
  }

  showToast(`📋 คัดลอก${label}แล้ว: ${val}`);
};

// 4. Copy Entire App Stock Script
window.copyAppStockScript = async function(appId) {
  haptic();
  const targetGroups = Object.values(appGroups).filter(g => g.appId === appId);
  if (targetGroups.length === 0) return;

  const now = new Date();
  let text = "";

  targetGroups.forEach(group => {
    const emailKeys = Object.keys(group.accountsByEmail);
    if (emailKeys.length === 0) return;

    text += `🎬 *${group.appName.toUpperCase()}*\n`;
    if (group.pkgName && group.pkgName.trim() !== "") {
      text += `[${group.pkgName.trim()}]\n`;
    }
    text += `──────────────────────────\n`;

    emailKeys.forEach((emailKey, eIdx) => {
      const acc = group.accountsByEmail[emailKey];
      let expiryStr = "-";
      if (acc.expiry_date) {
        const expDate = new Date(acc.expiry_date);
        if (!isNaN(expDate.getTime())) {
          const dd = String(expDate.getDate()).padStart(2, '0');
          const mm = String(expDate.getMonth() + 1).padStart(2, '0');
          const yyyy = expDate.getFullYear();
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          expiryStr = `${dd}/${mm}/${yyyy} (เหลือ ${Math.max(1, diffDays)} วัน)`;
        }
      }

      text += `🔹 อีเมลล์: ${acc.email}\n`;
      text += `🔑 รหัสผ่าน: ${acc.password}\n`;
      if (expiryStr !== "-") {
        text += `📅 วันหมดอายุ: ${expiryStr}\n`;
      }
      text += `  จอว่างพร้อมส่ง:\n`;

      const sortedScreens = [...acc.screens].sort((a, b) => {
        const nameA = a.profile_name || "";
        const nameB = b.profile_name || "";
        const numMatchA = nameA.match(/\d+/);
        const numMatchB = nameB.match(/\d+/);
        if (numMatchA && numMatchB) {
          const diff = parseInt(numMatchA[0], 10) - parseInt(numMatchB[0], 10);
          if (diff !== 0) return diff;
        }
        return nameA.localeCompare(nameB, "th", { numeric: true, sensitivity: "base" });
      });

      sortedScreens.forEach(s => {
        const profName = s.profile_name || "จอว่าง";
        const pinStr = (s.pin_code && s.pin_code !== "-") ? `PIN: ${s.pin_code}` : "ไม่มี PIN";
        text += `    • 🟢 ${profName} | ${pinStr}\n`;
      });

      if (eIdx < emailKeys.length - 1) text += `\n`;
    });

    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  });

  await copyToClipboard(text.trim());
  showToast(`📋 คัดลอกสต็อก ${targetGroups[0].appName} ทั้งหมดแล้ว!`);
};

// 5. Copy All Available Stock Script (Store Summary)
window.copyAllStockScript = async function() {
  haptic();
  const now = new Date();
  const thaiDate = now.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  const thaiTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.`;

  let totalScreens = 0;
  const emailsSet = new Set();
  Object.values(appGroups).forEach(g => {
    totalScreens += g.totalScreens;
    Object.keys(g.accountsByEmail).forEach(e => emailsSet.add(e));
  });

  if (totalScreens === 0) {
    showToast("📭 ขณะนี้ไม่มีสินค้าสถานะว่างในระบบ");
    return;
  }

  let text = `✨ ══════════════════════ ✨\n`;
  text += `📦 *สรุปสต็อกสินค้าคงเหลือ (พร้อมขาย)*\n`;
  text += `📅 วันที่: ${thaiDate} (เวลา ${thaiTime})\n`;
  text += `📊 สต็อกว่างรวม: *${emailsSet.size} บัญชีหลัก* | *${totalScreens} จอว่าง*\n`;
  text += `✨ ══════════════════════ ✨\n\n`;

  Object.values(appGroups).forEach(group => {
    const emailKeys = Object.keys(group.accountsByEmail);
    if (emailKeys.length === 0) return;

    text += `🎬 *${group.appName.toUpperCase()}*\n`;
    if (group.pkgName && group.pkgName.trim() !== "") {
      text += `[${group.pkgName.trim()}]\n`;
    }
    text += `──────────────────────────\n`;

    emailKeys.forEach((emailKey, eIdx) => {
      const acc = group.accountsByEmail[emailKey];
      let expiryStr = "-";
      if (acc.expiry_date) {
        const expDate = new Date(acc.expiry_date);
        if (!isNaN(expDate.getTime())) {
          const dd = String(expDate.getDate()).padStart(2, '0');
          const mm = String(expDate.getMonth() + 1).padStart(2, '0');
          const yyyy = expDate.getFullYear();
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          expiryStr = `${dd}/${mm}/${yyyy} (เหลือ ${Math.max(1, diffDays)} วัน)`;
        }
      }

      text += `🔹 อีเมลล์: ${acc.email}\n`;
      text += `🔑 รหัสผ่าน: ${acc.password}\n`;
      if (expiryStr !== "-") {
        text += `📅 วันหมดอายุ: ${expiryStr}\n`;
      }
      text += `  จอว่างพร้อมส่ง:\n`;

      const sortedScreens = [...acc.screens].sort((a, b) => {
        const nameA = a.profile_name || "";
        const nameB = b.profile_name || "";
        const numMatchA = nameA.match(/\d+/);
        const numMatchB = nameB.match(/\d+/);
        if (numMatchA && numMatchB) {
          const diff = parseInt(numMatchA[0], 10) - parseInt(numMatchB[0], 10);
          if (diff !== 0) return diff;
        }
        return nameA.localeCompare(nameB, "th", { numeric: true, sensitivity: "base" });
      });

      sortedScreens.forEach(s => {
        const profName = s.profile_name || "จอว่าง";
        const pinStr = (s.pin_code && s.pin_code !== "-") ? `PIN: ${s.pin_code}` : "ไม่มี PIN";
        text += `    • 🟢 ${profName} | ${pinStr}\n`;
      });

      if (eIdx < emailKeys.length - 1) text += `\n`;
    });

    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  });

  // Summary tail
  const appSummaryTotals = {};
  Object.values(appGroups).forEach(group => {
    appSummaryTotals[group.appName] = (appSummaryTotals[group.appName] || 0) + group.totalScreens;
  });

  text += `📊 *สรุปสต็อกคงเหลือส่งร้าน:*\n`;
  Object.entries(appSummaryTotals).forEach(([appName, screenCount]) => {
    text += `  • ${appName}: ${screenCount} จอ\n`;
  });
  text += `✨ *รวมสต็อกพร้อมขายทั้งหมด: ${totalScreens} จอ*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  await copyToClipboard(text);

  const btn = document.getElementById("btn-copy-all-stock");
  if (btn) {
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span>✅</span><span>คัดลอกสต็อกทั้งหมดสำเร็จ!</span>`;
    btn.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)";
    btn.style.color = "#ffffff";
    setTimeout(() => {
      btn.innerHTML = originalContent;
      btn.style.background = "";
      btn.style.color = "";
    }, 1600);
  }

  showToast(`⚡ คัดลอกสรุปสต็อกทั้งหมดสำเร็จ (${totalScreens} จอ)`);
};

// ----------------------------------------------------------------------------
// Utilities (Clipboard, Haptics, Toast, Modal)
// ----------------------------------------------------------------------------
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (e) {}

  // Fallback
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } catch (e) {}
  document.body.removeChild(textarea);
}

function haptic() {
  if (navigator.vibrate) {
    try { navigator.vibrate(25); } catch (e) {}
  }
}

function showToast(msg) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>✨</span><span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Shop Switcher Modal
function openShopModal() {
  haptic();
  const overlay = document.getElementById("shop-modal-overlay");
  const list = document.getElementById("shop-list-container");
  if (!overlay || !list) return;

  list.innerHTML = PRESET_SHOPS.map(shop => `
    <button type="button" class="shop-item-btn ${shop.id === currentShop.id ? 'active' : ''}" onclick="selectShop('${shop.id}')">
      <div style="display:flex; flex-direction:column; text-align:left;">
        <span style="font-weight:700;">🏪 ${escapeHtml(shop.name)}</span>
        <span style="font-size:10.5px; color:var(--text-dim);">${shop.type === 'supabase' ? 'Supabase REST API' : 'Cloudflare D1 Worker'}</span>
      </div>
      <span>${shop.id === currentShop.id ? '✓' : ''}</span>
    </button>
  `).join("");

  overlay.style.display = "flex";
}

window.closeShopModal = function() {
  const overlay = document.getElementById("shop-modal-overlay");
  if (overlay) overlay.style.display = "none";
};

window.selectShop = function(shopId) {
  haptic();
  const found = PRESET_SHOPS.find(s => s.id === shopId);
  if (found) {
    currentShop = found;
    localStorage.setItem("boss_stock_active_shop_id", shopId);
    updateShopBadgeText();
    closeShopModal();
    showToast(`🔄 สลับเป็น "${currentShop.name}" แล้ว`);
    loadData(true);
  }
};
