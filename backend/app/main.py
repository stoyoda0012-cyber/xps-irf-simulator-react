"""
Ultra-fast Spectrum Browser Backend

高速Voigt関数計算エンジン - ナノ秒レベルの計算を最大限に活かすバックエンド
"""

import math
import time
from typing import Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import numpy as np

app = FastAPI(
    title="Spectrum Browser API",
    description="Ultra-fast spectrum calculation for real-time browsing",
    version="1.0.0"
)

# CORS設定 - フロントエンド開発用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def voigt_pseudo(x: np.ndarray, center: float, sigma: float, gamma: float) -> np.ndarray:
    """
    Pseudo-Voigt近似 - 真のVoigtより10倍高速

    Voigt関数 = Gaussian ⊗ Lorentzian の高速近似
    η = gamma / (sigma + gamma) でミキシング比を計算
    """
    # 全幅半値(FWHM)の計算
    f_g = 2.0 * sigma * math.sqrt(2.0 * math.log(2.0))  # Gaussian FWHM
    f_l = 2.0 * gamma  # Lorentzian FWHM

    # Voigt FWHMの近似式 (Olivero & Longbothum, 1977)
    f_v = 0.5346 * f_l + math.sqrt(0.2166 * f_l**2 + f_g**2)

    # ミキシングパラメータ
    if f_v > 0:
        eta = 1.36603 * (f_l / f_v) - 0.47719 * (f_l / f_v)**2 + 0.11116 * (f_l / f_v)**3
    else:
        eta = 0.0

    eta = max(0.0, min(1.0, eta))

    # Gaussian成分
    if sigma > 0:
        gaussian = np.exp(-0.5 * ((x - center) / sigma)**2)
    else:
        gaussian = np.zeros_like(x)

    # Lorentzian成分
    if gamma > 0:
        lorentzian = 1.0 / (1.0 + ((x - center) / gamma)**2)
    else:
        lorentzian = np.zeros_like(x)

    # Pseudo-Voigt = η * Lorentzian + (1-η) * Gaussian
    return eta * lorentzian + (1 - eta) * gaussian


def generate_spectrum(
    x: np.ndarray,
    p1: float,  # シフトパラメータ (center offset)
    p2: float,  # 強度/幅パラメータ
    element_idx: int = 0
) -> np.ndarray:
    """
    単一元素のスペクトルを生成

    p1: ピーク位置のシフト (-1 to 1 → -50 to +50 eV)
    p2: ピーク幅と強度 (-1 to 1 → 広い/弱い から 狭い/強い)
    """
    # 元素ごとの基準ピーク位置（典型的なXPS結合エネルギー相対値）
    base_positions = [0.0, 100.0, 200.0, 350.0, 500.0]
    base_pos = base_positions[element_idx % len(base_positions)]

    # p1によるシフト（-50 to +50）
    center = base_pos + p1 * 50.0

    # p2による幅と強度の制御
    sigma = 5.0 + (1.0 - p2) * 10.0  # p2が大きいほど狭い
    gamma = 2.0 + (1.0 - p2) * 5.0   # p2が大きいほど狭い
    intensity = 0.5 + p2 * 0.5       # p2が大きいほど強い

    # メインピーク
    spectrum = intensity * voigt_pseudo(x, center, sigma, gamma)

    # サテライトピーク（元素による特徴）
    satellite_offset = 20.0 + element_idx * 5.0
    satellite_intensity = 0.3 * intensity
    spectrum += satellite_intensity * voigt_pseudo(x, center + satellite_offset, sigma * 1.5, gamma * 1.5)

    # バックグラウンド（Shirley-like）
    spectrum += 0.05 * (1.0 - np.exp(-0.01 * (x - center + 100)))

    return spectrum


@app.get("/calc")
async def calculate_spectra(
    p1: float = Query(0.0, ge=-1.0, le=1.0, description="Shift parameter"),
    p2: float = Query(0.0, ge=-1.0, le=1.0, description="Intensity/width parameter"),
    n_points: int = Query(100, ge=10, le=2000, description="Points per spectrum"),
    n_spectra: int = Query(1, ge=1, le=20, description="Number of spectra per element"),
    n_elements: int = Query(1, ge=1, le=10, description="Number of elements")
):
    """
    高速スペクトル計算エンドポイント

    合計データ点数 = n_points × n_spectra × n_elements
    """
    start_time = time.perf_counter_ns()

    # エネルギー軸の生成
    x = np.linspace(-100, 600, n_points)

    # 全スペクトルを1次元配列として格納
    total_points = n_points * n_spectra * n_elements
    y_flat = np.zeros(total_points, dtype=np.float64)

    idx = 0
    for elem in range(n_elements):
        for spec in range(n_spectra):
            # スペクトラムごとに微小な変動を追加
            p1_var = p1 + 0.02 * (spec - n_spectra / 2)
            p2_var = p2 + 0.01 * (spec - n_spectra / 2)

            spectrum = generate_spectrum(x, p1_var, p2_var, elem)
            y_flat[idx:idx + n_points] = spectrum
            idx += n_points

    calc_time_ns = time.perf_counter_ns() - start_time

    # JSON化
    y_list = y_flat.tolist()
    x_list = x.tolist()

    return JSONResponse(content={
        "x": x_list,
        "y": y_list,
        "metadata": {
            "n_points": n_points,
            "n_spectra": n_spectra,
            "n_elements": n_elements,
            "total_size": total_points,
            "calc_time_ns": calc_time_ns,
            "calc_time_ms": calc_time_ns / 1_000_000,
            "p1": p1,
            "p2": p2
        }
    })


@app.get("/health")
async def health_check():
    """ヘルスチェック用エンドポイント"""
    return {"status": "ok", "message": "Spectrum Browser API is running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
