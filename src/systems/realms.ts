/**
 * 境界查詢。關卡編號 → 境界（煉氣期 / 築基期 / 金丹期 …），數值來自 data/realms.json。
 */
import { REALMS } from '../data';
import type { Realm } from '../data/types';

const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const;

/** 關卡所屬的境界。超出資料表範圍時回傳最後一個境界（飛升境為無限關）。 */
export function realmForStage(stage: number): Realm {
  const last = REALMS[REALMS.length - 1];
  if (last === undefined) throw new Error('realms.json 為空');
  for (const realm of REALMS) {
    if (stage >= realm.stageFrom && stage <= realm.stageTo) return realm;
  }
  return stage < 1 ? (REALMS[0] ?? last) : last;
}

/** 境界在資料表中的索引，用於難度成長與境界壓制。 */
export function realmIndexForStage(stage: number): number {
  const realm = realmForStage(stage);
  return REALMS.findIndex((item) => item.id === realm.id);
}

/** 在該境界中的第幾層（1 起算）。 */
export function layerWithinRealm(stage: number): number {
  const realm = realmForStage(stage);
  return Math.max(1, stage - realm.stageFrom + 1);
}

function chineseNumber(value: number): string {
  if (value <= 10) return CHINESE_DIGITS[value] ?? String(value);
  if (value < 20) return `十${CHINESE_DIGITS[value - 10] ?? ''}`;
  return String(value);
}

/** 下一個境界的名稱；已在最後一個境界時回傳自己。 */
export function nextRealmName(stage: number): string {
  const index = realmIndexForStage(stage);
  const next = REALMS[index + 1] ?? REALMS[index];
  return next?.name ?? '';
}

/** 例：「煉氣期 二層」。 */
export function realmTitle(stage: number): string {
  return `${realmForStage(stage).name} ${chineseNumber(layerWithinRealm(stage))}層`;
}
