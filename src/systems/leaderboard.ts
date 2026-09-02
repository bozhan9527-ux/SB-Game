/**
 * 排行榜的客戶端邏輯。
 *
 * 上榜這件事對玩家來說必須是**背景發生、失敗也不打斷**的：
 * 他剛通關，正在看結算表，此時跳一個「連不上伺服器」的錯誤只是掃興。
 * 所以這裡所有的失敗路徑都只是回傳一個結果，由呼叫端決定要不要顯示。
 *
 * 本檔不 import Phaser。
 */
import { getSave, putSave, submitScore } from '../net/client';
import { REPLAY_CONTRACT_VERSION, speedBoard, speedTrackOf } from '../net/protocol';
import type { BoardKind, ScoreLoadout } from '../net/protocol';
import type { SaveData } from '../save/types';
import type { RunSubmission } from '../scenes/types';
import { ensureCloudIdentity } from './cloud';
import type { CloudIdentity } from '../save/types';
import { ARENA_RULE, loadoutSpecOf } from './loadout';
import type { LoadoutSpec } from './loadout';

/**
 * 把存檔裡的配置整理成伺服器重播要用的那一份。
 *
 * 直接沿用 loadoutSpecOf——伺服器收到之後補上關卡就是一份 LoadoutSpec，
 * 和玩家這一場實際用的是同一個組裝函式。這裡若自己挑欄位，
 * 兩邊遲早會走散，而症狀是「合法成績被退回」。
 */
export function scoreLoadoutOf(spec: LoadoutSpec): ScoreLoadout {
  const { stage: _stage, endless: _endless, ...rest } = spec;
  return {
    ...rest,
    talismans: [...rest.talismans],
    upgrades: { ...rest.upgrades },
    karma: { ...rest.karma },
    rules: [...rest.rules],
  };
}

/**
 * 從存檔現算一份。
 *
 * **只適合「當下就要開打」的情境。** 上報成績不能用它——見 submitRun 的註解，
 * 存檔在那一刻已經被這一場的結算改過了。
 */
export function loadoutFor(save: SaveData): ScoreLoadout {
  return scoreLoadoutOf(loadoutSpecOf(save, 1));
}


/**
 * 這一場該進哪幾個榜。
 *
 * 在這裡判而不是丟給伺服器，是因為「一場成績算幾個榜」是遊戲規則，
 * 不是資料庫的事。
 *
 * **看的是競技場，不是無限模式。** 聚寶洞也是無限模式，但它帶著玩家
 * 全部的養成——把它的波數丟進競技榜，那個榜就從「誰操作得好」
 * 變成「誰洞府等級高」，而競技場存在的唯一理由正是不比那個。
 */
export function boardsFor(stage: number, arena: boolean, replay = false): BoardKind[] {
  if (arena) return ['arena'];
  // 每一場**同時進兩個榜**：它既是一筆深度成績，也是那一關的一筆秒數成績。
  // 速通是一關一個榜，所以一場只會佔其中一個——同一個榜上大家打的
  // 必然是同一關，秒數才真的可以比。
  const track = speedTrackOf(stage);
  // 重挑一個過掉的關卡只進速通榜。它的深度是舊聞（那一關早就過了），
  // 送上去只是白花一次伺服器重播——而一次重播要 40 毫秒 CPU。
  if (replay) return track === null ? [] : [speedBoard(track)];
  return track === null ? ['depth'] : ['depth', speedBoard(track)];
}

/**
 * 這一場的成績上不上報。
 *
 * 抽成一個純函式而不是留在 RunScene 的三元運算裡，理由很實際：那一段
 * 判斷藏在一個兩千多行的場景中間，而它錯掉的症狀是**畫面上完全沒有跡象**——
 * 玩家通關、結算表照跑、榜上就是永遠沒有他。真的發生過一次（配置快照那一行
 * 漏了，於是 submission 恆為 null，一場都沒送出去）。
 *
 * 規則本身：中途放棄的一場沒有意義；副本的深度是副本決定的，拿去和
 * 「推到第幾關」比不是同一件事。**競技場是唯一的例外**——它是個副本，
 * 但它存在的理由就是那個榜。
 *
 * **教學那一場也要上榜。** 它曾經被排除（它會改寫起手牌），但那是實作問題
 * 不是規則問題——伺服器現在走同一個 applyTutorialOpening，重播得出來。
 * 排除它的代價是每個新玩家打贏的第一關都不算，而那正是他最需要看到
 * 自己名字的一刻。
 */
