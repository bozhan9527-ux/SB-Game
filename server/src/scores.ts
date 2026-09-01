/**
 * 排行榜。
 *
 * **客戶端不上報分數，上報的是「種子＋每一個操作」**，由伺服器用同一份
 * tickCombat 重跑一遍，伺服器算出來的結果才算數（見 src/systems/replay.ts）。
 *
 * 它擋得住的：打開 console 改個數字、直接對端點 POST 一個誇張的關卡。
 * 它擋不住的：有人自己搜一個好種子、用程式算出最優操作序列再送上來——
 * 那份紀錄會完全合法地驗過，因為它確實照規則跑得出來。這是客戶端權威型遊戲的
 * 結構性限制，不是這段程式的缺陷。這裡做的是把門檻從「隨便一個人打開 console」
 * 提高到「看得懂程式並願意花幾小時」。
 *
 * 配置（升級等級、仙緣）同樣是客戶端報的，只能夾在資料檔允許的範圍內——
 * 「宣稱一千級」不成立，但「宣稱買滿了」擋不住。要堵死得讓伺服器變成
 * 進度的權威，那是完全另一個量級的工程。
 */
import type { Env } from './http';
import { fail, isNonEmptyString, json, readJson, sha256, timingSafeEqual } from './http';
import { REPLAY_CONTRACT_VERSION, anonName, isBoardKind, trackOfBoard } from '../../src/net/protocol';
import type {
  DistributionResult,
  LeaderboardEntry,
  LeaderboardResult,
  ScoreLoadout,
  ScoreSubmitResult,
} from '../../src/net/protocol';
import { CARDS, DUNGEONS, KARMA, SECTS, UPGRADES } from '../../src/data';
import { ARENA_RULE, buildLoadoutFromSpec } from '../../src/systems/loadout';
import { accountOf } from './accounts';

/** 藏經閣總層數，也就是符籙解鎖的上限。 */
const LIBRARY_FLOORS = DUNGEONS.find((item) => item.id === 'library')?.floors.length ?? 0;

/** 副本能給的最高金幣倍率，用來夾住客戶端上報的值。 */
const MAX_GOLD_MULTIPLIER = Math.max(1, ...DUNGEONS.map((item) => item.goldMultiplier));
/** 上一世深度的上限。夾住荒謬值即可——重點是它不能讓重播的世界無限硬。 */
const MAX_BANKED_STAGE = 100_000;

/** 轉世次數的上限。習性機率本來就有上限，這裡只是擋住荒謬值。 */
const MAX_REBIRTHS = 9_999;

/**
 * 門派秘傳等級的上限。
 *
 * 這條線本身沒有上限，成本每級 ×1.3 才是煞車，所以資料檔裡沒有一個 maxLevel
 * 可以拿來夾。999 級的成本是天文數字，任何真實存檔都到不了——
 * 它擋的是「宣稱一百萬級」，不是「多報幾級」。後者和升級等級同一類，堵不死。
 */
const MAX_SECT_DEPTH = 999;

import type { ReplayAction } from '../../src/systems/replay';
import { replayRun, validateReplay } from '../../src/systems/replay';

/** 榜上顯示幾筆。 */
const TOP_N = 50;


/**
 * 把客戶端報上來的配置夾成合法的範圍。
 *
 * 每一個欄位都當成敵意輸入：門派要存在、符要存在且不重複、
 * 等級不得超過資料檔定義的上限。夾範圍不能證明他真的花錢買過，
 * 但至少讓「一千級」這種東西不成立。
 */
