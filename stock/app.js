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
let currentView = "stock"; // "stock" | "bindings"
let rawAccounts = [];
let allAccountsList = [];
let rawBindings = [];
let rawApps = [];
let rawPackages = [];
let activeAppFilter = "all";
let searchQuery = "";
let bindingSearchQuery = "";
let bindingFilter = "all"; // "all" | "active" | "expiring" | "expired" | "reverted"
let isPasswordHidden = false;
let appGroups = {};
let targetBindingForSwap = null;
let targetBindingForExtend = null;
let targetBindingForEditCreds = null;
let bindingsRenderLimit = 50;

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
  // Mode Tabs Switching
  const tabBtnStock = document.getElementById("tab-btn-stock");
  if (tabBtnStock) {
    tabBtnStock.addEventListener("click", () => switchView("stock"));
  }
  const tabBtnBindings = document.getElementById("tab-btn-bindings");
  if (tabBtnBindings) {
    tabBtnBindings.addEventListener("click", () => switchView("bindings"));
  }

  // Top Search Input (Controls current active view)
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (searchClear) searchClear.style.display = val ? "block" : "none";

      if (currentView === "bindings") {
        bindingSearchQuery = val.toLowerCase();
        renderBindingsFeed();
      } else {
        searchQuery = val.toLowerCase();
        renderStockFeed();
      }
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      searchClear.style.display = "none";
      if (currentView === "bindings") {
        bindingSearchQuery = "";
        renderBindingsFeed();
      } else {
        searchQuery = "";
        renderStockFeed();
      }
    });
  }

  // Interactive Metrics Click to Filter
  const metricInteractiveRow = document.getElementById("bindings-metrics-interactive");
  if (metricInteractiveRow) {
    metricInteractiveRow.addEventListener("click", (e) => {
      const card = e.target.closest(".interactive-metric");
      if (card && card.dataset.filter) {
        haptic();
        setBindingFilter(card.dataset.filter);
      }
    });
  }

  // Random Customer Button (1-Tap instant randomize from database)
  const randomCustBtn = document.getElementById("btn-random-customer");
  if (randomCustBtn) {
    randomCustBtn.addEventListener("click", pickRandomCustomer);
  }

  // Refresh Bindings Button
  const refreshBindBtn = document.getElementById("btn-refresh-bindings");
  if (refreshBindBtn) {
    refreshBindBtn.addEventListener("click", () => {
      haptic();
      showToast("⏳ กำลังรีเฟรชการผูกสิทธิ์...");
      loadData(true);
    });
  }

  // Binding Filter Chips Event Delegation
  const bindFilterChips = document.getElementById("binding-filter-chips");
  if (bindFilterChips) {
    bindFilterChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".bind-filter-chip");
      if (chip && chip.dataset.filter) {
        haptic();
        setBindingFilter(chip.dataset.filter);
      }
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

  // Initialize Troubleshooting Modals Listeners
  initTroubleshootingModalListeners();

  // Global event delegation for any .expiry-cal-btn or datepicker trigger
  document.body.addEventListener("click", (e) => {
    const calBtn = e.target.closest(".expiry-cal-btn");
    if (calBtn) {
      const trigger = calBtn.closest("#acc-expiry-trigger, #edit-creds-expiry-trigger");
      if (trigger) return; // Managed by specific trigger listener
      const wrapper = calBtn.closest(".acc-expiry-input-wrapper");
      if (wrapper) {
        const input = wrapper.querySelector("input[type='datetime-local'], input[type='text'], input[type='hidden']");
        const text = wrapper.querySelector("span");
        openThaiDatePicker({
          inputEl: input,
          textEl: text,
          title: "📆 เลือกวันหมดอายุ (พ.ศ.)"
        });
      }
    }
  });

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
      // 0. Open Package Picker Modal (Group level or Account level)
      const pkgBtn = e.target.closest(".btn-open-pkg-picker");
      if (pkgBtn) {
        e.stopPropagation();
        const groupKey = pkgBtn.dataset.groupKey;
        const email = pkgBtn.dataset.email || null;
        openChangePackageModal(groupKey, email);
        return;
      }

      // 1. Send single screen (Phase 1: Open Send & Bind Modal with Auto-Rename Customer Generator)
      const sendBtn = e.target.closest(".btn-screen-send");
      if (sendBtn) {
        e.stopPropagation();
        openSendBindModal(sendBtn.dataset, sendBtn);
        return;
      }

      // 1.1 Edit single screen in stock account
      const screenEditBtn = e.target.closest(".btn-screen-edit");
      if (screenEditBtn) {
        e.stopPropagation();
        openEditStockAccountModal(screenEditBtn.dataset.groupKey, screenEditBtn.dataset.emailKey, screenEditBtn.dataset.accountId);
        return;
      }

      // 1.2 Edit full stock account / password
      const accEditBtn = e.target.closest(".btn-edit-account-all, .btn-mini-edit-acc-pw");
      if (accEditBtn) {
        e.stopPropagation();
        openEditStockAccountModal(accEditBtn.dataset.groupKey, accEditBtn.dataset.emailKey, null);
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

  // Package Picker Modal Listeners
  const closePkgModalBtn = document.getElementById("btn-close-change-pkg-modal");
  if (closePkgModalBtn) {
    closePkgModalBtn.addEventListener("click", closeChangePackageModal);
  }
  const changePkgModalOverlay = document.getElementById("modal-change-package");
  if (changePkgModalOverlay) {
    changePkgModalOverlay.addEventListener("click", (e) => {
      if (e.target === changePkgModalOverlay) closeChangePackageModal();
    });
  }
  const pkgListContainer = document.getElementById("change-pkg-list-container");
  if (pkgListContainer) {
    pkgListContainer.addEventListener("click", (e) => {
      const card = e.target.closest(".pkg-picker-card");
      if (card && card.dataset.pkgId) {
        const pkgId = card.dataset.pkgId;
        const pkgName = card.dataset.pkgName;
        const pkgScreens = parseInt(card.dataset.pkgScreens, 10) || 1;

        if (confirm(`คุณต้องการเปลี่ยนแพ็กเกจเป็น "${pkgName}" (${pkgScreens} จอ) ใช่หรือไม่?\n\n(ระบบจะเปลี่ยนแพ็กเกจและปรับเพิ่ม/ลดจำนวนจอให้มี ${pkgScreens} จอตามที่ตั้งค่าไว้ในแพ็กเกจโดยอัตโนมัติ)`)) {
          applyPackageChange(pkgId, pkgName, pkgScreens);
        }
      }
    });
  }

  // Phase 1: Send & Bind Modal Listeners
  const closeSendBindBtn = document.getElementById("btn-close-send-bind-modal");
  if (closeSendBindBtn) closeSendBindBtn.addEventListener("click", closeSendBindModal);

  const modalSendBind = document.getElementById("modal-send-bind-screen");
  if (modalSendBind) {
    modalSendBind.addEventListener("click", (e) => {
      if (e.target === modalSendBind) closeSendBindModal();
    });
  }

  const btnRandomName = document.getElementById("btn-send-bind-random-name");
  if (btnRandomName) btnRandomName.addEventListener("click", executeRandomizeCustomerName);

  const btnCopyName = document.getElementById("btn-send-bind-copy-name");
  if (btnCopyName) btnCopyName.addEventListener("click", executeCopyCustomerName);

  const nameInputEl = document.getElementById("send-bind-customer-name");
  if (nameInputEl) {
    nameInputEl.addEventListener("input", (e) => {
      updateCustomerNameStatusDisplay(e.target.value);
    });
    nameInputEl.addEventListener("change", (e) => {
      updateCustomerNameStatusDisplay(e.target.value);
    });
  }

  const daysInputEl = document.getElementById("send-bind-days");
  if (daysInputEl) {
    daysInputEl.addEventListener("input", (e) => {
      updateQuickDayChips(e.target.value);
    });
  }

  document.querySelectorAll(".btn-quick-day-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      haptic();
      const d = chip.dataset.days;
      if (daysInputEl) daysInputEl.value = d;
      updateQuickDayChips(d);
    });
  });

  const btnConfirmSendBind = document.getElementById("btn-confirm-send-bind");
  if (btnConfirmSendBind) btnConfirmSendBind.addEventListener("click", executeConfirmSendBind);

  const btnSendBindCopyOnly = document.getElementById("btn-send-bind-copy-only");
  if (btnSendBindCopyOnly) btnSendBindCopyOnly.addEventListener("click", executeSendBindCopyOnly);
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
    renderBindingsFeed();
    updateBindingMetrics();
    updateTabBadges();

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

  const [accRes, appsRes, pkgsRes, bindsData] = await Promise.all([
    fetch(`${currentShop.url}/rest/v1/accounts?select=*`, { headers }),
    fetch(`${currentShop.url}/rest/v1/apps?select=*`, { headers }),
    fetch(`${currentShop.url}/rest/v1/packages?select=*`, { headers }),
    fetchAllSupabaseBindings(headers)
  ]);

  if (!accRes.ok) throw new Error("Accounts API Error " + accRes.status);
  allAccountsList = await accRes.json();
  rawAccounts = allAccountsList.filter(a => a.status === "available");
  rawApps = appsRes.ok ? await appsRes.json() : [];
  rawPackages = pkgsRes.ok ? await pkgsRes.json() : [];
  rawBindings = bindsData || [];
}

async function fetchAllSupabaseBindings(headers) {
  let allBindings = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    try {
      const res = await fetch(`${currentShop.url}/rest/v1/customer_bindings?select=*&order=created_at.desc&limit=${pageSize}&offset=${offset}`, { headers });
      if (!res.ok) break;
      const batch = await res.json();
      if (!batch || batch.length === 0) break;
      allBindings = allBindings.concat(batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
      if (offset >= 25000) break;
    } catch (e) {
      break;
    }
  }
  return allBindings;
}

