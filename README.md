# E-Ticarette Müşteri Kaybı (Churn) Tahmini ve İnceleme Analizi Karar Destek Sistemi

Bu proje; e-ticaret ekosisteminde müşteri kaybını (churn) proaktif olarak tahminlemek, operasyonel darboğazları tespit etmek ve müşteri geri bildirimlerini derinlemesine anlamlandırmak üzere geliştirilmiş uçtan uca bir **Analitik Karar Destek Sistemi'dir (DSS - Decision Support System)**.

---

## 📌 Temel Özellikler ve Modüller

### 1. 👥 Müşteri Kayıp Riski ve CRM Yönetimi
* **Tahminleme ve Görsel Risk Skoru:** Müşterilerin her biri için XGBoost tabanlı ayrılma olasılık skoru (`%0.0 - %100.0`) ve renk kodlu risk göstergesi (Kritik, Orta, Düşük Risk).
* **Açıklanabilir Yapay Zeka (SHAP):** Kara kutu tahminler yerine her müşteri özelinde ayrılmayı doğrudan tetikleyen gerçek operasyonel faktörler (örn: *Son Sipariş: 18 Gün Önce*, *Şikayet Hacmi: 4 Adet*, *Depo Mesafesi: 28 km*).
* **Şikayet İnceleme ve Bireysel LLM Stratejisi:** Müşterinin açtığı şikayetlerin geçmişini listeleyen detay kartları ve `[✨ LLM Stratejisi Üret]` butonu. LLM; şikayet metinlerini okuyarak ayrılma nedenini teşhis eder, uygun iletişim kanalını belirler ve müşteriye gönderilmeye hazır kişiselleştirilmiş özür/telafi mesaj taslağı hazırlar.
* **Gelişmiş Tablo İşlemleri:** Sütun bazlı sıralama (Kayıp olasılığı, sipariş sayısı, indirim vb.), çoklu sayfalama, yatay kaydırma araçları ve filtrelenen riskli müşterileri tek tıkla CSV olarak dışa aktarma.

### 2. 🚚 Operasyon ve Lojistik Yönetimi
* **Lojistik KPI İzleme:** Kargo/teslimat kaynaklı kayıp oranı artışı, sevk mesafesi riskleri (>20 km) ve kırsal bölge (Tier 3) kırılımları.
* **Operasyonel Stratejiler:** Gecikme veya mesafe riski yaşayan müşterilere bölgesel mikro-depo intikali, PUDO teslimat noktası tanımlama veya rota optimizasyonu aksiyonları.

### 3. 👗 Kategori ve Ürün Kalite Yönetimi
* **Kıyafet Kategorisi Eşleme:** Üst Giyim, Elbise, Alt Giyim, İç Giyim & Ev Giyim, Ceket & Dış Giyim gibi kategoriler bazında performans.
* **Niteliksel Kusur ve Güçlü Yön Tespiti:** Müşteri yorumlarından ayrıştırılan kalıp/beden darlığı, dikiş/sökük, kumaş kalitesi ve fermuar/aksesuar kusurları ile öne çıkan güçlü yönler.
* **Ürün Detay ve LLM Kök Neden Analizi:** Ürün koduna tıklandığında açılan `[✨ Derin İnceleme Analizi Başlat]` butonu ile tüm yorumlar taranarak kategori yöneticisi için durum özeti ve tedarikçiye iletilecek teknik revizyon talimatı üretilir.
* **Anlık Ürün Arama:** Arama kutusundan ürün kodu ile anlık filtreleme ve kalite raporu dışa aktarımı.

### 4. 📁 Dönemsel Veri Entegrasyonu & Senkronizasyon
* **Manuel CSV Yükleme:** Üst menüdeki **"Veri Entegrasyonu & Senkronizasyon"** penceresinden döneme ait 3 ilişkisel CSV dosyası (`Musteriler.csv`, `Sikayetler.csv`, `Yorumlar.csv`) seçilip yüklenebilir.
* **Hızlı Skorlama / Sıfırdan Model Eğitimi:** Mevcut modelle anında skorlama yapılabilir veya *"Modeli Baştan Eğit"* seçeneğiyle XGBoost ve SHAP modelleri yeni verilerle sıfırdan eğitilebilir.
* **Otomatik Zamanlanmış Senkronizasyon:** Gece belirlenen saatte (varsayılan `03:00`) otomatik veri güncelleme arka plan iş parçacığı (`/api/sync/*`).

### 5. 📊 Kurumsal Power BI Entegrasyonu
* **Tek Tıkla Rapor İndirme:** Üst menüdeki **"📊 Power BI"** butonuyla tüm makine öğrenmesi tahminlerini, SHAP risk faktörlerini, lojistik metriklerini ve önerilen aksiyonları konsolide eden `PowerBI_Analiz_VeriSeti.csv` analitik tek tablosu (OBT) doğrudan indirilebilir.
* **Python CLI Scripti:** Alternatif olarak `backend/export_powerbi.py` betiği terminalden çalıştırılarak da aynı veri seti üretilebilir.

