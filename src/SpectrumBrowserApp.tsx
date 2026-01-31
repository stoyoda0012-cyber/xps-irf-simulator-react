/**
 * Spectrum Browser App - 爆速スペクトル・ブラウザーのエントリーポイント
 *
 * 使用方法:
 * - デモモード（デフォルト）: npm run dev:browser でそのまま動作
 * - サーバーモード: バックエンド起動後、UIでServer Modeに切り替え
 */

import { SpectrumBrowser } from './components/SpectrumBrowser';
import './App.css';

function SpectrumBrowserApp() {
  return (
    <SpectrumBrowser
      throttleMs={16}       // 60 FPS ターゲット
      nPoints={100}         // 初期ポイント数
      nSpectra={1}          // 初期スペクトル数
      nElements={3}         // 初期元素数（デモ用に3つ）
      demoMode={true}       // デモモードでスタート
    />
  );
}

export default SpectrumBrowserApp;
