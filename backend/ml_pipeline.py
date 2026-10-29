import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import roc_auc_score, f1_score
from xgboost import XGBClassifier
import shap

FACTOR_TEMPLATES = {
    "DaySinceLastOrder": ("Son Sipariş", "Gün Önce"),
    "CashbackAmount": ("Yapılan İndirim", "TL"),
    "Complain": ("Aktif Şikayet", ""),
    "TotalComplaints": ("Şikayet Sayısı", "Adet"),
    "Tenure": ("Müşterilik Süresi", "Ay"),
    "WarehouseToHome": ("Depo Mesafesi", "km"),
    "OrderAmountHikeFromlastYear": ("Yıllık Harcama Artışı", "%"),
    "NumberOfAddress": ("Kayıtlı Adres", "Adet"),
    "NumberOfDeviceRegistered": ("Kayıtlı Cihaz", "Adet"),
    "HourSpendOnApp": ("Uygulamada Geçirilen Süre", "Saat"),
    "OrderCount": ("Toplam Sipariş", "Adet"),
    "CityTier": ("Şehir Kademesi", "Tier"),
    "PreferredPaymentMode": ("Ödeme Yöntemi", ""),
    "PreferredLoginDevice": ("Giriş Cihazı", "")
}

def get_crm_action(churn_prob: float, total_complaints: int, days_since_last_order: int, order_count: int, tenure: int, cashback: float, city_tier: int = 1, dist: float = 0.0) -> str:
    # 1. Yeni Müşteri & Onboarding (Kritik ilk alışveriş deneyimi)
    if tenure <= 1 and days_since_last_order <= 7:
        return "Hoş Geldin Teşviki & 2. Siparişe Özel %15 İndirim"
    elif tenure <= 1 and days_since_last_order > 7:
        return "İlk Alışveriş Deneyim Anketi & Yeniden Etkileşim"

    # 2. Uzun Süreli Hareketsizlik (Win-Back / Uyuyan Müşteri)
    if days_since_last_order >= 20:
        return "Seni Özledik (Win-Back) Kampanyası & Sepet İndirimi"
    elif days_since_last_order >= 12 and churn_prob >= 0.50:
        return "Favori Ürün Fiyat İndirimi & Geri Kazanım Bildirimi"

    # 3. Lojistik ve Mesafe Kaynaklı Darboğaz
    if (dist >= 25 or city_tier == 3) and churn_prob >= 0.50:
        return "Lojistik Teşviki: Sonraki Siparişlerde Ücretsiz Kargo"

    # 4. Şikayet Durumu (Yalnızca şikayet birincil sorunsa)
    if total_complaints >= 5 and churn_prob >= 0.60:
        return "Kıdemli Müşteri Deneyimi Ekibi Bireysel Çözüm Araması"
    elif total_complaints >= 2 and days_since_last_order <= 10:
        return "Şikayet Çözüm Takibi & Memnuniyet Özrü"

    # 5. Düzenli / Çoklu Sipariş Veren Müşteri Tutundurma
    if order_count >= 4:
        if churn_prob >= 0.50:
            return "Düzenli Müşteri Tutundurma Paketi & Özel Kampanya Bildirimi"
        else:
            return "Sadakat Puanı Teşviki & Yeni Sezon Avantajı"

    # 6. Tek Siparişli Müşteri Tutundurma
    if order_count == 1:
        return "2. Sipariş Teşvik Kuponu & Kategori Önerisi"

    # 7. Fiyat ve İndirim Hassasiyeti
    if cashback < 130 and churn_prob >= 0.50:
        return "Kişiselleştirilmiş Cashback & Sepet İndirimi"

    # 8. Rutin Sadık ve Düşük Riskli Müşteriler
    if tenure >= 12:
        return "Yıl Dönümü Teşekkür Bildirimi & Sadakat Puanı"

    return "Dönemsel Kampanya Bildirimi & Çapraz Satış Önerisi"

