/**
 * 音高、和弦進行與樂句。
 *
 * 修仙題材配上五聲音階（宮商角徵羽）最省事也最對味——五聲音階任兩音都不會撞，
 * 很適合這種程式即時生成的配樂。
 *
 * 2026-10-13 隨手繪改版重新編排：原本是古箏單音旋律配流行和弦，四小節一輪，聽久了像兒歌。
 * 現在照國樂的編制分四層——
 * - **洞簫主旋律**：長短音交錯、帶顫音與氣聲，八小節一段、有起承轉合
 * - **古箏琶音**：根音、五度、八度的空五度分解（古箏的招牌聲響），每拍一顆
 * - **笙的持續和聲**：根音加五度墊在底下，慢起慢收
 * - **木魚與碰鈴**：木魚點拍、碰鈴兩小節一響
 */
/** 五聲音階相對於主音的半音數：宮 商 角 徵 羽。 */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** 一小節八拍（八分音符）。 */
export const BEATS_PER_BAR = 8;
/** 一段八小節：前四小節陳述、後四小節推到高點再收回主音。 */
export const BARS_PER_PHRASE = 8;

/**
 * 和弦進行：I – vi – IV – V – I – vi – ii – V（相對主音的半音數）。
 *
 * 前四小節是最穩的一輪；後四小節把 IV 換成 ii，色彩更幽一點，最後停在 V 上——
 * 不落地，才會自然接回下一輪的 I。所有和弦音都在大調音階內，
 * 五聲旋律（do re mi so la）走在上面不會撞。
 */
export const CHORD_ROOTS = [0, 9, 5, 7, 0, 9, 2, 7] as const;