function sanitizeLoadout(raw: unknown): ScoreLoadout | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const sectId = record['sectId'];
  if (typeof sectId !== 'string' || !SECTS.some((sect) => sect.id === sectId)) return null;

  const talismansRaw = record['talismans'];
  if (!Array.isArray(talismansRaw)) return null;
  const talismans: string[] = [];
  for (const id of talismansRaw) {
    if (typeof id !== 'string') continue;
    if (talismans.includes(id)) continue;
    if (!CARDS.some((card) => card.id === id)) continue;
    talismans.push(id);
  }
  if (talismans.length === 0) return null;

  const upgradesRaw = (record['upgrades'] ?? {}) as Record<string, unknown>;
  const upgrades: Record<string, number> = {};
  for (const track of UPGRADES) {
    const level = Number(upgradesRaw[track.id] ?? 0);
    upgrades[track.id] = Number.isFinite(level)
      ? Math.max(0, Math.min(track.maxLevel, Math.floor(level)))
      : 0;
  }

  const karmaRaw = (record['karma'] ?? {}) as Record<string, unknown>;
  const karma: Record<string, number> = {};
  for (const track of KARMA) {
    const level = Number(karmaRaw[track.id] ?? 0);
    karma[track.id] = Number.isFinite(level)
      ? Math.max(0, Math.min(track.maxLevel, Math.floor(level)))
      : 0;
  }

  const clears = Number(record['sectClears'] ?? 0);
  // 門派秘傳沒有等級上限（成本是唯一的煞車），所以這裡夾的是一個
  // 「怎麼玩都到不了」的天花板，不是資料檔裡的 maxLevel。
  const depth = Number(record['sectDepth'] ?? 0);

  // 副本規則每一條都只讓這一場更難，所以不必夾——照收，
  // 否則在副本裡通關的玩家永遠驗不過。
  const rulesRaw = record['rules'];
  const rules: string[] = Array.isArray(rulesRaw)
    ? rulesRaw.filter((id): id is string => typeof id === 'string')
    : [];

  // 藏經閣層數決定抽符池，夾在實際層數之內——宣稱打到第 99 層不該一次拿到二十張符。
  const library = Number(record['libraryFloor'] ?? 0);
  // 倍率只影響金幣、不影響勝負；格位會影響，所以它的上限必須是真的。
  const gold = Number(record['goldMultiplier'] ?? 1);
  // 上一世的深度只夾上限。少報會讓重播出一個比較好打的世界，而伺服器沒辦法
  // 確認——和升級等級同一類的結構性限制，見 README。
  const banked = Number(record['bankedStage'] ?? 0);
  const lives = Number(record['rebirths'] ?? 0);
  // endless 刻意不收：它由榜別決定（見 submitScore），不是客戶端能報的欄位。

  return {
    sectId,
    libraryFloor: Number.isFinite(library)
      ? Math.max(0, Math.min(LIBRARY_FLOORS, Math.floor(library)))
      : 0,
    talismans,
    upgrades,
    karma,
    sectClears: Number.isFinite(clears) ? Math.max(0, Math.floor(clears)) : 0,
    sectDepth: Number.isFinite(depth)
      ? Math.max(0, Math.min(MAX_SECT_DEPTH, Math.floor(depth)))
      : 0,
    rules,
    goldMultiplier: Number.isFinite(gold) ? Math.max(1, Math.min(MAX_GOLD_MULTIPLIER, gold)) : 1,
    bankedStage: Number.isFinite(banked) ? Math.max(0, Math.min(MAX_BANKED_STAGE, Math.floor(banked))) : 0,
    rebirths: Number.isFinite(lives) ? Math.max(0, Math.min(MAX_REBIRTHS, Math.floor(lives))) : 0,
  };
}


function slotOf(raw: unknown): { where: 'hand' | 'field'; index: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const where = record['where'];
  const index = Number(record['index']);
  if (where !== 'hand' && where !== 'field') return null;
  if (!Number.isInteger(index) || index < 0 || index > 64) return null;
  return { where, index };
}

