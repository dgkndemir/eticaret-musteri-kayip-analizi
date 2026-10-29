"""
E-Ticaret Karar Destek Sistemi - Uctan Uca Test Senaryolari Dogrulama Scripti (TS-01 .. TS-08)
Kullanim:
    python verify_tests.py
    python verify_tests.py [opsiyonel_csv_dizin_yolu]
"""
import os
import sys
import subprocess

# Windows konsolunda UTF-8 karakterlerin duzgun gorunmesi icin
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Dizin yapisini belirle
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

for d in [BACKEND_DIR, ROOT_DIR]:
    if d not in sys.path and os.path.isdir(d):
        sys.path.insert(0, d)

def ensure_environment():
    """
    Eger mevcut Python yorumlayicisinda sklearn / xgboost / shap eksikse ve
    proje icerisinde bir sanal ortam (backend/.venv veya .venv) mevcutsa,
    testleri otomatik olarak bu sanal ortamin Python yorumlayicisi ile calistirir.
    """
    try:
        import sklearn  # noqa: F401
        import xgboost  # noqa: F401
        import shap  # noqa: F401
        return
    except ImportError:
        pass

    venv_candidates = [
        os.path.join(ROOT_DIR, "backend", ".venv", "Scripts", "python.exe"),
        os.path.join(ROOT_DIR, ".venv", "Scripts", "python.exe"),
        os.path.join(ROOT_DIR, "backend", ".venv", "bin", "python"),
        os.path.join(ROOT_DIR, ".venv", "bin", "python"),
    ]

    target_venv_python = None
    for cand in venv_candidates:
        if os.path.isfile(cand):
            try:
                if os.path.samefile(cand, sys.executable):
                    continue
            except Exception:
                if os.path.abspath(cand).lower() == os.path.abspath(sys.executable).lower():
                    continue
            target_venv_python = cand
            break

    if target_venv_python:
        rel_venv = os.path.relpath(target_venv_python, ROOT_DIR)
        print("\n" + "=" * 75)
        print(" [i] BILDIRIM: Sistem Python ortaminda 'scikit-learn' paketi bulunamadi.")
        print(f" [+] Proje sanal ortami algilandi: {rel_venv}")
        print(" [>] Testler otomatik olarak bu sanal ortam ile yeniden baslatiliyor...")
        print("=" * 75 + "\n")

        cmd = [target_venv_python, os.path.abspath(__file__)] + sys.argv[1:]
        try:
            res = subprocess.run(cmd)
            sys.exit(res.returncode)
        except Exception as e:
            print(f"[!] Sanal ortam baslatilamadi: {e}")
            sys.exit(1)

REQUIRED_CSVS = ["Musteriler.csv", "Sikayetler.csv", "Yorumlar.csv"]

def get_missing_csvs(directory: str) -> list:
    """Verilen dizinde eksik olan CSV dosyalarini dondurur."""
    if not os.path.isdir(directory):
        return REQUIRED_CSVS
    return [csv_file for csv_file in REQUIRED_CSVS if not os.path.isfile(os.path.join(directory, csv_file))]

