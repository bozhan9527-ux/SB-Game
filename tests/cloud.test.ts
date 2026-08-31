/**
 * 雲端存檔的客戶端邏輯。
 *
 * 網路那一層不在這裡測（那是 Worker 的事），這裡守的是三條會靜靜出錯的規矩：
 * 身分只產一次、身分不跟著雲端那份走、以及套用雲端存檔要走既有的遷移路徑。
 */
import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../src/save';
import { SAVE_VERSION } from '../src/save/types';
import { adoptCloudBlob, compare, ensureCloudIdentity } from '../src/systems/cloud';
import { percentileOf } from '../src/net/protocol';
import {
  MIN_SAMPLES_FOR_PERCENTILE,
  loadoutFor,
  percentileLine,
} from '../src/systems/leaderboard';

describe('雲端身分', () => {
  it('第一次呼叫才產生，之後一直是同一組', () => {
    const save = createDefaultSave(1);
    expect(save.player.cloud).toBeNull();
    const first = ensureCloudIdentity(save);
    expect(first.playerId.length).toBeGreaterThan(10);
    // secret 等同於密碼，長度要夠而且不能是可預測的東西。
    expect(first.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(ensureCloudIdentity(save)).toBe(first);
  });

  it('兩份存檔不會拿到同一組身分', () => {
    const a = ensureCloudIdentity(createDefaultSave(1));
    const b = ensureCloudIdentity(createDefaultSave(1));
    expect(a.playerId).not.toBe(b.playerId);
    expect(a.secret).not.toBe(b.secret);
  });
});

describe('新舊判斷', () => {
  it('用存檔自己帶的時間戳比較', () => {
    expect(compare(200, 100)).toBe('localNewer');
    expect(compare(100, 200)).toBe('cloudNewer');
    expect(compare(100, 100)).toBe('same');
  });
});

describe('套用雲端存檔', () => {
  it('走既有的遷移路徑，舊版本的雲端存檔照樣接得上', () => {
    // 這裡若自己做一套修補，就會有兩份規則各自演化，而舊資料遲早踩到差異。
    const legacy = JSON.stringify({
      version: 1,
      savedAt: 1,
      player: { sectId: 'body', wallet: { gold: 777 }, upgrades: { startAttack: 2 } },
      world: { stage: 15, highestStage: 15, runs: 3, clears: 2 },
    });
    const identity = { playerId: 'p', secret: 's', syncedAt: 0 };
    const next = adoptCloudBlob(legacy, identity, 5000);
    expect(next).not.toBeNull();
    expect(next?.version).toBe(SAVE_VERSION);
    expect(next?.world.stage).toBe(15);
    expect(next?.player.wallet.gold).toBe(777);
  });

  it('身分不跟著雲端那份走', () => {
    // 雲端那份可能是從別的裝置上傳的，但身分是「這一組帳號」的，不是那份存檔的。
    const other = createDefaultSave(1);
    other.player.cloud = { playerId: 'someone-else', secret: 'theirs', syncedAt: 123 };
    const identity = { playerId: 'mine', secret: 'ours', syncedAt: 0 };
    const next = adoptCloudBlob(JSON.stringify(other), identity, 9000);
    expect(next?.player.cloud?.playerId).toBe('mine');
    expect(next?.player.cloud?.syncedAt).toBe(9000);
  });

  it('壞掉的內容回 null，不 throw', () => {
    const identity = { playerId: 'p', secret: 's', syncedAt: 0 };
    expect(adoptCloudBlob('不是 JSON', identity, 1)).toBeNull();
    expect(adoptCloudBlob('[1,2,3]', identity, 1)).toBeNull();
  });
});

describe('百分位', () => {
  it('從直方圖算出「超過幾成人」', () => {
    // buckets[i] = 最深停在第 i 關的人數。
    const buckets = [0, 10, 0, 30, 0, 60];
    expect(percentileOf(buckets, 1)).toBeCloseTo(0, 6);
    expect(percentileOf(buckets, 3)).toBeCloseTo(10 / 100, 6);
    expect(percentileOf(buckets, 5)).toBeCloseTo(40 / 100, 6);
    expect(percentileOf(buckets, 99)).toBeCloseTo(1, 6);
  });

  it('沒有資料時回 0，不是 NaN', () => {
    // 剛上線、還沒有任何人上傳過的時候會走到這條路。
    expect(percentileOf([], 10)).toBe(0);
    expect(percentileOf([0, 0, 0], 2)).toBe(0);
  });
});

describe('上榜與百分位', () => {
  it('樣本太少時不報百分位', () => {
    // 三個人裡排第一寫成「超過 67%」只是誤導，那個數字要有意義得先有夠多人。
    const save = createDefaultSave(1);
    save.player.distribution = { buckets: [0, 0, 1, 2], total: 3, fetchedAt: 1 };
    expect(percentileLine(save, 3)).toBeNull();
  });

  it('樣本夠多才報，而且數字對得上直方圖', () => {
    const save = createDefaultSave(1);
    const buckets = [0, 30, 30, 40];
    save.player.distribution = { buckets, total: 100, fetchedAt: 1 };
    expect(save.player.distribution.total).toBeGreaterThanOrEqual(MIN_SAMPLES_FOR_PERCENTILE);
    expect(percentileLine(save, 3)).toContain('60%');
  });

  it('沒有快取時也不會炸——離線第一次進遊戲就是這個狀態', () => {
    expect(percentileLine(createDefaultSave(1), 10)).toBeNull();
  });

  it('送給伺服器的配置只帶得動重播需要的東西', () => {
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    save.player.sectClears = { sword: 12, body: 3 };
    const loadout = loadoutFor(save);
    expect(loadout.sectId).toBe('sword');
    // 只帶「這一派」的修為，不是整份紀錄——伺服器重播只需要生效中的那一個。
    expect(loadout.sectClears).toBe(12);
    // 這份清單是刻意釘死的：多一個欄位就是多送一份玩家的資料出去，
    // 少一個欄位就是伺服器重播不出同一場仗。兩種錯都要當場紅。
    // highestStage 與 challenges 是後來補的——少了它們，回頭打舊關卡的人
    // 與開了試煉的人，成績會被自己的伺服器判定為造假。
    expect(Object.keys(loadout).sort()).toEqual([
      'bankedStage',
      'extraFieldSlots',
      'goldMultiplier',
      'karma',
      'libraryFloor',
      'rules',
      'sectClears',
      'sectId',
      'talismans',
      'upgrades',
    ]);
  });
});
