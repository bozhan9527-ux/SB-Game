/**
 * 飛升境的天劫：第 82 關起，每一關由關卡編號決定一到三條天劫。
 *
 * **只看關卡編號，不擲骰、不讓玩家選。** 所以伺服器重播時自己算得出同一組，
 * 不必相信客戶端報的任何東西；同一關重打也是同一組，玩家可以針對它換符。
 *
 * 本檔不 import Phaser。
 */
import { BALANCE, TRIBULATIONS } from '../data';
import type { TribulationDef } from '../data/types';
import { createRng } from './rng';

/** 天劫從哪一關開始：飛升境的第一關，也就是轉世的門檻。 */
export function tribulationStart(): number {
  return BALANCE.rebirth.minStage;
}

/** 最多疊幾條。四條以上就不是「有自己條件的一關」，是一團看不清的懲罰。 */
export const MAX_TRIBULATIONS = 3;

/** 每深幾關多一條。 */
export const TRIBULATION_STEP = 10;

export function tribulationsFor(stage: number): TribulationDef[] {
  const start = tribulationStart();
  if (stage < start) return [];
  const count = Math.min(MAX_TRIBULATIONS, 1 + Math.floor((stage - start) / TRIBULATION_STEP));
  // 和戰鬥、奇遇的種子都錯開：天劫不該和那一關的妖魔編成綁在一起。
  const rng = createRng((stage * 7703) ^ 0x7a1b5);
  const pool = [...TRIBULATIONS];
  const picked: TribulationDef[] = [];
  while (picked.length < count && pool.length > 0) {
    const [item] = pool.splice(rng.int(0, pool.length - 1), 1);
    if (item !== undefined) picked.push(item);
  }
  return picked;
}

/** 「雷劫・心魔劫」。 */
export function tribulationNames(list: readonly TribulationDef[]): string {
  return list.map((item) => item.name).join('・');
}
