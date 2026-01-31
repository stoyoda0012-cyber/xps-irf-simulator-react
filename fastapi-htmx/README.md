# XPS IRF Simulator - FastAPI + htmx Version

Real-time X-ray Photoelectron Spectroscopy (XPS) Instrumental Response Function (IRF) simulator built with **FastAPI** and **htmx**.

## Overview

This is a Python-native reimplementation of the [React version](../xps-irf-simulator-react), designed to leverage Python's scientific computing ecosystem directly.

### Key Features

- **Real-time simulation** with htmx partial updates
- **Python backend** using NumPy/SciPy for physics calculations
- **No JavaScript build step** required
- **Server-side rendering** with Jinja2 templates
- **JSON API** for programmatic access

## Architecture Comparison

| Aspect | React Version | FastAPI + htmx Version |
|--------|--------------|------------------------|
| Rendering | Client-side (SPA) | Server-side (HTML fragments) |
| Physics | TypeScript (~650 lines) | Python/NumPy (~200 lines) |
| State | Browser (useState) | Server (per-request) |
| Bundle Size | ~300KB+ | ~14KB (htmx only) |
| Python Integration | None | Native |

## Advantages of FastAPI + htmx

1. **Direct NumPy/SciPy integration** - No need to reimplement physics in JavaScript
2. **Simpler deployment** - Single Python process, no Node.js required
3. **Easy ML/AI integration** - Add PyTorch, scikit-learn, etc. directly
4. **Progressive enhancement** - Works without JavaScript (basic functionality)
5. **Lower complexity** - No webpack, no transpilation, no virtual DOM

## Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Running the Application

### Development
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Production
```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

Then open http://localhost:8000 in your browser.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main UI page |
| `/simulate` | POST | htmx endpoint (returns HTML fragment) |
| `/api/simulate` | GET | JSON API for programmatic access |
| `/health` | GET | Health check |

### JSON API Example

```bash
curl "http://localhost:8000/api/simulate?sigma_source=25&temperature=100"
```

Response:
```json
{
  "energy": [-100, -99.6, ...],
  "spectrum": [0.98, 0.97, ...],
  "spectrum_clean": [0.99, 0.98, ...],
  "ideal_fd": [1.0, 1.0, ...],
  "irf": [0.01, 0.02, ...],
  "sigma_combined": 26.93
}
```

## Project Structure

```
xps-irf-simulator-fastapi/
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI application
│   ├── simulator.py      # Simulation engine
│   ├── physics.py        # NumPy/SciPy physics functions
│   └── templates/
│       ├── index.html    # Main page template
│       └── partials/
│           └── charts.html  # htmx partial for chart updates
├── static/
│   ├── css/
│   │   └── style.css     # Dark theme styles
│   └── js/
│       └── charts.js     # Chart.js visualization
├── requirements.txt
└── README.md
```

## How htmx Works

htmx enables reactive updates without a full JavaScript framework:

```html
<!-- Form triggers simulation on slider change -->
<form hx-post="/simulate"
      hx-target="#charts-container"
      hx-trigger="input delay:100ms from:input[type='range']">
    <input type="range" name="sigma_source" ...>
</form>

<!-- Server returns HTML fragment, htmx swaps it in -->
<div id="charts-container">
    <!-- Updated charts appear here -->
</div>
```

## Extending with Python Libraries

### Adding Machine Learning

```python
# In main.py
import torch
from transformers import AutoModel

@app.post("/api/predict")
async def predict_spectrum(data: SpectrumInput):
    result = ml_model(data.spectrum)
    return {"prediction": result}
```

### Adding Data Export

```python
import pandas as pd

@app.get("/api/export")
async def export_data(format: str = "csv"):
    result = simulate(params)
    df = pd.DataFrame({
        "energy": result.energy,
        "spectrum": result.spectrum,
    })
    return df.to_csv() if format == "csv" else df.to_json()
```

## Performance Notes

- **htmx throttling**: 100ms delay on slider input prevents excessive requests
- **Server-side caching**: Could add Redis/memcached for expensive calculations
- **WebSocket option**: For true real-time updates, add WebSocket endpoint

## License

MIT License