async function loadFromCloudflare() {
  const headers = {
    "Authorization": `Bearer ${currentShop.key}`,
    "Content-Type": "application/json"
  };

  const [accRes, appsRes, pkgsRes, bindsRes] = await Promise.all([
    fetch(`${currentShop.url}/api/accounts`, { headers }),
    fetch(`${currentShop.url}/api/apps`, { headers }),
    fetch(`${currentShop.url}/api/packages`, { headers }),
    fetch(`${currentShop.url}/api/customer_bindings?order=created_at.desc&limit=10000`, { headers })
  ]);

  allAccountsList = accRes.ok ? await accRes.json() : [];
  rawAccounts = allAccountsList.filter(a => a.status === "available");
  rawApps = appsRes.ok ? await appsRes.json() : [];
  rawPackages = pkgsRes.ok ? await pkgsRes.json() : [];
  rawBindings = bindsRes.ok ? await bindsRes.json() : [];
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
            ${group.pkgName ? 
              `<span class="group-pkg-name btn-open-pkg-picker" data-group-key="${escapeHtml(groupKey)}" data-app-id="${escapeHtml(group.appId)}" title="คลิกเพื่อเปลี่ยนแพ็กเกจ & ปรับจำนวนจอ">[${escapeHtml(group.pkgName)}] <span class="pkg-edit-icon">✏️</span></span>` : 
              `<span class="group-pkg-name unassigned btn-open-pkg-picker" data-group-key="${escapeHtml(groupKey)}" data-app-id="${escapeHtml(group.appId)}" title="คลิกเพื่อเลือกแพ็กเกจ & ปรับจำนวนจอ">[⚠️ ยังไม่กำหนดแพ็คเกจ ▾]</span>`
            }
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
                <button type="button" class="btn-mini-edit-acc-pw" data-group-key="${escapeHtml(groupKey)}" data-email-key="${escapeHtml(emailKey)}" title="แก้ไขรหัสผ่าน / สุ่มรหัสใหม่">✏️</button>
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

            <!-- Package row -->
            <div class="acc-pkg-row">
              <span class="cred-label">📦 แพ็กเกจ:</span>
              <span class="acc-pkg-chip btn-open-pkg-picker ${group.pkgName ? '' : 'unassigned'}" 
                    data-group-key="${escapeHtml(groupKey)}" 
                    data-email="${escapeHtml(acc.email)}" 
                    title="คลิกเพื่อเปลี่ยนแพ็กเกจเฉพาะบัญชีนี้">
                ${group.pkgName ? `<span>${escapeHtml(group.pkgName)}</span> <span>✏️</span>` : `<span>⚠️ ยังไม่กำหนดแพ็คเกจ ▾</span>`}
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
                    <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                      <button type="button" class="btn-screen-edit"
                        data-account-id="${s.id}"
                        data-group-key="${escapeHtml(groupKey)}"
                        data-email-key="${escapeHtml(emailKey)}"
                        title="แก้ไขจอนี้: เปลี่ยน/สุ่ม PIN, แก้ไขรหัสผ่าน, ชื่อจอ, อุปกรณ์">
                        ✏️
                      </button>
                      <button type="button" class="btn-screen-send"
                        data-account-id="${s.id}"
                        data-app-name="${escapeHtml(group.appName)}"
                        data-app-id="${escapeHtml(group.appId)}"
                        data-email="${escapeHtml(acc.email)}"
                        data-password="${escapeHtml(acc.password)}"
                        data-screen-name="${escapeHtml(pName)}"
                        data-pin-txt="${escapeHtml(pinTxt)}"
                        data-pin-code="${escapeHtml(s.pin_code || '')}"
                        data-expiry="${escapeHtml(expiryDisplay)}"
                        data-screen-id="${escapeHtml(String(screenId))}"
                        data-group-key="${escapeHtml(groupKey)}"
                        data-pkg-name="${escapeHtml(group.pkgName || '')}"
                        data-device-type="${escapeHtml(s.device_type || '')}">
                        🚀 ส่งจอนี้
                      </button>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <!-- Account Action Buttons (Edit Account & Copy Script) -->
          <div class="acc-actions-grid" style="display: grid; grid-template-columns: 1fr 1.3fr; gap: 8px; margin-top: 4px;">
            <button type="button" class="btn-edit-account-all" data-group-key="${escapeHtml(groupKey)}" data-email-key="${escapeHtml(emailKey)}" title="แก้ไขข้อมูลบัญชีนี้ และทุกจอ">
              <span>✏️</span>
              <span>แก้ไขบัญชี & จอ</span>
            </button>
            <button type="button" class="btn-copy-account-script" data-group-key="${escapeHtml(groupKey)}" data-email-key="${escapeHtml(emailKey)}" style="margin-top: 0;">
              <span>📋</span>
              <span>1-Tap ก็อปปี้สคริปต์</span>
            </button>
          </div>
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
  if (expInput) {
    expInput.value = str;
    expInput.dispatchEvent(new Event("change", { bubbles: true }));
    expInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  updateExpiryText(date);
  highlightQuickDateBtn(days);
}

function highlightQuickDateBtn(days) {
  document.querySelectorAll(".quick-date-btn").forEach(btn => {
    const d = parseInt(btn.dataset.days, 10);
    if (d === days) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function clearQuickDateActive() {
  document.querySelectorAll(".quick-date-btn").forEach(btn => btn.classList.remove("active"));
}

function formatThaiDateTime(dateOrStr) {
  if (!dateOrStr) return "📅 คลิกเลือกวันเวลา...";
  const d = typeof dateOrStr === "string" ? new Date(dateOrStr) : dateOrStr;
  if (!d || isNaN(d.getTime())) return "📅 คลิกเลือกวันเวลา...";
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const pad = n => String(n).padStart(2, '0');
  const day = d.getDate();
  const m = thaiMonths[d.getMonth()];
  const y = d.getFullYear() + 543;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `📅 ${day} ${m} ${y} เวลา ${time} น.`;
}

function updateExpiryText(dateObj) {
  const textEl = document.getElementById("acc-expiry-text");
  if (!textEl) return;
  textEl.textContent = formatThaiDateTime(dateObj);
}

// ============================================================================
// 📅 Custom Thai Buddhist Era Datepicker (Mobile-first UX)
// ============================================================================
function openThaiDatePicker(options = {}) {
  haptic();
  const {
    inputEl = null,
    textEl = null,
    initialDate = null,
    onConfirm = null,
    title = "📆 เลือกวันหมดอายุ (พ.ศ.)"
  } = options;

  // Resolve starting date
  let startD = new Date();
  if (initialDate instanceof Date && !isNaN(initialDate.getTime())) {
    startD = new Date(initialDate.getTime());
  } else if (typeof initialDate === "string" && initialDate.trim()) {
    const parsed = new Date(initialDate);
    if (!isNaN(parsed.getTime())) startD = parsed;
  } else if (inputEl && inputEl.value) {
    const parsed = new Date(inputEl.value);
    if (!isNaN(parsed.getTime())) startD = parsed;
  }

  let tempYear = startD.getFullYear();
  let tempMonth = startD.getMonth();
  let tempDay = startD.getDate();
  let tempHour = startD.getHours();
  let tempMinute = startD.getMinutes();

  // Subscription expiry default time is 23:59 if midnight
  if (tempHour === 0 && tempMinute === 0) {
    tempHour = 23;
    tempMinute = 59;
  }

  // Close any existing datepicker modals
  document.querySelectorAll(".thai-datepicker-modal").forEach(m => m.remove());

  const modal = document.createElement("div");
  modal.className = "thai-datepicker-modal";
  document.body.appendChild(modal);

  const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  function render() {
    const daysInMonth = new Date(tempYear, tempMonth + 1, 0).getDate();
    const firstDayIndex = new Date(tempYear, tempMonth, 1).getDay();
    const prevMonthDays = new Date(tempYear, tempMonth, 0).getDate();

    const currentYear = new Date().getFullYear();
    let yearOptionsHtml = "";
    for (let y = currentYear - 2; y <= currentYear + 10; y++) {
      const beYear = y + 543;
      const selected = y === tempYear ? "selected" : "";
      yearOptionsHtml += `<option value="${y}" ${selected}>${beYear} (${y})</option>`;
    }

    let monthOptionsHtml = thaiMonths.map((m, idx) => {
      const selected = idx === tempMonth ? "selected" : "";
      return `<option value="${idx}" ${selected}>${m}</option>`;
    }).join("");

    let hourOptionsHtml = "";
    for (let h = 0; h < 24; h++) {
      const hStr = String(h).padStart(2, '0');
      const selected = h === tempHour ? "selected" : "";
      hourOptionsHtml += `<option value="${h}" ${selected}>${hStr}</option>`;
    }

    let minuteOptionsHtml = "";
    for (let m = 0; m < 60; m++) {
      const mStr = String(m).padStart(2, '0');
      const selected = m === tempMinute ? "selected" : "";
      minuteOptionsHtml += `<option value="${m}" ${selected}>${mStr}</option>`;
    }

    let daysHtml = "";
    for (let x = firstDayIndex; x > 0; x--) {
      const d = prevMonthDays - x + 1;
      daysHtml += `<div class="thai-datepicker-day inactive empty" data-day="${d}">${d}</div>`;
    }

    const todayDate = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = i === todayDate.getDate() && tempMonth === todayDate.getMonth() && tempYear === todayDate.getFullYear();
      const isSelected = i === tempDay;
      daysHtml += `
        <div class="thai-datepicker-day current-month-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-day="${i}">
          ${i}
        </div>
      `;
    }

    const totalCells = firstDayIndex + daysInMonth;
    const nextMonthPadding = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= nextMonthPadding; i++) {
      daysHtml += `<div class="thai-datepicker-day inactive empty" data-day="${i}">${i}</div>`;
    }

    modal.innerHTML = `
      <div class="thai-datepicker-backdrop"></div>
      <div class="thai-datepicker-content">
        <div class="thai-datepicker-header">
          <span class="thai-datepicker-title">
            <span>📅</span>
            <span>${escapeHtml(title)}</span>
          </span>
          <button class="thai-datepicker-close-btn" type="button" title="ปิด">&times;</button>
        </div>
        
        <div class="thai-datepicker-nav">
          <button class="thai-datepicker-nav-btn prev-month" type="button" title="เดือนก่อนหน้า">&lsaquo;</button>
          <div class="thai-datepicker-selectors">
            <select class="thai-datepicker-month-select">
              ${monthOptionsHtml}
            </select>
            <select class="thai-datepicker-year-select">
              ${yearOptionsHtml}
            </select>
          </div>
          <button class="thai-datepicker-nav-btn next-month" type="button" title="เดือนถัดไป">&rsaquo;</button>
        </div>

        <div class="thai-datepicker-calendar">
          <div class="thai-datepicker-weekdays">
            <div>อา</div><div>จ</div><div>อ</div><div>พ</div><div>พฤ</div><div>ศ</div><div>ส</div>
          </div>
          <div class="thai-datepicker-days">
            ${daysHtml}
          </div>
        </div>

        <div class="thai-datepicker-time-section">
          <span class="time-label">🕒 เวลา:</span>
          <div class="time-picker-controls">
            <select class="thai-datepicker-hour-select">
              ${hourOptionsHtml}
            </select>
            <span style="color: #94a3b8; font-weight: bold;">:</span>
            <select class="thai-datepicker-minute-select">
              ${minuteOptionsHtml}
            </select>
          </div>
          <button class="thai-datepicker-quick-time-btn" type="button" title="ตั้งเวลา 23:59 น.">23:59</button>
        </div>

        <div class="thai-datepicker-duration-info"></div>

        <div class="thai-datepicker-presets">
          <button type="button" class="preset-btn" data-days="0">วันนี้ (Today)</button>
          <button type="button" class="preset-btn" data-days="7">+7 วัน</button>
          <button type="button" class="preset-btn" data-days="30">+30 วัน</button>
          <button type="button" class="preset-btn" data-days="90">+90 วัน</button>
          <button type="button" class="preset-btn" data-days="365">+1 ปี</button>
          <button type="button" class="preset-btn btn-clear-date" style="background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.3); color: #f87171;">ล้างค่า (Clear)</button>
        </div>

        <div class="thai-datepicker-footer">
          <button class="thai-datepicker-btn btn-cancel" type="button">ยกเลิก</button>
          <button class="thai-datepicker-btn btn-confirm" type="button">ตกลง</button>
        </div>
      </div>
    `;

    modal.querySelector(".thai-datepicker-close-btn").addEventListener("click", closeModal);
    modal.querySelector(".thai-datepicker-backdrop").addEventListener("click", closeModal);
    modal.querySelector(".thai-datepicker-btn.btn-cancel").addEventListener("click", closeModal);
    modal.querySelector(".thai-datepicker-btn.btn-confirm").addEventListener("click", confirmSelection);

    modal.querySelector(".prev-month").addEventListener("click", () => {
      haptic();
      tempMonth--;
      if (tempMonth < 0) {
        tempMonth = 11;
        tempYear--;
      }
      adjustTempDayLimit();
      render();
    });

    modal.querySelector(".next-month").addEventListener("click", () => {
      haptic();
      tempMonth++;
      if (tempMonth > 11) {
        tempMonth = 0;
        tempYear++;
      }
      adjustTempDayLimit();
      render();
    });

    modal.querySelector(".thai-datepicker-month-select").addEventListener("change", (e) => {
      tempMonth = parseInt(e.target.value, 10);
      adjustTempDayLimit();
      render();
    });

    modal.querySelector(".thai-datepicker-year-select").addEventListener("change", (e) => {
      tempYear = parseInt(e.target.value, 10);
      adjustTempDayLimit();
      render();
    });

    modal.querySelector(".thai-datepicker-hour-select").addEventListener("change", (e) => {
      tempHour = parseInt(e.target.value, 10);
      updateDurationInfo();
    });

    modal.querySelector(".thai-datepicker-minute-select").addEventListener("change", (e) => {
      tempMinute = parseInt(e.target.value, 10);
      updateDurationInfo();
    });

    modal.querySelectorAll(".current-month-day").forEach(el => {
      el.addEventListener("click", () => {
        haptic();
        tempDay = parseInt(el.getAttribute("data-day"), 10);
        modal.querySelectorAll(".current-month-day").forEach(dEl => dEl.classList.remove("selected"));
        el.classList.add("selected");
        updateDurationInfo();
      });
    });

    modal.querySelector(".thai-datepicker-quick-time-btn").addEventListener("click", () => {
      haptic();
      tempHour = 23;
      tempMinute = 59;
      const hSelect = modal.querySelector(".thai-datepicker-hour-select");
      const mSelect = modal.querySelector(".thai-datepicker-minute-select");
      if (hSelect) hSelect.value = "23";
      if (mSelect) mSelect.value = "59";
      updateDurationInfo();
      showToast("🕒 ตั้งเวลาเสร็จสิ้น (23:59)");
    });

    modal.querySelectorAll(".thai-datepicker-presets .preset-btn").forEach(btn => {
      if (btn.classList.contains("btn-clear-date")) return;
      btn.addEventListener("click", () => {
        haptic();
        const daysToAdd = parseInt(btn.getAttribute("data-days"), 10);
        if (daysToAdd === 0) {
          const today = new Date();
          tempYear = today.getFullYear();
          tempMonth = today.getMonth();
          tempDay = today.getDate();
          tempHour = today.getHours();
          tempMinute = today.getMinutes();
          render();
          showToast("🟢 ปรับเวลาเป็นวันนี้สำเร็จ");
          return;
        }
        const targetD = new Date();
        targetD.setDate(targetD.getDate() + daysToAdd);
        targetD.setHours(23, 59, 0, 0);

        tempYear = targetD.getFullYear();
        tempMonth = targetD.getMonth();
        tempDay = targetD.getDate();
        tempHour = 23;
        tempMinute = 59;

        render();
        showToast(`🟢 ปรับวันที่เป็น +${daysToAdd} วัน (23:59)`);
      });
    });

    const btnClearDate = modal.querySelector(".btn-clear-date");
    if (btnClearDate) {
      btnClearDate.addEventListener("click", () => {
        haptic();
        if (inputEl) {
          inputEl.value = "";
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (textEl) {
          textEl.textContent = "📅 คลิกเลือกวันเวลา...";
        }
        clearQuickDateActive();
        closeModal();
        showToast("🟢 ล้างค่าวันหมดอายุเรียบร้อยแล้ว");
        if (typeof onConfirm === "function") {
          onConfirm("", null);
        }
      });
    }

    updateDurationInfo();
  }

  function adjustTempDayLimit() {
    const maxDays = new Date(tempYear, tempMonth + 1, 0).getDate();
    if (tempDay > maxDays) {
      tempDay = maxDays;
    }
  }

  function closeModal() {
    modal.remove();
  }

  function updateDurationInfo() {
    const infoEl = modal.querySelector(".thai-datepicker-duration-info");
    if (!infoEl) return;

    const selectedD = new Date(tempYear, tempMonth, tempDay, tempHour, tempMinute, 0);
    const nowD = new Date();

    const diffMs = selectedD.getTime() - nowD.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs > 0) {
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHrs < 24) {
        infoEl.style.color = "#34d399";
        infoEl.style.backgroundColor = "rgba(16, 185, 129, 0.08)";
        infoEl.style.borderColor = "rgba(52, 211, 153, 0.25)";
        infoEl.textContent = `⏳ เหลืออีกประมาณ ${diffHrs} ชั่วโมง`;
      } else {
        infoEl.style.color = "#34d399";
        infoEl.style.backgroundColor = "rgba(16, 185, 129, 0.08)";
        infoEl.style.borderColor = "rgba(52, 211, 153, 0.25)";
        infoEl.textContent = `🟢 เหลือเวลาอีก ${diffDays} วัน`;
      }
    } else {
      const absDays = Math.abs(Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      infoEl.style.color = "#f87171";
      infoEl.style.backgroundColor = "rgba(239, 68, 68, 0.08)";
      infoEl.style.borderColor = "rgba(239, 68, 68, 0.25)";
      if (absDays === 0) {
        const absHrs = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
        infoEl.textContent = `⚠️ หมดอายุมาแล้ว ${absHrs} ชั่วโมง`;
      } else {
        infoEl.textContent = `🔴 หมดอายุมาแล้ว ${absDays} วัน`;
      }
    }
  }

  function confirmSelection() {
    haptic();
    const finalDate = new Date(tempYear, tempMonth, tempDay, tempHour, tempMinute, 0);
    if (isNaN(finalDate.getTime())) {
      showToast("❌ เลือกวันที่ไม่ถูกต้อง");
      return;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const valStr = `${finalDate.getFullYear()}-${pad(finalDate.getMonth() + 1)}-${pad(finalDate.getDate())}T${pad(finalDate.getHours())}:${pad(finalDate.getMinutes())}`;

    if (inputEl) {
      inputEl.value = valStr;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (textEl) {
      textEl.textContent = formatThaiDateTime(finalDate);
    }

    clearQuickDateActive();
    closeModal();
    showToast(`📅 ตั้งวันหมดอายุ: ${tempDay} ${thaiMonths[tempMonth]} ${tempYear + 543} สำเร็จ!`);

    if (typeof onConfirm === "function") {
      onConfirm(valStr, finalDate);
    }
  }

  render();
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
      clearQuickDateActive();
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

  if (single.emailOrPhone || single.password) {
    flashParserSuccess(input);
    showToast("🟢 แยกข้อมูลบัญชีและรหัสผ่านอัตโนมัติสำเร็จ!");
  }
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

  if (!cleanText || !cleanText.trim()) {
    return { emailOrPhone, password, expiryDateStr, otpUrl, netflixProfile };
  }

  const rawText = cleanText.replace(/\u00A0/g, ' ').trim();
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Extract OTP link if present
  const otpMatch = rawText.match(/(https?:\/\/(?:code\.varinzxify\.com|abeslife\.com|[\w.-]+\.[\w.-]+)\/[^\s\n\r]*)/i);
  if (otpMatch) {
    otpUrl = otpMatch[1].trim();
  }

  // 2. Extract Netflix profile / screen / pin
  const screenMatch = rawText.match(/(?:จอ|โปรไฟล์)\s*[:\s\t\-=]*\s*(\d+)/i);
  const screenNum = screenMatch ? parseInt(screenMatch[1], 10) : null;
  const pinMatch = rawText.match(/(?:Pin|PIN|พิน|พินเมล|รหัส PIN)\s*[:\s\t\-=]*\s*(\d{4,6})/i);
  const pinCode = pinMatch ? pinMatch[1].trim() : "";
  if (screenNum !== null && !isNaN(screenNum)) {
    netflixProfile = { screenNum, pin: pinCode };
  }

  // 3. Extract Expiry Date
  // 3.1 Standard Full Date: DD/MM/YYYY or YYYY-MM-DD or DD/MM/YY
  const fullDateMatch = rawText.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/) ||
                        rawText.match(/\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
  if (fullDateMatch) {
    let day, month, year;
    if (fullDateMatch[1].length === 4) {
      year = parseInt(fullDateMatch[1], 10);
      month = parseInt(fullDateMatch[2], 10);
      day = parseInt(fullDateMatch[3], 10);
    } else {
      day = parseInt(fullDateMatch[1], 10);
      month = parseInt(fullDateMatch[2], 10);
      year = parseInt(fullDateMatch[3], 10);
      if (year < 100) {
        if (year >= 60 && year <= 99) year += (2500 - 543); // Thai BE (e.g. 69 -> 2026)
        else year += 2000; // CE (e.g. 26 -> 2026)
      }
    }
    if (year > 2400) year -= 543; // Thai Buddhist Era to CE
    const parsedDate = new Date(year, month - 1, day, 23, 59, 0);
    if (!isNaN(parsedDate.getTime())) {
      const pad = n => String(n).padStart(2, '0');
      expiryDateStr = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}T23:59`;
    }
  }

  // 3.2 Short Date: Exp DDMM (e.g. Exp 1611 -> 16 Nov)
  if (!expiryDateStr) {
    const exp4DigitsMatch = rawText.match(/(?:exp|หมดอายุ|หมด|date)[:\s\t\-=]*\s*(\d{2})(\d{2})\b/i);
    if (exp4DigitsMatch) {
      const day = parseInt(exp4DigitsMatch[1], 10);
      const month = parseInt(exp4DigitsMatch[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const now = new Date();
        let year = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        if (month < currentMonth || (month === currentMonth && day < now.getDate() - 3)) {
          year += 1;
        }
        const pad = n => String(n).padStart(2, '0');
        expiryDateStr = `${year}-${pad(month)}-${pad(day)}T23:59`;
      }
    }
  }

  // 3.3 Short Date with Separator: Exp DD/MM or Exp DD-MM
  if (!expiryDateStr) {
    const expShortMatch = rawText.match(/(?:exp|หมดอายุ|หมด|date)[:\s\t\-=]*\s*(\d{1,2})[\/\-\.](\d{1,2})\b/i);
    if (expShortMatch) {
      const day = parseInt(expShortMatch[1], 10);
      const month = parseInt(expShortMatch[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const now = new Date();
        let year = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        if (month < currentMonth || (month === currentMonth && day < now.getDate() - 3)) {
          year += 1;
        }
        const pad = n => String(n).padStart(2, '0');
        expiryDateStr = `${year}-${pad(month)}-${pad(day)}T23:59`;
      }
    }
  }

  // 3.4 Relative days: e.g. 30 วัน, 30 days
  if (!expiryDateStr) {
    const relDaysMatch = rawText.match(/\b(\d+)\s*(?:วัน|day|days)\b/i);
    if (relDaysMatch) {
      const d = parseInt(relDaysMatch[1], 10);
      if (d > 0 && d <= 1000) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + d);
        targetDate.setHours(23, 59, 0, 0);
        const pad = n => String(n).padStart(2, '0');
        expiryDateStr = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}T23:59`;
      }
    }
  }

  // 4. Extract Email or Phone or Username
  // 4.1 Explicit labels first (e.g. อีเมล: ... หรือ เบอร์: ...)
  const emailLabelMatch = rawText.match(/(?:อีเมล|เมล|email|mail|user|username|บัญชี|ไอดี|id)[:\s\t\-=]+\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailLabelMatch) {
    emailOrPhone = emailLabelMatch[1].trim();
  }

  const phoneLabelMatch = rawText.match(/(?:เบอร์|โทร|tel|phone|mobile)[:\s\t\-=]+\s*([0-9\-]{9,12})/i);
  if (phoneLabelMatch) {
    emailOrPhone = phoneLabelMatch[1].replace(/[^0-9]/g, '').trim();
  }

  // 4.2 Explicit Password label
  const pwLabelMatch = rawText.match(/(?:พาสเวิร์ด|พาส|Password|pass(?:word)?|รหัสผ่าน|รหัส|pw|pinmail|พินเมล)[:\s\t\-=]+\s*([^\s\n\r|/]+)/i);
  if (pwLabelMatch) {
    password = pwLabelMatch[1].trim();
  }

  // 5. Line-by-line Separator / Delimiter parsing (Space, Tab, Colon, Pipe)
  // Handles "0829923194  Lz86409823", "0829923194:Lz86409823", "user@gmail.com pass123"
  for (const line of lines) {
    // Skip lines starting with exp, date, http, or labeled lines
    if (/^(?:exp|หมดอายุ|หมด|date|http)/i.test(line)) continue;

    // Remove standalone / or - delimiters between tokens
    const tokens = line.split(/[\s|:\t]+/).map(t => t.trim()).filter(t => t && t !== "/" && t !== "-");
    if (tokens.length >= 2) {
      const first = tokens[0];
      const second = tokens[1];

      const cleanPhone = first.replace(/[^0-9]/g, '');
      const isEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(first);
      const isPhone = /^(?:0[689]\d{8}|0\d{8,9})$/.test(cleanPhone);
      const isAlphanumericUser = /^[a-zA-Z0-9._\-]{4,}$/.test(first) && !/^(exp|date|pass|password|user|username|email|tel|phone|line|fb|pin|web|app|จอ|โปรไฟล์)$/i.test(first);

      const isSecondValidPw = second.length >= 4 && !/^(?:exp|date|pin|screen|จอ|โปรไฟล์)$/i.test(second);

      if ((isEmail || isPhone || isAlphanumericUser) && isSecondValidPw) {
        if (!emailOrPhone) emailOrPhone = isPhone ? cleanPhone : first;
        if (!password) password = second;
        break;
      }
    }
  }

  // 6. Fallback extraction if either emailOrPhone or password is still empty
  if (!emailOrPhone) {
    const rawEmail = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    if (rawEmail) {
      emailOrPhone = rawEmail[0].trim();
    } else {
      const rawPhone = rawText.match(/\b(0[689]\d{8})\b/) || rawText.match(/\b(0\d{8,9})\b/);
      if (rawPhone) {
        emailOrPhone = rawPhone[0].trim();
      }
    }
  }

  if (!password && emailOrPhone) {
    // Try finding password next to email/phone in text
    const escaped = emailOrPhone.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escaped + '\\s*[:|\\s\\t\\-=]+\\s*([^\\s\\n\\r|:]+)', 'i');
    const match = rawText.match(regex);
    if (match && match[1] && !/^(?:exp|date|pin|http)/i.test(match[1])) {
      password = match[1].trim();
    } else {
      // Look at the line immediately following emailOrPhone
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(emailOrPhone) && i + 1 < lines.length) {
          const candidate = lines[i + 1].trim();
          if (!candidate.startsWith("http") && !/^(?:exp|หมดอายุ|date)/i.test(candidate)) {
            const cleanCand = candidate.replace(/^(?:พาสเวิร์ด|พาส|Password|pass(?:word)?|รหัสผ่าน|รหัส)[:\s\t\-=]+/i, '').trim();
            if (cleanCand.length >= 4) {
              password = cleanCand.split(/\s+/)[0];
              break;
            }
          }
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
    // Ignore pure expiry or URL lines
    if (/^(?:exp|หมดอายุ|หมด|date|http)/i.test(line)) continue;

    const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = line.match(/\b(0[689]\d{8})\b/) || line.match(/\b(0\d{8,9})\b/);
    const userIdentifier = emailMatch ? emailMatch[0].trim() : (phoneMatch ? phoneMatch[0].trim() : "");
    if (!userIdentifier) continue;

    let remaining = line.replace(userIdentifier, "").trim();
    remaining = remaining.replace(/^[:|\s\-/,]+/, "").trim();

    const parts = remaining.split(/[\s|:]+/).filter(Boolean);
    const password = parts[0] || "";

    if (password && password.length >= 4 && !password.includes("@") && !/^(?:exp|date|หมด)$/i.test(password)) {
      const otpMatch = line.match(/(https?:\/\/[^\s\n\r]+)/i);
      accounts.push({
        email: userIdentifier,
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
    quickPaste.addEventListener("paste", () => setTimeout(handleQuickPaste, 50));
    quickPaste.addEventListener("change", handleQuickPaste);
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

  // Expiry datetime change & Custom Thai Datepicker trigger
  const expInput = document.getElementById("acc-expiry");
  const expTrigger = document.getElementById("acc-expiry-trigger");
  const expText = document.getElementById("acc-expiry-text");
  const autoCalcBtn = document.getElementById("expiry-auto-badge");

  if (expTrigger) {
    expTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      openThaiDatePicker({
        inputEl: expInput,
        textEl: expText,
        title: "📆 เลือกวันหมดอายุบัญชี (พ.ศ.)"
      });
    });
  }

  if (expInput) {
    expInput.addEventListener("change", (e) => {
      if (e.target.value) {
        updateExpiryText(new Date(e.target.value));
        clearQuickDateActive();
      }
    });
    expInput.addEventListener("input", (e) => {
      if (e.target.value) {
        updateExpiryText(new Date(e.target.value));
        clearQuickDateActive();
      }
    });
  }

  // Quick date buttons
  document.querySelectorAll(".quick-date-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      haptic();
      const days = parseInt(btn.dataset.days, 10);
      if (!isNaN(days)) {
        setDefaultExpiry(days);
        showToast(`📅 ตั้งวันหมดอายุ: +${days} วัน เรียบร้อยแล้ว`);
      }
    });
  });

  // Auto calculate expiry button
  if (autoCalcBtn) {
    autoCalcBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      haptic();
      const pkgSelect = document.getElementById("acc-package-select");
      const pkgId = pkgSelect ? pkgSelect.value : "";
      const pkg = rawPackages.find(p => p.id === pkgId);
      const days = pkg ? (pkg.days || getPackageDays(pkg.name, pkg.app_id)) : 30;
      setDefaultExpiry(days);
      showToast(`⚡ คำนวณวันหมดอายุอัตโนมัติ: +${days} วัน เรียบร้อยแล้ว`);
    });
  }

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

