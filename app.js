// ⚡ BOSS Premium (shop_rangoo) LIFF Customer Web App Core Logic
const CONFIG = {
  LIFF_ID: "2010909658-zc9CaFLN",
  SUPABASE_URL: "https://teeporxvxrwzwmnsnjyw.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZXBvcnh2eHJ3endtbnNuanl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDU3NjcxMCwiZXhwIjoyMTAwMTUyNzEwfQ.Bgjp3EEFzRYAolKKb485LaRdShztnKJj3g7EDC8zGkk",
  ADMIN_NAMES: ["boss", "ร้านกู", "admin", "เจ้าของร้าน"], // Auto-detect admin users
  ADMIN_PASSCODES: ["B5HU8T37C1ESHCFDDW", "b5hu8t37c1eshcfddw"], // Secret Admin Passcodes for Full Unlock
  LINE_OA_LINK: "https://line.me/R/ti/p/@676aljmg",
  LINE_OA_HANDLE: "@676aljmg"
};

// Initialize Supabase JS Client for Realtime WebSocket
if (window.supabase) {
  try {
    window.supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  } catch (e) {
    console.warn("Failed to init Supabase client:", e);
  }
}
let currentUser = {
  userId: null,
  displayName: "ผู้ใช้งานทั่วไป",
  pictureUrl: "https://ui-avatars.com/api/?name=BOSS+Customer&background=0284c7&color=fff",
  isAuthenticated: false,
  isAdmin: false
};

let userBindings = [];
let allShopBindings = [];
let catalogApps = [];
let catalogPackages = [];
let visiblePasswordsMap = {}; // Map of subId -> boolean (state for password visibility toggle)
let customLookupQuery = "";   // Manual lookup query for LINE OA internal customer IDs or LINE User IDs
let adminViewMode = "customer"; // Default view mode is CUSTOMER VIEW!
let activeCatalogCategory = "all";
let activePurchaseApp = null;
let selectedPackageObj = null;
let selectedOrderType = "new";
let selectedDeviceType = "mobile";
let selectedSortOption = "default";
let lastOrderSummaryText = "";
let promotionsData = [];

// Helper: Call Supabase REST API
async function supabaseFetch(endpoint, options = {}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error("ERR_INTERNET_DISCONNECTED");
  }

  const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    "apikey": CONFIG.SUPABASE_KEY,
    "Authorization": `Bearer ${CONFIG.SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...options.headers
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase API Error ${res.status}: ${errText}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      console.error("[Supabase Fetch Error]", err.message || err);
    }
    throw err;
  }
}

// Real-Time Flash Sale Digital Countdown Timer
let flashSaleTimerInterval = null;
function startFlashSaleCountdown() {
  if (flashSaleTimerInterval) return;
  let totalSeconds = 3 * 3600 + 45 * 60 + 18;
  flashSaleTimerInterval = setInterval(() => {
    if (totalSeconds <= 0) totalSeconds = 12 * 3600;
    totalSeconds--;
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');

    const elHH = document.getElementById("flash-timer-hh");
    const elMM = document.getElementById("flash-timer-mm");
    const elSS = document.getElementById("flash-timer-ss");
    if (elHH) elHH.textContent = hh;
    if (elMM) elMM.textContent = mm;
    if (elSS) elSS.textContent = ss;
  }, 1000);
}

// 1. Initialize Application with Optional LIFF Login & Direct Customer Code Routing
async function initLiff() {
  console.log("[BOSS App] Initializing WebApp Core...");
  startFlashSaleCountdown();
  loadCachedSubscriptionsAndPromos();
  initPullToRefresh();

  // Extract Customer Code / ID / CID from URL (Supports ?id=, ?code=, ?c=, ?name=, ?cid=, ?chat_id=, #hash, or /path)
  const urlParams = new URLSearchParams(window.location.search);
  const hashKey = window.location.hash ? window.location.hash.replace('#', '').trim() : "";

  let paramCode = urlParams.get('id') ||
    urlParams.get('code') ||
    urlParams.get('c') ||
    urlParams.get('name') ||
    urlParams.get('cid') ||
    urlParams.get('chat_id') ||
    hashKey || "";

  // Support direct URL path e.g. https://rangoo-liff-app.vercel.app/B5HU8T37C1ESHCFDDW
  if (!paramCode) {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || "";
    if (/^[A-Za-z0-9_-]{15,35}$/.test(lastPart) && !lastPart.includes('.html')) {
      paramCode = lastPart;
    }
  }

  if (paramCode) {
    paramCode = paramCode.trim();
    console.log("[Customer Ref Tracking] Found Customer Code in URL:", paramCode);
    localStorage.setItem("boss_customer_code", paramCode);
    localStorage.setItem("boss_customer_cid", paramCode);
  }

  // Soft LIFF initialization (NO MANDATORY LOGIN BLOCKING, WORKS IN ANY BROWSER)
  try {
    if (window.liff) {
      await liff.init({ liffId: CONFIG.LIFF_ID });

      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        currentUser.userId = profile.userId;
        currentUser.displayName = profile.displayName;
        if (profile.pictureUrl) currentUser.pictureUrl = profile.pictureUrl;
        currentUser.isAuthenticated = true;

        const dNameLower = (profile.displayName || "").toLowerCase().trim();
        currentUser.isAdmin = CONFIG.ADMIN_NAMES.some(name => dNameLower.includes(name));
      }
    }
  } catch (err) {
    console.warn("[BOSS App] LIFF optional init info:", err.message);
  }

  // Load saved profile data if present
  try {
    const raw = localStorage.getItem("boss_user_profile");
    if (raw) {
      const savedProfile = JSON.parse(raw);
      if (savedProfile && savedProfile.displayName) {
        currentUser.displayName = savedProfile.displayName;
      }
    }
  } catch (e) { }

  // Master Admin Passcode Unlock Check (?id=B5HU8T37C1ESHCFDDW or saved in storage)
  const isMasterAdminId = CONFIG.ADMIN_PASSCODES.some(key => (paramCode || "").toUpperCase().trim() === key.toUpperCase());
  if (isMasterAdminId || localStorage.getItem("boss_admin_unlocked") === "true") {
    console.log("[BOSS App] 👑 Master Admin Mode UNLOCKED via Passcode:", paramCode || "cached");
    currentUser.isAdmin = true;
    currentUser.isAuthenticated = true;
    adminViewMode = "all";
    localStorage.setItem("boss_admin_unlocked", "true");
    if (!currentUser.displayName || currentUser.displayName === "ผู้ใช้งานทั่วไป") {
      currentUser.displayName = "ผู้ดูแลระบบ (Admin)";
    }
  }

  // Update Profile UI Header
  const activeCustomerCode = localStorage.getItem("boss_customer_code") || paramCode || "";
  if (currentUser.displayName) {
    document.getElementById("user-name").textContent = currentUser.displayName;
  } else if (activeCustomerCode) {
    document.getElementById("user-name").textContent = `รหัสลูกค้า: ${activeCustomerCode}`;
  } else {
    document.getElementById("user-name").textContent = "ผู้ใช้งานทั่วไป";
  }

  if (currentUser.pictureUrl) {
    document.getElementById("user-avatar").src = currentUser.pictureUrl;
  }

  renderUserIdInspector();
  renderAdminBadge();
  initProfileModal();
  await loadAppData();

  if (isMasterAdminId) {
    showToast("👑 ปลดล็อกฟังก์ชันผู้ดูแลระบบ (Admin) ทั้งหมดเรียบร้อยแล้ว!", "success");
  }
}

// Local Cache Instant Rendering
function loadCachedSubscriptionsAndPromos() {
  try {
    const cachedSubs = localStorage.getItem("boss_cached_user_bindings");
    if (cachedSubs) {
      const parsed = JSON.parse(cachedSubs);
      if (Array.isArray(parsed) && parsed.length > 0) {
        userBindings = parsed;
        renderSubscriptions();
      }
    }
  } catch (err) {
    console.warn("Failed to load cached bindings:", err);
  }
}

// Pull to Refresh Implementation
let touchStartY = 0;
let isPulling = false;
let pullIndicator = null;

function initPullToRefresh() {
  if (pullIndicator) return;
  pullIndicator = document.createElement("div");
  pullIndicator.id = "pull-to-refresh-indicator";
  pullIndicator.className = "pull-refresh-box";
  pullIndicator.innerHTML = `
    <div class="pull-refresh-spinner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
      </svg>
    </div>
    <span class="pull-refresh-label">ดึงลงเพื่อรีเฟรช...</span>
  `;
  document.body.prepend(pullIndicator);

  window.addEventListener("touchstart", (e) => {
    if (window.scrollY === 0 && e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!isPulling || window.scrollY > 0) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;
    if (diff > 12) {
      const pullDist = Math.min(70, diff * 0.42);
      pullIndicator.style.transform = `translateX(-50%) translateY(${pullDist}px)`;
      pullIndicator.style.opacity = `${Math.min(1, pullDist / 40)}`;
      if (pullDist > 48) {
        pullIndicator.querySelector(".pull-refresh-label").textContent = "ปล่อยเพื่อรีเฟรชข้อมูล";
        pullIndicator.classList.add("ready");
      } else {
        pullIndicator.querySelector(".pull-refresh-label").textContent = "ดึงลงเพื่อรีเฟรช...";
        pullIndicator.classList.remove("ready");
      }
    }
  }, { passive: true });

  window.addEventListener("touchend", () => {
    if (!isPulling) return;
    isPulling = false;
    if (pullIndicator.classList.contains("ready")) {
      pullIndicator.classList.add("refreshing");
      pullIndicator.querySelector(".pull-refresh-label").textContent = "กำลังอัปเดตข้อมูล...";
      setTimeout(async () => {
        try {
          await loadAppData();
          showToast("🔄 อัปเดตข้อมูลล่าสุดเรียบร้อยแล้ว", "success");
        } catch (e) { }
        pullIndicator.style.transform = "translateX(-50%) translateY(0)";
        pullIndicator.style.opacity = "0";
        pullIndicator.className = "pull-refresh-box";
      }, 600);
    } else {
      pullIndicator.style.transform = "translateX(-50%) translateY(0)";
      pullIndicator.style.opacity = "0";
    }
  }, { passive: true });
}

// Calculate age from birthdate
function calculateAgeFromBirthdate(birthdateStr) {
  if (!birthdateStr) return "";
  const birthDate = new Date(birthdateStr);
  if (isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : "";
}

// Profile Modal Controller
function openProfileModal() {
  const modal = document.getElementById("profile-modal");
  if (!modal) return;

  const cachedCode = localStorage.getItem("boss_customer_code") || currentUser.userId || "ไม่ระบุ";
  const codeDisplay = document.getElementById("profile-modal-code-display");
  if (codeDisplay) codeDisplay.textContent = cachedCode;

  // Load saved profile data
  let savedProfile = {};
  try {
    const raw = localStorage.getItem("boss_user_profile");
    if (raw) savedProfile = JSON.parse(raw);
  } catch (e) { }

  const nameInput = document.getElementById("profile-display-name-input");
  const genderSelect = document.getElementById("profile-gender-select");
  const ageInput = document.getElementById("profile-age-input");
  const birthdateInput = document.getElementById("profile-birthdate-input");
  const statusBadge = document.getElementById("line-sync-badge");
  const statusText = document.getElementById("line-sync-status-text");

  if (nameInput) nameInput.value = savedProfile.displayName || (currentUser.displayName !== "ผู้ใช้งานทั่วไป" ? currentUser.displayName : "");
  if (genderSelect) genderSelect.value = savedProfile.gender || "unspecified";
  if (birthdateInput) birthdateInput.value = savedProfile.birthdate || "";
  if (ageInput) ageInput.value = savedProfile.age || calculateAgeFromBirthdate(savedProfile.birthdate) || "";

  if (savedProfile.isLineLinked || (window.liff && liff.isLoggedIn())) {
    if (statusBadge) {
      statusBadge.textContent = "ผูกแล้ว";
      statusBadge.style.background = "rgba(6, 199, 85, 0.25)";
      statusBadge.style.color = "#06C755";
    }
    if (statusText && (savedProfile.lineDisplayName || currentUser.displayName)) {
      statusText.textContent = `ผูกกับบัญชี LINE: ${savedProfile.lineDisplayName || currentUser.displayName}`;
    }
  }

  modal.classList.add("active");
}

// Sync Account with LINE Profile via LINE Login (LIFF SDK)
async function syncLineProfile() {
  const syncBtn = document.getElementById("btn-sync-line-profile");
  const syncText = document.getElementById("btn-sync-line-text");
  const statusBadge = document.getElementById("line-sync-badge");
  const statusText = document.getElementById("line-sync-status-text");

  if (!window.liff) {
    alert("⚠️ LIFF SDK ยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง");
    return;
  }

  // Check if logged in to LIFF
  if (!liff.isLoggedIn()) {
    console.log("[LINE Sync] User not logged in to LIFF. Redirecting to LINE Login...");
    // Use origin + pathname without query params to avoid LINE OAuth invalid redirect URI 400 error
    const cleanRedirectUrl = window.location.origin + window.location.pathname;
    liff.login({ redirectUri: cleanRedirectUrl });
    return;
  }

  try {
    if (syncText) syncText.textContent = "กำลังดึงข้อมูลบัญชีจาก LINE...";
    if (syncBtn) syncBtn.disabled = true;

    // Fetch Profile from LINE SDK
    const profile = await liff.getProfile();
    console.log("[LINE Sync Profile Success]", profile);

    currentUser.userId = profile.userId;
    currentUser.displayName = profile.displayName;
    if (profile.pictureUrl) currentUser.pictureUrl = profile.pictureUrl;
    currentUser.isAuthenticated = true;

    // Auto-fill form inputs
    const nameInput = document.getElementById("profile-display-name-input");
    if (nameInput) nameInput.value = profile.displayName;

    // Update Header avatar & display name immediately
    const userAvatar = document.getElementById("user-avatar");
    const userName = document.getElementById("user-name");
    if (userAvatar && profile.pictureUrl) userAvatar.src = profile.pictureUrl;
    if (userName) userName.textContent = profile.displayName;

    // Update status badge UI
    if (statusBadge) {
      statusBadge.textContent = "ผูกแล้ว";
      statusBadge.style.background = "rgba(6, 199, 85, 0.25)";
      statusBadge.style.color = "#06C755";
    }
    if (statusText) {
      statusText.textContent = `ผูกกับบัญชี LINE: ${profile.displayName} (ID: ${profile.userId.substring(0, 10)}...)`;
    }

    // Save LINE Profile into localStorage
    let savedProfile = {};
    try {
      const raw = localStorage.getItem("boss_user_profile");
      if (raw) savedProfile = JSON.parse(raw);
    } catch (e) { }

    savedProfile.displayName = profile.displayName;
    savedProfile.lineUserId = profile.userId;
    savedProfile.lineDisplayName = profile.displayName;
    savedProfile.linePictureUrl = profile.pictureUrl;
    savedProfile.lineStatusMessage = profile.statusMessage || "";
    savedProfile.isLineLinked = true;
    savedProfile.linkedAt = new Date().toISOString();

    localStorage.setItem("boss_user_profile", JSON.stringify(savedProfile));

    // Save/Update Supabase database tables: customers and customer_bindings
    const activeCode = localStorage.getItem("boss_customer_code") || localStorage.getItem("boss_customer_cid");
    if (activeCode) {
      // 1. Update customers table in Supabase
      try {
        await supabaseFetch(`customers?customer_id=eq.${activeCode}`, {
          method: "PATCH",
          body: JSON.stringify({
            customer_name: profile.displayName,
            line_user_id: profile.userId,
            line_display_name: profile.displayName,
            line_picture_url: profile.pictureUrl,
            line_status_message: profile.statusMessage || null
          })
        });
      } catch (e) { console.warn("[LINE Sync Supabase customers update warning]", e); }

      // 2. Update customer_bindings table in Supabase
      try {
        await supabaseFetch(`customer_bindings?customer_name=eq.${activeCode}`, {
          method: "PATCH",
          body: JSON.stringify({
            customer_name: profile.displayName
          })
        });
      } catch (e) { console.warn("[LINE Sync Supabase bindings update warning]", e); }
    }

    alert(`🟢 ดึงข้อมูลและผูกบัญชี LINE "${profile.displayName}" สำเร็จเรียบร้อย!`);

  } catch (err) {
    console.error("[LINE Sync Error]", err);
    alert("❌ เกิดข้อผิดพลาดในการดึงข้อมูลจาก LINE: " + err.message);
  } finally {
    if (syncText) syncText.textContent = "ดึงข้อมูลโปรไฟล์จาก LINE (LINE Login)";
    if (syncBtn) syncBtn.disabled = false;
  }
}

function initProfileModal() {
  const modal = document.getElementById("profile-modal");
  const closeBtn = document.getElementById("profile-modal-close-btn");
  const form = document.getElementById("profile-form");
  const birthdateInput = document.getElementById("profile-birthdate-input");
  const ageInput = document.getElementById("profile-age-input");
  const copyCodeBtn = document.getElementById("btn-copy-profile-code");
  const badgeEl = document.getElementById("user-profile-badge");
  const syncLineBtn = document.getElementById("btn-sync-line-profile");

  if (badgeEl) {
    badgeEl.onclick = openProfileModal;
  }

  if (syncLineBtn) {
    syncLineBtn.onclick = syncLineProfile;
  }

  if (closeBtn && modal) {
    closeBtn.onclick = () => modal.classList.remove("active");
  }

  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove("active");
    };
  }

  if (birthdateInput && ageInput) {
    birthdateInput.addEventListener("change", () => {
      const calcAge = calculateAgeFromBirthdate(birthdateInput.value);
      if (calcAge !== "") ageInput.value = calcAge;
    });
  }

  if (copyCodeBtn) {
    copyCodeBtn.onclick = () => {
      const code = localStorage.getItem("boss_customer_code") || currentUser.userId;
      if (code) copyToClipboard(code);
    };
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const displayName = document.getElementById("profile-display-name-input")?.value?.trim() || "";
      const gender = document.getElementById("profile-gender-select")?.value || "unspecified";
      const age = document.getElementById("profile-age-input")?.value || "";
      const birthdate = document.getElementById("profile-birthdate-input")?.value || "";

      let savedProfile = {};
      try {
        const raw = localStorage.getItem("boss_user_profile");
        if (raw) savedProfile = JSON.parse(raw);
      } catch (err) { }

      const profileData = {
        ...savedProfile,
        displayName,
        gender,
        age,
        birthdate,
        updatedAt: new Date().toISOString()
      };

      try {
        localStorage.setItem("boss_user_profile", JSON.stringify(profileData));
      } catch (err) { }

      // Update header display name
      if (displayName) {
        currentUser.displayName = displayName;
        const nameEl = document.getElementById("user-name");
        if (nameEl) nameEl.textContent = displayName;
      }

      // Try updating Supabase customers table if connected
      const activeCode = localStorage.getItem("boss_customer_code");
      if (activeCode) {
        try {
          await supabaseFetch(`customers?customer_id=eq.${activeCode}`, {
            method: "PATCH",
            body: JSON.stringify({
              customer_name: displayName || undefined,
              gender: gender !== "unspecified" ? gender : undefined,
              age: age ? parseInt(age) : undefined,
              birthdate: birthdate || undefined
            })
          });
        } catch (e) { }
      }

      alert("บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว!");
      if (modal) modal.classList.remove("active");
    };
  }
}

// Render Customer Code / LINE User ID in Profile Badge (Top Right)
function renderUserIdInspector() {
  const subtextEl = document.getElementById("user-id-subtext");
  const copyBtn = document.getElementById("user-id-copy-btn");
  const badgeEl = document.getElementById("user-profile-badge");

  const cachedCode = localStorage.getItem("boss_customer_code") || currentUser.userId || "";
  const idText = cachedCode ? `CODE: ${cachedCode.substring(0, 12)}...` : "คลิกค้นหารหัส";

  if (subtextEl) {
    subtextEl.textContent = idText;
    subtextEl.title = cachedCode || "ป้อนรหัสอ้างอิงลูกค้าเพื่อดูสิทธิ์";
  }

  if (badgeEl) {
    badgeEl.onclick = openProfileModal;
  }

  if (copyBtn) {
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      openProfileModal();
    };
  }
}

function renderAdminBadge() {
  let badge = document.getElementById("admin-mode-badge");

  if (!badge) {
    badge = document.createElement("div");
    badge.id = "admin-mode-badge";
    badge.className = "admin-mode-badge-container";
    const banner = document.querySelector(".welcome-banner");
    if (banner && banner.parentNode) {
      banner.parentNode.insertBefore(badge, banner.nextSibling);
    }
  }

  if (badge && currentUser.isAdmin) {
    badge.style.display = "flex";
    badge.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span style="font-size: 11px; font-weight: 700; color: #fef08a; display: inline-flex; align-items: center; gap: 5px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path></svg>
          โหมดผู้ดูแลระบบ (Admin)
        </span>
        <select id="admin-view-toggle" class="admin-select-pill">
          <option value="customer" ${adminViewMode === 'customer' ? 'selected' : ''}>มุมมองลูกค้า (ระบุตัวตนแม่นยำ 100%)</option>
          <option value="all" ${adminViewMode === 'all' ? 'selected' : ''}>ดูทุกบัญชีในร้าน (${allShopBindings.length} รายการ)</option>
        </select>
      </div>
    `;

    setTimeout(() => {
      const toggle = document.getElementById("admin-view-toggle");
      if (toggle) {
        toggle.addEventListener("change", (e) => {
          adminViewMode = e.target.value;
          loadAppData();
        });
      }
    }, 50);
  } else if (badge) {
    badge.style.display = "none";
  }

  // Toggle Admin Manage Promos Button Visibility
  const adminPromoBtn = document.getElementById("btn-admin-manage-promos");
  if (adminPromoBtn) {
    const isShowAdmin = (currentUser.isAdmin || adminViewMode === "all");
    adminPromoBtn.style.display = isShowAdmin ? "inline-flex" : "none";
    adminPromoBtn.onclick = openAdminPromoModal;
  }
}

