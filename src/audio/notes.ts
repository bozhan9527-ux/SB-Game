/**
 * 音高與樂句。
 *
 * 修仙題材配上五聲音階（宮商角徵羽）最省事也最對味——五聲音階任兩音都不會撞，
 * 隨機取音也不會難聽，很適合這種程式即時生成的配樂。
 */

/** 五聲音階相對於主音的半音數：宮 商 角 徵 羽。 */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;

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
 * 主音隨境界升、樂句本身又往上跳，兩者相加到了後段境界會把旋律推到兩千赫茲以上——
 * 那不叫明亮叫刺耳。
 *
 * **必須整段一起移，不能逐音折。** 逐音折的話，超過上限的那幾個音會掉到下一個八度，
 * 旋律的輪廓就整個折壞了（實測境界 9 的起伏會從八度縮成五度，聽起來變成原地打轉）。
 * 整段移則只換音域，句子本身一模一樣。
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
 * 一小節八拍的音級序列。同一個境界的旋律固定，換境界時旋律跟著換，玩家推進時聽得出來。
 *
 * 音程刻意做大：原本是 0,2,4,2,3,1,4,2，級進為主、聽起來像在原地踱步。
 * 現在讓它往上跳再落下來，有起伏才有情緒。
 *
 * **境界之間換的是輪廓（旋轉起點），不是音高（整段移調）。**
 * 舊寫法把整段往上移最多四級（約一個八度），後段境界會飄到刺耳的音域，
 * 得靠折八度救回來——而折下來之後反而比前段境界更低，
 * 「境界越高配樂越亮」就整個不成立了。旋轉則完全不動音域，亮度純粹交給主音決定。
 */
export function phraseForRealm(realmIndex: number): number[] {
  const base = [0, 4, 2, 5, 3, 7, 4, 2];
  const start = realmIndex % base.length;
  return base.map((_, index) => base[(index + start) % base.length] ?? 0);
}

/**
 * 一小節裡哪幾拍出聲。
 *
 * 每一拍都平均落下聽起來像節拍器，不像音樂——留白才有律動。
 * 這組是「長短短　長短　長短」的切分，重音落在 0、3、5，走起來會跳。
 */
export const MELODY_BEATS: readonly boolean[] = [true, false, true, true, false, true, true, false];

/**
 * 低音的音級（null 為休止）。根音與五度交替，走出往前推的步伐。
 *
 * 原本一小節只在第 1 與第 5 拍撥兩下根音，撐得住但推不動；
 * 四下的根音—五度交替是最省事也最有效的「歡快」來源。
 */
export const BASS_BEATS: readonly (number | null)[] = [0, null, 3, null, 0, null, 3, null];
