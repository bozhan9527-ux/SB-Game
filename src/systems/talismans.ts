/**
 * 符籙譜：二十張符裡挑四張帶進場。
 *
 * 本檔不 import Phaser，全部是純函式。
 *
 * **為什麼是「只能帶四張」而不是「全部都會出現」。**
 * 抽符池若含二十種，同一種符要湊到第二張的機率只剩二十分之一，合成——也就是這個遊戲
 * 唯一的指數成長來源——會直接停擺。池子必須小。而四這個數字同時符合另外兩件事：
 * 3×3 的陣法天花板是在「場上只有四種符」的前提下算出來的（八條、484 種解），
 * 而五行陣要湊三種不同，四種正好留一點餘裕。
 *
 * **為什麼用關卡解鎖而不是花金幣買。**
 * 金幣已經有六條升級線在搶，再多一個買處會稀釋掉每一筆的份量。
 * 用歷史最高關卡解鎖則不花任何資源，純粹是「打得越深、選擇越多」——
 * 而且它答得出「我為什麼還要再往前推」這個問題。
 *
 * 後解鎖的符**不是更強的符**，是條件不同的符。誅仙符對首領近兩倍、對雜兵平平；
 * 引靈符自己幾乎不輸出，靠的是把相鄰四格撐起來。強弱由帶什麼、怎麼擺決定，
 * 不由解鎖順序決定——否則選擇會在解鎖完成的那一刻塌成唯一解。
 */
import { CARDS, TALISMAN_SLOTS } from '../data';
import type { CardDef } from '../data/types';

export { TALISMAN_SLOTS };

/** 開局就有的四張，也是舊存檔升級後的預設配置。 */
export function starterTalismans(): string[] {
  return CARDS.filter((card) => card.unlockStage <= 1)
    .slice(0, TALISMAN_SLOTS)
    .map((card) => card.id);
}

export function talismanDef(id: string): CardDef | null {
  return CARDS.find((card) => card.id === id) ?? null;
}

/**
 * 已解鎖的符。
 *
 * **解鎖來源已經從「推到第幾關」換成「藏經閣打到第幾層」。** 四張基礎符永遠有，
 * 其餘十六張一層一張，順序就是 cards.json 的順序。
 *
 * 這裡吃的是層數而不是存檔：伺服器重播一場成績時沒有存檔，只有玩家上報的數字，
 * 而它必須算出和玩家當時**完全相同**的抽符池，否則重播的是另一場仗。
 */
export function unlockedTalismans(libraryFloor: number): CardDef[] {
  const starters = CARDS.filter((card) => card.unlockStage <= 1);
  const rest = CARDS.filter((card) => card.unlockStage > 1);
  return [...starters, ...rest.slice(0, Math.max(0, Math.floor(libraryFloor)))];
}

export function isUnlocked(id: string, libraryFloor: number): boolean {
  return unlockedTalismans(libraryFloor).some((card) => card.id === id);
}

/** 下一張還沒解鎖的符，用於在畫面上告訴玩家「再打一層會拿到什麼」。 */
export function nextUnlock(libraryFloor: number): CardDef | null {
  const rest = CARDS.filter((card) => card.unlockStage > 1);
  return rest[Math.max(0, Math.floor(libraryFloor))] ?? null;
}

/**
 * 把存檔裡的選擇修成一份「一定能開場」的配置。
 *
 * 存檔可能來自舊版本、被手動改過、或引用到已經改名的符；
 * 這裡一律吞掉錯誤而不是 throw——開場崩潰的代價遠大於少了一張想帶的符。
 * 規則：去掉不存在／未解鎖／重複的，再用已解鎖的符依序補滿四格。
 */
export function sanitizeTalismans(chosen: readonly string[], libraryFloor: number): string[] {
  const unlocked = unlockedTalismans(libraryFloor);
  const result: string[] = [];
  for (const id of chosen) {
    if (result.length >= TALISMAN_SLOTS) break;
    if (result.includes(id)) continue;
    if (!unlocked.some((card) => card.id === id)) continue;
    result.push(id);
  }
  for (const card of unlocked) {
    if (result.length >= TALISMAN_SLOTS) break;
    if (!result.includes(card.id)) result.push(card.id);
  }
  return result;
}

/** 選擇是否已經湊滿四張、且每一張都合法。畫面用它決定「入山門」能不能按。 */
export function isCompleteLoadout(chosen: readonly string[], libraryFloor: number): boolean {
  if (chosen.length !== TALISMAN_SLOTS) return false;
  if (new Set(chosen).size !== TALISMAN_SLOTS) return false;
  return chosen.every((id) => isUnlocked(id, libraryFloor));
}

/** 帶進場的四張符的定義。順序即 sanitize 後的順序。 */
export function talismanDefs(chosen: readonly string[], libraryFloor: number): CardDef[] {
  return sanitizeTalismans(chosen, libraryFloor).map((id) => {
    const def = talismanDef(id);
    if (def === null) throw new Error(`不存在的符籙：${id}`);
    return def;
  });
}

