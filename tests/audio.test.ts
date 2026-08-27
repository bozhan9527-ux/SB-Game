import { describe, it, expect } from 'vitest';
import { PENTATONIC, noteFrequency, phraseForRealm, rootForRealm, scaleNote } from '../src/audio/notes';
import { renderGong, renderNoise, renderPluck, renderThud } from '../src/audio/synth';

/**
 * node 測試環境沒有 WebAudio，這裡給一個只會配置 Float32Array 的假 context。
 * 合成本身是純運算，用假 context 就能驗波形對不對。
 */
function fakeContext(sampleRate = 44100): BaseAudioContext {
  return {
    sampleRate,
    createBuffer(channels: number, length: number, rate: number) {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        length,
        sampleRate: rate,
        duration: length / rate,
        numberOfChannels: channels,
        getChannelData: (index: number) => channelData[index],
      };
    },
  } as unknown as BaseAudioContext;
}

function samples(buffer: AudioBuffer): Float32Array {
  return buffer.getChannelData(0);
}

function rms(data: Float32Array, from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i += 1) total += (data[i] ?? 0) ** 2;
  return Math.sqrt(total / Math.max(1, to - from));
}

/**
 * 以自相關估基頻。過零次數會被泛音干擾（一個週期可能跨越零軸四次），
 * 自相關取「第一個接近最大值的延遲」才不會把八度誤判成基頻。
 */
function fundamental(data: Float32Array, rate: number, from: number, to: number): number {
  const minLag = Math.floor(rate / 2000);
  const maxLag = Math.ceil(rate / 120);
  const scores: number[] = [];
  let best = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = from; i < to - lag; i += 1) sum += (data[i] ?? 0) * (data[i + lag] ?? 0);
    scores.push(sum);
    if (sum > best) best = sum;
  }
  for (let i = 0; i < scores.length; i += 1) {
    if ((scores[i] ?? -Infinity) >= best * 0.9) return rate / (minLag + i);
  }
  return rate / maxLag;
}

function zeroCrossings(data: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let i = from + 1; i < to; i += 1) {
    const previous = data[i - 1] ?? 0;
    const current = data[i] ?? 0;
    if ((previous < 0 && current >= 0) || (previous > 0 && current <= 0)) count += 1;
  }
  return count;
}

describe('音高與樂句', () => {
  it('A4 為 440Hz，八度為兩倍', () => {
    expect(noteFrequency(0)).toBeCloseTo(440, 6);
    expect(noteFrequency(12)).toBeCloseTo(880, 6);
    expect(noteFrequency(-12)).toBeCloseTo(220, 6);
  });

  it('五聲音階不含小二度，隨便取音都不會撞', () => {
    for (let i = 1; i < PENTATONIC.length; i += 1) {
      expect(PENTATONIC[i]! - PENTATONIC[i - 1]!).toBeGreaterThanOrEqual(2);
    }
  });

  it('音級超過一個八度會自動往上疊', () => {
    expect(scaleNote(0, 0)).toBe(0);
    expect(scaleNote(0, 5)).toBe(12);
    expect(scaleNote(0, 6)).toBe(14);
    expect(scaleNote(0, -1)).toBe(-3);
  });

  it('境界越高主音越高，但有上限', () => {
    expect(rootForRealm(4)).toBeGreaterThan(rootForRealm(0));
    expect(rootForRealm(99)).toBe(rootForRealm(24));
  });

  it('每個境界都有一段八拍樂句', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      expect(phraseForRealm(realm)).toHaveLength(8);
    }
  });
});

describe('音色合成', () => {
  it('撥弦的基頻與指定音高相符', () => {
    const ctx = fakeContext();
    // 起音那幾十個週期是寬頻噪音，太晚又會衰減到只剩數值誤差，
    // 取 0.06–0.2 秒這段「已濾乾淨但還夠大聲」的波形來量。
    const from = Math.floor(ctx.sampleRate * 0.06);
    const to = Math.floor(ctx.sampleRate * 0.2);
    for (const target of [220, 440, 660]) {
      const data = samples(renderPluck(ctx, target, 0.6));
      const measured = fundamental(data, ctx.sampleRate, from, to);
      expect(measured, `${target}Hz 量到 ${Math.round(measured)}Hz`).toBeGreaterThan(target * 0.95);
      expect(measured, `${target}Hz 量到 ${Math.round(measured)}Hz`).toBeLessThan(target * 1.05);
    }
  });

  it('撥弦會衰減且不爆音', () => {
    const ctx = fakeContext();
    const data = samples(renderPluck(ctx, 220, 1));
    const length = data.length;
    expect(rms(data, 0, Math.floor(length * 0.1))).toBeGreaterThan(rms(data, Math.floor(length * 0.9), length));
    for (const sample of data) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(Math.abs(sample)).toBeLessThanOrEqual(1);
    }
  });

  it('撥弦結尾淡出到接近無聲，不會有切斷的爆音', () => {
    const ctx = fakeContext();
    const data = samples(renderPluck(ctx, 330, 0.6));
    expect(Math.abs(data[data.length - 1] ?? 1)).toBeLessThan(0.01);
  });

  it('鑼聲含多個非諧和分音且長衰減', () => {
    const ctx = fakeContext();
    const data = samples(renderGong(ctx, 150, 2));
    const length = data.length;
    expect(rms(data, 0, Math.floor(length * 0.05))).toBeGreaterThan(0);
    expect(rms(data, Math.floor(length * 0.05), Math.floor(length * 0.2))).toBeGreaterThan(
      rms(data, Math.floor(length * 0.8), length),
    );
  });

  it('噪音與悶響都由大到小衰減', () => {
    const ctx = fakeContext();
    for (const buffer of [renderNoise(ctx, 0.4, 2), renderThud(ctx, 180, 50, 0.4)]) {
      const data = samples(buffer);
      const length = data.length;
      expect(rms(data, 0, Math.floor(length * 0.2))).toBeGreaterThan(
        rms(data, Math.floor(length * 0.8), length),
      );
    }
  });

  it('悶響的音高會往下滑', () => {
    const ctx = fakeContext();
    const data = samples(renderThud(ctx, 400, 60, 0.5));
    const length = data.length;
    const early = zeroCrossings(data, 0, Math.floor(length * 0.2));
    const late = zeroCrossings(data, Math.floor(length * 0.6), Math.floor(length * 0.8));
    expect(early).toBeGreaterThan(late);
  });
});
