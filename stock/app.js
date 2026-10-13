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

  if (screenEl) screenEl.textContent = totalScreens;
  if (accEl) accEl.textContent = emailsSet.size;
  if (appEl) appEl.textContent = appsSet.size;
}

// ----------------------------------------------------------------------------
// Render Chips (App Filters)
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
      🌐 ทั้งหมด <span class="chip-count">${overallScreens}</span>
    </button>
  `;

  // Get distinct apps that actually have stock
  const distinctAppIds = Object.keys(appTotals);
  distinctAppIds.forEach(appId => {
    const app = rawApps.find(a => a.id === appId);
    const appName = app ? (app.display_name || app.name) : appId;
    const count = appTotals[appId] || 0;

    html += `
      <button type="button" class="chip-btn ${activeAppFilter === appId ? 'active' : ''}" onclick="selectChip('${appId}')">
        🎬 ${escapeHtml(appName)} <span class="chip-count">${count}</span>
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
// Render Stock Feed Cards
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

    html += `
      <div class="group-card">
        <div class="group-header">
          <div class="group-title-wrap">
            <div class="group-app-name">
              <span>🎬</span>
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

      // Expiry calculation
      let expiryDisplay = "-";
      if (acc.expiry_date) {
        const expDate = new Date(acc.expiry_date);
        if (!isNaN(expDate.getTime())) {
          const dd = String(expDate.getDate()).padStart(2, '0');
          const mm = String(expDate.getMonth() + 1).padStart(2, '0');
          const yyyy = expDate.getFullYear();
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
            <div class="cred-item">
              <span class="cred-label">🔹 อีเมลล์:</span>
              <div style="display:flex; align-items:center;">
                <span class="cred-val">${escapeHtml(acc.email)}</span>
                <button type="button" class="btn-mini-copy" onclick="copySingleValue('${escapeHtml(acc.email)}', 'อีเมล')">คัดลอก</button>
              </div>
            </div>

            <div class="cred-item">
              <span class="cred-label">🔑 รหัสผ่าน:</span>
              <div style="display:flex; align-items:center;">
                <span class="cred-val pwd">${escapeHtml(pwdText)}</span>
                <button type="button" class="btn-mini-copy" onclick="copySingleValue('${escapeHtml(acc.password)}', 'รหัสผ่าน')">คัดลอก</button>
              </div>
            </div>

            <div class="cred-item" style="margin-top:2px;">
              <span class="cred-label">📅 หมดอายุ:</span>
              <span class="acc-expiry-badge">${escapeHtml(expiryDisplay)}</span>
            </div>
          </div>

          <div class="screens-section">
            <div class="screens-title">🟢 จอว่างพร้อมส่ง (${sortedScreens.length} จอ)</div>
            ${sortedScreens.map(s => {
              const pName = s.profile_name || "จอว่าง";
              const pinTxt = (s.pin_code && s.pin_code !== "-") ? `PIN: ${s.pin_code}` : "ไม่มี PIN";
              return `
                <div class="screen-item">
                  <div class="screen-name-col">
                    <span>🟢</span>
                    <span>${escapeHtml(pName)}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span class="screen-pin-tag">${escapeHtml(pinTxt)}</span>
                    <button type="button" class="btn-mini-copy" onclick="copySingleScreen('${escapeHtml(group.appName)}', '${escapeHtml(acc.email)}', '${escapeHtml(acc.password)}', '${escapeHtml(pName)}', '${escapeHtml(pinTxt)}', '${escapeHtml(expiryDisplay)}')">📋 ส่งจอนี้</button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>

          <button type="button" class="btn-copy-account-script" onclick="copyAccountScript('${groupKey}', '${emailKey}')">
            📋 1-Tap ก็อปปี้สคริปต์บัญชีนี้ (พร้อมส่ง)
          </button>
        </div>
      `;
    });

    html += `</div>`;
  });

  feed.innerHTML = html;
}

// ----------------------------------------------------------------------------
// 1-Tap Copy Logic (Exact User Template Format)
// ----------------------------------------------------------------------------

// 1. Copy Account Script (Exact Format)
window.copyAccountScript = async function(groupKey, emailKey) {
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
  showToast(`⚡ คัดลอกสคริปต์ ${group.appName} สำเร็จ!`);
};

// 2. Copy Single Screen Handover
window.copySingleScreen = async function(appName, email, password, screenName, pinTxt, expiryDisplay) {
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
  showToast(`📋 คัดลอกข้อมูล ${screenName} สำเร็จ!`);
};

// 3. Copy Single Value
window.copySingleValue = async function(val, label) {
  haptic();
  await copyToClipboard(val);
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
