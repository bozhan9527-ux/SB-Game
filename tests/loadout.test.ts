import { describe, it, expect } from 'vitest';
import { BALANCE, SECTS } from '../src/data';
import type { Sect } from '../src/data/types';
import { buildLoadout, buildLoadoutFor, sectById } from '../src/systems/loadout';
import { createDefaultSave } from '../src/save';

function sect(id: string): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

describe('開局配置', () => {
  it('起始屬性＝基礎值＋門派＋升級', () => {
    const loadout = buildLoadoutFor(sect('body'), { startDisciples: 3, startAttack: 2, startDefense: 1 }, 1);
    const s = sect('body');
    expect(loadout.disciples).toBe(BALANCE.power.baseDisciples + s.discipleBonus + 3 * 1);
    expect(loadout.attack).toBe(BALANCE.power.baseAttack + s.attackBonus + 2 * 1);
    expect(loadout.defense).toBe(BALANCE.power.baseDefense + s.defenseBonus + 1 * 2);
  });

  it('五條升級線各自對應到正確的欄位', () => {
    const plain = buildLoadoutFor(sect('body'), {}, 1);
    const gold = buildLoadoutFor(sect('body'), { goldGain: 10 }, 1);
    const boss = buildLoadoutFor(sect('body'), { bossDamage: 10 }, 1);
    expect(gold.goldMultiplier).toBeCloseTo(plain.goldMultiplier * 1.8, 6);
    expect(boss.bossDamageMultiplier).toBeCloseTo(plain.bossDamageMultiplier * 2, 6);
  });

  it('起始人數至少 1、防禦不為負', () => {
    const harsh: Sect = { ...sect('sword'), discipleBonus: -999, defenseBonus: -999 };
    const loadout = buildLoadoutFor(harsh, {}, 1);
    expect(loadout.disciples).toBe(1);
    expect(loadout.defense).toBe(0);
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
