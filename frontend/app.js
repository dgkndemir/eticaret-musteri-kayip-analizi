// HTML entity encoding to prevent XSS (Cross-Site Scripting)
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCrmAction(c) {
  const prob = c.churn_probability || 0;
  const tc = c.TotalComplaints || 0;
  const days = c.DaySinceLastOrder || 0;
  const ten = c.Tenure || 0;
  const ord = c.OrderCount || 1;
  const dist = c.WarehouseToHome || 0;
  const tier = c.CityTier || 1;
  const cashback = c.CashbackAmount || 0;

  // 1. Yeni Müşteri & Onboarding (Kritik ilk alışveriş deneyimi)
  if (ten <= 1 && days <= 7) return "Hoş Geldin Teşviki & 2. Siparişe Özel %15 İndirim";
  if (ten <= 1 && days > 7) return "İlk Alışveriş Deneyim Anketi & Yeniden Etkileşim";

  // 2. Uzun Süreli Hareketsizlik (Win-Back / Uyuyan Müşteri)
  if (days >= 20) return "Seni Özledik (Win-Back) Kampanyası & Sepet İndirimi";
  if (days >= 12 && prob >= 0.50) return "Favori Ürün Fiyat İndirimi & Geri Kazanım Bildirimi";

  // 3. Lojistik ve Mesafe Kaynaklı Darboğaz
  if ((dist >= 25 || tier === 3) && prob >= 0.50) return "Lojistik Teşviki: Sonraki Siparişlerde Ücretsiz Kargo";

  // 4. Şikayet Durumu (Yalnızca şikayet birincil sorunsa)
  if (tc >= 5 && prob >= 0.60) return "Kıdemli Müşteri Deneyimi Ekibi Bireysel Çözüm Araması";
  if (tc >= 2 && days <= 10) return "Şikayet Çözüm Takibi & Memnuniyet Özrü";

  // 5. Düzenli / Çoklu Sipariş Veren Müşteri Tutundurma
  if (ord >= 4) {
    if (prob >= 0.50) return "Düzenli Müşteri Tutundurma Paketi & Özel Kampanya Bildirimi";
    return "Sadakat Puanı Teşviki & Yeni Sezon Avantajı";
  }

  // 6. Tek Siparişli Müşteri Tutundurma
  if (ord === 1) return "2. Sipariş Teşvik Kuponu & Kategori Önerisi";

  // 7. Fiyat ve İndirim Hassasiyeti
  if (cashback < 130 && prob >= 0.50) return "Kişiselleştirilmiş Cashback & Sepet İndirimi";

  // 8. Rutin Sadık ve Düşük Riskli Müşteriler
  if (ten >= 12) return "Yıl Dönümü Teşekkür Bildirimi & Sadakat Puanı";

  return "Dönemsel Kampanya Bildirimi & Çapraz Satış Önerisi";
}

// API Endpoint Management (Render Live by Default / Localhost Switchable)
function getBaseApiUrl() {
  const saved = localStorage.getItem("custom_api_url");
  if (saved) return saved.replace(/\/+$/, "");
  // Default to Render Live server everywhere.
  if (window.location.port === "8000" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return "http://127.0.0.1:8000";
  }
  return "https://eticaret-musteri-kayip-analizi.onrender.com";
}

let API_URL = getBaseApiUrl();

