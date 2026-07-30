// ⚡ BOSS Premium (shop_rangoo) LIFF Customer Web App Core Logic
const CONFIG = {
  LIFF_ID: "2010908177-hdxRe9r5",
  SUPABASE_URL: "https://teeporxvxrwzwmnsnjyw.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZXBvcnh2eHJ3endtbnNuanl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDU3NjcxMCwiZXhwIjoyMTAwMTUyNzEwfQ.Bgjp3EEFzRYAolKKb485LaRdShztnKJj3g7EDC8zGkk",
  ADMIN_NAMES: ["boss", "ร้านกู", "admin", "เจ้าของร้าน"] // Auto-detect admin users
};

// Global State
let currentUser = {
  userId: null,
  displayName: "ลูกค้า BOSS Premium",
  pictureUrl: "https://ui-avatars.com/api/?name=BOSS+Customer&background=0284c7&color=fff",
  isAuthenticated: false,
  isAdmin: false
};

let userBindings = [];
let allShopBindings = [];
let catalogApps = [];
let catalogPackages = [];
let visiblePasswordsMap = {}; // Map of subId -> boolean (state for password visibility toggle)
let customLookupQuery = "";   // Manual lookup query for LINE OA internal customer IDs (e.g. CX2NBXN...)
let adminViewMode = "all";    // Admin view toggle: "all" (all shop accounts) or "customer" (specific customer view)

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
      const errText = await res.text();
      throw new Error(`Supabase API Error ${res.status}: ${errText}`);
    }
    return await res.json();
  } catch (err) {
    console.error("[Supabase Fetch Error]", err);
    throw err;
  }
}

// 1. Initialize LIFF Application
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

        // Check if user is Admin / Shop Owner
        const dNameLower = (profile.displayName || "").toLowerCase().trim();
        currentUser.isAdmin = CONFIG.ADMIN_NAMES.some(name => dNameLower.includes(name));
      }
    }
  } catch (err) {
    console.warn("[BOSS LIFF] LIFF init info:", err.message);
  }

  // Fallback Admin Check for Boss
  const currentNameLower = (currentUser.displayName || "").toLowerCase().trim();
  if (CONFIG.ADMIN_NAMES.some(name => currentNameLower.includes(name))) {
    currentUser.isAdmin = true;
  }

  // Update Profile UI Header
  document.getElementById("user-name").textContent = currentUser.displayName;
  if (currentUser.pictureUrl) {
    document.getElementById("user-avatar").src = currentUser.pictureUrl;
  }

  // Render LINE User ID Inspector Bar
  renderUserIdInspector();

  // Render Admin Badge if logged in as Admin
  renderAdminBadge();

  // Load Data from Supabase
  await loadAppData();
}

