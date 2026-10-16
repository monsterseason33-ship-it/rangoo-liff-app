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
    name: "ร้านกู (Cloudflare D1)",
    type: "cloudflare_d1",
    url: "https://winter-boat-b3d1.monsterseason33.workers.dev",
    key: "cloudflare_d1_unlimited"
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

// Register Service Worker for PWA (Only on web http / https protocols)
if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
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

  // Stock Form Toggle Listeners
  const toggleStockFormBtn = document.getElementById("btn-toggle-stock-form");
  if (toggleStockFormBtn) {
    toggleStockFormBtn.addEventListener("click", () => toggleStockForm());
  }
  const toggleStockFormHeaderBtn = document.getElementById("btn-toggle-stock-form-header");
  if (toggleStockFormHeaderBtn) {
    toggleStockFormHeaderBtn.addEventListener("click", () => toggleStockForm());
  }
  const closeFormPanelBtn = document.getElementById("btn-close-form-panel");
  if (closeFormPanelBtn) {
    closeFormPanelBtn.addEventListener("click", () => toggleStockForm(false));
  }
  const cancelAccBtn = document.getElementById("btn-cancel-account");
  if (cancelAccBtn) {
    cancelAccBtn.addEventListener("click", () => toggleStockForm(false));
  }

  // Initialize Stock Form Event Listeners
  initStockFormEventListeners();

  // Chips Event Delegation (App filters)
  const chipsContainer = document.getElementById("chips-container");
  if (chipsContainer) {
    chipsContainer.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip-btn");
      if (chip && chip.dataset.appId) {
        selectChip(chip.dataset.appId);
      }
    });
  }

  // Stock Feed Event Delegation (100% CSP compliant)
  const feed = document.getElementById("stock-feed");
  if (feed) {
    feed.addEventListener("click", (e) => {
      // 1. Send single screen
      const sendBtn = e.target.closest(".btn-screen-send");
      if (sendBtn) {
        e.stopPropagation();
        const d = sendBtn.dataset;
        copySingleScreen(d.appName, d.email, d.password, d.screenName, d.pinTxt, d.expiry, d.screenId, sendBtn);
        return;
      }

      // 2. Copy entire app stock
      const copyAppBtn = e.target.closest(".group-copy-app-btn");
      if (copyAppBtn) {
        e.stopPropagation();
        copyAppStockScript(copyAppBtn.dataset.appId);
        return;
      }

      // 3. Copy account script
      const copyAccBtn = e.target.closest(".btn-copy-account-script");
      if (copyAccBtn) {
        e.stopPropagation();
        copyAccountScript(copyAccBtn.dataset.groupKey, copyAccBtn.dataset.emailKey, copyAccBtn);
        return;
      }

      // 4. Inline toggle password
      const pwdToggleBtn = e.target.closest(".btn-inline-pwd-toggle");
      if (pwdToggleBtn) {
        e.stopPropagation();
        toggleInlinePwd(pwdToggleBtn);
        return;
      }

      // 5. Copy single value (from mini copy button or capsule or screen ID tag)
      const copyValTarget = e.target.closest("[data-copy-val]");
      if (copyValTarget) {
        e.stopPropagation();
        const val = copyValTarget.dataset.copyVal;
        const label = copyValTarget.dataset.copyLabel || "ข้อมูล";
        const animBtn = copyValTarget.querySelector(".btn-mini-copy") || copyValTarget;
        copySingleValue(val, label, animBtn);
        return;
      }
    });
  }

  // Modal shop switch & close events
  const shopOverlay = document.getElementById("shop-modal-overlay");
  if (shopOverlay) {
    shopOverlay.addEventListener("click", (e) => {
      if (e.target === shopOverlay) closeShopModal();
    });
  }
  const closeShopBtn = document.getElementById("btn-close-shop-modal");
  if (closeShopBtn) {
    closeShopBtn.addEventListener("click", closeShopModal);
  }
  const shopListContainer = document.getElementById("shop-list-container");
  if (shopListContainer) {
    shopListContainer.addEventListener("click", (e) => {
      const itemBtn = e.target.closest(".shop-item-btn");
      if (itemBtn && itemBtn.dataset.shopId) {
        selectShop(itemBtn.dataset.shopId);
      }
    });
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
    populateStockFormApps();

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
    <button type="button" class="chip-btn ${activeAppFilter === 'all' ? 'active' : ''}" data-app-id="all">
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
      <button type="button" class="chip-btn ${isCurrentActive ? 'active' : ''}" style="${dynamicStyle}" data-app-id="${escapeHtml(appId)}">
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
          <button type="button" class="group-copy-app-btn" data-app-id="${escapeHtml(group.appId)}" title="คัดลอกสต็อกทั้งแอปนี้">
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
              <div class="cred-pill-box" data-copy-val="${escapeHtml(acc.email)}" data-copy-label="อีเมล" title="แตะเพื่อคัดลอกอีเมล">
                <span class="cred-val">${escapeHtml(acc.email)}</span>
                <button type="button" class="btn-mini-copy" data-copy-val="${escapeHtml(acc.email)}" data-copy-label="อีเมล">คัดลอก</button>
              </div>
            </div>

            <!-- Password row with inline toggle + 1-tap copy capsule -->
            <div class="cred-item">
              <span class="cred-label">🔑 รหัส:</span>
              <div class="cred-pill-box" data-copy-val="${escapeHtml(acc.password)}" data-copy-label="รหัสผ่าน" title="แตะเพื่อคัดลอกรหัสผ่าน">
                <span class="cred-val pwd" data-real-pwd="${escapeHtml(acc.password)}" data-hidden="${isPasswordHidden ? 'true' : 'false'}">${escapeHtml(pwdText)}</span>
                <button type="button" class="btn-inline-pwd-toggle" title="ซ่อน/แสดงรหัส">${isPasswordHidden ? '👁️' : '🙈'}</button>
                <button type="button" class="btn-mini-copy" data-copy-val="${escapeHtml(acc.password)}" data-copy-label="รหัสผ่าน">คัดลอก</button>
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
                const screenId = s.display_id || s.id || "";
                return `
                  <div class="screen-item">
                    <div class="screen-info-col">
                      <div class="screen-primary-info">
                        <span class="live-pulse-dot"></span>
                        <span class="screen-slot-badge">${escapeHtml(pName)}</span>
                        ${screenId ? `
                          <span class="screen-id-tag" data-copy-val="${escapeHtml(String(screenId))}" data-copy-label="ID จอ" title="แตะเพื่อคัดลอก ID จอ">
                            🆔 #${escapeHtml(String(screenId))}
                          </span>
                        ` : ''}
                      </div>
                      <span class="screen-pin-tag ${hasPin ? 'has-pin' : ''}">${escapeHtml(pinTxt)}</span>
                    </div>
                    <button type="button" class="btn-screen-send"
                      data-app-name="${escapeHtml(group.appName)}"
                      data-email="${escapeHtml(acc.email)}"
                      data-password="${escapeHtml(acc.password)}"
                      data-screen-name="${escapeHtml(pName)}"
                      data-pin-txt="${escapeHtml(pinTxt)}"
                      data-expiry="${escapeHtml(expiryDisplay)}"
                      data-screen-id="${escapeHtml(String(screenId))}">
                      🚀 ส่งจอนี้
                    </button>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <!-- Hero 1-Tap Copy Account Script Button -->
          <button type="button" class="btn-copy-account-script" data-group-key="${escapeHtml(groupKey)}" data-email-key="${escapeHtml(emailKey)}">
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
    const screenId = s.display_id || s.id || "";
    const idTxt = screenId ? ` (ID: #${screenId})` : "";
    text += `    • 🟢 ${profName}${idTxt} | ${pinStr}\n`;
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
window.copySingleScreen = async function(appName, email, password, screenName, pinTxt, expiryDisplay, screenId, btnEl) {
  haptic();

  const cleanId = (screenId && screenId !== "-" && screenId !== "undefined" && screenId !== "null") 
    ? String(screenId).trim().replace(/^#/, '') 
    : "";
  const headerTitle = cleanId 
    ? `🎬 *${(appName || '').toUpperCase()}* #${cleanId}` 
    : `🎬 *${(appName || '').toUpperCase()}*`;

  const cleanScreenName = (screenName || "จอว่าง").trim();
  const formattedProfile = cleanScreenName.startsWith("🟢") 
    ? cleanScreenName 
    : `🟢 ${cleanScreenName}`;

  const cleanPin = (pinTxt || "🔓 ไม่มี PIN").trim().replace(/^🔢\s*/, "");

  let text = `${headerTitle}\n`;
  text += `──────────────────────────\n`;
  text += `🔹 อีเมลล์: ${email}\n`;
  text += `🔑 รหัสผ่าน: ${password}\n`;
  text += `👤 โปรไฟล์: ${formattedProfile}\n`;
  text += `🔢 ${cleanPin}\n`;
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
        const screenId = s.display_id || s.id || "";
        const idTxt = screenId ? ` (ID: #${screenId})` : "";
        text += `    • 🟢 ${profName}${idTxt} | ${pinStr}\n`;
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
    <button type="button" class="shop-item-btn ${shop.id === currentShop.id ? 'active' : ''}" data-shop-id="${shop.id}">
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

// ============================================================================
// 📦 Stock Form Panel Functions (div#stock-form-panel.form-panel.prem-card.expanded)
// ============================================================================

function toggleStockForm(forceOpen = null) {
  haptic();
  const panel = document.getElementById("stock-form-panel");
  if (!panel) return;
  const isExpanded = panel.classList.contains("expanded");
  const shouldOpen = forceOpen !== null ? forceOpen : !isExpanded;

  if (shouldOpen) {
    panel.classList.add("expanded");
    setTimeout(() => {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  } else {
    panel.classList.remove("expanded");
  }
}

function populateStockFormApps() {
  const appSelect = document.getElementById("acc-app-select");
  if (!appSelect) return;

  const currentVal = appSelect.value;
  appSelect.innerHTML = `<option value="">-- เลือกแอปพลิเคชัน --</option>`;

  rawApps.forEach(app => {
    const opt = document.createElement("option");
    opt.value = app.id;
    opt.textContent = `${app.display_name || app.name}`;
    appSelect.appendChild(opt);
  });

  if (currentVal && rawApps.some(a => a.id === currentVal)) {
    appSelect.value = currentVal;
  } else if (rawApps.length > 0 && !appSelect.value) {
    const netflix = rawApps.find(a => (a.name || "").toLowerCase().includes("netflix"));
    appSelect.value = netflix ? netflix.id : rawApps[0].id;
  }

  updateStockFormPackages();
}

function updateStockFormPackages() {
  const appSelect = document.getElementById("acc-app-select");
  const pkgSelect = document.getElementById("acc-package-select");
  if (!pkgSelect) return;

  const appId = appSelect ? appSelect.value : "";
  pkgSelect.innerHTML = `<option value="">-- ยังไม่กำหนดแพ็คเกจ --</option>`;

  // Toggle Disney Phone wrapper
  const appObj = rawApps.find(a => a.id === appId);
  const isDisney = appObj && (appObj.name || "").toLowerCase().includes("disney");
  const phoneWrapper = document.getElementById("acc-phone-wrapper");
  if (phoneWrapper) phoneWrapper.style.display = isDisney ? "block" : "none";

  if (!appId) {
    pkgSelect.disabled = true;
    renderScreensInputs(1);
    setDefaultExpiry(30);
    return;
  }

  pkgSelect.disabled = false;
  const filteredPkgs = rawPackages.filter(p => p.app_id === appId);

  filteredPkgs.forEach(pkg => {
    const opt = document.createElement("option");
    opt.value = pkg.id;
    opt.textContent = `${pkg.name} (${pkg.price}฿ • ${pkg.screens || 1} จอ • ${pkg.days || 30} วัน)`;
    pkgSelect.appendChild(opt);
  });

  if (filteredPkgs.length > 0) {
    pkgSelect.value = filteredPkgs[0].id;
    onStockFormPackageSelected(filteredPkgs[0]);
  } else {
    const screensInput = document.getElementById("pkg-screens");
    if (screensInput) screensInput.value = "1";
    renderScreensInputs(1);
    setDefaultExpiry(30);
  }
}

function onStockFormPackageSelected(pkg) {
  if (!pkg) {
    const pkgId = document.getElementById("acc-package-select")?.value;
    pkg = rawPackages.find(p => p.id === pkgId);
  }
  const screensCount = pkg ? (pkg.screens || 1) : 1;
  const screensInput = document.getElementById("pkg-screens");
  if (screensInput) screensInput.value = screensCount;

  const days = pkg ? (pkg.days || getPackageDays(pkg.name, pkg.app_id)) : 30;
  setDefaultExpiry(days);
  renderScreensInputs(screensCount);
}

function renderScreensInputs(count) {
  const container = document.getElementById("acc-screens-container");
  if (!container) return;

  const appId = document.getElementById("acc-app-select")?.value;
  const appObj = rawApps.find(a => a.id === appId);
  const isNetflix = appObj && (appObj.name || "").toLowerCase().includes("netflix");

  count = Math.max(1, Math.min(10, parseInt(count, 10) || 1));

  container.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const isTv = isNetflix ? (i === 5 || i > 4) : false;
    const div = document.createElement("div");
    div.className = "prem-screen-card";
    div.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="checkbox" class="acc-screen-enable-checkbox" checked title="เปิด/ปิด จอนี้">
          <span class="screen-row-badge">จอ ${i}</span>
        </div>
        <select class="acc-device-type-select prem-select-mini" style="max-width: 140px;">
          <option value="mobile" ${isTv ? '' : 'selected'}>📱 มือถือ / PC</option>
          <option value="tv" ${isTv ? 'selected' : ''}>📺 สมาร์ททีวี</option>
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px;">
        <input type="text" class="acc-profile-input prem-input-mini" placeholder="ชื่อจอ เช่น จอ ${i}" value="จอ ${i}">
        <div style="display: flex; gap: 4px;">
          <input type="text" class="acc-pin-input prem-input-mini" placeholder="รหัส PIN (ถ้ามี)">
          <button type="button" class="btn-random-pin-mini prem-btn-icon" title="สุ่ม PIN">🎲</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  }
}

function getPackageDays(pkgName, appId = null) {
  const name = (pkgName || "").trim();
  if (!name) return 30;

  let match = name.match(/(\d+)\/(\d+)\s*day/i);
  if (match) return parseInt(match[1], 10);
  match = name.match(/(\d+)\s*วัน/);
  if (match) return parseInt(match[1], 10);
  match = name.match(/(\d+)\s*day/i);
  if (match) return parseInt(match[1], 10);
  match = name.match(/(\d+)\s*ปี/);
  if (match) return parseInt(match[1], 10) * 365;
  if (name.includes("รายปี")) return 365;
  if (name.includes("รายเดือน")) return 30;
  if (name.includes("รายสัปดาห์")) return 7;

  if (rawPackages && rawPackages.length > 0) {
    const found = rawPackages.find(p => p.name === name && (!appId || p.app_id === appId)) || rawPackages.find(p => p.name === name);
    if (found && found.days && parseInt(found.days, 10) > 0) {
      return parseInt(found.days, 10);
    }
  }

  return 30;
}

function setDefaultExpiry(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  const str = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T23:59`;
  const expInput = document.getElementById("acc-expiry");
  if (expInput) expInput.value = str;
  updateExpiryText(date);
}

function updateExpiryText(dateObj) {
  const textEl = document.getElementById("acc-expiry-text");
  if (!textEl) return;
  if (!dateObj || isNaN(dateObj.getTime())) {
    textEl.textContent = "📅 คลิกเลือกวันเวลา...";
    return;
  }
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const pad = n => String(n).padStart(2, '0');
  const d = dateObj.getDate();
  const m = thaiMonths[dateObj.getMonth()];
  const y = dateObj.getFullYear() + 543;
  const time = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  textEl.textContent = `📅 ${d} ${m} ${y} เวลา ${time} น.`;
}

function generateRandomPassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  let pw = "";
  for (let i = 0; i < 10; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

function generateRandomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ----------------------------------------------------------------------------
// 📋 Quick Paste Parser
// ----------------------------------------------------------------------------
function handleQuickPaste() {
  const input = document.getElementById("acc-quick-paste");
  const batchInfo = document.getElementById("acc-quick-paste-batch-info");
  if (!input) return;

  const text = (input.value || "").trim();
  if (!text) {
    if (batchInfo) {
      batchInfo.style.display = "none";
      batchInfo.textContent = "";
    }
    return;
  }

  // 1. Auto-detect and select App if mentioned in text
  const lowerText = text.toLowerCase();
  for (const app of rawApps) {
    const appName = (app.name || "").toLowerCase();
    const appDisplay = (app.display_name || "").toLowerCase();
    if (lowerText.includes(appName) || (appDisplay && lowerText.includes(appDisplay))) {
      const appSelect = document.getElementById("acc-app-select");
      if (appSelect && appSelect.value !== app.id) {
        appSelect.value = app.id;
        updateStockFormPackages();
      }
      break;
    }
  }

  // 2. Check if Disney format
  const currentApp = rawApps.find(a => a.id === document.getElementById("acc-app-select")?.value);
  const isDisney = currentApp && (currentApp.name || "").toLowerCase().includes("disney");
  const isDisneyMaster = isDisney && (text.includes("พินจอ") || text.includes("พินเมล") || (text.match(/Mail:/i) && text.includes("เบอร์")));

  if (isDisneyMaster) {
    const disney = parseDisneyMasterAccountText(text);
    if (disney.email) document.getElementById("acc-email").value = disney.email;
    if (disney.password) document.getElementById("acc-password").value = disney.password;
    if (disney.phone) {
      const phoneInput = document.getElementById("acc-phone");
      if (phoneInput) phoneInput.value = disney.phone;
    }

    if (disney.profiles && disney.profiles.length > 0) {
      const screensInput = document.getElementById("pkg-screens");
      if (screensInput) screensInput.value = disney.profiles.length;
      renderScreensInputs(disney.profiles.length);

      const profileInputs = document.querySelectorAll(".acc-profile-input");
      const pinInputs = document.querySelectorAll(".acc-pin-input");
      const deviceSelects = document.querySelectorAll(".acc-device-type-select");

      disney.profiles.forEach((prof, idx) => {
        if (profileInputs[idx]) profileInputs[idx].value = prof.name;
        if (pinInputs[idx]) pinInputs[idx].value = prof.pin;
        if (deviceSelects[idx]) deviceSelects[idx].value = prof.device_type === "สมาร์ททีวี" ? "tv" : "mobile";
      });
    }

    flashParserSuccess(input);
    showToast("✨ ดึงข้อมูล Master Disney+ เรียบร้อย!");
    return;
  }

  // 3. Multi-account detection
  const multi = parseMultiAccountText(text);
  if (multi.length > 1) {
    if (batchInfo) {
      batchInfo.style.display = "block";
      batchInfo.innerHTML = `✨ ตรวจพบ <b>${multi.length} บัญชี</b> ในชุดข้อความ! (พร้อมสร้างสต็อกแบบกลุ่ม)`;
    }
    // Populate the first account into inputs
    document.getElementById("acc-email").value = multi[0].email;
    document.getElementById("acc-password").value = multi[0].password;
    if (multi[0].otp_url) {
      const otpInput = document.getElementById("acc-otp-link");
      if (otpInput) otpInput.value = multi[0].otp_url;
    }
    flashParserSuccess(input);
    return;
  } else if (batchInfo) {
    batchInfo.style.display = "none";
  }

  // 4. Single-account parsing
  const single = parseRawAccountText(text);
  if (single.emailOrPhone) {
    document.getElementById("acc-email").value = single.emailOrPhone;
  }
  if (single.password) {
    document.getElementById("acc-password").value = single.password;
  }
  if (single.expiryDateStr) {
    const expInput = document.getElementById("acc-expiry");
    if (expInput) {
      expInput.value = single.expiryDateStr;
      updateExpiryText(new Date(single.expiryDateStr));
    }
  }
  if (single.otpUrl) {
    const otpInput = document.getElementById("acc-otp-link");
    if (otpInput) otpInput.value = single.otpUrl;
  }

  // If specific screen / Netflix profile found
  if (single.netflixProfile) {
    const profInputs = document.querySelectorAll(".acc-profile-input");
    const pinInputs = document.querySelectorAll(".acc-pin-input");
    if (single.netflixProfile.screenNum && profInputs[0]) {
      profInputs[0].value = `จอ ${single.netflixProfile.screenNum}`;
    }
    if (single.netflixProfile.pin && pinInputs[0]) {
      pinInputs[0].value = single.netflixProfile.pin;
    }
  }

  flashParserSuccess(input);
  showToast("🟢 แยกข้อมูลอีเมลและรหัสผ่านอัตโนมัติสำเร็จ!");
}

function flashParserSuccess(el) {
  el.classList.remove("parser-success-flash");
  void el.offsetWidth;
  el.classList.add("parser-success-flash");
}

function parseRawAccountText(cleanText) {
  let emailOrPhone = "";
  let password = "";
  let expiryDateStr = "";
  let otpUrl = "";
  let netflixProfile = null;

  // 1. Extract OTP link if present
  const otpMatch = cleanText.match(/(https?:\/\/(?:code\.varinzxify\.com|abeslife\.com|[\w.-]+\.[\w.-]+)\/[^\s\n\r]*)/i);
  if (otpMatch) {
    otpUrl = otpMatch[1].trim();
  }

  // 2. Special format for Netflix or labeled raw text
  const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  if (emailMatch) {
    emailOrPhone = emailMatch[0].trim();
  }

  const pwMatch = cleanText.match(/(?:พาสเวิร์ด|พาส|Password|pass(?:word)?|รหัสผ่าน|รหัส)\s*[:\s\t\-=]*\s*([a-zA-Z0-9_!@#$%^&*.\-]+?)(?=(?:จอ|โปรไฟล์|pin|exp|หมด|♡|✬|\s|$))/i);
  if (pwMatch) {
    password = pwMatch[1].trim();
  }

  const screenMatch = cleanText.match(/(?:จอ|โปรไฟล์)\s*[:\s\t\-=]*\s*(\d+)/i);
  const screenNum = screenMatch ? parseInt(screenMatch[1], 10) : null;

  const pinMatch = cleanText.match(/(?:Pin|PIN|พิน|พินเมล|รหัส PIN)\s*[:\s\t\-=]*\s*(\d+)/i);
  const pinCode = pinMatch ? pinMatch[1].trim() : "";

  if (screenNum !== null && !isNaN(screenNum)) {
    netflixProfile = { screenNum, pin: pinCode };
  }

  // 3. Extract expiry date (e.g. Exp 03/08/2026 or 2026-08-03)
  const dateMatch = cleanText.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/) || cleanText.match(/\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
  if (dateMatch) {
    let day, month, year;
    if (dateMatch[1].length === 4) {
      year = parseInt(dateMatch[1], 10);
      month = parseInt(dateMatch[2], 10);
      day = parseInt(dateMatch[3], 10);
    } else {
      day = parseInt(dateMatch[1], 10);
      month = parseInt(dateMatch[2], 10);
      year = parseInt(dateMatch[3], 10);
    }
    if (year > 2400) year -= 543;
    const parsedDate = new Date(year, month - 1, day, 23, 59, 0);
    if (!isNaN(parsedDate.getTime())) {
      const pad = n => String(n).padStart(2, '0');
      expiryDateStr = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}T23:59`;
    }
  }

  // 4. Line by line delimiter split fallback (e.g. user:pass or user|pass)
  if (!password) {
    const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/[\s|:]+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const [first, second] = parts;
        if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(first) && !/^(email|user|login)$/i.test(first)) {
          emailOrPhone = first;
          password = second;
          break;
        }
      }
    }
  }

  return { emailOrPhone, password, expiryDateStr, otpUrl, netflixProfile };
}