// Helper: Extract Chat ID from chat_url
function extractChatId(url) {
  if (!url) return "";
  const match = url.match(/\/chat\/([^\/\?]+)/);
  return match ? match[1] : "";
}

// 2. Load Data from Supabase (Apps, Packages, Subscriptions, Promotions)
async function loadAppData() {
  try {
    // A. Fetch Public Catalog Apps & Packages
    const [apps, packages] = await Promise.all([
      supabaseFetch("apps?select=*&order=created_at.asc"),
      supabaseFetch("packages?select=*&order=price.asc")
    ]);

    catalogApps = apps || [];
    catalogPackages = packages || [];

    renderCatalog();

    // B. Fetch Subscriptions from Supabase
    allShopBindings = await supabaseFetch(`customer_bindings?select=*,account:accounts(*)&reverted=eq.false&order=created_at.desc`) || [];

    let bindings = [];

    if (currentUser.isAdmin && adminViewMode === "all") {
      // ADMIN UNRESTRICTED VIEW (Manually selected by Admin)
      bindings = allShopBindings;
    } else {
      // FLEXIBLE & EXACT CODE MATCHING (NO MANDATORY LINE LOGIN NEEDED)
      const lookupTerm = customLookupQuery.trim().toUpperCase();
      const uId = (currentUser.userId || "").toUpperCase().trim();
      const cachedCode = (localStorage.getItem("boss_customer_code") || localStorage.getItem("boss_customer_cid") || "").toUpperCase().trim();
      const dName = (currentUser.displayName || "").toUpperCase().trim();

      bindings = allShopBindings.filter(b => {
        const cName = (b.customer_name || "").toUpperCase().trim();
        const cUrl = (b.chat_url || "").toUpperCase().trim();

        // 1. Manual User Lookup Input
        if (lookupTerm) {
          return cUrl.includes(lookupTerm) || cName.includes(lookupTerm);
        }

        // 2. EXACT CUSTOMER RANDOM CODE / CID MATCHING (From URL parameter, path, or localStorage)
        if (cachedCode && cachedCode.length >= 4) {
          if (cName.includes(cachedCode) || cUrl.includes(cachedCode)) {
            return true;
          }
        }

        // 3. Strict LIFF User ID matching
        if (uId && uId.length > 5 && cUrl.includes(uId)) {
          return true;
        }

        // 4. Fallback Display Name Match
        if (dName && dName !== "ลูกค้า BOSS PREMIUM" && cName) {
          if (cName === dName || (cName.length > 3 && cName.includes(dName))) return true;
        }

        return false;
      });

      // Seamless Fallback for Admin Boss: If no items match personal name "Boss", display active shop items for easy testing
      if (bindings.length === 0 && currentUser.isAdmin && !customLookupQuery && !cachedCode) {
        bindings = allShopBindings;
      }
    }

    userBindings = bindings || [];
    try {
      localStorage.setItem("boss_cached_user_bindings", JSON.stringify(userBindings));
    } catch (e) { }
    renderAdminBadge();
    renderSubscriptions();
    renderHistoryTab();
    fetchAndRenderPromotions();
  } catch (err) {
    console.error("Failed to load app data:", err);
    renderErrorState();
  }
}

// Render Error State when loading fails
function renderErrorState() {
  const container = document.getElementById("subscriptions-container");
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      </div>
      <div class="empty-title">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>
      <div class="empty-desc" style="margin-bottom: 12px;">ไม่สามารถดึงข้อมูลสิทธิ์ใช้งานได้ กรุณาลองใหม่อีกครั้ง</div>
      <button class="copy-btn" style="margin: 0 auto; padding: 6px 16px; background: var(--blue-primary); color: #fff;" onclick="loadAppData()">ลองใหม่อีกครั้ง</button>
    </div>
  `;
}

// Helper: Get App specific theme styling & logo/GIF icon
function getAppCardStyle(appName) {
  const nameLower = (appName || "").toLowerCase().trim();

  if (nameLower.includes("netflix")) {
    return {
      cardClass: "theme-netflix",
      iconHtml: `<img src="80970-netflix.gif" alt="Netflix" class="app-theme-gif-icon">`,
      headerBadgeStyle: "background: linear-gradient(135deg, #e50914, #b20710); color: #fff; box-shadow: 0 0 10px rgba(229, 9, 20, 0.5); border: none;",
      btnPrimaryStyle: "background: linear-gradient(135deg, #e50914, #b20710); border: none; box-shadow: 0 0 14px rgba(229, 9, 20, 0.6); color: #fff;"
    };
  }

  if (nameLower.includes("disney") || nameLower.includes("ดิสนีย์")) {
    return {
      cardClass: "theme-disney",
      iconHtml: `<div class="app-icon-symbol" style="background: linear-gradient(135deg, #0063e5, #002684); color: #fff;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg></div>`,
      headerBadgeStyle: "background: linear-gradient(135deg, #0063e5, #0036a7); color: #fff; border: none;",
      btnPrimaryStyle: "background: linear-gradient(135deg, #0284c7, #0369a1); border: none; box-shadow: 0 0 12px rgba(2, 132, 199, 0.5);"
    };
  }

  if (nameLower.includes("prime") || nameLower.includes("amazon")) {
    return {
      cardClass: "theme-prime",
      iconHtml: `<div class="app-icon-symbol" style="background: linear-gradient(135deg, #00a8e1, #005f7f); color: #fff;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>`,
      headerBadgeStyle: "background: linear-gradient(135deg, #00a8e1, #0077a3); color: #fff; border: none;",
      btnPrimaryStyle: "background: linear-gradient(135deg, #00a8e1, #0077a3); border: none; box-shadow: 0 0 12px rgba(0, 168, 225, 0.4);"
    };
  }

  if (nameLower.includes("hbo") || nameLower.includes("max")) {
    return {
      cardClass: "theme-hbo",
      iconHtml: `<div class="app-icon-symbol" style="background: linear-gradient(135deg, #7928ca, #4c1d95); color: #fff; font-weight: bold; font-family: sans-serif; font-size: 13px;">HBO</div>`,
      headerBadgeStyle: "background: linear-gradient(135deg, #7928ca, #581c87); color: #fff; border: none;",
      btnPrimaryStyle: "background: linear-gradient(135deg, #9333ea, #6b21a8); border: none; box-shadow: 0 0 12px rgba(147, 51, 234, 0.5);"
    };
  }

  if (nameLower.includes("youtube")) {
    return {
      cardClass: "theme-youtube",
      iconHtml: `<div class="app-icon-symbol" style="background: #ff0000; color: #fff;"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`,
      headerBadgeStyle: "background: #ff0000; color: #fff; border: none;",
      btnPrimaryStyle: "background: linear-gradient(135deg, #dc2626, #991b1b); border: none; box-shadow: 0 0 12px rgba(220, 38, 38, 0.5);"
    };
  }

  if (nameLower.includes("spotify")) {
    return {
      cardClass: "theme-spotify",
      iconHtml: `<div class="app-icon-symbol" style="background: #1db954; color: #fff;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></div>`,
      headerBadgeStyle: "background: #1db954; color: #000; font-weight: bold; border: none;",
      btnPrimaryStyle: "background: linear-gradient(135deg, #16a34a, #15803d); border: none; box-shadow: 0 0 12px rgba(22, 163, 74, 0.5);"
    };
  }

  return {
    cardClass: "theme-default",
    iconHtml: `<div class="app-icon-symbol" style="background: #0284c7; color: #fff; font-weight: bold;">${(appName || "A")[0].toUpperCase()}</div>`,
    headerBadgeStyle: "",
    btnPrimaryStyle: ""
  };
}

// Helper: Get formatted & app-aware package name for WebApp display
function getFormattedPackageName(sub) {
  if (!sub) return "แพ็คเกจปกติ";
  return sub.package_name || (sub.app_name ? `${sub.app_name} Premium` : "แพ็คเกจปกติ");
}

// Helper: Render device type with beautiful SVG icons
function getDeviceTypeHtml(dt) {
  const tvIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright, #38bdf8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px; display: inline-block;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;

  const mobileIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright, #38bdf8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px; display: inline-block;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;

  const tabletIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright, #38bdf8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px; display: inline-block;"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;

  const pcIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright, #38bdf8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px; display: inline-block;"><rect x="3" y="4" width="18" height="12" rx="2" ry="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line></svg>`;

  if (!dt) return `${mobileIcon}<span>มือถือ / ไอแพด / แท็บเล็ต</span>`;
  const lower = dt.toLowerCase().trim();

  // 1. Check TV / Smart TV FIRST (covers "สมาร์ททีวี", "ทีวี", "tv", "สมาร์ททีวี / มือถือ")
  if (lower === 'tv' || lower.includes('tv') || lower.includes('ทีวี') || lower.includes('สมาร์ททีวี')) {
    return `${tvIcon}<span>สมาร์ททีวี</span>`;
  }
  // 2. Check iPad / Tablet
  if (lower.includes('ไอแพด') || lower.includes('ipad') || lower.includes('แท็บเล็ต') || lower.includes('tablet')) {
    return `${tabletIcon}<span>ไอแพด / แท็บเล็ต</span>`;
  }
  // 3. Check Standalone Computer / PC
  if (lower.includes('คอม') || lower.includes('pc') || lower.includes('laptop') || lower.includes('คอมพิวเตอร์')) {
    return `${pcIcon}<span>คอมพิวเตอร์ / PC</span>`;
  }
  // 4. Check Mobile
  if (lower.includes('มือถือ') || lower.includes('mobile') || lower.includes('โทรศัพท์')) {
    return `${mobileIcon}<span>มือถือ / ไอแพด / แท็บเล็ต</span>`;
  }

  return `${mobileIcon}<span>มือถือ / iPad</span>`;
}

