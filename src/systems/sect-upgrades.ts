/**
 * 門派秘傳：一條沒有上限的深度升級線，一個門派各有一條。
 *
 * 這條線要解的是製作人實際玩到的那個問題——「飛升境的洞府都點到滿等級之後
 * 就沒有其他內容可以挑戰」。洞府那五條線有終點，而金幣沒有；一旦點滿，
 * 後面每一場的金幣就直接變成沒有用的數字，遊戲從那裡開始空掉。
 *
 * 三個決定：
 *
 * - **沒有上限。** 成本每級 ×1.3，而金幣收益每深一關 ×1.12，
 *   所以一級大約要往下推兩三關才買得起。它不是「再點滿一次」，
 *   是一條永遠買得下去、也永遠買不完的線。
 * - **一派一種效果。** 體修加耐久、劍修加首領傷害、符修加專精符、丹修加金幣。
 *   選門派的決定要一直有效，不能到後期變成「反正都是傷害 +x%」。
 * - **要拜在門下才買得到，換派就換一條。** 等級照門派各自記，和門派修為同一個道理：
 *   投入是留在那一派身上的，回去的時候還在。
 */
import { SECT_UPGRADES } from '../data';
import type { SectUpgradeTrack } from '../data/types';
import type { SaveData } from '../save/types';
import { BALANCE } from '../data';

/** 這一派的秘傳。沒有門派（或門派不存在）時為 null。 */
export function sectTrackFor(sectId: string | null): SectUpgradeTrack | null {
  if (sectId === null) return null;
  return SECT_UPGRADES.find((track) => track.sectId === sectId) ?? null;
}

/**
 * 秘傳要推進到飛升境才開得了。
 *
 * 這條線是為了填「洞府點滿之後」那一段空窗，太早開只會多一條和洞府搶錢的線，
 * 而前八十關的金幣本來就不夠花。
 */
export function sectUpgradeUnlocked(save: SaveData): boolean {
  return save.world.highestStage >= BALANCE.rebirth.minStage;
}

/** 目前等級升到下一級的花費。沒有上限，所以永遠有價可付。 */
export function sectUpgradeCost(track: SectUpgradeTrack, level: number): number {
  return Math.round(track.baseCost * Math.pow(track.costGrowth, Math.max(0, level)));
}

/** 該等級提供的累計數值（0 級為 0）。 */
export function sectUpgradeAmount(track: SectUpgradeTrack, level: number): number {
  return track.perLevel * Math.max(0, level);
}

/** 目前這一派的秘傳等級。 */
export function sectUpgradeLevel(save: SaveData): number {
  const id = save.player.sectId;
  if (id === null) return 0;
  return Math.max(0, Math.floor(save.player.sectDepth[id] ?? 0));
}

export interface SectUpgradePurchase {
  ok: boolean;
  /** 買不下去的原因，成功時為 null。 */
  reason: '尚未拜入門派' | '尚未推進飛升境' | '金幣不足' | null;
}

/** 買一級。錢不夠、還沒開放、沒有門派都會被擋下來，而且不會動到存檔。 */
export function buySectUpgrade(save: SaveData): SectUpgradePurchase {
  const id = save.player.sectId;
  const track = sectTrackFor(id);
  if (id === null || track === null) return { ok: false, reason: '尚未拜入門派' };
  if (!sectUpgradeUnlocked(save)) return { ok: false, reason: '尚未推進飛升境' };
  const level = sectUpgradeLevel(save);
  const cost = sectUpgradeCost(track, level);
  if (save.player.wallet.gold < cost) return { ok: false, reason: '金幣不足' };
  save.player.wallet.gold -= cost;
  save.player.sectDepth[id] = level + 1;
  return { ok: true, reason: null };
}
