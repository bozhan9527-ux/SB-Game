import { describe, it, expect } from 'vitest';
import {
  BASS_BEATS,
  MELODY_BEATS,
  MELODY_CEILING,
  PENTATONIC,
  SPARKLE_CEILING,
  octaveShift,
  noteFrequency,
  phraseForRealm,
  rootForRealm,
  scaleNote,
} from '../src/audio/notes';
import { renderGong, renderNoise, renderPluck, renderThud } from '../src/audio/synth';
import { createRng } from '../src/systems/rng';

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
 * 以自相關估基頻。
 *
 * 過零次數會被泛音干擾（一個週期可能跨越零軸四次），所以用自相關。
 * 兩個細節是踩過坑才加上的：
 * - **依重疊長度正規化**：長 lag 的重疊樣本較少，不正規化會被短 lag 系統性壓過去。
 * - **只接受「區域極大值」且門檻拉到 0.97**：光看「第一個達到 0.9×最大值的延遲」
 *   會被短延遲處的雜訊肩部或半週期騙走（CI 上曾把 660Hz 量成 1423Hz）。
 *   以 300 個種子 × 6 個音高共 1800 次量測掃描過門檻：0.9 失敗 3 次、0.95 失敗 1 次、
 *   0.97 起為 0 次。
 */
function fundamental(data: Float32Array, rate: number, from: number, to: number): number {
  const minLag = Math.floor(rate / 2000);
  const maxLag = Math.ceil(rate / 120);
  const scores: number[] = [];
  let best = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = from; i < to - lag; i += 1) sum += (data[i] ?? 0) * (data[i + lag] ?? 0);
    const score = sum / Math.max(1, to - lag - from);
    scores.push(score);
    if (score > best) best = score;
  }
  // 取第一個「既是波峰又夠高」的延遲：週期的倍數也會是波峰，取第一個才是基頻。
  for (let i = 1; i < scores.length - 1; i += 1) {
    const score = scores[i] ?? -Infinity;
    if (score < best * 0.97) continue;
    if (score > (scores[i - 1] ?? -Infinity) && score >= (scores[i + 1] ?? -Infinity)) {
      return rate / (minLag + i);
    }
  }
  return rate / maxLag;
}

/**
 * 撥弦的起音是 Math.random() 的噪音脈衝，波形每次都不同——
 * 這個測試曾經因此在 CI 上隨機失敗一次。改成用固定種子的亂數餵它，
 * 並一次驗多個種子：既可重現，也不會因為「剛好挑到好種子」而放過真的問題。
 */