function actionsOf(raw: unknown): ReplayAction[] | null {
  if (!Array.isArray(raw)) return null;
  const actions: ReplayAction[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const record = item as Record<string, unknown>;
    const step = Number(record['step']);
    if (!Number.isInteger(step)) return null;
    if (record['kind'] === 'discard') {
      const index = Number(record['index']);
      if (!Number.isInteger(index)) return null;
      actions.push({ step, kind: 'discard', index });
      continue;
    }
    if (record['kind'] !== 'drop') return null;
    const from = slotOf(record['from']);
    const to = slotOf(record['to']);
    if (from === null || to === null) return null;
    actions.push({ step, kind: 'drop', from, to });
  }
  return actions;
}

/**
 * 榜別。
 *
 * - depth：主線推得最深。同深度比誰快——那是這個榜唯一分得出高下的第二個維度。
 * - speed1 / speed2 / …：速通，**一關一個榜**。同一個榜上大家打的必然是
 *   同一關，秒數才可以比；混成一個榜的話「第 1 關 40 秒」會贏過
 *   「第 81 關 3 分鐘」，它就退化成「誰最快打完最簡單的一關」。
 *   一關一個也讓新玩家打完第一場就上得去，不必等到走完主線。
 * - arena：競技場連下幾波。
 */
export type BoardKind = 'depth' | 'arena' | `speed${number}`;

/** 這個榜是分數大的贏，還是小的贏。速通比誰快，其餘比誰多。 */
function lowerIsBetter(board: BoardKind): boolean {
  return trackOfBoard(board) !== null;
}

/**
 * 認不得的榜別回 null，**不要退回 'depth'**。
 *
 * 退回 depth 的話，一個舊版客戶端送來的速通成績會安靜地變成一筆深度成績，
 * 而它宣稱的關卡是賽道那一關——等於用一場簡單的仗污染深度榜。
 * 不認得就拒絕，讓它在畫面上說得出話。
 */
function boardOf(raw: unknown): BoardKind | null {
  return isBoardKind(raw) ? raw : null;
}

/**
 * 這一筆在榜上第幾名。
 *
 * 算「有幾個人比你好」而不是排序後找位置：後者要把整張榜拉回來，
 * 而榜可以很長，這一個查詢卻永遠只回一個數字。
 */
async function rankOf(env: Env, board: BoardKind, score: number, elapsed: number): Promise<number> {
  // 同分時比秒數：秒數也一樣的才算並列。
  const sql = lowerIsBetter(board)
    ? 'SELECT COUNT(*) AS ahead FROM board_runs WHERE board = ? AND hidden = 0 AND score < ?'
    : `SELECT COUNT(*) AS ahead FROM board_runs
       WHERE board = ? AND hidden = 0 AND (score > ? OR (score = ? AND elapsed_ms < ?))`;
  const statement = lowerIsBetter(board)
    ? env.DB.prepare(sql).bind(board, score)
    : env.DB.prepare(sql).bind(board, score, score, elapsed);
  const row = await statement.first<{ ahead: number }>();
  return (row?.ahead ?? 0) + 1;
}

/**
 * 送出一筆成績。
 *
 * 只留每個玩家最好的一筆，不是每一場都留：榜單要看的是「誰走得最遠」，
 * 而且一個人洗版一百筆會把別人全擠掉。
 */
