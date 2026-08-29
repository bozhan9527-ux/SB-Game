/**
 * 音高、和弦進行與樂句。
 *
 * 修仙題材配上五聲音階（宮商角徵羽）最省事也最對味——五聲音階任兩音都不會撞，
 * 隨機取音也不會難聽，很適合這種程式即時生成的配樂。
 *
 * 但「不難聽」和「好聽」之間差的是**結構**。第一版只有一小節八拍在無限重複，
 * 而且低音從頭到尾釘在同一個和弦上——沒有和聲進行，再怎麼調速度與節奏都只是原地打轉。
 * 現在改用流行歌最通用的骨架：四小節一段、四個和弦走一輪、樂句做成 A－A－B－A'。
 */

/** 五聲音階相對於主音的半音數：宮 商 角 徵 羽。 */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** 一小節八拍（八分音符）。 */
export const BEATS_PER_BAR = 8;
/** 一段四小節。這是流行歌最基本的樂句長度，也是重複才不會膩的下限。 */
export const BARS_PER_PHRASE = 4;

/**
 * 和弦進行：I – V – vi – IV（相對主音的半音數）。
 *
 * 這是流行樂裡用得最兇的一組，理由也很實際：四個和弦都只含大調音階內的音，
 * 而五聲音階（宮商角徵羽 = do re mi so la）落在這四個和弦上沒有一個是避開音——
 * 也就是說旋律可以自由走，不必為了配和弦而挑音。
 *
 * vi 那一小節會帶出一點惆悵，IV 再把它推回來，整段就有了起承轉合，
 * 而不是像第一版那樣八拍一個迴圈原地繞。
 */
export const CHORD_ROOTS = [0, 7, 9, 5] as const;

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
 * 旋律與點綴的音域上限（相對 A4 的半音數）。
 *
 * 訂在「最高的境界剛好不用折」的位置：正常情況下 octaveShift 永遠回 0，
 * 亮度就純粹由主音決定，越高的境界越亮。這兩個數字是安全網，不是日常會踩到的線。
 */
export const MELODY_CEILING = 16;
export const SPARKLE_CEILING = 21;

/** 境界越高，主音越高，配樂自然變得更亮。 */
export function rootForRealm(realmIndex: number): number {
  // 從 A2（-24）起，每兩個境界升一個全音，最多升到 A3 附近。
  return -24 + Math.min(12, Math.floor(realmIndex / 2) * 2);
}

/**
 * 四小節的旋律，音級以五聲音階計（0=宮 1=商 2=角 3=徵 4=羽，5 以上是上一個八度）。
 *
 * 四小節做成一條**起承轉合的弧線**：
 * 第一節往上鋪、第二節在徵音上盤旋、第三節推到全曲最高、第四節一路級進落回主音收句。
 * 第一版沒有這個形狀，只有八拍在原地轉，所以聽兩輪就膩。
 *
 * 每一小節的第一個音都刻意落在**當下那個和弦的和弦音**上：
 * I 起於宮、V 起於徵、vi 起於羽、IV 起於羽——旋律和低音才是同一件事，不是各走各的。
 *
 * 境界之間會旋轉起點（見 barForRealm），所以只有第 0 個境界是從第一節開始聽。
 * 這不要緊：I–V–vi–IV 從任何一點切進去都是流行樂用了幾十年的進行
 * （V–vi–IV–I、vi–IV–I–V、IV–I–V–vi 各自都是常見組合），每個境界因此有自己的情緒。
 */
const PHRASE: readonly (readonly number[])[] = [
  [0, 2, 4, 3, 2, 4, 5, 4], // A ：I  ——往上鋪
  [3, 5, 4, 3, 2, 3, 4, 3], // A ：V  ——同樣的走法，換個落點
  [4, 3, 2, 4, 5, 7, 5, 4], // B ：vi ——推到全曲最高
  [4, 2, 3, 2, 0, 2, 1, 0], // A'：IV ——落回主音收句
];

/**
 * 每一小節哪幾拍出聲。
 *
 * 每一拍都平均落下聽起來像節拍器，不像音樂——留白才有律動。
 * 第三小節（B 句）刻意換一種切分，做出「這裡不一樣」的對比；
 * 第四小節結尾多補一個音，收得乾淨。
 */
const RHYTHM: readonly (readonly boolean[])[] = [
  [true, false, true, true, false, true, true, false],
  [true, false, true, true, false, true, true, false],
  // 第三節換一種切分做對比，而且要讓第 6 拍出聲——全曲最高的那個音在那裡。
  // 第一版把它排成休止，等於寫了一個高點卻從來沒彈出來。
  [true, true, false, true, true, true, false, false],
  [true, false, true, true, false, true, true, true],
];

/** 低音的音級（null 為休止），相對於**當下的和弦根音**。根音與五度交替，走出往前推的步伐。 */
export const BASS_BEATS: readonly (number | null)[] = [0, null, 3, null, 0, null, 3, null];

/** 鼓點：兩個正拍加一個切分，流行歌最基本的律動。 */
export const DRUM_BEATS: readonly number[] = [0, 4, 6];

/**
 * 這個境界的第 bar 小節。
 *
 * 境界之間換的是**整段的起點**（旋律與和弦一起轉），不是音高。
 * 一起轉才保得住「每小節的第一個音落在和弦音上」這件事；
 * 而從不同的和弦起頭，同一段聽起來的情緒也真的不一樣——
 * 從 vi 起頭偏惆悵，從 IV 起頭有被托起來的感覺。
 */
export function barForRealm(realmIndex: number, bar: number): {
  degrees: readonly number[];
  rhythm: readonly boolean[];
  chordRoot: number;
} {
  const offset = (realmIndex + bar) % BARS_PER_PHRASE;
  return {
    degrees: PHRASE[offset] ?? PHRASE[0] ?? [],
    rhythm: RHYTHM[offset] ?? RHYTHM[0] ?? [],
    chordRoot: CHORD_ROOTS[offset] ?? 0,
  };
}

/** 這個境界完整的四小節旋律音級，攤平成一條。測試與音域計算用。 */
export function phraseForRealm(realmIndex: number): number[] {
  const out: number[] = [];
  for (let bar = 0; bar < BARS_PER_PHRASE; bar += 1) out.push(...barForRealm(realmIndex, bar).degrees);
  return out;
}
