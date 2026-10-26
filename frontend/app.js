// API Endpoint - Auto-detect local vs production
const API_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
  ? "http://127.0.0.1:8000"
  : "https://eticaret-musteri-kayip-analizi.onrender.com";

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

// 1. Initial Page Load
window.addEventListener("DOMContentLoaded", async () => {
  loadAvailableLlmModels();
  try {
    const res = await fetch(`${API_URL}/api/data`);
    if (!res.ok) throw new Error("Veri ambarı yüklenemedi");
    analysisData = await res.json();
    renderDashboard(analysisData);
  } catch (err) {
    console.warn("Otomatik veri yükleme hatası, modal açılıyor:", err);
    modalUpload.style.display = "flex";
  }
});

// Load dynamic text-based models from Google Gemini API
async function loadAvailableLlmModels() {
  const selectEl = document.getElementById("select-llm-model");
  if (!selectEl) return;

  try {
    const res = await fetch(`${API_URL}/api/llm/models`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      selectEl.innerHTML = data.models.map(m => `
        <option value="${m.id}">${m.name}</option>
      `).join("");
    }
  } catch (err) {
    console.warn("LLM model listesi API'den çekilemedi:", err);
  }
}

// Modal open/close controls
btnOpenModal.addEventListener("click", () => {
  modalUpload.style.display = "flex";
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

  modalStatus.style.display = "block";
  modalStatus.textContent = isRetrain
    ? "Yeni veriler işleniyor ve XGBoost modeli sıfırdan eğitiliyor..."
    : "Yeni veriler mevcut model ile hızla analiz ediliyor ve skorlanıyor...";
  btnSubmitUpload.disabled = true;

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
    modalUpload.style.display = "none";
    modalStatus.style.display = "none";
    btnSubmitUpload.disabled = false;
  } catch (error) {
    alert(`Analiz başarısız oldu: ${error.message}`);
    modalStatus.style.display = "none";
    btnSubmitUpload.disabled = false;
  }
});

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
          <span>Kayıt #${i + 1} &bull; Süreç: <strong style="color:#0F2A4A;">${c.ComplaintCategory}</strong></span>
          <span style="color:#64748b;">Neden: ${c.ComplaintIntent}</span>
        </div>
        <div class="detail-item-text">"${c.ComplaintText}"</div>
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
            <span>Yorum #${i + 1} &bull; Kıyafet Kategorisi: <strong>${r.DepartmentName}</strong></span>
            <span style="color:${ratingColor}; font-weight:700; font-size:0.95rem;">${stars} (${r.Rating} / 5)</span>
          </div>
          <div class="detail-item-text">"${r.ReviewText}"</div>
        </div>
      `;
    }).join("");

    modalDetailContent.innerHTML = llmCardHtml + reviewsListHtml;
  } catch (err) {
    modalDetailContent.innerHTML = `<div style="color:#dc2626; padding: 1.5rem;">Hata: ${err.message}</div>`;
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
    const url = `${API_URL}/api/llm/generate-customer-strategy/${customerId}?model=${encodeURIComponent(selectedModel)}`;
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) throw new Error("LLM analizi üretilemedi.");
    const data = await res.json();

    resContainer.innerHTML = `
      <div class="llm-content-grid">
        <div class="llm-info-block">
          <div class="llm-info-title">Risk Teşhisi & Kök Neden (LLM Tarafından Belirlenen)</div>
          <div class="llm-info-text">${data.risk_teshisi}</div>
        </div>
        <div class="llm-info-block">
          <div class="llm-info-title">Önerilen Bireysel CRM Tutundurma Hamlesi</div>
          <div class="llm-info-text"><strong style="color:#0F2A4A;">${data.onerilen_crm_stratejisi}</strong> &bull; <span style="color:#64748b;">Önerilen İletişim Kanalı: <strong>${data.mesaj_kanali}</strong></span></div>
        </div>
        <div class="llm-draft-box">
          <div class="llm-info-title">LLM Tarafından Hazırlanan Müşteriye Özel Özür & Telafi Mesaj Taslağı</div>
          <div id="customer-draft-text" class="llm-info-text" style="padding-top:0.35rem; font-style:italic;">"${data.kisisellestirilmis_mesaj}"</div>
          <button class="btn-copy-draft" onclick="copyToClipboard('customer-draft-text')">Metni Kopyala</button>
        </div>
        <div style="font-size:0.75rem; color:#94a3b8; text-align:right;">Model: ${data.model_used}</div>
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
    const url = `${API_URL}/api/llm/analyze-product/${productId}?model=${encodeURIComponent(selectedModel)}`;
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) throw new Error("LLM ürün analizi üretilemedi.");
    const data = await res.json();

    resContainer.innerHTML = `
      <div class="llm-content-grid">
        <div class="llm-info-block">
          <div class="llm-info-title">LLM Yönetici Özeti</div>
          <div class="llm-info-text">${data.yonetici_ozeti}</div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
          <div class="llm-info-block" style="border-left: 3px solid #dc2626;">
            <div class="llm-info-title" style="color:#b91c1c;">Tespit Edilen Kök Neden Kusurları</div>
            <div class="llm-info-text">${data.kok_neden_kusuru}</div>
          </div>
          <div class="llm-info-block" style="border-left: 3px solid #16a34a;">
            <div class="llm-info-title" style="color:#15803d;">Müşterilerin Beğendiği Güçlü Yönler</div>
            <div class="llm-info-text">${data.guclu_yonler}</div>
          </div>
        </div>
        <div class="llm-info-block" style="background:#eff6ff; border-color:#bfdbfe;">
          <div class="llm-info-title" style="color:#1e40af;">Tedarikçi ve Kalite Departmanı Aksiyon Planı</div>
          <div class="llm-info-text" style="color:#1e3a8a; font-weight:600;">${data.tedarikci_aksiyonu}</div>
        </div>
        <div style="font-size:0.75rem; color:#94a3b8; text-align:right;">Model: ${data.model_used} &bull; Kategori: ${data.category}</div>
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

// Copy to Clipboard utility
function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.innerText.replace(/^"|"$/g, '');
  navigator.clipboard.writeText(text).then(() => {
    alert("Mesaj taslağı panoya kopyalandı!");
  }).catch(() => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    alert("Mesaj taslağı panoya kopyalandı!");
  });
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
    filterDept.innerHTML += `<option value="${dept}">${dept}</option>`;
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

    const shapTags = (c.shap_top3 || []).map(s => {
      const tagClass = s.is_risk ? "tag-shap-risk" : "tag-shap-safe";
      const icon = s.is_risk ? "▲" : "▼";
      return `<span class="${tagClass}">${icon} ${s.factor_title}</span>`;
    }).join("");

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

    tr.innerHTML = `
      <td><strong>#${c.CustomerID}</strong></td>
      <td><strong style="color:${isHigh ? '#dc2626' : '#1e3a5f'}; font-size:1rem;">%${(c.churn_probability * 100).toFixed(1)}</strong></td>
      <td>${tenureDesc}</td>
      <td><strong>${c.OrderCount}</strong> Sipariş</td>
      <td>${complaintBadge}</td>
      <td>${lastOrderDesc}</td>
      <td>${c.CashbackAmount.toFixed(2)} TL</td>
      <td>${c.CityTierLabel}</td>
      <td><div class="shap-container">${shapTags}</div></td>
      <td><span style="color:#0F2A4A; font-weight:600; font-size:0.84rem;">${c.crm_action || "Rutin Takip"}</span></td>
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
      <td>${c.CityTierLabel}</td>
      <td><strong>${c.WarehouseToHome} km</strong></td>
      <td>${compBadge}</td>
      <td><strong style="color:${isHigh ? '#dc2626' : '#1e3a5f'}; font-size:1rem;">%${(c.churn_probability * 100).toFixed(1)}</strong></td>
      <td>${c.logistics_issue}</td>
      <td><span style="color:#0F2A4A; font-weight:600; font-size:0.84rem;">${c.recommended_action}</span></td>
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

    tr.innerHTML = `
      <td><button class="btn-open-detail" onclick="openProductReviews('${p.ProductID}')"><strong>#${p.ProductID}</strong> 🔍</button></td>
      <td>${p.DepartmentName}</td>
      <td><span style="color:${ratingColor}; font-weight:700;">★ ${p.avg_rating.toFixed(2)}</span> <small style="color:#64748b;">/ 5.0</small></td>
      <td><button class="btn-open-detail" onclick="openProductReviews('${p.ProductID}')"><strong>${p.review_count}</strong> Yorum</button></td>
      <td><span class="tag-defect">${p.top_defect}</span> <small style="color:#64748b; font-weight:600;">(${p.defect_count} yorum)</small></td>
      <td><span class="tag-strength">${p.top_strength}</span> <small style="color:#64748b; font-weight:600;">(${p.strength_count} yorum)</small></td>
      <td><span style="color:#0F2A4A; font-weight:600; font-size:0.84rem;">${p.category_action || "Rutin Takip"}</span></td>
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