---

## 🚀 Sistemi Başlatma ve Çalıştırma Rehberi

Sistem hem **yerel ortamda (Localhost)** hem de **bulutta (Render.com)** çalışacak şekilde hibrit yapıda tasarlanmıştır.

### Yöntem A: Yerel Ortamda Çalıştırma (Önerilen)

Proje ana dizininde bulunan başlatıcı komut dosyası kurulumu ve çalıştırmayı otomatik yönetir:

1. `start_local.bat` dosyasına çift tıklayın.
2. Script sırasıyla:
   * Sisteminizde Python olup olmadığını kontrol eder.
   * İlk çalıştırmada, gerekli kütüphanelerin yalnızca proje klasöründeki yerel ortama (`.venv`) kurulması için kullanıcı onayı (`E/H`) ister. Global sisteme asla müdahale etmez.
   * FastAPI backend servisini `http://127.0.0.1:8000` adresinde başlatır.
   * Web arayüzünü (`frontend/index.html`) varsayılan tarayıcınızda otomatik olarak açar.
3. Sunucuyu durdurmak için açık olan terminal penceresini kapatmanız yeterlidir.

> [!TIP]
> **Manuel Başlatma:** Terminal üzerinden çalıştırmak isterseniz:
> ```bash
> python backend/run_server.py
> ```
> `run_server.py`, dinamik yol tespiti (`Path(__file__).resolve().parent`) kullanarak projenin kurulu olduğu dizini otomatik tespit eder ve hot-reload moduyla servisi başlatır.

---

### Yöntem B: Canlı Bulut Servisi (Render.com)

#### 1. Mevcut Canlı Servisi Kullanma

1. [frontend/index.html](frontend/index.html) dosyasını doğrudan tarayıcınızda açın.
2. Sağ üstteki API bağlantı hapından (status pill) canlı Render servisi (`https://eticaret-musteri-kayip-analizi.onrender.com`) seçilidir.
3. **Bulut Uyku Modu Bilgisi:** Render ücretsiz planında sunucu 15 dakika hareketsizlik sonrası tasarruf amacıyla uykuya geçer. Sistem ilk açılışta ekranda *"Render Bulut Sunucusu Uyanıyor (30-50 sn)..."* bildirimini gösterir ve sunucu yanıt verene kadar otomatik yeniden dener. Sunucu uyandığında arayüz yeşil duruma geçerek açılır.

#### 2. Render.com Üzerinde Sıfırdan Kurulum ve Dağıtım (Deployment)

Projeyi kendi Render hesabınızda canlı bir Web Service olarak yayınlamak için:

1. [Render paneline](https://dashboard.render.com/) GitHub hesabınızla giriş yapın.
2. **New +** → **Web Service** seçeneğine tıklayıp projenizin GitHub deposunu seçin.
3. Temel ayarları aşağıdaki gibi yapılandırın:
   * **Root Directory:** `backend`
   * **Runtime:** `Python 3`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. *(İsteğe Bağlı)* **Environment Variables:** Ortam değişkenleri bölümünden `GEMINI_API_KEY` ekleyerek Google Gemini yapay zeka entegrasyonunu aktif hale getirebilirsiniz.
5. **Create Web Service** butonuna tıklayarak kurulumu başlatın. Birkaç dakika içinde genel erişime açık API adresiniz (`https://<servis-adi>.onrender.com`) hazır olacaktır.

---

## 📖 İnteraktif API Dokümantasyonu (Swagger UI & ReDoc)

FastAPI mimarisi sayesinde backend servisi, OpenAPI standartlarında tam teşekküllü ve canlı test edilebilir interaktif API dokümantasyonu sunar:

* **Swagger UI (Canlı Test Arayüzü):** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
  * Tüm endpoint'leri parametreleriyle görüntüleyebilir, doğrudan tarayıcı üzerinden istek atarak (`Try it out`) JSON yanıtlarını test edebilirsiniz.
* **ReDoc (Detaylı Teknik Doküman):** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
  * Servis mimarisi, veri tipleri ve model şemalarının temiz hiyerarşik görünümü.
* **OpenAPI Şeması:** [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

### Temel API Uç Noktaları

| Uç Nokta | Metot | Açıklama |
| :--- | :--- | :--- |
| `/api/data` | `GET` | Önbelleğe alınmış güncel analiz sonuçlarını (CRM, Lojistik, Kategori) döner. |
| `/api/analyze` | `POST` | 3 adet CSV dosyasını (`musteriler`, `sikayetler`, `yorumlar`) yükler ve analizi çalıştırır. |
| `/api/customer/{id}/complaints` | `GET` | Belirtilen müşterinin tüm şikayet ve destek kayıtlarını listeler. |
| `/api/product/{id}/reviews` | `GET` | Belirtilen ürüne ait tüm müşteri yorum ve puanlarını listeler. |
| `/api/llm/models` | `GET` | Canlı sistemde çağrılabilecek Google Gemini modellerini listeler. |
| `/api/llm/generate-customer-strategy/{id}` | `POST` | Müşteri için Gemini LLM tabanlı ayrılma teşhisi ve kişiselleştirilmiş özür mesaj taslağı üretir. |
| `/api/llm/analyze-product/{id}` | `POST` | Ürün incelemeleri üzerinden derin kök neden kusuru ve tedarikçi aksiyonu üretir. |
| `/api/sync/status` & `/api/sync/trigger` | `GET/POST` | Otomatik senkronizasyon durumunu görüntüler ve anlık veri güncellemesini tetikler. |
| `/api/export/powerbi` | `GET` | Power BI ve Excel uyumlu konsolide analitik CSV dosyasını dışa aktarır (UTF-8 BOM). |
| `/api/health` veya `/health` | `GET` | Sunucu sağlık ve veri ambarı durum kontrolü (`status: ok`, `has_data`). |

---

## 📁 Veri Setleri ve `sample_data/` Mimarisi

Veri gizliliği standartları ve kurumsal güvenlik gereği, gerçek müşteri kayıtları Git reposunda tutulmaz (`.gitignore` ile `backend/*.csv` hariç tutulmuştur). 

Sistemi test etmek ve hemen denemek için örnek veri setleri projenin [`sample_data/`](sample_data/) klasöründe sunulmaktadır:
* `sample_data/Musteriler.csv`: Müşteri ID, üyelik süresi, şehir kademesi, sipariş sıklığı, indirim tutarı ve kayıp etiketleri.
* `sample_data/Sikayetler.csv`: Müşteri ID, şikayet metni, şikayet kategorisi ve tespit edilen niyetler.
* `sample_data/Yorumlar.csv`: Ürün ID, kıyafet departmanı, yıldız puanı (1-5) ve müşteri metinsel incelemeleri.

> **💡 Veri Yükleme Akışı:**
> Sunucu yerel olarak ilk başlatıldığında diskte CSV bulunmazsa, arayüz *"Sunucu Aktif, Ancak Analiz Verisi Bulunamadı!"* uyarısını ve **[📁 Veri Yükle]** butonunu gösterir. Bu butona tıklayarak `sample_data/` içindeki dosyaları seçip yükleyebilirsiniz. Sistem verileri belleğe alır ve analiz panosunu anında oluşturur.

---

## 🔑 Google Gemini API Anahtarı Yapılandırması

Sistem hibrit bir yapay zeka mimarisine sahiptir:
1. **Canlı Bulut Modu (Render):** Render sunucusunda kurumsal `GEMINI_API_KEY` ortam değişkeni tanımlıdır; kullanıcıdan hiçbir anahtar istemeden doğrudan Google Gemini yapay zekasını kullanır.
2. **Yerel Mod (Localhost):** Üst menü çubuğundaki **"🔑 API Key"** butonuna tıklayarak [Google AI Studio](https://aistudio.google.com/)'dan aldığınız ücretsiz API anahtarınızı girebilirsiniz. Anahtar yalnızca tarayıcınızın `localStorage` alanında saklanır.
3. **Güvenli Mod (Yerel Semantik LLM):** API anahtarı girilmediğinde veya internet kesintisinde sistem hata vermez; yerel doğal dil çıkarım motoruna geçerek kurumsal teşhis ve mesaj taslağı üretmeye kesintisiz devam eder.

---

## 🧪 Test Senaryoları Doğrulama (TS-01 .. TS-08)

Projede geliştirilen 8 analitik test senaryosunu ana dizinden tek bir komutla doğrulamak için:

```bash
python verify_tests.py
```
*(CSV dosyaları ana dizinde bulunmadığında script terminal üzerinden interaktif olarak klasör yolunu talep eder veya `Enter` tuşuna basarak doğrudan `sample_data/` dizinini seçebilirsiniz. Opsiyonel olarak `python verify_tests.py sample_data` şeklinde doğrudan dizin belirterek de çalıştırılabilir).*


---

## 🛠️ Sistem Mimarisi ve Teknoloji Yığını

* **Backend & API Servisi:** Python 3.10+, FastAPI, Uvicorn, Pydantic, HTTP Streaming
* **Makine Öğrenmesi & Açıklanabilirlik:** XGBoost, Scikit-learn, SHAP (TreeExplainer), Pandas, NumPy
* **Doğal Dil İşleme & LLM:** Google Gemini API, Kural Tabanlı Semantik Motor
* **Frontend:** Modern Vanilla JavaScript (ES6+), HTML5, Kurumsal CSS3 (Plus Jakarta Sans & Slate Palette), Chart.js