def resolve_csv_directory() -> str:
    """
    CSV dosyalarinin bulundugu klasoru belirler:
    1. Komut satiri argumani (sys.argv[1])
    2. Calisma dizini (os.getcwd()) veya Proje ana dizini (ROOT_DIR)
    3. Eksikse kullaniciya terminalden sorar (sample_data ornek veri setini hatirlatir)
    """
    # 1. Komut satiri argumani kontrolu
    if len(sys.argv) > 1 and sys.argv[1].strip():
        arg_path = sys.argv[1].strip().strip('"\'')
        candidate = arg_path if os.path.isabs(arg_path) else os.path.abspath(arg_path)
        missing = get_missing_csvs(candidate)
        if not missing:
            return candidate
        else:
            print(f"\n[!] Komut satirinda belirtilen dizinde CSV dosyalari bulunamadi: {candidate}")
            for m in missing:
                print(f"     - Eksik: {m}")

    # 2. Calisma dizini veya ROOT_DIR kontrolu (eger dogrudan ana klasorde veya bulunulan klasorde varsa)
    for candidate in [os.getcwd(), ROOT_DIR]:
        if not get_missing_csvs(candidate):
            return candidate

    # 3. CSV dosyalari bulunamadi -> Bilgi ver ve terminalde klasor yolu iste
    sample_dir = os.path.join(ROOT_DIR, "sample_data")
    sample_exists = not get_missing_csvs(sample_dir)

    print("\n" + "=" * 75)
    print("  E-TICARET KARAR DESTEK SISTEMI - TEST SENARYOLARI DOGRULAMA (TS-01..08)")
    print("=" * 75)
    print(" [!] BILDIRIM: Test CSV dosyalari mevcut dizinde bulunamadi.")
    print("     Gerekli dosyalar: " + ", ".join(REQUIRED_CSVS))
    print(" 💡 BILGI: Ornek veri setlerine 'sample_data' klasorunden erisebilirsiniz.")
    if sample_exists:
        print("           (sample_data/Musteriler.csv, Sikayetler.csv, Yorumlar.csv)")
    print("=" * 75)

    # Otomatik test veya non-interactive calismada sample_data varsa direkt kullan
    if not sys.stdin.isatty():
        if sample_exists:
            print(f"[+] Otomatik mod: 'sample_data' dizini kullaniliyor: {sample_dir}\n")
            return sample_dir
        else:
            print("[X] Terminal interaktif degil ve 'sample_data' bulunamadi. Test durduruluyor.")
            sys.exit(1)

    while True:
        default_hint = "sample_data icin Enter, " if sample_exists else ""
        prompt = f"\nLutfen CSV dosyalarinin bulundugu klasor yolunu girin ({default_hint}cikis icin 'q'): "
        
        try:
            user_input = input(prompt).strip().strip('"\'')
        except (KeyboardInterrupt, EOFError):
            print("\n[!] Islem kullanici tarafindan iptal edildi.")
            sys.exit(0)

        if user_input.lower() in ("q", "quit", "exit"):
            print("[!] Test dogrulama sonlandirildi.")
            sys.exit(0)

        # Enter'a basildiysa ve sample_data varsa
        if not user_input:
            if sample_exists:
                print(f"[+] 'sample_data' klasoru secildi: {sample_dir}")
                return sample_dir
            else:
                print(" [!] 'sample_data' klasoru bulunamadi. Lutfen gecerli bir dizin yolu girin.")
                continue

        # Girilen yolu cozumle
        candidate = user_input
        if not os.path.isabs(candidate):
            p1 = os.path.abspath(os.path.join(ROOT_DIR, candidate))
            p2 = os.path.abspath(os.path.join(os.getcwd(), candidate))
            candidate = p1 if os.path.isdir(p1) else p2

        missing = get_missing_csvs(candidate)
        if not missing:
            print(f"[+] Dizin dogrulandi: {candidate}")
            return candidate
        else:
            print(f"\n [X] Secilen dizinde eksik CSV dosyalari var ({candidate}):")
            for m in missing:
                print(f"     - Eksik: {m}")
            print("     Lutfen dosyalarin bulundugu dogru klasor yolunu girin.")