// Helper: Extract total package duration days accurately
function getSubscriptionTotalDays(sub) {
  if (sub.days && typeof sub.days === 'number' && sub.days > 0) {
    return sub.days;
  }
  const pkgName = sub.package_name || "";
  const match = pkgName.match(/(\d+)\s*(วัน|day|days)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  if (pkgName.includes("1 ปี") || pkgName.includes("365")) return 365;
  if (pkgName.includes("6 เดือน") || pkgName.includes("180")) return 180;
  if (pkgName.includes("3 เดือน") || pkgName.includes("90")) return 90;
  if (pkgName.includes("1 เดือน") || pkgName.includes("30")) return 30;
  if (pkgName.includes("7 วัน") || pkgName.includes("7 day")) return 7;
  return 30;
}

// 4. Render Customer Active Subscriptions (สิทธิ์ใช้งาน)
function renderSubscriptions() {
  const container = document.getElementById("subscriptions-container");
  const badge = document.getElementById("sub-count-badge");
  if (!container) return;
  container.innerHTML = "";

  let activeSubs = userBindings || [];

  if (activeSearchQuery) {
    const q = activeSearchQuery.toLowerCase();
    activeSubs = activeSubs.filter(sub => {
      const acc = sub.account || {};
      const appName = (sub.app_name || "").toLowerCase();
      const pkgName = (sub.package_name || "").toLowerCase();
      const email = (acc.email || "").toLowerCase();
      const profile = (acc.profile_name || "").toLowerCase();
      const pin = (acc.pin_code || "").toLowerCase();
      const customer = (sub.customer_name || "").toLowerCase();
      const rawData = (sub.raw_account_data || "").toLowerCase();
      return appName.includes(q) || pkgName.includes(q) || email.includes(q) || profile.includes(q) || pin.includes(q) || customer.includes(q) || rawData.includes(q);
    });
  }

  if (badge) {
    badge.textContent = `${activeSubs.length} รายการ`;
  }

  if (activeSearchQuery) {
    const filterBanner = document.createElement("div");
    filterBanner.className = "active-search-filter-banner";
    filterBanner.innerHTML = `
      <span>🔍 ค้นหา: "<b>${escapeHtml(activeSearchQuery)}</b>" (พบ ${activeSubs.length} สิทธิ์)</span>
      <button type="button" class="active-search-clear-btn" onclick="clearSearchInput()">✕ ล้าง</button>
    `;
    container.appendChild(filterBanner);
  }

  if (activeSubs.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "empty-state";
    emptyEl.innerHTML = activeSearchQuery ? `
      <div class="empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </div>
      <div class="empty-title">ไม่พบสิทธิ์ที่ตรงกับ "${escapeHtml(activeSearchQuery)}"</div>
      <div class="empty-desc">ลองค้นหาด้วยคำอื่น หรือกดล้างการค้นหาเพื่อดูทั้งหมด</div>
      <button class="btn btn-outline" style="margin-top: 10px;" onclick="clearSearchInput()">ล้างการค้นหา</button>
    ` : `
      <div class="empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>
      </div>
      <div class="empty-title">ไม่พบสิทธิ์การใช้งาน</div>
      <div class="empty-desc">คุณยังไม่มีสิทธิ์เข้าใช้งานแอปในขณะนี้ หรือสิทธิ์เดิมหมดอายุแล้ว</div>
    `;
    container.appendChild(emptyEl);
    return;
  }

  activeSubs.forEach(sub => {
    const card = document.createElement("div");
    const appStyle = getAppCardStyle(sub.app_name);
    card.className = `sub-card ${appStyle.cardClass}`;

    // Calculate Expiry Status & Countdown
    const now = new Date();
    const expiryDate = new Date(sub.expiry_date);
    const diffMs = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Extract Account Info from Binding or Linked Account
    const acc = sub.account || {};
    const isBroken = acc.status === "broken" || acc.status === "มีปัญหา" || !!acc.problem_type || sub.status === "broken";

    let expiryBadgeClass = "expiry-active";
    let expiryText = `เหลือ ${diffDays} วัน`;

    if (isBroken) {
      expiryBadgeClass = "expiry-broken";
      expiryText = "⚠️ บัญชีมีปัญหา";
    } else if (diffMs <= 0) {
      expiryBadgeClass = "expiry-expired";
      expiryText = "หมดอายุแล้ว";
    } else if (diffDays <= 3) {
      expiryBadgeClass = "expiry-warning";
      expiryText = `ใกล้หมดอายุ (เหลือ ${diffDays} วัน)`;
    }

    const email = acc.email || extractPattern(sub.raw_account_data, /อีเมล:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /📧\s*([^\n]+)/) || "ไม่ระบุ";
    const rawPassword = acc.password || extractPattern(sub.raw_account_data, /รหัสผ่าน:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /🔑\s*([^\n]+)/) || "ไม่ระบุ";
    const profile = acc.profile_name || extractPattern(sub.raw_account_data, /โปรไฟล์:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /👤\s*([^\n]+)/) || "จอ 1";
    const pin = acc.pin_code || extractPattern(sub.raw_account_data, /(?:รหัส\s*)?PIN:\s*([^\n]+)/i) || extractPattern(sub.raw_account_data, /📌\s*(?:รหัส\s*)?PIN:\s*([^\n]+)/i) || extractPattern(sub.raw_account_data, /🔒\s*(?:รหัส\s*)?PIN:\s*([^\n]+)/i) || "-";
    const chatId = extractChatId(sub.chat_url);

    // Format full Thai Expiry Date & Time
    const formattedExpiryDateTime = sub.expiry_date
      ? new Date(sub.expiry_date).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + " น."
      : "ไม่ระบุ";

    // Extract Customer WebApp direct URL
    const customerCode = sub.customer_name || extractChatId(sub.chat_url) || localStorage.getItem("boss_customer_code") || "";
    const customerWebappUrl = customerCode
      ? `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(customerCode)}`
      : `${window.location.origin}${window.location.pathname}`;

    // Password Security Masking State
    const isPasswordVisible = !!visiblePasswordsMap[sub.id];
    const displayedPassword = isPasswordVisible ? rawPassword : "••••••••••••";
    const eyeSvg = isPasswordVisible
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

    // Calculate Progress Bar percentage safely based on actual package duration (sub.days)
    const totalPkgDays = getSubscriptionTotalDays(sub);
    let progressPercent = 0;
    if (diffDays > 0) {
      progressPercent = Math.min(100, Math.max(0, Math.round((diffDays / totalPkgDays) * 100)));
    }

    const launchAppUrl = getStreamingAppLaunchUrl(sub.app_name);
    const isNearExpiry = diffDays > 0 && diffDays <= 5 && !isBroken;

    card.innerHTML = `
      <div class="sub-card-header">
        <div class="app-pill">
          ${appStyle.iconHtml}
          <div>
            <div class="app-name-text">${escapeHtml(sub.app_name)}</div>
            ${currentUser.isAdmin ? `<span style="font-size: 10px; color: #fde047;">ลูกค้า: ${escapeHtml(sub.customer_name)}</span>` : ''}
          </div>
        </div>
        <span class="expiry-badge ${expiryBadgeClass}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ${expiryText}
        </span>
      </div>

      <div class="sub-progress-container" title="ระยะเวลาคงเหลือ ${progressPercent}%">
        <div class="sub-progress-fill ${expiryBadgeClass}" style="width: ${progressPercent}%;"></div>
      </div>

      <div class="sub-details">
        ${isBroken ? `
          <div class="sub-broken-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span>บัญชีนี้อยู่ระหว่างการตรวจสอบ/แก้ไขปัญหาจากทางร้าน หากเข้าใช้งานไม่ได้ สามารถกดปุ่ม "แจ้งปัญหา" ด้านล่างได้ทันทีครับ</span>
          </div>
        ` : ''}
        <div class="sub-pkg-banner">
          <span class="sub-pkg-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            แพ็คเกจ:
          </span>
          <span class="sub-pkg-title">${escapeHtml(getFormattedPackageName(sub))}</span>
        </div>

        <div class="sub-credential-card">
          <div class="credential-row">
            <div class="credential-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <span>อีเมล:</span>
            </div>
            <div class="credential-val-box">
              <span class="credential-text email-text" onclick="copyToClipboard('${escapeHtml(email)}', 'อีเมล', this)" title="แตะเพื่อคัดลอกอีเมล">${escapeHtml(email)}</span>
              <button class="copy-pill-btn copy-icon-only" onclick="copyToClipboard('${escapeHtml(email)}', 'อีเมล', this)" title="คัดลอกอีเมล">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          </div>

          <div class="credential-row">
            <div class="credential-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold-light, #fde047)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.778-7.778zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
              <span>รหัสผ่าน:</span>
            </div>
            <div class="credential-val-box">
              <span class="credential-text pass-text ${isPasswordVisible ? '' : 'masked'}" onclick="copyToClipboard('${escapeHtml(rawPassword)}', 'รหัสผ่าน', this)" title="แตะเพื่อคัดลอกรหัสผ่าน">${escapeHtml(displayedPassword)}</span>
              <button class="eye-pill-btn" onclick="togglePasswordVisibility('${sub.id}')" title="ซ่อน/แสดงรหัสผ่าน">${eyeSvg}</button>
              <button class="copy-pill-btn copy-icon-only" onclick="copyToClipboard('${escapeHtml(rawPassword)}', 'รหัสผ่าน', this)" title="คัดลอกรหัสผ่าน">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          </div>

          <!-- One-Click Quick Copy All Button -->
          <button type="button" class="btn-copy-all-credentials" onclick="copyAllSubscriptionDetails('${sub.id}', event)" title="คัดลอกข้อมูลทั้งหมด (อีเมล, รหัสผ่าน, จอ, PIN) ในคลิกเดียว">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>คัดลอกข้อมูลทั้งหมด</span>
          </button>

          ${(sub.app_name || "").toLowerCase().includes("netflix") ? `
            <!-- Netflix OTP Guide Button & Collapsible Panel -->
            <div class="netflix-login-guide-wrapper">
              <button type="button" class="btn-netflix-guide-toggle" onclick="toggleNetflixLoginGuide('${sub.id}', event)" title="ดูวิธีเข้าสู่ระบบ Netflix เมื่อระบบถาม OTP">
                <div class="guide-btn-content">
                  <span class="guide-bulb-icon">💡</span>
                  <span>วิธีเข้าใช้งาน (หากระบบถาม OTP)</span>
                </div>
                <svg class="guide-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
              <div id="netflix-guide-${sub.id}" class="netflix-guide-content" style="display: none;">
                <div class="netflix-guide-header">
                  <span style="font-size: 13px;">💡</span>
                  <span style="font-weight: 700; color: #fca5a5;">วิธีเข้าใช้งาน (หากระบบถาม OTP)</span>
                </div>
                <div class="netflix-guide-list">
                  <div class="netflix-guide-item">
                    <span class="guide-step-badge">1</span>
                    <div class="guide-step-text">ให้ลูกค้าแตะที่ <span class="guide-highlight">"ขอความช่วยเหลือ"</span> <i>(Get Help)</i></div>
                  </div>
                  <div class="netflix-guide-item">
                    <span class="guide-step-badge">2</span>
                    <div class="guide-step-text">เลือกตัวเลือก <span class="guide-highlight">"กรอกรหัสผ่าน"</span> <i>(Enter Password)</i></div>
                  </div>
                  <div class="netflix-guide-item">
                    <span class="guide-step-badge">3</span>
                    <div class="guide-step-text">แล้วนำรหัสผ่านด้านบนไปกรอกเพื่อเข้าสู่ระบบได้เลยน้า</div>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="sub-info-grid">
          <div class="info-tile">
            <span class="info-tile-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              โปรไฟล์
            </span>
            <div class="profile-val-container">
              <span class="info-tile-val profile-name-val">${escapeHtml(profile)}</span>
              ${pin && pin !== '-' ? `
                <div class="pin-badge" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(pin)}', 'รหัส PIN ${escapeHtml(pin)}', this)" title="แตะเพื่อคัดลอก PIN: ${escapeHtml(pin)}">
                  <div class="pin-badge-lock">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  </div>
                  <span class="pin-badge-tag">PIN</span>
                  <span class="pin-badge-code">${escapeHtml(pin)}</span>
                  <svg class="pin-badge-copy-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="info-tile">
            <span class="info-tile-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
              อุปกรณ์
            </span>
            <span class="info-tile-val device-val">
              ${getDeviceTypeHtml(sub.device_type || acc.device_type)}
            </span>
          </div>

          <div class="info-tile full-width-tile">
            <span class="info-tile-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold-light, #fde047)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              วันเวลาหมดอายุสิทธิ์
            </span>
            <span class="info-tile-val expiry-time-val">
              📅 ${formattedExpiryDateTime}
            </span>
          </div>
        </div>
      </div>

      <!-- Action Buttons Row (Launch App / Quick Renew / Report Problem) -->
      <div class="sub-card-actions-row">
        ${launchAppUrl ? `
          <a href="${launchAppUrl}" target="_blank" rel="noopener noreferrer" class="btn-launch-app" title="เปิดหน้าเว็บหรือแอปพลิเคชัน ${escapeHtml(sub.app_name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            <span>เข้าใช้งาน ${escapeHtml(sub.app_name)}</span>
          </a>
        ` : ''}
        ${isNearExpiry ? `
          <button type="button" class="btn-renew-sub" onclick="handleQuickRenewal('${escapeHtml(sub.app_name)}', '${escapeHtml(getFormattedPackageName(sub))}')" title="ต่ออายุแพ็กเกจนี้ทันที">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            <span>ต่ออายุ</span>
          </button>
        ` : ''}
        <button type="button" class="btn-card-support" onclick="openProblemModal('${escapeHtml(sub.app_name)}', '${sub.id}')" title="แจ้งปัญหาบัญชีนี้">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          <span>แจ้งปัญหา</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Populate App select modal
  populateAppSelect();
  setTimeout(checkFloatingScrollButton, 200);
}

// Floating Quick Scroll Button Logic for Subscriptions Tab
function scrollToSubscriptionsSection() {
  const container = document.getElementById("subscriptions-container") || document.getElementById("sub-count-badge");
  if (container) {
    const yOffset = -70; // Offset for sticky header
    const y = container.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
}

function checkFloatingScrollButton() {
  const btn = document.getElementById("floating-scroll-sub-btn");
  const textEl = document.getElementById("floating-btn-text");
  if (!btn) return;

  // 1. Must be on Tab 1 (tab-subscriptions-pane active)
  const tabPane = document.getElementById("tab-subscriptions-pane");
  if (!tabPane || !tabPane.classList.contains("active") || tabPane.style.display === "none") {
    btn.classList.remove("visible");
    return;
  }

  // 2. Must have active subscriptions
  if (!userBindings || userBindings.length === 0) {
    btn.classList.remove("visible");
    return;
  }

  // 3. Check if subscriptions container is hidden below current viewport
  const container = document.getElementById("subscriptions-container");
  if (!container) {
    btn.classList.remove("visible");
    return;
  }

  const rect = container.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;

  // If container top is below the visible screen viewport (or mostly out of view)
  const isHiddenBelow = rect.top > (windowHeight - 120);

  if (isHiddenBelow) {
    if (textEl) {
      textEl.textContent = `ดูสิทธิ์ใช้งานของคุณ (${userBindings.length} รายการ)`;
    }
    btn.classList.add("visible");
  } else {
    btn.classList.remove("visible");
  }
}

// Attach scroll and resize listeners
window.addEventListener("scroll", checkFloatingScrollButton, { passive: true });
window.addEventListener("resize", checkFloatingScrollButton, { passive: true });

// Open Customer WebApp Link in new tab
function openCustomerWebapp(url) {
  if (!url) return;
  window.open(url, "_blank");
  showToast("🌐 เปิด WebApp ประจำตัวลูกค้าเรียบร้อย!", "info");
}

// Password Visibility Toggle Handler
function togglePasswordVisibility(subId) {
  visiblePasswordsMap[subId] = !visiblePasswordsMap[subId];
  renderSubscriptions();
}

// Netflix Login Guide Toggle Handler
function toggleNetflixLoginGuide(subId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const guideEl = document.getElementById(`netflix-guide-${subId}`);
  const btnEl = event?.currentTarget || (event?.target ? event.target.closest('.btn-netflix-guide-toggle') : null) || document.querySelector(`button[onclick*="toggleNetflixLoginGuide('${subId}'"]`);
  if (guideEl) {
    const isHidden = guideEl.style.display === "none";
    if (isHidden) {
      guideEl.style.display = "block";
      if (btnEl) btnEl.classList.add("active");
    } else {
      guideEl.style.display = "none";
      if (btnEl) btnEl.classList.remove("active");
    }
  }
}
window.toggleNetflixLoginGuide = toggleNetflixLoginGuide;

// Order Type Switcher Handler (New vs Renewal)
function setOrderType(type) {
  selectedOrderType = type;
  const btnNew = document.getElementById("btn-order-type-new");
  const btnRenew = document.getElementById("btn-order-type-renew");
  const renewField = document.getElementById("renew-profile-field");

  if (btnNew) btnNew.classList.toggle("active", type === "new");
  if (btnRenew) btnRenew.classList.toggle("active", type === "renew");
  if (renewField) renewField.style.display = type === "renew" ? "block" : "none";
}

// Device Type Selector Handler (Mobile vs TV)
function setDeviceType(type) {
  selectedDeviceType = type;
  const btnMobile = document.getElementById("btn-device-mobile");
  const btnTv = document.getElementById("btn-device-tv");

  if (btnMobile) btnMobile.classList.toggle("active", type === "mobile");
  if (btnTv) btnTv.classList.toggle("active", type === "tv");
}

// Set Catalog Category Filter Handler
function setCatalogCategory(cat) {
  activeCatalogCategory = cat;
  const chips = document.querySelectorAll(".filter-chip");
  chips.forEach(chip => {
    const chipCat = chip.getAttribute("data-category");
    chip.classList.toggle("active", chipCat === cat);
  });
  renderCatalog();
}

// 4. Render Store Catalog (ร้านค้า/แคตตาล็อก)
function renderCatalog() {
  const container = document.getElementById("catalog-container");
  if (!container) return;
  container.innerHTML = "";

  let filtered = catalogApps || [];

  if (activeSearchQuery) {
    const q = activeSearchQuery.toLowerCase();
    filtered = filtered.filter(a => {
      const name = (a.display_name || a.name || "").toLowerCase();
      const desc = (a.description || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }

  if (activeCatalogCategory === "movie") {
    filtered = filtered.filter(a => {
      const name = (a.display_name || a.name || "").toLowerCase();
      return name.includes("netflix") || name.includes("disney") || name.includes("prime") || name.includes("hbo") || name.includes("iqiyi") || name.includes("viu") || name.includes("wetv");
    });
  } else if (activeCatalogCategory === "music") {
    filtered = filtered.filter(a => {
      const name = (a.display_name || a.name || "").toLowerCase();
      return name.includes("spotify") || name.includes("youtube") || name.includes("music") || name.includes("apple");
    });
  } else if (activeCatalogCategory === "hot") {
    filtered = filtered.filter(a => {
      const name = (a.display_name || a.name || "").toLowerCase();
      return name.includes("netflix") || name.includes("disney") || name.includes("youtube") || name.includes("prime");
    });
  }

  // Sorting
  if (selectedSortOption === "price_asc") {
    filtered.sort((a, b) => {
      const pA = Math.min(...(catalogPackages.filter(p => p.app_id === a.id).map(p => p.price) || [169]));
      const pB = Math.min(...(catalogPackages.filter(p => p.app_id === b.id).map(p => p.price) || [169]));
      return pA - pB;
    });
  } else if (selectedSortOption === "price_desc") {
    filtered.sort((a, b) => {
      const pA = Math.min(...(catalogPackages.filter(p => p.app_id === a.id).map(p => p.price) || [169]));
      const pB = Math.min(...(catalogPackages.filter(p => p.app_id === b.id).map(p => p.price) || [169]));
      return pB - pA;
    });
  } else if (selectedSortOption === "name_asc") {
    filtered.sort((a, b) => (a.display_name || a.name || "").localeCompare(b.display_name || b.name || "", 'th'));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
        </div>
        <div class="empty-title">ไม่พบรายการในหมวดหมู่นี้</div>
      </div>
    `;
    return;
  }

  filtered.forEach(app => {
    const appPkgs = catalogPackages.filter(p => p.app_id === app.id);
    const minPrice = appPkgs.length > 0 ? Math.min(...appPkgs.map(p => p.price)) : 169;
    const appStyle = getAppCardStyle(app.display_name || app.name);

    let featureBadges = ["4K Ultra HD", "ไม่มีโฆษณา", "ประกัน 100%"];
    const nameLower = (app.display_name || app.name || "").toLowerCase();
    if (nameLower.includes("netflix")) featureBadges = ["4K HDR", "ดูได้ 4 จอ", "พากย์ไทย"];
    else if (nameLower.includes("disney")) featureBadges = ["4K IMAX", "รองรับทุกอุปกรณ์", "ซับไทย"];
    else if (nameLower.includes("youtube")) featureBadges = ["ไม่มีโฆษณา", "ฟังเบื้องหลัง", "ดาวน์โหลดได้"];
    else if (nameLower.includes("spotify")) featureBadges = ["เสียงคมชัดสูง", "ข้ามเพลงไม่จำกัด", "ฟังออฟไลน์"];

    const badgeHtml = featureBadges.map(b => `<span class="feature-badge">${b}</span>`).join("");

    const card = document.createElement("div");
    card.className = `catalog-card ${appStyle.cardClass}`;
    card.innerHTML = `
      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          ${appStyle.iconHtml}
          <span class="expiry-badge expiry-active" style="font-size: 9px; padding: 3px 8px; border-radius: 12px;">⚡ พร้อมส่ง 24 ชม.</span>
        </div>
        <div class="catalog-title">${escapeHtml(app.display_name || app.name)}</div>
        <div class="catalog-desc">${escapeHtml(app.instruction_text || "แอปพรีเมียมคุณภาพสูง รับชมแบบไม่มีโฆษณา")}</div>
        <div class="catalog-feature-badges">${badgeHtml}</div>
      </div>
      <div class="catalog-price-row">
        <div class="catalog-price">฿${minPrice} <small>/เริ่มต้น</small></div>
        <button class="btn-purchase-action" style="${appStyle.btnPrimaryStyle}" onclick="openPackagePurchaseModal('${app.id}')">สั่งซื้อ</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Open Package Purchase Checkout Modal
function openPackagePurchaseModal(appId) {
  const app = catalogApps.find(a => a.id === appId);
  if (!app) return;

  activePurchaseApp = app;
  const modal = document.getElementById("purchase-modal");
  const titleEl = document.getElementById("purchase-app-title");
  const infoEl = document.getElementById("purchase-app-info");
  const listEl = document.getElementById("package-options-list");

  if (titleEl) titleEl.innerHTML = `<span style="color: var(--gold-light);">สั่งซื้อ ${escapeHtml(app.display_name || app.name)}</span>`;

  const appStyle = getAppCardStyle(app.display_name || app.name);
  if (infoEl) {
    infoEl.innerHTML = `
      ${appStyle.iconHtml}
      <div>
        <div style="font-size: 14px; font-weight: bold; color: var(--text-main);">${escapeHtml(app.display_name || app.name)}</div>
        <div style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(app.instruction_text || "แพ็คเกจพรีเมียม ประกันสิทธิ์ตลอดอายุการใช้งาน")}</div>
      </div>
    `;
  }

  let appPkgs = catalogPackages.filter(p => p.app_id === appId);
  // Filter out disabled or inactive packages
  appPkgs = appPkgs.filter(p => p.is_active !== false && p.status !== "disabled");

  if (appPkgs.length === 0) {
    appPkgs = [
      { id: `mock-${appId}-30`, name: "30 วัน (1 เดือน)", price: 169, duration_days: 30, in_stock: true },
      { id: `mock-${appId}-90`, name: "90 วัน (3 เดือน)", price: 450, duration_days: 90, in_stock: true },
      { id: `mock-${appId}-365`, name: "365 วัน (1 ปี)", price: 1590, duration_days: 365, in_stock: true }
    ];
  }

  // Find first available in-stock package
  const firstAvailable = appPkgs.find(p => p.in_stock !== false && p.stock_status !== "out_of_stock" && p.stock_qty !== 0) || appPkgs[0];
  selectedPackageObj = firstAvailable;

  if (listEl) {
    listEl.innerHTML = "";
    appPkgs.forEach((pkg, index) => {
      const isOutOfStock = pkg.in_stock === false || pkg.stock_status === "out_of_stock" || pkg.stock_qty === 0;
      const isSelected = pkg.id === selectedPackageObj.id && !isOutOfStock;
      const card = document.createElement("div");
      card.className = `package-option-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`;
      card.setAttribute("data-pkg-id", pkg.id);

      if (!isOutOfStock) {
        card.onclick = () => selectPackageOption(pkg.id, appPkgs);
      }

      card.innerHTML = `
        <div>
          <div class="package-duration-title" style="${isOutOfStock ? 'color: #94a3b8; text-decoration: line-through;' : ''}">
            ${escapeHtml(pkg.name)}
          </div>
          <div style="font-size: 10px; color: ${isOutOfStock ? '#f87171' : 'var(--text-muted)'}; font-weight: 500;">
            ${isOutOfStock ? '🔴 สินค้าหมดชั่วคราว (Out of Stock)' : `รับประกันนาน ${pkg.duration_days || 30} วัน`}
          </div>
        </div>
        <div style="text-align: right;">
          <div class="package-price-text" style="${isOutOfStock ? 'color: #64748b;' : ''}">฿${pkg.price}</div>
          <span style="font-size: 9px; color: ${isOutOfStock ? '#f87171' : 'var(--gold-light)'}; font-weight: 500; display: inline-flex; align-items: center; justify-content: flex-end; gap: 2px;">
            ${isOutOfStock
          ? 'หมด'
          : (pkg.duration_days && pkg.duration_days >= 365)
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg> สุดคุ้ม`
            : 'นิยม'}
          </span>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  if (modal) modal.classList.add("active");
}

function selectPackageOption(pkgId, pkgList) {
  const found = pkgList.find(p => p.id === pkgId);
  if (found) selectedPackageObj = found;

  const cards = document.querySelectorAll(".package-option-card");
  cards.forEach(c => {
    c.classList.toggle("selected", c.getAttribute("data-pkg-id") === pkgId);
  });
}

function confirmPackagePurchase() {
  if (!activePurchaseApp || !selectedPackageObj) return;

  const modal = document.getElementById("purchase-modal");
  if (modal) modal.classList.remove("active");

  const orderTypeName = selectedOrderType === "renew" ? "ต่ออายุโปรไฟล์เดิม" : "เปิดบัญชีใหม่";
  const renewInput = document.getElementById("purchase-renew-input");
  const renewRef = (selectedOrderType === "renew" && renewInput) ? renewInput.value.trim() : "";
  const deviceName = selectedDeviceType === "tv" ? "สมาร์ททีวี (Smart TV)" : "มือถือ / แท็บเล็ต / PC";

  let msgText = `🛒 [คำสั่งซื้อ BOSS Premium]\n`;
  msgText += `• แอปพลิเคชัน: ${activePurchaseApp.display_name || activePurchaseApp.name}\n`;
  msgText += `• แพ็คเกจ: ${selectedPackageObj.name}\n`;
  msgText += `• ยอดชำระ: ${selectedPackageObj.price} บาท\n`;
  msgText += `• ประเภทสิทธิ์: ${orderTypeName} ${renewRef ? '(' + renewRef + ')' : ''}\n`;
  msgText += `• อุปกรณ์: ${deviceName}\n`;
  msgText += `\nพร้อมแนบสลิปชำระเงินเพื่อยืนยันคำสั่งซื้อได้เลยครับ!`;

  lastOrderSummaryText = msgText;

  // Build Digital Receipt UI inside success modal
  const receiptContainer = document.getElementById("checkout-receipt-card");
  const appStyle = getAppCardStyle(activePurchaseApp.display_name || activePurchaseApp.name);

  if (receiptContainer) {
    receiptContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${appStyle.iconHtml}
          <div>
            <div style="font-size: 15px; font-weight: bold; color: #fff;">${escapeHtml(activePurchaseApp.display_name || activePurchaseApp.name)}</div>
            <div style="font-size: 11px; color: var(--gold-light); font-weight: 500;">${escapeHtml(selectedPackageObj.name)}</div>
          </div>
        </div>
        <span class="expiry-badge expiry-warning" style="font-size: 9.5px; padding: 2px 8px;">รอชำระเงิน</span>
      </div>

      <div class="receipt-divider-line"></div>

      <div class="receipt-row">
        <span style="color: var(--text-muted);">ประเภทคำสั่งซื้อ:</span>
        <span style="color: #fff; font-weight: 500;">${orderTypeName} ${renewRef ? '(' + escapeHtml(renewRef) + ')' : ''}</span>
      </div>

      <div class="receipt-row">
        <span style="color: var(--text-muted);">อุปกรณ์รับชม:</span>
        <span style="color: var(--blue-bright); font-weight: 500;">${deviceName}</span>
      </div>

      <div class="receipt-divider-line"></div>

      <div class="receipt-row">
        <span style="color: var(--text-muted);">ยอดรวมทั้งสิ้น:</span>
        <span style="font-size: 18px; font-weight: 700; color: var(--gold-light); font-family: 'Outfit', sans-serif;">฿${selectedPackageObj.price}</span>
      </div>

      <div style="background: rgba(212, 175, 55, 0.1); border: 1px solid var(--border-gold); border-radius: 10px; padding: 10px 12px; margin-top: 4px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 10.5px; color: var(--gold-light); font-weight: bold;">พร้อมเพย์ร้านค้า:</span>
          <button type="button" class="copy-btn" onclick="copyToClipboard('0829999999', 'เลขพร้อมเพย์')" style="padding: 2px 6px; font-size: 9px;">คัดลอก</button>
        </div>
        <div style="font-size: 13px; font-family: monospace; color: #fff; font-weight: bold;">082-999-9999 (BOSS Premium)</div>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">ชำระแล้วกดเปิดแชท LINE OA เพื่อแนบสลิปได้ทันที</div>
      </div>
    `;
  }

  // Open Checkout Success Receipt Modal
  const successModal = document.getElementById("order-checkout-success-modal");
  if (successModal) successModal.classList.add("active");

  showToast("สร้างใบสรุปคำสั่งซื้อสำเร็จเรียบร้อย!", "success");
}

// Toast Notification System
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  if (type === "success") {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === "warning") {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  }

  toast.innerHTML = `${iconSvg} <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-exit");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// 4. Render Order History & Spending Summary
function renderHistoryTab() {
  const container = document.getElementById("history-container");
  const totalAmountEl = document.getElementById("summary-total-amount");
  const activeCountEl = document.getElementById("summary-active-count");
  const savedAmountEl = document.getElementById("summary-saved-amount");

  if (!container) return;
  container.innerHTML = "";

  const items = userBindings || [];
  let totalCalculatedAmount = 0;
  let activeCount = 0;

  if (items.length === 0) {
    if (totalAmountEl) totalAmountEl.textContent = "฿0";
    if (activeCountEl) activeCountEl.textContent = "0 แอป";
    if (savedAmountEl) savedAmountEl.textContent = "฿0";

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <div class="empty-title">ยังไม่มีประวัติการสั่งซื้อ</div>
        <div class="empty-desc">เมื่อเปิดใช้งานแพ็คเกจ ประวัติจะแสดงที่นี่ครับ</div>
      </div>
    `;
    return;
  }

  const now = new Date();

  items.forEach(sub => {
    let estCost = parseFloat(sub.price_paid);
    if (isNaN(estCost) || estCost <= 0) {
      if (Array.isArray(catalogPackages) && catalogPackages.length > 0) {
        const appObj = catalogApps.find(a => (a.display_name || "").toLowerCase() === (sub.app_name || "").toLowerCase() || (a.name || "").toLowerCase() === (sub.app_name || "").toLowerCase());
        const appId = appObj ? appObj.id : null;
        const pkgObj = catalogPackages.find(p => (appId ? p.app_id === appId : true) && (p.name || "").toLowerCase() === (sub.package_name || "").toLowerCase());
        if (pkgObj && pkgObj.price) {
          estCost = parseFloat(pkgObj.price);
        }
      }
    }

    if (isNaN(estCost) || estCost <= 0) {
      const nameLower = (sub.app_name || "").toLowerCase();
      if (nameLower.includes("netflix")) estCost = 169;
      else if (nameLower.includes("disney")) estCost = 99;
      else if (nameLower.includes("youtube")) estCost = 59;
      else if (nameLower.includes("prime")) estCost = 149;
      else if (nameLower.includes("spotify")) estCost = 129;
      else if (nameLower.includes("hbo")) estCost = 199;
      else estCost = 199;
    }

    totalCalculatedAmount += estCost;

    const expiryDate = sub.expiry_date ? new Date(sub.expiry_date) : null;
    const isActive = expiryDate && expiryDate > now;
    if (isActive) activeCount++;

    const createdStr = sub.created_at ? new Date(sub.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : "ไม่ระบุ";
    const expireStr = expiryDate ? expiryDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : "ไม่ระบุ";
    const receiptCode = `REC-${(sub.id || Math.random().toString(36).substring(2, 7)).toString().toUpperCase()}`;

    const appStyle = getAppCardStyle(sub.app_name);

    const card = document.createElement("div");
    card.className = "history-card";
    card.innerHTML = `
      <div class="history-card-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${appStyle.iconHtml}
          <div>
            <div style="font-size: 13px; font-weight: bold; color: var(--text-main);">${escapeHtml(sub.app_name || "สตรีมมิ่งแอป")}</div>
            <div style="font-size: 10px; color: var(--text-muted);">วันที่สั่งซื้อ: ${createdStr}</div>
          </div>
        </div>
        <span class="receipt-pill">${receiptCode}</span>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px dashed rgba(255, 255, 255, 0.1); padding-top: 8px; margin-top: 2px;">
        <div>
          <div style="font-size: 10px; color: var(--text-muted);">วันหมดอายุ: <span style="color: ${isActive ? '#38bdf8' : '#f43f5e'}; font-weight: 500;">${expireStr}</span></div>
          <div style="font-size: 10px; color: var(--text-muted);">ลูกค้า: <span style="color: var(--gold-light);">${escapeHtml(sub.customer_name || "-")}</span></div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 15px; font-weight: 700; color: var(--gold-light); font-family: 'Outfit', sans-serif;">฿${estCost}</div>
          <span class="expiry-badge ${isActive ? 'expiry-active' : 'expiry-danger'}" style="font-size: 9px; padding: 2px 6px;">
            ${isActive ? 'ชำระแล้ว (ใช้งานอยู่)' : 'หมดอายุแล้ว'}
          </span>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  if (totalAmountEl) totalAmountEl.textContent = `฿${totalCalculatedAmount.toLocaleString()}`;
  if (activeCountEl) activeCountEl.textContent = `${activeCount} แอป`;
  if (savedAmountEl) savedAmountEl.textContent = `฿${(totalCalculatedAmount * 1.8).toFixed(0).toLocaleString()}`;
}

// Welcome Banner Auto-Dismiss Controller
let welcomeBannerTimer = null;

function initWelcomeBanner() {
  const banner = document.getElementById("welcome-banner");
  if (!banner) return;

  // Auto-dismiss smoothly after 5 seconds
  if (welcomeBannerTimer) clearTimeout(welcomeBannerTimer);
  welcomeBannerTimer = setTimeout(() => {
    dismissWelcomeBanner();
  }, 5000);
}

function dismissWelcomeBanner() {
  const banner = document.getElementById("welcome-banner");
  if (!banner || banner.classList.contains("hiding") || banner.classList.contains("hidden")) return;

  if (welcomeBannerTimer) {
    clearTimeout(welcomeBannerTimer);
    welcomeBannerTimer = null;
  }

  banner.classList.add("hiding");
  setTimeout(() => {
    banner.classList.add("hidden");
    banner.style.display = "none";
  }, 680);
}

// ================= ON-DEMAND MODERN SEARCH CONTROLLER =================
let activeSearchQuery = "";

function toggleSearchBar() {
  const searchBar = document.getElementById("search-overlay-bar");
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("btn-toggle-search");
  if (!searchBar) return;

  const isVisible = searchBar.style.display !== "none";
  if (isVisible) {
    closeSearchBar();
  } else {
    openSearchBar();
  }
}

function openSearchBar() {
  const searchBar = document.getElementById("search-overlay-bar");
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("btn-toggle-search");
  if (!searchBar) return;

  searchBar.style.display = "block";
  searchBar.classList.remove("closing");
  if (searchBtn) searchBtn.classList.add("active");
  if (searchInput) {
    setTimeout(() => {
      searchInput.focus();
      searchInput.select();
    }, 50);
  }
}

function closeSearchBar() {
  const searchBar = document.getElementById("search-overlay-bar");
  const searchBtn = document.getElementById("btn-toggle-search");
  if (!searchBar) return;

  searchBar.classList.add("closing");
  setTimeout(() => {
    searchBar.style.display = "none";
    searchBar.classList.remove("closing");
  }, 200);

  if (searchBtn && !activeSearchQuery) {
    searchBtn.classList.remove("active");
  }
}

function clearSearchInput() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.value = "";
    handleSearchChange("");
    searchInput.focus();
  } else {
    handleSearchChange("");
  }
}

function handleSearchChange(query) {
  activeSearchQuery = (query || "").trim();
  const clearBtn = document.getElementById("btn-clear-search");
  const activeDot = document.getElementById("search-active-dot");
  const searchBtn = document.getElementById("btn-toggle-search");
  const hintEl = document.getElementById("search-result-hint");

  if (clearBtn) {
    clearBtn.style.display = activeSearchQuery ? "flex" : "none";
  }
  if (activeDot) {
    activeDot.style.display = activeSearchQuery ? "block" : "none";
  }
  if (searchBtn) {
    if (activeSearchQuery) {
      searchBtn.classList.add("has-query");
    } else {
      searchBtn.classList.remove("has-query");
    }
  }

  // Filter Active Subscriptions & Catalog
  renderSubscriptions();
  renderCatalog();

  // Update live matching hint text in search bar
  if (hintEl) {
    if (activeSearchQuery) {
      hintEl.style.display = "flex";
      const q = activeSearchQuery.toLowerCase();
      const subMatches = (userBindings || []).filter(sub => {
        const acc = sub.account || {};
        const appName = (sub.app_name || "").toLowerCase();
        const pkgName = (sub.package_name || "").toLowerCase();
        const email = (acc.email || "").toLowerCase();
        const profile = (acc.profile_name || "").toLowerCase();
        const pin = (acc.pin_code || "").toLowerCase();
        const customer = (sub.customer_name || "").toLowerCase();
        const rawData = (sub.raw_account_data || "").toLowerCase();
        return appName.includes(q) || pkgName.includes(q) || email.includes(q) || profile.includes(q) || pin.includes(q) || customer.includes(q) || rawData.includes(q);
      }).length;

      const catMatches = (catalogApps || []).filter(a => {
        const name = (a.display_name || a.name || "").toLowerCase();
        const desc = (a.description || "").toLowerCase();
        return name.includes(q) || desc.includes(q);
      }).length;

      hintEl.innerHTML = `<span>⚡ พบ <b>${subMatches}</b> สิทธิ์การใช้งาน • <b>${catMatches}</b> แอปในร้าน</span>`;
    } else {
      hintEl.style.display = "none";
      hintEl.innerHTML = "";
    }
  }
}

// 5. Utility Functions
function copyToClipboard(text, label = "", targetElement = null) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(label ? `คัดลอก ${label} เรียบร้อยแล้ว` : `คัดลอกเรียบร้อย: ${text}`, "success");
    
    // Visual Micro-Interaction Feedback
    if (targetElement) {
      targetElement.classList.add("copy-success-bounce");
      setTimeout(() => {
        targetElement.classList.remove("copy-success-bounce");
      }, 1200);
    }
  }).catch(err => {
    console.error("Failed to copy text:", err);
    showToast("ไม่สามารถคัดลอกได้", "warning");
  });
}

// Copy All Subscription Credentials in 1 Tap
function copyAllSubscriptionDetails(subId, event) {
  const sub = (userBindings || []).find(b => b.id === subId);
  if (!sub) return;

  const acc = sub.account || {};
  const email = acc.email || extractPattern(sub.raw_account_data, /อีเมล:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /📧\s*([^\n]+)/) || "-";
  const rawPassword = acc.password || extractPattern(sub.raw_account_data, /รหัสผ่าน:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /🔑\s*([^\n]+)/) || "-";
  const profile = acc.profile_name || extractPattern(sub.raw_account_data, /โปรไฟล์:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /👤\s*([^\n]+)/) || "จอ 1";
  const pin = acc.pin_code || extractPattern(sub.raw_account_data, /(?:รหัส\s*)?PIN:\s*([^\n]+)/i) || extractPattern(sub.raw_account_data, /📌\s*(?:รหัส\s*)?PIN:\s*([^\n]+)/i) || extractPattern(sub.raw_account_data, /🔒\s*(?:รหัส\s*)?PIN:\s*([^\n]+)/i) || "-";
  const device = sub.device_type || acc.device_type || "มือถือ / PC";

  const formattedExpiry = sub.expiry_date
    ? new Date(sub.expiry_date).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + " น."
    : "-";

  const textToCopy = `🎬 แอป: ${sub.app_name}
⭐ แพ็กเกจ: ${getFormattedPackageName(sub)}
📧 อีเมล: ${email}
🔑 รหัสผ่าน: ${rawPassword}
👤 โปรไฟล์: ${profile}${pin && pin !== '-' ? ` (PIN: ${pin})` : ''}
📱 อุปกรณ์: ${device}
📅 วันหมดอายุ: ${formattedExpiry}`;

  const targetBtn = event ? (event.currentTarget || event.target) : null;
  copyToClipboard(textToCopy, `ข้อมูล ${sub.app_name} ทั้งหมด`, targetBtn);
}

// Direct Streaming Web & App Launch URLs
function getStreamingAppLaunchUrl(appName) {
  const name = (appName || "").toLowerCase();
  if (name.includes("netflix")) return "https://www.netflix.com/browse";
  if (name.includes("prime") || name.includes("amazon")) return "https://www.primevideo.com/";
  if (name.includes("disney") || name.includes("ดิสนีย์") || name.includes("hotstar")) return "https://www.hotstar.com/th";
  if (name.includes("monomax") || name.includes("โมโน")) return "https://www.monomax.me/";
  if (name.includes("iqiyi") || name.includes("อ้ายฉีอี้")) return "https://www.iq.com/";
  if (name.includes("wetv")) return "https://wetv.vip/th";
  if (name.includes("viu") || name.includes("วิว")) return "https://www.viu.com/";
  if (name.includes("hbo") || name.includes("max")) return "https://www.max.com/";
  if (name.includes("youtube")) return "https://www.youtube.com/";
  if (name.includes("spotify")) return "https://open.spotify.com/";
  if (name.includes("canva")) return "https://www.canva.com/";
  return "";
}

// Quick Renewal Action (Pre-fills Support Chat or Order)
function handleQuickRenewal(appName, packageName) {
  const msg = `สนใจต่ออายุแพ็กเกจ ${appName} (${packageName}) ครับ รบกวนแจ้งยอดชำระเงินให้ด้วยครับ`;
  if (window.liff && liff.isInClient()) {
    liff.sendMessages([{
      type: "text",
      text: msg
    }]).then(() => {
      showToast("ส่งข้อความต่ออายุเข้าแชท LINE OA สำเร็จแล้ว", "success");
    }).catch(() => {
      window.open(`https://line.me/R/oaMessage/${CONFIG.LINE_OA_HANDLE}/?${encodeURIComponent(msg)}`, '_blank');
    });
  } else {
    window.open(`https://line.me/R/oaMessage/${CONFIG.LINE_OA_HANDLE}/?${encodeURIComponent(msg)}`, '_blank');
  }
}

function extractPattern(rawText, regex) {
  if (!rawText) return null;
  const match = rawText.match(regex);
  return match ? match[1].trim() : null;
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

// ================= LIVE SUPPORT CHAT CONTROLLER =================
let activeSupportTicket = null;
let supportChatMessages = [];
let chatPollingTimer = null;
let adminTicketsList = [];

async function initSupportChat() {
  const adminToolbar = document.getElementById("admin-support-toolbar");
  const customerCode = localStorage.getItem("boss_customer_code") || (userBindings && userBindings[0] ? userBindings[0].customer_name : "") || "GUEST";
  
  if (currentUser && currentUser.isAdmin) {
    if (adminToolbar) adminToolbar.style.display = "flex";
    await loadAdminTicketsList();
  } else {
    if (adminToolbar) adminToolbar.style.display = "none";
    try {
      // 1. Check if customer already has an active support ticket
      const tickets = await supabaseFetch(`support_tickets?customer_name=eq.${encodeURIComponent(customerCode)}&order=created_at.desc&limit=1`);
      
      if (tickets && tickets.length > 0) {
        activeSupportTicket = tickets[0];
      } else {
        activeSupportTicket = null;
      }

      if (activeSupportTicket) {
        await fetchSupportMessages();
      }
    } catch (err) {
      console.warn("initSupportChat err:", err);
    }
  }
}

async function loadAdminTicketsList() {
  const selectEl = document.getElementById("admin-ticket-selector");
  if (!selectEl) return;

  try {
    const tickets = await supabaseFetch(`support_tickets?order=updated_at.desc&limit=30`);
    if (Array.isArray(tickets)) {
      adminTicketsList = tickets;
      
      if (tickets.length === 0) {
        selectEl.innerHTML = `<option value="">-- ยังไม่มีรายการแจ้งเรื่องจากลูกค้า --</option>`;
        return;
      }

      let html = "";
      tickets.forEach(t => {
        let statusBadge = "🔴 รอตอบ";
        if (t.status === "in_progress") statusBadge = "🟡 กำลังคุย";
        else if (t.status === "resolved") statusBadge = "🟢 ปิดแล้ว";

        const selectedAttr = (activeSupportTicket && activeSupportTicket.id === t.id) ? "selected" : "";
        html += `<option value="${t.id}" ${selectedAttr}>${statusBadge} ลูกค้า: ${escapeHtml(t.customer_name)} (${escapeHtml(t.subject || 'แจ้งเรื่อง')})</option>`;
      });

      selectEl.innerHTML = html;

      if (!activeSupportTicket && tickets.length > 0) {
        activeSupportTicket = tickets[0];
      }

      if (activeSupportTicket) {
        await fetchSupportMessages();
      }
    }
  } catch (err) {
    console.warn("loadAdminTicketsList err:", err);
  }
}

async function switchAdminChatTicket(ticketId) {
  if (!ticketId) return;
  const found = adminTicketsList.find(t => t.id === ticketId);
  if (found) {
    activeSupportTicket = found;
    await fetchSupportMessages();
  } else {
    try {
      const res = await supabaseFetch(`support_tickets?id=eq.${ticketId}`);
      if (res && res[0]) {
        activeSupportTicket = res[0];
        await fetchSupportMessages();
      }
    } catch (e) {
      console.warn(e);
    }
  }
}

async function resolveCurrentSupportTicket() {
  if (!activeSupportTicket) {
    showToast("กรุณาเลือกเคสลูกค้าก่อนครับ", "warning");
    return;
  }

  try {
    // 1. Send resolution message
    const msgPayload = {
      ticket_id: activeSupportTicket.id,
      sender_type: "admin",
      sender_name: "แอด Boss",
      message_text: "✅ แอดมินทำการตรวจสอบและแก้ไขปัญหาเรียบร้อยแล้วครับ หากยังพบปัญหา สามารถพิมพ์แจ้งเพิ่มเติมในนี้ได้ทันทีครับ!",
      is_read: true
    };

    await supabaseFetch("support_messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msgPayload)
    });

    // 2. Update ticket status to resolved
    await supabaseFetch(`support_tickets?id=eq.${activeSupportTicket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved", updated_at: new Date().toISOString() })
    });

    showToast("✅ ทำการปิดเคสนี้เรียบร้อยแล้ว!", "success");
    await loadAdminTicketsList();
  } catch (err) {
    console.error("resolveCurrentSupportTicket err:", err);
  }
}

async function fetchSupportMessages() {
  if (!activeSupportTicket) return;
  try {
    const msgs = await supabaseFetch(`support_messages?ticket_id=eq.${activeSupportTicket.id}&order=created_at.asc`);
    if (Array.isArray(msgs)) {
      supportChatMessages = msgs;
      renderSupportChatUI();
    }
  } catch (err) {
    console.warn("fetchSupportMessages err:", err);
  }
}

function renderSupportChatUI() {
  const container = document.getElementById("chat-messages-container");
  if (!container) return;

  if (!supportChatMessages || supportChatMessages.length === 0) {
    container.innerHTML = `
      <div class="chat-empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <div style="font-weight: 600; color: #fff; font-size: 13px; margin-top: 6px;">ยินดีต้อนรับสู่แชทช่วยเหลือ BOSS Premium</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">พิมพ์ข้อความหรือเลือกหัวข้อยอดฮิตด้านบนเพื่อเริ่มสนทนาได้เลยครับ</div>
      </div>
    `;
    return;
  }

  const adminCrownSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" stroke="#eab308" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: -1px; margin-right: 3px; filter: drop-shadow(0 0 5px rgba(250, 204, 21, 0.6));"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path></svg>`;

  const isAdminView = currentUser && currentUser.isAdmin;

  let html = "";
  supportChatMessages.forEach(msg => {
    const isCustomer = msg.sender_type === "customer";
    const rowClass = isCustomer ? "customer" : "admin";
    const senderTitleHtml = isCustomer 
      ? escapeHtml(msg.sender_name || "ลูกค้า") 
      : `${adminCrownSvg}<span style="color: #fde047; font-weight: 700;">แอด Boss</span>`;
    const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + " น." : "";

    const msgMenuHtml = (isAdminView && msg.id) ? `
      <div class="msg-menu-wrapper">
        <button class="btn-msg-options" onclick="toggleMsgContextMenu(event, '${msg.id}')" title="ตัวเลือกข้อความ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2.5"></circle>
            <circle cx="12" cy="12" r="2.5"></circle>
            <circle cx="12" cy="19" r="2.5"></circle>
          </svg>
        </button>
        <div id="msg-dropdown-${msg.id}" class="msg-context-dropdown">
          <button class="dropdown-item danger" onclick="unsendSupportChatMessage('${msg.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            ยกเลิกการส่งข้อความ
          </button>
          <button class="dropdown-item" onclick="copyToClipboard('${escapeHtml(msg.message_text)}', 'ข้อความ')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            คัดลอกข้อความ
          </button>
        </div>
      </div>
    ` : ``;

    html += `
      <div class="chat-msg-row ${rowClass}">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; position: relative;">
          <span class="chat-sender-name">${senderTitleHtml}</span>
          ${msgMenuHtml}
        </div>
        <div class="chat-bubble">
          <div>${escapeHtml(msg.message_text)}</div>
          <div class="chat-msg-time">${timeStr}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function toggleMsgContextMenu(event, msgId) {
  event.stopPropagation();
  document.querySelectorAll(".msg-context-dropdown.active").forEach(el => {
    if (el.id !== `msg-dropdown-${msgId}`) el.classList.remove("active");
  });

  const dropdown = document.getElementById(`msg-dropdown-${msgId}`);
  if (dropdown) {
    dropdown.classList.toggle("active");
  }
}

document.addEventListener("click", () => {
  document.querySelectorAll(".msg-context-dropdown.active").forEach(el => el.classList.remove("active"));
});

async function unsendSupportChatMessage(msgId) {
  if (!msgId) return;
  if (!confirm("คุณต้องการยกเลิกการส่งข้อความนี้ใช่หรือไม่?")) return;

  try {
    // 1. Optimistic remove local
    supportChatMessages = supportChatMessages.filter(m => m.id !== msgId);
    renderSupportChatUI();

    // 2. Delete message in Supabase
    await supabaseFetch(`support_messages?id=eq.${msgId}`, {
      method: "DELETE"
    });

    showToast("ยกเลิกการส่งข้อความเรียบร้อยแล้ว", "success");
    fetchSupportMessages();
  } catch (err) {
    console.error("unsendSupportChatMessage err:", err);
    showToast("ไม่สามารถยกเลิกข้อความได้", "warning");
  }
}

async function submitSupportChatMessage(customText = null) {
  const inputEl = document.getElementById("chat-input-text");
  const textVal = customText || (inputEl ? inputEl.value.trim() : "");
  if (!textVal) return;

  if (inputEl && !customText) inputEl.value = "";

  const isAdminSender = currentUser && currentUser.isAdmin;
  const customerCode = localStorage.getItem("boss_customer_code") || (userBindings && userBindings[0] ? userBindings[0].customer_name : "") || "GUEST";
  const senderName = isAdminSender ? "แอด Boss" : (currentUser ? (currentUser.displayName || customerCode) : customerCode);
  const senderType = isAdminSender ? "admin" : "customer";

  try {
    // 1. Create Ticket if not exists (for non-admin customers)
    if (!activeSupportTicket && !isAdminSender) {
      const newTicketPayload = {
        customer_name: customerCode,
        customer_line_id: currentUser ? currentUser.userId || "" : "",
        subject: textVal.length > 35 ? textVal.substring(0, 35) + "..." : textVal,
        status: "open"
      };

      const res = await supabaseFetch("support_tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify(newTicketPayload)
      });

      if (Array.isArray(res) && res[0]) {
        activeSupportTicket = res[0];
      }
    }

    if (!activeSupportTicket) {
      showToast("กรุณาเลือกเคสลูกค้าก่อนส่งข้อความครับ", "warning");
      return;
    }

    // 2. Post Chat Message to Supabase
    const msgPayload = {
      ticket_id: activeSupportTicket.id,
      sender_type: senderType,
      sender_name: senderName,
      message_text: textVal,
      is_read: isAdminSender
    };

    // Optimistic UI push
    supportChatMessages.push({
      ...msgPayload,
      created_at: new Date().toISOString()
    });
    renderSupportChatUI();

    await supabaseFetch("support_messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(msgPayload)
    });

    // Update ticket updated_at & status
    const newStatus = isAdminSender ? "in_progress" : "open";
    await supabaseFetch(`support_tickets?id=eq.${activeSupportTicket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() })
    });

    fetchSupportMessages();
    if (isAdminSender) loadAdminTicketsList();
  } catch (err) {
    console.error("submitSupportChatMessage err:", err);
  }
}

function sendQuickTopic(topicText) {
  submitSupportChatMessage(topicText);
}

function handleChatKeyDown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitSupportChatMessage();
  }
}