// ============================================================================
// 🔍 View Mode Switcher (Stock Feed vs Customer Bindings & Troubleshooting)
// ============================================================================

function switchView(viewName) {
  haptic();
  currentView = viewName;

  const tabStock = document.getElementById("tab-btn-stock");
  const tabBindings = document.getElementById("tab-btn-bindings");
  const secStock = document.getElementById("section-stock-view");
  const secBindings = document.getElementById("section-bindings-view");
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");

  if (viewName === "bindings") {
    if (tabStock) tabStock.classList.remove("active");
    if (tabBindings) tabBindings.classList.add("active");
    if (secStock) secStock.style.display = "none";
    if (secBindings) secBindings.style.display = "block";

    if (searchInput) {
      searchInput.placeholder = "ค้นหาชื่อลูกค้า, ID จอ (#153), อีเมล, แอป หรือรหัสผ่าน...";
      searchInput.value = bindingSearchQuery;
      if (searchClear) searchClear.style.display = bindingSearchQuery ? "block" : "none";
    }

    renderBindingsFeed();
    updateBindingMetrics();
  } else {
    if (tabStock) tabStock.classList.add("active");
    if (tabBindings) tabBindings.classList.remove("active");
    if (secStock) secStock.style.display = "block";
    if (secBindings) secBindings.style.display = "none";

    if (searchInput) {
      searchInput.placeholder = "ค้นหาแอป, แพ็กเกจ, หรืออีเมล...";
      searchInput.value = searchQuery;
      if (searchClear) searchClear.style.display = searchQuery ? "block" : "none";
    }

    renderStockFeed();
    updateMetrics();
  }

  updateTabBadges();
}

function updateTabBadges(totalScreens = null) {
  if (totalScreens === null) {
    totalScreens = 0;
    Object.values(appGroups).forEach(g => {
      totalScreens += g.totalScreens;
    });
  }

  const stockBadge = document.getElementById("tab-badge-stock");
  if (stockBadge) stockBadge.textContent = `${totalScreens.toLocaleString()} จอ`;

  const bindBadge = document.getElementById("tab-badge-bindings");
  if (bindBadge) bindBadge.textContent = `${rawBindings.length.toLocaleString()} สิทธิ์`;
}

function setBindingFilter(filterKey) {
  bindingFilter = filterKey;

  // Sync interactive metric cards
  const metricCards = document.querySelectorAll(".interactive-metric");
  metricCards.forEach(c => {
    c.classList.toggle("active", c.dataset.filter === filterKey);
  });

  // Sync filter chips
  const chips = document.querySelectorAll(".bind-filter-chip");
  chips.forEach(c => {
    c.classList.toggle("active", c.dataset.filter === filterKey);
  });

  renderBindingsFeed();
}

function updateBindingMetrics() {
  const now = new Date();
  let activeCount = 0;
  let expiringCount = 0;
  let revertedCount = 0;

  rawBindings.forEach(b => {
    if (b.reverted) {
      revertedCount++;
      return;
    }
    const isExpired = b.expiry_date ? (new Date(b.expiry_date) <= now) : false;
    if (isExpired) {
      return;
    }
    activeCount++;
    if (b.expiry_date) {
      const diffMs = new Date(b.expiry_date).getTime() - now.getTime();
      if (diffMs > 0 && diffMs <= 3 * 24 * 3600 * 1000) {
        expiringCount++;
      }
    }
  });

  const totalEl = document.getElementById("stat-bind-total");
  const activeEl = document.getElementById("stat-bind-active");
  const expEl = document.getElementById("stat-bind-expiring");
  const revEl = document.getElementById("stat-bind-reverted");

  if (totalEl) totalEl.textContent = rawBindings.length.toLocaleString();
  if (activeEl) activeEl.textContent = activeCount.toLocaleString();
  if (expEl) expEl.textContent = expiringCount.toLocaleString();
  if (revEl) revEl.textContent = revertedCount.toLocaleString();

  const searchBadge = document.getElementById("binding-search-badge");
  if (searchBadge) searchBadge.textContent = `⚡ สด • ${rawBindings.length.toLocaleString()} สิทธิ์`;
}

// ----------------------------------------------------------------------------
// 📋 Data Extractor: Combines Linked Account & Raw Account Data
// ----------------------------------------------------------------------------
function extractBindingDetails(b, linkedAccount) {
  let email = linkedAccount ? (linkedAccount.email || "") : "";
  let password = linkedAccount ? (linkedAccount.password || "") : "";
  let profileName = linkedAccount ? (linkedAccount.profile_name || "") : "";
  let pinCode = linkedAccount ? (linkedAccount.pin_code || "") : "";
  let displayId = linkedAccount ? (linkedAccount.display_id || "") : "";
  let deviceType = b.device_type || (linkedAccount ? linkedAccount.device_type : "สมาร์ททีวี / มือถือ");

  const raw = b.raw_account_data || "";

  if (!email) {
    const m = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i) ||
      raw.match(/(?:Mail|เมล|email|เบอร์)[:\s\t\-]+([^\s\n\r]+)/i);
    if (m) email = (m[1] || m[0]).trim();
  }

  if (!password) {
    const m = raw.match(/(?:รหัสผ่าน|พาส|พาสเวิร์ด|password|pass|พินเมล)[:\s\t\-]+([^\s\n\r]+)/i);
    if (m) password = m[1].trim();
  }

  if (!profileName) {
    const m = raw.match(/(?:โปรไฟล์|เข้า\s*จอ|จอหมายเลข|จอ)[:\s\t\-]*([^\s\n\r]+)/i);
    if (m) {
      const val = m[1].trim();
      profileName = val.startsWith("จอ") ? val : `จอ ${val}`;
    }
  }

  if (!pinCode) {
    const m = raw.match(/(?:PIN|พิน|รหัส PIN)[:\s\t\-]+(\d{4,6})/i);
    if (m) pinCode = m[1].trim();
  }

  if (!displayId) {
    const m = raw.match(/(?:ID\s*(?:จอ|ฌอ)|ID)[:\s\t\-]*#?(\d+)/i);
    if (m) displayId = m[1].trim();
  }

  // OTP Link
  let otpUrl = b.supplier_url || (linkedAccount ? linkedAccount.supplier_url : null);
  if (!otpUrl) {
    const m = raw.match(/(https?:\/\/(?:code\.varinzxify\.com|abeslife\.com|[\w.-]+\.[\w.-]+)\/[^\s\n\r]*)/i);
    if (m) otpUrl = m[1].trim();
  }

  return { email, password, profileName, pinCode, displayId, deviceType, otpUrl };
}