function parseMultiAccountText(cleanText) {
  const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const accounts = [];

  for (const line of lines) {
    const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) continue;

    const email = emailMatch[0].trim();
    let remaining = line.replace(email, "").trim();
    remaining = remaining.replace(/^[:|\s\-]+/, "").trim();

    const parts = remaining.split(/[\s|:]+/).filter(Boolean);
    const password = parts[0] || "";

    if (password && password.length >= 4 && !password.includes("@")) {
      const otpMatch = line.match(/(https?:\/\/[^\s\n\r]+)/i);
      accounts.push({
        email,
        password,
        otp_url: otpMatch ? otpMatch[1].trim() : null
      });
    }
  }

  return accounts;
}

function parseDisneyMasterAccountText(rawText) {
  const text = rawText.replace(/\u00A0/g, ' ');
  let email = "";
  const emailMatch = text.match(/(?:Mail|เมล|email)[:\s\t\-]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
    text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) email = (emailMatch[1] || emailMatch[0]).trim();

  let phone = "";
  const phoneMatch = text.match(/(?:เบอร์|tel|phone)[:\s\t\-]*(\d{9,10})/i) ||
    text.match(/\b(0[689]\d{8})\b/);
  if (phoneMatch) phone = (phoneMatch[1] || phoneMatch[0]).trim();

  let password = "";
  const pinMailMatch = text.match(/(?:พินเมล|พินเมลล์|pin\s*mail|pinmail)[:\s\t\-]+([^\s\n\r]+)/i) ||
    text.match(/(?:รหัสผ่าน|พาส|พาสเวิร์ด|password|pass)[:\s\t\-]+([^\s\n\r]+)/i);
  if (pinMailMatch) password = (pinMailMatch[1] || pinMailMatch[0]).trim();

  const profiles = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    const tvMatch = l.match(/(?:TV|ทีวี)\s*(\d*)[:\s\t\-]+(\d{4,6})/i);
    if (tvMatch) {
      const tvName = tvMatch[1] ? ("TV" + tvMatch[1]) : "TV";
      profiles.push({ name: tvName, pin: tvMatch[2].trim(), device_type: "สมาร์ททีวี" });
      continue;
    }

    const screenMatches = l.match(/(?:จอ|โปรไฟล์)\s*(\d+)[:\s\t\-]+(\d{4,6})/i);
    if (screenMatches) {
      profiles.push({ name: `จอ ${screenMatches[1]}`, pin: screenMatches[2].trim(), device_type: "มือถือ" });
    }
  }

  return { email, phone, password, profiles };
}

