import time
import io
import os
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from ml_pipeline import process_data, train_model, get_crm_action
from nlp_pipeline import classify_complaint_row, analyze_reviews, CLOTHING_CATEGORY_MAP
from llm_pipeline import analyze_product_reviews_llm, generate_customer_strategy_llm, get_available_models

app = FastAPI(title="E-Commerce Decision Support API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CACHED_ANALYSIS = None
CACHED_MODEL = None
RAW_COMPLAINTS_DF = None
RAW_REVIEWS_DF = None

def run_full_pipeline(customers_df: pd.DataFrame, complaints_df: pd.DataFrame, reviews_df: pd.DataFrame, retrain: bool = True) -> dict:
    global CACHED_MODEL, RAW_COMPLAINTS_DF, RAW_REVIEWS_DF
    start_time = time.time()

    RAW_COMPLAINTS_DF = complaints_df.copy() if complaints_df is not None else None
    RAW_REVIEWS_DF = reviews_df.copy() if reviews_df is not None else None

    clean_df = process_data(customers_df, complaints_df, reviews_df)
    ml_results = train_model(clean_df, existing_model=CACHED_MODEL, retrain=retrain)
    CACHED_MODEL = ml_results["model"]

    comp_category_counts = {}
    delivery_intents = {}
    cust_delivery_counts = {}

    if complaints_df is not None and not complaints_df.empty:
        complaints_df["MappedCategory"] = complaints_df.apply(classify_complaint_row, axis=1)
        comp_category_counts = complaints_df["MappedCategory"].value_counts().to_dict()

        log_comp = complaints_df[complaints_df["ComplaintCategory"].isin(["DELIVERY", "SHIPPING"])]
        if not log_comp.empty:
            intent_labels = {
                "delivery_period": "Teslimat Süresi ve Kargo Rötarı",
                "set_up_shipping_address": "Adres / Teslimat Noktası Tanımlama",
                "delivery_options": "Teslimat Seçenekleri ve Kargo Kısıtı",
                "change_shipping_address": "Sevkiyat Esnasında Adres Değişikliği"
            }
            intents = log_comp["ComplaintIntent"].value_counts()
            delivery_intents = {intent_labels.get(k, str(k)): int(v) for k, v in intents.items()}
            cust_delivery_counts = log_comp.groupby("CustomerID").size().to_dict()

    nlp_results = analyze_reviews(reviews_df)

    clean_df["churn_probability"] = ml_results["churn_probabilities"]
    clean_df["shap_top3"] = ml_results["shap_top3"]
    clean_df["DeliveryComplaints"] = clean_df["CustomerID"].map(cust_delivery_counts).fillna(0).astype(int)

    total_customers = len(clean_df)
    churn_rate_pct = round(float(clean_df["Churn"].mean() * 100), 2)
    high_risk_df = clean_df[clean_df["churn_probability"] >= 0.70]
    high_risk_count = int(len(high_risk_df))

    city_tier_labels = {
        "1": "Tier 1: Büyükşehir / Metropol",
        "2": "Tier 2: Gelişmiş İl Merkezi",
        "3": "Tier 3: Taşra / Kırsal İlçe"
    }
    city_tier_churn = {}
    if "CityTier" in clean_df.columns:
        for tier, grp in clean_df.groupby("CityTier"):
            title = city_tier_labels.get(str(tier), f"Tier {tier}")
            city_tier_churn[title] = round(float(grp["Churn"].mean() * 100), 2)

    distance_buckets = []
    if "WarehouseToHome" in clean_df.columns:
        bins = [0, 10, 20, 30, 999]
        labels = ["0 - 10 km (Yakın Depo)", "11 - 20 km (Standart Sevk)", "21 - 30 km (Uzak Bölge)", "30+ km (Kritik Mesafe)"]
        clean_df["DistanceBucket"] = pd.cut(clean_df["WarehouseToHome"], bins=bins, labels=labels)
        for label, grp in clean_df.groupby("DistanceBucket", observed=False):
            distance_buckets.append({
                "aralik": str(label),
                "ortalama_churn_pct": round(float(grp["Churn"].mean() * 100), 2) if len(grp) > 0 else 0.0
            })

    # Logistics metrics
    total_complaints = len(complaints_df) if complaints_df is not None else 0
    delivery_complaints = sum(delivery_intents.values()) if delivery_intents else comp_category_counts.get("Kargo ve Teslimat Gecikmesi", 0)

    # Regional logistics summary table
    regional_summary = []
    strategies = {
        "1": "Randevulu Kurye ve Aynı Gün Teslimat Entegrasyonu",
        "2": "Bölgesel Transfer Merkezi Sevk Hızlandırması",
        "3": "Yerel Dağıtım Ağı (PUDO) & Mikro-Depo Genişletme"
    }
    for tier, grp in clean_df.groupby("CityTier"):
        t_str = str(tier)
        t_label = city_tier_labels.get(t_str, f"Tier {tier}")
        churn_pct = round(float(grp["Churn"].mean() * 100), 2)
        risk_lvl = "Düşük Risk" if churn_pct < 16 else ("Orta Risk" if churn_pct < 20 else "Yüksek Risk")
        del_count = int(grp["DeliveryComplaints"].sum())
        regional_summary.append({
            "tier": int(tier),
            "label": t_label,
            "customers": int(len(grp)),
            "avg_distance": round(float(grp["WarehouseToHome"].mean()), 1) if "WarehouseToHome" in grp else 0.0,
            "delivery_complaints": del_count,
            "churn_rate": churn_pct,
            "risk_level": risk_lvl,
            "strategy": strategies.get(t_str, "Standart Sevk Takibi")
        })

    # Logistics operational customer action list
    logistics_customers = []
    log_sorted = clean_df.sort_values(by=["DeliveryComplaints", "churn_probability"], ascending=[False, False])
    for _, row in log_sorted.iterrows():
        t_val = int(row.get("CityTier", 1))
        dist = round(float(row.get("WarehouseToHome", 0.0)), 1)
        deliv_c = int(row.get("DeliveryComplaints", 0))
        prob = round(float(row["churn_probability"]), 3)

        if deliv_c > 0 and dist >= 20:
            issue = f"Kritik Depo Mesafesi ({dist} km) & {deliv_c} Kargo Şikayeti"
            action = "Öncelikli SLA & Bölgesel Mikro-Depo İntikali"
        elif deliv_c > 0:
            issue = f"{deliv_c} Adet Teslimat / Kargo Rötarı Şikayeti"
            action = "Kargo Firması İncelemesi & VIP Hızlı Kurye Kuponu"
        elif dist >= 25:
            issue = f"Yüksek Sevk Mesafesi ({dist} km - Gecikme Riski)"
            action = "Alternatif Dağıtım Ağı ve Rota Optimizasyonu"
        elif t_val == 3:
            issue = f"Kırsal Bölge Kısıtı ({dist} km Depo Mesafesi)"
            action = "Yerel Teslimat Noktası (PUDO) Tanımla"
        else:
            issue = f"Standart Dağıtım ({dist} km)"
            action = "Rutin Sevk ve Kargo Takibi"

        logistics_customers.append({
            "CustomerID": int(row["CustomerID"]),
            "CityTier": t_val,
            "CityTierLabel": city_tier_labels.get(str(t_val), f"Tier {t_val}"),
            "WarehouseToHome": dist,
            "DeliveryComplaints": deliv_c,
            "churn_probability": prob,
            "logistics_issue": issue,
            "recommended_action": action
        })

    with_del_churn = round(float(clean_df[clean_df["DeliveryComplaints"] > 0]["Churn"].mean() * 100), 2) if (clean_df["DeliveryComplaints"] > 0).sum() > 0 else 0.0
    without_del_churn = round(float(clean_df[clean_df["DeliveryComplaints"] == 0]["Churn"].mean() * 100), 2) if (clean_df["DeliveryComplaints"] == 0).sum() > 0 else 0.0
    critical_dist_count = int((clean_df["WarehouseToHome"] > 20).sum()) if "WarehouseToHome" in clean_df else 0
    avg_wh_dist = round(float(clean_df["WarehouseToHome"].mean()), 1) if "WarehouseToHome" in clean_df else 0.0

    # Category metrics
    total_reviews = len(reviews_df) if reviews_df is not None else 0
    avg_platform_rating = round(float(reviews_df["Rating"].mean()), 2) if reviews_df is not None and not reviews_df.empty else 0.0

    crm_customers = []
    sorted_df = clean_df.sort_values(by="churn_probability", ascending=False)
    for _, row in sorted_df.iterrows():
        tier_val = int(row.get("CityTier", 1))
        prob = round(float(row["churn_probability"]), 3)
        ten = int(row.get("Tenure", 0))
        ord_c = int(row.get("OrderCount", 1))
        tot_comp = int(row.get("TotalComplaints", 0))
        days_order = int(row.get("DaySinceLastOrder", 0))
        cashback = round(float(row.get("CashbackAmount", 0.0)), 2)

        dist_val = round(float(row.get("WarehouseToHome", 0.0)), 1)
        action = get_crm_action(prob, tot_comp, days_order, ord_c, ten, cashback, city_tier=tier_val, dist=dist_val)
        tenure_label = "Yeni Müşteri (< 1 Ay)" if ten <= 1 else f"{ten} Aylık Müşteri"

        crm_customers.append({
            "CustomerID": int(row["CustomerID"]),
            "churn_probability": prob,
            "CityTier": tier_val,
            "CityTierLabel": city_tier_labels.get(str(tier_val), f"Tier {tier_val}"),
            "DaySinceLastOrder": days_order,
            "OrderCount": ord_c,
            "Tenure": ten,
            "TenureLabel": tenure_label,
            "TotalComplaints": tot_comp,
            "CashbackAmount": cashback,
            "Complain": int(row.get("Complain", 0)),
            "PreferredPaymentMode": str(row.get("PreferredPaymentMode", "-")),
            "crm_action": action,
            "shap_top3": row["shap_top3"]
        })

    elapsed_time = round(time.time() - start_time, 2)

    return {
        "metrics": {
            "roc_auc": ml_results["metrics"]["roc_auc"],
            "f1_score": ml_results["metrics"]["f1_score"],
            "total_customers": total_customers,
            "churn_rate_pct": churn_rate_pct,
            "high_risk_count": high_risk_count,
            "total_complaints": total_complaints,
            "delivery_complaints": delivery_complaints,
            "total_reviews": total_reviews,
            "avg_platform_rating": avg_platform_rating,
            "pipeline_seconds": elapsed_time
        },
        "crm": {
            "customers": crm_customers
        },
        "logistics": {
            "complaints_by_category": comp_category_counts,
            "delivery_intents": delivery_intents,
            "city_tier_churn": city_tier_churn,
            "warehouse_distance_buckets": distance_buckets,
            "regional_summary": regional_summary,
            "customers": logistics_customers,
            "kpis": {
                "delivery_complaints": delivery_complaints,
                "delivery_customers_count": int((clean_df["DeliveryComplaints"] > 0).sum()),
                "churn_rate_with_delivery": with_del_churn,
                "churn_rate_without_delivery": without_del_churn,
                "avg_distance": avg_wh_dist,
                "critical_distance_customers": critical_dist_count,
                "tier3_churn": city_tier_churn.get("Tier 3: Taşra / Kırsal İlçe", 21.37)
            }
        },
        "category": nlp_results
    }

def load_default_data():
    global CACHED_ANALYSIS
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cust_path = os.path.join(base_dir, "Musteriler.csv")
    comp_path = os.path.join(base_dir, "Sikayetler.csv")
    rev_path = os.path.join(base_dir, "Yorumlar.csv")

    if os.path.exists(cust_path) and os.path.exists(comp_path) and os.path.exists(rev_path):
        print("Loading default corporate datasets from disk...")
        c_df = pd.read_csv(cust_path)
        comp_df = pd.read_csv(comp_path)
        r_df = pd.read_csv(rev_path)
        CACHED_ANALYSIS = run_full_pipeline(c_df, comp_df, r_df, retrain=True)
        print("Default analysis loaded successfully!")
    else:
        print("Default datasets not found in backend directory.")

load_default_data()

@app.get("/")
@app.head("/")
def root_check():
    return {"message": "E-Commerce Decision Support API is running", "status": "ok"}

@app.get("/health")
@app.head("/health")
def health_check():
    return {"status": "ok", "has_data": CACHED_ANALYSIS is not None}

@app.get("/robots.txt", response_class=PlainTextResponse)
def get_robots_txt():
    return "User-agent: *\nDisallow: /\n"

@app.get("/api/data")
def get_current_data():
    global CACHED_ANALYSIS
    if CACHED_ANALYSIS is None:
        load_default_data()
    if CACHED_ANALYSIS is None:
        raise HTTPException(status_code=404, detail="Varsayılan veri ambarı bulunamadı.")
    return CACHED_ANALYSIS

@app.get("/api/customer/{customer_id}/complaints")
def get_customer_complaints(customer_id: int):
    global RAW_COMPLAINTS_DF
    if RAW_COMPLAINTS_DF is None or RAW_COMPLAINTS_DF.empty:
        return {"customer_id": customer_id, "count": 0, "complaints": []}

    cust_complaints = RAW_COMPLAINTS_DF[RAW_COMPLAINTS_DF["CustomerID"] == customer_id]
    records = []
    for _, r in cust_complaints.iterrows():
        records.append({
            "ComplaintText": str(r.get("ComplaintText", "")),
            "ComplaintCategory": str(r.get("ComplaintCategory", "")),
            "ComplaintIntent": str(r.get("ComplaintIntent", "-"))
        })

    return {
        "customer_id": customer_id,
        "count": len(records),
        "complaints": records
    }

@app.get("/api/product/{product_id}/reviews")
def get_product_reviews(product_id: str):
    global RAW_REVIEWS_DF
    if RAW_REVIEWS_DF is None or RAW_REVIEWS_DF.empty:
        return {"product_id": product_id, "count": 0, "reviews": []}

    prod_reviews = RAW_REVIEWS_DF[RAW_REVIEWS_DF["ProductID"].astype(str) == str(product_id)]
    records = []
    for _, r in prod_reviews.iterrows():
        records.append({
            "Rating": int(r.get("Rating", 0)),
            "ReviewText": str(r.get("ReviewText", "")),
            "DepartmentName": CLOTHING_CATEGORY_MAP.get(str(r.get("DepartmentName", "Genel")), "Genel Giyim")
        })

    return {
        "product_id": product_id,
        "count": len(records),
        "reviews": records
    }

@app.get("/api/llm/models")
def get_llm_models(api_key: str = None):
    return {"models": get_available_models(api_key=api_key)}

@app.post("/api/llm/analyze-product/{product_id}")
def analyze_product_with_llm(product_id: str, model: str = None, api_key: str = None):
    global RAW_REVIEWS_DF
    if RAW_REVIEWS_DF is None or RAW_REVIEWS_DF.empty:
        raise HTTPException(status_code=404, detail="Yorum verisi bulunamadı.")

    prod_reviews = RAW_REVIEWS_DF[RAW_REVIEWS_DF["ProductID"].astype(str) == str(product_id)]
    if prod_reviews.empty:
        raise HTTPException(status_code=404, detail=f"#{product_id} kodlu ürün bulunamadı.")

    avg_r = round(float(prod_reviews["Rating"].mean()), 2) if "Rating" in prod_reviews else 3.0
    raw_dept = str(prod_reviews.iloc[0].get("DepartmentName", "Genel Giyim"))
    clean_dept = CLOTHING_CATEGORY_MAP.get(raw_dept, raw_dept)
    review_list = prod_reviews[["Rating", "ReviewText"]].to_dict("records")

    try:
        result = analyze_product_reviews_llm(product_id, clean_dept, review_list, avg_r, api_key=api_key, requested_model=model)
    except Exception as e:
        print("Model çağrısı sırasında hata oluştu, yerel LLM motoruna geçiliyor:", e)
        result = analyze_product_reviews_llm(product_id, clean_dept, review_list, avg_r, requested_model="local")
        result["model_used"] = "Yerel Semantik LLM (Model hatası nedeniyle güvenli modda çalıştı)"

    return {
        "product_id": product_id,
        "category": clean_dept,
        **result
    }

@app.post("/api/llm/generate-customer-strategy/{customer_id}")
def generate_customer_strategy_with_llm(customer_id: int, model: str = None, api_key: str = None):
    global CACHED_ANALYSIS, RAW_COMPLAINTS_DF
    if CACHED_ANALYSIS is None or "crm" not in CACHED_ANALYSIS:
        raise HTTPException(status_code=404, detail="Müşteri verisi bulunamadı.")

    cust_matches = [c for c in CACHED_ANALYSIS["crm"]["customers"] if c["CustomerID"] == customer_id]
    if not cust_matches:
        raise HTTPException(status_code=404, detail=f"#{customer_id} kodlu müşteri bulunamadı.")

    c_data = cust_matches[0]
    complaints = []
    if RAW_COMPLAINTS_DF is not None and not RAW_COMPLAINTS_DF.empty:
        comp_rows = RAW_COMPLAINTS_DF[RAW_COMPLAINTS_DF["CustomerID"] == customer_id]
        complaints = comp_rows.to_dict("records")

    try:
        result = generate_customer_strategy_llm(customer_id, c_data, complaints, api_key=api_key, requested_model=model)
    except Exception as e:
        print("Model çağrısı sırasında hata oluştu, yerel LLM motoruna geçiliyor:", e)
        result = generate_customer_strategy_llm(customer_id, c_data, complaints, requested_model="local")
        result["model_used"] = "Yerel Semantik LLM (Model hatası nedeniyle güvenli modda çalıştı)"

    return {
        "customer_id": customer_id,
        **result
    }

@app.post("/api/analyze")
async def analyze_data(
    musteriler: UploadFile = File(...),
    sikayetler: UploadFile = File(...),
    yorumlar: UploadFile = File(...),
    retrain: bool = Form(False)
):
    global CACHED_ANALYSIS
    try:
        c_df = pd.read_csv(io.BytesIO(await musteriler.read()))
        comp_df = pd.read_csv(io.BytesIO(await sikayetler.read()))
        r_df = pd.read_csv(io.BytesIO(await yorumlar.read()))
        CACHED_ANALYSIS = run_full_pipeline(c_df, comp_df, r_df, retrain=retrain)
        return CACHED_ANALYSIS
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri işleme ve analiz hatası: {str(e)}")
