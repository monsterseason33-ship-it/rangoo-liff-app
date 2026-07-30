// ⚡ BOSS Premium (shop_rangoo) LIFF Customer Web App Core Logic
const CONFIG = {
  LIFF_ID: "2010908177-hdxRe9r5",
  SUPABASE_URL: "https://teeporxvxrwzwmnsnjyw.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZXBvcnh2eHJ3endtbnNuanl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDU3NjcxMCwiZXhwIjoyMTAwMTUyNzEwfQ.Bgjp3EEFzRYAolKKb485LaRdShztnKJj3g7EDC8zGkk"
};

// Global State
let currentUser = {
  userId: null,
  displayName: "บุคคลทั่วไป",
  pictureUrl: "https://ui-avatars.com/api/?name=Guest&background=64748b&color=fff",
  isAuthenticated: false
};

let userBindings = [];
let catalogApps = [];
let catalogPackages = [];
let visiblePasswordsMap = {}; // Map of subId -> boolean (state for password visibility toggle)

// Helper: Call Supabase REST API
async function supabaseFetch(endpoint, options = {}) {
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
      throw new Error(`Supabase API Error: ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    console.error("[Supabase Fetch Error]", err);
    throw err;
  }
}

// 1. Initialize LIFF Application with Strict Security Check
async function initLiff() {
  console.log("[BOSS LIFF] Initializing LIFF with ID:", CONFIG.LIFF_ID);
  try {
    if (window.liff) {
      await liff.init({ liffId: CONFIG.LIFF_ID });
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        currentUser.userId = profile.userId;
        currentUser.displayName = profile.displayName;
        if (profile.pictureUrl) currentUser.pictureUrl = profile.pictureUrl;
        currentUser.isAuthenticated = true;
      } else {
        if (liff.isInClient()) {
          liff.login();
        }
      }
    }
  } catch (err) {
    console.warn("[BOSS LIFF] Outside LINE browser or LIFF init failed:", err.message);
  }

  // Update Profile UI Header
  document.getElementById("user-name").textContent = currentUser.displayName;
  document.getElementById("user-avatar").src = currentUser.pictureUrl;

  // Render Security Lock Warning if unauthenticated
  renderAuthBanner();

  // Load Data from Supabase
  await loadAppData();
}

function renderAuthBanner() {
  const banner = document.getElementById("security-auth-banner");
  if (!banner) return;

  if (!currentUser.isAuthenticated) {
    banner.style.display = "flex";
    banner.innerHTML = `
      <div style="font-size: 18px; margin-right: 8px;">🔒</div>
      <div style="font-size: 11.5px; color: #fbbf24; line-height: 1.4;">
        <strong>เปิดอยู่นอกแอป LINE OA:</strong> เพื่อความปลอดภัยสูงสุด ข้อมูลสิทธิ์และรหัสผ่านจะถูกล็อกไว้ทั้งหมด กรุณาเปิดลิงก์นี้ผ่านปุ่มในห้องแชท LINE OA ของคุณครับ
      </div>
    `;
  } else {
    banner.style.display = "none";
  }
}

// 2. Load Data from Supabase (Apps, Packages, Subscriptions)
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

    // B. STRICT SECURITY: Fetch Subscriptions ONLY for Verified Authentic LINE User ID
    let bindings = [];
    if (currentUser.isAuthenticated && currentUser.userId) {
      try {
        // Query ONLY bindings where chat_url or customer_name strictly matches this specific LINE User ID / Name
        const queryEndpoint = `customer_bindings?select=*,account:accounts(*)&reverted=eq.false&or=(chat_url.cs.${currentUser.userId},customer_name.eq.${encodeURIComponent(currentUser.displayName)})&order=created_at.desc`;
        bindings = await supabaseFetch(queryEndpoint);
      } catch (err) {
        console.warn("Failed to fetch targeted customer_bindings:", err);
        bindings = [];
      }
    } else {
      // 🚨 UNAUTHENTICATED BROWSER ACCESS -> ZERO DATA RETURNED!
      console.warn("[SECURITY LOCKDOWN] Accessing outside LINE LIFF. 0 customer accounts returned.");
      bindings = [];
    }

    userBindings = bindings || [];
    renderSubscriptions();
  } catch (err) {
    console.error("Failed to load app data:", err);
    renderErrorState();
  }
}

// 3. Render Active Subscriptions (สิทธิ์ของฉัน)
function renderSubscriptions() {
  const container = document.getElementById("subscriptions-container");
  const badge = document.getElementById("sub-count-badge");
  container.innerHTML = "";

  const activeSubs = userBindings;
  badge.textContent = `${activeSubs.length} รายการ`;

  if (!currentUser.isAuthenticated) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <div class="empty-title">กรุณาเข้าใช้งานผ่านแอป LINE OA</div>
        <div class="empty-desc">ระบบมีการล็อกความปลอดภัยสูงสุด ข้อมูลสิทธิ์และรหัสผ่านจะเปิดเผยเฉพาะลูกค้าที่เปิดผ่าน LINE OA เท่านั้นครับ</div>
      </div>
    `;
    return;
  }

  if (activeSubs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">ยังไม่มีรายการสิทธิ์การใช้งาน</div>
        <div class="empty-desc">เมื่อคุณสั่งซื้อแพ็คเกจพรีเมียมจาก BOSS Premium รายการและรหัสผ่านจะแสดงที่นี่ทันทีครับ</div>
      </div>
    `;
    return;
  }

  activeSubs.forEach(sub => {
    const card = document.createElement("div");
    card.className = "sub-card";

    // Calculate Expiry Status & Countdown
    const now = new Date();
    const expiryDate = new Date(sub.expiry_date);
    const diffMs = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let expiryBadgeClass = "expiry-active";
    let expiryText = `เหลือ ${diffDays} วัน`;

    if (diffMs <= 0) {
      expiryBadgeClass = "expiry-expired";
      expiryText = "หมดอายุแล้ว";
    } else if (diffDays <= 3) {
      expiryBadgeClass = "expiry-warning";
      expiryText = `ใกล้หมดอายุ (เหลือ ${diffDays} วัน)`;
    }

    // Extract Account Info from Binding or Linked Account
    const acc = sub.account || {};
    const email = acc.email || extractPattern(sub.raw_account_data, /อีเมล:\s*([^\n]+)/) || "ไม่ระบุ";
    const rawPassword = acc.password || extractPattern(sub.raw_account_data, /รหัสผ่าน:\s*([^\n]+)/) || "ไม่ระบุ";
    const profile = acc.profile_name || extractPattern(sub.raw_account_data, /โปรไฟล์:\s*([^\n]+)/) || "จอ 1";
    const pin = acc.pin_code || extractPattern(sub.raw_account_data, /PIN:\s*([^\n]+)/) || "-";

    // Password Security Masking State
    const isPasswordVisible = !!visiblePasswordsMap[sub.id];
    const displayedPassword = isPasswordVisible ? rawPassword : "••••••••••••";
    const eyeIcon = isPasswordVisible ? "🙈" : "👁️";

    // Find Matching App Theme Color
    const matchedApp = catalogApps.find(a => a.name.toLowerCase() === (sub.app_name || "").toLowerCase()) || {};
    const themeColor = matchedApp.theme_color || "#0284c7";

    card.innerHTML = `
      <div class="sub-card-header">
        <div class="app-pill">
          <div class="app-icon-box" style="background: ${themeColor};">${(sub.app_name || "A")[0]}</div>
          <div class="app-name-text">${escapeHtml(sub.app_name)}</div>
        </div>
        <span class="expiry-badge ${expiryBadgeClass}">⏰ ${expiryText}</span>
      </div>

      <div class="sub-details">
        <div class="detail-row">
          <span class="detail-label">แพ็คเกจ:</span>
          <span class="detail-value">${escapeHtml(sub.package_name || "แพ็คเกจปกติ")} (${sub.days || 30} วัน)</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">📧 อีเมล:</span>
          <span class="detail-value">
            <span style="font-family: monospace; color: #38bdf8;">${escapeHtml(email)}</span>
            <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(email)}')">คัดลอก</button>
          </span>
        </div>

        <div class="detail-row">
          <span class="detail-label">🔑 รหัสผ่าน:</span>
          <span class="detail-value">
            <span style="font-family: monospace; color: #fef08a; letter-spacing: ${isPasswordVisible ? 'normal' : '2px'};">${escapeHtml(displayedPassword)}</span>
            <button class="copy-btn" style="padding: 2px 6px; margin-right: 2px;" onclick="togglePasswordVisibility('${sub.id}')" title="ซ่อน/แสดงรหัสผ่าน">${eyeIcon}</button>
            <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(rawPassword)}')">คัดลอก</button>
          </span>
        </div>

        <div class="detail-row">
          <span class="detail-label">👤 โปรไฟล์:</span>
          <span class="detail-value">${escapeHtml(profile)} ${pin && pin !== '-' ? `(PIN: <span style="color:#fef08a; font-family:monospace;">${pin}</span>)` : ''}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">📱 อุปกรณ์ที่เลือก:</span>
          <span class="detail-value" style="color: #94a3b8;">${sub.device_type === 'tv' ? '📺 สมาร์ททีวี' : '📱 มือถือ/แท็บเล็ต/PC'}</span>
        </div>
      </div>

      <div class="card-actions">
        <button class="btn btn-secondary" onclick="openProblemModal('${escapeHtml(sub.app_name)}', '${sub.id}')">⚠️ แจ้งปัญหา</button>
        <button class="btn btn-primary" onclick="openRenewCatalog('${escapeHtml(sub.app_name)}')">🔄 ต่ออายุ</button>
      </div>
    `;

    container.appendChild(card);
  });

  // Populate App select modal
  populateAppSelect();
}

// Password Visibility Toggle Handler
function togglePasswordVisibility(subId) {
  visiblePasswordsMap[subId] = !visiblePasswordsMap[subId];
  renderSubscriptions();
}

// 4. Render Store Catalog (ร้านค้า/แคตตาล็อก)
function renderCatalog() {
  const container = document.getElementById("catalog-container");
  container.innerHTML = "";

  if (catalogApps.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🛍️</div>
        <div class="empty-title">ไม่พบรายการแอปพลิเคชัน</div>
      </div>
    `;
    return;
  }

  catalogApps.forEach(app => {
    // Find packages for this app
    const appPkgs = catalogPackages.filter(p => p.app_id === app.id);
    const minPrice = appPkgs.length > 0 ? Math.min(...appPkgs.map(p => p.price)) : 0;
    const themeColor = app.theme_color || "#0284c7";

    const card = document.createElement("div");
    card.className = "catalog-card";
    card.innerHTML = `
      <div>
        <div class="catalog-app-icon" style="background: ${themeColor};">${app.name[0]}</div>
        <div class="catalog-title">${escapeHtml(app.display_name || app.name)}</div>
        <div class="catalog-desc">${escapeHtml(app.instruction_text || "แอปพรีเมียมคุณภาพสูง รับชมแบบไม่มีโฆษณา")}</div>
      </div>
      <div class="catalog-price-row">
        <div class="catalog-price">฿${minPrice} <small>/เริ่มต้น</small></div>
        <button class="copy-btn" style="padding: 4px 10px; font-size: 11px;" onclick="selectPackageForPurchase('${app.id}')">สั่งซื้อ</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// 5. Utility Functions
function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert("📋 คัดลอกเรียบร้อยแล้ว: " + text);
  }).catch(err => {
    console.error("Failed to copy text:", err);
  });
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
  let pkgMsg = `🛒 แพ็คเกจของ ${app.display_name || app.name}:\n`;
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

// 6. Tab Switcher Logic
function switchTab(tabName) {
  const panes = {
    subs: document.getElementById("tab-subscriptions-pane"),
    catalog: document.getElementById("tab-catalog-pane"),
    support: document.getElementById("tab-support-pane")
  };

  const navs = {
    subs: document.getElementById("nav-subs"),
    catalog: document.getElementById("nav-catalog"),
    support: document.getElementById("nav-support")
  };

  Object.keys(panes).forEach(k => {
    if (panes[k]) panes[k].style.display = k === tabName ? "block" : "none";
    if (navs[k]) navs[k].classList.toggle("active", k === tabName);
  });
}

function renderErrorState() {
  document.getElementById("subscriptions-container").innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">ไม่สามารถเชื่อมต่อฐานข้อมูลได้</div>
      <div class="empty-desc">โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้งครับ</div>
    </div>
  `;
}

// DOM Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  initLiff();

  // Tab Navigation Buttons
  document.getElementById("nav-subs").addEventListener("click", () => switchTab("subs"));
  document.getElementById("nav-catalog").addEventListener("click", () => switchTab("catalog"));
  document.getElementById("nav-support").addEventListener("click", () => switchTab("support"));

  // Refresh Button
  document.getElementById("btn-refresh-subs").addEventListener("click", () => {
    loadAppData();
  });

  // Open Support Modals
  document.getElementById("btn-open-otp-modal").addEventListener("click", () => {
    document.getElementById("modal-type-select").value = "otp_needed";
    document.getElementById("action-modal").classList.add("active");
  });

  document.getElementById("btn-open-issue-modal").addEventListener("click", () => {
    document.getElementById("modal-type-select").value = "screen_full";
    document.getElementById("action-modal").classList.add("active");
  });

  // Modal Close Button
  document.getElementById("modal-close-btn").addEventListener("click", () => {
    document.getElementById("action-modal").classList.remove("active");
  });

  // Modal Form Submission
  document.getElementById("action-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const type = document.getElementById("modal-type-select").value;
    const note = document.getElementById("modal-note-input").value;

    alert("✅ ส่งคำร้องสำเร็จ! แอดมิน BOSS Premium จะเร่งตรวจสอบและดำเนินการให้ทันทีครับ");
    document.getElementById("action-modal").classList.remove("active");

    if (window.liff && liff.isInClient() && liff.sendMessages) {
      liff.sendMessages([
        {
          type: 'text',
          text: `[คำร้องลูกค้า] ${type === 'otp_needed' ? 'ขอรหัส OTP Disney+' : 'แจ้งปัญหาการใช้งาน'} ${note ? '(' + note + ')' : ''}`
        }
      ]).then(() => {
        liff.closeWindow();
      }).catch(() => {});
    }
  });

  // Search Input Filtering
  document.getElementById("search-input").addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    // Filter Subscriptions
    const subCards = document.querySelectorAll("#subscriptions-container .sub-card");
    subCards.forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(query) ? "block" : "none";
    });

    // Filter Catalog
    const catCards = document.querySelectorAll("#catalog-container .catalog-card");
    catCards.forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(query) ? "flex" : "none";
    });
  });
});
