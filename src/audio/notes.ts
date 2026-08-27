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

/** 境界越高，主音越高，配樂自然變得更亮。 */
export function rootForRealm(realmIndex: number): number {
  // 從 A2（-24）起，每兩個境界升一個全音，最多升到 A3 附近。
  return -24 + Math.min(12, Math.floor(realmIndex / 2) * 2);
}

/**
 * 一小節八拍的音級序列。以境界索引為種子產生，同一個境界的旋律固定，
 * 換境界時旋律跟著換，玩家推進時聽得出來。
 */
export function phraseForRealm(realmIndex: number): number[] {
  const base = [0, 2, 4, 2, 3, 1, 4, 2];
  const shift = realmIndex % PENTATONIC.length;
  return base.map((degree, index) => degree + shift + (index % 4 === 3 ? 5 : 0));
}