/** A4 = 440Hz，以半音距離換算頻率。 */
export function noteFrequency(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

/**
 * 取五聲音階中的第 n 個音（可超出一個八度，自動往上疊）。
 * degree 允許為負，代表往下走。
 */
export function scaleNote(rootSemitone: number, degree: number): number {
  const size = PENTATONIC.length;
  const octave = Math.floor(degree / size);
  const index = ((degree % size) + size) % size;
  return rootSemitone + octave * 12 + (PENTATONIC[index] ?? 0);
}

/**
 * 整段樂句要一起降幾個八度，才能讓最高音落在上限之內。
 *
 * **必須整段一起移，不能逐音折。** 逐音折的話，超過上限的那幾個音會掉到下一個八度，
 * 旋律的輪廓就整個折壞了（實測音域會從八度縮成五度，聽起來變成原地打轉）。
 */
export function octaveShift(highestSemitone: number, ceiling: number): number {
  let shift = 0;
  while (highestSemitone + shift > ceiling) shift -= 12;
  return shift;
}

/**
 * 簫的旋律與古箏琶音的音域上限（相對 A4 的半音數）。
 *
 * 訂在「最高的境界剛好不用折」的位置：正常情況下 octaveShift 永遠回 0，
 * 亮度就純粹由主音決定，越高的境界越亮。這兩個數字是安全網，不是日常會踩到的線。
 */
export const MELODY_CEILING = 16;
export const ARPEGGIO_CEILING = 21;

/** 境界越高，主音越高，配樂自然變得更亮。 */
export function rootForRealm(realmIndex: number): number {
  // 從 A2（-24）起，每兩個境界升一個全音，最多升到 A3 附近。
  return -24 + Math.min(12, Math.floor(realmIndex / 2) * 2);
}

/** 簫的一個音：音級（五聲音階，5 以上是上一個八度）、從第幾拍起、吹幾拍。 */
export interface FluteNote {
  degree: number;
  at: number;
  beats: number;
}

/**
 * 八小節的簫旋律。每一小節的第一個音都落在當下和弦的和弦音上（旋律和低音是同一件事）。
 *
 * 一、二小節往上鋪；三、四小節從八度宮音一路級進回徵音；
 * 五、六小節推到全曲最高的角音（第 7 級）；七、八小節一路落回宮音收句。
 * 長音（三、四拍）與短音（一拍）交錯，簫才有「吹」的感覺，不是一顆一顆撥出來。
 */
const MELODY: readonly (readonly FluteNote[])[] = [
  [{ degree: 0, at: 0, beats: 2 }, { degree: 1, at: 2, beats: 1 }, { degree: 2, at: 3, beats: 1 }, { degree: 4, at: 4, beats: 4 }],
  [{ degree: 4, at: 0, beats: 3 }, { degree: 3, at: 3, beats: 1 }, { degree: 2, at: 4, beats: 2 }, { degree: 1, at: 6, beats: 2 }],
  [{ degree: 5, at: 0, beats: 2 }, { degree: 4, at: 2, beats: 2 }, { degree: 3, at: 4, beats: 2 }, { degree: 4, at: 6, beats: 2 }],
  [{ degree: 3, at: 0, beats: 4 }, { degree: 2, at: 4, beats: 2 }, { degree: 1, at: 6, beats: 2 }],
  [{ degree: 2, at: 0, beats: 2 }, { degree: 4, at: 2, beats: 2 }, { degree: 5, at: 4, beats: 2 }, { degree: 7, at: 6, beats: 2 }],
  [{ degree: 7, at: 0, beats: 3 }, { degree: 6, at: 3, beats: 1 }, { degree: 5, at: 4, beats: 2 }, { degree: 4, at: 6, beats: 2 }],
  [{ degree: 6, at: 0, beats: 2 }, { degree: 5, at: 2, beats: 2 }, { degree: 4, at: 4, beats: 2 }, { degree: 3, at: 6, beats: 2 }],
  [{ degree: 1, at: 0, beats: 2 }, { degree: 2, at: 2, beats: 1 }, { degree: 1, at: 3, beats: 1 }, { degree: 0, at: 4, beats: 4 }],
];

/**
 * 古箏的分解和弦：相對當下和弦根音的半音數，每拍一顆（null 為休止）。
 * 只用根音、五度、八度——空五度是古箏最有辨識度的聲響，也不會和簫的五聲旋律撞。
 * 最後一拍空下來，讓小節之間有一口氣。
 */
export const ARPEGGIO: readonly (number | null)[] = [0, 7, 12, 7, 12, 19, 12, null];

/** 低音（古箏低音弦）在哪幾拍、彈根音還是五度（相對和弦根音的半音數）。 */
export const BASS_BEATS: readonly (number | null)[] = [0, null, null, null, 7, null, null, null];

/** 木魚：兩個正拍加一個切分。音量壓得很低，它是律動不是節拍器。 */
export const DRUM_BEATS: readonly number[] = [0, 3, 6];

/** 碰鈴幾小節響一次。 */
export const BELL_EVERY_BARS = 2;

/**
 * 這個境界的第 bar 小節。
 *
 * 境界之間換的是**整段的起點**（旋律與和弦一起轉，每個境界錯開兩小節），不是音高。
 * 一起轉才保得住「每小節的第一個音落在和弦音上」；從不同的和弦起頭，
 * 同一段聽起來的情緒也真的不一樣——從 vi 起頭偏惆悵，從 IV 起頭有被托起來的感覺。
 */
export function barForRealm(realmIndex: number, bar: number): {
  notes: readonly FluteNote[];
  chordRoot: number;
  bell: boolean;
} {
  const offset = (realmIndex * 2 + bar) % BARS_PER_PHRASE;
  return {
    notes: MELODY[offset] ?? MELODY[0] ?? [],
    chordRoot: CHORD_ROOTS[offset] ?? 0,
    bell: offset % BELL_EVERY_BARS === 0,
  };
}

/** 這個境界完整一段的旋律音級，攤平成一條。測試與音域計算用。 */
export function phraseForRealm(realmIndex: number): number[] {
  const out: number[] = [];
  for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) out.push(...barForRealm(realmIndex, bar).notes.map((note) => note.degree));
  return out;
}
