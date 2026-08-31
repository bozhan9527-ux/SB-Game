/**
 * 遙測。
 *
 * **為什麼需要它。** 這個專案到目前為止沒有一個位元離開過玩家的裝置——
 * 於是「這款遊戲被玩了幾次」這種最基本的問題也答不出來，
 * 而後面每一個營運與平衡決定都只能用猜的。第 97 關那個節奏問題是製作人玩到才發現的，
 * 不是模擬發現的。
 *
 * **為什麼用現成的服務而不自己寫。** 自己寫一支 `POST /event` 只是開頭，
 * 真正的工作在保存、查詢、畫漏斗圖——那是幾週的事。PostHog 的免費額度
 * （每月一百萬事件）在這個量級用不完。
 *
 * 三條設計規矩：
 *
 * 1. **沒有金鑰時整包是 no-op。** 開發、測試、以及任何沒設定金鑰的部署都完全不連網，
 *    也不會因為缺少設定而壞掉。金鑰用 build 時的環境變數帶進來。
 * 2. **關掉 autocapture 與 pageview。** 只送這五個事件，不送點擊、不送瀏覽。
 *    這既是隱私，也是成本——自動蒐集的量會是手動事件的幾十倍。
 * 3. **玩家可以關掉。** 存檔裡有一個開關，關了之後 capture 直接不做事。
 *
 * 上層程式碼只認得 `track()`，不認得 PostHog；日後要換服務只需替換本檔，
 * 和 src/save/storage.ts 是同一套態度。
 *
 * **用自動化瀏覽器驗證時會看不到任何事件送出**，那不是壞掉：posthog-js 會過濾
 * 機器人，判斷依據包含 `navigator.webdriver` 與 User-Agent。要在 Playwright 裡驗，
 * 得先 `Object.defineProperty(navigator, 'webdriver', { get: () => false })`。
 * 這個過濾在正式環境是我們要的——爬蟲不該進到留存曲線裡。
 */
import type { TelemetryEventName, TelemetryEvents } from './events';

export type { TelemetryEventName, TelemetryEvents } from './events';

export interface TelemetrySink {
  capture(event: string, properties: Record<string, unknown>): void;
}

/** 目前的接收端。沒有金鑰、或玩家關掉時為 null。 */
let sink: TelemetrySink | null = null;
let enabled = true;

/**
 * 記錄一個事件。
 *
 * 事件名與屬性由 TelemetryEvents 定死，呼叫端打錯字會編譯失敗——
 * 遙測最常見的壞法是「埋了但欄位名不一致」，那種錯誤在圖表上看不出來，
 * 只會靜靜地讓某一段資料消失。
 */
export function track<K extends TelemetryEventName>(event: K, properties: TelemetryEvents[K]): void {
  if (!enabled || sink === null) return;
  try {
    sink.capture(event, properties as Record<string, unknown>);
  } catch {
    // 遙測永遠不該把遊戲弄壞。送不出去就算了。
  }
}

/** 玩家的開關。關掉之後一律不送。 */
export function setTelemetryEnabled(value: boolean): void {
  enabled = value;
}

export function telemetryActive(): boolean {
  return enabled && sink !== null;
}

/** 測試與日後換服務用：直接指定接收端。 */
export function setTelemetrySink(next: TelemetrySink | null): void {
  sink = next;
}

/**
 * 依 build 時的環境變數啟動。
 *
 * PostHog 的 project key 本來就是公開的（它會出現在前端的 JS 裡），
 * 放進環境變數不是為了保密，是為了讓不同的部署（正式／預覽／本機）指向不同的專案。
 *
 * posthog-js 用動態 import 載入，因此它會被切成獨立的 chunk（約 256KB）：
 * 沒設金鑰時那個檔案存在於 dist 裡，但執行期永遠不會被下載——
 * 玩家實際載入的量不變。
 */
export async function initTelemetry(): Promise<void> {
  const key = import.meta.env['VITE_POSTHOG_KEY'];
  const host = import.meta.env['VITE_POSTHOG_HOST'] ?? 'https://us.i.posthog.com';
  if (typeof key !== 'string' || key.length === 0) return;

  try {
    const { default: posthog } = await import('posthog-js');
    posthog.init(key, {
      api_host: typeof host === 'string' ? host : 'https://us.i.posthog.com',
      // 只送我們自己埋的五個事件。自動蒐集的量會是手動事件的幾十倍，
      // 而且會把使用者在頁面上的一舉一動都送出去——這個遊戲不需要那些。
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      // 這三樣是 PostHog 的其他產品線（問卷、A/B、功能旗標），這個遊戲一樣都沒用到。
      // 不關掉的話開場會多打三支請求去拉它們的設定——而且其中一支會去載外部腳本。
      disable_surveys: true,
      disable_web_experiments: true,
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      // 沒有帳號系統，就不要建立 person profile。
      person_profiles: 'never',
      // 一場只送幾個事件，批次緩衝買不到什麼，卻讓「玩家關掉分頁時最後一個事件會不會掉」
      // 變成一個要擔心的問題。直接送。
      request_batching: false,
    });
    sink = {
      capture: (event, properties) => void posthog.capture(event, properties),
    };
  } catch (error) {
    // 載入失敗（離線、被廣告攔截器擋掉、CDN 掛了）不能把遊戲弄壞，但也不該完全無聲——
    // 遙測靜靜地死掉，等於回到「沒有資料而且不知道自己沒有資料」的狀態。
    // 寫進 console 是最低成本的自我檢查：開一次瀏覽器就看得到。
    console.warn('[telemetry] 初始化失敗，本次不會送出任何統計：', error);
    sink = null;
  }
}
