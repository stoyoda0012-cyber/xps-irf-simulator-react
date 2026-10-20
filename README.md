# XPS IRF Simulator & Resolution Explorer (React)

Real-time XPS (X-ray Photoelectron Spectroscopy) IRF Simulator with interactive parameter control.

## Overview

This is the React-based reimplementation of the [Streamlit XPS IRF Simulator](https://github.com/stoyoda0012-cyber/XPSTwin_streamlit), designed for smoother real-time interactivity with slider-based parameter adjustment.

### Key Improvements from Streamlit Version

| Feature | Streamlit | React |
|---------|-----------|-------|
| **Interactivity** | Updates on slider release | Real-time updates during drag |
| **Chart Rendering** | SVG-based (Matplotlib) | Canvas-based (uPlot) |
| **Performance** | ~500ms per update | ~16ms per update (60 FPS) |
| **Resolution Model** | Detector-only | Source + Detector (combined) |
| **Parameter Names** | Generic (Spot Size X/Y) | Physics-based (Source Resolution, Detector Resolution) |

## Features

- **Real-time Simulation**: Instant visual feedback as you adjust parameters
- **Canvas-based Rendering**: High-performance uPlot charts for smooth 60 FPS updates
- **Combined Resolution Model**: Proper convolution of source and detector resolutions
- **Bilingual UI**: English / Japanese language toggle
- **Compact Design**: All controls and visualizations visible without scrolling
- **Fermi-edge fit of measured data** ("Fit measured data" tab, or `#fit` in the URL): see below

## Fit measured data

Drop a spectrum (CSV / TSV / TXT with energy and intensity columns, Scienta SES `.txt` or
`.pxt`, Igor `.ibw`, VAMAS `.vms`), paste columns, or try the built-in synthetic Au edge.
Angle and sweep dimensions of SES data are summed. Files are read in the browser; nothing
is uploaded.

1. **Energy axis**: unit (eV / meV) and axis (binding energy, kinetic energy, E − E_F) are
   read from the header when it says so, otherwise guessed (the occupied side is the
   brighter one) and can be changed.
2. **Fit window**: automatic (±1.2 eV around the edge, found from the empty side so the
   Au 5d rise is not mistaken for it), typed in, or dragged on the plot.
3. **Model** (same as `toyomacro.fitting.fermi_edge`, `dos_form='occupied'`):
   `I = A·[(1 + c1·max(E_F − E, 0))·f(E; E_F, T)] ⊗ G(FWHM) + background`, with flat or
   linear DOS, constant or linear background, temperature fixed or fitted, and Poisson
   weights (switched on automatically for integer counts).

The fit reruns automatically on every change and shows data, fit, background, residuals,
E_F (with the calibration shift), Gaussian FWHM and σ, temperature, 10–90 % width,
reduced χ² and 1σ statistical errors, plus warnings when a result should not be trusted
(parameter at a bound, E_F undetermined, inverted edge = wrong axis direction, T and
resolution degenerate). Results can be copied or saved as CSV.

The simulator's own "Fit: Fermi edge & IRF" panel uses the same engine and can send the
simulated spectrum to this view.

## Quick Start

```bash
# Clone and install
cd xps-irf-simulator-react
npm install

# Development
npm run dev

# Tests (fit engine and file import)
npm test

# Production build
npm run build
npm run preview
```

## Physical Model

### Instrumental Response Function (IRF)

The total IRF is the convolution of source and detector contributions:

```
IRF_total = IRF_source ⊗ IRF_detector
```

For Gaussian broadening, the combined resolution is:

```
σ_combined = √(σ_source² + σ_detector²)
```

### Parameters

#### X-ray Source

| Parameter | Symbol | Description | Unit |
|-----------|--------|-------------|------|
| Source Resolution | σ_src | Intrinsic energy resolution of X-ray source | meV |
| Spot Width | σ_Y | Spatial width of X-ray spot on sample | mm |
| Energy Skew | γ_E | Asymmetry of source energy distribution | - |
| Spatial Skew | γ_Y | Asymmetry of spot spatial distribution | - |
| Energy Gradient | α | Energy variation across spot (dE/dy) | eV/mm |

#### 2D Detector

| Parameter | Symbol | Description | Unit |
|-----------|--------|-------------|------|
| Smile Curvature | κ | Parabolic distortion from analyzer aberration | - |
| Detector Tilt | θ | Misalignment of detector mounting angle | ° |
| Detector Resolution | σ_det | Intrinsic resolution of 2D detector | meV |

#### Measurement

| Parameter | Description | Unit |
|-----------|-------------|------|
| Temperature | Sample temperature for Fermi-Dirac distribution | K |
| Poisson Noise | Photon counting statistical noise (log scale) | - |
| Gaussian Noise | Detector readout noise | % |

### Simulation Pipeline

1. **Fermi-Dirac Distribution**: Generate ideal step function at given temperature
2. **2D Emission**: Project spectrum through X-ray spot spatial distribution
3. **Detector Distortion**: Apply smile curvature and tilt transformation
4. **Resolution Convolution**: Convolve with source and detector Gaussian kernels
5. **1D Projection**: Sum along spatial axis to get observed spectrum
6. **Noise Addition**: Apply Poisson and Gaussian noise

## Project Structure

```
xps-irf-simulator-react/
├── src/
│   ├── App.tsx                  # Main application component
│   ├── App.css                  # Global styles
│   ├── components/
│   │   ├── Slider.tsx           # Parameter slider component
│   │   ├── HeatMap.tsx          # Canvas-based 2D heatmap
│   │   └── SpectrumChartCanvas.tsx  # uPlot-based 1D charts
│   ├── lib/
│   │   ├── simulator.ts         # Main simulation engine
│   │   └── physics.ts           # Physics calculations
│   └── i18n/
│       └── translations.ts      # EN/JA translations
├── package.json
├── vite.config.ts
└── README.md
```

## Technical Details

### Simulation Engine (`src/lib/simulator.ts`)

- **Extended Grid Calculation**: Uses wider range (-150 to +150 meV) internally to avoid edge artifacts
- **Display Range**: -100 to +100 meV
- **Grid Points**: 500 (energy) × 200 (spatial)
- **Downsampling**: Charts display 200 points for optimal performance

### Physics (`src/lib/physics.ts`)

- **Fermi-Dirac**: `f(E) = 1 / (1 + exp(E / kT))`
- **Skew Gaussian**: Asymmetric Gaussian using error function
- **Convolution**: FFT-based Gaussian convolution
- **2D Elliptical Gaussian**: For spot profile visualization

### Performance Optimizations

1. **Canvas Rendering**: uPlot instead of SVG-based Recharts
2. **Memoization**: `useMemo` for simulation results
3. **Efficient Updates**: Only re-render changed components
4. **Data Downsampling**: 200-point display for smooth interaction

## Migration Notes (from Streamlit)

### Parameter Naming Changes

| Streamlit | React | Reason |
|-----------|-------|--------|
| Spot Size X (σ_x) | Source Resolution (σ) | Clarifies it's energy resolution, not spatial |
| Spot Size Y (σ_y) | Spot Width | Physical spatial extent of X-ray spot |
| Intrinsic Resolution (σ) | Detector Resolution (σ) | Specifies it's detector-specific |
| Spot Skew X (γ_x) | Energy Skew (γ) | Skewness in energy direction |
| Spot Skew Y (γ_y) | Spatial Skew (γ) | Skewness in spatial direction |

### Physical Model Changes

1. **Source Resolution in Spectrum**: Now properly convolves source resolution into the spectrum calculation (previously only affected 2D Spot Profile display)
2. **Combined Resolution Display**: Shows real-time calculation of σ_combined = √(σ_src² + σ_det²)

## Dependencies

- React 19
- TypeScript 5
- Vite 7
- uPlot (Canvas-based charts)

## Author

Satoshi Toyoda

## License

MIT License

---

## Spectrum Browser (New!)

An ultra-fast spectrum browsing interface for real-time parameter exploration.

### Features

- **XY Pad Controller**: 2D parameter space exploration via mouse/touch
- **60 FPS Rendering**: Canvas-based uPlot charts
- **Request Optimization**: Throttling + AbortController for smooth interaction
- **Performance Monitor**: Real-time RTT, throughput, and optimization stats

### Architecture

```
┌─────────────────┐     HTTP/JSON      ┌─────────────────┐
│  React Frontend │◄──────────────────►│  FastAPI Backend │
│                 │                    │                  │
│  - XY Pad       │   AbortController  │  - Pseudo-Voigt  │
│  - uPlot        │   + Throttling     │  - NumPy         │
│  - Perf Monitor │                    │  - ~100μs calc   │
└─────────────────┘                    └─────────────────┘
```

### Quick Start

```bash
# Terminal 1: Start backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2: Start frontend
npm install
npm run dev:browser
```

### Optimization Techniques

1. **Throttling** (16ms): Limits request frequency to 60 req/s max
2. **AbortController**: Cancels in-flight requests when new ones are sent
3. **requestAnimationFrame**: Syncs rendering to display refresh
4. **Flat Array Transfer**: Minimizes JSON parsing overhead

### Performance Targets

| Data Size | Target RTT | Status |
|-----------|-----------|--------|
| 100 pts × 1 element | < 16ms | 60 FPS |
| 1000 pts × 5 elements | < 33ms | 30 FPS |
| 2000 pts × 10 elements | < 50ms | 20 FPS |

---

## Acknowledgments

- Original Streamlit implementation: [XPSTwin_streamlit](https://github.com/stoyoda0012-cyber/XPSTwin_streamlit)
- Built with Claude Code (Anthropic)
