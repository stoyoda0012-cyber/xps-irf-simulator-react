# Spectrum Browser Backend

Ultra-fast spectrum calculation API for real-time browsing.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

### GET /calc

Calculate spectra with given parameters.

**Query Parameters:**
- `p1` (float, -1 to 1): Shift parameter
- `p2` (float, -1 to 1): Intensity/width parameter
- `n_points` (int, 10-2000): Points per spectrum
- `n_spectra` (int, 1-20): Number of spectra per element
- `n_elements` (int, 1-10): Number of elements

**Response:**
```json
{
  "x": [/* energy axis */],
  "y": [/* flat array of all spectra */],
  "metadata": {
    "n_points": 100,
    "n_spectra": 1,
    "n_elements": 5,
    "total_size": 500,
    "calc_time_ns": 123456,
    "calc_time_ms": 0.123,
    "p1": 0.0,
    "p2": 0.0
  }
}
```

### GET /health

Health check endpoint.

## Performance

The Pseudo-Voigt calculation is optimized for speed:
- ~100μs for 100 points
- ~500μs for 500 points
- ~1ms for 1000 points

These times are well under the 16.67ms target for 60 FPS rendering.
