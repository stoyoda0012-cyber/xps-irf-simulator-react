"""
XPS IRF Simulator - Main simulation engine.
Generates simulated XPS spectra with instrumental response function effects.
"""

import numpy as np
from dataclasses import dataclass
from typing import Tuple
from scipy.ndimage import map_coordinates

from .physics import (
    fermi_dirac,
    skew_gaussian,
    convolve_gaussian,
    elliptical_gaussian_2d,
    numerical_gradient,
)


@dataclass
class SimulationParams:
    """Simulation parameters."""
    # X-ray source
    sigma_source: float = 20.0   # Source resolution (meV)
    sigma_spot: float = 2.0      # Spot width (mm)
    gamma_energy: float = 0.0    # Energy skewness
    gamma_spatial: float = 0.0   # Spatial skewness
    alpha: float = 0.0           # Energy gradient (eV/mm)

    # Detector
    kappa: float = 0.0           # Smile curvature
    theta: float = 0.0           # Detector tilt (degrees)
    sigma_detector: float = 10.0 # Detector resolution (meV)

    # Measurement
    temperature: float = 300.0   # Temperature (K)
    poisson_noise: float = 4.0   # Poisson noise level (log scale)
    gaussian_noise: float = 1.0  # Gaussian noise (%)


@dataclass
class SimulationResult:
    """Simulation result container."""
    energy: np.ndarray           # Energy axis (meV)
    spectrum: np.ndarray         # Observed spectrum (with noise)
    spectrum_clean: np.ndarray   # Clean spectrum (no noise)
    ideal_fd: np.ndarray         # Ideal Fermi-Dirac
    irf: np.ndarray              # Instrumental response function
    image_2d: np.ndarray         # 2D detector image
    spot_profile: np.ndarray     # 2D spot profile
    y_axis: np.ndarray           # Spatial axis (mm)
    sigma_combined: float        # Combined resolution (meV)


# Grid configuration
ENERGY_POINTS = 500
SPATIAL_POINTS = 200
ENERGY_RANGE = (-0.1, 0.1)      # eV (-100 to 100 meV)
SPATIAL_RANGE = (-10.0, 10.0)   # mm
EXTENDED_ENERGY_RANGE = (-0.15, 0.15)  # Extended range for convolution


