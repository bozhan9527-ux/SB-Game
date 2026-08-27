import { describe, it, expect } from 'vitest';
import { BALANCE, SECTS } from '../src/data';
import type { Sect } from '../src/data/types';
import { buildLoadoutFor } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';
import {
  applyGate,
  bossDps,
  bossHitLoss,
  bossHitRatio,
  buildEncounters,
  buildGateEncounter,
  clearReward,
  createBoss,
  createRunState,
  defeatReward,
  gateCountForStage,
  gateLabel,
  gateSpeedForStage,
  mobLoss,
  mobLossRatio,
  resolveMob,
  teamPower,
} from '../src/systems/run';

function sect(id: string): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(`測試用門派不存在：${id}`);
  return found;
}

function stateFor(sectId: string, stage = 1, upgrades: Record<string, number> = {}) {
  return createRunState(buildLoadoutFor(sect(sectId), upgrades, stage), 1234);
}

describe('閘門結算', () => {
  it('加算閘門直接加人數', () => {
    const state = stateFor('body');
    const before = state.disciples;
    const result = applyGate(state, {
      templateId: 't', target: 'disciples', op: 'add', value: 10, trap: false, label: '',
    });
    expect(state.disciples).toBe(before + 10);
    expect(result.discipleDelta).toBe(10);
  });

  it('乘算閘門取整後套用', () => {
    const state = stateFor('body');
    state.disciples = 7;
    applyGate(state, { templateId: 't', target: 'disciples', op: 'mul', value: 2.5, trap: false, label: '' });
    expect(state.disciples).toBe(18);
  });

  it('人數不會被扣到負數', () => {
    const state = stateFor('body');
    applyGate(state, { templateId: 't', target: 'disciples', op: 'add', value: -999, trap: true, label: '' });
    expect(state.disciples).toBe(0);
  });

  it('符修的武裝加成只放大好處，不放大陷阱', () => {
    const talisman = stateFor('talisman');
    const body = stateFor('body');
    const gain = { templateId: 't', target: 'arms', op: 'add', value: 10, trap: false, label: '' } as const;
    applyGate(talisman, gain);
    applyGate(body, gain);
    expect(talisman.arms).toBe(15); // 10 × 1.5
    expect(body.arms).toBe(10);

    // 陷阱不因武裝加成而放大。符修現在對陷阱免疫，改用體修驗證這條規則。
    const body2 = stateFor('body');
    body2.arms = 20;
    applyGate(body2, { templateId: 't', target: 'arms', op: 'add', value: -10, trap: true, label: '' });
    expect(body2.arms).toBe(10);
  });

  it('符修對陷阱免疫，踩到完全無效（門派被動）', () => {
    const talisman = stateFor('talisman');
    talisman.arms = 20;
    const before = talisman.disciples;
    const result = applyGate(talisman, {
      templateId: 't', target: 'disciples', op: 'mul', value: 0.5, trap: true, label: '',
    });
    expect(talisman.disciples).toBe(before);
    expect(talisman.arms).toBe(20);
    expect(result.passiveNote).toBe('符籙鎮邪');
  });

  it('體修的前兩次敵陣完全免傷（門派被動）', () => {
    const body = stateFor('body');
    body.disciples = 50;
    const wave = { kind: 'mob', name: '測試', art: 'bandit', power: 9999 } as const;
    expect(resolveMob(body, wave)).toBe(0);
    expect(resolveMob(body, wave)).toBe(0);
    expect(resolveMob(body, wave)).toBeGreaterThan(0);
  });

  it('丹修通過金幣閘門時回復門人（門派被動）', () => {
    const alchemy = stateFor('alchemy');
    alchemy.disciples = 100;
    const result = applyGate(alchemy, {
      templateId: 'g', target: 'gold', op: 'add', value: 50, trap: false, label: '',
    });
    expect(alchemy.disciples).toBeGreaterThan(100);
    expect(result.passiveNote).toContain('丹藥回春');
  });

  it('金幣閘門依門派與升級倍率折算', () => {
    const alchemy = stateFor('alchemy');
    applyGate(alchemy, { templateId: 'g', target: 'gold', op: 'add', value: 100, trap: false, label: '' });
    expect(alchemy.goldCollected).toBe(Math.round(100 * sect('alchemy').goldMultiplier));
  });

  it('閘門文字依資料格式化', () => {
    expect(gateLabel('disciples', 'add', 12)).toBe('＋12 弟子');
    expect(gateLabel('disciples', 'add', -12)).toBe('－12 弟子');
    expect(gateLabel('arms', 'mul', 2)).toBe('×2 武裝');
    expect(gateLabel('gold', 'add', 50)).toBe('＋50 金幣');
  });
});

