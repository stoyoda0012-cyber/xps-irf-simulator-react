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
    en: 'Real-time simulation powered by React + Canvas',
    ja: 'React + Canvas によるリアルタイムシミュレーション',
  },

  // Fitting Panel
  fitting: {
    en: 'Fit: Fermi edge & IRF',
    ja: 'フィット：フェルミ端・IRF',
  },
  fermiFitting: {
    en: 'Fermi Edge Fitting',
    ja: 'フェルミ端フィッティング',
  },
  irfEstimation: {
    en: 'IRF Parameter Estimation',
    ja: 'IRFパラメータ推定',
  },
  fermiFittingDesc: {
    en: 'Fit the simulated spectrum with a Fermi-Dirac edge broadened by a Gaussian to extract the total resolution. To fit your own measurement, use "Fit measured data" at the top.',
    ja: 'シミュレーションスペクトルを、ガウス関数で広げたフェルミ・ディラック端でフィットし、合計分解能を求めます。自分の測定データは上部の「測定データのフィット」から。',
  },
  irfEstimationDesc: {
    en: 'Estimate geometric IRF parameters (κ, θ, σ, α, etc.) from observed spectrum using Differential Evolution.',
    ja: 'Differential Evolutionを用いて、観測スペクトルからIRFの幾何学的パラメータ（κ, θ, σ, αなど）を推定します。',
  },
  fitTemperature: {
    en: 'Fit temperature as free parameter',
    ja: '温度を自由パラメータとしてフィッティング',
  },
  runFitting: {
    en: 'Run Fitting',
    ja: 'フィッティング実行',
  },
  runEstimation: {
    en: 'Run Estimation',
    ja: '推定実行',
  },
  running: {
    en: 'Running...',
    ja: '実行中...',
  },
  cancel: {
    en: 'Cancel',
    ja: 'キャンセル',
  },
  results: {
    en: 'Results',
    ja: '結果',
  },
  estimatedParams: {
    en: 'Estimated Parameters',
    ja: '推定パラメータ',
  },
  efShift: {
    en: 'E_F Shift',
    ja: 'E_F シフト',
  },
  totalResolution: {
    en: 'Total Resolution (σ)',
    ja: '合計分解能 (σ)',
  },
  fittedTemp: {
    en: 'Fitted Temperature',
    ja: 'フィッティング温度',
  },
  iteration: {
    en: 'Iteration',
    ja: 'イテレーション',
  },
  fitness: {
    en: 'Fitness',
    ja: 'フィットネス',
  },
  evaluations: {
    en: 'Evaluations',
    ja: '評価回数',
  },
  applyParams: {
    en: 'Apply to Simulator',
    ja: 'シミュレータに適用',
  },
  fittingError: {
    en: 'An error occurred during fitting.',
    ja: 'フィッティング中にエラーが発生しました。',
  },
  spectrumChanged: {
    en: 'The spectrum changed after this fit. Run it again.',
    ja: 'このフィットの後にスペクトルが変わりました。再実行してください。',
  },
  simulatorSigma: {
    en: 'Simulator σ (sliders)',
    ja: 'シミュレータ σ（スライダー）',
  },
  sendToDataFit: {
    en: 'Open in data-fit view (residuals, window)',
    ja: 'データフィット画面で開く（残差・範囲指定）',
  },
  simSpectrumName: {
    en: 'Simulated spectrum',
    ja: 'シミュレーションスペクトル',
  },

  // Top-level modes
  modeSimulator: {
    en: 'Simulator',
    ja: 'シミュレータ',
  },
  modeDataFit: {
    en: 'Fit measured data',
    ja: '測定データのフィット',
  },

  // Data fit workspace: loading
  stepLoad: {
    en: '1. Load data',
    ja: '1. データを読み込む',
  },
  dropHere: {
    en: 'Drop a file here, or click to choose',
    ja: 'ファイルをここにドロップ、またはクリックして選択',
  },
  dropFormats: {
    en: 'CSV / TSV / TXT (energy and intensity columns), Scienta SES .txt, VAMAS .vms',
    ja: 'CSV / TSV / TXT（エネルギー列と強度列）、Scienta SES .txt、VAMAS .vms',
  },
  pasteData: {
    en: 'Paste data',
    ja: 'データを貼り付け',
  },
  pastePlaceholder: {
    en: 'energy, intensity (one point per line; tabs from a spreadsheet work too)',
    ja: 'エネルギー, 強度（1 行に 1 点。表計算ソフトからのタブ区切りも可）',
  },
  usePasted: {
    en: 'Use pasted data',
    ja: '貼り付けたデータを使う',
  },
  pastedName: {
    en: 'Pasted data',
    ja: '貼り付けデータ',
  },
  tryExample: {
    en: 'Try a synthetic Au edge',
    ja: '合成 Au フェルミ端で試す',
  },
  exampleTruth: {
    en: 'Synthetic example. True values: E_F at BE = {ef} eV, Gaussian FWHM = {fwhm} meV, T = {t} K.',
    ja: '合成データ。正解値：E_F は BE = {ef} eV、ガウス FWHM = {fwhm} meV、T = {t} K。',
  },
  privacyNote: {
    en: 'Files are read in your browser; nothing is uploaded.',
    ja: 'ファイルはブラウザ内で読み込むだけで、アップロードはされません。',
  },
  readFailed: {
    en: 'Could not read the file',
    ja: 'ファイルを読み込めませんでした',
  },
  pointsLabel: {
    en: 'points',
    ja: '点',
  },
  regionLabel: {
    en: 'Region',
    ja: 'リージョン',
  },
  energyColumn: {
    en: 'Energy column',
    ja: 'エネルギー列',
  },
  intensityColumn: {
    en: 'Intensity column',
    ja: '強度列',
  },
  sumOfColumns: {
    en: 'Sum of all other columns',
    ja: '他の列の合計',
  },

  // Data fit workspace: axis
  stepAxis: {
    en: '2. Energy axis',
    ja: '2. エネルギー軸',
  },
  unitLabel: {
    en: 'Unit',
    ja: '単位',
  },
  axisLabel: {
    en: 'Axis',
    ja: '軸',
  },
  axisBE: {
    en: 'Binding energy (occupied side at larger values)',
    ja: '結合エネルギー（占有側が大きい値）',
  },
  axisKE: {
    en: 'Kinetic energy (occupied side at smaller values)',
    ja: '運動エネルギー（占有側が小さい値）',
  },
  axisEEF: {
    en: 'E − E_F (occupied side negative)',
    ja: 'E − E_F（占有側が負）',
  },
  fromFile: {
    en: 'from file',
    ja: 'ファイルから',
  },
  guessed: {
    en: 'guessed',
    ja: '推定',
  },
  setByYou: {
    en: 'set by you',
    ja: '手動',
  },
  countsDetected: {
    en: 'integer counts',
    ja: '整数カウント',
  },
  countsHint: {
    en: 'The intensities are integer counts: Poisson weights are recommended.',
    ja: '強度が整数カウントなので、ポアソン重みをおすすめします。',
  },
  axisGuessHelp: {
    en: 'Guessed from which end of the spectrum is brighter (the occupied side) and from the size of the numbers. Change it if the edge looks inverted.',
    ja: 'スペクトルのどちらの端が明るいか（占有側）と数値の大きさから推定しています。端が逆向きに見えたら変更してください。',
  },

  // Data fit workspace: window and model
  stepWindow: {
    en: '3. Fit window',
    ja: '3. フィット範囲',
  },
  windowFrom: {
    en: 'from',
    ja: '開始',
  },
  windowTo: {
    en: 'to',
    ja: '終了',
  },
  autoWindow: {
    en: 'Auto',
    ja: '自動',
  },
  windowIsAuto: {
    en: 'auto: about ±{half} eV around the edge',
    ja: '自動：端の前後 約 ±{half} eV',
  },
  windowHelp: {
    en: 'Drag across the plot to choose the range. Keep it clear of the next band (for Au the 5d bands start about 2 eV below E_F).',
    ja: 'グラフ上を横にドラッグして範囲を選べます。次のバンドを含めないでください（Au では 5d バンドが E_F の約 2 eV 下から始まります）。',
  },
  stepModel: {
    en: '4. Model',
    ja: '4. モデル',
  },
  sampleTemperature: {
    en: 'Sample temperature (K)',
    ja: '試料温度 (K)',
  },
  fitTempShort: {
    en: 'Fit the temperature too',
    ja: '温度もフィットする',
  },
  fitTempHelp: {
    en: 'Temperature and resolution both broaden the edge and are strongly correlated. Fit one with the other fixed, unless the resolution is not much wider than the thermal width (4.4 kT, 0.11 eV at 300 K).',
    ja: '温度と分解能はどちらも端を広げるため強く相関します。分解能が熱幅（4.4 kT、300 K で 0.11 eV）より十分広い場合は、片方を固定してください。',
  },
  dosModel: {
    en: 'DOS below E_F',
    ja: 'E_F 以下の状態密度',
  },
  dosFlat: {
    en: 'flat',
    ja: '一定',
  },
  dosLinear: {
    en: 'linear slope',
    ja: '線形の傾き',
  },
  backgroundModel: {
    en: 'Background',
    ja: 'バックグラウンド',
  },
  bgConstant: {
    en: 'constant',
    ja: '一定',
  },
  bgLinear: {
    en: 'linear',
    ja: '線形',
  },
  poissonWeights: {
    en: 'Poisson weights (raw counts only)',
    ja: 'ポアソン重み（生カウントのみ）',
  },
  poissonHelp: {
    en: 'Weights each point by 1/counts, so the reduced χ² should come out near 1. Do not use for normalized or background-subtracted data.',
    ja: '各点を 1/カウント で重み付けします（換算 χ² が 1 付近になるはず）。規格化やバックグラウンド除去済みのデータには使わないでください。',
  },
  autoFitNote: {
    en: 'The fit reruns automatically whenever you change a setting.',
    ja: '設定を変えると自動で再フィットします。',
  },

  // Data fit workspace: chart and results
  fittingNow: {
    en: 'Fitting…',
    ja: 'フィット中…',
  },
  viewFull: {
    en: 'Full data',
    ja: '全データ',
  },
  viewWindow: {
    en: 'Fit window',
    ja: 'フィット範囲',
  },
  seriesData: {
    en: 'Data',
    ja: 'データ',
  },
  seriesFit: {
    en: 'Fit',
    ja: 'フィット',
  },
  seriesBackground: {
    en: 'Background',
    ja: 'バックグラウンド',
  },
  residualRaw: {
    en: 'Residual',
    ja: '残差',
  },
  residualNorm: {
    en: 'Residual / σ',
    ja: '残差 / σ',
  },
  intensityLabel: {
    en: 'Intensity',
    ja: '強度',
  },
  emptyPlot: {
    en: 'Load a spectrum (or try the synthetic example) to start.',
    ja: 'スペクトルを読み込むか、合成データで試してください。',
  },
  fitOk: {
    en: 'Fit converged and passed all checks.',
    ja: 'フィットは収束し、すべてのチェックを通過しました。',
  },
  fitCheck: {
    en: 'Check before using these numbers:',
    ja: 'この値を使う前に確認してください：',
  },
  efPosition: {
    en: 'E_F position',
    ja: 'E_F 位置',
  },
  calibrationBE: {
    en: 'To put E_F at 0, subtract {ef} from the binding energies.',
    ja: 'E_F を 0 にするには、結合エネルギーから {ef} を引いてください。',
  },
  calibrationKE: {
    en: 'E_F appears at kinetic energy {ef}.',
    ja: 'E_F は運動エネルギー {ef} に現れています。',
  },
  calibrationEEF: {
    en: 'E_F is offset by {ef} from zero on this axis.',
    ja: 'この軸では E_F がゼロから {ef} ずれています。',
  },
  gaussFwhm: {
    en: 'Gaussian FWHM (resolution)',
    ja: 'ガウス FWHM（分解能）',
  },
  gaussSigma: {
    en: 'Gaussian σ',
    ja: 'ガウス σ',
  },
  width1090: {
    en: '10–90 % edge width (incl. thermal)',
    ja: '10–90 % 端幅（熱幅込み）',
  },
  fixedTag: {
    en: 'fixed',
    ja: '固定',
  },
  dosSlope: {
    en: 'DOS slope c₁',
    ja: 'DOS の傾き c₁',
  },
  reducedChi2: {
    en: 'Reduced χ²',
    ja: '換算 χ²',
  },
  pointsParams: {
    en: 'Points / parameters',
    ja: '点数 / パラメータ数',
  },
  uncertaintyNote: {
    en: 'Errors are 1σ and statistical only (scaled by the reduced χ²). They do not include the choice of model or window: refit with the other DOS / background option to see that.',
    ja: '誤差は 1σ の統計誤差のみです（換算 χ² でスケール）。モデルや範囲の選び方による誤差は含みません。DOS／バックグラウンドを切り替えて再フィットすると目安になります。',
  },
  copyResults: {
    en: 'Copy results',
    ja: '結果をコピー',
  },
  copied: {
    en: 'Copied',
    ja: 'コピーしました',
  },
  exportCsv: {
    en: 'Download fit (CSV)',
    ja: 'フィット結果を保存 (CSV)',
  },

  // Fit warnings (codes from fermiEdge.ts)
  warn_tooFewPoints: {
    en: 'Too few points in the fit window (need at least 8, and more than the number of parameters + 2).',
    ja: 'フィット範囲の点が少なすぎます（8 点以上、かつパラメータ数 + 2 より多く必要）。',
  },
  warn_edgeInverted: {
    en: 'The intensity is higher on the unoccupied side: the axis direction is probably wrong (check binding vs kinetic / E − E_F).',
    ja: '非占有側の強度の方が高くなっています。軸の向きが逆の可能性が高いです（結合／運動エネルギー、E − E_F を確認）。',
  },
  warn_atBound_ef: {
    en: 'E_F ended at the edge of the fit window: move or widen the window.',
    ja: 'E_F がフィット範囲の端で止まりました。範囲を移動するか広げてください。',
  },
  warn_atBound_fwhm: {
    en: 'The resolution ended at its limit (below 0.05 channel, or as wide as the window).',
    ja: '分解能が上限・下限に張り付きました（0.05 チャンネル未満、または範囲と同じ幅）。',
  },
  warn_atBound_temperature: {
    en: 'The temperature ended at its limit (1–3000 K).',
    ja: '温度が上限・下限（1–3000 K）に張り付きました。',
  },
  warn_nonFiniteError: {
    en: 'Some uncertainties could not be computed: the data do not determine every parameter.',
    ja: '一部の誤差を計算できませんでした。データからすべてのパラメータは決まりません。',
  },
  warn_efOutsideWindow: {
    en: 'E_F lies outside the fit window.',
    ja: 'E_F がフィット範囲の外にあります。',
  },
  warn_efUndetermined: {
    en: 'E_F is not determined: its error is wider than the edge itself.',
    ja: 'E_F が決まっていません（誤差が端の幅より大きい）。',
  },
  warn_resolutionBelowChannel: {
    en: 'The fitted resolution is below half a channel, so the step size limits it; trust E_F, not the width.',
    ja: '分解能が半チャンネル未満で、刻み幅で制限されています。幅ではなく E_F だけを信頼してください。',
  },
  warn_tempResolutionDegenerate: {
    en: 'Temperature and resolution are almost fully correlated (|ρ| > 0.95): fix the temperature.',
    ja: '温度と分解能がほぼ完全に相関しています（|ρ| > 0.95）。温度を固定してください。',
  },
  warn_notConverged: {
    en: 'The optimizer did not converge.',
    ja: '最適化が収束しませんでした。',
  },
};

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Language): string {
  return translations[key][lang];
}

/** t() with {name} placeholders filled in */
export function tf(key: TranslationKey, lang: Language, vars: Record<string, string | number>): string {
  return t(key, lang).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
