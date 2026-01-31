/**
 * XPS IRF Simulator - Chart rendering with Chart.js
 * Using JSON API instead of htmx for chart updates
 */

// Chart instances
let spectrumChart = null;
let irfChart = null;

// Color palette
const colors = {
    observed: 'rgba(239, 68, 68, 1)',      // Red
    clean: 'rgba(59, 130, 246, 0.6)',       // Blue
    ideal: 'rgba(148, 163, 184, 0.8)',      // Gray
    irf: 'rgba(34, 197, 94, 1)',            // Green
    grid: 'rgba(71, 85, 105, 0.3)',
    text: 'rgba(148, 163, 184, 1)',
};

// Chart.js default configuration
Chart.defaults.color = colors.text;
Chart.defaults.borderColor = colors.grid;

// Debounce timer
let updateTimer = null;

/**
 * Convert parallel arrays to {x, y} point array
 */
function toPointArray(xArr, yArr) {
    return xArr.map((x, i) => ({ x: x, y: yArr[i] }));
}

/**
 * Get current parameters from form
 */
function getParams() {
    return {
        sigma_source: parseFloat(document.getElementById('sigma_source').value),
        sigma_spot: parseFloat(document.getElementById('sigma_spot').value),
        gamma_energy: parseFloat(document.getElementById('gamma_energy').value),
        gamma_spatial: parseFloat(document.getElementById('gamma_spatial').value),
        alpha: parseFloat(document.getElementById('alpha').value),
        kappa: parseFloat(document.getElementById('kappa').value),
        theta: parseFloat(document.getElementById('theta').value),
        sigma_detector: parseFloat(document.getElementById('sigma_detector').value),
        temperature: parseFloat(document.getElementById('temperature').value),
        poisson_noise: parseFloat(document.getElementById('poisson_noise').value),
        gaussian_noise: parseFloat(document.getElementById('gaussian_noise').value),
    };
}

/**
 * Fetch simulation data from API and update charts
 */
async function fetchAndUpdateCharts() {
    const params = getParams();
    const queryString = new URLSearchParams(params).toString();

    try {
        const response = await fetch(`/api/simulate?${queryString}`);
        const data = await response.json();

        // Update charts
        updateSpectrumChart(data);
        updateIRFChart(data);

        // Update resolution summary
        document.getElementById('res_source').textContent = params.sigma_source + ' meV';
        document.getElementById('res_detector').textContent = params.sigma_detector + ' meV';
        document.getElementById('res_combined').textContent = data.sigma_combined.toFixed(1) + ' meV';

    } catch (error) {
        console.error('Error fetching simulation:', error);
    }
}

/**
 * Debounced update - wait 50ms after last input
 */
function scheduleUpdate() {
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
    updateTimer = setTimeout(fetchAndUpdateCharts, 50);
}

/**
 * Initialize charts on page load
 */
function initCharts() {
    const chartDataEl = document.getElementById('chart-data');
    if (chartDataEl) {
        const data = JSON.parse(chartDataEl.textContent);
        createSpectrumChart(data);
        createIRFChart(data);
        createHeatmaps();
    }

    // Setup slider event listeners
    setupSliderListeners();
}

/**
 * Setup event listeners for all sliders
 */
function setupSliderListeners() {
    const form = document.getElementById('params-form');
    if (form) {
        const sliders = form.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => {
            slider.addEventListener('input', scheduleUpdate);
        });
    }
}

/**
 * Create spectrum chart
 */
function createSpectrumChart(data) {
    const ctx = document.getElementById('spectrum-chart');
    if (!ctx) return;

    spectrumChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Observed (with noise)',
                    data: toPointArray(data.energy, data.spectrum),
                    borderColor: colors.observed,
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.1,
                },
                {
                    label: 'Clean',
                    data: toPointArray(data.energy, data.spectrum_clean),
                    borderColor: colors.clean,
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.1,
                },
                {
                    label: 'Ideal Fermi-Dirac',
                    data: toPointArray(data.energy, data.ideal_fd),
                    borderColor: colors.ideal,
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0,
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 20,
                        padding: 10,
                        font: { size: 11 },
                    },
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleFont: { size: 11 },
                    bodyFont: { size: 11 },
                },
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Energy (meV)',
                        font: { size: 11 },
                    },
                    grid: { color: colors.grid },
                    ticks: {
                        font: { size: 10 },
                        stepSize: 20,
                    },
                    min: -100,
                    max: 100,
                },
                y: {
                    title: {
                        display: true,
                        text: 'Intensity (a.u.)',
                        font: { size: 11 },
                    },
                    grid: { color: colors.grid },
                    ticks: { font: { size: 10 } },
                    min: -0.1,
                    max: 1.2,
                },
            },
        },
    });
}

