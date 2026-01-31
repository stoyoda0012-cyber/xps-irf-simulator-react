"""
Physics calculations for XPS IRF Simulator.
Uses NumPy/SciPy for efficient vectorized operations.
"""

import numpy as np
from scipy.special import erf
from scipy.ndimage import convolve1d


# Physical constants
BOLTZMANN_EV = 8.617333262e-5  # eV/K


def fermi_dirac(energy: np.ndarray, temperature: float, e_fermi: float = 0.0) -> np.ndarray:
    """
    Fermi-Dirac distribution function.

    Args:
        energy: Energy array in eV
        temperature: Temperature in Kelvin
        e_fermi: Fermi level position in eV

    Returns:
        Occupation probability array
    """
    if temperature < 0.01:
        # Step function limit for very low temperature
        return np.where(energy < e_fermi, 1.0, 0.0)

    kT = BOLTZMANN_EV * temperature
    x = (energy - e_fermi) / kT
    # Clip to avoid overflow
    x = np.clip(x, -500, 500)
    return 1.0 / (1.0 + np.exp(x))


def skew_gaussian(x: np.ndarray, sigma: float, gamma: float = 0.0) -> np.ndarray:
    """
    Skew Gaussian distribution (1D).

    Args:
        x: Position array
        sigma: Standard deviation
        gamma: Skewness parameter (0 = symmetric)

    Returns:
        Probability density array
    """
    if sigma <= 0:
        sigma = 1e-10

    # Standard Gaussian
    gaussian = np.exp(-0.5 * (x / sigma) ** 2) / (sigma * np.sqrt(2 * np.pi))

    # Skew factor using error function
    skew_factor = 1.0 + erf(gamma * x / (sigma * np.sqrt(2)))

    return gaussian * skew_factor


def gaussian_kernel(sigma: float, dx: float) -> np.ndarray:
    """
    Create normalized Gaussian kernel for convolution.

    Args:
        sigma: Standard deviation in same units as dx
        dx: Grid spacing

    Returns:
        Normalized kernel array
    """
    if sigma <= 0:
        return np.array([1.0])

    # Kernel half-width: 5 sigma
    half_width = int(np.ceil(5 * sigma / dx))
    if half_width < 1:
        return np.array([1.0])

    x = np.arange(-half_width, half_width + 1) * dx
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    return kernel / kernel.sum()


def convolve_gaussian(signal: np.ndarray, sigma: float, dx: float) -> np.ndarray:
    """
    Convolve signal with Gaussian kernel.

    Args:
        signal: Input signal array
        sigma: Gaussian width
        dx: Grid spacing

    Returns:
        Convolved signal
    """
    kernel = gaussian_kernel(sigma, dx)
    if len(kernel) == 1:
        return signal
    return convolve1d(signal, kernel, mode='nearest')


def elliptical_gaussian_2d(
    x: np.ndarray,
    y: np.ndarray,
    sigma_x: float,
    sigma_y: float,
    gamma_x: float = 0.0,
    gamma_y: float = 0.0
) -> np.ndarray:
    """
    2D elliptical Gaussian with skewness.

    Args:
        x, y: 2D coordinate meshgrids
        sigma_x, sigma_y: Standard deviations
        gamma_x, gamma_y: Skewness parameters

    Returns:
        2D probability density array
    """
    # Separable skew Gaussians
    gx = skew_gaussian(x, sigma_x, gamma_x)
    gy = skew_gaussian(y, sigma_y, gamma_y)

    result = gx * gy

    # Normalize
    total = result.sum()
    if total > 0:
        result /= total

    return result


def numerical_gradient(y: np.ndarray, dx: float) -> np.ndarray:
    """
    Numerical gradient using central differences.

    Args:
        y: Input array
        dx: Grid spacing

    Returns:
        Gradient array (same length as input)
    """
    return np.gradient(y, dx)


def interp1d_simple(x_new: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """
    Simple linear interpolation.

    Args:
        x_new: New x coordinates
        x: Original x coordinates (must be sorted)
        y: Original y values

    Returns:
        Interpolated y values at x_new
    """
    return np.interp(x_new, x, y)
