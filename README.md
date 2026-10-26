# E-Ticarette Müşteri Kaybı (Churn) Tahmini ve İnceleme Analizi Karar Destek Sistemi

Bu çalışma; e-ticaret ekosisteminde müşteri kaybını proaktif olarak tahminlemek, operasyonel darboğazları tespit etmek ve müşteri geri bildirimlerini derinlemesine anlamlandırmak üzere geliştirilmiş bir Analitik Karar Destek Sistemi'dir.

Sistem; sayısal işlem geçmişi, metinsel müşteri şikayetleri ve ürün inceleme verilerini bir araya getirerek hem makine öğrenmesi (XGBoost + SHAP) hem de Büyük Dil Modelleri ile çok boyutlu analiz sunar.

---

## 📌 Temel Özellikler ve Modüller

### 1. Müşteri Kayıp Riski ve CRM Yönetimi
* **Tahminleme ve Skorlama:** 5.630 müşterinin her biri için XGBoost tabanlı ayrılma olasılık skoru (`%0 - %100`).
* **Açıklanabilir Yapay Zeka (SHAP):** Kara kutu tahminler yerine her müşteri özelinde riski tetikleyen ilk 3 faktör (örneğin: sipariş aralığı, şikayet hacmi, depo mesafesi vb.).
* **Şikayet İnceleme ve Bireysel LLM Stratejisi:** Müşterinin açtığı şikayetlerin geçmişini listeleyen detay pop-up'ı ve tek tıkla çalışan `[✨ LLM Stratejisi Üret]` özelliği. LLM; şikayet metinlerini okuyarak ayrılma nedenini teşhis eder, uygun iletişim kanalını belirler ve müşteriye gönderilmeye hazır kişiselleştirilmiş özür/telafi mesaj taslağı hazırlar.
* **Gelişmiş Tablo İşlemleri:** Sütun bazlı küçükten büyüğe / büyükten küçüğe sıralama (click-to-sort), çoklu sayfalama (pagination) ve filtrelenen riskli müşteri listesini CSV olarak indirme.

### 2. Operasyon ve Lojistik Yönetimi
* **Lojistik KPI İzleme:** Kargo/teslimat kaynaklı kayıp oranı artışı, sevk mesafesi riskleri (>20 km) ve kırsal bölge (Tier 3) kırılımları.
* **Operasyonel Stratejiler:** Gecikme yaşayan müşterilere bölgesel mikro-depo intikali, rota optimizasyonu veya alternatif yerel teslimat noktası (PUDO) aksiyonları.

### 3. Kategori ve Ürün Kalite Yönetimi
* **Kıyafet Kategorisi Analizi:** Üst Giyim, Elbise, Alt Giyim, İç Giyim & Ev Giyim, Ceket & Dış Giyim gibi kategoriler bazında performans.
* **Niteliksel Kusur ve Güçlü Yön Tespiti:** Müşteri yorumlarından ayrıştırılan kalıp, dikiş, kumaş ve fermuar kusurları ile öne çıkan güçlü yönler.
* **Ürün Detay ve LLM Kök Neden Analizi:** Ürün koduna tıklandığında açılan `[✨ Derin İnceleme Analizi Başlat]` butonu ile tüm yorumlar taranarak kategori yöneticisi için durum özeti ve tedarikçiye iletilecek teknik revizyon talimatı üretilir.
* **Ürün Arama:** Anlık ürün kodu ile arama (`#search-product`) ve kalite raporu dışa aktarımı.

### 4. Dönemsel Veri Entegrasyonu & Yeniden Eğitim
* Sağ üstteki **"Dönemsel Veri Yükle / Güncelle"** penceresinden yeni döneme ait 3 ilişkisel CSV dosyası yüklenebilir.
* **Hızlı Skorlama:** Yüklenen veriler mevcut eğitilmiş modelle anında analiz edilebilir.
* **Yeniden Eğitim (Retrain):** *"Modeli Baştan Eğit"* seçeneği işaretlenirse XGBoost modeli ve SHAP ağırlıkları yeni verilerle sıfırdan eğitilir.

---

## 🛠️ Sistem Mimarisi ve Teknolojiler

* **Backend:** Python 3.10+, FastAPI, Uvicorn
* **Makine Öğrenmesi & Veri İşleme:** Pandas, NumPy, Scikit-learn, XGBoost, SHAP
* **Dil Modeli (LLM):**
  * *Canlı Bulut Modu:* Gemini
  * *Yedek Çevrimdışı Mod:* Semantik LLM Karar Destek Motoru
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+), Chart.js
* **Veri Ambarı:**
  * `Musteriler.csv` (5.630 müşteri işlem profili)
  * `Sikayetler.csv` (Müşteri destek ve şikayet biletleri)
  * `Yorumlar.csv` (Metinsel ürün inceleme ve değerlendirmeleri)

---

## ☁️ Deployment

### 1. Backend Yayını (Render.com)
1. [Render](https://render.com) paneline GitHub hesabınızla giriş yapın.
2. **New +** &rarr; **Web Service** seçeneğine tıklayıp projenizin GitHub deposunu seçin.
3. Temel ayarları yapın:
   * **Root Directory:** `backend`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

### 2. Canlı Sunucuda (Render) Gemini API Ayarlama (Kritik Adım)
Projenin backend'i Render üzerinde çalıştığı için, canlı web servisinin Gemini API'ye erişebilmesi için anahtarı Render paneline tanımlamanız gerekir:
1. [dashboard.render.com](https://dashboard.render.com) adresine gidin.
2. Servisinize tıklayın.
3.  **Environment** sekmesini açın.
4. **Add Environment Variable** butonuna tıklayın:
   * **Key:** `GEMINI_API_KEY`
   * **Value:** API_KEY
5. **Save Changes** 

### 3. Frontend Yayını (Cloudflare Pages veya GitHub Pages)
* `frontend` klasörünü Cloudflare Pages veya GitHub Pages'e bağlayabilirsiniz.
---