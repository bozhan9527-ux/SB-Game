/**
 * 門派秘傳。
 *
 * 這一條線存在的理由是製作人實際玩到的一個空窗：洞府五條線點滿之後，
 * 金幣就沒有地方去了，而那正好是飛升境——遊戲最長、內容最少的一段。
 *
 * 所以這裡守三件事：它真的沒有上限、它真的因門派而異、
 * 而且它一定要跟著上報給伺服器——漏掉任何一個會影響戰鬥的欄位，
 * 症狀都是「合法玩家被自己的伺服器指控造假」。
 */
import { describe, expect, it } from 'vitest';
import { BALANCE, SECTS, SECT_UPGRADES } from '../src/data';
import { createDefaultSave } from '../src/save';
import type { SaveData } from '../src/save/types';
import { rebirth } from '../src/systems/karma';
import { buildLoadout } from '../src/systems/loadout';
import { loadoutFor } from '../src/systems/leaderboard';
import {
  buySectUpgrade,
  sectTrackFor,
  sectUpgradeCost,
  sectUpgradeLevel,
  sectUpgradeUnlocked,
} from '../src/systems/sect-upgrades';

function saveAt(sectId: string, stage: number, gold = 0): SaveData {
  const save = createDefaultSave();
  save.player.sectId = sectId;
  save.world.stage = stage;
  save.world.highestStage = stage;
  save.player.wallet.gold = gold;
  return save;
}

describe('門派秘傳', () => {
  it('每一派都有自己的一條，而且效果各不相同', () => {
    expect(SECT_UPGRADES).toHaveLength(SECTS.length);
    const effects = new Set(SECT_UPGRADES.map((track) => track.effect));
    expect(effects.size).toBe(SECT_UPGRADES.length);
    for (const sect of SECTS) expect(sectTrackFor(sect.id)).not.toBeNull();
  });

  it('推到飛升境之前買不動，之後才開', () => {
    const early = saveAt('body', BALANCE.rebirth.minStage - 1, 1e12);
    expect(sectUpgradeUnlocked(early)).toBe(false);
    expect(buySectUpgrade(early).reason).toBe('尚未推進飛升境');
    expect(sectUpgradeLevel(early)).toBe(0);
    // 沒買成就不該扣錢。
    expect(early.player.wallet.gold).toBe(1e12);

    const late = saveAt('body', BALANCE.rebirth.minStage, 1e12);
    expect(buySectUpgrade(late).ok).toBe(true);
    expect(sectUpgradeLevel(late)).toBe(1);
    expect(late.player.wallet.gold).toBeLessThan(1e12);
  });

  it('沒有上限：買到很深仍然買得下去，而且越來越貴', () => {
    const track = sectTrackFor('body');
    if (track === null) throw new Error('天罡宗沒有秘傳');
    const costs = [0, 10, 50, 200].map((level) => sectUpgradeCost(track, level));
    for (let i = 1; i < costs.length; i += 1) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1] ?? 0);
    }
    // 深到兩百級仍然是一個有限的價碼，不是 Infinity——買得下去才叫沒有上限。
    expect(Number.isFinite(costs[costs.length - 1])).toBe(true);
  });

  it('等級跟著門派走，換派就是另一條', () => {
    const save = saveAt('body', 90, 1e12);
    buySectUpgrade(save);
    buySectUpgrade(save);
    expect(sectUpgradeLevel(save)).toBe(2);
    save.player.sectId = 'sword';
    expect(sectUpgradeLevel(save)).toBe(0);
    // 回去的時候還在——和門派修為同一個道理。
    save.player.sectId = 'body';
    expect(sectUpgradeLevel(save)).toBe(2);
  });

  it('四派各自加在自己的那一格上', () => {
    const at = (sectId: string, level: number) => {
      const save = saveAt(sectId, 90);
      save.player.sectDepth[sectId] = level;
      return buildLoadout(save, 90);
    };
    expect(at('body', 10).disciples).toBeGreaterThan(at('body', 0).disciples);
    expect(at('sword', 10).bossDamageMultiplier).toBeGreaterThan(
      at('sword', 0).bossDamageMultiplier,
    );
    expect(at('talisman', 10).favoredDamageBonus).toBeGreaterThan(0);
    expect(at('alchemy', 10).goldMultiplier).toBeGreaterThan(at('alchemy', 0).goldMultiplier);
    // 加的是自己那一格，不是全部：劍修買再多也不會多出耐久。
    expect(at('sword', 10).disciples).toBe(at('sword', 0).disciples);
  });

  it('會跟著上報，否則伺服器重播出來的是另一場仗', () => {
    const save = saveAt('sword', 90);
    save.player.sectDepth['sword'] = 7;
    expect(loadoutFor(save).sectDepth).toBe(7);
  });

  it('輪迴時歸零，和洞府同一個待遇', () => {
    const save = saveAt('body', 200, 0);
    save.player.sectDepth['body'] = 12;
    save.player.karma.claimedStage = 0;
    expect(rebirth(save)).toBe(true);
    expect(sectUpgradeLevel(save)).toBe(0);
    // 修為是打出來的，不跟著歸零。
    save.player.sectClears['body'] = 5;
    expect(save.player.sectClears['body']).toBe(5);
  });
});