let chatRealtimeChannel = null;

function subscribeChatRealtime() {
  if (window.supabaseClient && activeSupportTicket) {
    try {
      if (chatRealtimeChannel) {
        window.supabaseClient.removeChannel(chatRealtimeChannel);
      }
      chatRealtimeChannel = window.supabaseClient
        .channel(`support_chat_${activeSupportTicket.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `ticket_id=eq.${activeSupportTicket.id}`
        }, (payload) => {
          if (payload.new) {
            fetchSupportMessages();
          }
        })
        .subscribe();
    } catch (e) {
      console.warn("subscribeChatRealtime err:", e);
    }
  }
}

async function startChatPolling() {
  stopChatPolling();
  await initSupportChat();
  subscribeChatRealtime();

  fetchSupportMessages();
  if (currentUser && currentUser.isAdmin) {
    loadAdminTicketsList();
  }

  chatPollingTimer = setInterval(() => {
    const tabPane = document.getElementById("tab-support-pane");
    if (tabPane && tabPane.style.display !== "none") {
      fetchSupportMessages();
      if (currentUser && currentUser.isAdmin) {
        loadAdminTicketsList();
      }
    }
  }, 2500);
}

function stopChatPolling() {
  if (chatPollingTimer) {
    clearInterval(chatPollingTimer);
    chatPollingTimer = null;
  }
  if (window.supabaseClient && chatRealtimeChannel) {
    try {
      window.supabaseClient.removeChannel(chatRealtimeChannel);
      chatRealtimeChannel = null;
    } catch (e) {
      console.warn(e);
    }
  }
}

function populateAppSelect() {
  const select = document.getElementById("modal-app-select");
  if (!select) return;
  select.innerHTML = `<option value="">-- เลือกแอป --</option>`;
  catalogApps.forEach(a => {
    select.innerHTML += `<option value="${a.id}">${escapeHtml(a.display_name || a.name)}</option>`;
  });
}

function openProblemModal(appName, subId) {
  switchTab("support");
  const modal = document.getElementById("action-modal");
  modal.classList.add("active");
}

function openRenewCatalog(appName) {
  switchTab("catalog");
}

function selectPackageForPurchase(appId) {
  const app = catalogApps.find(a => a.id === appId);
  if (!app) return;

  const appPkgs = catalogPackages.filter(p => p.app_id === appId);
  let pkgMsg = `แพ็คเกจของ ${app.display_name || app.name}:\n`;
  appPkgs.forEach(p => {
    pkgMsg += `• ${p.name} ➔ ${p.price} บาท\n`;
  });
  pkgMsg += `\nกรุณาแจ้งแอดมินทาง LINE OA เพื่อยืนยันการสั่งซื้อได้เลยครับ!`;

  alert(pkgMsg);

  if (window.liff && liff.isInClient() && liff.sendMessages) {
    liff.sendMessages([
      {
        type: 'text',
        text: `สนใจสั่งซื้อ ${app.display_name || app.name} ครับ`
      }
    ]).then(() => {
      liff.closeWindow();
    }).catch(err => {
      console.warn("Failed to send message via LIFF:", err);
    });
  }
}

// 6. Tab Switcher Logic with Directional Spatial 3D Motion & Hologram Shimmer
let activeTabName = "subs";
let isTabSwitching = false;
const tabIndices = { subs: 0, catalog: 1, history: 2, support: 3 };

function switchTab(tabName) {
  if (isTabSwitching) return;

  const targetPane = document.getElementById(`tab-${tabName}-pane`);
  if (activeTabName === tabName && targetPane && targetPane.style.display !== "none") return;

  const panes = {
    subs: document.getElementById("tab-subscriptions-pane"),
    catalog: document.getElementById("tab-catalog-pane"),
    history: document.getElementById("tab-history-pane"),
    support: document.getElementById("tab-support-pane")
  };

  const navs = {
    subs: document.getElementById("nav-subs"),
    catalog: document.getElementById("nav-catalog"),
    history: document.getElementById("nav-history"),
    support: document.getElementById("nav-support")
  };

  // 1. Immediately update navigation bar active state
  Object.keys(navs).forEach(k => {
    if (navs[k]) navs[k].classList.toggle("active", k === tabName);
  });

  const oldIndex = tabIndices[activeTabName] !== undefined ? tabIndices[activeTabName] : 0;
  const newIndex = tabIndices[tabName] !== undefined ? tabIndices[tabName] : 0;
  const isMovingRight = newIndex >= oldIndex;

  const oldPane = panes[activeTabName];
  const newPane = panes[tabName];

  if (!oldPane || !newPane) {
    Object.keys(panes).forEach(k => {
      if (panes[k]) {
        panes[k].style.display = (k === tabName) ? (k === "support" ? "flex" : "block") : "none";
        panes[k].classList.toggle("active", k === tabName);
      }
    });
    activeTabName = tabName;
    return;
  }

  isTabSwitching = true;
  activeTabName = tabName;

  // Clear previous animation classes
  oldPane.classList.remove("tab-unfold-left", "tab-unfold-right", "tab-fold-left", "tab-fold-right", "tab-unfold-in", "tab-fold-out", "active");
  newPane.classList.remove("tab-unfold-left", "tab-unfold-right", "tab-fold-left", "tab-fold-right", "tab-unfold-in", "tab-fold-out");

  const foldOutClass = isMovingRight ? "tab-fold-left" : "tab-fold-right";
  const unfoldInClass = isMovingRight ? "tab-unfold-right" : "tab-unfold-left";

  // 2. Animate fold-out in direction of motion on old pane
  oldPane.classList.add(foldOutClass);

  setTimeout(() => {
    oldPane.style.display = "none";
    oldPane.classList.remove(foldOutClass);

    // 3. Display new pane and trigger 3D elastic spring unfold animation
    newPane.style.display = (tabName === "support") ? "flex" : "block";
    newPane.classList.add(unfoldInClass, "active");

    setTimeout(() => {
      newPane.classList.remove(unfoldInClass);
      isTabSwitching = false;
      checkFloatingScrollButton();
    }, 280);
  }, 140);
  checkFloatingScrollButton();

  const isSupportTab = (tabName === "support");
  document.body.classList.toggle("support-tab-active", isSupportTab);

  if (isSupportTab) {
    startChatPolling();
    setTimeout(() => {
      const msgBox = document.getElementById("chat-messages-container");
      if (msgBox) {
        msgBox.scrollTop = msgBox.scrollHeight;
      }
    }, 160);
  } else {
    stopChatPolling();
  }
}

// 7. Event Listeners Setup
document.addEventListener("DOMContentLoaded", () => {
  initLiff();
  initWelcomeBanner();

  // On-Demand Search Bar Event Listeners
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      handleSearchChange(e.target.value);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSearchBar();
      }
    });
  }

  // Global Keyboard Shortcuts: '/' or 'Ctrl+K' / 'Cmd+K' to open search, 'Escape' to close
  document.addEventListener("keydown", (e) => {
    const isEditingInput = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.isContentEditable);
    if (!isEditingInput && e.key === "/") {
      e.preventDefault();
      openSearchBar();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      toggleSearchBar();
    } else if (e.key === "Escape") {
      closeSearchBar();
    }
  });

  // Navigation Bar Tabs
  const navSubs = document.getElementById("nav-subs");
  if (navSubs) navSubs.addEventListener("click", () => switchTab("subs"));

  const navCatalog = document.getElementById("nav-catalog");
  if (navCatalog) navCatalog.addEventListener("click", () => switchTab("catalog"));

  const navHistory = document.getElementById("nav-history");
  if (navHistory) navHistory.addEventListener("click", () => switchTab("history"));

  const navSupport = document.getElementById("nav-support");
  if (navSupport) navSupport.addEventListener("click", () => switchTab("support"));

  // Refresh Buttons
  const refreshSubsBtn = document.getElementById("btn-refresh-subs");
  if (refreshSubsBtn) {
    refreshSubsBtn.addEventListener("click", () => {
      loadAppData();
      showToast("รีเฟรชข้อมูลสิทธิ์เรียบร้อยแล้ว", "success");
    });
  }

  const refreshHistoryBtn = document.getElementById("btn-refresh-history");
  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", () => {
      loadAppData();
      showToast("อัปเดตประวัติการสั่งซื้อเรียบร้อยแล้ว", "success");
    });
  }

  // Open Support Modals
  const openOtpBtn = document.getElementById("btn-open-otp-modal");
  if (openOtpBtn) {
    openOtpBtn.addEventListener("click", () => {
      const typeSelect = document.getElementById("modal-type-select");
      if (typeSelect) typeSelect.value = "otp_needed";
      const actionModal = document.getElementById("action-modal");
      if (actionModal) actionModal.classList.add("active");
    });
  }

  const openIssueBtn = document.getElementById("btn-open-issue-modal");
  if (openIssueBtn) {
    openIssueBtn.addEventListener("click", () => {
      const typeSelect = document.getElementById("modal-type-select");
      if (typeSelect) typeSelect.value = "screen_full";
      const actionModal = document.getElementById("action-modal");
      if (actionModal) actionModal.classList.add("active");
    });
  }

  // Modal Close Button
  const modalCloseBtn = document.getElementById("modal-close-btn");
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => {
      const actionModal = document.getElementById("action-modal");
      if (actionModal) actionModal.classList.remove("active");
    });
  }

  // Modal Form Submission
  const actionForm = document.getElementById("action-form");
  if (actionForm) {
    actionForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const type = document.getElementById("modal-type-select")?.value || "";
      const note = document.getElementById("modal-note-input")?.value || "";

      alert("ส่งคำร้องสำเร็จ! แอดมิน BOSS Premium จะเร่งตรวจสอบและดำเนินการให้ทันทีครับ");
      const actionModal = document.getElementById("action-modal");
      if (actionModal) actionModal.classList.remove("active");

      if (window.liff && liff.isInClient() && liff.sendMessages) {
        liff.sendMessages([
          {
            type: 'text',
            text: `[คำร้องลูกค้า] ${type === 'otp_needed' ? 'ขอรหัส OTP Disney+' : 'แจ้งปัญหาการใช้งาน'} ${note ? '(' + note + ')' : ''}`
          }
        ]).then(() => {
          liff.closeWindow();
        }).catch(() => { });
      }
    });
  }

  // Catalog Sort Selector
  const sortSelect = document.getElementById("catalog-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      selectedSortOption = e.target.value;
      renderCatalog();
    });
  }

  // Category Filter Chips
  const filterChips = document.querySelectorAll(".filter-chip");
  filterChips.forEach(chip => {
    chip.addEventListener("click", (e) => {
      const cat = e.currentTarget.getAttribute("data-category");
      setCatalogCategory(cat);
    });
  });

  // Package Purchase Modal Controls
  const purchaseCloseBtn = document.getElementById("purchase-modal-close-btn");
  if (purchaseCloseBtn) {
    purchaseCloseBtn.addEventListener("click", () => {
      document.getElementById("purchase-modal").classList.remove("active");
    });
  }

  const confirmPurchaseBtn = document.getElementById("btn-confirm-purchase");
  if (confirmPurchaseBtn) {
    confirmPurchaseBtn.addEventListener("click", confirmPackagePurchase);
  }

  // Success Receipt Modal Controls
  const successCloseBtn = document.getElementById("success-modal-close-btn");
  if (successCloseBtn) {
    successCloseBtn.addEventListener("click", () => {
      document.getElementById("order-checkout-success-modal").classList.remove("active");
    });
  }

  const copyReceiptBtn = document.getElementById("btn-copy-receipt-summary");
  if (copyReceiptBtn) {
    copyReceiptBtn.addEventListener("click", () => {
      copyToClipboard(lastOrderSummaryText, "รายละเอียดคำสั่งซื้อ");
    });
  }

  const openLineBtn = document.getElementById("btn-open-line-oa");
  if (openLineBtn) {
    openLineBtn.addEventListener("click", () => {
      if (window.liff && liff.isInClient() && liff.sendMessages) {
        liff.sendMessages([
          {
            type: 'text',
            text: lastOrderSummaryText
          }
        ]).then(() => {
          showToast("ส่งรายการสั่งซื้อเข้าแชท LINE OA เรียบร้อย!", "success");
          liff.closeWindow();
        }).catch(() => {
          window.open(CONFIG.LINE_OA_LINK, "_blank");
        });
      } else {
        window.open(CONFIG.LINE_OA_LINK, "_blank");
      }
    });
  }

  // Admin Promo Modal Listeners
  const adminPromoCloseBtn = document.getElementById("admin-promo-modal-close-btn");
  if (adminPromoCloseBtn) {
    adminPromoCloseBtn.addEventListener("click", () => {
      document.getElementById("admin-promo-modal").classList.remove("active");
    });
  }

  const adminAddPromoBtn = document.getElementById("btn-admin-add-promo");
  if (adminAddPromoBtn) {
    adminAddPromoBtn.addEventListener("click", () => {
      resetPromoForm();
      document.getElementById("admin-promo-form").style.display = "block";
    });
  }

  const cancelPromoFormBtn = document.getElementById("btn-cancel-promo-form");
  if (cancelPromoFormBtn) {
    cancelPromoFormBtn.addEventListener("click", () => {
      document.getElementById("admin-promo-form").style.display = "none";
    });
  }

  const adminPromoForm = document.getElementById("admin-promo-form");
  if (adminPromoForm) {
    adminPromoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const editId = document.getElementById("promo-edit-id").value;
      const title = document.getElementById("promo-input-title").value.trim();
      const description = document.getElementById("promo-input-desc").value.trim();
      const banner_image = document.getElementById("promo-input-banner-image") ? document.getElementById("promo-input-banner-image").value.trim() : "";
      const promo_type = document.getElementById("promo-input-type").value;
      const badge_text = document.getElementById("promo-input-badge-text").value.trim();
      const origPrice = document.getElementById("promo-input-original-price").value;
      const promoPrice = document.getElementById("promo-input-promo-price").value;
      const action_payload = document.getElementById("promo-input-action-payload").value.trim();
      const display_order = parseInt(document.getElementById("promo-input-order").value) || 1;
      const is_active = document.getElementById("promo-input-active").value === "true";

      const payload = {
        title,
        description: description || null,
        banner_image: banner_image || null,
        promo_type,
        badge_text: badge_text || null,
        original_price: origPrice ? parseFloat(origPrice) : null,
        promo_price: parseFloat(promoPrice),
        action_payload: action_payload || `สนใจโปรโมชั่น: ${title} ราคา ${promoPrice} บาท ครับ`,
        display_order,
        is_active
      };

      try {
        if (editId) {
          await supabaseFetch(`promotions?id=eq.${editId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
          showToast("แก้ไขโปรโมชั่นเรียบร้อยแล้ว", "success");
        } else {
          await supabaseFetch("promotions", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          showToast("สร้างโปรโมชั่นใหม่สำเร็จ", "success");
        }

        document.getElementById("admin-promo-form").style.display = "none";
        await fetchAndRenderPromotions();
        renderAdminPromosList();
      } catch (err) {
        alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
      }
    });
  }
});

