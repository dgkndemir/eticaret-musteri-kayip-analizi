import pandas as pd
import re

CATEGORY_MAP = {
    "DELIVERY": "Kargo ve Teslimat Gecikmesi",
    "SHIPPING": "Kargo ve Teslimat Gecikmesi",
    "REFUND": "İade ve Geri Ödeme Talebi",
    "RETURNS": "İade ve Geri Ödeme Talebi",
    "PAYMENT": "Ödeme ve Kart Hataları",
    "INVOICE": "Fatura ve Tahsilat İşlemleri",
    "ORDER": "Sipariş ve İptal Süreçleri",
    "CANCEL": "Sipariş ve İptal Süreçleri",
    "ACCOUNT": "Hesap ve Üyelik Yönetimi",
    "CONTACT": "Müşteri Temsilcisi Erişimi",
    "FEEDBACK": "Hizmet Memnuniyetsizliği",
    "SUBSCRIPTION": "Bülten ve Bildirim İptali"
}

CLOTHING_CATEGORY_MAP = {
    "Tops": "Üst Giyim",
    "Dresses": "Elbise",
    "Bottoms": "Alt Giyim",
    "Intimate": "İç Giyim & Ev Giyim",
    "Jackets": "Ceket & Dış Giyim",
    "Trend": "Trend Koleksiyon",
    "General": "Genel Giyim"
}

DEFECT_LABELS = {
    "kalip_darligi": "Kalıp / Beden Darlığı",
    "kumas_kusuru":  "Kumaş Kalitesizliği",
    "dikis_sorunu":  "Dikiş / Sökük Hatası",
    "fermuar":       "Fermuar / Düğme Arızası"
}

STRENGTH_LABELS = {
    "kalip_uyumu":    "Muntazam Kalıp Uyumu",
    "kumas_kalitesi": "Yüksek Kumaş Kalitesi"
}

DEFECT_KEYWORDS = {
    "kalip_darligi": ["tight", "small", "narrow", "fit", "sizing", "size", "short", "runs small", "kalıp", "dar", "küçük", "kısa"],
    "kumas_kusuru":  ["fabric", "material", "cheap", "thin", "scratchy", "rough", "quality", "kumaş", "ince", "kalitesiz", "sert"],
    "dikis_sorunu":  ["stitch", "seam", "stitching", "sewing", "thread", "hem", "dikiş", "sökük", "iplik"],
    "fermuar":       ["zipper", "zip", "button", "closure", "snap", "fermuar", "düğme"]
}

STRENGTH_KEYWORDS = {
    "kalip_uyumu":    ["perfect fit", "fits well", "flattering", "true to size", "comfortable", "tam oturdu", "uygun", "rahat", "harika kalıp"],
    "kumas_kalitesi": ["quality", "soft", "silky", "gorgeous", "durable", "lovely", "kaliteli", "yumuşak", "muntazam", "harika kumaş"]
}

def get_category_action(top_defect: str, avg_rating: float, defect_count: int) -> str:
    if avg_rating <= 3.0 or defect_count >= 3:
        if "Kalıp" in top_defect:
            return "Tedarikçi Kalıp Revizyonu & Beden Tablosu Uyarısı"
        elif "Kumaş" in top_defect:
            return "Tedarikçi Kumaş Kalite Denetimi & Parti Kontrolü"
        elif "Dikiş" in top_defect:
            return "Üretim Bandı Dikiş Denetimi & Hatalı Parti İadesi"
        elif "Fermuar" in top_defect:
            return "Aksesuar / Fermuar Tedarikçisi Değişimi"
        else:
            return "Katalog İncelemesi & Tedarikçi Kalite Uyarısı"
    elif avg_rating >= 4.2:
        return "Öne Çıkarılan Vitrin Ürünü & Reklam Bütçesi Artırımı"
    else:
        return "Standart Kategori Performans Takibi"

def classify_complaint_row(row) -> str:
    raw_cat = str(row.get("ComplaintCategory", "")).strip().upper()
    if raw_cat in CATEGORY_MAP:
        return CATEGORY_MAP[raw_cat]

    text = str(row.get("ComplaintText", "")).lower()
    if any(k in text for k in ["kargo", "teslim", "delivery", "ship", "delay", "late", "track"]):
        return "Kargo ve Teslimat Gecikmesi"
    if any(k in text for k in ["iade", "refund", "return", "para"]):
        return "İade ve Geri Ödeme Talebi"
    if any(k in text for k in ["ödeme", "pay", "card", "fatura", "bill", "invoice"]):
        return "Ödeme ve Kart Hataları"
    if any(k in text for k in ["iptal", "cancel", "sipariş", "order"]):
        return "Sipariş ve İptal Süreçleri"

    return "Genel Şikayet ve Destek Talepleri"

