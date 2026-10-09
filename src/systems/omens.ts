/**
 * 關間奇遇：過關之後偶爾遇到，三選一，只影響下一場主線。
 *
 * **出不出現、出哪三個，全部由「剛過的那一關＋那一場的挑戰次數」決定。**
 * 奇遇裡有讓下一場變好打的選項，而上榜的成績是伺服器重播驗的——
 * 若選項是隨手擲的，任何人都能宣稱自己抽到了最好的那個。
 * 固定下來之後，伺服器用同一組數字就算得出當時給了哪三個，宣稱的不在裡面就退件。
 *
 * 本檔不 import Phaser。
 */
import { OMENS } from '../data';
import type { OmenDef } from '../data/types';
import { createRng } from './rng';

/** 規則字串的前綴。奇遇搭副本規則的便車進 LoadoutSpec.rules，伺服器才收得到。 */
export const OMEN_RULE_PREFIX = 'omen:';

/** 過關後遇到奇遇的機率。太常出現就不叫奇遇，變成每關都要做的一道選擇題。 */
export const OMEN_CHANCE = 0.3;

/** 第幾關之後才會遇到。前兩關還在學怎麼擺符，不該再多一件事。 */
export const OMEN_MIN_STAGE = 3;

/** 一次給幾個選項。 */
export const OMEN_CHOICES = 3;

/**
 * 通過第 stage 關（那一場的挑戰次數是 runs）之後遇到的奇遇；沒遇到回空陣列。
 *
 * 種子和戰鬥用的那一條刻意錯開（乘上不同的質數再異或）：
 * 兩者若共用，奇遇的結果就會和那一場妖魔的編成綁在一起。
 */
export function omenOffer(stage: number, runs: number): OmenDef[] {
  if (stage < OMEN_MIN_STAGE || runs < 0) return [];
  const rng = createRng((stage * 15485863) ^ (runs * 32452843) ^ 0x0be11);
  if (rng.next() >= OMEN_CHANCE) return [];
  const pool = [...OMENS];
  const picked: OmenDef[] = [];
  while (picked.length < OMEN_CHOICES && pool.length > 0) {
    const [omen] = pool.splice(rng.int(0, pool.length - 1), 1);
    if (omen !== undefined) picked.push(omen);
  }
  return picked;
}

export function omenById(id: string): OmenDef | null {
  return OMENS.find((omen) => omen.id === id) ?? null;
}

export function omenRule(id: string): string {
  return `${OMEN_RULE_PREFIX}${id}`;
}

/** 規則裡帶的奇遇。最多一個；帶了兩個以上視為無效（只會是偽造的）。 */
export function omenOfRules(rules: readonly string[]): OmenDef | null {
  const ids = rules.filter((rule) => rule.startsWith(OMEN_RULE_PREFIX));
  if (ids.length !== 1) return null;
  return omenById((ids[0] ?? '').slice(OMEN_RULE_PREFIX.length));
}

/**
 * 伺服器的驗證：第 stage 關（挑戰次數 runs）這一場帶的奇遇，是不是真的在上一關後被給過。
 *
 * 上一場一定是「通過 stage − 1、挑戰次數 runs − 1」：奇遇只在通關後出現，
 * 而通關會把關卡與挑戰次數各推進一。沒帶奇遇的一場一律合法。
 */
export function omenRulesValid(rules: readonly string[], stage: number, runs: number): boolean {
  const ids = rules.filter((rule) => rule.startsWith(OMEN_RULE_PREFIX));
  if (ids.length === 0) return true;
  const omen = omenOfRules(rules);
  if (omen === null) return false;
  return omenOffer(stage - 1, runs - 1).some((item) => item.id === omen.id);
}

/**
 * 效果的文字。由倍率組出來，不寫在資料裡——兩邊各寫一份，遲早會對不上。
 * 好處在前、代價在後，代價用「但」接起來。
 */
export function omenEffects(omen: OmenDef): { gains: string[]; costs: string[] } {
  const gains: string[] = [];
  const costs: string[] = [];
  const pct = (value: number): string => `${Math.round(Math.abs(value - 1) * 100)}%`;
  const pair = (value: number, up: string, down: string, higherIsBetter = true): void => {
    if (value === 1) return;
    const good = value > 1 === higherIsBetter;
    (good ? gains : costs).push(`${value > 1 ? up : down}${pct(value)}`);
  };
  pair(omen.damage, '法寶傷害 +', '法寶傷害 −');
  pair(omen.drawSpeed, '抽符速度 +', '抽符速度 −');
  pair(omen.disciples, '山門耐久 +', '山門耐久 −');
  if (omen.tierBonus > 0) gains.push(`階數上限 +${omen.tierBonus}`);
  if (omen.gold !== 1) gains.push(`金幣 ×${omen.gold}`);
  pair(omen.mobHp, '妖魔血量 +', '妖魔血量 −', false);
  pair(omen.bossTime, '首領時限 +', '首領時限 −');
  return { gains, costs };
}

/** 一行說完：「法寶傷害 +30%，但山門耐久 −30%」。 */
export function omenSummary(omen: OmenDef): string {
  const { gains, costs } = omenEffects(omen);
  const head = gains.join('、');
  return costs.length === 0 ? head : `${head}，但${costs.join('、')}`;
}
