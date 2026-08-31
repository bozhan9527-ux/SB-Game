import { describe, it, expect } from 'vitest';
import { BALANCE, SECTS } from '../src/data';
import type { Sect } from '../src/data/types';
import { buildLoadout, buildLoadoutFor, buildLoadoutFromSpec, sectById } from '../src/systems/loadout';
import { loadoutFor } from '../src/systems/leaderboard';
import { trackById } from '../src/systems/upgrades';
import { createDefaultSave } from '../src/save';

function trackPerLevel(id: string): number {
  return trackById(id).perLevel;
}

function sect(id: string): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

describe('開局配置', () => {
  it('未升級時起始耐久＝基礎值 × 門派倍率', () => {
    const s = sect('body');
    const loadout = buildLoadoutFor(s, {}, 1);
    expect(loadout.disciples).toBe(Math.round(BALANCE.power.baseDisciples * s.discipleMultiplier));
    expect(loadout.fieldSlots).toBe(BALANCE.field.fieldSlots);
  });

  it('六條升級線都是乘算（陣法擴充除外），各自對應到正確的乘區', () => {
    const plain = buildLoadoutFor(sect('body'), {}, 1);
    const disciples = buildLoadoutFor(sect('body'), { startDisciples: 10 }, 1);
    const damage = buildLoadoutFor(sect('body'), { startAttack: 10 }, 1);
    const rate = buildLoadoutFor(sect('body'), { startDefense: 10 }, 1);
    const draw = buildLoadoutFor(sect('body'), { drawSpeed: 10 }, 1);
    const gold = buildLoadoutFor(sect('body'), { goldGain: 10 }, 1);
    const slots = buildLoadoutFor(sect('body'), { fieldSlots: 2 }, 1);

    expect(disciples.disciples).toBeGreaterThan(plain.disciples);
    expect(damage.damageMultiplier).toBeGreaterThan(plain.damageMultiplier);
    expect(rate.fireRateMultiplier).toBeGreaterThan(plain.fireRateMultiplier);
    expect(draw.drawSpeedMultiplier).toBeGreaterThan(plain.drawSpeedMultiplier);
    expect(gold.goldMultiplier).toBeGreaterThan(plain.goldMultiplier);
    // 陣法擴充是唯一的加算線：它加的是格位數，不是百分比。
    expect(slots.fieldSlots).toBe(plain.fieldSlots + 2);
    // 乘算才不會在後期被難度稀釋，這是 L-05 的結論。
    expect(damage.damageMultiplier).toBeCloseTo(
      sect('body').damageMultiplier * (1 + (10 * trackPerLevel('startAttack')) / 100),
      6,
    );
  });

  it('起始耐久至少 1', () => {
    const harsh: Sect = { ...sect('sword'), discipleMultiplier: 0 };
    expect(buildLoadoutFor(harsh, {}, 1).disciples).toBe(1);
  });

  it('境界壓制隨關卡帶入', () => {
    expect(buildLoadoutFor(sect('body'), {}, 25).realmPowerBonus).toBeGreaterThan(
      buildLoadoutFor(sect('body'), {}, 1).realmPowerBonus,
    );
  });

  it('未選門派時不得開始挑戰', () => {
    expect(() => buildLoadout(createDefaultSave(), 1)).toThrow(/門派/);
    expect(sectById(null)).toBeNull();
    expect(sectById('不存在')).toBeNull();
  });
});

/**
 * 這一組守的是排行榜的地基：**上報的那份配置，要能重建出玩家實際打的那一場。**
 *
 * 真實故障長這樣：玩家歷史最高 139 關、回頭打第 26 關，成績被伺服器判定
 * 「重播的結果是 defeated」而退回。原因不是作弊，是伺服器少拿了兩樣東西——
 * 門派修為（傳了 0）與符籙的解鎖關卡（用了這一關而不是歷史最高）——
 * 於是它重播的是另一場仗。這種錯誤最惡毒的地方在於：它的症狀是
 * 「合法玩家被指控造假」，而錯誤訊息完全指不到真正的原因。
 */
describe('上報的配置足以重建同一場戰鬥', () => {
  it('回頭打舊關卡時，符籙池仍依藏經閣層數決定', () => {
    const save = createDefaultSave();
    save.player.sectId = 'sword';
    save.world.highestStage = 139;
    save.player.dungeons['library'] = 16;
    save.player.talismans = ['swordArray', 'flame', 'thunder', 'gale'];

    const spec = { ...loadoutFor(save), stage: 26 };
    expect(buildLoadoutFromSpec(spec).talismans.map((card) => card.id)).toEqual(
      buildLoadout(save, 26).talismans.map((card) => card.id),
    );
  });

  it('修為、仙緣、副本進度都跟著上報，重建出來的配置與玩家實際那一場完全相同', () => {
    const save = createDefaultSave();
    save.player.sectId = 'sword';
    save.world.highestStage = 139;
    save.player.sectClears['sword'] = 17;
    save.player.karma.spent['karmaPower'] = 3;
    save.player.karma.spent['karmaGate'] = 2;
    save.player.dungeons['library'] = 16;

    // 伺服器收到的就是 loadoutFor 的輸出，補上它自己驗出來的關卡。
    const rebuilt = buildLoadoutFromSpec({ ...loadoutFor(save), stage: 26 });
    expect(rebuilt).toEqual(buildLoadout(save, 26));
    // 而且這些欄位真的有作用——全等於預設值的話，上面那條比較不算數。
    const bare = buildLoadoutFor(sect('sword'), {}, 26);
    expect(rebuilt.damageMultiplier).toBeGreaterThan(bare.damageMultiplier);
    expect(rebuilt.disciples).toBeGreaterThan(bare.disciples);
  });
});
