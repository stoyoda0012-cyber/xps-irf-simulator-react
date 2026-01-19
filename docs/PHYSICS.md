# Physical Model Documentation

## Overview

This document describes the physical model implemented in the XPS IRF Simulator, based on the original xps_twin Python package.

## Coordinate System

The simulator uses a 2D coordinate system:

- **X-axis (Energy)**: Binding energy relative to Fermi level (meV)
- **Y-axis (Spatial)**: Position along the slit direction (mm)

## Core Physics

### 1. Fermi-Dirac Distribution

The ideal spectrum of a metal at the Fermi edge follows the Fermi-Dirac distribution:

```
f(E, T) = 1 / (1 + exp(E / kT))
```

Where:
- `E` = Energy relative to Fermi level (eV)
- `T` = Temperature (K)
- `k` = Boltzmann constant = 8.617 × 10⁻⁵ eV/K

At T = 0 K, this becomes a perfect step function. At finite temperatures, the edge is thermally broadened with a width of approximately 3.5 kT.

### 2. X-ray Source Model

#### 2.1 Energy Resolution (σ_source)

The X-ray source has an intrinsic energy spread, typically from:
- Natural linewidth of the X-ray emission line
- Monochromator bandwidth

This is modeled as a Gaussian broadening in the energy direction.

#### 2.2 Spatial Distribution (σ_Y)

The X-ray spot on the sample has a finite spatial extent, modeled as a Gaussian in the Y direction.

#### 2.3 Skewness (γ_E, γ_Y)

Real X-ray spots are often asymmetric. This is modeled using skew normal distributions:

```
g(x; σ, γ) = (2/σ) × φ(x/σ) × Φ(γ × x/σ)
```

Where:
- `φ(x)` = Standard normal PDF
- `Φ(x)` = Standard normal CDF
- `γ` = Skewness parameter (γ = 0 gives symmetric Gaussian)

#### 2.4 Energy Gradient (α)

The X-ray energy may vary across the spot due to monochromator geometry:

```
E_effective(y) = E - α × y
```

Where `α` is the energy gradient in eV/mm.

### 3. 2D Detector Model

#### 3.1 Smile Curvature (κ)

Hemispherical analyzers introduce a parabolic distortion ("smile"):

```
E_distorted = E - κ × (y/y_max)²
```

This causes iso-energy lines to appear curved on the detector.

#### 3.2 Detector Tilt (θ)

Slight misalignment of the detector introduces a linear coupling between energy and position:

```
E' = E × cos(θ) + y × sin(θ)
y' = -E × sin(θ) + y × cos(θ)
```

#### 3.3 Detector Resolution (σ_detector)

The 2D detector has intrinsic resolution from:
- Pixel size
- Electron optics aberrations
- Readout electronics

This is modeled as Gaussian broadening applied to the projected 1D spectrum.

### 4. Combined Resolution

The total instrumental response function is the convolution of all broadening contributions. For Gaussian broadening:

```
σ_total² = σ_source² + σ_detector² + σ_geometric²
```

Where `σ_geometric` includes contributions from smile, tilt, and energy gradient.

For the simplified case with only source and detector resolution:

```
σ_combined = √(σ_source² + σ_detector²)
```

## Simulation Pipeline

### Step 1: Generate Ideal Spectrum

Create Fermi-Dirac distribution on an extended energy grid:

```typescript
const idealFD = fermiDirac(gridExtended.eAxis, temperature);
```

### Step 2: Create 2D Emission

Project the spectrum through the X-ray spot spatial distribution:

```typescript
for (y in yAxis) {
  const shiftedEnergy = eAxis.map(e => e - alpha * y);
  const shiftedSpec = interp(shiftedEnergy, eAxis, idealFD);
  image2D[y] = shiftedSpec * yDistribution[y];
}
```

### Step 3: Apply Detector Distortion

Transform the 2D image through the detector geometry:

```typescript
for (i, j in grid) {
  const eSrc = e * cos(θ) + y * sin(θ);
  const ySrc = -e * sin(θ) + y * cos(θ);
  const eSrcCurved = eSrc - κ * (y/yMax)²;
  distortedImg[i][j] = bilinearInterp(image2D, ySrc, eSrcCurved);
}
```

### Step 4: Project to 1D

Sum along the spatial axis:

```typescript
spectrum1D[j] = Σᵢ distortedImg[i][j];
```

### Step 5: Apply Resolution Convolution

Convolve with Gaussian kernels for source and detector resolution:

```typescript
spectrum = convolve(spectrum, gaussianKernel(σ_source));
spectrum = convolve(spectrum, gaussianKernel(σ_detector));
```

### Step 6: Add Noise

Apply Poisson (shot) and Gaussian (readout) noise:

```typescript
spectrum_noisy[j] = poisson(spectrum[j] * scale) / scale + gaussian(0, σ_readout);
```

## IRF Extraction

The Instrumental Response Function is extracted by:

1. Simulate at very low temperature (T → 0) to get near-step function
2. Differentiate the observed spectrum
3. Normalize to unit area

```typescript
const stepFD = fermiDirac(eAxis, 0.01);  // Near-zero temperature
const stepSpectrum = simulate(stepFD, params);
const irf = -gradient(stepSpectrum);     // Negative for BE convention
```

## Units Convention

| Quantity | Internal | Display |
|----------|----------|---------|
| Energy | eV | meV |
| Source Resolution | eV | meV |
| Detector Resolution | eV | meV |
| Spatial Position | mm | mm |
| Temperature | K | K |
| Angles | radians | degrees |

## References

1. Hüfner, S. "Photoelectron Spectroscopy: Principles and Applications"
2. Original xps_twin package: https://github.com/stoyoda0012-cyber/XPSTwin_streamlit