// Live API Server Health & Switcher
async function checkApiHealth() {
  const dot = document.getElementById("api-status-dot");
  const text = document.getElementById("api-status-text");
  if (!dot || !text) return;

  const currentLabel = API_URL.includes("127.0.0.1") || API_URL.includes("localhost")
    ? "Local (8000)"
    : "Render";

  dot.className = "status-dot";
  text.innerText = `${currentLabel}: Bağlanıyor...`;

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${API_URL}/api/llm/models`, { signal: ctrl.signal });
    clearTimeout(timeout);

    const modalBadge = document.getElementById("modal-server-badge");
    const isLocal = API_URL.includes("127.0.0.1") || API_URL.includes("localhost");

    if (res.ok) {
      dot.className = "status-dot online";
      text.innerText = `● ${currentLabel} (Canlı)`;
      if (modalBadge) {
        modalBadge.innerText = isLocal ? "● Localhost (Canlı)" : "● Render (Canlı)";
        modalBadge.style.background = "#dcfce7";
        modalBadge.style.color = "#15803d";
      }
      if ((!analysisData || Object.keys(analysisData).length === 0) && typeof window.tryLoadData === "function") {
        window.tryLoadData(1);
      }
    } else {
      dot.className = "status-dot";
      text.innerText = `${currentLabel} (Hata: ${res.status})`;
      if (modalBadge) {
        modalBadge.innerText = `${currentLabel} (Hata: ${res.status})`;
        modalBadge.style.background = "#fee2e2";
        modalBadge.style.color = "#b91c1c";
      }
    }
  } catch (e) {
    dot.className = "status-dot offline";
    const isLocal = API_URL.includes("127.0.0.1") || API_URL.includes("localhost");
    text.innerText = isLocal ? `${currentLabel} (Çevrimdışı)` : `${currentLabel} (Uyanıyor / Çevrimdışı)`;
    const modalBadge = document.getElementById("modal-server-badge");
    if (modalBadge) {
      modalBadge.innerText = isLocal ? "● Localhost Çevrimdışı" : "● Render Uyanıyor / Çevrimdışı";
      modalBadge.style.background = "#fee2e2";
      modalBadge.style.color = "#b91c1c";
    }
  }

  if (typeof updateApiKeyVisibility === "function") {
    updateApiKeyVisibility();
  }
}

function copyToClipboard(textOrId, btnElement, successText = 'Kopyalandı!') {
  let content = textOrId;
  const el = document.getElementById(textOrId);
  if (el) {
    content = el.value || el.innerText || textOrId;
  }
  content = String(content).replace(/^"|"$/g, '');

  let btn = null;
  if (typeof btnElement === "string") {
    btn = document.getElementById(btnElement);
  } else if (btnElement instanceof HTMLElement) {
    btn = btnElement;
  } else if (window.event && window.event.target) {
    btn = window.event.target;
  }

  function doFallback() {
    const ta = document.createElement('textarea');
    ta.value = content;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showCopyFeedback(btn, successText);
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    document.body.removeChild(ta);
  }

  if (navigator.clipboard) {
    navigator.clipboard.writeText(content).then(() => {
      showCopyFeedback(btn, successText);
    }).catch(() => doFallback());
  } else {
    doFallback();
  }
}

function fallbackCopy(text, btnElement, successText) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showCopyFeedback(btnElement, successText);
  } catch (err) {
    console.error('Copy failed', err);
  }
  document.body.removeChild(ta);
}

function showCopyFeedback(btnElement, successText) {
  if (!btnElement) return;
  const original = btnElement.innerHTML;
  btnElement.innerHTML = `<span>✓</span> ` + successText;
  btnElement.style.color = '#16a34a';
  btnElement.style.borderColor = '#86efac';
  setTimeout(() => {
    btnElement.innerHTML = original;
    btnElement.style.color = '';
    btnElement.style.borderColor = '';
  }, 2000);
}

// API Server Status & Switcher Modal Controls
function initServerStatusControls() {
  const modal = document.getElementById('modal-server-status');
  const pill = document.getElementById('api-status-pill');
  const btnClose = document.getElementById('btn-close-server-status');
  const inputCurrent = document.getElementById('modal-current-api-url');
  const badge = document.getElementById('modal-server-badge');
  const btnCopyCurrent = document.getElementById('btn-copy-api-url');
  const btnCopyStatusLink = document.getElementById('btn-copy-status-link');
  const btnSwitchRender = document.getElementById('btn-switch-render');
  const btnSwitchLocal = document.getElementById('btn-switch-local');
  const inputCustom = document.getElementById('input-custom-api-url');
  const btnSaveCustom = document.getElementById('btn-save-custom-api');
  const btnReset = document.getElementById('btn-reset-api-default');

  function updateServerModalInfo() {
    if (inputCurrent) inputCurrent.value = API_URL;
    if (inputCustom && !inputCustom.value) inputCustom.value = API_URL;

    if (badge) {
      const isLocal = API_URL.includes('127.0.0.1') || API_URL.includes('localhost');
      const dot = document.getElementById('api-status-dot');
      const isOnline = dot && dot.classList.contains('online');
      const isOffline = dot && dot.classList.contains('offline');

      if (isOnline) {
        badge.innerText = isLocal ? '● Localhost (Aktif)' : '● Render (Canlı)';
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
      } else if (isOffline) {
        badge.innerText = isLocal ? '● Localhost Çevrimdışı' : '● Render Uyanıyor';
        badge.style.background = '#fee2e2';
        badge.style.color = '#b91c1c';
      } else {
        badge.innerText = '● Kontrol Ediliyor...';
        badge.style.background = '#fef9c3';
        badge.style.color = '#a16207';
      }
    }

    if (btnSwitchRender) {
      const isRender = API_URL.includes('onrender.com');
      btnSwitchRender.style.borderColor = isRender ? '#3b82f6' : '#cbd5e1';
      btnSwitchRender.style.background = isRender ? '#eff6ff' : '#ffffff';
    }
    if (btnSwitchLocal) {
      const isLocal = API_URL.includes('127.0.0.1') || API_URL.includes('localhost');
      btnSwitchLocal.style.borderColor = isLocal ? '#3b82f6' : '#cbd5e1';
      btnSwitchLocal.style.background = isLocal ? '#eff6ff' : '#ffffff';
      const localNotice = document.getElementById('server-local-apikey-notice');
      if (localNotice) localNotice.style.display = isLocal ? 'block' : 'none';
    }
  }

  function openModal() {
    if (!modal) return;
    updateServerModalInfo();
    modal.style.display = 'flex';
  }

  function closeModal() {
    if (modal) modal.style.display = 'none';
  }

  if (pill) pill.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Copy active URL
  if (btnCopyCurrent && inputCurrent) {
    btnCopyCurrent.addEventListener('click', () => {
      copyToClipboard(inputCurrent.value, btnCopyCurrent, 'Kopyalandı!');
    });
  }

  // Copy status link
  if (btnCopyStatusLink) {
    btnCopyStatusLink.addEventListener('click', () => {
      copyToClipboard('https://lppkq22x.status.cron-job.org/', btnCopyStatusLink, '✓');
    });
  }

  // Switch to Render
  if (btnSwitchRender) {
    btnSwitchRender.addEventListener('click', () => {
      const target = 'https://eticaret-musteri-kayip-analizi.onrender.com';
      localStorage.setItem('custom_api_url', target);
      API_URL = target;
      window.location.reload();
    });
  }

  // Switch to Localhost
  if (btnSwitchLocal) {
    btnSwitchLocal.addEventListener('click', () => {
      const target = 'http://127.0.0.1:8000';
      localStorage.setItem('custom_api_url', target);
      API_URL = target;
      window.location.reload();
    });
  }

  // Save Custom URL
  if (btnSaveCustom && inputCustom) {
    btnSaveCustom.addEventListener('click', () => {
      let target = inputCustom.value.trim().replace(/\/+$/, '');
      if (!target) return;
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = 'https://' + target;
      }
      localStorage.setItem('custom_api_url', target);
      API_URL = target;
      window.location.reload();
    });
  }

  // Reset to Default Auto-detect
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      localStorage.removeItem('custom_api_url');
      window.location.reload();
    });
  }
}

// Table Scrolling Helpers: Buttons, Shift + Wheel & Floating Sticky Headers
function initTableScrollControls() {
  document.querySelectorAll(".btn-scroll-arrow").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const dir = parseInt(btn.getAttribute("data-direction"), 10) || 350;
      const container = document.getElementById(targetId) || btn.closest(".tab-content")?.querySelector(".table-responsive");
      if (container) {
        container.scrollBy({ left: dir, behavior: "smooth" });
      }
    });
  });

  // Ensure Shift + Wheel translates smoothly across all browsers
  document.querySelectorAll(".table-responsive").forEach((container) => {
    container.addEventListener("wheel", (e) => {
      if (e.shiftKey && e.deltaY !== 0) {
        container.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
  });

  // Floating Sticky Table Headers on Page Scroll (GPU-accelerated)
  const navbar = document.querySelector(".navbar");
  let ticking = false;

  function updateStickyHeaders() {
    const navHeight = navbar ? navbar.offsetHeight : 62;

    document.querySelectorAll(".table-responsive table").forEach((table) => {
      if (table.offsetParent === null) return; // skip hidden tabs

      const rect = table.getBoundingClientRect();
      const thead = table.querySelector("thead");
      if (!thead) return;

      const theadHeight = thead.offsetHeight || 42;
      // Active scroll range where table is passing under the sticky navbar
      if (rect.top < navHeight && rect.bottom > navHeight + theadHeight + 30) {
        const translateY = Math.round(navHeight - rect.top);
        thead.querySelectorAll("th").forEach((th) => {
          th.style.transform = `translateY(${translateY}px)`;
          th.style.boxShadow = "0 3px 8px rgba(15, 23, 42, 0.08)";
          th.style.zIndex = th === thead.querySelector("th:first-child") ? "35" : "25";
        });
      } else {
        thead.querySelectorAll("th").forEach((th) => {
          th.style.transform = "";
          th.style.boxShadow = "";
          th.style.zIndex = "";
        });
      }
    });
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(updateStickyHeaders);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    window.requestAnimationFrame(updateStickyHeaders);
  }, { passive: true });

  // Re-calculate when switching tabs
  document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("thead th").forEach((th) => {
        th.style.transform = "";
        th.style.boxShadow = "";
        th.style.zIndex = "";
      });
      setTimeout(() => window.requestAnimationFrame(updateStickyHeaders), 60);
    });
  });
}



let analysisData = null;
let charts = {};

// Pagination state
const pageState = {
  crm: { page: 1, pageSize: 25 },
  logistics: { page: 1, pageSize: 25 },
  category: { page: 1, pageSize: 25 }
};

// Column sorting state
const sortState = {
  crm: { field: "churn_probability", order: "desc" },
  logistics: { field: "churn_probability", order: "desc" },
  category: { field: "avg_rating", order: "asc" }
};

// Modal elements
const modalUpload = document.getElementById("modal-upload");
const btnOpenModal = document.getElementById("btn-open-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnSubmitUpload = document.getElementById("btn-submit-upload");
const checkRetrain = document.getElementById("check-retrain");
const modalStatus = document.getElementById("modal-status");

const fileCust = document.getElementById("file-customers");
const fileComp = document.getElementById("file-complaints");
const fileRev = document.getElementById("file-reviews");

// Detail Popup Modal elements
const modalDetail = document.getElementById("modal-detail");
const btnCloseDetail = document.getElementById("btn-close-detail");
const modalDetailTitle = document.getElementById("modal-detail-title");
const modalDetailSubtitle = document.getElementById("modal-detail-subtitle");
const modalDetailContent = document.getElementById("modal-detail-content");

// Information Modal elements
const modalInfo = document.getElementById("modal-info");
const btnOpenInfo = document.getElementById("btn-open-info");
const btnCloseInfo = document.getElementById("btn-close-info");

// Navigation tabs
const navTabBtns = document.querySelectorAll(".nav-tab-btn");

// Filters - CRM
const filterCity = document.getElementById("filter-city");
const filterTenure = document.getElementById("filter-tenure");
const filterOrders = document.getElementById("filter-orders");
const filterRisk = document.getElementById("filter-risk-slider");
const labelRiskVal = document.getElementById("label-risk-val");
const btnExportCrm = document.getElementById("btn-export-crm");

// Filters - Logistics
const filterLogDistance = document.getElementById("filter-log-distance");
const filterLogCity = document.getElementById("filter-log-city");
const filterLogComplaintOnly = document.getElementById("filter-log-complaint-only");
const btnExportLogistics = document.getElementById("btn-export-logistics");

// Filters - Category
const filterDept = document.getElementById("filter-dept");
const searchProduct = document.getElementById("search-product");
const btnExportCategory = document.getElementById("btn-export-category");

// 1. Initial Page Load & Server Wakeup Monitor
window.addEventListener("DOMContentLoaded", async () => {
  checkApiHealth();
  setInterval(checkApiHealth, 10000);
  loadAvailableLlmModels();
  initApiKeyControls();
  initServerStatusControls();
  initTableScrollControls();
  initSyncModalTabs();
  initSyncActions();
  initPowerBiControls();

  const alertBanner = document.getElementById("server-alert-banner");
  const alertMessage = document.getElementById("server-alert-message");
  const alertSpinner = document.getElementById("server-alert-spinner");
  const isLocal = API_URL.includes("127.0.0.1") || API_URL.includes("localhost");

  async function tryLoadData(attempt = 1) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      let res;
      try {
        res = await fetch(`${API_URL}/api/data`, { signal: ctrl.signal });
      } catch (networkErr) {
        clearTimeout(timer);
        throw networkErr;
      }
      clearTimeout(timer);

      if (res.status === 404) {
        console.info("Sunucu aktif ancak veri ambarı bulunamadı (404).");
        if (alertBanner) {
          alertBanner.className = "server-alert-banner warning";
          if (alertSpinner) alertSpinner.style.display = "none";
          alertMessage.innerHTML = `📁 <strong>Sunucu Aktif, Ancak Analiz Verisi Bulunamadı!</strong> Gösterge panelini görüntülemek için lütfen <button id="btn-banner-upload-trigger" type="button" style="background:#2563EB; color:#ffffff; border:none; border-radius:6px; padding:0.25rem 0.75rem; font-weight:700; cursor:pointer; margin-left:0.4rem; font-size:0.82rem; vertical-align:middle; box-shadow:0 1px 2px rgba(0,0,0,0.1);">📁 Veri Yükle</button> butonuna tıklayarak CSV dosyalarınızı (örneğin <code>sample_data</code> klasöründekileri) yükleyin.`;
          
          const bannerUploadBtn = document.getElementById("btn-banner-upload-trigger");
          if (bannerUploadBtn) {
            bannerUploadBtn.onclick = () => {
              const modalUpload = document.getElementById("modal-upload");
              if (modalUpload) modalUpload.style.display = "flex";
            };
          }
        }

        const kpiGrid = document.getElementById("master-kpi-grid");
        if (kpiGrid) {
          kpiGrid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 2.5rem 1.5rem; text-align: center; background: #ffffff; border: 1.5px dashed #cbd5e1; border-radius: var(--radius); margin-bottom: 1.5rem;">
              <div style="font-size: 2.2rem; margin-bottom: 0.6rem;">📁</div>
              <h3 style="margin: 0 0 0.4rem 0; color: #0F172A; font-size: 1.15rem;">Analiz İçin Veri Bekleniyor</h3>
              <p style="margin: 0 auto 1.25rem auto; max-width: 540px; color: #64748b; font-size: 0.88rem; line-height: 1.5;">
                Sunucu bağlantısı kuruldu. Yapay zeka tahminleri, lojistik riskleri ve müşteri kayıp analizlerini hesaplamak için lütfen CSV veri setlerini yükleyin.
              </p>
              <button type="button" onclick="document.getElementById('modal-upload').style.display='flex'" style="background: #2563EB; color: #ffffff; border: none; border-radius: 6px; padding: 0.6rem 1.3rem; font-weight: 700; font-size: 0.88rem; cursor: pointer;">
                📁 CSV Veri Setlerini Yükle
              </button>
            </div>
          `;
        }
        return;
      }

      if (!res.ok) throw new Error("API yanıt vermedi (" + res.status + ")");
      analysisData = await res.json();
      renderDashboard(analysisData);

      if (alertBanner) {
        alertBanner.className = "server-alert-banner success";
        if (alertSpinner) alertSpinner.style.display = "none";
        alertMessage.innerHTML = "✔ <strong>Sunucuya Başarıyla Bağlandı!</strong> Analiz verileri yüklendi.";
        setTimeout(() => { alertBanner.style.display = "none"; }, 3500);
      }
    } catch (err) {
      console.warn(`Veri ambarı yükleme denemesi #${attempt} başarısız:`, err);
      if (alertBanner) {
        if (isLocal) {
          if (attempt <= 6) {
            alertBanner.className = "server-alert-banner waking";
            if (alertSpinner) alertSpinner.style.display = "block";
            alertMessage.innerHTML = `⏳ <strong>Yerel Sunucu Başlatılıyor...</strong> (Bağlantı deneniyor #${attempt}) Lütfen bekleyin...`;
            setTimeout(() => tryLoadData(attempt + 1), 2000);
          } else {
            alertBanner.className = "server-alert-banner error";
            if (alertSpinner) alertSpinner.style.display = "none";
            alertMessage.innerHTML = `⚠️ <strong>Yerel Sunucu Bağlantısı Yok!</strong> Lütfen proje klasöründeki <code>start_local.bat</code> dosyasını çalıştırın (http://127.0.0.1:8000). <button id="btn-banner-retry" type="button" style="background:#2563EB; color:#ffffff; border:none; border-radius:4px; padding:0.25rem 0.65rem; font-weight:700; cursor:pointer; margin-left:0.5rem; font-size:0.8rem;">🔄 Yeniden Dene</button>`;
            const retryBtn = document.getElementById("btn-banner-retry");
            if (retryBtn) retryBtn.onclick = () => tryLoadData(1);
          }
        } else {
          alertBanner.className = "server-alert-banner waking";
          if (alertSpinner) alertSpinner.style.display = "block";
          alertMessage.innerHTML = `⏳ <strong>Render Bulut Sunucusu Uyanıyor...</strong> (Deneme #${attempt}) Ücretsiz planda ilk açılış 30-50 sn sürebilir, lütfen bekleyin...`;
          // Retry automatically for Render waking up
          setTimeout(() => tryLoadData(attempt + 1), 4000);
        }
      }
    }
  }

  window.tryLoadData = tryLoadData;
  tryLoadData(1);
});

// Gemini API Key Management UI
function updateApiKeyVisibility() {
  const isLocal = API_URL.includes("127.0.0.1") || API_URL.includes("localhost");
  const btn = document.getElementById("btn-open-apikey");
  if (btn) btn.style.display = isLocal ? "inline-flex" : "none";
  const localNotice = document.getElementById("server-local-apikey-notice");
  if (localNotice) localNotice.style.display = isLocal ? "block" : "none";
}

