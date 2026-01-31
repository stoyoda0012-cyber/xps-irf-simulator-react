/**
 * Spectrum Browser エントリーポイント
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SpectrumBrowserApp from './SpectrumBrowserApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpectrumBrowserApp />
  </StrictMode>
);