// ----------------------------------------------------------------------------
// 🎲 Random Customer Selector
// ----------------------------------------------------------------------------
function pickRandomCustomer() {
  haptic();
  if (!rawBindings || rawBindings.length === 0) {
    showToast("⚠️ ยังไม่มีข้อมูลการผูกสิทธิ์ในระบบ");
    return;
  }

  // Prioritize active bindings with non-empty customer_name
  const activePool = rawBindings.filter(b => !b.reverted && b.customer_name && b.customer_name.trim() !== "");
  const pool = activePool.length > 0 ? activePool : rawBindings.filter(b => b.customer_name && b.customer_name.trim() !== "");

  if (pool.length === 0) {
    showToast("⚠️ ไม่พบชื่อลูกค้าในรายการผูกสิทธิ์");
    return;
  }

  const randomBinding = pool[Math.floor(Math.random() * pool.length)];
  const name = randomBinding.customer_name.trim();

  bindingSearchQuery = name.toLowerCase();

  const topSearch = document.getElementById("search-input");
  const topClear = document.getElementById("search-clear");
  if (topSearch) {
    topSearch.value = name;
    if (topClear) topClear.style.display = "block";
    topSearch.classList.add("parser-success-flash");
    setTimeout(() => topSearch.classList.remove("parser-success-flash"), 800);
  }

  renderBindingsFeed();
  showToast(`🎲 สุ่มลูกค้า: คุณ ${name} (${randomBinding.app_name || ''})`);

  // Scroll smoothly to feed
  const feed = document.getElementById("bindings-feed");
  if (feed) {
    feed.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ----------------------------------------------------------------------------
// 🖥️ Render Bindings Feed
// ----------------------------------------------------------------------------
function renderBindingsFeed() {
  const feed = document.getElementById("bindings-feed");
  if (!feed) return;

  const now = new Date();
  const query = bindingSearchQuery.trim().toLowerCase();

  const filtered = rawBindings.filter(b => {
    // 1. Status Filter
    const isReverted = !!b.reverted;
    const isExpired = b.expiry_date ? (new Date(b.expiry_date) <= now) : false;
    const isExpiringSoon = !isReverted && !isExpired && b.expiry_date && (new Date(b.expiry_date).getTime() - now.getTime() <= 3 * 24 * 3600 * 1000);
    const isActive = !isReverted && !isExpired;

    if (bindingFilter === "active" && !isActive) return false;
    if (bindingFilter === "expiring" && !isExpiringSoon) return false;
    if (bindingFilter === "expired" && !isExpired) return false;
    if (bindingFilter === "reverted" && !isReverted) return false;

    // 2. Query Search
    if (!query) return true;

    const linkedAcc = b.account_id ? allAccountsList.find(a => a.id === b.account_id) : null;
    const details = extractBindingDetails(b, linkedAcc);

    const matchCustName = (b.customer_name || "").toLowerCase().includes(query);
    const matchAppName = (b.app_name || "").toLowerCase().includes(query);
    const matchPkgName = (b.package_name || "").toLowerCase().includes(query);
    const matchRaw = (b.raw_account_data || "").toLowerCase().includes(query);
    const matchEmail = (details.email || "").toLowerCase().includes(query);
    const matchPass = (details.password || "").toLowerCase().includes(query);
    const matchProfile = (details.profileName || "").toLowerCase().includes(query);
    const matchPin = (details.pinCode || "").toLowerCase().includes(query);
    const matchDisplayId = details.displayId ? String(details.displayId).toLowerCase().includes(query.replace("#", "")) : false;

    return matchCustName || matchAppName || matchPkgName || matchRaw || matchEmail || matchPass || matchProfile || matchPin || matchDisplayId;
  });

  if (filtered.length === 0) {
    feed.innerHTML = `
      <div class="empty-state" style="padding: 40px 16px;">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">ไม่พบข้อมูลการผูกสิทธิ์ที่ตรงกับคำค้นหา</div>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 6px;">
          ลองค้นหาด้วยชื่อลูกค้าอื่น, ID จอ เช่น #153, อีเมล หรือแตะปุ่ม "🎲 สุ่มชื่อลูกค้า" ด้านบน
        </div>
      </div>
    `;
    return;
  }

  feed.innerHTML = "";

  const displayedItems = filtered.slice(0, bindingsRenderLimit);

  displayedItems.forEach(b => {
    const linkedAcc = b.account_id ? allAccountsList.find(a => a.id === b.account_id) : null;
    const details = extractBindingDetails(b, linkedAcc);
    const appTheme = getAppTheme(b.app_name || "");

    // Expiry calculation
    let expiryDisplay = "ไม่ระบุวันหมดอายุ";
    let countdownHtml = "";
    let statusClass = "active";
    let statusLabel = "🟢 กำลังใช้งาน";

    if (b.reverted) {
      statusClass = "reverted";
      statusLabel = "⚪ ดีดคืนสต็อกแล้ว";
    } else if (b.expiry_date) {
      const expDate = new Date(b.expiry_date);
      if (!isNaN(expDate.getTime())) {
        const diffMs = expDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

        expiryDisplay = formatDateThai(expDate);

        if (diffMs <= 0) {
          statusClass = "expired";
          statusLabel = "🔴 หมดอายุแล้ว";
          countdownHtml = `<span class="binding-countdown danger">🔴 หมดอายุแล้ว (${Math.abs(diffDays)} วันที่แล้ว)</span>`;
        } else if (diffHours <= 72) {
          statusClass = "expired";
          statusLabel = `⏰ เหลืออีก ${diffHours} ชม.`;
          countdownHtml = `<span class="binding-countdown warning">⚠️ ใกล้หมดอายุ (เหลือ ${diffHours} ชม.)</span>`;
        } else {
          statusClass = "active";
          statusLabel = `🟢 เหลือ ${diffDays} วัน`;
          countdownHtml = `<span class="binding-countdown safe">⏳ เหลืออีก ${diffDays} วัน</span>`;
        }
      }
    }

    const createdDisplay = b.created_at ? formatDateThai(new Date(b.created_at)) : "-";
    const customerInitial = (b.customer_name || "C").trim().charAt(0).toUpperCase();
    const customerWebappUrl = `https://rangoo-liff-app.vercel.app/c/?c=${encodeURIComponent(b.customer_name || '')}`;

    const card = document.createElement("div");
    card.className = `binding-card ${b.reverted ? 'reverted-card' : ''}`;
    card.dataset.bindingId = b.id;

    card.innerHTML = `
      <!-- Header: Customer Info & Status -->
      <div class="binding-card-header">
        <div class="binding-customer-title">
          <div class="binding-avatar">${escapeHtml(customerInitial)}</div>
          <div class="binding-cust-names">
            <span class="binding-name-text">
              <span>👤 คุณ ${escapeHtml(b.customer_name || 'ลูกค้า')}</span>
              ${b.customer_name ? `<button type="button" class="binding-mini-btn btn-copy-cred" data-copy="${escapeHtml(b.customer_name)}" data-label="ชื่อลูกค้า" title="คัดลอกชื่อลูกค้า">📋</button>` : ''}
            </span>
            <span class="binding-sub-id btn-copy-cred" data-copy="${escapeHtml(b.id || '')}" data-label="ID สิทธิ์" title="แตะเพื่อคัดลอก ID สิทธิ์เต็ม" style="cursor: pointer;">ID: ${escapeHtml((b.id || '').substring(0, 8))}... 📋</span>
          </div>
        </div>
        <div class="binding-header-right-badges">
          <span class="binding-screen-tag">
            <span>📺</span>
            <span>${details.displayId ? '#' + escapeHtml(details.displayId) : 'จอสต็อก'}</span>
          </span>
          <span class="binding-status-pill ${statusClass}">${statusLabel}</span>
        </div>
      </div>

      <!-- App & Package Banner -->
      <div class="binding-app-banner">
        <div class="binding-app-left">
          <span class="binding-app-badge" style="background:${appTheme.gradient}; border-color:${appTheme.border};">
            ${appTheme.icon} ${escapeHtml(b.app_name || 'แอปพรีเมียม')}
          </span>
          <span class="binding-pkg-title">${escapeHtml(b.package_name || 'แพ็กเกจ')}</span>
        </div>
        <div>
          <span class="binding-price-badge">${b.price_paid ? b.price_paid + '฿' : 'ฟรี'} • ${b.days || 30} วัน</span>
        </div>
      </div>

      <!-- Credentials Box -->
      <div class="binding-creds-box">
        <div class="binding-cred-row">
          <span class="binding-cred-label">✉️ อีเมล / บัญชี:</span>
          <div class="binding-cred-val-group">
            <span class="binding-email-text" style="color: #38bdf8;">${escapeHtml(details.email || '-')}</span>
            ${details.email ? `<button type="button" class="binding-mini-btn btn-copy-cred" data-copy="${escapeHtml(details.email)}" data-label="อีเมล" title="คัดลอกอีเมล">📋</button>` : ''}
          </div>
        </div>

        <div class="binding-cred-row">
          <span class="binding-cred-label">🔑 รหัสผ่าน:</span>
          <div class="binding-cred-val-group">
            <span class="binding-pwd-text" data-password="${escapeHtml(details.password || '')}">${isPasswordHidden ? '••••••••' : escapeHtml(details.password || '-')}</span>
            ${details.password ? `
              <button type="button" class="binding-mini-btn btn-toggle-card-pwd" title="ซ่อน/แสดงรหัส">👁️</button>
              <button type="button" class="binding-mini-btn btn-copy-cred" data-copy="${escapeHtml(details.password)}" data-label="รหัสผ่าน" title="คัดลอกรหัสผ่าน">📋</button>
            ` : ''}
            <button type="button" class="binding-mini-btn btn-action-edit-creds" data-binding-id="${b.id}" title="แก้ไขรหัสผ่าน / สุ่มใหม่">✏️</button>
          </div>
        </div>

        <div class="binding-cred-row">
          <span class="binding-cred-label">👤 จอ / โปรไฟล์:</span>
          <div class="binding-cred-val-group">
            <span>${escapeHtml(details.profileName || 'จอ 1')}</span>
            ${details.pinCode ? `
              <span style="color: #a855f7; margin-left: 4px;">[PIN: ${escapeHtml(details.pinCode)}]</span>
              <button type="button" class="binding-mini-btn btn-copy-cred" data-copy="${escapeHtml(details.pinCode)}" data-label="PIN" title="คัดลอก PIN">📋</button>
            ` : '<span style="color: var(--text-dim); font-size:10px;">(ไม่มี PIN)</span>'}
            <button type="button" class="binding-mini-btn btn-action-edit-creds" data-binding-id="${b.id}" title="แก้ไขข้อมูล / เปลี่ยน / สุ่ม PIN">✏️</button>
          </div>
        </div>

        <div class="binding-cred-row">
          <span class="binding-cred-label">📱 อุปกรณ์:</span>
          <span style="color: var(--text-muted); font-size: 11px;">${escapeHtml(details.deviceType || 'มือถือ / PC')}</span>
        </div>

        ${details.otpUrl ? `
          <div class="binding-cred-row" style="margin-top: 2px;">
            <span class="binding-cred-label">🌐 เว็บรับ OTP:</span>
            <a href="${escapeHtml(details.otpUrl)}" target="_blank" class="binding-mini-btn" style="color: #34d399; border-color: rgba(52, 211, 153, 0.4); text-decoration: none;">
              เปิดเว็บ OTP ↗
            </a>
          </div>
        ` : ''}
      </div>

      <!-- Timeline & Expiry Box -->
      <div class="binding-timeline-box">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span>📅 เริ่ม: ${createdDisplay}</span>
          <span>⏰ หมดอายุ: ${expiryDisplay}</span>
        </div>
        <div>
          ${countdownHtml}
        </div>
      </div>

      <!-- Customer Communication Links -->
      <div class="binding-links-row">
        ${b.chat_url ? `
          <a href="${escapeHtml(b.chat_url)}" target="_blank" class="binding-link-btn chat" title="เปิดห้องแชท LINE OA ของลูกค้านี้">
            <span>💬</span><span>แชท LINE</span>
          </a>
        ` : `
          <button type="button" class="binding-link-btn chat" style="opacity: 0.5; cursor: not-allowed;" title="ไม่มีลิงก์แชท">
            <span>💬</span><span>ไม่มีแชท</span>
          </button>
        `}
        <a href="${customerWebappUrl}" target="_blank" class="binding-link-btn webapp" title="เปิดดูหน้าเว็บแอปลูกค้า">
          <span>📱</span><span>WebApp</span>
        </a>
        <button type="button" class="binding-link-btn copy-script btn-copy-handover" data-binding-id="${b.id}" title="คัดลอกสคริปต์ส่งมอบข้อมูลสิทธิ์ให้ลูกค้า">
          <span>📋</span><span>1-Tap ส่งมอบ</span>
        </button>
      </div>

      <!-- Troubleshooting & Management Action Bar -->
      <div class="binding-troubleshoot-bar">
        <button type="button" class="binding-action-btn swap btn-action-swap" data-binding-id="${b.id}" title="เคลมจอ หรือย้ายไปใช้บัญชีอื่นจากคลัง">
          <span>🔄</span><span>เคลมจอ</span>
        </button>
        <button type="button" class="binding-action-btn edit btn-action-edit-creds" data-binding-id="${b.id}" title="แก้ไขข้อมูล: สุ่ม PIN, เปลี่ยนรหัสผ่าน, จอ, อุปกรณ์">
          <span>✏️</span><span>แก้ไข</span>
        </button>
        <button type="button" class="binding-action-btn revert btn-action-revert" data-binding-id="${b.id}" title="ดีดคืนสต็อก / ปลดสิทธิ์ออกจากลูกค้า">
          <span>↩️</span><span>ดีดคืนคลัง</span>
        </button>
        <button type="button" class="binding-action-btn extend btn-action-extend" data-binding-id="${b.id}" title="ต่ออายุสิทธิ์ +วัน">
          <span>➕</span><span>ต่ออายุ</span>
        </button>
        <button type="button" class="binding-action-btn broken btn-action-broken" data-binding-id="${b.id}" title="ทำเครื่องหมายว่าจอมีปัญหา">
          <span>⚠️</span><span>แจ้งเสีย</span>
        </button>
      </div>
    `;

    feed.appendChild(card);
  });

  // Load More Button if more items exist
  if (filtered.length > displayedItems.length) {
    const loadMoreDiv = document.createElement("div");
    loadMoreDiv.className = "load-more-bindings-wrap";
    loadMoreDiv.style.cssText = "text-align: center; padding: 14px 0 28px 0;";
    loadMoreDiv.innerHTML = `
      <div style="font-size: 11.5px; color: var(--text-dim); margin-bottom: 8px;">
        แสดง ${displayedItems.length} จากทั้งหมด ${filtered.length.toLocaleString()} สิทธิ์
      </div>
      <button type="button" id="btn-load-more-bindings" class="prem-btn prem-btn-secondary" style="width: auto; padding: 8px 24px; font-weight: 700; margin: 0 auto; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
        <span>⬇️</span><span>โหลดสิทธิ์เพิ่มอีก 50 รายการ</span>
      </button>
    `;
    feed.appendChild(loadMoreDiv);

    const loadMoreBtn = document.getElementById("btn-load-more-bindings");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", () => {
        haptic();
        bindingsRenderLimit += 50;
        renderBindingsFeed();
      });
    }
  }
}

// ----------------------------------------------------------------------------
// 🛠️ Troubleshooting & Support Actions
// ----------------------------------------------------------------------------

