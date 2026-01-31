"""
XPS IRF Simulator - FastAPI + htmx version.
Real-time X-ray Photoelectron Spectroscopy simulation.
"""

import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .simulator import SimulationParams, simulate

# Initialize FastAPI app
app = FastAPI(
    title="XPS IRF Simulator",
    description="Real-time XPS Instrumental Response Function Simulator",
    version="1.0.0",
)

# Setup paths
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "app" / "templates"

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Setup Jinja2 templates
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


# Default parameters
DEFAULT_PARAMS = SimulationParams()


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Main page with full UI."""
    # Run initial simulation
    result = simulate(DEFAULT_PARAMS)

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "params": DEFAULT_PARAMS,
            "result": result,
            "chart_data": _prepare_chart_data(result),
        },
    )


@app.post("/simulate", response_class=HTMLResponse)
async def run_simulation(
    request: Request,
    sigma_source: float = Form(20.0),
    sigma_spot: float = Form(2.0),
    gamma_energy: float = Form(0.0),
    gamma_spatial: float = Form(0.0),
    alpha: float = Form(0.0),
    kappa: float = Form(0.0),
    theta: float = Form(0.0),
    sigma_detector: float = Form(10.0),
    temperature: float = Form(300.0),
    poisson_noise: float = Form(4.0),
    gaussian_noise: float = Form(1.0),
):
    """
    Run simulation with updated parameters.
    Returns partial HTML for htmx to swap.
    """
    params = SimulationParams(
        sigma_source=sigma_source,
        sigma_spot=sigma_spot,
        gamma_energy=gamma_energy,
        gamma_spatial=gamma_spatial,
        alpha=alpha,
        kappa=kappa,
        theta=theta,
        sigma_detector=sigma_detector,
        temperature=temperature,
        poisson_noise=poisson_noise,
        gaussian_noise=gaussian_noise,
    )

    result = simulate(params)

    return templates.TemplateResponse(
        "partials/charts.html",
        {
            "request": request,
            "params": params,
            "result": result,
            "chart_data": _prepare_chart_data(result),
        },
    )


@app.get("/api/simulate")
async def api_simulate(
    sigma_source: float = 20.0,
    sigma_spot: float = 2.0,
    gamma_energy: float = 0.0,
    gamma_spatial: float = 0.0,
    alpha: float = 0.0,
    kappa: float = 0.0,
    theta: float = 0.0,
    sigma_detector: float = 10.0,
    temperature: float = 300.0,
    poisson_noise: float = 4.0,
    gaussian_noise: float = 1.0,
):
    """
    JSON API endpoint for simulation.
    Useful for programmatic access or JavaScript clients.
    """
    params = SimulationParams(
        sigma_source=sigma_source,
        sigma_spot=sigma_spot,
        gamma_energy=gamma_energy,
        gamma_spatial=gamma_spatial,
        alpha=alpha,
        kappa=kappa,
        theta=theta,
        sigma_detector=sigma_detector,
        temperature=temperature,
        poisson_noise=poisson_noise,
        gaussian_noise=gaussian_noise,
    )

    result = simulate(params)

    return {
        "energy": result.energy.tolist(),
        "spectrum": result.spectrum.tolist(),
        "spectrum_clean": result.spectrum_clean.tolist(),
        "ideal_fd": result.ideal_fd.tolist(),
        "irf": result.irf.tolist(),
        "sigma_combined": result.sigma_combined,
        "y_axis": result.y_axis.tolist(),
        "image_2d": result.image_2d.tolist(),
        "spot_profile": result.spot_profile.tolist(),
    }


def _prepare_chart_data(result) -> dict:
    """Prepare chart data as JSON for JavaScript."""
    # Downsample for better performance
    step = 2
    return {
        "energy": result.energy[::step].tolist(),
        "spectrum": result.spectrum[::step].tolist(),
        "spectrum_clean": result.spectrum_clean[::step].tolist(),
        "ideal_fd": result.ideal_fd[::step].tolist(),
        "irf": result.irf[::step].tolist(),
        "sigma_source": result.sigma_combined - 10,  # Approximate
        "sigma_detector": 10,  # Default
        "sigma_combined": result.sigma_combined,
    }


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}