// =========================================================================
// ⚡ PROMOTIONS & BANNER MANAGEMENT CORE LOGIC
// =========================================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatShortThaiDate(d) {
  if (!d || isNaN(d.getTime())) return "23.59 น.";
  const shortThaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const day = d.getDate();
  const month = shortThaiMonths[d.getMonth()];
  return `${day} ${month} 23.59 น.`;
}

async function fetchNetflixClearanceStock() {
  try {
    let accounts = await supabaseFetch(`accounts?status=eq.available&select=*,app:apps(*)`) || [];

    // Filter available accounts for shop
    accounts = accounts.filter(acc => acc.status === 'available');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const clearanceAccounts = accounts.filter(acc => {
      const appName = ((acc.app && (acc.app.name || acc.app.display_name)) || "").toLowerCase();
      const isNetflix = appName.includes("netflix") || !acc.app;
      if (!isNetflix || !acc.expiry_date) return false;

      const expDate = new Date(acc.expiry_date);
      if (isNaN(expDate.getTime())) return false;

      const startOfExpDay = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
      const diffDays = Math.round((startOfExpDay - startOfToday) / (1000 * 60 * 60 * 24)) + 1;

      // Active clearance screen condition (matches extension content.js 100%: 1 to 29 days)
      return diffDays > 0 && diffDays < 30;
    });

    const stockCount = clearanceAccounts.length;
    if (stockCount === 0) return null;

    // Sort clearance accounts by expiry_date descending (pick freshest clearance screen)
    clearanceAccounts.sort((a, b) => new Date(b.expiry_date) - new Date(a.expiry_date));
    const targetAccount = clearanceAccounts[0];

    const expDateObj = new Date(targetAccount.expiry_date);
    const startOfExpDay = new Date(expDateObj.getFullYear(), expDateObj.getMonth(), expDateObj.getDate());
    const remDays = Math.round((startOfExpDay - startOfToday) / (1000 * 60 * 60 * 24)) + 1;

    const expiryFormattedText = formatShortThaiDate(expDateObj);

    // 1. Detect device type of the target clearance account
    const isTv = targetAccount.device_type
      ? (targetAccount.device_type.toLowerCase() === 'tv' || targetAccount.device_type.includes('ทีวี'))
      : (/จอ\s*5/.test(targetAccount.profile_name || "") || (targetAccount.profile_name || "").toLowerCase().includes("tv"));

    // 2. Fetch or reuse catalogPackages to match exact package tiers like Extension content.js
    if (!catalogPackages || catalogPackages.length === 0) {
      catalogPackages = await supabaseFetch("packages?select=*&order=price.asc") || [];
    }

    let netflixPackages = (catalogPackages || []).filter(p => {
      const pName = (p.name || "").toLowerCase();
      const isTvPkg = pName.includes("tv") || pName.includes("ทีวี") || pName.includes("ทุกอุปกรณ์");
      const isNf = pName.includes("netflix") || (p.app && (p.app.name || "").toLowerCase().includes("netflix"));
      return isNf && isTvPkg === isTv;
    });

    if (netflixPackages.length === 0) {
      netflixPackages = isTv
        ? [{ days: 7, price: 79 }, { days: 15, price: 109 }, { days: 30, price: 170 }]
        : [{ days: 7, price: 69 }, { days: 15, price: 99 }, { days: 30, price: 120 }];
    }

    netflixPackages.sort((a, b) => (a.days || 30) - (b.days || 30));

    // 3. Find matching package duration tier (Tier classification identical to Extension content.js)
    let matchedPkg = netflixPackages.find(p => remDays <= (p.days || 30));
    if (!matchedPkg) {
      matchedPkg = netflixPackages[netflixPackages.length - 1];
    }

    const pkgDays = matchedPkg.days || 30;
    const basePrice = matchedPkg.price || (isTv ? 170 : 120);
    const calculatedPrice = Math.round((remDays / pkgDays) * basePrice);
    const originalPrice = basePrice;
    const deviceTitle = isTv ? "สมาร์ททีวี/ทุกอุปกรณ์" : "มือถือ/แท็บเล็ต";

    return {
      stockCount: stockCount,
      minDays: remDays,
      estimatedPrice: calculatedPrice,
      originalPrice: originalPrice,
      expiryText: expiryFormattedText,
      title: `📦 จอโล๊ะ Netflix 4K (${deviceTitle})`,
      description: `⚡️ [โละเคลียร์สต็อก] เหลือ ${remDays} วัน (หมด ${expiryFormattedText}) เพียง ${calculatedPrice}.-`
    };
  } catch (err) {
    return null;
  }
}