export async function submitScore(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  if (body === 'tooLarge') return fail('tooLarge', env, origin);
  if (body === 'badRequest') return fail('badRequest', env, origin);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  if (!isNonEmptyString(record['playerId'], 64) || !isNonEmptyString(record['secret'], 128)) {
    return fail('badRequest', env, origin, '缺少身分');
  }
  const playerId = record['playerId'];
  const secret = record['secret'];

  // 身分沿用雲端存檔那一組：上榜必須先有存檔，這樣被檢舉時查得到是誰。
  const hash = await sha256(secret);
  const owner = await env.DB.prepare('SELECT secret_hash FROM saves WHERE player_id = ?')
    .bind(playerId)
    .first<{ secret_hash: string }>();
  if (owner === null) return fail('unauthorized', env, origin, '請先上傳一次雲端存檔');
  if (!timingSafeEqual(owner.secret_hash, hash)) return fail('unauthorized', env, origin);

  // **沒註冊也上得了榜。**
  //
  // 原本這裡擋著「要註冊帳號才能上榜」，而那個規則本身站得住（榜上每一筆
  // 都對得到一個帳號，檢舉與改名才有對象）——但實測的代價太大：玩家通關後
  // 只看到結算頁角落一行灰字，幾乎沒有人會為了它專程走到榜單頁填一張表。
  // 榜上長期只有一個人，而一個只有一個人的榜等於沒有榜。
  //
  // 取捨講明白：**匿名那幾列對不到帳號**，被檢舉時查不出是誰，
  // 他自己也改不了名字。要拿回那些，他註冊就是了——註冊會收編這個身分，
  // 榜上那幾列跟著變成他的。
  const account = await accountOf(env, playerId);

  // **版本對不上就直說。**
  //
  // 玩家的瀏覽器快取住舊的那包 JS 時，他打的那一場和伺服器重播的規則不是
  // 同一套，成績一定被退回——而原本的訊息只寫得出「紀錄和伺服器對不起來」，
  // 他完全無從得知自己在跑舊版本。這個故障已經發生過兩次，兩次的解法都是
  // 「請重新整理」，而那不該由玩家自己猜出來。
  const contract = Number(record['contract'] ?? 0);
  if (!Number.isFinite(contract) || contract < REPLAY_CONTRACT_VERSION) {
    return fail('rejected', env, origin, '你的遊戲是舊版本，重新整理頁面就會更新');
  }
  if (contract > REPLAY_CONTRACT_VERSION) {
    // 前端比後端新：兩個部署是分開的，網站那邊偶爾會早個一分鐘上線。
    return fail('rejected', env, origin, '伺服器正在更新，過一下再試');
  }

  const loadout = sanitizeLoadout(record['loadout']);
  if (loadout === null) return fail('badRequest', env, origin, '配置不合法');
  const actions = actionsOf(record['actions']);
  if (actions === null) return fail('badRequest', env, origin, '操作記錄不合法');

  const runs = Number(record['runs']);
  const steps = Number(record['steps']);
  const claimed = Number(record['stage']);
  if (!Number.isInteger(runs) || runs < 0) return fail('badRequest', env, origin, 'runs 不合法');
  if (!Number.isInteger(claimed) || claimed < 1) return fail('badRequest', env, origin, 'stage 不合法');

  // 教學那一場會換掉起手牌。**不收這個欄位的話它永遠驗不過**，
  // 而那是每個新玩家打贏的第一關。
  const tutorial = record['tutorial'] === true;
  const input = { stage: claimed, runs, totalSteps: steps, actions, tutorial };
  const rejection = validateReplay(input);
  if (rejection !== null) return fail('rejected', env, origin, rejection);

  const board = boardOf(record['board']);
  if (board === null) return fail('badRequest', env, origin, '不認得這個榜');
  // **競技榜只收競技場的一場，而且反過來也成立。**
  //
  // 沒有這一條的話，聚寶洞的一場（同樣是無限模式，但帶著玩家全部的養成）
  // 手動改個 board 就能進競技榜，那個榜立刻退化成「誰洞府等級高」。
  // 反向那一條擋的是另一件事：競技場永遠打第 1 關，混進深度榜沒有意義。
  const arena = loadout.rules.includes(ARENA_RULE);
  if (board === 'arena' && !arena) {
    return fail('rejected', env, origin, '競技榜只收試劍台的一場');
  }
  if (board !== 'arena' && arena) {
    return fail('rejected', env, origin, '試劍台的一場只進競技榜');
  }

  // 重播。伺服器用自己算出來的結果，完全不採信客戶端宣稱的關卡。
  //
  // 組裝走的是遊戲**同一個** buildLoadoutFromSpec：修為、副本規則、仙緣、
  // 符籙解鎖、額外格位全部在裡面。這裡若自己拼一份，只要漏掉一個乘區，
  // 重播的就是另一場仗——而那個故障看起來會像「玩家作弊」，不像「伺服器算錯」。
  //
  // endless 由**榜別**決定，不收客戶端報的：它不是配置，是「這一場是哪一種」。
  // 而且自報它沒有意義——無限模式只會讓這一場更難，作弊的方向不在這裡。
  const replayed = replayRun(
    buildLoadoutFromSpec({ ...loadout, stage: claimed, endless: arena }),
    input,
  );

  if (arena) {
    // **無限模式沒有「通關」這件事。** 它一定是打到守不住為止，所以這裡要驗的
    // 是另外兩件：這一場真的結束了（不是送一份跑到一半就截斷的紀錄），
    // 而且至少下了一波（一波都沒下的 0 分不必佔一列）。
    if (replayed.outcome === 'running') {
      return fail('rejected', env, origin, '這一場還沒打完');
    }
    if (replayed.clearedStages < 1) {
      return fail('rejected', env, origin, '一波都還沒下');
    }
  } else if (replayed.outcome !== 'cleared') {
    // 只有真的通關才記分。沒斬掉首領就不算通關，這條規則和遊戲裡完全一致。
    return fail('rejected', env, origin, `重播的結果是 ${replayed.outcome}`);
  }

  // **名字一律由伺服器決定，不收客戶端報的。** 註冊過的用他的道號；
  // 沒註冊的用 playerId 推出來的匿名名字。
  //
  // 匿名那一半特別重要：名字如果是自己報的，任何人都能把自己叫做別人的
  // 道號，榜上就分不出誰是誰了。
  const name = account ?? anonName(playerId);
  const now = Date.now();

  // **秒數用伺服器重播算出來的，不收客戶端報的。** 它和關卡數一樣是分數，
  // 自報的分數沒有意義。而且它是模擬時間——加速鍵改的是「一幀補幾格」，
  // 所以開 3× 打完這個數字完全一樣，拿來排名是公平的。
  const elapsed = Math.round(replayed.elapsedMs);
  // 速通榜只收自己那一關：不同關的秒數不能比。
  const track = trackOfBoard(board);
  if (track !== null && claimed !== track) {
    return fail('rejected', env, origin, `這個速通榜只收第 ${track} 關`);
  }
  const score = track !== null ? elapsed : board === 'arena' ? replayed.clearedStages : claimed;

  const existing = await env.DB.prepare(
    'SELECT score, elapsed_ms FROM board_runs WHERE board = ? AND player_id = ?',
  )
    .bind(board, playerId)
    .first<{ score: number; elapsed_ms: number }>();

  const best =
    existing === null ||
    (lowerIsBetter(board)
      ? score < existing.score
      : score > existing.score ||
        (score === existing.score && elapsed < existing.elapsed_ms));

  if (best) {
    await env.DB.prepare(
      `INSERT INTO board_runs
         (board, player_id, name, score, stage, elapsed_ms, runs, steps, actions, loadout, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(board, player_id) DO UPDATE SET name = excluded.name,
                                                   score = excluded.score,
                                                   stage = excluded.stage,
                                                   elapsed_ms = excluded.elapsed_ms,
                                                   runs = excluded.runs,
                                                   steps = excluded.steps,
                                                   actions = excluded.actions,
                                                   loadout = excluded.loadout,
                                                   verified_at = excluded.verified_at`,
    )
      .bind(
        board,
        playerId,
        name,
        score,
        claimed,
        elapsed,
        runs,
        replayed.steps,
        JSON.stringify(actions),
        JSON.stringify(loadout),
        now,
      )
      .run();
  }

  const kept = best ? { score, elapsed } : { score: existing.score, elapsed: existing.elapsed_ms };
  const rank = await rankOf(env, board, kept.score, kept.elapsed);
  return json<ScoreSubmitResult>(
    { ok: true, stage: claimed, rank, best, elapsedMs: elapsed },
    env,
    origin,
  );
}

