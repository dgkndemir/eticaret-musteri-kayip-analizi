import os
import pandas as pd
from ml_pipeline import process_data, train_model, get_crm_action
from nlp_pipeline import classify_complaint_row

def export_powerbi_dataset():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cust_path = os.path.join(base_dir, "Musteriler.csv")
    comp_path = os.path.join(base_dir, "Sikayetler.csv")
    rev_path = os.path.join(base_dir, "Yorumlar.csv")
    out_dir = os.path.abspath(os.path.join(base_dir, "..", "..")) # C:\Users\dgknd\Desktop\PROJE

    print(f"Reading datasets from {base_dir}...")
    cust_df = pd.read_csv(cust_path)
    comp_df = pd.read_csv(comp_path)
    rev_df = pd.read_csv(rev_path)

    clean_df = process_data(cust_df, comp_df, rev_df)
    ml_results = train_model(clean_df, retrain=False)

    clean_df["churn_probability"] = ml_results["churn_probabilities"]
    shap_top3 = ml_results["shap_top3"]

    # Delivery complaints count
    log_comp = comp_df[comp_df["ComplaintCategory"].isin(["DELIVERY", "SHIPPING"])]
    del_counts = log_comp.groupby("CustomerID").size().to_dict()
    clean_df["DeliveryComplaints"] = clean_df["CustomerID"].map(del_counts).fillna(0).astype(int)

    # City Tier Labels
    city_labels = {
        1: "Tier 1: Metropol",
        2: "Tier 2: Gelişmiş İl",
        3: "Tier 3: Kırsal / Taşra"
    }

    # Build Power BI Export Rows
    rows = []
    for idx, row in clean_df.iterrows():
        cid = int(row["CustomerID"])
        prob = round(float(row["churn_probability"]), 4)
        prob_pct = round(prob * 100, 1)

        if prob >= 0.70:
            risk_seg = "Kritik Risk (>=70%)"
        elif prob >= 0.40:
            risk_seg = "Orta Risk (%40-%69)"
        else:
            risk_seg = "Düşük Risk (<%40)"

        shap_list = shap_top3.get(cid, [])
        s1 = shap_list[0]["factor_title"] if len(shap_list) > 0 else "-"
        s2 = shap_list[1]["factor_title"] if len(shap_list) > 1 else "-"
        s3 = shap_list[2]["factor_title"] if len(shap_list) > 2 else "-"

        # CRM action
        crm_act = get_crm_action(row, shap_list)

        # Logistics action
        dist = round(float(row.get("WarehouseToHome", 0.0)), 1)
        del_c = int(row.get("DeliveryComplaints", 0))
        t_val = int(row.get("CityTier", 1))

        if del_c > 0 and dist >= 20:
            log_act = "Öncelikli SLA & Bölgesel Mikro-Depo İntikali"
        elif del_c > 0:
            log_act = "Kargo Firması İncelemesi & Öncelikli Hızlı Teslimat"
        elif dist >= 25:
            log_act = "Alternatif Dağıtım Ağı ve Rota Optimizasyonu"
        elif t_val == 3:
            log_act = "Yerel Teslimat Noktası (PUDO) Tanımla"
        else:
            log_act = "Rutin Sevk ve Kargo Takibi"

        rows.append({
            "CustomerID": cid,
            "Gercek_Kayıp_Durumu": int(row.get("Churn", 0)),
            "Kayıp_Olasılığı": prob,
            "Kayıp_Olasılığı_Yüzde": prob_pct,
            "Risk_Segmenti": risk_seg,
            "Şehir_Kademesi": t_val,
            "Şehir_Kademesi_Etiket": city_labels.get(t_val, f"Tier {t_val}"),
            "Depo_Mesafesi_km": dist,
            "Üyelik_Süresi_Ay": int(row.get("Tenure", 0)),
            "Toplam_Sipariş": int(row.get("OrderCount", 0)),
            "Son_Siparişten_Geçen_Gün": int(row.get("DaySinceLastOrder", 0)),
            "Kazanılan_İndirim_TL": round(float(row.get("CashbackAmount", 0.0)), 2),
            "Toplam_Şikayet": int(row.get("TotalComplaints", 0)),
            "Kargo_Teslimat_Şikayeti": del_c,
            "SHAP_Risk_Faktörü_1": s1,
            "SHAP_Risk_Faktörü_2": s2,
            "SHAP_Risk_Faktörü_3": s3,
            "Önerilen_CRM_Aksiyonu": crm_act,
            "Önerilen_Lojistik_Aksiyonu": log_act
        })

    export_df = pd.DataFrame(rows)
    out_csv = os.path.join(out_dir, "PowerBI_Analiz_VeriSeti.csv")
    export_df.to_csv(out_csv, index=False, encoding="utf-8-sig")
    print(f"Power BI dataset successfully saved to: {out_csv} ({len(export_df)} records)")

if __name__ == "__main__":
    export_powerbi_dataset()