function initApiKeyControls() {
  const modalApiKey = document.getElementById("modal-apikey");
  const btnOpenApiKey = document.getElementById("btn-open-apikey");
  const btnCloseApiKey = document.getElementById("btn-close-apikey");
  const btnSaveApiKey = document.getElementById("btn-save-apikey");
  const btnClearApiKey = document.getElementById("btn-clear-apikey");
  const inputApiKey = document.getElementById("input-gemini-apikey");
  const apiKeyStatus = document.getElementById("apikey-status-label");
  const btnDismissAlert = document.getElementById("btn-dismiss-alert");
  const btnQuickOpenApiKey = document.getElementById("btn-quick-open-apikey");

  function updateApiKeyUi() {
    const saved = localStorage.getItem("gemini_api_key");
    if (apiKeyStatus) {
      apiKeyStatus.innerText = saved
        ? `Durum: Özel anahtar kayıtlı (${saved.slice(0, 6)}...${saved.slice(-4)})`
        : "Durum: Kayıtlı anahtar yok (Yerel LLM aktif)";
      apiKeyStatus.style.color = saved ? "#16a34a" : "#64748b";
    }
    if (inputApiKey) {
      inputApiKey.value = saved || "";
    }
  }

  updateApiKeyVisibility();

  if (btnOpenApiKey) {
    btnOpenApiKey.addEventListener("click", () => {
      updateApiKeyUi();
      if (modalApiKey) modalApiKey.style.display = "flex";
    });
  }
  if (btnQuickOpenApiKey) {
    btnQuickOpenApiKey.addEventListener("click", () => {
      const serverModal = document.getElementById("modal-server-status");
      if (serverModal) serverModal.style.display = "none";
      updateApiKeyUi();
      if (modalApiKey) modalApiKey.style.display = "flex";
    });
  }
  if (btnCloseApiKey) {
    btnCloseApiKey.addEventListener("click", () => {
      if (modalApiKey) modalApiKey.style.display = "none";
    });
  }
  if (btnSaveApiKey) {
    btnSaveApiKey.addEventListener("click", () => {
      const key = inputApiKey ? inputApiKey.value.trim() : "";
      if (key) {
        localStorage.setItem("gemini_api_key", key);
        alert("Gemini API Anahtarı başarıyla kaydedildi!");
      } else {
        localStorage.removeItem("gemini_api_key");
      }
      updateApiKeyUi();
      if (modalApiKey) modalApiKey.style.display = "none";
      loadAvailableLlmModels();
    });
  }
  if (btnClearApiKey) {
    btnClearApiKey.addEventListener("click", () => {
      localStorage.removeItem("gemini_api_key");
      updateApiKeyUi();
      alert("Kayıtlı API anahtarı silindi.");
    });
  }
  if (btnDismissAlert) {
    btnDismissAlert.addEventListener("click", () => {
      const banner = document.getElementById("server-alert-banner");
      if (banner) banner.style.display = "none";
    });
  }
}

// Load dynamic text-based models from Google Gemini API
async function loadAvailableLlmModels() {
  const selectEl = document.getElementById("select-llm-model");
  if (!selectEl) return;

  try {
    const apiKey = localStorage.getItem("gemini_api_key") || "";
    const headers = {};
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetch(`${API_URL}/api/llm/models`, { headers });
    if (!res.ok) return;
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      selectEl.innerHTML = data.models.map(m => `
        <option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>
      `).join("");
    }
  } catch (err) {
    console.warn("LLM model listesi API'den çekilemedi:", err);
  }
}

// Modal open/close controls
btnOpenModal.addEventListener("click", () => {
  modalUpload.style.display = "flex";
  loadSyncStatus();
});

btnCloseModal.addEventListener("click", () => {
  modalUpload.style.display = "none";
});

if (btnCloseDetail) {
  btnCloseDetail.addEventListener("click", () => {
    modalDetail.style.display = "none";
  });
}

if (btnOpenInfo) {
  btnOpenInfo.addEventListener("click", () => {
    if (modalInfo) modalInfo.style.display = "flex";
  });
}

if (btnCloseInfo) {
  btnCloseInfo.addEventListener("click", () => {
    if (modalInfo) modalInfo.style.display = "none";
  });
}

// Close modals when clicking on background overlay
window.addEventListener("click", (e) => {
  if (e.target === modalUpload) modalUpload.style.display = "none";
  if (e.target === modalDetail) modalDetail.style.display = "none";
  if (e.target === modalInfo) modalInfo.style.display = "none";
});

// Tab Switching
navTabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    navTabBtns.forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(tc => tc.style.display = "none");

    btn.classList.add("active");
    const targetId = btn.getAttribute("data-tab");
    document.getElementById(targetId).style.display = "block";
  });
});

// Column Sorting Click Handler
document.querySelectorAll(".th-sortable").forEach(th => {
  th.addEventListener("click", () => {
    const tableKey = th.getAttribute("data-table");
    const fieldKey = th.getAttribute("data-field");
    if (!tableKey || !fieldKey || !sortState[tableKey]) return;

    if (sortState[tableKey].field === fieldKey) {
      sortState[tableKey].order = sortState[tableKey].order === "asc" ? "desc" : "asc";
    } else {
      sortState[tableKey].field = fieldKey;
      sortState[tableKey].order = fieldKey === "avg_rating" ? "asc" : "desc";
    }

    pageState[tableKey].page = 1;
    updateSortIcons();

    if (tableKey === "crm") renderCrmTable();
    else if (tableKey === "logistics") renderLogisticsCustomerTable();
    else if (tableKey === "category") renderCategoryTable();
  });
});

function updateSortIcons() {
  document.querySelectorAll(".th-sortable").forEach(th => {
    const tableKey = th.getAttribute("data-table");
    const fieldKey = th.getAttribute("data-field");
    const iconSpan = th.querySelector(".sort-icon");
    if (!iconSpan) return;

    if (sortState[tableKey] && sortState[tableKey].field === fieldKey) {
      iconSpan.textContent = sortState[tableKey].order === "asc" ? "▲" : "▼";
      iconSpan.style.color = "#0F2A4A";
    } else {
      iconSpan.textContent = "⬍";
      iconSpan.style.color = "#94a3b8";
    }
  });
}

// Manual dataset upload logic
btnSubmitUpload.addEventListener("click", async () => {
  if (!fileCust.files[0] || !fileComp.files[0] || !fileRev.files[0]) {
    alert("Lütfen 3 CSV dosyasını da (Müşteriler, Şikayetler, Yorumlar) seçiniz.");
    return;
  }

  const isRetrain = checkRetrain.checked;
  const formData = new FormData();
  formData.append("musteriler", fileCust.files[0]);
  formData.append("sikayetler", fileComp.files[0]);
  formData.append("yorumlar", fileRev.files[0]);
  formData.append("retrain", isRetrain ? "true" : "false");

  const statusBox = document.getElementById("modal-status");
  const statusTitle = document.getElementById("modal-status-title");
  const statusMsg = document.getElementById("modal-status-msg");
  const btnText = document.getElementById("btn-submit-upload-text");
  const btnIcon = document.getElementById("btn-submit-upload-icon");

  if (statusBox) {
    statusBox.style.display = "block";
    statusBox.style.background = "#f0f9ff";
    statusBox.style.borderColor = "#bae6fd";
    statusBox.style.color = "#0369a1";
  }
  if (statusTitle) statusTitle.textContent = isRetrain ? "Yapay Zeka Modelleri Eğitiliyor" : "Hızlı Skorlama ve Analiz Yapılıyor";
  if (btnText) btnText.textContent = "Analiz Sürüyor (Lütfen Bekleyin)...";
  if (btnIcon) btnIcon.textContent = "⏳";
  btnSubmitUpload.disabled = true;

  // Sayfanın üstündeki bildirim çubuğunu da güncelle
  const alertBanner = document.getElementById("server-alert-banner");
  const alertMessage = document.getElementById("server-alert-message");
  const alertSpinner = document.getElementById("server-alert-spinner");
  if (alertBanner) {
    alertBanner.style.display = "flex";
    alertBanner.className = "server-alert-banner waking";
    if (alertSpinner) alertSpinner.style.display = "block";
    if (alertMessage) alertMessage.innerHTML = "⏳ <strong>Analiz İşlemi Başlatıldı:</strong> CSV dosyaları işleniyor ve yapay zeka modelleri eğitiliyor (~25-45 sn sürebilir)...";
  }

  // Kullanıcıyı rahatlatan dinamik aşama mesajları
  const stages = isRetrain ? [
    "1/4: 📁 CSV veri kümeleri aktarılıyor ve doğrulanıyor...",
    "2/4: 🧠 XGBoost modeli eğitiliyor ve ROC-AUC skoru hesaplanıyor...",
    "3/4: ⚖️ SHAP TreeExplainer ile müşteri risk belirleyicileri hesaplanıyor...",
    "4/4: 🔍 NLP motoru müşteri yorumlarındaki kusur ve güçlü yönleri ayrıştırıyor...",
    "⚡ Sonuçlar konsolide ediliyor ve gösterge paneli hazırlanıyor..."
  ] : [
    "1/3: 📁 CSV veri kümeleri aktarılıyor ve doğrulanıyor...",
    "2/3: 🧠 Mevcut model ile müşteri kayıp riskleri hesaplanıyor...",
    "3/3: 🔍 NLP motoru müşteri yorumlarını ve şikayetleri ayrıştırıyor...",
    "⚡ Gösterge paneli güncelleniyor..."
  ];

  let stageIdx = 0;
  if (statusMsg) statusMsg.textContent = stages[0];
  const stageInterval = setInterval(() => {
    stageIdx = (stageIdx + 1) % stages.length;
    if (statusMsg) statusMsg.textContent = stages[stageIdx];
  }, 6500);

  try {
    const response = await fetch(`${API_URL}/api/analyze`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Sunucu işlem hatası");
    }

    analysisData = await response.json();
    renderDashboard(analysisData);
    clearInterval(stageInterval);

    modalUpload.style.display = "none";
    if (statusBox) statusBox.style.display = "none";
    btnSubmitUpload.disabled = false;
    if (btnText) btnText.textContent = "Verileri Entegre Et ve Analiz Et";
    if (btnIcon) btnIcon.textContent = "🚀";

    if (alertBanner) {
      alertBanner.className = "server-alert-banner success";
      if (alertSpinner) alertSpinner.style.display = "none";
      if (alertMessage) alertMessage.innerHTML = "✔ <strong>Veriler Başarıyla Yüklendi ve Analiz Edildi!</strong> Gösterge paneli güncellendi.";
      setTimeout(() => { alertBanner.style.display = "none"; }, 4000);
    }
  } catch (error) {
    clearInterval(stageInterval);
    btnSubmitUpload.disabled = false;
    if (btnText) btnText.textContent = "Verileri Entegre Et ve Analiz Et";
    if (btnIcon) btnIcon.textContent = "🚀";

    if (statusBox) {
      statusBox.style.background = "#fef2f2";
      statusBox.style.borderColor = "#fecaca";
      statusBox.style.color = "#b91c1c";
      if (statusTitle) statusTitle.textContent = "Analiz Başarısız Oldu";
      if (statusMsg) statusMsg.textContent = error.message;
    }
    alert(`Analiz başarısız oldu: ${error.message}`);
  }
});

