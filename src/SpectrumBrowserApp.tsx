/**
 * Spectrum Browser App - 爆速スペクトル・ブラウザーのエントリーポイント
 *
 * 使用方法:
 * 1. バックエンド起動: cd backend && uvicorn app.main:app --reload
 * 2. フロントエンド起動: npm run dev:browser
 */

import { SpectrumBrowser } from './components/SpectrumBrowser';
import './App.css';

function SpectrumBrowserApp() {
  return (
    <SpectrumBrowser
      throttleMs={16}       // 60 FPS ターゲット
      nPoints={100}         // 初期ポイント数
      nSpectra={1}          // 初期スペクトル数
      nElements={1}         // 初期元素数
    />
  );
}

export default SpectrumBrowserApp;
