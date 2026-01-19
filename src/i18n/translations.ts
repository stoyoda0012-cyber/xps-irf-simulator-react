export type Language = 'en' | 'ja';

export const translations = {
  // Main title
  title: {
    en: 'XPS IRF Simulator & Resolution Explorer',
    ja: 'XPS IRF シミュレータ & 分解能エクスプローラ',
  },
  subtitle: {
    en: 'Parametrize geometric distortions of instruments and visualize IRF asymmetry.',
    ja: '装置の幾何学的歪みをパラメタライズし、IRFの非対称性を可視化します。',
  },

  // Sections
  xraySource: {
    en: 'X-ray Source',
    ja: 'X線源',
  },
  detector: {
    en: '2D Detector',
    ja: '2D検出器',
  },
  noise: {
    en: 'Detector Noise',
    ja: '検出器ノイズ',
  },
  measurement: {
    en: 'Measurement',
    ja: '測定条件',
  },

  // Slider labels
  sourceResolution: {
    en: 'Source Resolution (σ)',
    ja: '光源分解能 (σ)',
  },
  spotWidth: {
    en: 'Spot Width',
    ja: 'スポット幅',
  },
  energySkew: {
    en: 'Energy Skew (γ)',
    ja: 'エネルギー歪度 (γ)',
  },
  spatialSkew: {
    en: 'Spatial Skew (γ)',
    ja: '空間歪度 (γ)',
  },
  energyGradient: {
    en: 'Energy Gradient (α)',
    ja: 'エネルギー勾配 (α)',
  },
  smileCurvature: {
    en: 'Smile Curvature (κ)',
    ja: 'スマイル曲率 (κ)',
  },
  detectorTilt: {
    en: 'Detector Tilt (θ)',
    ja: '検出器傾き (θ)',
  },
  detectorResolution: {
    en: 'Detector Resolution (σ)',
    ja: '検出器分解能 (σ)',
  },
  poissonNoise: {
    en: 'Poisson Noise Level',
    ja: 'ポアソンノイズレベル',
  },
  gaussianNoise: {
    en: 'Gaussian Readout Noise',
    ja: 'ガウシアン読出しノイズ',
  },
  temperature: {
    en: 'Temperature',
    ja: '温度',
  },

  // Help texts
  helpSourceRes: {
    en: 'Intrinsic energy resolution of X-ray source',
    ja: 'X線源の固有エネルギー分解能',
  },
  helpSpotWidth: {
    en: 'Spatial width of X-ray spot on sample',
    ja: '試料上のX線スポットの空間的広がり',
  },
  helpEnergySkew: {
    en: 'Asymmetry of source energy distribution',
    ja: '光源エネルギー分布の非対称性',
  },
  helpSpatialSkew: {
    en: 'Asymmetry of spot spatial distribution',
    ja: 'スポット空間分布の非対称性',
  },
  helpAlpha: {
    en: 'Energy gradient within X-ray spot on sample',
    ja: '試料上のX線スポット内エネルギー勾配',
  },
  helpKappa: {
    en: 'Smile distortion from analyzer aberration',
    ja: 'アナライザー収差によるスマイル歪み',
  },
  helpTheta: {
    en: 'Slight misalignment of detector mounting angle',
    ja: '検出器取り付け角度の微小ズレ',
  },
  helpDetectorRes: {
    en: 'Intrinsic resolution of 2D detector',
    ja: '2D検出器の固有分解能',
  },
  helpPoisson: {
    en: 'Photon counting statistical noise (log scale)',
    ja: '光子計数統計ノイズ（対数スケール）',
  },
  helpGaussian: {
    en: 'Detector readout noise (constant)',
    ja: '検出器読み出しノイズ（一定）',
  },
  helpTemp: {
    en: 'Sample temperature for Fermi-Dirac distribution',
    ja: 'フェルミ・ディラック分布の試料温度',
  },

  // Resolution summary
  resolutionSummary: {
    en: 'Resolution Summary',
    ja: '分解能まとめ',
  },
  combinedResolution: {
    en: 'Combined Resolution',
    ja: '合成分解能',
  },

  // Chart titles
  spectrum1D: {
    en: '1D Spectrum Simulation',
    ja: '1Dスペクトルシミュレーション',
  },
  irf: {
    en: 'Instrumental Response Function (IRF)',
    ja: '装置応答関数 (IRF)',
  },
  spotProfile: {
    en: '2D Spot Profile',
    ja: '2Dスポットプロファイル',
  },
  detectorImage: {
    en: '2D Detector Image',
    ja: '2D検出器イメージ',
  },

  // Header buttons
  concept: {
    en: 'Concept',
    ja: 'コンセプト',
  },
  manual: {
    en: 'Manual',
    ja: 'マニュアル',
  },

  // Footer
  realtime: {
    en: 'Real-time simulation powered by React + uPlot',
    ja: 'React + uPlot によるリアルタイムシミュレーション',
  },
};

export function t(key: keyof typeof translations, lang: Language): string {
  return translations[key][lang];
}