function initTroubleshootingModalListeners() {
  // Feed Event Delegation for Binding Card buttons
  const bindingsFeed = document.getElementById("bindings-feed");
  if (bindingsFeed) {
    bindingsFeed.addEventListener("click", (e) => {
      // 1. Copy Credential mini button
      const copyBtn = e.target.closest(".btn-copy-cred");
      if (copyBtn) {
        e.stopPropagation();
        const text = copyBtn.dataset.copy;
        const label = copyBtn.dataset.label || "ข้อมูล";
        if (text) copySingleValue(text, label, copyBtn);
        return;
      }

      // 2. Toggle card password mask
      const togglePwdBtn = e.target.closest(".btn-toggle-card-pwd");
      if (togglePwdBtn) {
        e.stopPropagation();
        const pwdSpan = togglePwdBtn.closest(".binding-cred-val-group")?.querySelector(".binding-pwd-text");
        if (pwdSpan) {
          const rawPwd = pwdSpan.dataset.password || "";
          const isMasked = pwdSpan.textContent.includes("•");
          pwdSpan.textContent = isMasked ? rawPwd : "••••••••";
          togglePwdBtn.textContent = isMasked ? "🙈" : "👁️";
        }
        return;
      }

      // 3. 1-Tap Handover Script
      const handoverBtn = e.target.closest(".btn-copy-handover");
      if (handoverBtn) {
        e.stopPropagation();
        copyBindingHandoverScript(handoverBtn.dataset.bindingId, handoverBtn);
        return;
      }

      // 4. Action: Swap / Claim
      const swapBtn = e.target.closest(".btn-action-swap");
      if (swapBtn) {
        e.stopPropagation();
        openSwapModal(swapBtn.dataset.bindingId);
        return;
      }

      // 5. Action: Revert
      const revertBtn = e.target.closest(".btn-action-revert");
      if (revertBtn) {
        e.stopPropagation();
        executeRevertBinding(revertBtn.dataset.bindingId);
        return;
      }

      // 6. Action: Extend
      const extendBtn = e.target.closest(".btn-action-extend");
      if (extendBtn) {
        e.stopPropagation();
        openExtendModal(extendBtn.dataset.bindingId);
        return;
      }

      // 7. Action: Mark Broken
      const brokenBtn = e.target.closest(".btn-action-broken");
      if (brokenBtn) {
        e.stopPropagation();
        executeMarkBroken(brokenBtn.dataset.bindingId);
        return;
      }

      // 8. Action: Edit Credentials & Details (PIN, Password, Profile, Device, OTP, etc.)
      const editBtn = e.target.closest(".btn-action-edit-creds");
      if (editBtn) {
        e.stopPropagation();
        openEditCredsModal(editBtn.dataset.bindingId);
        return;
      }
    });
  }

  // Swap Modal close and confirm
  const closeSwapBtn = document.getElementById("btn-close-swap-modal");
  if (closeSwapBtn) closeSwapBtn.addEventListener("click", closeSwapModal);
  const confirmSwapBtn = document.getElementById("btn-confirm-swap");
  if (confirmSwapBtn) confirmSwapBtn.addEventListener("click", executeConfirmSwap);

  // Extend Modal close, quick days and confirm
  const closeExtendBtn = document.getElementById("btn-close-extend-modal");
  if (closeExtendBtn) closeExtendBtn.addEventListener("click", closeExtendModal);
  const confirmExtendBtn = document.getElementById("btn-confirm-extend");
  if (confirmExtendBtn) confirmExtendBtn.addEventListener("click", executeConfirmExtend);

  document.querySelectorAll(".btn-quick-extend").forEach(btn => {
    btn.addEventListener("click", () => {
      haptic();
      const input = document.getElementById("input-extend-custom-days");
      if (input && btn.dataset.days) input.value = btn.dataset.days;
    });
  });

  // Edit Creds Modal close and confirm
  const closeEditCredsBtn = document.getElementById("btn-close-edit-creds-modal");
  if (closeEditCredsBtn) closeEditCredsBtn.addEventListener("click", closeEditCredsModal);
  const confirmEditCredsBtn = document.getElementById("btn-confirm-edit-creds");
  if (confirmEditCredsBtn) confirmEditCredsBtn.addEventListener("click", executeConfirmEditCreds);

  const editExpTrigger = document.getElementById("edit-creds-expiry-trigger");
  if (editExpTrigger) {
    editExpTrigger.addEventListener("click", () => {
      const expInput = document.getElementById("edit-creds-expiry");
      const expText = document.getElementById("edit-creds-expiry-text");
      openThaiDatePicker({
        inputEl: expInput,
        textEl: expText,
        title: "📆 แก้ไขวันหมดอายุ (พ.ศ.)"
      });
    });
  }

  const editRandomPwBtn = document.getElementById("btn-edit-random-pw");
  if (editRandomPwBtn) {
    editRandomPwBtn.addEventListener("click", () => {
      const input = document.getElementById("edit-creds-password");
      if (input) input.value = generateRandomPassword();
    });
  }
  const editRandomPinBtn = document.getElementById("btn-edit-random-pin");
  if (editRandomPinBtn) {
    editRandomPinBtn.addEventListener("click", () => {
      const input = document.getElementById("edit-creds-pin");
      if (input) input.value = generateRandomPin();
    });
  }
  const editClearPinBtn = document.getElementById("btn-edit-clear-pin");
  if (editClearPinBtn) {
    editClearPinBtn.addEventListener("click", () => {
      const input = document.getElementById("edit-creds-pin");
      if (input) input.value = "";
    });
  }

  const randomAllPinsBtn = document.getElementById("btn-edit-random-all-pins");
  if (randomAllPinsBtn) {
    randomAllPinsBtn.addEventListener("click", () => {
      haptic();
      if (!editCredsContext.screens || editCredsContext.screens.length === 0) return;
      editCredsContext.screens.forEach(s => {
        const newP = generateRandomPin();
        editCredsContext.randomizedPinsMap[s.id] = newP;
        if (!editCredsContext.screenEdits[s.id]) editCredsContext.screenEdits[s.id] = {};
        editCredsContext.screenEdits[s.id].pinCode = newP;
      });
      const activeScreenId = editCredsContext.selectedScreenId;
      const currentPinInput = document.getElementById("edit-creds-pin");
      if (currentPinInput && activeScreenId && editCredsContext.randomizedPinsMap[activeScreenId]) {
        currentPinInput.value = editCredsContext.randomizedPinsMap[activeScreenId];
      }
      renderScreenSelectOptions(editCredsContext.screens, activeScreenId);
      showToast(`🎲 สุ่ม PIN ใหม่ให้ทุกจอ (${editCredsContext.screens.length} จอ) เรียบร้อย!`);
    });
  }

  const screenSelect = document.getElementById("edit-creds-screen-select");
  if (screenSelect) {
    screenSelect.addEventListener("change", (e) => {
      saveCurrentScreenInputsToMemory();
      const newScreenId = e.target.value;
      editCredsContext.selectedScreenId = newScreenId;
      const screenObj = editCredsContext.screens.find(s => s.id === newScreenId);
      if (screenObj) populateScreenFields(screenObj);
    });
  }

  // Cancel buttons inside sheets
  document.querySelectorAll(".modal-cancel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      closeSwapModal();
      closeExtendModal();
      closeEditCredsModal();
    });
  });

  // Raw modal close & copy
  const closeRawBtn = document.getElementById("btn-close-raw-modal");
  if (closeRawBtn) closeRawBtn.addEventListener("click", closeRawDataModal);
  const copyRawBtn = document.getElementById("btn-copy-raw-modal");
  if (copyRawBtn) {
    copyRawBtn.addEventListener("click", () => {
      const txt = document.getElementById("modal-raw-text-content")?.value;
      if (txt) {
        copyToClipboard(txt);
        showToast("📋 คัดลอกข้อความดิบเรียบร้อยแล้ว");
      }
    });
  }
}

// 1. Swap / Claim Modal
function openSwapModal(bindingId) {
  haptic();
  const b = rawBindings.find(x => x.id === bindingId);
  if (!b) return;

  targetBindingForSwap = b;
  const linkedAcc = b.account_id ? allAccountsList.find(a => a.id === b.account_id) : null;
  const details = extractBindingDetails(b, linkedAcc);

  const infoBox = document.getElementById("swap-cust-info-box");
  if (infoBox) {
    infoBox.innerHTML = `
      <div>👤 ลูกค้า: <strong>คุณ ${escapeHtml(b.customer_name)}</strong></div>
      <div>🎬 แอป: <strong>${escapeHtml(b.app_name)}</strong> (${escapeHtml(b.package_name || '-')})</div>
      <div>📦 บัญชีเดิม: <span style="color:#38bdf8;">${escapeHtml(details.email || '-')}</span> ${details.displayId ? '#' + escapeHtml(details.displayId) : ''} (${escapeHtml(details.profileName || 'จอเดิม')})</div>
      <div>⏳ วันหมดอายุคงเดิม: <strong>${formatDateThai(b.expiry_date ? new Date(b.expiry_date) : new Date())}</strong></div>
    `;
  }

  // Populate available accounts dropdown for this app
  const select = document.getElementById("swap-target-account-select");
  if (select) {
    select.innerHTML = `<option value="">-- เลือกบัญชีว่างจากคลัง --</option>`;

    // Find available accounts
    const available = allAccountsList.filter(a => a.status === "available" && a.id !== b.account_id);
    const sameAppAvailable = available.filter(a => {
      const app = rawApps.find(ap => ap.id === a.app_id);
      const appName = app ? (app.name || app.display_name || "") : "";
      return appName.toLowerCase().includes((b.app_name || "").toLowerCase()) || (b.app_name || "").toLowerCase().includes(appName.toLowerCase());
    });

    const displayList = sameAppAvailable.length > 0 ? sameAppAvailable : available;

    displayList.forEach(acc => {
      const opt = document.createElement("option");
      opt.value = acc.id;
      const appObj = rawApps.find(ap => ap.id === acc.app_id);
      const apName = appObj ? (appObj.display_name || appObj.name) : "แอป";
      opt.textContent = `[${apName}] #${acc.display_id || '-'} • ${acc.email} (${acc.profile_name || 'จอว่าง'})`;
      select.appendChild(opt);
    });

    if (displayList.length > 0) {
      select.selectedIndex = 1;
    }
  }

  const modal = document.getElementById("modal-swap-account");
  if (modal) modal.style.display = "flex";
}

function closeSwapModal() {
  const modal = document.getElementById("modal-swap-account");
  if (modal) modal.style.display = "none";
  targetBindingForSwap = null;
}

async function executeConfirmSwap() {
  if (!targetBindingForSwap) return;

  const b = targetBindingForSwap;
  const select = document.getElementById("swap-target-account-select");
  const targetAccountId = select ? select.value : "";

  if (!targetAccountId) {
    showToast("❌ กรุณาเลือกบัญชี/จอใหม่จากคลัง!");
    return;
  }

  const newAcc = allAccountsList.find(a => a.id === targetAccountId);
  if (!newAcc) {
    showToast("❌ ไม่พบบัญชีที่เลือกในระบบ");
    return;
  }

  const confirmBtn = document.getElementById("btn-confirm-swap");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "⏳ กำลังสลับบัญชี...";
  }

  try {
    // 1. Mark old account as broken
    if (b.account_id) {
      await patchDatabase("accounts", b.account_id, { status: "broken" });
    }

    // 2. Mark new account as used
    await patchDatabase("accounts", newAcc.id, {
      status: "used",
      customer_id: b.customer_name,
      sold_at: new Date().toISOString(),
      expiry_date: b.expiry_date
    });

    // 3. Update customer_binding
    const newRawData = `อีเมล: ${newAcc.email}\nรหัสผ่าน: ${newAcc.password}\nID จอ: #${newAcc.display_id || '-'}\nโปรไฟล์: ${newAcc.profile_name || 'จอที่กำหนด'}${newAcc.pin_code ? '\nPIN: ' + newAcc.pin_code : ''}`;
    await patchDatabase("customer_bindings", b.id, {
      account_id: newAcc.id,
      supplier_order_id: newAcc.supplier_order_id || b.supplier_order_id || null,
      supplier_url: newAcc.supplier_url || b.supplier_url || null,
      raw_account_data: newRawData
    });

    // 4. Generate handover script & copy
    const handoverText = `🔄 แจ้งเปลี่ยนบัญชีใหม่ (เคลมจอ) ${b.app_name}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 คุณ ${b.customer_name}\n` +
      `⏳ วันหมดอายุคงเดิม: ${formatDateThai(b.expiry_date ? new Date(b.expiry_date) : new Date())}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📧 อีเมล: ${newAcc.email}\n` +
      `🔑 รหัสผ่าน: ${newAcc.password}\n` +
      `👤 โปรไฟล์/จอ: ${newAcc.profile_name || 'จอที่กำหนด'}\n` +
      (newAcc.pin_code ? `🔢 รหัส PIN: ${newAcc.pin_code}\n` : '') +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🙏 ขออภัยในความไม่สะดวกด้วยนะครับ เข้าใช้งานได้ทันทีครับ ✨`;

    await copyToClipboard(handoverText);
    closeSwapModal();
    showToast(`✅ เคลมจอสำเร็จ & คัดลอกข้อมูลใหม่ส่งลูกค้าแล้ว!`);
    await loadData(true);
  } catch (err) {
    console.error("Swap account error:", err);
    showToast("❌ เคลมจอไม่สำเร็จ: " + err.message);
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "🔄 ยืนยันเคลมจอ & สลับบัญชี";
    }
  }
}

// 2. Revert Binding
async function executeRevertBinding(bindingId) {
  haptic();
  const b = rawBindings.find(x => x.id === bindingId);
  if (!b) return;

  if (!confirm(`คุณต้องการดีดคืนสต็อกสิทธิ์ของคุณ ${b.customer_name} (${b.app_name}) ใช่หรือไม่?`)) {
    return;
  }

  showToast("⏳ กำลังดำเนินการดีดคืนสต็อก...");

  try {
    // 1. Mark binding reverted = true
    await patchDatabase("customer_bindings", b.id, { reverted: true });
    b.reverted = true;

    // 2. If account linked, check if co-sharers exist
    if (b.account_id) {
      const otherActive = rawBindings.filter(other => !other.reverted && other.account_id === b.account_id && other.id !== b.id);
      if (otherActive.length > 0) {
        await patchDatabase("accounts", b.account_id, {
          status: "used",
          customer_id: otherActive[0].customer_name
        });
        showToast(`↩️ ปลดสิทธิ์สำเร็จ (จอยังคงมีคุณ ${otherActive[0].customer_name} ใช้งานอยู่)`);
      } else {
        await patchDatabase("accounts", b.account_id, {
          status: "available",
          customer_id: null,
          sold_at: null
        });
        showToast("↩️ ปลดสิทธิ์และคืนจอเข้าสต็อกพร้อมขายเรียบร้อยแล้ว!");
      }
    } else {
      showToast("↩️ ปลดสิทธิ์เรียบร้อยแล้ว");
    }

    await loadData(true);
  } catch (err) {
    console.error("Revert binding error:", err);
    showToast("❌ ปลดสิทธิ์ไม่สำเร็จ: " + err.message);
  }
}

// 3. Extend Days Modal
function openExtendModal(bindingId) {
  haptic();
  const b = rawBindings.find(x => x.id === bindingId);
  if (!b) return;

  targetBindingForExtend = b;
  const expDate = b.expiry_date ? new Date(b.expiry_date) : new Date();

  const infoBox = document.getElementById("extend-cust-info-box");
  if (infoBox) {
    infoBox.innerHTML = `
      <div>👤 ลูกค้า: <strong>คุณ ${escapeHtml(b.customer_name)}</strong></div>
      <div>🎬 แอป: <strong>${escapeHtml(b.app_name)}</strong> (${escapeHtml(b.package_name || '-')})</div>
      <div>📅 วันหมดอายุปัจจุบัน: <strong>${formatDateThai(expDate)}</strong></div>
    `;
  }

  const modal = document.getElementById("modal-extend-days");
  if (modal) modal.style.display = "flex";
}

function closeExtendModal() {
  const modal = document.getElementById("modal-extend-days");
  if (modal) modal.style.display = "none";
  targetBindingForExtend = null;
}

async function executeConfirmExtend() {
  if (!targetBindingForExtend) return;

  const b = targetBindingForExtend;
  const input = document.getElementById("input-extend-custom-days");
  const addDays = parseInt(input ? input.value : 30, 10);

  if (isNaN(addDays) || addDays <= 0) {
    showToast("❌ กรุณาระบุจำนวนวันมากกว่า 0!");
    return;
  }

  const confirmBtn = document.getElementById("btn-confirm-extend");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "⏳ กำลังบันทึก...";
  }

  try {
    const currentExpiry = b.expiry_date ? new Date(b.expiry_date) : new Date();
    const base = currentExpiry > new Date() ? currentExpiry : new Date();
    const newExpiry = new Date(base.getTime() + addDays * 24 * 60 * 60 * 1000);
    newExpiry.setHours(23, 59, 0, 0);

    const newDaysTotal = (parseInt(b.days, 10) || 0) + addDays;

    await patchDatabase("customer_bindings", b.id, {
      days: newDaysTotal,
      expiry_date: newExpiry.toISOString()
    });

    if (b.account_id) {
      await patchDatabase("accounts", b.account_id, {
        expiry_date: newExpiry.toISOString()
      });
    }

    b.days = newDaysTotal;
    b.expiry_date = newExpiry.toISOString();

    const msg = `✨ แจ้งต่ออายุการใช้งาน ${b.app_name}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 คุณ ${b.customer_name}\n` +
      `➕ เพิ่มระยะเวลา: +${addDays} วัน\n` +
      `📅 วันหมดอายุใหม่: ${formatDateThai(newExpiry)}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `ขอบคุณที่ไว้วางใจใช้บริการครับ ✨`;

    await copyToClipboard(msg);
    closeExtendModal();
    showToast(`➕ ต่ออายุ +${addDays} วันสำเร็จ & คัดลอกข้อความแล้ว!`);
    renderBindingsFeed();
    updateBindingMetrics();
  } catch (err) {
    console.error("Extend error:", err);
    showToast("❌ ต่ออายุไม่สำเร็จ: " + err.message);
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "💾 บันทึกการต่ออายุ";
    }
  }
}

// 4. Mark Broken
async function executeMarkBroken(bindingId) {
  haptic();
  const b = rawBindings.find(x => x.id === bindingId);
  if (!b) return;

  if (!b.account_id) {
    showToast("⚠️ รายการนี้ไม่ได้ผูก ID บัญชีในระบบ");
    return;
  }

  if (!confirm(`ต้องการทำเครื่องหมายว่า "บัญชี/จอ มีปัญหา" ใช่หรือไม่?\n\nระบบจะปรับสถานะบัญชีนี้ในคลังเป็น broken เพื่อไม่ให้นำไปขายซ้ำ`)) {
    return;
  }

  try {
    await patchDatabase("accounts", b.account_id, { status: "broken" });
    showToast("⚠️ ปรับสถานะบัญชีเป็น 'มีปัญหา' (broken) เรียบร้อยแล้ว");
    await loadData(true);
  } catch (err) {
    showToast("❌ อัปเดตสถานะไม่สำเร็จ: " + err.message);
  }
}

// ============================================================================
// 5. Edit Credentials & Account Management Modal (Unified Dual Mode)
// ============================================================================
let editCredsContext = {
  mode: "binding", // "binding" | "stock"
  targetBinding: null,
  groupKey: null,
  emailKey: null,
  screens: [],
  selectedScreenId: null,
  randomizedPinsMap: {},
  screenEdits: {} // screenId -> { pinCode, profileName, deviceType }
};

