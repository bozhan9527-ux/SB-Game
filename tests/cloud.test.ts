/**
 * 雲端存檔的客戶端邏輯。
 *
 * 網路那一層不在這裡測（那是 Worker 的事），這裡守的是三條會靜靜出錯的規矩：
 * 身分只產一次、身分不跟著雲端那份走、以及套用雲端存檔要走既有的遷移路徑。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSave, recordClear } from '../src/save';
import { SAVE_VERSION } from '../src/save/types';
import { adoptCloudBlob, compare, ensureCloudIdentity } from '../src/systems/cloud';
import { REPLAY_CONTRACT_VERSION, SPEED_STAGE, trackOfBoard } from '../src/net/protocol';
import {
  QUIET_FAILURE_BELOW_STAGE,
  boardReady,
  boardsFor,
  loadoutFor,
  runIsRankable,
  scoreLoadoutOf,
  submitRun,
} from '../src/systems/leaderboard';
import { buildLoadoutFromSpec, loadoutSpecOf } from '../src/systems/loadout';
import * as client from '../src/net/client';

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

describe('上榜', () => {
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
      'goldMultiplier',
      'karma',
      'libraryFloor',
      'rebirths',
      'rules',
      'sectClears',
      'sectDepth',
      'sectId',
      'talismans',
      'upgrades',
    ]);
  });
});

/**
 * 哪一場算數。
 *
 * 這一組是為了一個**畫面上完全看不出來**的故障寫的：上報的那份配置快照
 * 漏了指派，於是 submission 恆為 null，玩家一路通關到第 152 關，
 * 榜上永遠沒有他，而結算頁一句話都不會說。那一段判斷當時藏在
 * RunScene 的一行三元運算裡，沒有任何東西守著它。
 */
describe('哪一場算數', () => {
  const main = { tutorial: false, abandoned: false, dungeonRules: null };

  it('主線正常通關要上報', () => {
    expect(runIsRankable(main)).toBe(true);
  });

  it('教學那一場不上報——它換過起手牌，重播不出來', () => {
    expect(runIsRankable({ ...main, tutorial: true })).toBe(false);
  });

  it('中途放棄的一場不上報', () => {
    expect(runIsRankable({ ...main, abandoned: true })).toBe(false);
  });

  it('副本不上報：它的深度是副本決定的，和「推到第幾關」不是同一件事', () => {
    expect(runIsRankable({ ...main, dungeonRules: ['soloTalisman'] })).toBe(false);
    expect(runIsRankable({ ...main, dungeonRules: ['hasteBoss'] })).toBe(false);
  });

  it('競技場是唯一的例外——它是副本，但它存在的理由就是那個榜', () => {
    expect(runIsRankable({ ...main, dungeonRules: ['arena'] })).toBe(true);
  });

  it('競技場的一場放棄了還是不算', () => {
    expect(runIsRankable({ ...main, abandoned: true, dungeonRules: ['arena'] })).toBe(false);
  });
});

describe('上報的關卡是種子那一半', () => {
  afterEach(() => vi.restoreAllMocks());

  it('**送的是開打那一關，不是結算頁顯示的那一關。**', async () => {
    // 無限模式每下一波 stage 就往前跳，所以結算頁上那個數字是「止步於第幾關」。
    // 種子是用開打那一關算的（runSeed(stage, runs)），送錯的話伺服器重播的是
    // 完全另一場仗，然後安靜地退回——症狀是「打得最好的人上不了榜」。
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    save.player.account = { email: 'a@b.co', name: '劍修', salt: 'abc' };
    save.player.cloud = { playerId: 'p', secret: 's', syncedAt: 1 };

    const submit = vi
      .spyOn(client, 'submitScore')
      .mockResolvedValue({ ok: true, rank: 1, best: true, elapsedMs: 1000 } as never);

    await submitRun(save, {
      stage: 1,
      runs: 3,
      steps: 30000,
      actions: [],
      loadout: loadoutFor(save),
      arena: true,
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ board: 'arena', stage: 1, runs: 3 });
  });
});

