/**
 * 遙測的送出規則。
 *
 * 這一組不驗「事件有沒有埋在對的地方」（那要跑起 Phaser），
 * 驗的是三條一旦破掉就會安靜出錯的規矩：
 * 沒設定金鑰時完全不動作、玩家關掉之後真的不送、以及送出失敗不能把遊戲弄壞。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setTelemetryEnabled,
  setTelemetrySink,
  telemetryActive,
  track,
} from '../src/telemetry';
import type { TelemetrySink } from '../src/telemetry';

interface Recorded {
  event: string;
  properties: Record<string, unknown>;
}

function recorder(): { sink: TelemetrySink; events: Recorded[] } {
  const events: Recorded[] = [];
  return {
    events,
    sink: { capture: (event, properties) => void events.push({ event, properties }) },
  };
}

afterEach(() => {
  setTelemetrySink(null);
  setTelemetryEnabled(true);
});

describe('遙測', () => {
  it('沒有接收端時整包是 no-op，不 throw 也不記錄', () => {
    // 開發、測試、以及任何沒設定金鑰的部署都走這條路，它必須完全安靜。
    setTelemetrySink(null);
    expect(telemetryActive()).toBe(false);
    expect(() => track('tutorial_step', { step: 'deploy' })).not.toThrow();
  });

  it('有接收端時照實送出', () => {
    const { sink, events } = recorder();
    setTelemetrySink(sink);
    track('tutorial_step', { step: 'merge' });
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('tutorial_step');
    expect(events[0]?.properties).toEqual({ step: 'merge' });
  });

  it('玩家關掉之後就不送——是在這裡擋掉，不是送出去再由伺服器丟', () => {
    const { sink, events } = recorder();
    setTelemetrySink(sink);
    setTelemetryEnabled(false);
    track('tutorial_step', { step: 'watch' });
    expect(events).toHaveLength(0);
    expect(telemetryActive()).toBe(false);

    setTelemetryEnabled(true);
    track('tutorial_step', { step: 'watch' });
    expect(events).toHaveLength(1);
  });

  it('接收端爆炸也不能把遊戲弄壞', () => {
    // 遙測是附加品。網路斷了、被廣告攔截器擋掉、SDK 自己出錯——遊戲都要照跑。
    setTelemetrySink({
      capture: () => {
        throw new Error('boom');
      },
    });
    expect(() => track('app_open', {
      stage: 1,
      highest_stage: 1,
      clears: 0,
      runs: 0,
      sect: null,
      rebirths: 0,
      is_new: true,
    })).not.toThrow();
  });

  it('沒設定金鑰時 initTelemetry 不會去載入 posthog', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const { initTelemetry } = await import('../src/telemetry');
    await initTelemetry();
    expect(telemetryActive()).toBe(false);
    vi.unstubAllEnvs();
  });
});