function withSeededRandom<T>(seed: number, run: () => T): T {
  const rng = createRng(seed);
  const original = Math.random;
  Math.random = () => rng.next();
  try {
    return run();
  } finally {
    Math.random = original;
  }
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
    for (const seed of [1, 7, 42, 1234, 90210]) {
      for (const target of [220, 440, 660]) {
        const data = withSeededRandom(seed, () => samples(renderPluck(ctx, target, 0.6)));
        const measured = fundamental(data, ctx.sampleRate, from, to);
        const label = `種子 ${seed}：${target}Hz 量到 ${Math.round(measured)}Hz`;
        expect(measured, label).toBeGreaterThan(target * 0.95);
        expect(measured, label).toBeLessThan(target * 1.05);
      }
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

describe('配樂的律動', () => {
  it('一小節八拍，旋律有留白也有出聲', () => {
    // 每一拍都平均落下聽起來像節拍器，不像音樂。留白才有律動。
    expect(MELODY_BEATS).toHaveLength(8);
    expect(MELODY_BEATS.some((on) => on)).toBe(true);
    expect(MELODY_BEATS.some((on) => !on)).toBe(true);
  });

  it('低音一小節走四下，而且是根音與五度交替', () => {
    // 原本一小節只撥兩下根音，撐得住但推不動。
    expect(BASS_BEATS).toHaveLength(8);
    const notes = BASS_BEATS.filter((degree): degree is number => degree !== null);
    expect(notes).toHaveLength(4);
    // 五聲音階的第 3 級就是純五度（7 個半音）。
    expect(PENTATONIC[3]).toBe(7);
    expect(new Set(notes)).toEqual(new Set([0, 3]));
  });

  it('樂句有起伏，不是原地踱步', () => {
    // 級進為主的舊樂句（0,2,4,2,3,1,4,2）音域只有 3 級，聽起來很平。
    for (let realm = 0; realm < 10; realm += 1) {
      const phrase = phraseForRealm(realm);
      const span = Math.max(...phrase) - Math.min(...phrase);
      expect(span, `第 ${realm} 個境界的樂句音域只有 ${span} 級，太平`).toBeGreaterThanOrEqual(5);
    }
  });

  it('最高的音不刺耳：主音隨境界升，旋律也不會往上飄走', () => {
    // 主音隨境界升、樂句本身又往上跳，兩者相加在後段境界會把旋律推到 2kHz 以上。
    // 折八度不改變音級，聽起來仍是同一句，只是留在舒服的音域裡。
    let peakMelody = 0;
    let peakSparkle = 0;
    for (let realm = 0; realm < 10; realm += 1) {
      const root = rootForRealm(realm);
      const melody = phraseForRealm(realm).map((degree) => scaleNote(root + 12, degree));
      const shift = octaveShift(Math.max(...melody), MELODY_CEILING);
      peakMelody = Math.max(peakMelody, ...melody.map((n) => noteFrequency(n + shift)));
      const sparkle = phraseForRealm(realm).map((degree) =>
        scaleNote(root + 24, degree % PENTATONIC.length),
      );
      const shift2 = octaveShift(Math.max(...sparkle), SPARKLE_CEILING);
      peakSparkle = Math.max(peakSparkle, ...sparkle.map((n) => noteFrequency(n + shift2)));
    }
    expect(peakMelody, `旋律最高 ${Math.round(peakMelody)}Hz`).toBeLessThanOrEqual(880);
    expect(peakSparkle, `點綴最高 ${Math.round(peakSparkle)}Hz`).toBeLessThanOrEqual(1320);
  });

  it('整段一起移八度，旋律的起伏不會被折壞', () => {
    // 逐音折的話，超過上限的音會掉到下一個八度，輪廓整個變形——
    // 實測境界 9 的音域會從八度縮成五度，聽起來變成原地打轉。
    for (let realm = 0; realm < 10; realm += 1) {
      const root = rootForRealm(realm);
      const melody = phraseForRealm(realm).map((degree) => scaleNote(root + 12, degree));
      const shift = octaveShift(Math.max(...melody), MELODY_CEILING);
      const moved = melody.map((n) => n + shift);
      // 移調之後，任兩音的音程和移調前完全一樣。
      const before = Math.max(...melody) - Math.min(...melody);
      const after = Math.max(...moved) - Math.min(...moved);
      expect(after, `第 ${realm} 個境界的音域被改變了`).toBe(before);
      expect(Math.abs(shift % 12)).toBe(0);
    }
  });
});

describe('配樂的亮度', () => {
  it('正常情況下不需要折八度——亮度純粹由主音決定', () => {
    // 折八度是安全網。若日常就會踩到，代表樂句本身的音域訂錯了，
    // 而且折下來之後高境界會比低境界還低，「越高越亮」就不成立。
    for (let realm = 0; realm < 10; realm += 1) {
      const root = rootForRealm(realm);
      const melody = phraseForRealm(realm).map((degree) => scaleNote(root + 12, degree));
      const sparkle = phraseForRealm(realm).map((degree) =>
        scaleNote(root + 24, degree % PENTATONIC.length),
      );
      expect(octaveShift(Math.max(...melody), MELODY_CEILING), `第 ${realm} 個境界的旋律需要折八度`).toBe(0);
      expect(octaveShift(Math.max(...sparkle), SPARKLE_CEILING), `第 ${realm} 個境界的點綴需要折八度`).toBe(0);
    }
  });

  it('境界越高，配樂真的越亮', () => {
    const brightness = (realm: number): number => {
      const root = rootForRealm(realm);
      const melody = phraseForRealm(realm).map((degree) => scaleNote(root + 12, degree));
      return melody.reduce((sum, note) => sum + note, 0) / melody.length;
    };
    for (let realm = 1; realm < 10; realm += 1) {
      expect(brightness(realm), `第 ${realm} 個境界比前一個暗`).toBeGreaterThanOrEqual(brightness(realm - 1));
    }
    expect(brightness(9)).toBeGreaterThan(brightness(0));
  });

  it('換境界時旋律的輪廓會變，但音域不變', () => {
    const shapes = new Set<string>();
    const spans = new Set<number>();
    for (let realm = 0; realm < 8; realm += 1) {
      const phrase = phraseForRealm(realm);
      shapes.add(phrase.join(','));
      spans.add(Math.max(...phrase) - Math.min(...phrase));
    }
    expect(shapes.size, '每個境界的旋律應該不一樣').toBe(8);
    expect(spans.size, '音域應該一致，只有輪廓在換').toBe(1);
  });
});