describe('版本對不上就直說', () => {
  afterEach(() => vi.restoreAllMocks());

  it('上報時一定帶著重播契約的版本', async () => {
    // 玩家的瀏覽器快取住舊的那包 JS 時，他打的那一場和伺服器重播的規則
    // 不是同一套，成績一定被退回——而原本只寫得出「紀錄和伺服器對不起來」，
    // 他完全無從得知自己在跑舊版本。這個故障發生過兩次。
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    save.player.account = { email: 'a@b.co', name: '劍修', salt: 'abc' };
    save.player.cloud = { playerId: 'p', secret: 's', syncedAt: 1 };

    const submit = vi
      .spyOn(client, 'submitScore')
      .mockResolvedValue({ ok: true, rank: 1, best: true, elapsedMs: 1 } as never);

    await submitRun(save, {
      stage: 40,
      runs: 0,
      steps: 10,
      actions: [],
      loadout: loadoutFor(save),
      arena: false,
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ contract: REPLAY_CONTRACT_VERSION });
  });

  it('版本是整數而且大於零——0 是「沒帶」的意思，不能和合法值撞在一起', () => {
    expect(Number.isInteger(REPLAY_CONTRACT_VERSION)).toBe(true);
    expect(REPLAY_CONTRACT_VERSION).toBeGreaterThan(0);
  });
});

describe('一場成績進哪幾個榜', () => {
  it('主線最後一關同時進深度與速通——同一場既是深度也是秒數', () => {
    expect(boardsFor(SPEED_STAGE, false)).toEqual(['depth', 'speed81']);
  });

  it('**每一關都有自己的速通榜，打完第一關就上得去。**', () => {
    // 原本速通只有第 81 關一條，那是主線的終點——榜上要等到有人走完全程
    // 才會出現第一筆，在那之前它是一個永遠空著的分頁。空的榜看起來像壞掉。
    expect(boardsFor(1, false)).toEqual(['depth', 'speed1']);
    expect(boardsFor(40, false)).toEqual(['depth', 'speed40']);
    expect(boardsFor(152, false)).toEqual(['depth', 'speed152']);
  });

  it('一場只進一個速通榜——同一個榜上大家打的必然是同一關', () => {
    // 這是「秒數可以比」的唯一根據。混成一個榜的話，第 1 關 40 秒會贏過
    // 第 81 關 3 分鐘，速通就退化成「誰最快打完最簡單的一關」。
    for (const stage of [1, 9, 40, 81, 152]) {
      const speed = boardsFor(stage, false).filter((board) => trackOfBoard(board) !== null);
      expect(speed).toHaveLength(1);
      expect(trackOfBoard(speed[0]!)).toBe(stage);
    }
  });

  it('競技場只進競技榜', () => {
    expect(boardsFor(1, true)).toEqual(['arena']);
  });

  it('**看的是競技場，不是無限模式。** 聚寶洞也是無限，但它帶著全部的養成', () => {
    // 這個 false 是重點：聚寶洞的一場不會因為「它也是無限模式」就混進競技榜。
    // 混進去的話，那個榜比的就從操作變成洞府等級。
    expect(boardsFor(120, false)).not.toContain('arena');
  });
});

/**
 * 上榜的開通。
 *
 * 伺服器要求上榜的身分先被登記過（＝上傳過一次雲端存檔）。那個要求成立
 * ——被檢舉時要查得到是誰——但它不該由玩家自己去別的頁面補。
 * 這一組守的就是「程式自己補得掉」，以及補的時機不會蓋到雲端已有的東西。
 */
