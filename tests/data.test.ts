import { describe, it, expect } from 'vitest';
import { balance, gates } from '../src/data/load';
import { BalanceSchema, GatesSchema } from '../src/data/types';
import { project, roadEdgesAt } from '../src/systems/projection';
import { GAME_WIDTH, GAME_HEIGHT } from '../src/config';

describe('遊戲資料', () => {
  it('balance.json 通過 schema 驗證', () => {
    expect(BalanceSchema.safeParse(balance).success).toBe(true);
  });

  it('gates.json 通過 schema 驗證', () => {
    expect(GatesSchema.safeParse(gates).success).toBe(true);
  });

  it('pairs 引用的閘門 id 全部存在', () => {
    for (const p of gates.pairs) {
      expect(gates.types[p.left], `缺少 ${p.left}`).toBeDefined();
      expect(gates.types[p.right], `缺少 ${p.right}`).toBeDefined();
    }
  });

  it('斷掉的 pair 引用會被 schema 擋下', () => {
    const broken = {
      types: { a: { label: 'A', effects: [{ stat: 'attack', op: 'add', value: 1 }] } },
      pairs: [{ left: 'a', right: 'does_not_exist' }],
    };
    expect(GatesSchema.safeParse(broken).success).toBe(false);
  });

  it('死區小於玩家可移動範圍，否則永遠選不到任何一邊', () => {
    expect(balance.gateRun.deadZoneX).toBeLessThan(balance.gateRun.playerMaxX);
  });

  it('nearZ 小於 farZ', () => {
    expect(balance.projection.nearZ).toBeLessThan(balance.projection.farZ);
  });

  it('第一道閘門在可見範圍內出現，玩家才有反應時間', () => {
    expect(balance.gateRun.firstGateZ).toBeLessThanOrEqual(balance.projection.farZ);
  });

  it('每個關卡類型的閘門數範圍合法', () => {
    for (const [name, e] of Object.entries(balance.encounters)) {
      expect(e.maxGates, name).toBeGreaterThanOrEqual(e.minGates);
    }
  });

  it('每一對閘門都是取捨，不得兩邊完全相同', () => {
    // GAME_DESIGN 第 3.2 節：不得出現「一邊明顯較優」的組合
    for (const p of gates.pairs) {
      expect(p.left, `pair ${p.left}/${p.right} 兩邊相同`).not.toBe(p.right);
    }
  });
});

/**
 * 投影參數必須讓畫面真的看得到東西。
 *
 * 這組測試補的是 L-02：投影公式本身正確、相對關係也正確，
 * 但參數把所有東西投影到畫面外時，先前的測試全部照樣通過。
 * 單元測試若只驗證相對關係，就抓不到「參數合理性」這一類錯誤。
 */
describe('投影參數的可視性', () => {
  const proj = balance.projection;

  it('史萊姆落在畫面內', () => {
    const p = project(0, balance.render.playerZ, proj, GAME_WIDTH);
    expect(p.y).toBeGreaterThan(proj.horizonY);
    expect(p.y).toBeLessThan(GAME_HEIGHT);
  });

  it('史萊姆移到最左／最右時，整個身體仍在畫面內', () => {
    // 只檢查中心點會漏掉「身體超出畫面」的情況
    for (const x of [-balance.gateRun.playerMaxX, balance.gateRun.playerMaxX]) {
      const p = project(x, balance.render.playerZ, proj, GAME_WIDTH);
      const r = balance.render.playerRadiusWorld * p.scale;
      expect(p.x - r).toBeGreaterThanOrEqual(0);
      expect(p.x + r).toBeLessThanOrEqual(GAME_WIDTH);
    }
  });

  it('史萊姆移到最左／最右時不會跑到路面外', () => {
    // 以世界座標約束：中心加上半徑仍須在路面內。
    // 只比較 playerMaxX 與 roadHalfWidth 會漏掉身體寬度。
    expect(balance.gateRun.playerMaxX + balance.render.playerRadiusWorld).toBeLessThanOrEqual(
      proj.roadHalfWidth,
    );
  });

  it('史萊姆的可移動範圍足以明確選邊', () => {
    // 至少要能移到死區外相當距離，否則玩家難以表達「我選這邊」
    expect(balance.gateRun.playerMaxX).toBeGreaterThan(balance.gateRun.deadZoneX * 3);
  });

  it('閘門標籤的顯示門檻讓玩家有足夠反應時間', () => {
    // labelMinScale 決定字從多遠開始顯示；換算成秒數必須夠玩家反應
    const zWhenLabelAppears = proj.focalLength / balance.render.labelMinScale;
    const secondsOfWarning = zWhenLabelAppears / balance.gateRun.speedZPerSecond;
    expect(secondsOfWarning).toBeGreaterThan(1);
  });

  it('最遠的閘門出現在畫面內，玩家看得到它逼近', () => {
    const p = project(0, balance.gateRun.firstGateZ, proj, GAME_WIDTH);
    expect(p.y).toBeGreaterThan(proj.horizonY);
    expect(p.y).toBeLessThan(GAME_HEIGHT);
  });

  it('路面近端至少延伸到畫面底部，不得在半空中斷掉', () => {
    const near = roadEdgesAt(proj.nearZ, proj, GAME_WIDTH);
    expect(near.y).toBeGreaterThanOrEqual(GAME_HEIGHT);
  });

  it('路面遠端收斂於地平線附近但不超過它', () => {
    const far = roadEdgesAt(proj.farZ, proj, GAME_WIDTH);
    expect(far.y).toBeGreaterThan(proj.horizonY);
    expect(far.y).toBeLessThan(proj.horizonY + 100);
  });

  it('道路在玩家所在距離上不會寬到超出畫面', () => {
    const e = roadEdgesAt(balance.render.playerZ, proj, GAME_WIDTH);
    expect(e.left).toBeGreaterThanOrEqual(0);
    expect(e.right).toBeLessThanOrEqual(GAME_WIDTH);
  });

  it('閘門面板在最遠處仍有可見高度', () => {
    const p = project(0, proj.farZ, proj, GAME_WIDTH);
    expect(balance.render.gateHeightWorld * p.scale).toBeGreaterThan(4);
  });
});

describe('閘門取捨（重複檢查，保留在資料區塊）', () => {
  it('每一對閘門兩邊不同', () => {
    // GAME_DESIGN 第 3.2 節：不得出現「一邊明顯較優」的組合
    for (const p of gates.pairs) {
      expect(p.left, `pair ${p.left}/${p.right} 兩邊相同`).not.toBe(p.right);
    }
  });
});