/** 一張符的特效摘要，給選符畫面與說明頁共用——同一份文案不抄兩遍。 */
export function effectLines(def: CardDef): string[] {
  const e = def.effect;
  const pct = (value: number): string => `${Math.round(value * 100)}%`;
  const times = (value: number): string => `${value.toFixed(1)} 倍`;
  const lines: string[] = [];
  if (e.slowPercent > 0) lines.push(`減速 ${pct(e.slowPercent)}，持續 ${(e.slowMs / 1000).toFixed(1)} 秒`);
  if (e.burnPercent > 0) lines.push(`灼燒 ${pct(e.burnPercent)} 傷害，${(e.burnMs / 1000).toFixed(1)} 秒燒完`);
  if (e.executeBelow > 0) lines.push(`血量低於 ${pct(e.executeBelow)} 直接斬殺（首領免疫）`);
  if (e.carryOverkill) lines.push('溢出的傷害轉給下一隻，不浪費');
  if (e.critChance > 0) lines.push(`${pct(e.critChance)} 機率暴擊 ${times(e.critMultiplier)}`);
  if (e.bossMultiplier > 1) lines.push(`對首領傷害 ${times(e.bossMultiplier)}`);
  if (e.woundedMultiplier > 1) lines.push(`對半血以下的目標 ${times(e.woundedMultiplier)}`);
  if (e.freshMultiplier > 1) lines.push(`對八成血以上的目標 ${times(e.freshMultiplier)}`);
  if (e.rampPerShot > 0) lines.push(`連續出手每發 +${pct(e.rampPerShot)}，最高 ${times(e.rampMax)}`);
  if (e.auraDamage > 0) lines.push(`相鄰四格傷害 +${pct(e.auraDamage)}`);
  if (e.auraFireRate > 0) lines.push(`相鄰四格出手 +${pct(e.auraFireRate)}`);
  if (e.goldBonus > 0) lines.push(`在場上時全場金幣 +${pct(e.goldBonus)}`);
  if (e.drawSpeedBonus > 0) lines.push(`在場上時抽符 +${pct(e.drawSpeedBonus)}`);
  if (e.repairChance > 0) lines.push(`每次斬殺 ${pct(e.repairChance)} 機率補回一名弟子`);
  if (e.formationMultiplier > 1) lines.push(`自身吃到的陣法加成 ${times(e.formationMultiplier)}`);
  return lines;
}

/** 一張符的規格摘要，例如「一次 3 道，每 0.62 秒」。 */
export function statLine(def: CardDef): string {
  return `一次 ${def.targets} 道　每 ${(def.intervalMs / 1000).toFixed(2)} 秒`;
}

/**
 * 符籙的分類。
 *
 * 「帶哪四張」是這個遊戲裡唯一的 build 決策，而二十張符原本只能一張一張點開看說明——
 * 記不住上一張寫什麼，就等於沒得比。分類與排序的存在理由只有一個：
 * 讓玩家有辦法問出「哪幾張是同一類的」「哪一張最會打」，而不是靠記憶力。
 *
 * 分五類而不是照特效逐條分：類別要少到能一眼掃過，而且要對得上實際的取捨——
 * 單體與多目標是溢傷的取捨，控場與增益是「自己打」與「讓別人打得更好」的取捨。
 */
export type TalismanCategory = 'all' | 'single' | 'multi' | 'control' | 'support';

export const TALISMAN_CATEGORIES: readonly { id: TalismanCategory; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'single', name: '單體' },
  { id: 'multi', name: '多目標' },
  { id: 'control', name: '控場' },
  { id: 'support', name: '增益' },
];

export function matchesCategory(def: CardDef, category: TalismanCategory): boolean {
  const e = def.effect;
  if (category === 'all') return true;
  if (category === 'single') return def.targets === 1;
  if (category === 'multi') return def.targets >= 2;
  if (category === 'control') {
    return e.slowPercent > 0 || e.burnPercent > 0 || e.executeBelow > 0;
  }
  return (
    e.auraDamage > 0 ||
    e.auraFireRate > 0 ||
    e.goldBonus > 0 ||
    e.drawSpeedBonus > 0 ||
    e.repairChance > 0 ||
    e.formationMultiplier > 1
  );
}

export type TalismanSort = 'unlock' | 'dps' | 'rate' | 'targets';

export const TALISMAN_SORTS: readonly { id: TalismanSort; name: string }[] = [
  { id: 'unlock', name: '解鎖順序' },
  { id: 'dps', name: '每秒輸出' },
  { id: 'rate', name: '出手快慢' },
  { id: 'targets', name: '道數' },
];

/**
 * 依某個順序排出二十張符。
 *
 * 排序**不改變 cards.json 的順序**，回傳的是一份新陣列——
 * 那份順序同時是解鎖順序，動到它會讓「推到第幾關拿到什麼」整個錯位。
 *
 * dps 用第 1 階比較：階數成長對每一張符都是同一個倍率，
 * 所以任何固定階數排出來的名次都一樣，而第 1 階的數字最好懂。
 */
export function sortTalismans(
  defs: readonly CardDef[],
  mode: TalismanSort,
  dpsOf: (def: CardDef) => number,
): CardDef[] {
  const list = [...defs];
  if (mode === 'unlock') return list;
  if (mode === 'dps') return list.sort((a, b) => dpsOf(b) - dpsOf(a));
  if (mode === 'rate') return list.sort((a, b) => a.intervalMs - b.intervalMs);
  return list.sort((a, b) => b.targets - a.targets || dpsOf(b) - dpsOf(a));
}