describe('上榜開通', () => {
  afterEach(() => vi.restoreAllMocks());

  const submission = {
    stage: 42,
    runs: 1,
    steps: 10,
    actions: [],
    loadout: loadoutFor(playing()),
    arena: false,
  };

  /** 一份「可以上榜」的存檔：有門派、也註冊過。 */
  function playing() {
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    save.player.account = { email: 'a@b.co', name: '劍修', salt: 'abc' };
    return save;
  }

  it('第一次被回 unauthorized 時，自己登記一次再重送', async () => {
    const save = playing();
    expect(boardReady(save)).toBe(false);

    const submit = vi
      .spyOn(client, 'submitScore')
      .mockResolvedValueOnce({ ok: false, error: 'unauthorized' })
      .mockResolvedValueOnce({ ok: true, rank: 3, best: true, stage: 42, elapsedMs: 1000 });
    const put = vi
      .spyOn(client, 'putSave')
      .mockResolvedValue({ ok: true, savedAt: 1 });
    vi.spyOn(client, 'getSave').mockResolvedValue({ ok: false, error: 'notFound' });

    const outcome = await submitRun(save, submission);
    expect(put).toHaveBeenCalledTimes(1);
    // 主榜（深度）送一次、補登記之後重送一次，再加上那一關的速通榜。
    expect(submit).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ kind: 'ok', rank: 3, best: true });
    // 登記成功之後，這台裝置就不必再走一次那條路。
    expect(boardReady(save)).toBe(true);
  });

  it('登記完還是 unauthorized 就不再重試——成因是密鑰對不上，送幾次都一樣', async () => {
    const save = playing();
    const submit = vi
      .spyOn(client, 'submitScore')
      .mockResolvedValue({ ok: false, error: 'unauthorized' });
    vi.spyOn(client, 'putSave').mockResolvedValue({ ok: true, savedAt: 1 });
    vi.spyOn(client, 'getSave').mockResolvedValue({ ok: false, error: 'notFound' });

    const outcome = await submitRun(save, submission);
    expect(submit).toHaveBeenCalledTimes(3);
    expect(outcome.kind).toBe('failed');
  });

  it('失敗的說明不指控玩家——每一次真的發生，成因都在我們這邊', async () => {
    const save = playing();
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, error: 'rejected' });
    vi.spyOn(client, 'putSave');
    const outcome = await submitRun(save, submission);
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    // 「驗不過」讀起來是在說玩家造假。訊息要指向他做得到的那一步。
    expect(outcome.reason).not.toContain('驗不過');
    expect(outcome.reason).toContain('重新整理');
  });

  it('前五關的失敗不出聲——那幾筆成績在榜上本來就沒有意義', () => {
    // 這個常數是結算頁用來決定「要不要寫那一行」的門檻。
    expect(QUIET_FAILURE_BELOW_STAGE).toBe(6);
    for (const stage of [1, 2, 3, 4, 5]) {
      expect(stage < QUIET_FAILURE_BELOW_STAGE).toBe(true);
    }
    expect(6 < QUIET_FAILURE_BELOW_STAGE).toBe(false);
  });

  it('驗不過不會去動雲端存檔——那和身分沒有關係', async () => {
    const save = playing();
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, error: 'rejected' });
    const put = vi.spyOn(client, 'putSave').mockResolvedValue({ ok: true, savedAt: 1 });

    const outcome = await submitRun(save, submission);
    expect(put).not.toHaveBeenCalled();
    expect(outcome.kind).toBe('failed');
  });

  it('雲端已經有這一份時只認登記，不上傳——自動開通不得蓋掉任何東西', async () => {
    const save = playing();
    const submit = vi
      .spyOn(client, 'submitScore')
      .mockResolvedValueOnce({ ok: false, error: 'unauthorized' })
      .mockResolvedValueOnce({ ok: true, rank: 1, best: true, stage: 42, elapsedMs: 1000 });
    vi.spyOn(client, 'getSave').mockResolvedValue({
      ok: true,
      savedAt: 999,
      blob: '{}',
    });
    const put = vi.spyOn(client, 'putSave');

    await submitRun(save, submission);
    expect(put).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(3);
    expect(boardReady(save)).toBe(true);
  });

  it('連不上伺服器時不當成「雲端是空的」——那會把還在的存檔蓋掉', async () => {
    const save = playing();
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, error: 'serverError' });
    const get = vi
      .spyOn(client, 'getSave')
      .mockResolvedValue({ ok: false, error: 'serverError' });
    const put = vi.spyOn(client, 'putSave');

    await submitRun(save, submission);
    expect(put).not.toHaveBeenCalled();
    void get;
  });

  it('**沒註冊照樣送。** 註冊當門檻的代價是榜上長期只有一個人', async () => {
    // 「註冊才能上榜」這條規則本身站得住（榜上每一筆都對得到一個帳號，
    // 檢舉與改名才有對象），但實測的代價太大：玩家通關後只看到結算頁角落
    // 一行灰字，幾乎沒有人會為此專程走到榜單頁填一張表。
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    save.player.cloud = { playerId: 'p', secret: 's', syncedAt: 1 };
    expect(save.player.account).toBeNull();

    const submit = vi
      .spyOn(client, 'submitScore')
      .mockResolvedValue({ ok: true, rank: 7, best: true, stage: 42, elapsedMs: 1 } as never);

    const outcome = await submitRun(save, submission);
    expect(outcome).toEqual({ kind: 'ok', rank: 7, best: true });
    expect(submit).toHaveBeenCalled();
  });

  it('沒有門派就不送，也不會登記', async () => {
    const submit = vi.spyOn(client, 'submitScore');
    const put = vi.spyOn(client, 'putSave');
    expect(await submitRun(createDefaultSave(1), submission)).toEqual({ kind: 'skipped' });
    expect(submit).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});