const defaultNetflixTop10 = [
  { rank: 1, title: "คนเดือดทวงแค้น", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABaoPLMTIeLwY1BbKUyNh2_bWhkSyXXAI_Nb2qgVNa9BUzNJYqR-5N3t8Iu1cuo3-BdaQOjZYFwCHD5JnVt2oee6O1n7LUSv_JAbGwl6ZZFnDolcMz8DfL06nyDn_EgLOpESX.webp?r=b2c" },
  { rank: 2, title: "อย่างนี้ต้องโดนสั่งสอน", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABWYECiQdsIPT75JErblpB9gkfncPOdnnn9tZVCbeufWDXfKeBIpio7dArmT3AGAW3Y28n4wzZtGu73n-ICUGtTobZcWNwXht1q7jmjnzu5Q3yLBkJ-643XURQUv2TxjOH68C.webp?r=47b" },
  { rank: 3, title: "ทนายปีศาจ", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABZWTBxtjT2q1168G4W1fLEwPL6VR2n3K0Zxm3eB4fa7MeOfZiVBP5iCwMfZFCBkUyNC6434b7SAYvp79amC4g4GNR2eaXxGnzV83gcQyLBYqLd05i6wTO26PNKg46SRkh3Be.webp?r=a50" },
  { rank: 4, title: "รักติดหนึบ", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABaYUnVRarkuZ7JA_vk6Lk4XUmkk6EZBYCvIKUkOwqh_7FjHWBhdGoYsLO6FbMfGlrHQPGDOemcKuOW7asTyPOwftvC_U7gTklR46rzDTlumzUg3m7XkrTAIUcNMUBebf6lC8.webp?r=8d0" },
  { rank: 5, title: "บูรพาอาถรรพ์", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABSoWwnGX7osRcxIsq-1ZFyYhpgvNAw4feCyhos2te8rk_V0dGPX3mx1CRfHbpCS8qQ9mvIvl9o2oOHhKxPpR6sCMZKJv320jPhhSeOulhJmOLPWoZCTNEx4O_Zwihemvry4q.webp?r=ae8" },
  { rank: 6, title: "บ้านหลังสุดท้าย", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABT_JaD2VupKxB9-mG5xTvon3PjO8K239VA0QDoSrArMHjBcgD2QNZn4w5qKxxZafgcY33zhNGI3gmv_5R7LDqEhJMXIe6vlD2ABE92r_Eblvzz1TaZGk3mLTsn1EUFws3EiK.webp?r=c50" },
  { rank: 7, title: "เณรน้อยเจ้าอภินิหาร", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABRkmoGyijhjvOvV-HllbRc9dCKmXz3-oP5_XeVUFiAyWkO8clPLqkZ87xJ3yEdq0HT28sL2CQYp2WQ_77nE42lVQZyvYFh5jOGrGpVm82mgFe9B_VibFU8qIz8ALxmWQzMLo.webp?r=a76" },
  { rank: 8, title: "ทางสู่ฝันของนานโด", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABfPJ2AYOi53NDQCNOdjbmZL0xQW_gDoxm1lQBnWbale_N-36VwbrFidNJMud7LmnLmaHXvymca1YBVW5BwUdaXBJ373ccp5Sms98-BIwrLKX5f19DY1tSoZkrGg-5nQiVxcJ.webp?r=71c" },
  { rank: 9, title: "คุยกับฆาตกร: ชาร์ลส์ แมนสัน", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABcc81MJ4Lh1059ARvLYKxXXiBjo0Qxi4L_pIYo2i13a1zuzYd8WfaaScJ6XXapAjDsSCRw1xXHmWc02H0XZlyTE-bTAm-RC0JUl_UdKFfqwap1hV359SwSdT2TA4r-TgSpD9.webp?r=319" },
  { rank: 10, title: "หน่วยจู่โจมมือพระกาฬ", poster: "https://occ-0-3706-325.1.nflxso.net/dnm/api/v6/mAcAr9TxZIVbINe88xb3Teg5_OA/AAAABeCMw6YtXTYihQ7NPT5-TysiOSP-e_uoWAEwx0XOLy5qar3uUCImhJOkX8KTTDyEWwg_KFdd4-T171eQDPFss7ltrjeyt0pp5UAiP7clVcVO43idWmZr8V1H_lZoiuSXTVfc.webp?r=dd5" }
];

async function fetchNetflixTop10Data() {
  return defaultNetflixTop10;
}

async function fetchAndRenderPromotions() {
  const container = document.getElementById("promotions-container");
  if (!container) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (typeof document !== 'undefined' && document.hidden) return;

  try {
    const data = await supabaseFetch("promotions?select=*&order=display_order.asc,created_at.desc");
    promotionsData = data || [];

    let activePromos = promotionsData.filter(p => p.is_active !== false);

    // Auto-fetch Netflix Clearance Stock for shop Ud624479284e7b16f667193128ae8d9c9
    const clearanceInfo = await fetchNetflixClearanceStock();
    if (clearanceInfo && clearanceInfo.stockCount > 0) {
      const autoClearancePromo = {
        id: "auto-netflix-clearance",
        title: clearanceInfo.title || "📦 จอโล๊ะ Netflix 4K (มือถือ/แท็บเล็ต)",
        description: clearanceInfo.description || `⚡️ [โละเคลียร์สต็อก] เหลือ ${clearanceInfo.minDays} วัน เพียง ${clearanceInfo.estimatedPrice}.-`,
        promo_price: clearanceInfo.estimatedPrice || 112,
        original_price: clearanceInfo.originalPrice || 120,
        badge_text: "⚡ จอโล๊ะเคลียร์สต๊อก",
        banner_image: "promo_clearance.png",
        is_auto_clearance: true,
        stock_count: clearanceInfo.stockCount,
        script_url: "https://www.netflix.com/"
      };

      // Always unshift as a dedicated extra clearance card
      activePromos.unshift(autoClearancePromo);
    }

    // Auto-fetch Netflix Top 10 Thailand Trending
    const top10List = await fetchNetflixTop10Data();
    if (top10List && top10List.length > 0) {
      window._netflixTop10List = top10List;
      const firstItem = top10List[0];
      const autoTop10Promo = {
        id: "auto-netflix-top10",
        title: `🔥 อันดับ 1: ${firstItem.title}`,
        description: `🎬 10 อันดับหนัง/ซีรีส์ฮิต Netflix ไทย อัปเดตรายสัปดาห์`,
        promo_price: 170,
        original_price: 199,
        badge_text: "🔥 TOP 10 ในไทย",
        banner_image: firstItem.poster,
        is_auto_top10: true,
        script_url: "https://www.netflix.com/"
      };

      activePromos.push(autoTop10Promo);
    }

    if (!activePromos || activePromos.length === 0) {
      document.getElementById("promotions-section").style.display = "none";
      return;
    }

    document.getElementById("promotions-section").style.display = "block";
    const badgeCount = document.getElementById("promo-badge-count");
    if (badgeCount) badgeCount.textContent = `${activePromos.length} รายการเด็ด`;

    let html = "";
    activePromos.forEach((promo, idx) => {
      const badgeText = promo.badge_text || (
        promo.promo_type === 'flash_sale' ? 'FLASH SALE' :
          promo.promo_type === 'bundle' ? 'ซื้อคู่คุ้มกว่า' : 'เคลียร์สต๊อก'
      );

      const thumbImg = promo.banner_image || (
        promo.promo_type === 'flash_sale' ? 'promo_flash.png' :
          promo.promo_type === 'bundle' ? 'promo_bundle.png' :
            'promo_clearance.png'
      );

      let discountTagHtml = '';
      if (promo.original_price && promo.original_price > promo.promo_price) {
        const pct = Math.round(((promo.original_price - promo.promo_price) / promo.original_price) * 100);
        discountTagHtml = `<div class="shopee-discount-tag">-${pct}%</div>`;
      }

      let progressPct = idx === 0 ? 85 : idx === 1 ? 92 : 65;
      let progressLabel = idx === 0 ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="#ffffff" style="vertical-align: -1px; margin-right: 3px;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>ขายแล้ว 85%` :
        idx === 1 ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="#ffffff" style="vertical-align: -1px; margin-right: 3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>เหลือเพียง 2 ชุดสุดท้าย` :
          `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>เคลียร์สต๊อก 65%`;

      if (promo.stock_count !== undefined) {
        progressPct = Math.min(95, Math.max(25, 100 - (promo.stock_count * 12)));
        progressLabel = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#ffffff" style="vertical-align: -1px; margin-right: 3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>⚡ เหลือเพียง ${promo.stock_count} จอสุดท้าย (เรียลไทม์)`;
      }

      let cleanDesc = (promo.description || '')
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Smart Fallback Description (prevent duplicate title & subtitle, show high-converting value proposition)
      if (!cleanDesc || cleanDesc.toLowerCase() === (promo.title || '').trim().toLowerCase()) {
        if (promo.is_auto_clearance) {
          cleanDesc = "⚡️ โละสต็อกราคาสุดคุ้ม ด่วนก่อนหมด";
        } else if ((promo.title || '').toLowerCase().includes("netflix")) {
          cleanDesc = "✨ คมชัดระดับ 4K HDR ลื่นไหลไม่มีสะดุด";
        } else if ((promo.title || '').toLowerCase().includes("mono") || (promo.title || '').toLowerCase().includes("sport")) {
          cleanDesc = "⚽ ดูบอลสดพรีเมียร์ลีก + หนังและซีรีส์ครบ";
        } else if ((promo.title || '').toLowerCase().includes("prime")) {
          cleanDesc = "🎬 หนังและซีรีส์ระดับพรีเมียม ซับไทยครบ";
        } else if ((promo.title || '').toLowerCase().includes("disney") || (promo.title || '').toLowerCase().includes("hotstar")) {
          cleanDesc = "🏰 มาร์เวล ดิสนีย์ และซีรีส์ดังระดับโลก";
        } else {
          cleanDesc = "✨ บัญชีพรีเมียมแท้ 100% ส่งด่วนพร้อมใช้งาน";
        }
      }

      if (promo.is_auto_top10) {
        html += `
          <div class="promo-card vertical-card top10-card-wrapper">
            <div class="card-banner-wrapper">
              <div class="card-banner-img top10-banner-img" style="background-image: url('${thumbImg}'); transition: background-image 0.5s ease;">
                ${discountTagHtml}
                <div class="card-badge-pill">${badgeText}</div>
                <div class="top10-rank-pill">🔥 TOP #1</div>
              </div>
            </div>

            <div class="vertical-card-body">
              <div class="promo-card-title top10-title-animated">${escapeHtml(promo.title)}</div>
              <div class="promo-card-desc">${escapeHtml(cleanDesc)}</div>

              <div class="shopee-progress-bar-container">
                <div class="shopee-progress-fill" style="width: 95%;"></div>
                <div class="shopee-progress-text">🔥 อัปเดตอันดับฮิตประจำสัปดาห์</div>
              </div>
            </div>

            <div class="vertical-card-footer">
              <div class="vertical-price-row">
                <div class="shopee-price-box">
                  ${promo.original_price ? `<span class="promo-original-price">฿${promo.original_price}</span>` : ''}
                  <span class="shopee-flash-price">฿${promo.promo_price}</span>
                </div>
              </div>
              <button type="button" class="btn-shopee-buy btn-full-width" onclick="handlePromoAction('${promo.id}')">
                <span>🎬 สั่งซื้อ Netflix</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </div>
        `;
        return;
      }

      const buyBtnLabel = promo.is_auto_clearance ? '⚡ สั่งซื้อจอโล๊ะ' : '🔥 สั่งซื้อเลย';

      html += `
        <div class="promo-card vertical-card ${promo.is_auto_clearance ? 'auto-clearance-card' : ''}">
          <div class="card-banner-wrapper">
            <div class="card-banner-img" style="background-image: url('${thumbImg}');">
              ${discountTagHtml}
              <div class="card-badge-pill">${badgeText}</div>
            </div>
          </div>

          <div class="vertical-card-body">
            <div class="promo-card-title">${escapeHtml(promo.title)}</div>
            <div class="promo-card-desc">${escapeHtml(cleanDesc)}</div>

            <div class="shopee-progress-bar-container">
              <div class="shopee-progress-fill" style="width: ${progressPct}%;"></div>
              <div class="shopee-progress-text">${progressLabel}</div>
            </div>
          </div>

          <div class="vertical-card-footer">
            <div class="vertical-price-row">
              <div class="shopee-price-box">
                ${promo.original_price ? `<span class="promo-original-price">฿${promo.original_price}</span>` : ''}
                <span class="shopee-flash-price">฿${promo.promo_price}</span>
              </div>
            </div>
            <button type="button" class="btn-shopee-buy btn-full-width" onclick="handlePromoAction('${promo.id}')">
              <span>${buyBtnLabel}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
          </div>
        </div>
      `;
    });

    if (container.dataset.renderedHtml !== html) {
      container.dataset.renderedHtml = html;
      container.innerHTML = html;
      initPromoAutoSlider(activePromos.length);
    }

    // Start Top 10 Internal Poster & Title Slideshow
    if (!window._top10SlideshowTimer && window._netflixTop10List && window._netflixTop10List.length > 0) {
      let top10Idx = 0;
      window._top10SlideshowTimer = setInterval(() => {
        const list = window._netflixTop10List;
        if (!list || list.length === 0) return;
        top10Idx = (top10Idx + 1) % list.length;
        const item = list[top10Idx];

        const cardWrapper = document.querySelector(".top10-card-wrapper");
        if (!cardWrapper) return;

        const imgEl = cardWrapper.querySelector(".top10-banner-img");
        const rankEl = cardWrapper.querySelector(".top10-rank-pill");
        const titleEl = cardWrapper.querySelector(".top10-title-animated");

        if (imgEl) imgEl.style.backgroundImage = `url('${item.poster}')`;
        if (rankEl) rankEl.innerHTML = `🔥 TOP #${item.rank}`;
        if (titleEl) titleEl.textContent = `🔥 อันดับ ${item.rank}: ${item.title}`;
      }, 2500);
    }
  } catch (err) {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      console.warn("[Promotions Load Error]", err);
    }
  }
}

// Real-time stock polling for clearance screens (every 20 seconds when online & visible)
if (!window._clearanceRealtimeTimer) {
  window._clearanceRealtimeTimer = setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine && typeof document !== 'undefined' && !document.hidden) {
      fetchAndRenderPromotions();
    }
  }, 20000);
}

// Online/Offline Network Event Listeners
if (typeof window !== 'undefined' && !window._networkListenersAttached) {
  window._networkListenersAttached = true;
  window.addEventListener('online', () => {
    console.log('[Network] 🟢 Connection restored. Refreshing...');
    fetchAndRenderPromotions();
    if (typeof loadCustomerSubscriptions === 'function' && window._lastActiveRefCode) {
      loadCustomerSubscriptions(window._lastActiveRefCode);
    }
  });
  window.addEventListener('offline', () => {
    console.log('[Network] 🔴 Connection offline.');
  });
}

// Auto Slide & Pagination Dots Core Logic
let promoAutoSlideTimer = null;
let promoPauseResumeTimer = null;
let currentPromoIndex = 0;
let isPromoSliderInitialized = false;

function initPromoAutoSlider(activePromosCount) {
  const container = document.getElementById("promotions-container");
  const dotsContainer = document.getElementById("promo-slider-dots");
  if (!container || activePromosCount <= 1) {
    if (dotsContainer) dotsContainer.style.display = "none";
    return;
  }

  if (dotsContainer) {
    dotsContainer.style.display = "flex";
    let dotsHtml = "";
    for (let i = 0; i < activePromosCount; i++) {
      dotsHtml += `<div class="promo-dot ${i === 0 ? 'active' : ''}" onclick="scrollToPromoCard(${i})"></div>`;
    }
    dotsContainer.innerHTML = dotsHtml;
  }

  startPromoAutoSlide(activePromosCount);

  if (!container.dataset.listenersAttached) {
    container.dataset.listenersAttached = "true";

    container.addEventListener("scroll", () => {
      const cards = container.querySelectorAll(".promo-card");
      if (!cards || cards.length === 0) return;

      const containerRect = container.getBoundingClientRect();
      const activeIdx = Array.from(cards).findIndex(card => {
        const r = card.getBoundingClientRect();
        return Math.abs(r.left - containerRect.left) < r.width / 2;
      });

      if (activeIdx !== -1 && activeIdx !== currentPromoIndex) {
        currentPromoIndex = activeIdx;
        updatePromoActiveDot(currentPromoIndex);
      }
    }, { passive: true });

    container.addEventListener("touchstart", () => pausePromoAutoSlider(activePromosCount), { passive: true });
    container.addEventListener("mouseenter", () => pausePromoAutoSlider(activePromosCount), { passive: true });
    container.addEventListener("touchend", () => resumePromoAutoSlider(activePromosCount), { passive: true });
    container.addEventListener("mouseleave", () => resumePromoAutoSlider(activePromosCount), { passive: true });
  }
}

function startPromoAutoSlide(activePromosCount) {
  if (promoAutoSlideTimer) clearInterval(promoAutoSlideTimer);
  promoAutoSlideTimer = setInterval(() => {
    currentPromoIndex = (currentPromoIndex + 1) % activePromosCount;
    scrollToPromoCard(currentPromoIndex);
  }, 4000);
}

function scrollToPromoCard(index) {
  const container = document.getElementById("promotions-container");
  if (!container) return;
  const cards = container.querySelectorAll(".promo-card");
  if (!cards || !cards[index]) return;

  const targetLeft = cards[index].offsetLeft - container.offsetLeft;
  container.scrollTo({
    left: targetLeft,
    behavior: "smooth"
  });
  updatePromoActiveDot(index);
}

function scrollPromoSlider(direction) {
  const container = document.getElementById("promotions-container");
  if (!container) return;
  const cards = container.querySelectorAll(".promo-card");
  if (!cards || cards.length === 0) return;

  const nextIdx = Math.max(0, Math.min(cards.length - 1, currentPromoIndex + direction));
  currentPromoIndex = nextIdx;
  scrollToPromoCard(currentPromoIndex);
}

function updatePromoActiveDot(index) {
  const dots = document.querySelectorAll("#promo-slider-dots .promo-dot");
  dots.forEach((dot, i) => {
    if (i === index) {
      dot.classList.add("active");
    } else {
      dot.classList.remove("active");
    }
  });
}

function pausePromoAutoSlider(activePromosCount) {
  if (promoAutoSlideTimer) clearInterval(promoAutoSlideTimer);
  if (promoPauseResumeTimer) clearTimeout(promoPauseResumeTimer);
}

function resumePromoAutoSlider(activePromosCount) {
  if (promoPauseResumeTimer) clearTimeout(promoPauseResumeTimer);
  promoPauseResumeTimer = setTimeout(() => {
    startPromoAutoSlide(activePromosCount);
  }, 4000);
}

function handlePromoAction(promoId) {
  const promo = promotionsData.find(p => p.id === promoId);
  if (!promo) return;

  const msg = promo.action_payload || `สนใจโปรโมชั่น: ${promo.title} ราคา ฿${promo.promo_price} ครับ`;

  if (window.liff && liff.isInClient() && liff.sendMessages) {
    liff.sendMessages([{ type: 'text', text: msg }])
      .then(() => {
        showToast("ส่งคำขอโปรโมชั่นเข้า LINE OA เรียบร้อย!", "success");
        liff.closeWindow();
      })
      .catch(() => {
        const encoded = encodeURIComponent(msg);
        window.open(`https://line.me/R/oaMessage/${CONFIG.LINE_OA_HANDLE}/?${encoded}`, "_blank");
      });
  } else {
    copyToClipboard(msg, "ข้อความสนใจโปรโมชั่น");
    window.open(CONFIG.LINE_OA_LINK, "_blank");
  }
}

function openAdminPromoModal() {
  const modal = document.getElementById("admin-promo-modal");
  if (modal) {
    modal.classList.add("active");
    renderAdminPromosList();
  }
}

function renderAdminPromosList() {
  const container = document.getElementById("admin-promos-list-container");
  if (!container) return;

  if (!promotionsData || promotionsData.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 20px;">ยังไม่มีโปรโมชั่น กดสร้างโปรโมชั่นใหม่ด้านบนได้เลยครับ</div>`;
    return;
  }

  let html = "";
  promotionsData.forEach(item => {
    const isChecked = item.is_active !== false ? "checked" : "";
    html += `
      <div class="admin-promo-card-item">
        <div class="admin-promo-item-info">
          <div class="admin-promo-item-title">${escapeHtml(item.title)}</div>
          <div class="admin-promo-item-sub">
            <span style="color: var(--gold-light); font-weight: bold;">฿${item.promo_price}</span>
            <span>•</span>
            <span>${item.badge_text || item.promo_type}</span>
          </div>
        </div>
        <div class="admin-promo-item-actions">
          <label class="switch-toggle" title="เปิด/ปิดการ์ดโฆษณา">
            <input type="checkbox" ${isChecked} onchange="togglePromoActiveStatus('${item.id}', this.checked)">
            <span class="slider-toggle"></span>
          </label>
          <button type="button" class="btn-admin-icon" onclick="editPromoItem('${item.id}')" title="แก้ไข">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button type="button" class="btn-admin-icon delete" onclick="deletePromoItem('${item.id}')" title="ลบ">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function togglePromoActiveStatus(promoId, newStatus) {
  try {
    await supabaseFetch(`promotions?id=eq.${promoId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: newStatus })
    });
    showToast(newStatus ? "เปิดการแสดงผลโปรโมชั่นแล้ว" : "ปิดการแสดงผลโปรโมชั่นแล้ว", "success");
    await fetchAndRenderPromotions();
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: " + err.message);
  }
}

function resetPromoForm() {
  document.getElementById("promo-edit-id").value = "";
  document.getElementById("promo-input-title").value = "";
  document.getElementById("promo-input-desc").value = "";
  if (document.getElementById("promo-input-banner-image")) document.getElementById("promo-input-banner-image").value = "";
  document.getElementById("promo-input-type").value = "flash_sale";
  document.getElementById("promo-input-badge-text").value = "";
  document.getElementById("promo-input-original-price").value = "";
  document.getElementById("promo-input-promo-price").value = "";
  document.getElementById("promo-input-action-payload").value = "";
  document.getElementById("promo-input-order").value = "1";
  document.getElementById("promo-input-active").value = "true";
  document.getElementById("promo-form-title").textContent = "สร้างโปรโมชั่นใหม่";
}

function editPromoItem(promoId) {
  const item = promotionsData.find(p => p.id === promoId);
  if (!item) return;

  document.getElementById("promo-edit-id").value = item.id;
  document.getElementById("promo-input-title").value = item.title || "";
  document.getElementById("promo-input-desc").value = item.description || "";
  if (document.getElementById("promo-input-banner-image")) document.getElementById("promo-input-banner-image").value = item.banner_image || "";
  document.getElementById("promo-input-type").value = item.promo_type || "flash_sale";
  document.getElementById("promo-input-badge-text").value = item.badge_text || "";
  document.getElementById("promo-input-original-price").value = item.original_price || "";
  document.getElementById("promo-input-promo-price").value = item.promo_price || "";
  document.getElementById("promo-input-action-payload").value = item.action_payload || "";
  document.getElementById("promo-input-order").value = item.display_order || 1;
  document.getElementById("promo-input-active").value = item.is_active !== false ? "true" : "false";

  document.getElementById("promo-form-title").textContent = "แก้ไขโปรโมชั่น";
  document.getElementById("admin-promo-form").style.display = "block";
}

async function deletePromoItem(promoId) {
  if (!confirm("คุณต้องการลบโปรโมชั่นนี้ใช่หรือไม่?")) return;

  try {
    await supabaseFetch(`promotions?id=eq.${promoId}`, {
      method: "DELETE"
    });
    showToast("ลบโปรโมชั่นเรียบร้อยแล้ว", "success");
    await fetchAndRenderPromotions();
    renderAdminPromosList();
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการลบ: " + err.message);
  }
}