def process_data(customers_df: pd.DataFrame, complaints_df: pd.DataFrame = None, reviews_df: pd.DataFrame = None) -> pd.DataFrame:
    df = customers_df.copy()

    # Handle missing Tenure logically
    if "Tenure" in df.columns:
        new_cust_mask = df["Tenure"].isna() & ((df["OrderCount"] <= 1) | (df["DaySinceLastOrder"] <= 1))
        df.loc[new_cust_mask, "Tenure"] = 0
        df["Tenure"] = df["Tenure"].fillna(df["Tenure"].median())

    num_cols = ["WarehouseToHome", "HourSpendOnApp", "OrderAmountHikeFromlastYear", "OrderCount", "DaySinceLastOrder", "CashbackAmount"]
    for col in num_cols:
        if col in df.columns:
            df[col] = df[col].fillna(df[col].median())

    if "PreferredPaymentMode" in df.columns:
        df["PreferredPaymentMode"] = df["PreferredPaymentMode"].replace({
            "Cash on Delivery": "Kapıda Nakit Ödeme (COD)",
            "COD": "Kapıda Nakit Ödeme (COD)",
            "Credit Card": "Kredi Kartı",
            "Debit Card": "Banka Kartı",
            "E wallet": "Dijital Cüzdan",
            "UPI": "Banka Transferi"
        })

    if "PreferredLoginDevice" in df.columns:
        df["PreferredLoginDevice"] = df["PreferredLoginDevice"].replace({
            "Phone": "Mobil Telefon",
            "Mobile Phone": "Mobil Telefon",
            "Computer": "Masaüstü Bilgisayar"
        })

    if complaints_df is not None and not complaints_df.empty and "CustomerID" in complaints_df.columns:
        complaint_counts = complaints_df.groupby("CustomerID").size().reset_index(name="TotalComplaints")
        df = pd.merge(df, complaint_counts, on="CustomerID", how="left")
        df["TotalComplaints"] = df["TotalComplaints"].fillna(0).astype(int)
    else:
        df["TotalComplaints"] = 0

    return df

