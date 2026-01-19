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

## Quick Start

```bash
# Clone and install
cd xps-irf-simulator-react
npm install

# Development
npm run dev

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

## Acknowledgments

- Original Streamlit implementation: [XPSTwin_streamlit](https://github.com/stoyoda0012-cyber/XPSTwin_streamlit)
- Built with Claude Code (Anthropic)