/**
 * Update spectrum chart with new data
 */
function updateSpectrumChart(data) {
    if (!spectrumChart) {
        createSpectrumChart(data);
        return;
    }

    spectrumChart.data.datasets[0].data = toPointArray(data.energy, data.spectrum);
    spectrumChart.data.datasets[1].data = toPointArray(data.energy, data.spectrum_clean);
    spectrumChart.data.datasets[2].data = toPointArray(data.energy, data.ideal_fd);
    spectrumChart.update('none');
}

/**
 * Create IRF chart
 */
function createIRFChart(data) {
    const ctx = document.getElementById('irf-chart');
    if (!ctx) return;

    irfChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'IRF',
                    data: toPointArray(data.energy, data.irf),
                    borderColor: colors.irf,
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                },
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Energy (meV)',
                        font: { size: 11 },
                    },
                    grid: { color: colors.grid },
                    ticks: {
                        font: { size: 10 },
                        stepSize: 20,
                    },
                    min: -100,
                    max: 100,
                },
                y: {
                    title: {
                        display: true,
                        text: 'IRF Intensity',
                        font: { size: 11 },
                    },
                    grid: { color: colors.grid },
                    ticks: { font: { size: 10 } },
                    min: -0.1,
                    max: 1.2,
                },
            },
        },
    });
}

/**
 * Update IRF chart with new data
 */
function updateIRFChart(data) {
    if (!irfChart) {
        createIRFChart(data);
        return;
    }

    irfChart.data.datasets[0].data = toPointArray(data.energy, data.irf);
    irfChart.update('none');
}

/**
 * Create heatmaps
 */
function createHeatmaps() {
    const spotCanvas = document.getElementById('spot-heatmap');
    if (spotCanvas) {
        drawPlaceholderHeatmap(spotCanvas, 'hot');
    }

    const detectorCanvas = document.getElementById('detector-heatmap');
    if (detectorCanvas) {
        drawPlaceholderHeatmap(detectorCanvas, 'viridis');
    }
}

/**
 * Draw a placeholder heatmap with gradient
 */
function drawPlaceholderHeatmap(canvas, colormap) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth - 16;
    const height = canvas.height = canvas.parentElement.clientHeight - 16;

    const centerX = width / 2;
    const centerY = height / 2;
    const sigmaX = width / 4;
    const sigmaY = height / 4;

    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const value = Math.exp(-(dx*dx)/(2*sigmaX*sigmaX) - (dy*dy)/(2*sigmaY*sigmaY));

            const color = getColorFromValue(value, colormap);
            const idx = (y * width + x) * 4;
            imageData.data[idx] = color[0];
            imageData.data[idx + 1] = color[1];
            imageData.data[idx + 2] = color[2];
            imageData.data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    ctx.fillStyle = colors.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Energy (meV)', width / 2, height - 5);

    ctx.save();
    ctx.translate(12, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Position (mm)', 0, 0);
    ctx.restore();
}

/**
 * Get color from value using colormap
 */
function getColorFromValue(value, colormap) {
    value = Math.max(0, Math.min(1, value));

    if (colormap === 'hot') {
        if (value < 0.33) {
            const t = value / 0.33;
            return [Math.floor(255 * t), 0, 0];
        } else if (value < 0.66) {
            const t = (value - 0.33) / 0.33;
            return [255, Math.floor(255 * t), 0];
        } else {
            const t = (value - 0.66) / 0.34;
            return [255, 255, Math.floor(255 * t)];
        }
    } else {
        const r = Math.floor(68 + value * (253 - 68));
        const g = Math.floor(1 + value * (231 - 1));
        const b = Math.floor(84 + value * (37 - 84));
        return [r, g, b];
    }
}

// Initialize charts when DOM is ready
document.addEventListener('DOMContentLoaded', initCharts);