describe('關卡生成', () => {
  it('同一種子產生完全相同的關卡（可重現）', () => {
    const a = buildEncounters(3, createRng(42));
    const b = buildEncounters(3, createRng(42));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('閘門數隨境界成長並受上限限制', () => {
    expect(gateCountForStage(1)).toBe(BALANCE.run.gatesPerStageBase);
    expect(gateCountForStage(20)).toBeGreaterThan(gateCountForStage(1));
    expect(gateCountForStage(999)).toBeLessThanOrEqual(BALANCE.run.gatesPerStageMax);
  });

  it('捲動速度隨關卡加快但有上限', () => {
    expect(gateSpeedForStage(5)).toBeGreaterThan(gateSpeedForStage(1));
    expect(gateSpeedForStage(9999)).toBe(BALANCE.run.gateSpeedMax);
  });

  it('每組閘門兩側不同，且至少一側是好處', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i += 1) {
      const encounter = buildGateEncounter(1 + (i % 25), rng);
      expect(encounter.left.templateId).not.toBe(encounter.right.templateId);
      expect(encounter.left.trap && encounter.right.trap).toBe(false);
    }
  });

  it('關卡序列包含閘門與敵陣，且最後一個是閘門', () => {
    const encounters = buildEncounters(9, createRng(3));
    expect(encounters.some((e) => e.kind === 'gate')).toBe(true);
    expect(encounters.some((e) => e.kind === 'mob')).toBe(true);
    expect(encounters[encounters.length - 1]?.kind).toBe('gate');
  });
});

describe('戰鬥數值', () => {
  it('敵陣傷亡至少一人，且武裝越高傷亡越少', () => {
    const weak = stateFor('sword');
    const strong = stateFor('sword');
    strong.arms = 60;
    const wave = { kind: 'mob', name: '測試', art: 'bandit', power: 200 } as const;
    expect(mobLoss(weak, wave)).toBeGreaterThan(mobLoss(strong, wave));
    expect(mobLoss(strong, { kind: 'mob', name: '測試', art: 'bandit', power: 1 })).toBeGreaterThanOrEqual(1);
  });

  it('體修的敵陣傷亡比例低於劍修', () => {
    const wave = { kind: 'mob', name: '測試', art: 'bandit', power: 200 } as const;
    // 傷亡是比例制，人數多寡不影響比例，這裡比的是耐打程度而非絕對人數。
    expect(mobLossRatio(stateFor('body'), wave)).toBeLessThan(mobLossRatio(stateFor('sword'), wave));
  });

  it('敵陣不會讓人數變成負數', () => {
    const state = stateFor('sword');
    state.disciples = 2;
    const loss = resolveMob(state, { kind: 'mob', name: '測試', art: 'bandit', power: 99999 });
    expect(loss).toBe(2);
    expect(state.disciples).toBe(0);
  });

  it('隊伍戰力＝人數 ×（攻擊＋武裝）× 境界壓制', () => {
    const state = stateFor('body', 1);
    state.disciples = 10;
    state.arms = 5;
    const expected = 10 * (state.loadout.attack + 5) * (1 + state.loadout.realmPowerBonus);
    expect(teamPower(state)).toBeCloseTo(expected, 6);
  });

  it('氣勢與對首領傷害升級都會提高首領傷害', () => {
    const base = stateFor('body');
    const upgraded = stateFor('body', 1, { bossDamage: 5 });
    expect(bossDps(base, 0.5)).toBeGreaterThan(bossDps(base, 0));
    expect(bossDps(upgraded, 0)).toBeGreaterThan(bossDps(base, 0));
  });

  it('劍修對首領傷害高於體修', () => {
    expect(bossDps(stateFor('sword'), 0)).toBeGreaterThan(0);
    expect(sect('sword').bossDamageMultiplier).toBeGreaterThan(sect('body').bossDamageMultiplier);
  });

  it('首領血量與攻擊隨關卡成長', () => {
    const early = createBoss(1, createRng(1));
    const late = createBoss(12, createRng(1));
    expect(late.maxHp).toBeGreaterThan(early.maxHp);
    expect(late.attack).toBeGreaterThan(early.attack);
  });

  it('首領每次攻擊至少殺一人，防禦越高傷亡比例越低', () => {
    const boss = createBoss(1, createRng(1));
    const soft = stateFor('sword');
    const hard = stateFor('body', 1, { startDefense: 10 });
    expect(bossHitRatio(hard, boss)).toBeLessThan(bossHitRatio(soft, boss));
    expect(bossHitLoss(soft, boss)).toBeGreaterThanOrEqual(BALANCE.power.minLossPerHit);
  });

  it('首領傷害為比例制：隊伍越大單次損失越多，但不會一次打光', () => {
    const boss = createBoss(1, createRng(1));
    const state = stateFor('body');
    state.disciples = 200;
    const big = bossHitLoss(state, boss);
    state.disciples = 20;
    expect(big).toBeGreaterThan(bossHitLoss(state, boss));
    expect(bossHitLoss(state, boss)).toBeLessThan(20);
  });
});

describe('獎勵', () => {
  it('通關獎勵隨關卡提高，失敗只給一部分', () => {
    const early = stateFor('body', 1);
    const late = stateFor('body', 10);
    expect(clearReward(late)).toBeGreaterThan(clearReward(early));
    expect(defeatReward(early)).toBeLessThan(clearReward(early));
  });

  it('丹修與金幣升級都會放大獎勵', () => {
    const plain = stateFor('body', 5);
    const alchemy = stateFor('alchemy', 5);
    const greedy = stateFor('body', 5, { goldGain: 5 });
    expect(clearReward(alchemy)).toBeGreaterThan(clearReward(plain));
    expect(clearReward(greedy)).toBeGreaterThan(clearReward(plain));
  });
});