// ----------------------------------------------------------------------------
// 💾 Save / Submit Stock Form
// ----------------------------------------------------------------------------
async function submitAccountForm() {
  haptic();
  const emailInput = document.getElementById("acc-email");
  const passwordInput = document.getElementById("acc-password");
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";
  const appId = document.getElementById("acc-app-select")?.value;
  const packageId = document.getElementById("acc-package-select")?.value || null;
  const status = document.getElementById("acc-status")?.value || "available";
  const expiryRaw = document.getElementById("acc-expiry")?.value;
  const otpUrl = document.getElementById("acc-otp-link")?.value.trim() || null;
  const phoneVal = document.getElementById("acc-phone")?.value.trim() || null;

  if (!appId) {
    showToast("❌ กรุณาเลือกแอปพลิเคชันก่อน!");
    return;
  }

  const quickPasteText = (document.getElementById("acc-quick-paste")?.value || "").trim();
  const multiAccounts = parseMultiAccountText(quickPasteText);
  const isMultiBatch = multiAccounts.length > 1;

  if (!isMultiBatch) {
    if (!email) {
      showToast("❌ กรุณากรอกอีเมลหรือบัญชีผู้ใช้!");
      emailInput?.focus();
      return;
    }
    if (!password) {
      showToast("❌ กรุณากรอกรหัสผ่าน!");
      passwordInput?.focus();
      return;
    }
  }

  const submitBtn = document.getElementById("btn-submit-account");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ กำลังบันทึกสต็อก...";
  }

  const expiryISO = expiryRaw ? new Date(expiryRaw).toISOString() : null;
  const profileInputs = document.querySelectorAll(".acc-profile-input");
  const pinInputs = document.querySelectorAll(".acc-pin-input");
  const checkboxes = document.querySelectorAll(".acc-screen-enable-checkbox");
  const deviceSelects = document.querySelectorAll(".acc-device-type-select");

  const records = [];

  if (isMultiBatch) {
    // Save multiple accounts at once with specified screens
    const screensCount = Math.max(1, parseInt(document.getElementById("pkg-screens")?.value, 10) || 1);
    multiAccounts.forEach(acc => {
      for (let i = 1; i <= screensCount; i++) {
        records.push({
          app_id: appId,
          package_id: packageId,
          email: acc.email,
          password: acc.password,
          profile_name: `จอ ${i}`,
          pin_code: null,
          device_type: i > 4 ? "tv" : "mobile",
          expiry_date: expiryISO,
          status: status,
          supplier_url: acc.otp_url || otpUrl,
          cookie_data: acc.otp_url || otpUrl || null
        });
      }
    });
  } else {
    // Single account with configured screens
    for (let i = 0; i < profileInputs.length; i++) {
      const isEnabled = checkboxes[i] ? checkboxes[i].checked : true;
      const profName = (profileInputs[i].value || "").trim() || `จอ ${i + 1}`;
      const pin = pinInputs[i] ? pinInputs[i].value.trim() : null;
      const dev = deviceSelects[i] ? deviceSelects[i].value : "mobile";

      records.push({
        app_id: appId,
        package_id: packageId,
        email: email,
        password: password,
        profile_name: profName,
        pin_code: pin || null,
        device_type: dev,
        expiry_date: expiryISO,
        status: isEnabled ? status : "broken",
        supplier_url: otpUrl,
        cookie_data: otpUrl || phoneVal || null
      });
    }

    if (records.length === 0) {
      records.push({
        app_id: appId,
        package_id: packageId,
        email: email,
        password: password,
        profile_name: "จอ 1",
        pin_code: null,
        device_type: "mobile",
        expiry_date: expiryISO,
        status: status,
        supplier_url: otpUrl,
        cookie_data: otpUrl || phoneVal || null
      });
    }
  }

  try {
    let saveRes;
    if (currentShop.type === "supabase") {
      saveRes = await fetch(`${currentShop.url}/rest/v1/accounts`, {
        method: "POST",
        headers: {
          "apikey": currentShop.key,
          "Authorization": `Bearer ${currentShop.key}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify(records)
      });
    } else {
      saveRes = await fetch(`${currentShop.url}/api/accounts`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentShop.key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(records)
      });
    }

    if (!saveRes.ok) {
      const errTxt = await saveRes.text();
      throw new Error(errTxt || `HTTP Error ${saveRes.status}`);
    }

    showToast(`🟢 เพิ่มสต็อกสำเร็จ (สร้าง ${records.length} หน้าจอ)! ✨`);
    resetStockForm();
    await loadData(true);
    selectChip(appId);
  } catch (err) {
    console.error("Save account error:", err);
    showToast("❌ บันทึกสต็อกไม่สำเร็จ: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "💾 บันทึกสต็อกเข้าคลัง";
    }
  }
}

function resetStockForm() {
  const quickPaste = document.getElementById("acc-quick-paste");
  if (quickPaste) quickPaste.value = "";
  const batchInfo = document.getElementById("acc-quick-paste-batch-info");
  if (batchInfo) {
    batchInfo.style.display = "none";
    batchInfo.textContent = "";
  }
  const emailInput = document.getElementById("acc-email");
  if (emailInput) emailInput.value = "";
  const passwordInput = document.getElementById("acc-password");
  if (passwordInput) passwordInput.value = "";
  const otpInput = document.getElementById("acc-otp-link");
  if (otpInput) otpInput.value = "";
  const phoneInput = document.getElementById("acc-phone");
  if (phoneInput) phoneInput.value = "";

  const pkgSelect = document.getElementById("acc-package-select");
  if (pkgSelect && pkgSelect.options.length > 0) {
    pkgSelect.selectedIndex = 0;
    onStockFormPackageSelected(null);
  }
}

function initStockFormEventListeners() {
  // Quick paste input event
  const quickPaste = document.getElementById("acc-quick-paste");
  if (quickPaste) {
    quickPaste.addEventListener("input", handleQuickPaste);
  }

  // App select change
  const appSelect = document.getElementById("acc-app-select");
  if (appSelect) {
    appSelect.addEventListener("change", () => {
      updateStockFormPackages();
    });
  }

  // Package select change
  const pkgSelect = document.getElementById("acc-package-select");
  if (pkgSelect) {
    pkgSelect.addEventListener("change", () => {
      onStockFormPackageSelected(null);
    });
  }

  // Screens count input change
  const screensInput = document.getElementById("pkg-screens");
  if (screensInput) {
    screensInput.addEventListener("input", (e) => {
      renderScreensInputs(e.target.value);
    });
  }

  // Expiry datetime change
  const expInput = document.getElementById("acc-expiry");
  if (expInput) {
    expInput.addEventListener("change", (e) => {
      if (e.target.value) {
        updateExpiryText(new Date(e.target.value));
      }
    });
  }

  // Quick date buttons
  document.querySelectorAll(".quick-date-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      haptic();
      const days = parseInt(btn.dataset.days, 10);
      if (!isNaN(days)) setDefaultExpiry(days);
    });
  });

  // Random password button
  const randomPwBtn = document.getElementById("btn-random-password-form");
  if (randomPwBtn) {
    randomPwBtn.addEventListener("click", () => {
      haptic();
      const pw = generateRandomPassword();
      const pwInput = document.getElementById("acc-password");
      if (pwInput) pwInput.value = pw;
      navigator.clipboard.writeText(pw).catch(() => {});
      showToast(`🎲 สุ่มรหัสใหม่ (${pw}) และคัดลอกแล้ว!`);
    });
  }

  // Copy email & password buttons
  const copyEmailBtn = document.getElementById("btn-copy-acc-email");
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener("click", () => {
      const email = document.getElementById("acc-email")?.value;
      if (email) {
        navigator.clipboard.writeText(email).catch(() => {});
        showToast("📋 คัดลอกอีเมลแล้ว!");
      }
    });
  }
  const copyPwBtn = document.getElementById("btn-copy-acc-password");
  if (copyPwBtn) {
    copyPwBtn.addEventListener("click", () => {
      const pw = document.getElementById("acc-password")?.value;
      if (pw) {
        navigator.clipboard.writeText(pw).catch(() => {});
        showToast("📋 คัดลอกรหัสผ่านแล้ว!");
      }
    });
  }

  // OTP chips
  document.querySelectorAll(".otp-chip-btn").forEach(chip => {
    chip.addEventListener("click", () => {
      haptic();
      const url = chip.dataset.url;
      const otpInput = document.getElementById("acc-otp-link");
      if (otpInput && url) {
        otpInput.value = url;
        showToast(`🌐 เลือกลิงก์ OTP: ${url}`);
      }
    });
  });

  // Event delegation for random PIN inside screens container
  const screensContainer = document.getElementById("acc-screens-container");
  if (screensContainer) {
    screensContainer.addEventListener("click", (e) => {
      const pinBtn = e.target.closest(".btn-random-pin-mini");
      if (pinBtn) {
        haptic();
        const pinInput = pinBtn.closest(".prem-screen-card")?.querySelector(".acc-pin-input");
        if (pinInput) {
          const newPin = generateRandomPin();
          pinInput.value = newPin;
          showToast(`🎲 สุ่ม PIN: ${newPin}`);
        }
      }
    });
  }

  // Submit button
  const submitBtn = document.getElementById("btn-submit-account");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitAccountForm);
  }
}