function saveCurrentScreenInputsToMemory() {
  if (editCredsContext.mode !== "stock" || !editCredsContext.selectedScreenId) return;
  const sId = editCredsContext.selectedScreenId;
  if (!editCredsContext.screenEdits[sId]) editCredsContext.screenEdits[sId] = {};
  
  const pinInput = document.getElementById("edit-creds-pin");
  if (pinInput) editCredsContext.screenEdits[sId].pinCode = pinInput.value.trim();
  
  const profInput = document.getElementById("edit-creds-profile");
  if (profInput) editCredsContext.screenEdits[sId].profileName = profInput.value.trim();
  
  const devSelect = document.getElementById("edit-creds-device");
  if (devSelect) editCredsContext.screenEdits[sId].deviceType = devSelect.value;
}

function populateScreenFields(screenObj) {
  const sId = screenObj.id;
  const edits = editCredsContext.screenEdits[sId] || {};
  
  const pinInput = document.getElementById("edit-creds-pin");
  if (pinInput) {
    if (edits.pinCode !== undefined) {
      pinInput.value = edits.pinCode;
    } else if (editCredsContext.randomizedPinsMap[sId] !== undefined) {
      pinInput.value = editCredsContext.randomizedPinsMap[sId];
    } else {
      pinInput.value = screenObj.pin_code || "";
    }
  }

  const profileInput = document.getElementById("edit-creds-profile");
  if (profileInput) {
    profileInput.value = edits.profileName !== undefined ? edits.profileName : (screenObj.profile_name || "");
  }

  const deviceSelect = document.getElementById("edit-creds-device");
  if (deviceSelect) {
    const devVal = edits.deviceType !== undefined ? edits.deviceType : (screenObj.device_type || "mobile");
    deviceSelect.value = devVal.toLowerCase().includes("tv") || devVal.includes("ทีวี") ? "tv" : "mobile";
  }
}

function renderScreenSelectOptions(screens, activeScreenId) {
  const screenSelect = document.getElementById("edit-creds-screen-select");
  if (!screenSelect) return;
  screenSelect.innerHTML = screens.map(s => {
    const edits = editCredsContext.screenEdits[s.id] || {};
    const pName = edits.profileName || s.profile_name || "จอ";
    const pin = edits.pinCode !== undefined 
      ? edits.pinCode 
      : (editCredsContext.randomizedPinsMap[s.id] !== undefined ? editCredsContext.randomizedPinsMap[s.id] : s.pin_code);
    const pinStr = pin ? `PIN: ${pin}` : "ไม่มี PIN";
    const idStr = s.display_id ? `#${s.display_id}` : "";
    return `<option value="${s.id}" ${s.id === activeScreenId ? 'selected' : ''}>${escapeHtml(pName)} ${escapeHtml(idStr)} (${escapeHtml(pinStr)})</option>`;
  }).join("");
}

// 5.1 Open for Stock Account & Screens
function openEditStockAccountModal(groupKey, emailKey, targetAccountId = null) {
  haptic();
  const group = appGroups[groupKey];
  if (!group) return;
  const acc = group.accountsByEmail[emailKey];
  if (!acc) return;

  const screens = acc.screens || [];
  if (screens.length === 0) return;

  const selectedScreen = (targetAccountId ? screens.find(s => s.id === targetAccountId) : null) || screens[0];

  editCredsContext = {
    mode: "stock",
    targetBinding: null,
    groupKey: groupKey,
    emailKey: emailKey,
    screens: screens,
    selectedScreenId: selectedScreen.id,
    randomizedPinsMap: {},
    screenEdits: {}
  };

  const theme = getAppTheme(group.appName);
  const infoBox = document.getElementById("edit-creds-info-box");
  if (infoBox) {
    infoBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>${theme.icon} <strong>${escapeHtml(group.appName)}</strong> <span style="font-size: 11px; color: var(--text-dim);">[${escapeHtml(group.pkgName || 'สต็อกพร้อมขาย')}]</span></div>
        <span class="binding-screen-tag"><span>📺</span><span>${screens.length} จอในบัญชี</span></span>
      </div>
      <div style="margin-top: 4px; font-size: 11px;">📧 อีเมล: <span style="color:#38bdf8; font-family: 'JetBrains Mono', monospace;">${escapeHtml(acc.email)}</span></div>
    `;
  }

  // Toggle Visibility for Stock Mode
  const custGroup = document.getElementById("edit-creds-cust-group");
  if (custGroup) custGroup.style.display = "none";

  const emailGroup = document.getElementById("edit-creds-email-group");
  if (emailGroup) {
    emailGroup.style.display = "block";
    const emailInput = document.getElementById("edit-creds-email");
    if (emailInput) emailInput.value = acc.email || "";
  }

  const screenSelectGroup = document.getElementById("edit-creds-screen-select-group");
  if (screenSelectGroup) {
    screenSelectGroup.style.display = "block";
    renderScreenSelectOptions(screens, selectedScreen.id);
  }

  const expiryGroup = document.getElementById("edit-creds-expiry-group");
  if (expiryGroup) {
    expiryGroup.style.display = "block";
    const expInput = document.getElementById("edit-creds-expiry");
    const expText = document.getElementById("edit-creds-expiry-text");
    if (expInput) {
      if (acc.expiry_date) {
        const d = new Date(acc.expiry_date);
        if (!isNaN(d.getTime())) {
          const pad = n => String(n).padStart(2, '0');
          expInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          if (expText) expText.textContent = formatThaiDateTime(d);
        } else {
          expInput.value = "";
          if (expText) expText.textContent = "📅 คลิกเลือกวันเวลา...";
        }
      } else {
        expInput.value = "";
        if (expText) expText.textContent = "📅 คลิกเลือกวันเวลา...";
      }
    }
  }

  const pwInput = document.getElementById("edit-creds-password");
  if (pwInput) pwInput.value = acc.password || "";

  populateScreenFields(selectedScreen);

  const otpInput = document.getElementById("edit-creds-otp");
  if (otpInput) {
    const firstOtp = screens.find(s => s.supplier_url)?.supplier_url || "";
    otpInput.value = firstOtp;
  }

  const confirmBtn = document.getElementById("btn-confirm-edit-creds");
  if (confirmBtn) confirmBtn.textContent = "💾 บันทึกข้อมูลบัญชี & จอ";

  const modal = document.getElementById("modal-edit-credentials");
  if (modal) modal.style.display = "flex";
}

// 5.2 Open for Customer Binding
function openEditCredsModal(bindingId) {
  haptic();
  const b = rawBindings.find(x => x.id === bindingId);
  if (!b) return;

  targetBindingForEditCreds = b;
  editCredsContext = {
    mode: "binding",
    targetBinding: b,
    groupKey: null,
    emailKey: null,
    screens: [],
    selectedScreenId: null,
    randomizedPinsMap: {},
    screenEdits: {}
  };

  const linkedAcc = b.account_id ? allAccountsList.find(a => a.id === b.account_id) : null;
  const details = extractBindingDetails(b, linkedAcc);

  const infoBox = document.getElementById("edit-creds-info-box");
  if (infoBox) {
    infoBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>👤 ลูกค้า: <strong>คุณ ${escapeHtml(b.customer_name || 'ลูกค้า')}</strong> (${escapeHtml(b.app_name || '')})</div>
        <span class="binding-screen-tag"><span>📺</span><span>${details.displayId ? '#' + escapeHtml(details.displayId) : 'ID สิทธิ์'}</span></span>
      </div>
      <div style="margin-top: 4px; font-size: 11px;">📧 อีเมล: <span style="color:#38bdf8; font-family: 'JetBrains Mono', monospace;">${escapeHtml(details.email || '-')}</span></div>
    `;
  }

  const custGroup = document.getElementById("edit-creds-cust-group");
  if (custGroup) custGroup.style.display = "block";
  const emailGroup = document.getElementById("edit-creds-email-group");
  if (emailGroup) emailGroup.style.display = "none";
  const screenSelectGroup = document.getElementById("edit-creds-screen-select-group");
  if (screenSelectGroup) screenSelectGroup.style.display = "none";
  const expiryGroup = document.getElementById("edit-creds-expiry-group");
  if (expiryGroup) expiryGroup.style.display = "none";

  const custNameInput = document.getElementById("edit-creds-customer-name");
  if (custNameInput) custNameInput.value = b.customer_name || "";

  const pwInput = document.getElementById("edit-creds-password");
  if (pwInput) pwInput.value = details.password || "";

  const pinInput = document.getElementById("edit-creds-pin");
  if (pinInput) pinInput.value = details.pinCode || "";

  const profileInput = document.getElementById("edit-creds-profile");
  if (profileInput) profileInput.value = details.profileName || "";

  const deviceSelect = document.getElementById("edit-creds-device");
  if (deviceSelect) {
    const dev = (details.deviceType || "mobile").toLowerCase();
    deviceSelect.value = dev.includes("tv") || dev.includes("ทีวี") ? "tv" : "mobile";
  }

  const otpInput = document.getElementById("edit-creds-otp");
  if (otpInput) otpInput.value = details.otpUrl || "";

  const confirmBtn = document.getElementById("btn-confirm-edit-creds");
  if (confirmBtn) confirmBtn.textContent = "💾 บันทึกข้อมูล & ส่งลูกค้า";

  const modal = document.getElementById("modal-edit-credentials");
  if (modal) modal.style.display = "flex";
}

function closeEditCredsModal() {
  const modal = document.getElementById("modal-edit-credentials");
  if (modal) modal.style.display = "none";
  targetBindingForEditCreds = null;
  editCredsContext.screens = [];
  editCredsContext.randomizedPinsMap = {};
  editCredsContext.screenEdits = {};
}

// 5.3 Confirm Save Handler for Both Modes
async function executeConfirmEditCreds() {
  const confirmBtn = document.getElementById("btn-confirm-edit-creds");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "⏳ กำลังบันทึก...";
  }

  try {
    // ----------------------------------------------------
    // Mode A: Stock Account & Screens Edit
    // ----------------------------------------------------
    if (editCredsContext.mode === "stock") {
      saveCurrentScreenInputsToMemory();

      const newEmail = (document.getElementById("edit-creds-email")?.value || "").trim();
      const newPw = (document.getElementById("edit-creds-password")?.value || "").trim();
      const newExpiryVal = (document.getElementById("edit-creds-expiry")?.value || "").trim();
      const newExpiryIso = newExpiryVal ? new Date(newExpiryVal).toISOString() : null;
      const newOtp = (document.getElementById("edit-creds-otp")?.value || "").trim();

      const screens = editCredsContext.screens || [];
      for (const s of screens) {
        const payload = {};
        if (newEmail && newEmail !== s.email) payload.email = newEmail;
        if (newPw) payload.password = newPw;
        if (newExpiryIso) payload.expiry_date = newExpiryIso;
        payload.supplier_url = newOtp || null;

        const edits = editCredsContext.screenEdits[s.id] || {};
        if (edits.pinCode !== undefined) {
          payload.pin_code = edits.pinCode || null;
        } else if (editCredsContext.randomizedPinsMap[s.id] !== undefined) {
          payload.pin_code = editCredsContext.randomizedPinsMap[s.id] || null;
        }

        if (edits.profileName !== undefined && edits.profileName) {
          payload.profile_name = edits.profileName;
        }
        if (edits.deviceType !== undefined && edits.deviceType) {
          payload.device_type = edits.deviceType === "tv" ? "สมาร์ททีวี" : "มือถือ / PC";
        }

        await patchDatabase("accounts", s.id, payload);
      }

      closeEditCredsModal();
      showToast(`💾 บันทึกข้อมูลบัญชี & ${screens.length} จอในคลังเรียบร้อยแล้ว!`);
      await loadData(true);
      return;
    }

    // ----------------------------------------------------
    // Mode B: Customer Binding Edit
    // ----------------------------------------------------
    if (!targetBindingForEditCreds) return;
    const b = targetBindingForEditCreds;
    const newCustomerName = (document.getElementById("edit-creds-customer-name")?.value || "").trim();
    const newPw = (document.getElementById("edit-creds-password")?.value || "").trim();
    const newPin = (document.getElementById("edit-creds-pin")?.value || "").trim();
    const newProfile = (document.getElementById("edit-creds-profile")?.value || "").trim();
    const newDeviceVal = (document.getElementById("edit-creds-device")?.value || "mobile");
    const deviceDisplay = newDeviceVal === "tv" ? "📺 สมาร์ททีวี" : "📱 มือถือ / PC";
    const newOtp = (document.getElementById("edit-creds-otp")?.value || "").trim();

    const linkedAcc = b.account_id ? allAccountsList.find(a => a.id === b.account_id) : null;

    // 1. Update Accounts table if linked
    if (b.account_id) {
      const accPayload = {};
      if (newPw) accPayload.password = newPw;
      accPayload.pin_code = newPin || null;
      if (newProfile) accPayload.profile_name = newProfile;
      accPayload.device_type = deviceDisplay;
      if (newOtp) accPayload.supplier_url = newOtp;
      if (newCustomerName) accPayload.customer_id = newCustomerName;

      await patchDatabase("accounts", b.account_id, accPayload);

      if (linkedAcc) {
        if (newPw) linkedAcc.password = newPw;
        linkedAcc.pin_code = newPin || null;
        if (newProfile) linkedAcc.profile_name = newProfile;
        linkedAcc.device_type = deviceDisplay;
        if (newOtp) linkedAcc.supplier_url = newOtp;
        if (newCustomerName) linkedAcc.customer_id = newCustomerName;
      }
    }

    // 2. Build updated raw_account_data
    const emailStr = linkedAcc ? (linkedAcc.email || '-') : '-';
    const displayIdStr = linkedAcc && linkedAcc.display_id ? '#' + linkedAcc.display_id : '-';
    const profileStr = newProfile || (linkedAcc ? linkedAcc.profile_name : 'จอ 1');
    const finalPw = newPw || (linkedAcc ? linkedAcc.password : '-');

    let updatedRaw = `อีเมล: ${emailStr}\nรหัสผ่าน: ${finalPw}\nID จอ: ${displayIdStr}\nโปรไฟล์: ${profileStr}`;
    if (newPin) updatedRaw += `\nPIN: ${newPin}`;
    updatedRaw += `\nอุปกรณ์: ${deviceDisplay}`;
    if (newOtp) updatedRaw += `\nเว็บรับ OTP: ${newOtp}`;

    // 3. Update customer_bindings table
    const bindingPayload = {
      raw_account_data: updatedRaw,
      device_type: deviceDisplay
    };
    if (newCustomerName) bindingPayload.customer_name = newCustomerName;
    if (newOtp) bindingPayload.supplier_url = newOtp;

    await patchDatabase("customer_bindings", b.id, bindingPayload);

    // Update in-memory binding
    if (newCustomerName) b.customer_name = newCustomerName;
    b.raw_account_data = updatedRaw;
    b.device_type = deviceDisplay;
    if (newOtp) b.supplier_url = newOtp;

    // 4. Auto-generate customer notification text & copy to clipboard
    const copyMsg = `✨ แจ้งอัปเดตข้อมูลบัญชี ${b.app_name || 'พรีเมียม'}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 คุณ ${newCustomerName || b.customer_name || 'ลูกค้า'}\n` +
      `📧 อีเมล: ${emailStr}\n` +
      `🔑 รหัสผ่าน: ${finalPw}\n` +
      `👤 จอ / โปรไฟล์: ${profileStr}\n` +
      (newPin ? `🔢 รหัส PIN: ${newPin}\n` : '') +
      `📱 อุปกรณ์: ${deviceDisplay}\n` +
      (newOtp ? `🌐 เว็บรับ OTP: ${newOtp}\n` : '') +
      `━━━━━━━━━━━━━━━━━━\n` +
      `เข้าใช้งานได้ทันทีครับ ขอบคุณครับ ✨`;

    await copyToClipboard(copyMsg);
    closeEditCredsModal();
    showToast("💾 อัปเดตข้อมูลสำเร็จ & คัดลอกข้อความส่งลูกค้าแล้ว!");
    await loadData(true);
  } catch (err) {
    console.error("Edit creds error:", err);
    showToast("❌ อัปเดตไม่สำเร็จ: " + err.message);
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = editCredsContext.mode === "stock" ? "💾 บันทึกข้อมูลบัญชี & จอ" : "💾 บันทึกข้อมูล & ส่งลูกค้า";
    }
  }
}

// 6. Raw Data Modal
function openRawDataModal(rawText) {
  haptic();
  const modal = document.getElementById("modal-raw-data");
  const content = document.getElementById("modal-raw-text-content");
  if (content) content.value = rawText || "ไม่มีข้อมูล";
  if (modal) modal.style.display = "flex";
}

function closeRawDataModal() {
  const modal = document.getElementById("modal-raw-data");
  if (modal) modal.style.display = "none";
}

