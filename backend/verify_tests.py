"""
Geriye Donuk Uyumluluk Sarmalayicisi (Wrapper)
Bu script, projenin ana dizinindeki 'verify_tests.py' scriptini calistirir.
"""
import os
import sys
import runpy

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_VERIFY = os.path.join(ROOT_DIR, "verify_tests.py")

if os.path.exists(ROOT_VERIFY):
    sys.argv[0] = ROOT_VERIFY
    runpy.run_path(ROOT_VERIFY, run_name="__main__")
else:
    print(f"[!] HATA: Ana dizindeki test scripti bulunamadi: {ROOT_VERIFY}")
    sys.exit(1)