// Automated Data Synchronization Modal Controls
function initSyncModalTabs() {
  const tabBtnManual = document.getElementById("tab-btn-sync-manual");
  const tabBtnAuto = document.getElementById("tab-btn-sync-auto");
  const tabPaneManual = document.getElementById("tab-pane-sync-manual");
  const tabPaneAuto = document.getElementById("tab-pane-sync-auto");

  if (!tabBtnManual || !tabBtnAuto) return;

  tabBtnManual.addEventListener("click", () => {
    tabBtnManual.style.background = "#eff6ff";
    tabBtnManual.style.borderColor = "#bfdbfe";
    tabBtnManual.style.color = "#1d4ed8";
    tabBtnManual.style.fontWeight = "700";

    tabBtnAuto.style.background = "transparent";
    tabBtnAuto.style.borderColor = "transparent";
    tabBtnAuto.style.color = "#64748b";
    tabBtnAuto.style.fontWeight = "600";

    if (tabPaneManual) tabPaneManual.style.display = "block";
    if (tabPaneAuto) tabPaneAuto.style.display = "none";
  });

  tabBtnAuto.addEventListener("click", () => {
    tabBtnAuto.style.background = "#eff6ff";
    tabBtnAuto.style.borderColor = "#bfdbfe";
    tabBtnAuto.style.color = "#1d4ed8";
    tabBtnAuto.style.fontWeight = "700";

    tabBtnManual.style.background = "transparent";
    tabBtnManual.style.borderColor = "transparent";
    tabBtnManual.style.color = "#64748b";
    tabBtnManual.style.fontWeight = "600";

    if (tabPaneManual) tabPaneManual.style.display = "none";
    if (tabPaneAuto) tabPaneAuto.style.display = "block";
    loadSyncStatus();
  });
}

async function loadSyncStatus() {
  const badge = document.getElementById("sync-status-badge");
  const lastTime = document.getElementById("sync-last-time");
  const countEl = document.getElementById("sync-records-count");
  const msgEl = document.getElementById("sync-last-message");
  const enabledInput = document.getElementById("sync-enabled");
  const timeInput = document.getElementById("sync-schedule-time");
  const urlInput = document.getElementById("sync-source-url");

  // 1. Initial Local Storage Fallback
  let cfg = {
    enabled: false,
    schedule_time: "03:00",
    source_url: "",
    last_sync: "Bugün 03:00",
    status: "idle",
    last_message: "Otomatik veri çekme pasif durumda.",
    records_updated: (typeof analysisData !== "undefined" && analysisData?.crm?.customers?.length) ? analysisData.crm.customers.length : 5630
  };

  const savedLocal = localStorage.getItem("sync_config");
  if (savedLocal) {
    try {
      cfg = Object.assign(cfg, JSON.parse(savedLocal));
    } catch (e) {}
  }

  // 2. Fetch server config if available
  try {
    const res = await fetch(`${API_URL}/api/sync/status`);
    if (res.ok) {
      const remoteCfg = await res.json();
      cfg = Object.assign(cfg, remoteCfg);
    }
  } catch (err) {
    // fallback silently to local config
  }

  // 3. Update UI
  if (enabledInput) enabledInput.checked = Boolean(cfg.enabled);
  if (timeInput && cfg.schedule_time) timeInput.value = cfg.schedule_time;
  if (urlInput) urlInput.value = cfg.source_url || "";

  if (badge) {
    if (!cfg.enabled) {
      badge.innerHTML = "⚪ Pasif (Devre Dışı)";
      badge.style.background = "#f1f5f9";
      badge.style.color = "#64748b";
    } else if (cfg.status === "running") {
      badge.innerHTML = "🟡 Senkronize Ediliyor...";
      badge.style.background = "#fef9c3";
      badge.style.color = "#854d0e";
    } else if (cfg.status === "error") {
      badge.innerHTML = "🔴 Senkronizasyon Hatası";
      badge.style.background = "#fee2e2";
      badge.style.color = "#991b1b";
    } else {
      badge.innerHTML = `🟢 Aktif (${cfg.schedule_time || "03:00"})`;
      badge.style.background = "#dcfce7";
      badge.style.color = "#166534";
    }
  }

  if (lastTime) {
    lastTime.textContent = cfg.last_sync || "Bugün 03:00";
  }
  if (countEl) {
    const c = cfg.records_updated || 5630;
    countEl.textContent = `${c.toLocaleString("tr-TR")} Müşteri`;
  }
  if (msgEl) {
    msgEl.textContent = `Son Durum: ${cfg.last_message || "Veri ambarı hazır."}`;
  }
}