def train_model(df: pd.DataFrame, existing_model=None, retrain: bool = True) -> dict:
    feature_cols = [
        "Tenure", "CityTier", "WarehouseToHome", "HourSpendOnApp",
        "NumberOfDeviceRegistered", "NumberOfAddress", "Complain",
        "OrderAmountHikeFromlastYear", "OrderCount", "DaySinceLastOrder",
        "CashbackAmount", "TotalComplaints"
    ]

    cat_cols = ["PreferredLoginDevice", "PreferredPaymentMode"]
    data = df.copy()

    for col in cat_cols:
        if col in data.columns:
            le = LabelEncoder()
            data[col] = le.fit_transform(data[col].astype(str))
            feature_cols.append(col)

    X = data[feature_cols]
    y = data["Churn"].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    if existing_model is not None and not retrain:
        model = existing_model
        y_pred_proba_test = model.predict_proba(X_test)[:, 1]
        y_pred_test = (y_pred_proba_test >= 0.5).astype(int)
        roc_auc = float(roc_auc_score(y_test, y_pred_proba_test))
        f1 = float(f1_score(y_test, y_pred_test))
    else:
        # Dengeli ceza katsayisi (Yapay %99 patlamasini onleyen kalibrasyon)
        model = XGBClassifier(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.08,
            scale_pos_weight=1.75,
            eval_metric="logloss",
            random_state=42
        )
        model.fit(X_train, y_train)
        y_pred_proba_test = model.predict_proba(X_test)[:, 1]
        y_pred_test = (y_pred_proba_test >= 0.5).astype(int)
        roc_auc = float(roc_auc_score(y_test, y_pred_proba_test))
        f1 = float(f1_score(y_test, y_pred_test))

    raw_prob = model.predict_proba(X)[:, 1]
    all_prob = np.copy(raw_prob)

    # Aktif Müşteri ve Onboarding Gerçekçilik Kalibrasyonu (Business Calibration):
    for i in range(len(df)):
        ten = float(df.iloc[i].get("Tenure", 0))
        days = float(df.iloc[i].get("DaySinceLastOrder", 0))
        comp = float(df.iloc[i].get("Complain", 0))
        tot_c = float(df.iloc[i].get("TotalComplaints", 0))
        ord_c = float(df.iloc[i].get("OrderCount", 1))

        # 1. Yeni kayitli (<=1 ay), sikayetsiz ve yakin zamanda siparis vermis aktif musteri:
        if ten <= 1 and days <= 7 and comp == 0 and tot_c == 0:
            all_prob[i] = min(float(raw_prob[i]) * 0.25, 0.22)
        # 2. Son siparisini cok yakin zamanda (<=3 gun) vermis sikayetsiz coklu siparisli musteri:
        elif days <= 3 and comp == 0 and tot_c == 0 and ord_c >= 2:
            all_prob[i] = min(float(raw_prob[i]) * 0.40, 0.35)

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X)

    # Feature weights to prioritize actionable business drivers over secondary telemetry
    actionable_weights = {
        "TotalComplaints": 1.25,
        "Complain": 1.20,
        "DaySinceLastOrder": 1.15,
        "Tenure": 1.15,
        "CashbackAmount": 1.10,
        "WarehouseToHome": 1.10,
        "CityTier": 1.05,
        "OrderCount": 1.05,
        "NumberOfDeviceRegistered": 0.35,
        "NumberOfAddress": 0.35,
        "HourSpendOnApp": 0.60,
        "OrderAmountHikeFromlastYear": 0.60,
        "PreferredLoginDevice": 0.50,
        "PreferredPaymentMode": 0.70
    }

    shap_top3 = []
    feature_names = list(X.columns)

    for i in range(len(X)):
        row_vals = shap_values[i]
        # Yalnizca ayrilma riskini artiran (SHAP > 0) negatif etkenleri sec
        positive_risks = []
        for k in range(len(feature_names)):
            impact = row_vals[k]
            w = actionable_weights.get(feature_names[k], 1.0)
            if impact > 0: # Riski dogrudan tetikleyen faktor
                positive_risks.append((impact * w, k))

        # Riski en cok artiran ilk 3 faktoru sirala
        positive_risks.sort(key=lambda x: x[0], reverse=True)
        top_indices = [c[1] for c in positive_risks[:3]]

        # Cok sadik musterilerde 3'ten az pozitif risk varsa, en yuksek etkiye sahip digerlerini ekle
        if len(top_indices) < 3:
            remaining = [(abs(row_vals[k]) * actionable_weights.get(feature_names[k], 1.0), k) 
                         for k in range(len(feature_names)) if k not in top_indices]
            remaining.sort(key=lambda x: x[0], reverse=True)
            for _, rem_k in remaining:
                top_indices.append(rem_k)
                if len(top_indices) == 3:
                    break

        factors = []

        for idx in top_indices:
            raw_feat = feature_names[idx]
            impact_val = float(row_vals[idx])
            raw_val = df.iloc[i].get(raw_feat, "")
            is_risk = impact_val > 0
            direction = "Riski Artırıyor" if is_risk else "Sadakati Koruyor"

            if raw_feat == "DaySinceLastOrder":
                days = int(raw_val) if isinstance(raw_val, (int, float, np.number)) else 0
                ord_cnt = int(df.iloc[i].get("OrderCount", 1))
                if is_risk:
                    if days >= 7:
                        lbl = "Uzun Süreli Hareketsizlik"
                        val_str = f"{days} Gün"
                    elif days <= 1 and ord_cnt <= 1:
                        lbl = "Tek Sipariş (Devamlılık Yok)"
                        val_str = "İlk Siparişte Terk Eğilimi"
                    else:
                        lbl = "Sipariş Aralığı"
                        val_str = f"{days} Gün"
                else:
                    lbl = "Yakın Zamanda Sipariş"
                    val_str = f"{days} Gün Önce" if days > 0 else "Bugün Verildi"

            elif raw_feat == "Tenure":
                ten = int(raw_val) if isinstance(raw_val, (int, float, np.number)) else 0
                if is_risk and ten <= 1:
                    lbl = "Yeni Kayıt (İlk 30 Gün)"
                    val_str = f"{ten} Ay (Sadakat Oluşmadı)"
                elif not is_risk and ten >= 6:
                    lbl = "Sadık Müşterilik Geçmişi"
                    val_str = f"{ten} Ay"
                else:
                    lbl = "Müşterilik Süresi"
                    val_str = f"{ten} Ay"

            elif raw_feat == "CashbackAmount":
                amt = float(raw_val) if isinstance(raw_val, (int, float, np.number)) else 0.0
                if is_risk:
                    lbl = "Düşük Yapılan İndirim"
                    val_str = f"{amt:.1f} TL"
                else:
                    lbl = "Yüksek Yapılan İndirim"
                    val_str = f"{amt:.1f} TL"

            elif raw_feat == "TotalComplaints":
                tc = int(raw_val) if isinstance(raw_val, (int, float, np.number)) else 0
                if is_risk and tc > 0:
                    lbl = "Yüksek Şikayet Hacmi"
                    val_str = f"{tc} Şikayet"
                else:
                    lbl = "Şikayet Sayısı"
                    val_str = f"{tc} Şikayet"

            elif raw_feat == "Complain":
                lbl = "Aktif Şikayet Kaydı"
                val_str = "Mevcut" if int(raw_val) == 1 else "Yok"

            elif raw_feat == "WarehouseToHome":
                wh_dist = int(raw_val) if isinstance(raw_val, (int, float, np.number)) else 0
                if is_risk and wh_dist >= 20:
                    lbl = "Kritik Depo Mesafesi"
                    val_str = f"{wh_dist} km"
                else:
                    lbl = "Depo Mesafesi"
                    val_str = f"{wh_dist} km"

            elif raw_feat == "OrderCount":
                oc = int(raw_val) if isinstance(raw_val, (int, float, np.number)) else 0
                if is_risk and oc <= 1:
                    lbl = "Düşük Sipariş Sayısı"
                    val_str = f"{oc} Sipariş (Yenilenmedi)"
                else:
                    lbl = "Toplam Sipariş"
                    val_str = f"{oc} Adet"

            elif raw_feat == "CityTier":
                tier_val = int(raw_val) if isinstance(raw_val, (int, float, np.number)) else 1
                lbl = "Bölge Kademesi"
                val_str = "Tier 3: Kırsal İlçe" if tier_val == 3 else f"Tier {tier_val} Bölge"

            elif raw_feat == "NumberOfDeviceRegistered":
                dev_cnt = int(raw_val) if isinstance(raw_val, (int, float, np.number)) else 1
                lbl = "Cihaz Sayısı"
                val_str = f"{dev_cnt} (Hesap Paylaşım İhtimali)" if is_risk else f"{dev_cnt}"

            elif raw_feat == "NumberOfAddress":
                addr_cnt = int(raw_val) if isinstance(raw_val, (int, float, np.number)) else 1
                lbl = "Adres Sayısı"
                val_str = f"{addr_cnt}"

            else:
                t_info = FACTOR_TEMPLATES.get(raw_feat, (raw_feat, ""))
                lbl = t_info[0] if isinstance(t_info, tuple) else t_info
                if isinstance(raw_val, (int, float, np.number)):
                    val_str = str(int(raw_val) if isinstance(raw_val, int) else round(raw_val, 1))
                else:
                    val_str = str(raw_val)

            factors.append({
                "factor_code": raw_feat,
                "factor_title": f"{lbl}: {val_str}",
                "direction": direction,
                "is_risk": is_risk
            })
        shap_top3.append(factors)

    return {
        "model": model,
        "metrics": {
            "roc_auc": round(roc_auc, 3),
            "f1_score": round(f1, 3)
        },
        "feature_names": feature_names,
        "churn_probabilities": [round(float(p), 4) for p in all_prob],
        "shap_top3": shap_top3
    }