// 7. Handover Script Copier
async function copyBindingHandoverScript(bindingId, btnElement = null) {
  haptic();
  const b = rawBindings.find(x => x.id === bindingId);
  if (!b) return;

  const linkedAcc = b.account_id ? allAccountsList.find(a => a.id === b.account_id) : null;
  const details = extractBindingDetails(b, linkedAcc);
  const expStr = b.expiry_date ? formatDateThai(new Date(b.expiry_date)) : "-";
  const webappUrl = `https://rangoo-liff-app.vercel.app/c/?c=${encodeURIComponent(b.customer_name || '')}`;

  let script = `✨ *ข้อมูลการใช้งาน ${b.app_name.toUpperCase()}*\n`;
  script += `[${b.package_name || 'แพ็กเกจพรีเมียม'}]\n`;
  script += `━━━━━━━━━━━━━━━━━━━━━\n`;
  script += `👤 คุณ: *${b.customer_name}*\n`;
  script += `📧 อีเมล: ${details.email || '-'}\n`;
  script += `🔑 รหัสผ่าน: ${details.password || '-'}\n`;
  script += `👤 โปรไฟล์/จอ: ${details.profileName || 'จอที่กำหนด'}\n`;
  if (details.pinCode) {
    script += `🔢 รหัส PIN: ${details.pinCode}\n`;
  }
  script += `📱 อุปกรณ์: ${details.deviceType || 'มือถือ / PC'}\n`;
  if (expStr !== "-") {
    script += `📅 วันหมดอายุ: ${expStr}\n`;
  }
  if (details.otpUrl) {
    script += `🌐 ลิงก์เว็บรับ OTP: ${details.otpUrl}\n`;
  }
  script += `━━━━━━━━━━━━━━━━━━━━━\n`;
  script += `📱 ตรวจสอบสิทธิ์ & OTP ใน WebApp:\n${webappUrl}\n`;
  script += `━━━━━━━━━━━━━━━━━━━━━\n`;
  script += `🙏 ขอบคุณที่ใช้บริการครับ ✨`;

  await copyToClipboard(script);

  if (btnElement) {
    const orig = btnElement.innerHTML;
    btnElement.innerHTML = `<span>✅</span><span>คัดลอกแล้ว!</span>`;
    setTimeout(() => btnElement.innerHTML = orig, 1500);
  }

  showToast(`📋 คัดลอกสิทธิ์ของคุณ ${b.customer_name} เรียบร้อย!`);
}

