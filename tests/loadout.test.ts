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
  it('未升級時起始屬性＝基礎值＋門派', () => {
    const loadout = buildLoadoutFor(sect('body'), {}, 1);
    const s = sect('body');
    expect(loadout.disciples).toBe(BALANCE.power.baseDisciples + s.discipleBonus);
    expect(loadout.attack).toBe(BALANCE.power.baseAttack + s.attackBonus);
    expect(loadout.defense).toBe(BALANCE.power.baseDefense + s.defenseBonus);
  });

  it('五條升級線都是百分比乘算，各自對應到正確的乘區', () => {
    const plain = buildLoadoutFor(sect('body'), {}, 1);
    const disciples = buildLoadoutFor(sect('body'), { startDisciples: 10 }, 1);
    const attack = buildLoadoutFor(sect('body'), { startAttack: 10 }, 1);
    const defense = buildLoadoutFor(sect('body'), { startDefense: 10 }, 1);
    const gold = buildLoadoutFor(sect('body'), { goldGain: 10 }, 1);
    const boss = buildLoadoutFor(sect('body'), { bossDamage: 10 }, 1);

    expect(disciples.discipleMultiplier).toBeGreaterThan(plain.discipleMultiplier);
    expect(disciples.disciples).toBeGreaterThan(plain.disciples);
    expect(attack.attackMultiplier).toBeGreaterThan(plain.attackMultiplier);
    expect(defense.mitigationMultiplier).toBeGreaterThan(plain.mitigationMultiplier);
    expect(gold.goldMultiplier).toBeGreaterThan(plain.goldMultiplier);
    expect(boss.bossDamageMultiplier).toBeGreaterThan(plain.bossDamageMultiplier);
    // 乘算才不會在後期被閘門稀釋，這是 L-05 的結論。
    expect(attack.attackMultiplier).toBeCloseTo(1 + (10 * trackPerLevel('startAttack')) / 100, 6);
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