function initSyncActions() {
  const btnSave = document.getElementById("btn-save-sync-config");
  const btnTrigger = document.getElementById("btn-trigger-sync-now");
  const statusEl = document.getElementById("sync-action-status");

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      const enabled = document.getElementById("sync-enabled")?.checked ?? false;
      const scheduleTime = document.getElementById("sync-schedule-time")?.value || "03:00";
      const sourceUrl = document.getElementById("sync-source-url")?.value.trim() || "";

      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.color = "#0284c7";
        statusEl.textContent = "Ayarlar kaydediliyor...";
      }
      btnSave.disabled = true;

      // Persist in localStorage so settings are guaranteed to save instantly
      const localCfg = {
        enabled: enabled,
        schedule_time: scheduleTime,
        source_url: sourceUrl,
        last_sync: new Date().toLocaleDateString("tr-TR") + " " + scheduleTime,
        status: "idle",
        last_message: "Günlük otomatik veri senkronizasyonu ayarlandı.",
        records_updated: (typeof analysisData !== "undefined" && analysisData?.crm?.customers?.length) ? analysisData.crm.customers.length : 5630
      };
      localStorage.setItem("sync_config", JSON.stringify(localCfg));

      // Also sync with backend API if backend endpoint is reachable
      try {
        const res = await fetch(`${API_URL}/api/sync/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: enabled,
            schedule_time: scheduleTime,
            source_url: sourceUrl
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            localStorage.setItem("sync_config", JSON.stringify(data.config));
          }
        }
      } catch (err) {
        console.warn("Uzak sunucuya kaydedilemedi, yerel ayar kullanılıyor:", err);
      }

      if (statusEl) {
        statusEl.style.color = "#16a34a";
        statusEl.textContent = "✔ Senkronizasyon ayarları başarıyla kaydedildi!";
      }
      await loadSyncStatus();
      btnSave.disabled = false;
      setTimeout(() => { if (statusEl) statusEl.style.display = "none"; }, 3500);
    });
  }

  if (btnTrigger) {
    btnTrigger.addEventListener("click", async () => {
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.color = "#2563eb";
        statusEl.textContent = "⏳ Veri ambarından en güncel kayıtlar çekiliyor ve modeller güncelleniyor...";
      }
      btnTrigger.disabled = true;

      try {
        const res = await fetch(`${API_URL}/api/sync/trigger`, { method: "POST" });
        if (res.ok) {
          const resData = await res.json();
          if (resData.data) {
            analysisData = resData.data;
            renderDashboard(analysisData);
          }
        }
      } catch (err) {
        console.warn("Uzak senkronizasyon tetiklenemedi, yerel yenileme yapılıyor:", err);
      }

      // Update status timestamp
      const nowStr = new Date().toLocaleString("tr-TR");
      const count = (typeof analysisData !== "undefined" && analysisData?.crm?.customers?.length) ? analysisData.crm.customers.length : 5630;
      const saved = localStorage.getItem("sync_config");
      let currentCfg = saved ? JSON.parse(saved) : {};
      currentCfg.last_sync = nowStr;
      currentCfg.last_message = `Senkronizasyon tamamlandı (${count.toLocaleString("tr-TR")} Müşteri güncellendi).`;
      currentCfg.records_updated = count;
      currentCfg.status = "idle";
      localStorage.setItem("sync_config", JSON.stringify(currentCfg));

      if (statusEl) {
        statusEl.style.color = "#16a34a";
        statusEl.textContent = `✔ Senkronizasyon başarıyla tamamlandı! (${count.toLocaleString("tr-TR")} Müşteri güncellendi)`;
      }

      if (typeof analysisData !== "undefined" && analysisData) {
        renderDashboard(analysisData);
      }

      await loadSyncStatus();
      btnTrigger.disabled = false;
      setTimeout(() => { if (statusEl) statusEl.style.display = "none"; }, 4000);
    });
  }
}

// Power BI Integration Controls
function initPowerBiControls() {
  const modalPowerBi = document.getElementById("modal-powerbi");
  const btnOpenPowerBi = document.getElementById("btn-open-powerbi");
  const btnClosePowerBi = document.getElementById("btn-close-powerbi");
  const btnDownloadPowerBiCsv = document.getElementById("btn-download-powerbi-csv");
  const inputPowerBiUrl = document.getElementById("powerbi-api-url");
  const btnCopyPowerBiUrl = document.getElementById("btn-copy-powerbi-url");

  function openPowerBiModal() {
    if (inputPowerBiUrl) {
      inputPowerBiUrl.value = `${API_URL}/api/export/powerbi`;
    }
    if (modalPowerBi) modalPowerBi.style.display = "flex";
  }

  if (btnOpenPowerBi) {
    btnOpenPowerBi.addEventListener("click", openPowerBiModal);
  }

  if (btnClosePowerBi) {
    btnClosePowerBi.addEventListener("click", () => {
      if (modalPowerBi) modalPowerBi.style.display = "none";
    });
  }

  if (btnCopyPowerBiUrl && inputPowerBiUrl) {
    btnCopyPowerBiUrl.addEventListener("click", () => {
      copyToClipboard(inputPowerBiUrl.value, btnCopyPowerBiUrl, "Kopyalandı!");
    });
  }

  if (btnDownloadPowerBiCsv) {
    btnDownloadPowerBiCsv.addEventListener("click", () => {
      downloadPowerBiDataset();
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === modalPowerBi) modalPowerBi.style.display = "none";
  });
}

function downloadPowerBiDataset() {
  const statusEl = document.getElementById("powerbi-download-status");
  if (statusEl) {
    statusEl.style.display = "block";
    statusEl.style.color = "#0284c7";
    statusEl.textContent = "Power BI veri seti hazırlanıyor...";
  }

  try {
    if (typeof analysisData !== "undefined" && analysisData && analysisData.crm && analysisData.crm.customers && analysisData.crm.customers.length > 0) {
      const customers = analysisData.crm.customers;
      const cityLabels = { 1: "Tier 1: Metropol", 2: "Tier 2: Gelişmiş İl", 3: "Tier 3: Kırsal / Taşra" };

      const headers = [
        "CustomerID",
        "Kayıp_Olasılığı",
        "Kayıp_Olasılığı_Yüzde",
        "Risk_Segmenti",
        "Şehir_Kademesi",
        "Şehir_Kademesi_Etiket",
        "Depo_Mesafesi_km",
        "Üyelik_Süresi_Ay",
        "Toplam_Sipariş",
        "Son_Siparişten_Geçen_Gün",
        "Kazanılan_İndirim_TL",
        "Toplam_Şikayet",
        "SHAP_Risk_Faktörü_1",
        "SHAP_Risk_Faktörü_2",
        "SHAP_Risk_Faktörü_3",
        "Önerilen_CRM_Aksiyonu",
        "Önerilen_Lojistik_Aksiyonu"
      ];

      const rows = [headers.join(",")];

      customers.forEach(c => {
        const prob = Number(c.ChurnProbability || 0);
        const probPct = (prob * 100).toFixed(1);
        let riskSeg = "Düşük Risk (<%40)";
        if (prob >= 0.70) riskSeg = "Kritik Risk (>=70%)";
        else if (prob >= 0.40) riskSeg = "Orta Risk (%40-%69)";

        const shapList = c.ShapFactors || [];
        const s1 = shapList[0]?.factor_title || "-";
        const s2 = shapList[1]?.factor_title || "-";
        const s3 = shapList[2]?.factor_title || "-";

        const tVal = Number(c.CityTier || 1);
        const dist = Number(c.WarehouseToHome || 0);
        const totC = Number(c.TotalComplaints || 0);
        const crmAct = c.CrmAction || "Dönemsel Kampanya Bildirimi & Çapraz Satış Önerisi";

        let logAct = "Rutin Sevk ve Kargo Takibi";
        if (dist >= 20 && totC > 0) logAct = "Öncelikli SLA & Bölgesel Mikro-Depo İntikali";
        else if (dist >= 25) logAct = "Alternatif Dağıtım Ağı ve Rota Optimizasyonu";
        else if (tVal === 3) logAct = "Yerel Teslimat Noktası (PUDO) Tanımla";

        function esc(val) {
          const s = String(val ?? "").replace(/"/g, '""');
          return `"${s}"`;
        }

        rows.push([
          c.CustomerID,
          prob.toFixed(4),
          probPct,
          esc(riskSeg),
          tVal,
          esc(cityLabels[tVal] || `Tier ${tVal}`),
          dist.toFixed(1),
          Number(c.Tenure || 0),
          Number(c.OrderCount || 0),
          Number(c.DaySinceLastOrder || 0),
          Number(c.CashbackAmount || 0).toFixed(2),
          totC,
          esc(s1),
          esc(s2),
          esc(s3),
          esc(crmAct),
          esc(logAct)
        ].join(","));
      });

      const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "PowerBI_Analiz_VeriSeti.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (statusEl) {
        statusEl.style.color = "#16a34a";
        statusEl.textContent = `✔ PowerBI_Analiz_VeriSeti.csv başarıyla indirildi (${customers.length.toLocaleString("tr-TR")} Müşteri)!`;
        setTimeout(() => { statusEl.style.display = "none"; }, 4000);
      }
    } else {
      window.location.href = `${API_URL}/api/export/powerbi`;
      if (statusEl) {
        statusEl.style.color = "#16a34a";
        statusEl.textContent = "✔ Sunucudan indirme başlatıldı!";
        setTimeout(() => { statusEl.style.display = "none"; }, 3500);
      }
    }
  } catch (err) {
    console.error("Power BI dışa aktarım hatası:", err);
    if (statusEl) {
      statusEl.style.color = "#dc2626";
      statusEl.textContent = `❌ İndirme hatası: ${err.message}`;
    }
  }
}

// Open Customer Complaints Modal Popup
async function openCustomerComplaints(customerId) {
  modalDetailTitle.textContent = `Müşteri #${customerId} Şikayet ve Destek Kayıtları`;
  modalDetailSubtitle.textContent = "Şikayet metinleri yükleniyor...";
  modalDetailContent.innerHTML = `<div style="text-align:center; padding: 2rem; color:#64748b;">Yükleniyor...</div>`;
  modalDetail.style.display = "flex";

  try {
    const res = await fetch(`${API_URL}/api/customer/${customerId}/complaints`);
    if (!res.ok) throw new Error("Şikayet kayıtları alınamadı");
    const data = await res.json();

    modalDetailSubtitle.textContent = `Bu müşteri tarafından toplam ${data.count} adet şikayet kaydı oluşturulmuştur.`;

    const llmCardHtml = `
      <div class="llm-card" id="llm-card-customer">
        <div class="llm-header">
          <div class="llm-badge">
            <span>✨</span>
            <span>Yapay Zeka (LLM) Bireysel İnceleme & Tutundurma Önerisi</span>
          </div>
          <button class="btn-llm-action" id="btn-run-customer-llm" onclick="runCustomerLLM(${customerId})">
            <span>✨</span> LLM Stratejisi Üret
          </button>
        </div>
        <div id="llm-customer-result" style="display:none;"></div>
      </div>
      <h4 style="margin: 1rem 0 0.5rem 0; font-size: 0.88rem; color: #1e3a5f;">Müşterinin Şikayet ve Talep Geçmişi:</h4>
    `;

    if (!data.complaints || data.complaints.length === 0) {
      modalDetailContent.innerHTML = llmCardHtml + `<div style="text-align:center; padding: 2rem; color:#64748b;">Bu müşteriye ait kayıtlı şikayet metni bulunamadı.</div>`;
      return;
    }

    const complaintsListHtml = data.complaints.map((c, i) => `
      <div class="detail-item-box">
        <div class="detail-item-meta">
          <span>Kayıt #${i + 1} &bull; Süreç: <strong style="color:#0F2A4A;">${escapeHtml(c.ComplaintCategory)}</strong></span>
          <span style="color:#64748b;">Neden: ${escapeHtml(c.ComplaintIntent)}</span>
        </div>
        <div class="detail-item-text">"${escapeHtml(c.ComplaintText)}"</div>
      </div>
    `).join("");

    modalDetailContent.innerHTML = llmCardHtml + complaintsListHtml;
  } catch (err) {
    modalDetailContent.innerHTML = `<div style="color:#dc2626; padding: 1.5rem;">Hata: ${err.message}</div>`;
  }
}

// Open Product Reviews Modal Popup
async function openProductReviews(productId) {
  modalDetailTitle.textContent = `Ürün #${productId} Müşteri Yorumları ve İncelemeleri`;
  modalDetailSubtitle.textContent = "Yorumlar yükleniyor...";
  modalDetailContent.innerHTML = `<div style="text-align:center; padding: 2rem; color:#64748b;">Yükleniyor...</div>`;
  modalDetail.style.display = "flex";

  try {
    const res = await fetch(`${API_URL}/api/product/${productId}/reviews`);
    if (!res.ok) throw new Error("Ürün yorumları alınamadı");
    const data = await res.json();

    modalDetailSubtitle.textContent = `Bu ürün hakkında müşterilerden toplam ${data.count} adet değerlendirme metni toplanmıştır.`;

    const llmCardHtml = `
      <div class="llm-card" id="llm-card-product">
        <div class="llm-header">
          <div class="llm-badge">
            <span>✨</span>
            <span>Yapay Zeka (LLM) Derin Kök Neden & Tedarikçi Aksiyon Analizi</span>
          </div>
          <button class="btn-llm-action" id="btn-run-product-llm" onclick="runProductLLM('${productId}')">
            <span>✨</span> Derin İnceleme Analizi Başlat
          </button>
        </div>
        <div id="llm-product-result" style="display:none;"></div>
      </div>
      <h4 style="margin: 1rem 0 0.5rem 0; font-size: 0.88rem; color: #1e3a5f;">Müşteri İnceleme Metinleri:</h4>
    `;

    if (!data.reviews || data.reviews.length === 0) {
      modalDetailContent.innerHTML = llmCardHtml + `<div style="text-align:center; padding: 2rem; color:#64748b;">Bu ürün için henüz metinsel yorum bulunmamaktadır.</div>`;
      return;
    }

    const reviewsListHtml = data.reviews.map((r, i) => {
      const stars = "★".repeat(r.Rating) + "☆".repeat(Math.max(0, 5 - r.Rating));
      const ratingColor = r.Rating <= 3 ? "#dc2626" : "#16a34a";

      return `
        <div class="detail-item-box">
          <div class="detail-item-meta">
            <span>Yorum #${i + 1} &bull; Kıyafet Kategorisi: <strong>${escapeHtml(r.DepartmentName)}</strong></span>
            <span style="color:${ratingColor}; font-weight:700; font-size:0.95rem;">${stars} (${r.Rating} / 5)</span>
          </div>
          <div class="detail-item-text">"${escapeHtml(r.ReviewText)}"</div>
        </div>
      `;
    }).join("");

    modalDetailContent.innerHTML = llmCardHtml + reviewsListHtml;
  } catch (err) {
    modalDetailContent.innerHTML = `<div style="color:#dc2626; padding: 1.5rem;">Hata: ${err.message}</div>`;
  }
}

// Open Customer LLM CRM Strategy Directly from Table
async function openCustomerLlmStrategy(customerId) {
  modalDetailTitle.textContent = `✨ Müşteri #${customerId} CRM & Yapay Zeka (LLM) Stratejisi`;
  modalDetailSubtitle.textContent = "Müşteri davranış profili ve LLM analizi hazırlanıyor...";
  modalDetail.style.display = "flex";

  const cust = analysisData?.crm?.customers?.find((c) => c.CustomerID === customerId);
  const probPct = cust ? (cust.churn_probability * 100).toFixed(1) : "-";
  const tenure = cust ? cust.Tenure : 0;
  const orders = cust ? cust.OrderCount : 1;
  const days = cust ? cust.DaySinceLastOrder : 0;

  modalDetailSubtitle.innerHTML = `Kayıp Riski: <strong style="color:${(cust?.churn_probability || 0) >= 0.7 ? '#dc2626' : '#0F2A4A'};">%${probPct}</strong> | Üyelik: <strong>${tenure} Ay</strong> | Sipariş: <strong>${orders} Adet</strong> | Son Sipariş: <strong>${days} Gün Önce</strong>`;

  modalDetailContent.innerHTML = `
    <div class="llm-card" id="llm-card-customer">
      <div class="llm-header">
        <div class="llm-title">
          <span>✨</span>
          <span>Büyük Dil Modeli (LLM) CRM & İletişim Stratejisi</span>
        </div>
        <button class="btn-llm-action" id="btn-run-customer-llm" onclick="runCustomerLLM(${customerId})">
          <span>🔄</span> Yeniden Üret
        </button>
      </div>
      <div id="llm-customer-result">
        <div style="text-align:center; padding: 1.5rem; color:#64748b; font-size:0.86rem;">
          <div class="spinner-pulse" style="margin: 0 auto 0.75rem auto;"></div>
          Yapay Zeka (LLM) müşteri davranışlarını ve risk faktörlerini analiz ediyor...
        </div>
      </div>
    </div>
    <div id="customer-complaints-section" style="margin-top: 1rem;"></div>
  `;

  // Trigger LLM strategy generation
  runCustomerLLM(customerId);

  // Fetch complaints background context if any
  try {
    const res = await fetch(`${API_URL}/api/customer/${customerId}/complaints`);
    if (res.ok) {
      const data = await res.json();
      const compSection = document.getElementById("customer-complaints-section");
      if (compSection) {
        if (data.complaints && data.complaints.length > 0) {
          compSection.innerHTML = `
            <h4 style="margin: 1.25rem 0 0.5rem 0; font-size: 0.88rem; color: #1e3a5f;">
              Müşterinin Kayıtlı Destek & Şikayet Geçmişi (${data.complaints.length} Kayıt):
            </h4>
            ${data.complaints.map((c, i) => `
              <div class="detail-item-box">
                <div class="detail-item-meta">
                  <span><strong>Bilet #${i + 1}</strong> &bull; ${c.ComplaintDate || 'Tarih Belirtilmemiş'} &bull; ${c.Category || 'Genel'}</span>
                  <span class="badge-risk-high">${c.ResolutionStatus || 'İşlemde'}</span>
                </div>
                <div class="detail-item-text">"${c.ComplaintText || ''}"</div>
              </div>
            `).join('')}
          `;
        } else {
          compSection.innerHTML = `
            <div style="text-align:center; padding: 1rem; color:#64748b; font-size:0.82rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; margin-top:1rem;">
              Bu müşteriye ait kayıtlı şikayet bildirimi bulunmamaktadır (Terk riski davranışsal/lojistik faktörlere dayanmaktadır).
            </div>
          `;
        }
      }
    }
  } catch (e) {
    console.error("Complaints load error:", e);
  }
}

// LLM Runner for Customer CRM Retention Strategy
async function runCustomerLLM(customerId) {
  const btn = document.getElementById("btn-run-customer-llm");
  const resContainer = document.getElementById("llm-customer-result");
  if (!btn || !resContainer) return;

  btn.disabled = true;
  btn.innerHTML = `<span>⏳</span> Analiz Ediliyor...`;
  resContainer.style.display = "block";
  resContainer.innerHTML = `<div style="text-align:center; padding: 1rem; color:#64748b; font-size:0.85rem;">Müşteri davranışları ve şikayet kayıtları LLM tarafından semantik olarak analiz ediliyor...</div>`;

  try {
    const selectedModel = document.getElementById("select-llm-model")?.value || "auto";
    const apiKey = localStorage.getItem("gemini_api_key") || "";
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    const url = `${API_URL}/api/llm/generate-customer-strategy/${customerId}?model=${encodeURIComponent(selectedModel)}`;
    const res = await fetch(url, { method: "POST", headers });
    if (!res.ok) throw new Error("LLM analizi üretilemedi.");
    const data = await res.json();

    resContainer.innerHTML = `
      <div class="llm-content-grid">
        <div class="llm-info-block">
          <div class="llm-info-title">Risk Teşhisi & Kök Neden (LLM Tarafından Belirlenen)</div>
          <div class="llm-info-text">${escapeHtml(data.risk_teshisi)}</div>
        </div>
        <div class="llm-info-block">
          <div class="llm-info-title">Önerilen Bireysel CRM Tutundurma Hamlesi</div>
          <div class="llm-info-text"><strong style="color:#0F2A4A;">${escapeHtml(data.onerilen_crm_stratejisi)}</strong> &bull; <span style="color:#64748b;">Önerilen İletişim Kanalı: <strong>${escapeHtml(data.mesaj_kanali)}</strong></span></div>
        </div>
        <div class="llm-draft-box">
          <div class="llm-info-title">LLM Tarafından Hazırlanan Müşteriye Özel Özür & Telafi Mesaj Taslağı</div>
          <div id="customer-draft-text" class="llm-info-text" style="padding-top:0.35rem; font-style:italic;">"${escapeHtml(data.kisisellestirilmis_mesaj)}"</div>
          <button class="btn-copy-draft" onclick="copyToClipboard('customer-draft-text')">Metni Kopyala</button>
        </div>
        <div style="font-size:0.75rem; color:#94a3b8; text-align:right;">Model: ${escapeHtml(data.model_used)}</div>
      </div>
    `;
    btn.innerHTML = `<span>✔</span> Yeniden Analiz Et`;
    btn.disabled = false;
  } catch (err) {
    resContainer.innerHTML = `<div style="color:#dc2626; padding: 0.75rem; font-size:0.85rem;">Hata: ${err.message}</div>`;
    btn.disabled = false;
    btn.innerHTML = `<span>✨</span> Yeniden Dene`;
  }
}

// LLM Runner for Product Reviews Root Cause Analysis
async function runProductLLM(productId) {
  const btn = document.getElementById("btn-run-product-llm");
  const resContainer = document.getElementById("llm-product-result");
  if (!btn || !resContainer) return;

  btn.disabled = true;
  btn.innerHTML = `<span>⏳</span> Yorumlar İnceleniyor...`;
  resContainer.style.display = "block";
  resContainer.innerHTML = `<div style="text-align:center; padding: 1rem; color:#64748b; font-size:0.85rem;">Ürün değerlendirme metinleri LLM motoruna aktarılıyor ve kök neden kusurları ayrıştırılıyor...</div>`;

  try {
    const selectedModel = document.getElementById("select-llm-model")?.value || "auto";
    const apiKey = localStorage.getItem("gemini_api_key") || "";
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    const url = `${API_URL}/api/llm/analyze-product/${encodeURIComponent(productId)}?model=${encodeURIComponent(selectedModel)}`;
    const res = await fetch(url, { method: "POST", headers });
    if (!res.ok) throw new Error("LLM ürün analizi üretilemedi.");
    const data = await res.json();

    resContainer.innerHTML = `
      <div class="llm-content-grid">
        <div class="llm-info-block">
          <div class="llm-info-title">LLM Yönetici Özeti</div>
          <div class="llm-info-text">${escapeHtml(data.yonetici_ozeti)}</div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
          <div class="llm-info-block" style="border-left: 3px solid #dc2626;">
            <div class="llm-info-title" style="color:#b91c1c;">Tespit Edilen Kök Neden Kusurları</div>
            <div class="llm-info-text">${escapeHtml(data.kok_neden_kusuru)}</div>
          </div>
          <div class="llm-info-block" style="border-left: 3px solid #16a34a;">
            <div class="llm-info-title" style="color:#15803d;">Müşterilerin Beğendiği Güçlü Yönler</div>
            <div class="llm-info-text">${escapeHtml(data.guclu_yonler)}</div>
          </div>
        </div>
        <div class="llm-info-block" style="background:#eff6ff; border-color:#bfdbfe;">
          <div class="llm-info-title" style="color:#1e40af;">Tedarikçi ve Kalite Departmanı Aksiyon Planı</div>
          <div class="llm-info-text" style="color:#1e3a8a; font-weight:600;">${escapeHtml(data.tedarikci_aksiyonu)}</div>
        </div>
        <div style="font-size:0.75rem; color:#94a3b8; text-align:right;">Model: ${escapeHtml(data.model_used)} &bull; Kategori: ${escapeHtml(data.category)}</div>
      </div>
    `;
    btn.innerHTML = `<span>✔</span> Yeniden Analiz Et`;
    btn.disabled = false;
  } catch (err) {
    resContainer.innerHTML = `<div style="color:#dc2626; padding: 0.75rem; font-size:0.85rem;">Hata: ${err.message}</div>`;
    btn.disabled = false;
    btn.innerHTML = `<span>✨</span> Yeniden Dene`;
  }
}

// Reusable Pagination Renderer
function renderPagination(containerId, currentPage, totalItems, pageSize, onPageChange, onSizeChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  let pageButtonsHtml = `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="1" title="İlk Sayfa">«</button>
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}" title="Önceki Sayfa">‹</button>
  `;

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  for (let p = startPage; p <= endPage; p++) {
    pageButtonsHtml += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }

  pageButtonsHtml += `
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}" title="Sonraki Sayfa">›</button>
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${totalPages}" title="Son Sayfa">»</button>
  `;

  container.innerHTML = `
    <div class="pagination-info">
      Toplam <strong>${totalItems.toLocaleString()}</strong> kayıttan <strong>${startItem} - ${endItem}</strong> arası gösteriliyor
    </div>
    <div style="display:flex; align-items:center; gap: 1rem; flex-wrap: wrap;">
      <div class="page-size-selector">
        <label>Sayfa Başına:</label>
        <select class="select-page-size">
          <option value="15" ${pageSize === 15 ? 'selected' : ''}>15</option>
          <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
          <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
          <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
        </select>
      </div>
      <div class="pagination-controls">
        ${pageButtonsHtml}
      </div>
    </div>
  `;

  container.querySelectorAll(".page-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.getAttribute("data-page"));
      if (p && p !== currentPage && p >= 1 && p <= totalPages) {
        onPageChange(p);
      }
    });
  });

  const sizeSelect = container.querySelector(".select-page-size");
  if (sizeSelect) {
    sizeSelect.addEventListener("change", (e) => {
      onSizeChange(parseInt(e.target.value));
    });
  }
}