interface BoardRow {
  player_id: string;
  name: string;
  score: number;
  stage: number;
  elapsed_ms: number;
}

function toEntry(row: BoardRow, rank: number): LeaderboardEntry {
  return {
    rank,
    name: row.name,
    score: row.score,
    stage: row.stage,
    elapsedMs: row.elapsed_ms,
  };
}

/**
 * 一個榜的前 N 名，外加呼叫者自己那一列。
 *
 * **playerId 是選填的，而且不必附密鑰**：這裡只讀公開的榜單資料，
 * 拿別人的 id 來查也只會看到那個人本來就公開在榜上的東西。
 * 要求密鑰的話這一頁就不能被 CDN 快取，代價遠大於收益。
 */
export async function leaderboard(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const board = boardOf(url.searchParams.get('board')) ?? 'depth';
  const playerId = url.searchParams.get('playerId');

  // 同分時比秒數，秒數也一樣就先到的排前面——後來的人追平不該把先達成的擠下去。
  const order = lowerIsBetter(board)
    ? 'score ASC, verified_at ASC'
    : 'score DESC, elapsed_ms ASC, verified_at ASC';
  const rows = await env.DB.prepare(
    `SELECT player_id, name, score, stage, elapsed_ms FROM board_runs
     WHERE board = ? AND hidden = 0 ORDER BY ${order} LIMIT ?`,
  )
    .bind(board, TOP_N)
    .all<BoardRow>();
  const total = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM board_runs WHERE board = ? AND hidden = 0',
  )
    .bind(board)
    .first<{ n: number }>();

  const entries = (rows.results ?? []).map((row, index) => toEntry(row, index + 1));

  let mine: LeaderboardEntry | null = null;
  if (playerId !== null && playerId.length > 0 && playerId.length <= 64) {
    // 已經在前 N 名裡就直接用那一列，省一次查詢。
    const listed = entries.find((_, index) => rows.results?.[index]?.player_id === playerId);
    if (listed !== undefined) {
      mine = listed;
    } else {
      const row = await env.DB.prepare(
        `SELECT player_id, name, score, stage, elapsed_ms FROM board_runs
         WHERE board = ? AND player_id = ? AND hidden = 0`,
      )
        .bind(board, playerId)
        .first<BoardRow>();
      if (row !== null) mine = toEntry(row, await rankOf(env, board, row.score, row.elapsed_ms));
    }
  }

  return json<LeaderboardResult>(
    { ok: true, entries, total: total?.n ?? 0, mine },
    env,
    origin,
    200,
    // 帶了 playerId 的那一份是個人化的，不能給 CDN 快取給所有人。
    playerId === null ? { 'cache-control': 'public, max-age=60' } : { 'cache-control': 'no-store' },
  );
}

/**
 * 關卡分布。
 *
 * 回直方圖而不是「你贏過幾成」，是因為百分位在客戶端算——
 * 這樣同一份回應可以在 CDN 上快取給所有人，不必為每個玩家算一次。
 */
export async function distribution(env: Env, origin: string | null): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT stage, COUNT(*) AS n FROM board_runs
     WHERE board = 'depth' AND hidden = 0 GROUP BY stage ORDER BY stage ASC`,
  ).all<{ stage: number; n: number }>();

  const buckets: number[] = [];
  let total = 0;
  for (const row of rows.results ?? []) {
    while (buckets.length <= row.stage) buckets.push(0);
    buckets[row.stage] = row.n;
    total += row.n;
  }
  return json<DistributionResult>({ ok: true, buckets, total }, env, origin, 200, {
    'cache-control': 'public, max-age=300',
  });
}