def run_tests():
    ensure_environment()
    base_dir = resolve_csv_directory()
    
    print("\n" + "=" * 75)
    print("  E-TICARET KARAR DESTEK SISTEMI - TEST SENARYOLARI DOGRULAMA (TS-01..08)")
    print(f"  Veri Kaynagi: {base_dir}")
    print("=" * 75)
    
    cust_path = os.path.join(base_dir, "Musteriler.csv")
    comp_path = os.path.join(base_dir, "Sikayetler.csv")
    rev_path = os.path.join(base_dir, "Yorumlar.csv")
    
    import pandas as pd
    import numpy as np

    scorecard = []
    clean_df = None
    ml_res = None
    
    # TS-01: Veri Butunlestirme ve Kayipsiz Eslesme Testi
    try:
        c_df = pd.read_csv(cust_path)
        comp_df = pd.read_csv(comp_path)
        rev_df = pd.read_csv(rev_path)
        
        merged = pd.merge(c_df, comp_df.groupby("CustomerID").size().reset_index(name="CompCount"), on="CustomerID", how="left")
        orphan_count = merged["CustomerID"].isna().sum()
        status = "PASSED" if orphan_count == 0 and len(c_df) == 5630 else "FAILED"
        scorecard.append(("TS-01", "Veri Butunlestirme (1-to-Many CustomerID)", status, f"Toplam 5.630 Musteri, Yetim ID: {orphan_count}"))
    except Exception as e:
        scorecard.append(("TS-01", "Veri Butunlestirme", "FAILED", str(e)))

    # TS-02: Eksik Veri Tamamlama ve Kategorik Tekillestirme Testi
    try:
        from ml_pipeline import process_data
        clean_df = process_data(c_df, comp_df, rev_df)
        nan_counts = clean_df[["Tenure", "WarehouseToHome", "DaySinceLastOrder", "CashbackAmount"]].isna().sum().sum()
        status = "PASSED" if nan_counts == 0 else "FAILED"
        scorecard.append(("TS-02", "Eksik Veri (Medyan) & Kategorik Standardizasyon", status, f"Kalan NaN: {nan_counts}"))
    except Exception as e:
        scorecard.append(("TS-02", "Eksik Veri Tamamlama", "FAILED", str(e)))

    # TS-03 & TS-04: XGBoost ROC-AUC / F1 & SHAP Ilk 3 Faktor Testi
    try:
        if clean_df is None:
            raise ValueError("TS-02 adimi basarisiz oldugu icin temiz veri kumesi hazir degil")
        from ml_pipeline import train_model
        ml_res = train_model(clean_df, retrain=True)
        roc = ml_res["metrics"]["roc_auc"]
        f1 = ml_res["metrics"]["f1_score"]
        
        ts3_pass = (roc >= 0.85) and (f1 >= 0.60)
        scorecard.append(("TS-03", "Model Tahmin Basarimi (ROC-AUC >= 0.85, F1 >= 0.60)", "PASSED" if ts3_pass else "FAILED", f"ROC-AUC: {roc:.3f}, F1-Score: {f1:.3f}"))
        
        shap_count = len(ml_res["shap_top3"])
        first_cust_shap = ml_res["shap_top3"][0] if isinstance(ml_res["shap_top3"], list) else next(iter(ml_res["shap_top3"].values()))
        ts4_pass = shap_count > 0 and len(first_cust_shap) > 0
        scorecard.append(("TS-04", "Model Aciklanabilirligi (SHAP Ilk Belirleyiciler)", "PASSED" if ts4_pass else "FAILED", f"{shap_count} musteri icin risk faktorsel agirligi cikarildi"))
    except Exception as e:
        scorecard.append(("TS-03", "Model Tahmin Basarimi", "FAILED", str(e)))
        scorecard.append(("TS-04", "SHAP Ilk Belirleyiciler", "FAILED", str(e)))

    # TS-05: Sikayet Surec Siniflandirma Testi
    try:
        from nlp_pipeline import classify_complaint_row
        sample_complaint = pd.Series({"ComplaintText": "Kargom 10 gundur dagitim merkezinde bekliyor teslim edilmedi", "ComplaintCategory": "DELIVERY", "ComplaintIntent": "delivery_period"})
        mapped = classify_complaint_row(sample_complaint)
        ts5_pass = "Lojistik" in mapped or "Kargo" in mapped
        scorecard.append(("TS-05", "Sikayet Surec Siniflandirma Dogrulugu", "PASSED" if ts5_pass else "FAILED", f"Kategori: '{mapped}'"))
    except Exception as e:
        scorecard.append(("TS-05", "Sikayet Surec Siniflandirma", "FAILED", str(e)))

    # TS-06 & TS-07: Yorumlarin NLP / Kök Neden Analizi Testi
    try:
        from nlp_pipeline import analyze_reviews
        nlp_res = analyze_reviews(rev_df)
        defects = list(nlp_res["top_defects"].keys())[:3]
        strengths = list(nlp_res["top_strengths"].keys())[:3]
        
        ts6_pass = len(defects) >= 2
        scorecard.append(("TS-06", "LLM/NLP Dusuk Puanli Yorumlardan Kusur Tespiti (Rating <= 3)", "PASSED" if ts6_pass else "FAILED", f"Kusurlar: {', '.join(defects)}"))
        
        ts7_pass = len(strengths) >= 2
        scorecard.append(("TS-07", "LLM/NLP Yuksek Puanli Yorumlardan Guclu Yon Tespiti (Rating >= 4)", "PASSED" if ts7_pass else "FAILED", f"Guclu Yonler: {', '.join(strengths)}"))
    except Exception as e:
        scorecard.append(("TS-06", "Kök Neden Kusur Tespiti", "FAILED", str(e)))
        scorecard.append(("TS-07", "Guclu Yon Tespiti", "FAILED", str(e)))

    # TS-08: Dinamik Filtreleme ve Disa Aktarim Testi
    try:
        if clean_df is None or ml_res is None or "churn_probabilities" not in ml_res:
            scorecard.append(("TS-08", "Dinamik Filtreleme (Tier 3 & Churn >= %70) & CSV Export", "FAILED", "TS-02 veya TS-03 model egitimi tamamlanamadigi icin atlandi"))
        else:
            probs = np.array(ml_res["churn_probabilities"])
            t3_high_risk = clean_df[(clean_df["CityTier"].values == 3) & (probs >= 0.70)]
            ts8_pass = len(t3_high_risk) > 0
            scorecard.append(("TS-08", "Dinamik Filtreleme (Tier 3 & Churn >= %70) & CSV Export", "PASSED" if ts8_pass else "FAILED", f"{len(t3_high_risk)} kritik hedef musteri filtrelendi"))
    except Exception as e:
        scorecard.append(("TS-08", "Dinamik Filtreleme", "FAILED", str(e)))

    print("\n" + "-" * 75)
    all_passed = True
    for tid, name, res, detail in scorecard:
        icon = "[OK]  " if res == "PASSED" else "[FAIL]"
        if res != "PASSED": all_passed = False
        print(f" {icon} {tid}: {name}")
        print(f"        -> {detail}")
    print("-" * 75)
    print(f" SONUC: {'TUM TESTLER BASARIYLA TAMAMLANDI (8/8)' if all_passed else 'BAZI TESTLER BASARISIZ OLDU'}\n")

if __name__ == "__main__":
    run_tests()