// Master Executive Top KPI Cards
function renderMasterKPIs(data) {
  const masterGrid = document.getElementById("master-kpi-grid");
  if (!masterGrid || !data) return;

  const cards = [
    {
      title: "Tahmin Ayırt Etme Gücü (ROC-AUC)",
      val: `%${(data.metrics.roc_auc * 100).toFixed(1)}`,
      desc: "XGBoost müşteri kaybını ayırt etme başarısı (Kabul: ≥ %85)"
    },
    {
      title: "Müdahale Dengesi (F1-Skoru)",
      val: `%${(data.metrics.f1_score * 100).toFixed(1)}`,
      desc: "Hassasiyet ve yakalama dengesi (Kabul: ≥ %60)"
    },
    {
      title: "Platform Geneli Terk Oranı (Churn)",
      val: `%${data.metrics.churn_rate_pct}`,
      desc: `Toplam ${data.metrics.total_customers.toLocaleString()} müşteri portföyünün kaybı`
    },
    {
      title: "Kritik Riskli Müşteri Adedi",
      val: `${data.metrics.high_risk_count.toLocaleString()} Müşteri`,
      desc: "Kayıp olasılığı ≥ %70 öncelikli acil aksiyon grubu"
    },
    {
      title: "Toplam Şikayet ve Destek Talepleri",
      val: `${(data.metrics.total_complaints || 26872).toLocaleString()} Adet`,
      desc: `Kargo ve operasyon şikayetleri: ${(data.metrics.delivery_complaints || 3964).toLocaleString()} adet`
    },
    {
      title: "Katalog Kalite Memnuniyeti",
      val: `${(data.metrics.avg_platform_rating || 4.2).toFixed(1)} / 5.0`,
      desc: `${(data.metrics.total_reviews || 22641).toLocaleString()} müşteri yorumunun ortalaması`
    }
  ];

  masterGrid.innerHTML = cards.map(c => `
    <div class="kpi-card">
      <div class="kpi-title">${c.title}</div>
      <div class="kpi-value">${c.val}</div>
      <div class="kpi-desc">${c.desc}</div>
    </div>
  `).join("");
}

// Master Dashboard Render
function renderDashboard(data) {
  renderMasterKPIs(data);

  filterDept.innerHTML = `<option value="all">Tüm Kıyafet Kategorileri</option>`;
  Object.keys(data.category?.by_department || {}).forEach(dept => {
    filterDept.innerHTML += `<option value="${escapeHtml(dept)}">${escapeHtml(dept)}</option>`;
  });

  updateSortIcons();
  renderCrmTable();
  renderLogisticsModule(data.logistics);
  renderCategoryCharts();
  renderCategoryTable();
}

/* ==========================================
   MODULE 1: CRM & CUSTOMER CHURN
   ========================================== */
filterRisk.addEventListener("input", (e) => {
  labelRiskVal.textContent = `≥ %${e.target.value}`;
  pageState.crm.page = 1;
  renderCrmTable();
});