// Render LINE User ID Debug Inspector Bar
function renderUserIdInspector() {
  let inspector = document.getElementById("user-id-inspector");
  if (!inspector) {
    inspector = document.createElement("div");
    inspector.id = "user-id-inspector";
    inspector.style.marginBottom = "14px";
    inspector.style.background = "rgba(2, 132, 199, 0.12)";
    inspector.style.border = "1px solid var(--border-blue, #0284c7)";
    inspector.style.borderRadius = "12px";
    inspector.style.padding = "8px 12px";
    
    const banner = document.querySelector(".welcome-banner");
    if (banner && banner.parentNode) {
      banner.parentNode.insertBefore(inspector, banner.nextSibling);
    } else {
      const container = document.querySelector(".container");
      if (container) container.insertBefore(inspector, container.firstChild);
    }
  }

  const idText = currentUser.userId || "ยังไม่ได้รับ ID (เปิดนอกแอป LINE)";
  inspector.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
      <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; min-width: 0;">
        <span style="font-size: 14px;">🆔</span>
        <div style="display: flex; flex-direction: column; min-width: 0;">
          <span style="font-size: 9.5px; color: var(--text-muted, #94a3b8);">LINE User ID สำหรับทดสอบระบุตัวตน:</span>
          <span style="font-size: 11px; font-weight: bold; color: var(--blue-bright, #38bdf8); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(idText)}</span>
        </div>
      </div>
      ${currentUser.userId ? `<button class="copy-btn" onclick="copyToClipboard('${escapeHtml(currentUser.userId)}')" style="white-space: nowrap; margin-left: 8px; padding: 3px 8px; font-size: 10px;">คัดลอก ID</button>` : ''}
    </div>
  `;
}

function renderAdminBadge() {
  let badge = document.getElementById("admin-mode-badge");

  if (!badge) {
    badge = document.createElement("div");
    badge.id = "admin-mode-badge";
    badge.style.marginBottom = "14px";
    badge.style.background = "rgba(212, 175, 55, 0.15)";
    badge.style.border = "1px solid var(--border-gold, #d4af37)";
    badge.style.borderRadius = "12px";
    badge.style.padding = "8px 12px";
    
    const inspector = document.getElementById("user-id-inspector");
    if (inspector && inspector.parentNode) {
      inspector.parentNode.insertBefore(badge, inspector.nextSibling);
    } else {
      const banner = document.querySelector(".welcome-banner");
      if (banner && banner.parentNode) {
        banner.parentNode.insertBefore(badge, banner.nextSibling);
      }
    }
  }

  if (currentUser.isAdmin) {
    badge.style.display = "flex";
    badge.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span style="font-size: 11px; font-weight: bold; color: #fef08a;">👑 โหมดผู้ดูแลระบบ (Admin)</span>
        <select id="admin-view-toggle" style="background: #050b18; border: 1px solid #d4af37; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 6px; outline: none; cursor: pointer;">
          <option value="all" ${adminViewMode === 'all' ? 'selected' : ''}>แสดงทุกบัญชีในร้าน (${allShopBindings.length} รายการ)</option>
          <option value="customer" ${adminViewMode === 'customer' ? 'selected' : ''}>มุมมองลูกค้าเฉพาะบุคคล</option>
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
    }, 100);
  } else {
    badge.style.display = "none";
  }
}

// Helper: Extract Chat ID from chat_url
function extractChatId(url) {
  if (!url) return "";
  const match = url.match(/\/chat\/([^\/\?]+)/);
  return match ? match[1] : "";
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

    // B. Fetch Subscriptions from Supabase
    allShopBindings = await supabaseFetch(`customer_bindings?select=*,account:accounts(*)&reverted=eq.false&order=created_at.desc`) || [];

    let bindings = [];

    if (currentUser.isAdmin && adminViewMode === "all") {
      // 👑 ADMIN MODE: Show all active shop bindings
      bindings = allShopBindings;
    } else {
      // 👤 CUSTOMER MODE: Filter strictly by customer identity
      const searchKeyword = customLookupQuery.trim() || currentUser.displayName.trim();
      const lowerKeyword = searchKeyword.toLowerCase();

      bindings = allShopBindings.filter(b => {
        const cName = (b.customer_name || "").toLowerCase();
        const cUrl = (b.chat_url || "").toLowerCase();
        const uId = (currentUser.userId || "").toLowerCase();

        return (uId && cUrl.includes(uId)) || (lowerKeyword && cName.includes(lowerKeyword)) || (cName && lowerKeyword.includes(cName));
      });
    }

    userBindings = bindings || [];
    renderAdminBadge();
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

  if (activeSubs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">ยังไม่มีรายการสิทธิ์การใช้งาน</div>
        <div class="empty-desc" style="margin-bottom: 12px;">ไม่พบรายการสิทธิ์ที่ผูกกับชื่อ "${escapeHtml(currentUser.displayName)}" ครับ</div>
        
        <!-- Quick Lookup Box for Customers -->
        <div style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-gold, #d4af37); padding: 12px; border-radius: 12px; max-width: 360px; margin: 0 auto; text-align: left;">
          <label style="font-size: 11px; color: #fef08a; font-weight: bold; display: block; margin-bottom: 6px;">🔍 ค้นหารหัสแชท LINE OA ของคุณ (เช่น CX2NBXN...):</label>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="manual-lookup-input" class="form-input" style="height: 32px; font-size: 11.5px;" placeholder="กรอกรหัสแชท LINE OA">
            <button id="btn-manual-lookup" class="btn btn-gold" style="white-space: nowrap; height: 32px; padding: 0 12px; font-size: 11px;">ค้นหา</button>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const lookupBtn = document.getElementById("btn-manual-lookup");
      const lookupInput = document.getElementById("manual-lookup-input");
      if (lookupBtn && lookupInput) {
        lookupBtn.addEventListener("click", () => {
          customLookupQuery = lookupInput.value.trim();
          loadAppData();
        });
      }
    }, 100);

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
    const email = acc.email || extractPattern(sub.raw_account_data, /อีเมล:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /📧\s*([^\n]+)/) || "ไม่ระบุ";
    const rawPassword = acc.password || extractPattern(sub.raw_account_data, /รหัสผ่าน:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /🔑\s*([^\n]+)/) || "ไม่ระบุ";
    const profile = acc.profile_name || extractPattern(sub.raw_account_data, /โปรไฟล์:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /👤\s*([^\n]+)/) || "จอ 1";
    const pin = acc.pin_code || extractPattern(sub.raw_account_data, /PIN:\s*([^\n]+)/) || extractPattern(sub.raw_account_data, /📌\s*PIN:\s*([^\n]+)/) || "-";
    const chatId = extractChatId(sub.chat_url);

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
          <div>
            <div class="app-name-text">${escapeHtml(sub.app_name)}</div>
            ${currentUser.isAdmin ? `<span style="font-size: 9.5px; color: #fef08a;">👤 ลูกค้า: ${escapeHtml(sub.customer_name)}</span>` : ''}
          </div>
        </div>
        <span class="expiry-badge ${expiryBadgeClass}">⏰ ${expiryText}</span>
      </div>

      <div class="sub-details">
        <div class="detail-row">
          <span class="detail-label">แพ็คเกจ:</span>
          <span class="detail-value">${escapeHtml(sub.package_name || "แพ็คเกจปกติ")} (${sub.days || 30} วัน)</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">🆔 รหัสแชทผูกสิทธิ์:</span>
          <span class="detail-value" style="font-family: monospace; color: #38bdf8; font-size: 10.5px;">
            ${escapeHtml(chatId || sub.customer_name)}
            ${chatId ? `<button class="copy-btn" onclick="copyToClipboard('${escapeHtml(chatId)}')">คัดลอก</button>` : ''}
          </span>
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
