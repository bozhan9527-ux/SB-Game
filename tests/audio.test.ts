import { describe, it, expect } from 'vitest';
import {
  ARPEGGIO,
  ARPEGGIO_CEILING,
  BASS_BEATS,
  BARS_PER_PHRASE,
  BEATS_PER_BAR,
  CHORD_ROOTS,
  DRUM_BEATS,
  MELODY_CEILING,
  barForRealm,
  PENTATONIC,
  octaveShift,
  noteFrequency,
  phraseForRealm,
  rootForRealm,
  scaleNote,
} from '../src/audio/notes';
import { renderFlute, renderGong, renderNoise, renderPad, renderPluck, renderThud, renderWoodblock } from '../src/audio/synth';
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

  it('每個境界都有完整的八小節樂句，不是一小節在無限重複', () => {
    // 第一版只有一小節八拍（2.4 秒）在循環，聽兩輪就膩；第二版四小節，聽久了像兒歌。
    expect(BARS_PER_PHRASE).toBe(8);
    for (let realm = 0; realm < 10; realm += 1) {
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) {
        const { notes } = barForRealm(realm, bar);
        // 每一小節的簫音剛好吹滿八拍、不重疊、不超出小節。
        let cursor = 0;
        for (const note of notes) {
          expect(note.at).toBe(cursor);
          cursor += note.beats;
        }
        expect(cursor).toBe(BEATS_PER_BAR);
      }
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

describe('配樂的編制', () => {
  it('簫的旋律長短音交錯：有拖長的音，也有一拍的短音', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      const lengths = new Set<number>();
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) for (const note of barForRealm(realm, bar).notes) lengths.add(note.beats);
      expect(Math.max(...lengths)).toBeGreaterThanOrEqual(3);
      expect(Math.min(...lengths)).toBe(1);
    }
  });

  it('古箏只彈根音、五度、八度（空五度），而且留一拍換氣', () => {
    expect(ARPEGGIO).toHaveLength(BEATS_PER_BAR);
    for (const step of ARPEGGIO) if (step !== null) expect([0, 7, 12, 19]).toContain(step);
    expect(ARPEGGIO.some((step) => step === null)).toBe(true);
  });

  it('低音只在正拍撥根音與五度', () => {
    expect(BASS_BEATS).toHaveLength(BEATS_PER_BAR);
    expect(BASS_BEATS[0]).toBe(0);
    expect(BASS_BEATS.filter((step) => step !== null)).toEqual([0, 7]);
  });

  it('木魚是兩個正拍加一個切分，不是每拍都打', () => {
    expect(DRUM_BEATS).toContain(0);
    expect(DRUM_BEATS.length).toBeLessThan(BEATS_PER_BAR / 2);
  });

  it('碰鈴兩小節一響，一段裡響四次', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      let bells = 0;
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) if (barForRealm(realm, bar).bell) bells += 1;
      expect(bells).toBe(BARS_PER_PHRASE / 2);
    }
  });

  it('樂句有起伏，不是原地踱步', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      const phrase = phraseForRealm(realm);
      const span = Math.max(...phrase) - Math.min(...phrase);
      expect(span, `第 ${realm} 個境界的樂句音域只有 ${span} 級，太平`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('和聲進行', () => {
  it('八小節走一輪，至少用到五個不同的和弦，最後停在屬和弦上接回開頭', () => {
    expect(CHORD_ROOTS).toHaveLength(BARS_PER_PHRASE);
    expect(new Set(CHORD_ROOTS).size).toBeGreaterThanOrEqual(5);
    expect(CHORD_ROOTS[0]).toBe(0);
    expect(CHORD_ROOTS[BARS_PER_PHRASE - 1]).toBe(7);
  });

  it('每個和弦的音都在大調音階內，五聲旋律走上去不會撞', () => {
    const MAJOR = [0, 2, 4, 5, 7, 9, 11];
    for (const chordRoot of CHORD_ROOTS) {
      const third = MAJOR.includes((chordRoot + 4) % 12) ? 4 : 3;
      for (const interval of [0, third, 7]) {
        expect(MAJOR).toContain((chordRoot + interval) % 12);
      }
    }
  });

  it('每一小節的第一個音都落在當下的和弦音上', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) {
        const { notes, chordRoot } = barForRealm(realm, bar);
        const first = notes[0]?.degree;
        if (first === undefined) throw new Error('小節是空的');
        const interval = ((PENTATONIC[first % PENTATONIC.length] ?? 0) - chordRoot + 12) % 12;
        expect(
          [0, 3, 4, 7].includes(interval),
          `第 ${realm} 境界第 ${bar + 1} 小節起音不在和弦上（相差 ${interval} 半音）`,
        ).toBe(true);
      }
    }
  });

  it('境界之間旋律與和弦一起轉，起頭的位置不同、情緒就不同', () => {
    const starts = new Set<string>();
    for (let realm = 0; realm < BARS_PER_PHRASE / 2; realm += 1) {
      starts.add(barForRealm(realm, 0).notes.map((note) => note.degree).join(','));
    }
    expect(starts.size).toBe(BARS_PER_PHRASE / 2);
  });
});