// ----------------------------------------------------------------------------
// Universal Database Insert Helper (Cloudflare D1 & Supabase Dual Compatible)
// ----------------------------------------------------------------------------
async function insertDatabase(tableName, payload) {
  let url, headers;
  if (currentShop.type === "supabase") {
    url = `${currentShop.url}/rest/v1/${tableName}`;
    headers = {
      "apikey": currentShop.key,
      "Authorization": `Bearer ${currentShop.key}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    };
  } else {
    url = `${currentShop.url}/api/${tableName}`;
    headers = {
      "Authorization": `Bearer ${currentShop.key}`,
      "Content-Type": "application/json"
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

// ----------------------------------------------------------------------------
// Universal Database Patch Helper (Cloudflare D1 & Supabase Dual Compatible)
// ----------------------------------------------------------------------------
async function patchDatabase(tableName, id, payload) {
  let url, headers;
  if (currentShop.type === "supabase") {
    url = `${currentShop.url}/rest/v1/${tableName}?id=eq.${id}`;
    headers = {
      "apikey": currentShop.key,
      "Authorization": `Bearer ${currentShop.key}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    };
  } else {
    url = `${currentShop.url}/api/${tableName}?id=eq.${id}`;
    headers = {
      "Authorization": `Bearer ${currentShop.key}`,
      "Content-Type": "application/json"
    };
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

function formatDateThai(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return "-";
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const pad = n => String(n).padStart(2, '0');
  const d = dateObj.getDate();
  const m = thaiMonths[dateObj.getMonth()];
  const y = dateObj.getFullYear() + 543;
  const time = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  return `${d} ${m} ${y} (${time} น.)`;
}

// ============================================================================
// 📦 Package Changer & Auto-Screen Count Synchronizer
// ============================================================================
let currentPkgModalGroupKey = null;
let currentPkgModalEmail = null;

function openChangePackageModal(groupKey, specificEmail = null) {
  haptic();
  currentPkgModalGroupKey = groupKey;
  currentPkgModalEmail = specificEmail;

  const group = appGroups[groupKey];
  if (!group) return;

  const modal = document.getElementById("modal-change-package");
  const titleEl = document.getElementById("change-pkg-modal-title");
  const subtitleEl = document.getElementById("change-pkg-modal-subtitle");
  const summaryEl = document.getElementById("change-pkg-accounts-summary");
  const listContainer = document.getElementById("change-pkg-list-container");
  if (!modal || !listContainer) return;

  const theme = getAppTheme(group.appName);
  titleEl.innerHTML = `<span>${theme.icon}</span> <span>เลือกประเภทแพ็กเกจ (${escapeHtml(group.appName)})</span>`;
  subtitleEl.textContent = `ระบบจะเปลี่ยนแพ็กเกจ และปรับเพิ่ม/ลดจำนวนจอ (div.screen-item) ตามการตั้งค่าอัตโนมัติ`;

  // Accounts summary
  const emailKeys = Object.keys(group.accountsByEmail);
  if (specificEmail) {
    summaryEl.innerHTML = `
      <div style="font-weight: 700; color: #fff;">👤 บัญชีเป้าหมาย:</div>
      <div style="font-family: monospace; font-size: 11.5px; color: #38bdf8; margin-top: 2px;">${escapeHtml(specificEmail)}</div>
    `;
  } else if (emailKeys.length === 1) {
    summaryEl.innerHTML = `
      <div style="font-weight: 700; color: #fff;">👤 บัญชีในกลุ่มนี้ (1 บัญชี):</div>
      <div style="font-family: monospace; font-size: 11.5px; color: #38bdf8; margin-top: 2px;">${escapeHtml(emailKeys[0])}</div>
    `;
  } else {
    summaryEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 700; color: #fff;">👥 บัญชีในกลุ่มนี้ (${emailKeys.length} บัญชี):</span>
        <span style="font-size: 10.5px; color: #94a3b8;">ใช้กับทุกบัญชีในกลุ่ม</span>
      </div>
      <div style="font-family: monospace; font-size: 11px; color: #94a3b8; margin-top: 4px; max-height: 48px; overflow-y: auto;">
        ${emailKeys.map(e => `• ${escapeHtml(e)}`).join("<br>")}
      </div>
    `;
  }

  // Filter packages for this app
  const appPkgs = rawPackages.filter(p => p.app_id === group.appId);

  if (appPkgs.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: var(--text-dim); font-size: 12.5px;">
        ⚠️ ไม่พบรายการประเภทแพ็กเกจสำหรับแอป ${escapeHtml(group.appName)} ในระบบ
      </div>
    `;
  } else {
    listContainer.innerHTML = appPkgs.map(pkg => {
      const screens = pkg.screens || 1;
      const isCurrent = group.pkgName && (group.pkgName.trim() === (pkg.name || "").trim());
      const days = pkg.days || 30;
      return `
        <div class="pkg-picker-card ${isCurrent ? 'current-active' : ''}" 
             data-pkg-id="${escapeHtml(pkg.id)}" 
             data-pkg-name="${escapeHtml(pkg.name)}" 
             data-pkg-screens="${screens}">
          <div class="pkg-picker-top">
            <span class="pkg-picker-name">${escapeHtml(pkg.name)}</span>
            ${isCurrent ? `<span class="pkg-current-badge">✓ ใช้อยู่</span>` : `<span class="pkg-action-hint">เลือก ➔</span>`}
          </div>
          <div class="pkg-picker-meta-row">
            <span class="pkg-meta-badge screens-badge">
              <span>🔢</span> <span>${screens} จอ</span>
            </span>
            <span class="pkg-meta-badge days-badge">
              <span>📅</span> <span>${days} วัน</span>
            </span>
            ${pkg.price ? `
              <span class="pkg-meta-badge price-badge">
                <span>฿</span><span>${pkg.price}</span>
              </span>
            ` : ''}
          </div>
        </div>
      `;
    }).join("");
  }

  modal.style.display = "flex";
}

function closeChangePackageModal() {
  const modal = document.getElementById("modal-change-package");
  if (modal) modal.style.display = "none";
  currentPkgModalGroupKey = null;
  currentPkgModalEmail = null;
}

async function applyPackageChange(targetPkgId, targetPkgName, targetScreensCount) {
  if (!currentPkgModalGroupKey) return;
  const group = appGroups[currentPkgModalGroupKey];
  if (!group) return;

  const specificEmail = currentPkgModalEmail;
  const emailsToUpdate = specificEmail ? [specificEmail] : Object.keys(group.accountsByEmail);

  closeChangePackageModal();
  haptic();
  showToast(`⏳ กำลังเปลี่ยนแพ็กเกจเป็น "${targetPkgName}" (${targetScreensCount} จอ)...`);

  try {
    for (const email of emailsToUpdate) {
      await updateSingleAccountPackageAndScreens(group.appId, email, targetPkgId, targetPkgName, targetScreensCount);
    }

    showToast(`🟢 เปลี่ยนแพ็กเกจเป็น "${targetPkgName}" (${targetScreensCount} จอ) เรียบร้อย! ✨`);
    await loadData(true);
    selectChip(group.appId);
  } catch (err) {
    console.error("Change package error:", err);
    showToast("❌ เปลี่ยนแพ็กเกจไม่สำเร็จ: " + err.message);
  }
}

async function updateSingleAccountPackageAndScreens(appId, email, targetPkgId, targetPkgName, targetScreensCount) {
  const emailLower = (email || "").toLowerCase().trim();

  // 1. Find all account records for this email and appId
  const accountProfiles = allAccountsList.filter(a =>
    a.app_id === appId && (a.email || "").toLowerCase().trim() === emailLower
  );

  if (accountProfiles.length === 0) {
    console.warn(`No account profiles found for ${email}`);
    return;
  }

  const firstAcc = accountProfiles[0];
  const password = firstAcc.password || "";
  const expiry = firstAcc.expiry_date || null;
  const supplierUrl = firstAcc.supplier_url || null;
  const cookieData = firstAcc.cookie_data || null;

  // 2. Update package_id on all existing records of this account
  for (const prof of accountProfiles) {
    if (prof.package_id !== targetPkgId) {
      await patchDatabase("accounts", prof.id, {
        package_id: targetPkgId
      });
      prof.package_id = targetPkgId;
    }
  }

  // 3. Screen count adjustments matching targetScreensCount
  const currentCount = accountProfiles.length;

  if (currentCount < targetScreensCount) {
    // Need to insert missing screens
    const needed = targetScreensCount - currentCount;

    const existingNumbers = new Set(
      accountProfiles.map(p => {
        const m = (p.profile_name || "").match(/\d+/);
        return m ? parseInt(m[0], 10) : 0;
      })
    );

    const appObj = rawApps.find(a => a.id === appId);
    const isNetflix = appObj && (appObj.name || "").toLowerCase().includes("netflix");

    let maxDisplayId = allAccountsList.reduce((m, a) => Math.max(m, Number(a.display_id) || 0), 3500);
    let nextDisplayId = Math.max(maxDisplayId, 3512) + 1;

    let nextScreenNum = 1;
    const newRecords = [];

    for (let i = 0; i < needed; i++) {
      while (existingNumbers.has(nextScreenNum)) {
        nextScreenNum++;
      }
      existingNumbers.add(nextScreenNum);

      const isTv = isNetflix ? (nextScreenNum > 4) : false;

      newRecords.push({
        app_id: appId,
        package_id: targetPkgId,
        email: firstAcc.email,
        password: password,
        profile_name: `จอ ${nextScreenNum}`,
        pin_code: null,
        device_type: isTv ? "tv" : "mobile",
        expiry_date: expiry,
        status: "available",
        supplier_url: supplierUrl,
        cookie_data: cookieData,
        display_id: nextDisplayId++
      });
    }

    if (newRecords.length > 0) {
      let insertRes;
      if (currentShop.type === "supabase") {
        insertRes = await fetch(`${currentShop.url}/rest/v1/accounts`, {
          method: "POST",
          headers: {
            "apikey": currentShop.key,
            "Authorization": `Bearer ${currentShop.key}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify(newRecords)
        });
      } else {
        insertRes = await fetch(`${currentShop.url}/api/accounts`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${currentShop.key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(newRecords)
        });
      }

      if (!insertRes.ok) {
        throw new Error(await insertRes.text() || `Insert screens error ${insertRes.status}`);
      }
    }
  } else if (currentCount > targetScreensCount) {
    // Need to reduce available screens down to targetScreensCount
    const excess = currentCount - targetScreensCount;

    const sortedProfiles = [...accountProfiles].sort((x, y) => {
      const xNum = parseInt((x.profile_name || "").replace(/\D/g, ""), 10) || 0;
      const yNum = parseInt((y.profile_name || "").replace(/\D/g, ""), 10) || 0;
      return yNum - xNum;
    });

    let deletedCount = 0;
    for (const prof of sortedProfiles) {
      if (deletedCount >= excess) break;
      if (prof.status === "available") {
        await deleteAccountRecord(prof.id);
        deletedCount++;
      }
    }
  }
}

async function deleteAccountRecord(id) {
  try {
    if (currentShop.type === "supabase") {
      await fetch(`${currentShop.url}/rest/v1/customer_bindings?account_id=eq.${id}`, {
        method: "PATCH",
        headers: {
          "apikey": currentShop.key,
          "Authorization": `Bearer ${currentShop.key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ account_id: null })
      });
    } else {
      await fetch(`${currentShop.url}/api/customer_bindings?account_id=eq.${id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${currentShop.key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ account_id: null })
      });
    }
  } catch (e) {
    // Ignore binding patch error
  }

  let url, headers;
  if (currentShop.type === "supabase") {
    url = `${currentShop.url}/rest/v1/accounts?id=eq.${id}`;
    headers = {
      "apikey": currentShop.key,
      "Authorization": `Bearer ${currentShop.key}`
    };
  } else {
    url = `${currentShop.url}/api/accounts?id=eq.${id}`;
    headers = {
      "Authorization": `Bearer ${currentShop.key}`
    };
  }

  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    console.warn(`Delete account record ${id} error:`, await res.text());
  }
}

// ============================================================================
// 🚀 PHASE 1: Send & Bind Screen with Auto-Rename Customer Name Generator
// ============================================================================

let currentSendBindContext = null;

// 1. Generator for random customer name in LINE OA Auto-rename format (18 characters)
function generateRandomCustomerName(length = 18) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 2. Generator that guarantees uniqueness against existing customer_bindings and accounts
function generateUniqueCustomerName(length = 18) {
  const existingNames = new Set();
  if (Array.isArray(rawBindings)) {
    rawBindings.forEach(b => {
      if (b && b.customer_name) existingNames.add(b.customer_name.trim().toUpperCase());
    });
  }
  if (Array.isArray(allAccountsList)) {
    allAccountsList.forEach(a => {
      if (a && a.customer_id) existingNames.add(a.customer_id.trim().toUpperCase());
    });
  }

  let name = '';
  let attempts = 0;
  do {
    name = generateRandomCustomerName(length);
    attempts++;
  } while (existingNames.has(name) && attempts < 200);

  return name;
}

// 2.5 Populate Datalist with existing customer names for autocomplete
function populateCustomerDatalist() {
  const datalist = document.getElementById("send-bind-customer-datalist");
  if (!datalist) return;
  const uniqueNames = new Set();
  if (Array.isArray(rawBindings)) {
    rawBindings.forEach(b => {
      if (b && b.customer_name) {
        const nm = b.customer_name.trim();
        if (nm) uniqueNames.add(nm);
      }
    });
  }
  if (Array.isArray(allAccountsList)) {
    allAccountsList.forEach(a => {
      if (a && a.customer_id) {
        const nm = a.customer_id.trim();
        if (nm) uniqueNames.add(nm);
      }
    });
  }
  const sorted = Array.from(uniqueNames).sort((a, b) => a.localeCompare(b, 'th'));
  datalist.innerHTML = sorted.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

// 3. Uniqueness and format validator
function checkCustomerNameStatus(name) {
  if (!name || !name.trim()) {
    return { valid: false, message: 'พิมพ์ชื่อลูกค้าเก่า หรือกดสุ่มชื่อลูกค้าใหม่ 🎲', color: '#94a3b8' };
  }
  const clean = name.trim().toUpperCase();
  const existingBindings = (rawBindings || []).filter(b => b.customer_name && b.customer_name.trim().toUpperCase() === clean);
  const existingAccounts = (allAccountsList || []).filter(a => a.customer_id && a.customer_id.trim().toUpperCase() === clean);
  const totalExisting = existingBindings.length + existingAccounts.length;

  if (totalExisting > 0) {
    const activeCount = existingBindings.filter(b => !b.reverted).length;
    const badgeText = activeCount > 0 ? `${activeCount} รายการผูกสิทธิ์` : `มีประวัติในระบบ`;
    return { valid: true, isExisting: true, message: `👥 ลูกค้าเก่าในระบบ (${badgeText}) • พร้อมผูกเพิ่ม`, color: '#38bdf8' };
  }

  const isAutoRenameFormat = /^[A-Z0-9]{16,20}$/.test(clean);
  if (isAutoRenameFormat) {
    return { valid: true, isAutoRename: true, message: '✅ รหัส Auto-Rename LINE OA (18 หลัก) • ลูกค้าใหม่', color: '#34d399' };
  }
  return { valid: true, isAutoRename: false, message: '✨ ชื่อลูกค้าใหม่ • พร้อมผูกสิทธิ์', color: '#10b981' };
}

// 4. Open Send & Bind Modal
function openSendBindModal(screenDataset, btnEl = null) {
  haptic();

  let targetAcc = null;
  if (screenDataset.accountId) {
    targetAcc = allAccountsList.find(a => String(a.id) === String(screenDataset.accountId));
  }
  if (!targetAcc && screenDataset.email) {
    targetAcc = allAccountsList.find(a => 
      (a.email || '').trim().toLowerCase() === (screenDataset.email || '').trim().toLowerCase() &&
      (a.profile_name || '').trim() === (screenDataset.screenName || '').trim()
    );
  }

  const accountId = targetAcc ? targetAcc.id : screenDataset.accountId;
  const appName = screenDataset.appName || (targetAcc ? targetAcc.app_name : 'App');
  const appId = screenDataset.appId || (targetAcc ? targetAcc.app_id : null);
  const email = screenDataset.email || (targetAcc ? targetAcc.email : '-');
  const password = screenDataset.password || (targetAcc ? targetAcc.password : '-');
  const screenName = screenDataset.screenName || (targetAcc ? targetAcc.profile_name : 'จอว่าง');
  const pinTxt = screenDataset.pinTxt || (targetAcc && targetAcc.pin_code ? `🔒 PIN: ${targetAcc.pin_code}` : '🔓 ไม่มี PIN');
  const pinCode = screenDataset.pinCode || (targetAcc ? targetAcc.pin_code : '');
  const expiry = screenDataset.expiry || (targetAcc ? targetAcc.expiry_date : '-');
  const screenId = screenDataset.screenId || (targetAcc ? (targetAcc.display_id || targetAcc.id) : '');
  const pkgName = screenDataset.pkgName || (targetAcc ? targetAcc.package_name : '');
  const deviceType = screenDataset.deviceType || (targetAcc ? targetAcc.device_type : 'มือถือ / PC');

  currentSendBindContext = {
    accountId,
    appName,
    appId,
    email,
    password,
    screenName,
    pinTxt,
    pinCode,
    expiry,
    screenId,
    pkgName,
    deviceType,
    targetAcc,
    btnEl
  };

  const modal = document.getElementById("modal-send-bind-screen");
  const previewEl = document.getElementById("send-bind-screen-preview");
  const nameInput = document.getElementById("send-bind-customer-name");
  const daysInput = document.getElementById("send-bind-days");
  const priceInput = document.getElementById("send-bind-price");
  const deviceSelect = document.getElementById("send-bind-device");

  if (!modal || !nameInput) return;

  const appTheme = getAppTheme(appName);
  const cleanId = (screenId && screenId !== "-" && screenId !== "undefined") ? String(screenId).trim().replace(/^#/, '') : "";

  previewEl.innerHTML = `
    <div class="send-bind-screen-header">
      <span class="send-bind-app-tag" style="color: ${appTheme.color || '#38bdf8'};">
        <span>${appTheme.icon}</span>
        <span>${escapeHtml(appName)}</span>
      </span>
      <div class="send-bind-screen-badges">
        <span class="send-bind-badge slot">📺 ${escapeHtml(screenName || 'จอว่าง')}</span>
        ${cleanId ? `<span class="send-bind-badge id">🆔 #${escapeHtml(cleanId)}</span>` : ''}
      </div>
    </div>
    <div class="send-bind-screen-details">
      <div class="detail-row">
        <span>📧 อีเมล:</span>
        <span class="detail-val">${escapeHtml(email)}</span>
      </div>
      <div class="detail-row">
        <span>🔑 รหัสผ่าน:</span>
        <span class="detail-val">${escapeHtml(password)}</span>
      </div>
      <div class="detail-row">
        <span>${pinTxt.includes('PIN') ? '🔒' : '🔓'}</span>
        <span class="detail-val">${escapeHtml(pinTxt)}</span>
      </div>
      ${pkgName ? `
        <div class="detail-row">
          <span>📦 แพ็กเกจ:</span>
          <span style="color: #cbd5e1; font-weight: 600;">${escapeHtml(pkgName)}</span>
        </div>
      ` : ''}
    </div>
  `;

  // Populate datalist with existing customer names for autocomplete
  populateCustomerDatalist();

  // Reset to empty for existing customer input, ready for user typing
  nameInput.value = "";
  updateCustomerNameStatusDisplay("");

  // Auto-focus input so user can start typing immediately
  setTimeout(() => {
    try {
      nameInput.focus();
    } catch (e) {}
  }, 100);

  // Set default days
  const defaultDays = getPackageDays(pkgName, appId) || 30;
  daysInput.value = defaultDays;
  updateQuickDayChips(defaultDays);

  // Set price
  let defaultPrice = 0;
  if (rawPackages && rawPackages.length > 0) {
    const pkg = rawPackages.find(p => p.name === pkgName && (!appId || p.app_id === appId)) || rawPackages.find(p => p.name === pkgName);
    if (pkg && pkg.price) defaultPrice = pkg.price;
  }
  priceInput.value = defaultPrice;

  // Set device
  if (deviceSelect) {
    const isTv = (deviceType && (deviceType.toLowerCase().includes('tv') || deviceType.includes('ทีวี'))) ||
                 (screenName && (screenName.toLowerCase().includes('tv') || /จอ\s*5/.test(screenName)));
    deviceSelect.value = isTv ? "สมาร์ททีวี" : (deviceType || "มือถือ / PC");
  }

  // Reset confirm button state
  const confirmBtn = document.getElementById("btn-confirm-send-bind");
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<span>🚀</span><span>ผูกสิทธิ์ & ตัดสต็อก (พร้อมก็อปสคริปต์)</span>`;
  }

  modal.style.display = "flex";
}

function closeSendBindModal() {
  const modal = document.getElementById("modal-send-bind-screen");
  if (modal) modal.style.display = "none";
  currentSendBindContext = null;
}

function updateCustomerNameStatusDisplay(name) {
  const statusEl = document.getElementById("send-bind-name-status");
  if (!statusEl) return;
  const status = checkCustomerNameStatus(name);
  statusEl.textContent = status.message;
  statusEl.style.color = status.color;
}

function updateQuickDayChips(selectedDays) {
  document.querySelectorAll(".btn-quick-day-chip").forEach(chip => {
    const chipDays = parseInt(chip.dataset.days, 10);
    if (chipDays === parseInt(selectedDays, 10)) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
}

function buildUnifiedHandoverText(customerName, context, days, expiryDateObj, device) {
  const webappUrl = `https://rangoo-liff-app.vercel.app/c/?c=${encodeURIComponent(customerName)}`;
  const cleanId = (context.screenId && context.screenId !== "-" && context.screenId !== "undefined")
    ? String(context.screenId).trim().replace(/^#/, '')
    : "";
  const headerTitle = cleanId
    ? `🎬 *${(context.appName || '').toUpperCase()}* #${cleanId}`
    : `🎬 *${(context.appName || '').toUpperCase()}*`;

  const cleanScreenName = (context.screenName || "จอว่าง").trim();
  const formattedProfile = cleanScreenName.startsWith("🟢") ? cleanScreenName : `🟢 ${cleanScreenName}`;
  const cleanPin = (context.pinTxt || "🔓 ไม่มี PIN").trim().replace(/^🔢\s*/, "");
  const expStr = formatDateThai(expiryDateObj);

  const isNetflix = (context.appName || '').toLowerCase().includes("netflix");
  const isWrongPassword = isNetflix && (
    context.isWrongPassword ||
    context.problemType === "wrong_password" ||
    context.targetAcc?.problemType === "wrong_password" ||
    (typeof context.password === "string" && (context.password.includes("OTP") || context.password.includes("แอดมิน")))
  );
  const passwordDisplay = isWrongPassword ? "เข้าระบบแบบ OTP ได้จากแอดมิน" : context.password;

  let script = `${headerTitle}\n`;
  script += `[${context.pkgName || `แพ็กเกจ ${days} วัน`}]\n`;
  script += `━━━━━━━━━━━━━━━━━━━━━\n`;
  script += `👤 คุณ: *${customerName}*\n`;
  script += `📧 อีเมล: ${context.email}\n`;
  script += `🔑 รหัสผ่าน: ${passwordDisplay}\n`;
  script += `👤 โปรไฟล์/จอ: ${formattedProfile}\n`;
  script += `🔢 ${cleanPin}\n`;
  script += `📱 อุปกรณ์: ${device}\n`;
  if (expStr !== "-") {
    script += `📅 วันหมดอายุ: ${expStr}\n`;
  }
  script += `━━━━━━━━━━━━━━━━━━━━━\n`;
  script += `📱 ตรวจสอบสิทธิ์ & รับรหัส OTP ใน WebApp:\n${webappUrl}\n`;
  script += `━━━━━━━━━━━━━━━━━━━━━\n`;
  script += `🙏 ขอบคุณที่ใช้บริการครับ เข้าใช้งานได้ทันทีเลยครับ ✨`;
  return script;
}

async function executeConfirmSendBind() {
  if (!currentSendBindContext) return;
  haptic();

  const nameInput = document.getElementById("send-bind-customer-name");
  const customerName = (nameInput.value || "").trim().toUpperCase();
  if (!customerName) {
    showToast("⚠️ โปรดระบุชื่อลูกค้าก่อนผูกสิทธิ์ (พิมพ์ชื่อลูกค้าเก่า หรือกดสุ่มชื่อใหม่)", "warning");
    nameInput.focus();
    return;
  }

  const days = parseInt(document.getElementById("send-bind-days").value, 10) || 30;
  const price = parseFloat(document.getElementById("send-bind-price").value) || 0;
  const device = document.getElementById("send-bind-device").value || "มือถือ / PC";

  const confirmBtn = document.getElementById("btn-confirm-send-bind");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span>⏳</span><span>กำลังผูกสิทธิ์ & บันทึกระบบ...</span>`;
  }

  try {
    const expiryDateObj = new Date();
    expiryDateObj.setDate(expiryDateObj.getDate() + days);
    expiryDateObj.setHours(23, 59, 0, 0);

    const pad = (num) => String(num).padStart(2, '0');
    const offsetHours = Math.abs(Math.floor(expiryDateObj.getTimezoneOffset() / 60));
    const offsetMinutes = Math.abs(expiryDateObj.getTimezoneOffset() % 60);
    const offsetSign = expiryDateObj.getTimezoneOffset() <= 0 ? "+" : "-";
    const formattedExpiry = `${expiryDateObj.getFullYear()}-${pad(expiryDateObj.getMonth() + 1)}-${pad(expiryDateObj.getDate())}T23:59:00${offsetSign}${pad(offsetHours)}:${pad(offsetMinutes)}`;

    const rawAccountData = `📧 อีเมล: ${currentSendBindContext.email}\n🔑 รหัสผ่าน: ${currentSendBindContext.password}` +
      `${currentSendBindContext.screenName ? `\n👤 โปรไฟล์: ${currentSendBindContext.screenName}` : ''}` +
      `${currentSendBindContext.pinCode ? `\n🔒 รหัส PIN: ${currentSendBindContext.pinCode}` : ''}`;

    const bindingPayload = {
      customer_name: customerName,
      chat_url: "https://chat.line.biz/",
      app_name: currentSendBindContext.appName || "App",
      package_name: currentSendBindContext.pkgName || `แพ็กเกจ ${days} วัน`,
      days: days,
      expiry_date: formattedExpiry,
      device_type: device,
      raw_account_data: rawAccountData,
      account_id: currentSendBindContext.accountId || null,
      price_paid: price,
      reverted: false
    };

    if (currentSendBindContext.targetAcc) {
      if (currentSendBindContext.targetAcc.supplier_order_id) {
        bindingPayload.supplier_order_id = currentSendBindContext.targetAcc.supplier_order_id;
      }
      if (currentSendBindContext.targetAcc.supplier_url) {
        bindingPayload.supplier_url = currentSendBindContext.targetAcc.supplier_url;
      }
    }

    // 1. Insert into customer_bindings
    await insertDatabase("customer_bindings", bindingPayload);

    // 2. Patch accounts row to 'used'
    if (currentSendBindContext.accountId) {
      await patchDatabase("accounts", currentSendBindContext.accountId, {
        status: "used",
        customer_id: customerName,
        sold_at: new Date().toISOString(),
        expiry_date: formattedExpiry
      });
    }

    // 3. Build & copy handover message with customer webapp link
    const deliveryScript = buildUnifiedHandoverText(customerName, currentSendBindContext, days, expiryDateObj, device);
    await copyToClipboard(deliveryScript);

    // 4. Close modal & celebrate
    closeSendBindModal();
    showToast(`🎉 ผูกสิทธิ์คุณ ${customerName} สำเร็จ & คัดลอกสคริปต์ส่งมอบแล้ว!`);

    // 5. Seamlessly reload data to reflect the changes
    await loadData(true);

  } catch (err) {
    console.error("Binding error:", err);
    showToast(`❌ ผูกสิทธิ์ล้มเหลว: ${err.message || 'โปรดตรวจสอบการเชื่อมต่อ'}`, "error");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `<span>🚀</span><span>ผูกสิทธิ์ & ตัดสต็อก (พร้อมก็อปสคริปต์)</span>`;
    }
  }
}

async function executeSendBindCopyOnly() {
  if (!currentSendBindContext) return;
  haptic();

  const nameInput = document.getElementById("send-bind-customer-name");
  const customerName = (nameInput.value || "").trim().toUpperCase() || "ลูกค้า";
  const days = parseInt(document.getElementById("send-bind-days").value, 10) || 30;
  const device = document.getElementById("send-bind-device").value || "มือถือ / PC";

  const expiryDateObj = new Date();
  expiryDateObj.setDate(expiryDateObj.getDate() + days);
  expiryDateObj.setHours(23, 59, 0, 0);

  const deliveryScript = buildUnifiedHandoverText(customerName, currentSendBindContext, days, expiryDateObj, device);
  await copyToClipboard(deliveryScript);

  closeSendBindModal();
  showToast(`📋 คัดลอกสคริปต์ส่งมอบเรียบร้อย (ไม่ได้ตัดสต็อก)`);
}

async function executeCopyCustomerName() {
  haptic();
  const nameInput = document.getElementById("send-bind-customer-name");
  const nameVal = (nameInput.value || "").trim().toUpperCase();
  if (!nameVal) {
    showToast("⚠️ โปรดพิมพ์ชื่อลูกค้า หรือกดสุ่มชื่อก่อน", "warning");
    nameInput.focus();
    return;
  }
  await copyToClipboard(nameVal);

  const btn = document.getElementById("btn-send-bind-copy-name");
  if (btn) {
    const origHtml = btn.innerHTML;
    btn.innerHTML = `<span>✅</span><span>คัดลอกชื่อแล้ว!</span>`;
    setTimeout(() => { btn.innerHTML = origHtml; }, 1500);
  }

  showToast(`📋 คัดลอกชื่อ "${nameVal}" เรียบร้อย! นำไปเปลี่ยนชื่อใน LINE OA ได้ทันที`);
}

function executeRandomizeCustomerName() {
  haptic();
  const newName = generateUniqueCustomerName(18);
  const nameInput = document.getElementById("send-bind-customer-name");
  if (nameInput) {
    nameInput.value = newName;
    updateCustomerNameStatusDisplay(newName);
    nameInput.focus();
  }
  showToast(`🎲 สุ่มชื่อใหม่ 18 หลัก: ${newName}`);
}