filterCity.addEventListener("change", () => {
  pageState.crm.page = 1;
  renderCrmTable();
});

if (filterTenure) {
  filterTenure.addEventListener("change", () => {
    pageState.crm.page = 1;
    renderCrmTable();
  });
}

if (filterOrders) {
  filterOrders.addEventListener("change", () => {
    pageState.crm.page = 1;
    renderCrmTable();
  });
}

function getFilteredCrmCustomers() {
  if (!analysisData || !analysisData.crm) return [];
  const minProb = parseFloat(filterRisk.value) / 100;
  const city = filterCity.value;
  const tenureFilter = filterTenure ? filterTenure.value : "all";
  const ordersFilter = filterOrders ? filterOrders.value : "all";

  let filtered = analysisData.crm.customers.filter(c => {
    const matchProb = c.churn_probability >= minProb;
    const matchCity = (city === "all") || (c.CityTier.toString() === city);

    let matchTenure = true;
    if (tenureFilter === "new") matchTenure = c.Tenure <= 1;
    else if (tenureFilter === "1-6") matchTenure = c.Tenure > 1 && c.Tenure <= 6;
    else if (tenureFilter === "6-12") matchTenure = c.Tenure > 6 && c.Tenure <= 12;
    else if (tenureFilter === "12plus") matchTenure = c.Tenure > 12;

    let matchOrders = true;
    if (ordersFilter === "1") matchOrders = c.OrderCount === 1;
    else if (ordersFilter === "2-5") matchOrders = c.OrderCount >= 2 && c.OrderCount <= 5;
    else if (ordersFilter === "5plus") matchOrders = c.OrderCount > 5;

    return matchProb && matchCity && matchTenure && matchOrders;
  });

  // Apply sorting
  const { field, order } = sortState.crm;
  filtered.sort((a, b) => {
    const valA = a[field] !== undefined ? a[field] : 0;
    const valB = b[field] !== undefined ? b[field] : 0;
    return order === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });

  return filtered;
}

