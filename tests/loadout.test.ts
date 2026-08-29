import { describe, it, expect } from 'vitest';
import { BALANCE, SECTS } from '../src/data';
import type { Sect } from '../src/data/types';
import { buildLoadout, buildLoadoutFor, sectById } from '../src/systems/loadout';
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