/**
 * 上報的配置必須是**開打那一刻**的那一份。
 *
 * 真實故障：製作人回報「正常通關也顯示驗不過」。原因是結算頁在送成績之前
 * 已經寫過存檔了——recordClear 把這一派的通關次數加一，而門派修為每五次
 * 升一階、每階 +4% 法寶傷害。跨階的那一場，伺服器重播出來的是一個傷害
 * 比較高的自己：擊殺順序不同、rng 消耗的次序就不同，重播從那裡開始飄。
 *
 * 症狀只在第 5、10、15、20 次通關出現，所以看起來像隨機。
 */
describe('上報的是開打那一刻的配置', () => {
  afterEach(() => vi.restoreAllMocks());

  it('第 5 次通關：結算之後現算的那一份，傷害比實際打的高一階', () => {
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    save.world.stage = 6;
    save.world.highestStage = 6;
    save.player.sectClears['sword'] = 4;

    const played = loadoutSpecOf(save, save.world.stage);
    recordClear(save, 100);
    const stale = loadoutSpecOf(save, save.world.stage);

    expect(played.sectClears).toBe(4);
    expect(stale.sectClears).toBe(5);
    // 這 4% 就是重播走散的起點。確定性重播沒有「差一點點」這種事。
    expect(buildLoadoutFromSpec(stale).damageMultiplier).toBeGreaterThan(
      buildLoadoutFromSpec(played).damageMultiplier,
    );
  });

  it('submitRun 送的是 submission 裡那一份，不是從存檔現算的', async () => {
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    save.player.account = { email: 'a@b.co', name: '劍修', salt: 'abc' };
    save.player.sectClears['sword'] = 4;
    const captured = scoreLoadoutOf(loadoutSpecOf(save, 6));

    // 結算頁的順序：先寫存檔，再送成績。
    recordClear(save, 100);

    const submit = vi
      .spyOn(client, 'submitScore')
      .mockResolvedValue({ ok: true, rank: 1, best: true, stage: 6, elapsedMs: 1000 });
    await submitRun(save, { stage: 6, runs: 0, steps: 10, actions: [], loadout: captured, arena: false });

    const sent = submit.mock.calls[0]?.[0];
    expect(sent?.loadout.sectClears).toBe(4);
    // 現算的話會是 5——那就是「合法玩家被自己的伺服器指控造假」。
    expect(loadoutFor(save).sectClears).toBe(5);
  });
});