def create_grids() -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Create energy and spatial grids."""
    # Extended energy grid for internal calculations
    energy_ext = np.linspace(EXTENDED_ENERGY_RANGE[0], EXTENDED_ENERGY_RANGE[1],
                             int(ENERGY_POINTS * 1.5))
    # Display energy grid
    energy = np.linspace(ENERGY_RANGE[0], ENERGY_RANGE[1], ENERGY_POINTS)
    # Spatial grid
    y_axis = np.linspace(SPATIAL_RANGE[0], SPATIAL_RANGE[1], SPATIAL_POINTS)

    return energy, energy_ext, y_axis, energy


def simulate(params: SimulationParams) -> SimulationResult:
    """
    Run XPS simulation with given parameters.

    Args:
        params: Simulation parameters

    Returns:
        SimulationResult with all computed arrays
    """
    # Create grids
    energy, energy_ext, y_axis, _ = create_grids()
    de = energy[1] - energy[0]  # Energy step
    dy = y_axis[1] - y_axis[0]  # Spatial step

    # Convert parameters to eV
    sigma_src_ev = params.sigma_source / 1000.0
    sigma_det_ev = params.sigma_detector / 1000.0
    sigma_combined = np.sqrt(sigma_src_ev**2 + sigma_det_ev**2) * 1000  # back to meV

    # Step 1: Ideal Fermi-Dirac distribution
    ideal_fd = fermi_dirac(energy, params.temperature)

    # Step 2: Generate 2D emission (energy × spatial)
    # Create meshgrid
    E, Y = np.meshgrid(energy_ext, y_axis, indexing='ij')

    # Apply energy gradient: shift spectrum by alpha * y
    image_2d = np.zeros((len(energy_ext), len(y_axis)))

    for j, y in enumerate(y_axis):
        # Energy shift due to gradient
        e_shifted = energy_ext - params.alpha * y
        # Fermi-Dirac at shifted energy
        fd_shifted = fermi_dirac(e_shifted, params.temperature)
        # Spatial distribution (skew Gaussian)
        spatial_weight = skew_gaussian(np.array([y]), params.sigma_spot, params.gamma_spatial)[0]
        image_2d[:, j] = fd_shifted * spatial_weight

    # Step 3: Generate spot profile for visualization
    E_spot, Y_spot = np.meshgrid(energy, y_axis, indexing='ij')
    spot_profile = elliptical_gaussian_2d(
        E_spot * 1000,  # Convert to meV for visualization
        Y_spot,
        sigma_src_ev * 1000,
        params.sigma_spot,
        params.gamma_energy,
        params.gamma_spatial
    )

    # Step 4: Apply detector distortions (smile + tilt)
    theta_rad = np.deg2rad(params.theta)
    cos_t, sin_t = np.cos(theta_rad), np.sin(theta_rad)

    # Distorted image coordinates
    distorted_image = np.zeros_like(image_2d)

    for i, e in enumerate(energy_ext):
        for j, y in enumerate(y_axis):
            # Rotation (tilt)
            e_rot = e * cos_t + (y / 100) * sin_t  # Scale y to similar magnitude
            y_rot = -e * sin_t + (y / 100) * cos_t

            # Smile curvature: parabolic distortion
            y_norm = y / SPATIAL_RANGE[1]  # Normalize to [-1, 1]
            e_curved = e_rot - params.kappa * y_norm**2 * 0.01  # Scale curvature effect

            # Find source coordinates (inverse mapping)
            # Simple nearest-neighbor for now
            e_idx = int((e_curved - EXTENDED_ENERGY_RANGE[0]) / de)
            if 0 <= e_idx < len(energy_ext):
                distorted_image[i, j] = image_2d[e_idx, j]

    # Step 5: Project to 1D spectrum (sum over spatial axis)
    spectrum_1d_ext = distorted_image.sum(axis=1)

    # Step 6: Apply resolution broadening (convolution)
    # Source resolution
    spectrum_1d_ext = convolve_gaussian(spectrum_1d_ext, sigma_src_ev, de)
    # Detector resolution
    spectrum_1d_ext = convolve_gaussian(spectrum_1d_ext, sigma_det_ev, de)

    # Interpolate to display grid
    spectrum_clean = np.interp(energy, energy_ext, spectrum_1d_ext)

    # Normalize
    if spectrum_clean.max() > 0:
        spectrum_clean = spectrum_clean / spectrum_clean.max()

    # Step 7: Add noise
    spectrum = add_noise(spectrum_clean.copy(), params.poisson_noise, params.gaussian_noise)

    # Step 8: Extract IRF (derivative of step response at T≈0)
    # Simulate with very low temperature
    step_params = SimulationParams(
        sigma_source=params.sigma_source,
        sigma_spot=params.sigma_spot,
        gamma_energy=params.gamma_energy,
        gamma_spatial=params.gamma_spatial,
        alpha=params.alpha,
        kappa=params.kappa,
        theta=params.theta,
        sigma_detector=params.sigma_detector,
        temperature=0.01,  # Near zero
        poisson_noise=10,  # Low noise
        gaussian_noise=0,
    )

    # For IRF, we need the step response (simplified calculation)
    step_fd = fermi_dirac(energy, 0.01)
    step_spectrum = convolve_gaussian(step_fd, sigma_src_ev, de)
    step_spectrum = convolve_gaussian(step_spectrum, sigma_det_ev, de)

    # IRF = -d(step)/dE
    irf = -numerical_gradient(step_spectrum, de)
    # Normalize IRF
    if irf.max() > 0:
        irf = irf / irf.max()

    # Prepare 2D detector image for display (interpolate to display grid)
    image_display = np.zeros((len(energy), len(y_axis)))
    for j in range(len(y_axis)):
        image_display[:, j] = np.interp(energy, energy_ext, distorted_image[:, j])

    return SimulationResult(
        energy=energy * 1000,  # Convert to meV for display
        spectrum=spectrum,
        spectrum_clean=spectrum_clean,
        ideal_fd=ideal_fd,
        irf=irf,
        image_2d=image_display,
        spot_profile=spot_profile,
        y_axis=y_axis,
        sigma_combined=sigma_combined,
    )


def add_noise(spectrum: np.ndarray, poisson_level: float, gaussian_level: float) -> np.ndarray:
    """
    Add Poisson and Gaussian noise to spectrum.

    Args:
        spectrum: Clean spectrum
        poisson_level: Poisson noise level (log scale, higher = less noise)
        gaussian_level: Gaussian noise level (%)

    Returns:
        Noisy spectrum
    """
    # Poisson noise (approximated with Gaussian for high counts)
    if poisson_level < 10:
        scale = 10 ** poisson_level
        # Poisson-like noise using normal approximation
        counts = spectrum * scale
        noise = np.random.normal(0, np.sqrt(np.maximum(counts, 1)))
        spectrum = (counts + noise) / scale

    # Gaussian noise
    if gaussian_level > 0:
        noise = np.random.normal(0, gaussian_level / 100, len(spectrum))
        spectrum = spectrum + noise

    return np.clip(spectrum, 0, None)
