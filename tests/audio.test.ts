import { describe, it, expect } from 'vitest';
import {
  BASS_BEATS,
  BARS_PER_PHRASE,
  BEATS_PER_BAR,
  CHORD_ROOTS,
  DRUM_BEATS,
  MELODY_CEILING,
  barForRealm,
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

  it('每個境界都有完整的四小節樂句，不是八拍在無限重複', () => {
    // 第一版只有一小節八拍（2.4 秒）在循環，聽兩輪就膩。
    // 四小節是流行歌最基本的樂句長度，也是重複才不會膩的下限。
    expect(BARS_PER_PHRASE).toBeGreaterThanOrEqual(4);
    for (let realm = 0; realm < 10; realm += 1) {
      expect(phraseForRealm(realm)).toHaveLength(BARS_PER_PHRASE * BEATS_PER_BAR);
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
    for (let realm = 0; realm < 10; realm += 1) {
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) {
        const rhythm = barForRealm(realm, bar).rhythm;
        expect(rhythm).toHaveLength(BEATS_PER_BAR);
        expect(rhythm.some((on) => on)).toBe(true);
        expect(rhythm.some((on) => !on)).toBe(true);
      }
    }
  });

  it('低音一小節走四下，而且是根音與五度交替', () => {
    // 原本一小節只撥兩下根音，撐得住但推不動。
    expect(BASS_BEATS).toHaveLength(BEATS_PER_BAR);
    const notes = BASS_BEATS.filter((degree): degree is number => degree !== null);
    expect(notes).toHaveLength(4);
    // 五聲音階的第 3 級就是純五度（7 個半音）。
    expect(PENTATONIC[3]).toBe(7);
    expect(new Set(notes)).toEqual(new Set([0, 3]));
  });

  it('鼓點是兩個正拍加一個切分，不是每拍都打', () => {
    expect(DRUM_BEATS).toContain(0);
    expect(DRUM_BEATS).toContain(4);
    expect(DRUM_BEATS.length).toBeLessThan(BEATS_PER_BAR / 2);
  });

  it('樂句有起伏，不是原地踱步', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      const phrase = phraseForRealm(realm);
      const span = Math.max(...phrase) - Math.min(...phrase);
      expect(span, `第 ${realm} 個境界的樂句音域只有 ${span} 級，太平`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('和聲進行', () => {
  it('四個和弦走一輪，不是從頭到尾釘在主音上', () => {
    // 第一版低音一直在同一個和弦上打轉，那才是它單調的真正原因——
    // 沒有和聲進行，速度與節奏再怎麼調都只是原地繞。
    expect(CHORD_ROOTS).toHaveLength(BARS_PER_PHRASE);
    expect(new Set(CHORD_ROOTS).size).toBe(BARS_PER_PHRASE);
    // I – V – vi – IV：流行樂用得最兇的一組。
    expect([...CHORD_ROOTS]).toEqual([0, 7, 9, 5]);
  });

  it('每個和弦的音都在大調音階內，五聲旋律走上去不會撞', () => {
    // 這是選這組進行的實際理由：五聲音階（do re mi so la）落在這四個和弦上
    // 沒有一個是避開音，旋律可以自由走，不必為了配和弦而挑音。
    const MAJOR = [0, 2, 4, 5, 7, 9, 11];
    for (const chordRoot of CHORD_ROOTS) {
      // 大三或小三和弦的三個音
      const third = MAJOR.includes((chordRoot + 4) % 12) ? 4 : 3;
      for (const interval of [0, third, 7]) {
        expect(MAJOR).toContain((chordRoot + interval) % 12);
      }
    }
  });

  it('每一小節的第一個音都落在當下的和弦音上', () => {
    // 旋律和低音要是同一件事，不是各走各的。
    for (let realm = 0; realm < 10; realm += 1) {
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) {
        const { degrees, chordRoot } = barForRealm(realm, bar);
        const first = degrees[0];
        if (first === undefined) throw new Error('小節是空的');
        const interval = ((PENTATONIC[first % PENTATONIC.length] ?? 0) - chordRoot + 12) % 12;
        // 和弦音：根音、三度（大或小）、五度。
        expect(
          [0, 3, 4, 7, 9].includes(interval),
          `第 ${realm} 境界第 ${bar + 1} 小節起音不在和弦上（相差 ${interval} 半音）`,
        ).toBe(true);
      }
    }
  });

  it('境界之間旋律與和弦一起轉，起頭的和弦不同、情緒就不同', () => {
    // 一起轉才保得住「每小節第一個音落在和弦音上」。
    const starts = new Set<number>();
    for (let realm = 0; realm < BARS_PER_PHRASE; realm += 1) {
      starts.add(barForRealm(realm, 0).chordRoot);
    }
    expect(starts.size, '每個境界應該從不同的和弦起頭').toBe(BARS_PER_PHRASE);
  });
});

describe('配樂的亮度', () => {
  it('正常情況下不需要折八度——亮度純粹由主音決定', () => {
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

  it('最高的音不刺耳', () => {
    let peak = 0;
    for (let realm = 0; realm < 10; realm += 1) {
      const root = rootForRealm(realm);
      peak = Math.max(
        peak,
        ...phraseForRealm(realm).map((d) => noteFrequency(scaleNote(root + 24, d % PENTATONIC.length))),
      );
    }
    expect(peak, `最高音 ${Math.round(peak)}Hz 太刺耳`).toBeLessThanOrEqual(1500);
  });
});

describe('樂句的高點', () => {
  it('全曲最高的那個音要真的被彈出來，不能排在休止上', () => {
    // 寫了一個高點卻從來沒彈出來，等於沒有高點。
    for (let realm = 0; realm < 10; realm += 1) {
      const sounded: number[] = [];
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) {
        const { degrees, rhythm } = barForRealm(realm, bar);
        degrees.forEach((degree, beat) => {
          if (rhythm[beat] === true) sounded.push(degree);
        });
      }
      const peak = Math.max(...phraseForRealm(realm));
      expect(Math.max(...sounded), `第 ${realm} 個境界的最高音沒有被彈出來`).toBe(peak);
    }
  });

  it('每一段都有落回主音的收句', () => {
    // 沒有解決感的段落接回開頭會很突兀。
    for (let realm = 0; realm < 10; realm += 1) {
      const sounded: number[] = [];
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) {
        const { degrees, rhythm } = barForRealm(realm, bar);
        degrees.forEach((degree, beat) => {
          if (rhythm[beat] === true) sounded.push(degree);
        });
      }
      expect(sounded, `第 ${realm} 個境界整段都沒有回到主音`).toContain(0);
    }
  });
});