describe('配樂的亮度', () => {
  it('正常情況下不需要折八度——亮度純粹由主音決定', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      const root = rootForRealm(realm);
      const melody = phraseForRealm(realm).map((degree) => scaleNote(root + 12, degree));
      expect(octaveShift(Math.max(...melody), MELODY_CEILING), `第 ${realm} 個境界的旋律需要折八度`).toBe(0);
      const arpTop = root + 9 + Math.max(...ARPEGGIO.map((step) => step ?? 0));
      expect(octaveShift(arpTop, ARPEGGIO_CEILING), `第 ${realm} 個境界的古箏需要折八度`).toBe(0);
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
      peak = Math.max(peak, ...phraseForRealm(realm).map((d) => noteFrequency(scaleNote(root + 12, d))));
      peak = Math.max(peak, noteFrequency(root + 9 + 19));
    }
    expect(peak, `最高音 ${Math.round(peak)}Hz 太刺耳`).toBeLessThanOrEqual(1500);
  });
});

describe('樂句的高點與收句', () => {
  it('全曲最高的那個音吹得夠長，聽得出那是高點', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      const peak = Math.max(...phraseForRealm(realm));
      let longest = 0;
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) {
        for (const note of barForRealm(realm, bar).notes) if (note.degree === peak) longest = Math.max(longest, note.beats);
      }
      expect(longest, `第 ${realm} 個境界的最高音只吹了 ${longest} 拍`).toBeGreaterThanOrEqual(2);
    }
  });

  it('整段有一個拖長的宮音收句', () => {
    for (let realm = 0; realm < 10; realm += 1) {
      let resolved = false;
      for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) {
        for (const note of barForRealm(realm, bar).notes) if (note.degree === 0 && note.beats >= 4) resolved = true;
      }
      expect(resolved, `第 ${realm} 個境界整段都沒有落回主音`).toBe(true);
    }
  });
});

describe('國樂音色', () => {
  it('簫聲有起音也會收尾，不會爆音', () => {
    const data = samples(withSeededRandom(3, () => renderFlute(fakeContext(), 440, 0.6)));
    expect(Math.abs(data[0] ?? 1)).toBeLessThan(0.05);
    expect(Math.abs(data[data.length - 1] ?? 1)).toBeLessThan(0.05);
    expect(rms(data, Math.floor(data.length * 0.4), Math.floor(data.length * 0.6))).toBeGreaterThan(0.1);
  });

  it('簫聲的基頻與指定音高相符', () => {
    const data = samples(withSeededRandom(5, () => renderFlute(fakeContext(), 440, 0.6)));
    const rate = 44100;
    const f = fundamental(data, rate, Math.floor(rate * 0.1), Math.floor(rate * 0.25));
    expect(Math.abs(f - 440) / 440).toBeLessThan(0.05);
  });

  it('笙慢起慢收、木魚一下就停', () => {
    const pad = samples(renderPad(fakeContext(), 220, 2));
    expect(rms(pad, 0, 2205)).toBeLessThan(rms(pad, 30000, 50000));
    const block = samples(withSeededRandom(7, () => renderWoodblock(fakeContext())));
    expect(rms(block, 0, 1000)).toBeGreaterThan(rms(block, block.length - 1000, block.length) * 10);
  });
});

describe('攻擊音', () => {
  it('每一種符都明確歸到一類攻擊音（新增符時別忘了配聲音）', async () => {
    const { CARDS } = await import('../src/data');
    const source = await import('../src/audio');
    // 沒列在表上的符會退回劍聲，所以要檢查的是「表上有沒有它」，不是 attackVoice 回傳什麼。
    for (const card of CARDS) {
      expect([card.id, card.id in source.ATTACK_VOICE]).toEqual([card.id, true]);
    }
    expect(new Set(CARDS.map((card) => source.attackVoice(card.id))).size).toBe(6);
  });
});