def analyze_reviews(reviews_df: pd.DataFrame) -> dict:
    if reviews_df is None or reviews_df.empty:
        return {"by_department": {}, "all_products": [], "overall_weak": {}, "overall_strong": {}}

    df = reviews_df.copy()
    # Map clothing category name to clean Turkish
    df["CleanCategory"] = df["DepartmentName"].map(CLOTHING_CATEGORY_MAP).fillna("Genel Giyim")

    overall_weak = {"kalip_darligi": 0, "kumas_kusuru": 0, "dikis_sorunu": 0, "fermuar": 0}
    overall_strong = {"kalip_uyumu": 0, "kumas_kalitesi": 0}

    product_defects = {}

    for _, row in df.iterrows():
        rating = row.get("Rating", 3)
        text = str(row.get("ReviewText", "")).lower()
        pid = str(row.get("ProductID", "Unknown"))
        cat_name = str(row.get("CleanCategory", "Genel Giyim"))

        if pid not in product_defects:
            product_defects[pid] = {
                "ProductID": pid,
                "DepartmentName": cat_name,
                "ratings": [],
                "defects": {"kalip_darligi": 0, "kumas_kusuru": 0, "dikis_sorunu": 0, "fermuar": 0},
                "strengths": {"kalip_uyumu": 0, "kumas_kalitesi": 0}
            }
        product_defects[pid]["ratings"].append(rating)

        if rating <= 3:
            for defect, kws in DEFECT_KEYWORDS.items():
                if any(kw in text for kw in kws):
                    overall_weak[defect] += 1
                    product_defects[pid]["defects"][defect] += 1
        elif rating >= 4:
            for strength, kws in STRENGTH_KEYWORDS.items():
                if any(kw in text for kw in kws):
                    overall_strong[strength] += 1
                    product_defects[pid]["strengths"][strength] += 1

    by_department = {}
    for cat, grp in df.groupby("CleanCategory"):
        dept_weak = {"kalip_darligi": 0, "kumas_kusuru": 0, "dikis_sorunu": 0, "fermuar": 0}
        dept_strong = {"kalip_uyumu": 0, "kumas_kalitesi": 0}

        for _, r in grp.iterrows():
            txt = str(r.get("ReviewText", "")).lower()
            rtg = r.get("Rating", 3)
            if rtg <= 3:
                for k, kws in DEFECT_KEYWORDS.items():
                    if any(kw in txt for kw in kws):
                        dept_weak[k] += 1
            elif rtg >= 4:
                for k, kws in STRENGTH_KEYWORDS.items():
                    if any(kw in txt for kw in kws):
                        dept_strong[k] += 1

        by_department[str(cat)] = {
            "avg_rating": round(float(grp["Rating"].mean()), 2),
            "review_count": int(len(grp)),
            "weak_points": {DEFECT_LABELS[k]: v for k, v in dept_weak.items()},
            "strong_points": {STRENGTH_LABELS[k]: v for k, v in dept_strong.items()}
        }

    all_products = []
    for pid, pdata in product_defects.items():
        if len(pdata["ratings"]) >= 2:
            avg_r = sum(pdata["ratings"]) / len(pdata["ratings"])
            top_defect_key = max(pdata["defects"], key=pdata["defects"].get)
            top_strength_key = max(pdata["strengths"], key=pdata["strengths"].get)

            top_defect_name = DEFECT_LABELS.get(top_defect_key, "Kalıp / Beden Darlığı") if pdata["defects"][top_defect_key] > 0 else "Kusur Bildirilmedi"
            defect_cnt = pdata["defects"][top_defect_key]
            action = get_category_action(top_defect_name, avg_r, defect_cnt)

            all_products.append({
                "ProductID": pid,
                "DepartmentName": pdata["DepartmentName"],
                "avg_rating": round(float(avg_r), 2),
                "review_count": len(pdata["ratings"]),
                "top_defect": top_defect_name,
                "defect_count": defect_cnt,
                "top_strength": STRENGTH_LABELS.get(top_strength_key, "Muntazam Kalıp Uyumu") if pdata["strengths"][top_strength_key] > 0 else "Nötr Değerlendirme",
                "strength_count": pdata["strengths"][top_strength_key],
                "category_action": action
            })

    all_products.sort(key=lambda x: (x["avg_rating"], -x["defect_count"]))

    return {
        "by_department": by_department,
        "all_products": all_products,
        "overall_weak": {DEFECT_LABELS[k]: v for k, v in overall_weak.items()},
        "overall_strong": {STRENGTH_LABELS[k]: v for k, v in overall_strong.items()}
    }
