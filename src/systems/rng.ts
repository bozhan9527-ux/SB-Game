/**
 * 可指定種子的偽亂數（mulberry32）。
 *
 * 關卡內容以「關卡編號 + 場次」為種子生成，好處是測試可重現，
 * 且同一關重打時的閘門配置會換一批而非固定。
 */
export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [min, max] 的整數。 */
  int(min: number, max: number): number;
  /** 依權重挑一個元素；weights 必須與 items 等長且總和大於 0。 */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      if (max < min) return min;
      return min + Math.floor(next() * (max - min + 1));
    },
    pickWeighted(items, weightOf) {
      const first = items[0];
      if (first === undefined) throw new Error('pickWeighted：items 不得為空');
      let total = 0;
      for (const item of items) total += Math.max(0, weightOf(item));
      if (total <= 0) return first;
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weightOf(item));
        if (roll <= 0) return item;
      }
      return items[items.length - 1] ?? first;
    },
  };
}