export function runIsRankable(options: {
  abandoned: boolean;
  /** 這一場的副本規則。主線是 null。 */
  dungeonRules: readonly string[] | null;
}): boolean {
  if (options.abandoned) return false;
  if (options.dungeonRules === null) return true;
  return options.dungeonRules.includes(ARENA_RULE);
}

export type SubmitOutcome =
  | { kind: 'ok'; rank: number; best: boolean }
  | { kind: 'skipped' }
  | { kind: 'failed'; reason: string };

/**
 * 把這個身分登記到伺服器上（＝上傳一次雲端存檔）。
 *
 * 上榜要求伺服器認得這個身分，理由是「被檢舉時查得到是誰」——那是對的，
 * 但**那一步對玩家毫無意義**：他要的是上榜，不是同步存檔，而在他通關之前
 * 沒有任何地方會告訴他少做了這一步。所以改成由程式自己補。
 *
 * 只在伺服器說「沒看過這個身分」時才做，因此**不可能蓋掉任何東西**：
 * 那句話的意思就是雲端還沒有這一份。手動上傳那條路留著，
 * 它處理的是另一件事（換裝置、覆蓋、看時間戳決定要不要蓋）。
 */
export async function registerForBoard(save: SaveData): Promise<boolean> {
  const identity = ensureCloudIdentity(save);

  // **先問，再寫。** 伺服器上已經有這個身分的話，登記這件事本來就完成了，
  // 一個位元組都不必上傳。這一條讓「自動開通」在任何情況下都不可能蓋掉
  // 雲端那一份——而那正是手動上傳存在的理由（它要處理覆蓋，所以會問人）。
  const existing = await getSave({
    playerId: identity.playerId,
    secret: identity.secret,
  });
  if (existing.ok) {
    identity.syncedAt = Date.now();
    return true;
  }
  // notFound 才是「還沒登記」。其他錯誤（連不上、密鑰對不上）不能當成
  // 「雲端是空的」——那會把一份還在的存檔蓋掉。
  if (existing.error !== 'notFound') return false;

  const result = await putSave({
    playerId: identity.playerId,
    secret: identity.secret,
    savedAt: save.savedAt,
    blob: JSON.stringify(save),
  });
  if (!result.ok) return false;
  identity.syncedAt = Date.now();
  return true;
}

/** 伺服器已經認得這個身分了嗎。認得就代表上榜這條路是通的。 */
export function boardReady(save: SaveData): boolean {
  const identity: CloudIdentity | null = save.player.cloud;
  return identity !== null && identity.syncedAt > 0;
}

/**
 * 送出一筆成績。
 *
 * **只在通關時送。** 沒通關的一場上榜沒有意義，而且伺服器也會拒絕——
 * 在這裡先擋掉可以省下一趟完全會失敗的請求。
 *
 * 第一次被回 unauthorized 時會自己登記一次再重送：那個錯誤幾乎一定是
 * 「還沒上傳過雲端存檔」，而要求玩家先去別的頁面按一顆按鈕、
 * 再回來重打一場，只是把一個實作細節丟給他扛。
 */