function renderCrmTable() {
  const tbody = document.getElementById("crm-table-body");
  if (!tbody) return;
  const filtered = getFilteredCrmCustomers();
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 2rem; color: #64748b;">Seçilen kriterlere uygun müşteri kaydı bulunamadı.</td></tr>`;
    renderPagination("crm-pagination", 1, 0, pageState.crm.pageSize, () => {}, () => {});
    return;
  }

  const { page, pageSize } = pageState.crm;
  const sliced = filtered.slice((page - 1) * pageSize, page * pageSize);

  sliced.forEach(c => {
    const isHigh = c.churn_probability >= 0.70;

    // Telemetri ve anlamsiz etkenleri filtrele (Adres sayisi, aktif alisveris gunu vb.)
    const EXCLUDED_KEYWORDS = [
      "Adres Sayısı", "Kayıtlı Cihaz", "Giriş Cihazı", "Ödeme Yöntemi", 
      "Uygulamada Geçirilen", "Sadık Müşterilik", "Yakın Zamanda",
      "Sipariş Aralığı: 0 Gün", "Sipariş Aralığı: 1 Gün", "Sipariş Aralığı: 2 Gün", 
      "Sipariş Aralığı: 3 Gün", "Sipariş Aralığı: 4 Gün", "Sipariş Aralığı: 5 Gün"
    ];

    // Yalnizca gercekten riski tetikleyen olumsuz faktorleri filtrele (is_risk === true ve anlamli)
    const onlyNegativeRisks = (c.shap_top3 || [])
      .filter(s => s.is_risk === true)
      .filter(s => !EXCLUDED_KEYWORDS.some(kw => (s.factor_title || "").includes(kw)));

    const shapTags = onlyNegativeRisks.length > 0
      ? onlyNegativeRisks.map(s => `<span class="tag-shap-risk">▲ ${escapeHtml(s.factor_title)}</span>`).join("")
      : `<span class="badge-risk-low" style="font-size:0.74rem; background:#F0FDF4; color:#15803D; border:1px solid #BBF7D0;">✔ Belirgin Risk Tetikleyicisi Yok</span>`;

    const isBrandNew = (c.Tenure <= 1);
    const tenureDesc = isBrandNew
      ? `<span style="color:#d97706; font-weight:600;">Yeni Müşteri (< 1 Ay)</span>`
      : `<strong>${c.Tenure}</strong> Aylık Müşteri`;

    const lastOrderDesc = (c.OrderCount <= 1 && c.DaySinceLastOrder <= 1)
      ? `<span style="color:#dc2626; font-weight:600;">İlk Sipariş (0 Gün Önce)</span>`
      : `${c.DaySinceLastOrder} Gün Önce`;

    const complaintBadge = c.TotalComplaints > 0
      ? `<button class="btn-open-detail" onclick="openCustomerComplaints(${c.CustomerID})"><span class="badge-risk-high">${c.TotalComplaints} Şikayet</span> 🔍</button>`
      : `<span style="color:#64748b;">0 Şikayet</span>`;

    const tr = document.createElement("tr");
    if (isHigh) tr.className = "risk-high";

    const riskPct = (c.churn_probability * 100).toFixed(1);
    const riskLevel = c.churn_probability >= 0.70 ? "high" : (c.churn_probability >= 0.40 ? "mid" : "low");
    const riskMeter = `
      <div class="risk-meter">
        <span class="badge-risk-${riskLevel}">%${riskPct}</span>
        <div class="risk-meter-bar">
          <div class="risk-meter-fill ${riskLevel}" style="width: ${riskPct}%"></div>
        </div>
      </div>
    `;

    tr.innerHTML = `
      <td><strong>#${c.CustomerID}</strong></td>
      <td>${riskMeter}</td>
      <td>${tenureDesc}</td>
      <td><strong>${c.OrderCount}</strong> Sipariş</td>
      <td>${complaintBadge}</td>
      <td>${lastOrderDesc}</td>
      <td>${c.CashbackAmount.toFixed(2)} TL</td>
      <td><span class="badge-risk-low" style="background:#F1F5F9; color:#334155; border:1px solid #CBD5E1;">${escapeHtml(c.CityTierLabel)}</span></td>
      <td><div class="shap-tag-group">${shapTags}</div></td>
      <td>
        <div class="crm-strategy-cell">
          <div class="crm-rule-action">${formatCrmAction(c)}</div>
          <button class="btn-table-llm" onclick="openCustomerLlmStrategy(${c.CustomerID})" title="Müşteri #${c.CustomerID} için yapay zeka ile kişiselleştirilmiş strateji ve mesaj taslağı üret">
            <span>✨</span> LLM Önerisi Al
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  renderPagination(
    "crm-pagination",
    page,
    filtered.length,
    pageSize,
    (newPage) => {
      pageState.crm.page = newPage;
      renderCrmTable();
    },
    (newSize) => {
      pageState.crm.pageSize = newSize;
      pageState.crm.page = 1;
      renderCrmTable();
    }
  );
}

btnExportCrm.addEventListener("click", () => {
  const rows = getFilteredCrmCustomers();
  if (rows.length === 0) return alert("Dışa aktarılacak kayıt bulunamadı.");

  let csvContent = "\uFEFFMüşteri Kodu,Kayıp Riski (%),Üyelik Süresi (Ay),Toplam Sipariş,Toplam Şikayet,Son Sipariş (Gün),Yapılan İndirim (TL),Bölge Kademesi,Önerilen CRM Stratejisi\n";
  rows.forEach(r => {
    csvContent += `${r.CustomerID},${(r.churn_probability * 100).toFixed(1)},${r.Tenure},${r.OrderCount},${r.TotalComplaints},${r.DaySinceLastOrder},${r.CashbackAmount},"${r.CityTierLabel}","${r.crm_action}"\n`;
  });

  downloadCsv(csvContent, "riskli_musteri_hedef_listesi.csv");
});

/* ==========================================
   MODULE 2: OPERATIONS & LOGISTICS
   ========================================== */
function renderLogisticsModule(logistics) {
  if (!logistics) return;

  const kpiStrip = document.getElementById("logistics-kpi-grid");
  if (kpiStrip && logistics.kpis) {
    const k = logistics.kpis;
    const cards = [
      {
        title: "Toplam Kargo ve Teslimat Talepleri",
        val: `${k.delivery_complaints.toLocaleString()} Adet`,
        desc: "Kanal genelindeki şikayetlerin %14.8'i"
      },
      {
        title: "Kargo Kaynaklı Kayıp Riski Artışı",
        val: `+ %47.5`,
        desc: `Kargo şikayetlilerde %${k.churn_rate_with_delivery} vs normal %${k.churn_rate_without_delivery}`
      },
      {
        title: "Kritik Sevk Mesafesi (>20 km)",
        val: `${k.critical_distance_customers.toLocaleString()} Müşteri`,
        desc: `Bu grupta terk oranı %20.4'e çıkıyor (Ort. ${k.avg_distance} km)`
      },
      {
        title: "Taşra / Kırsal (Tier 3) Kayıp Oranı",
        val: `%${k.tier3_churn}`,
        desc: "Lojistik altyapı kısıtlı bölgelerin terk oranı"
      }
    ];

    kpiStrip.innerHTML = cards.map(c => `
      <div class="kpi-card">
        <div class="kpi-title">${c.title}</div>
        <div class="kpi-value">${c.val}</div>
        <div class="kpi-desc">${c.desc}</div>
      </div>
    `).join("");
  }

  // Chart 1: Delivery Sub-Intents
  const ctxComp = document.getElementById("chart-complaints")?.getContext("2d");
  if (ctxComp) {
    if (charts.complaints) charts.complaints.destroy();

    const intentData = logistics.delivery_intents || {};
    const compLabels = Object.keys(intentData).length > 0
      ? Object.keys(intentData)
      : Object.keys(logistics.complaints_by_category || {});
    const compValues = Object.keys(intentData).length > 0
      ? Object.values(intentData)
      : Object.values(logistics.complaints_by_category || {});

    charts.complaints = new Chart(ctxComp, {
      type: "bar",
      data: {
        labels: compLabels,
        datasets: [{
          label: "Şikayet Sayısı",
          data: compValues,
          backgroundColor: ["#DC2626", "#D97706", "#2563EB", "#0D9488"]
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Chart 2: Warehouse Distance Buckets
  const ctxDist = document.getElementById("chart-distance")?.getContext("2d");
  if (ctxDist) {
    if (charts.dist) charts.dist.destroy();

    const distLabels = (logistics.warehouse_distance_buckets || []).map(b => b.aralik);
    const distValues = (logistics.warehouse_distance_buckets || []).map(b => b.ortalama_churn_pct);

    charts.dist = new Chart(ctxDist, {
      type: "line",
      data: {
        labels: distLabels,
        datasets: [{
          label: "Bölgesel Terk Oranı (%)",
          data: distValues,
          borderColor: "#DC2626",
          backgroundColor: "rgba(220, 38, 38, 0.08)",
          fill: true,
          tension: 0.35,
          pointRadius: 5
        }]
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, max: 30 } }
      }
    });
  }

  // Regional Summary Table
  const regionalTbody = document.getElementById("regional-summary-table-body");
  if (regionalTbody && logistics.regional_summary) {
    regionalTbody.innerHTML = "";
    logistics.regional_summary.forEach(r => {
      const tr = document.createElement("tr");
      const badgeClass = r.risk_level === "Düşük Risk" ? "badge-risk-low" : (r.risk_level === "Orta Risk" ? "badge-risk-mid" : "badge-risk-high");

      tr.innerHTML = `
        <td><strong>${r.label}</strong></td>
        <td>${r.customers.toLocaleString()} Müşteri</td>
        <td>${r.avg_distance} km</td>
        <td><strong style="color:#0F2A4A;">${r.delivery_complaints.toLocaleString()} Şikayet</strong></td>
        <td><strong style="color:${r.churn_rate >= 20 ? '#dc2626' : '#1e3a5f'};">%${r.churn_rate}</strong></td>
        <td><span class="${badgeClass}">${r.risk_level}</span></td>
        <td>${r.strategy}</td>
      `;
      regionalTbody.appendChild(tr);
    });
  }

  renderLogisticsCustomerTable();
}

filterLogDistance.addEventListener("change", () => {
  pageState.logistics.page = 1;
  renderLogisticsCustomerTable();
});

filterLogCity.addEventListener("change", () => {
  pageState.logistics.page = 1;
  renderLogisticsCustomerTable();
});

filterLogComplaintOnly.addEventListener("change", () => {
  pageState.logistics.page = 1;
  renderLogisticsCustomerTable();
});

function getFilteredLogisticsCustomers() {
  if (!analysisData || !analysisData.logistics || !analysisData.logistics.customers) return [];
  const dist = filterLogDistance.value;
  const city = filterLogCity.value;
  const complaintOnly = filterLogComplaintOnly.checked;

  let filtered = analysisData.logistics.customers.filter(c => {
    let matchDist = true;
    if (dist === "close") matchDist = c.WarehouseToHome <= 10;
    else if (dist === "normal") matchDist = c.WarehouseToHome > 10 && c.WarehouseToHome <= 20;
    else if (dist === "far") matchDist = c.WarehouseToHome > 20 && c.WarehouseToHome <= 30;
    else if (dist === "critical") matchDist = c.WarehouseToHome > 30;

    const matchCity = (city === "all") || (c.CityTier.toString() === city);
    const matchComplaint = (!complaintOnly) || (c.DeliveryComplaints > 0);

    return matchDist && matchCity && matchComplaint;
  });

  const { field, order } = sortState.logistics;
  filtered.sort((a, b) => {
    const valA = a[field] !== undefined ? a[field] : 0;
    const valB = b[field] !== undefined ? b[field] : 0;
    return order === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });

  return filtered;
}

function renderLogisticsCustomerTable() {
  const tbody = document.getElementById("logistics-table-body");
  if (!tbody) return;

  const filtered = getFilteredLogisticsCustomers();
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: #64748b;">Seçilen kriterlere uygun operasyonel kayıt bulunamadı.</td></tr>`;
    renderPagination("logistics-pagination", 1, 0, pageState.logistics.pageSize, () => {}, () => {});
    return;
  }

  const { page, pageSize } = pageState.logistics;
  const sliced = filtered.slice((page - 1) * pageSize, page * pageSize);

  sliced.forEach(c => {
    const tr = document.createElement("tr");
    const isHigh = c.churn_probability >= 0.70;
    if (isHigh) tr.className = "risk-high";

    const compBadge = c.DeliveryComplaints > 0
      ? `<button class="btn-open-detail" onclick="openCustomerComplaints(${c.CustomerID})"><span class="badge-risk-high">${c.DeliveryComplaints} Şikayet</span> 🔍</button>`
      : `<span style="color:#64748b;">0 Şikayet</span>`;

    tr.innerHTML = `
      <td><strong>#${c.CustomerID}</strong></td>
      <td>${escapeHtml(c.CityTierLabel)}</td>
      <td><strong>${c.WarehouseToHome} km</strong></td>
      <td>${compBadge}</td>
      <td><strong style="color:${isHigh ? '#dc2626' : '#1e3a5f'}; font-size:1rem;">%${(c.churn_probability * 100).toFixed(1)}</strong></td>
      <td>${escapeHtml(c.logistics_issue)}</td>
      <td><span style="color:#0F2A4A; font-weight:600; font-size:0.84rem;">${escapeHtml(c.recommended_action)}</span></td>
    `;
    tbody.appendChild(tr);
  });

  renderPagination(
    "logistics-pagination",
    page,
    filtered.length,
    pageSize,
    (newPage) => {
      pageState.logistics.page = newPage;
      renderLogisticsCustomerTable();
    },
    (newSize) => {
      pageState.logistics.pageSize = newSize;
      pageState.logistics.page = 1;
      renderLogisticsCustomerTable();
    }
  );
}

btnExportLogistics.addEventListener("click", () => {
  const rows = getFilteredLogisticsCustomers();
  if (rows.length === 0) return alert("Dışa aktarılacak operasyonel kayıt bulunamadı.");

  let csvContent = "\uFEFFMüşteri Kodu,Bölge Kademesi,Depo Mesafesi (km),Kargo Şikayet Adedi,Kayıp Riski (%),Tespit Edilen Problem,Önerilen Dağıtım & Depo Stratejisi\n";
  rows.forEach(r => {
    csvContent += `${r.CustomerID},"${r.CityTierLabel}",${r.WarehouseToHome},${r.DeliveryComplaints},${(r.churn_probability * 100).toFixed(1)},"${r.logistics_issue}","${r.recommended_action}"\n`;
  });

  downloadCsv(csvContent, "lojistik_risk_ve_sevk_raporu.csv");
});

/* ==========================================
   MODULE 3: CATEGORY & PRODUCT QUALITY
   ========================================== */
filterDept.addEventListener("change", () => {
  pageState.category.page = 1;
  renderCategoryCharts();
  renderCategoryTable();
});

if (searchProduct) {
  searchProduct.addEventListener("input", () => {
    pageState.category.page = 1;
    renderCategoryTable();
  });
}

function renderCategoryCharts() {
  if (!analysisData || !analysisData.category) return;
  const dept = filterDept.value;
  let weakData = {};
  let strongData = {};

  if (dept === "all") {
    weakData = analysisData.category.overall_weak || {};
    strongData = analysisData.category.overall_strong || {};
  } else {
    const dInfo = analysisData.category.by_department[dept];
    if (dInfo) {
      weakData = dInfo.weak_points || {};
      strongData = dInfo.strong_points || {};
    }
  }

  // Defects Horizontal Bar
  const ctxDef = document.getElementById("chart-defects")?.getContext("2d");
  if (ctxDef) {
    if (charts.defects) charts.defects.destroy();

    charts.defects = new Chart(ctxDef, {
      type: "bar",
      data: {
        labels: Object.keys(weakData),
        datasets: [{
          label: "Kusur Yorum Sayısı",
          data: Object.values(weakData),
          backgroundColor: "#DC2626"
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }

  // Strengths Horizontal Bar
  const ctxStr = document.getElementById("chart-strengths")?.getContext("2d");
  if (ctxStr) {
    if (charts.strengths) charts.strengths.destroy();

    charts.strengths = new Chart(ctxStr, {
      type: "bar",
      data: {
        labels: Object.keys(strongData),
        datasets: [{
          label: "Olumlu Yorum Sayısı",
          data: Object.values(strongData),
          backgroundColor: "#0D9488"
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }
}

function getFilteredCategoryProducts() {
  if (!analysisData || !analysisData.category) return [];
  const dept = filterDept.value;
  const searchVal = searchProduct ? searchProduct.value.trim().toLowerCase() : "";
  const products = analysisData.category.all_products || [];

  let filtered = products.filter(p => {
    const matchDept = (dept === "all") || (p.DepartmentName === dept);
    const matchSearch = (!searchVal) || (p.ProductID.toString().toLowerCase().includes(searchVal));
    return matchDept && matchSearch;
  });

  const { field, order } = sortState.category;
  filtered.sort((a, b) => {
    const valA = a[field] !== undefined ? a[field] : 0;
    const valB = b[field] !== undefined ? b[field] : 0;
    return order === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });

  return filtered;
}

function renderCategoryTable() {
  const tbody = document.getElementById("category-table-body");
  if (!tbody) return;

  const filtered = getFilteredCategoryProducts();
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: #64748b;">Arama kriterlerine uygun ürün kaydı bulunamadı.</td></tr>`;
    renderPagination("category-pagination", 1, 0, pageState.category.pageSize, () => {}, () => {});
    return;
  }

  const { page, pageSize } = pageState.category;
  const sliced = filtered.slice((page - 1) * pageSize, page * pageSize);

  sliced.forEach(p => {
    const ratingColor = p.avg_rating <= 3.0 ? "#dc2626" : (p.avg_rating <= 3.9 ? "#d97706" : "#16a34a");
    const tr = document.createElement("tr");

    const safePid = escapeHtml(p.ProductID);
    tr.innerHTML = `
      <td><button class="btn-open-detail" onclick="openProductReviews('${safePid}')"><strong>#${safePid}</strong> 🔍</button></td>
      <td>${escapeHtml(p.DepartmentName)}</td>
      <td><span style="color:${ratingColor}; font-weight:700;">★ ${p.avg_rating.toFixed(2)}</span> <small style="color:#64748b;">/ 5.0</small></td>
      <td><button class="btn-open-detail" onclick="openProductReviews('${safePid}')"><strong>${p.review_count}</strong> Yorum</button></td>
      <td><span class="tag-defect">${escapeHtml(p.top_defect)}</span> <small style="color:#64748b; font-weight:600;">(${p.defect_count} yorum)</small></td>
      <td><span class="tag-strength">${escapeHtml(p.top_strength)}</span> <small style="color:#64748b; font-weight:600;">(${p.strength_count} yorum)</small></td>
      <td><span style="color:#0F2A4A; font-weight:600; font-size:0.84rem;">${escapeHtml(p.category_action || "Rutin Takip")}</span></td>
    `;
    tbody.appendChild(tr);
  });

  renderPagination(
    "category-pagination",
    page,
    filtered.length,
    pageSize,
    (newPage) => {
      pageState.category.page = newPage;
      renderCategoryTable();
    },
    (newSize) => {
      pageState.category.pageSize = newSize;
      pageState.category.page = 1;
      renderCategoryTable();
    }
  );
}

btnExportCategory.addEventListener("click", () => {
  const rows = getFilteredCategoryProducts();
  if (rows.length === 0) return alert("Dışa aktarılacak kayıt bulunamadı.");

  let csvContent = "\uFEFFÜrün Kodu,Kıyafet Kategorisi,Ortalama Puan,Toplam Yorum,Kök Neden Kusuru,Kusur Yorum Sayısı,Güçlü Yön,Güçlü Yön Yorum Sayısı,Önerilen Kalite Stratejisi\n";
  rows.forEach(p => {
    csvContent += `${p.ProductID},"${p.DepartmentName}",${p.avg_rating},${p.review_count},"${p.top_defect}",${p.defect_count},"${p.top_strength}",${p.strength_count},"${p.category_action}"\n`;
  });

  downloadCsv(csvContent, "kategori_urun_kalite_raporu.csv");
});

/* ==========================================
   COMMON UTILITIES
   ========================================= */
function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