export async function submitRun(
  save: SaveData,
  submission: RunSubmission,
): Promise<SubmitOutcome> {
  // **關卡從 submission 拿，不從呼叫端。** 它是種子的一半，而結算頁手上那個
  // 關卡在無限模式裡是「止步於第幾關」，不是開打的那一關。
  const stage = submission.stage;
  if (save.player.sectId === null) return { kind: 'skipped' };
  // 沒註冊照樣送。榜上會顯示一個伺服器發的匿名名字，等他哪天註冊了，
  // 那幾列就跟著變成他的道號——註冊會收編這個身分。
  const identity = ensureCloudIdentity(save);

  const send = (board: BoardKind): Promise<Awaited<ReturnType<typeof submitScore>>> =>
    submitScore({
      board,
      playerId: identity.playerId,
      secret: identity.secret,
      name: save.player.name,
      stage,
      runs: submission.runs,
      steps: submission.steps,
      actions: submission.actions,
      // **用開打那一刻的那一份，不是現在現算的。**
      //
      // 結算頁在送成績之前已經寫過存檔了：recordClear 會把這一派的通關次數
      // 加一，而門派修為每五次升一階、每階 +4% 法寶傷害。跨過階的那一場，
      // 伺服器重播出來的是一個傷害比較高的自己——擊殺順序不同、rng 消耗的
      // 次序就不同，重播從那裡開始飄，最後判成沒通關。
      //
      // 症狀是「正常通關卻說驗不過」，而且只在第 5、10、15、20 次通關發生，
      // 所以看起來像隨機。種子那一半（runs）當初就是為了同一個理由當場記下來的，
      // 配置這一半漏了。
      loadout: submission.loadout,
      // 教學會換掉起手牌，伺服器重播前要先做同一件事。
      tutorial: submission.tutorial,
      // 對不上的話伺服器直接說「你的遊戲是舊版本」，而不是丟一句
      // 「紀錄和伺服器對不起來」讓玩家自己猜。
      contract: REPLAY_CONTRACT_VERSION,
    });

  // 第一個榜是主榜——它的名次就是要顯示給玩家看的那一個。其餘的
  // （打完主線最後一關那一場同時算速通）在背景送，失敗也不吵他。
  const boards = boardsFor(stage, submission.arena, submission.replay);
  // 沒有任何榜收這一場（重挑一個超出速通榜範圍的關卡）就別打伺服器。
  const primary = boards[0];
  if (primary === undefined) return { kind: 'skipped' };
  let result = await send(primary);

  if (!result.ok && result.error === 'unauthorized') {
    // 自己補登記再重送一次。只重試這一次：登記完還是 unauthorized 的話
    // 成因是另一件事（密鑰對不上），再送幾次也一樣。
    if (await registerForBoard(save)) result = await send(primary);
  } else if (!result.ok && result.error === 'serverError') {
    // **傳輸層的失敗重送一次。** 手機網路斷一下就丟掉一整場成績太貴了，
    // 而這一支是冪等的（伺服器只留每個人最好的一筆），重送不會有副作用。
    //
    // 只重一次：真的連不上的話，第二次也不會通，而玩家已經在等了。
    result = await send(primary);
  }
  for (const board of boards.slice(1)) await send(board);

  if (!result.ok) {
    if (result.error === 'unauthorized') {
      return { kind: 'failed', reason: '這台裝置的身分對不上雲端那一份，先到「存檔」同步一次' };
    }
    if (result.error === 'rejected') {
      // **伺服器說了原因就用伺服器那一句。**
      //
      // 這裡原本一律換成下面那句通用的話，於是「你的遊戲是舊版本，重新整理
      // 頁面就會更新」永遠傳不到玩家眼前——我為了那句話加了一整套版本檢查，
      // 而它被這一行丟掉了。實測：製作人玩到第四關，每一場都收到通用訊息，
      // 兩個人一起猜了三輪才發現真正的原因就寫在被丟掉的那個欄位裡。
      //
      // **不寫成「驗不過」。** 那三個字讀起來是在指控玩家造假，而實際上
      // 每一次真的發生，成因都在我們這邊。訊息要指向他做得到的那一步，
      // 不是指向他的人格——伺服器那幾句都是照這個標準寫的。
      return {
        kind: 'failed',
        reason: result.detail ?? '這一場沒上榜：紀錄和伺服器對不起來，重新整理一次再試',
      };
    }
    // 其餘（連不上、逾時、伺服器內部錯誤、資料太大）一樣用伺服器／傳輸層
    // 給的那一句。這裡原本也是一句寫死的「連不上伺服器」，而它把四種不同的
    // 失敗蓋成同一句話——網路明明是通的那個人只會覺得這句話在騙他。
    return {
      kind: 'failed',
      reason: result.detail ?? '這一場沒有上榜，稍後再試',
    };
  }
  return { kind: 'ok', rank: result.rank, best: result.best };
}
