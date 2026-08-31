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
import type {
  DistributionResult,
  LeaderboardEntry,
  LeaderboardResult,
  ScoreLoadout,
  ScoreSubmitResult,
} from '../../src/net/protocol';
import { MAX_NAME_LENGTH } from '../../src/net/protocol';
import { CARDS, KARMA, SECTS, UPGRADES } from '../../src/data';
import { buildLoadoutFromSpec } from '../../src/systems/loadout';
import type { ReplayAction } from '../../src/systems/replay';
import { replayRun, validateReplay } from '../../src/systems/replay';

/** 榜上顯示幾筆。 */
const TOP_N = 50;

/**
 * 名稱裡要拿掉的字元：控制字元、零寬字元、雙向文字控制符。
 *
 * 控制字元與換行會把榜單版面弄壞；零寬與雙向控制符可以拿來做出
 * 「看起來和別人一模一樣」甚至「顯示成反向」的名字。兩者都不是內容，直接拿掉。
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff]/g;

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

  // 試煉每一條都只讓這一場更難，所以不必夾——照收，否則開了試煉的玩家永遠驗不過。
  const challengesRaw = record['challenges'];
  const challenges: string[] = Array.isArray(challengesRaw)
    ? challengesRaw.filter((id): id is string => typeof id === 'string')
    : [];

  // 符籙的解鎖門檻看歷史最高關卡。宣稱得比實際高只會讓這一場更好打，
  // 但成績仍然是「重播真的通關的那一關」，所以不是可以利用的破口。
  const highest = Number(record['highestStage'] ?? 0);

  return {
    sectId,
    highestStage: Number.isFinite(highest) ? Math.max(1, Math.floor(highest)) : 1,
    talismans,
    upgrades,
    karma,
    sectClears: Number.isFinite(clears) ? Math.max(0, Math.floor(clears)) : 0,
    challenges,
  };
}

/** 名稱：拿掉看不見的字元，掐到長度上限，空的就給一個預設。 */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '無名修士';
  const cleaned = raw.replace(INVISIBLE, '').trim();
  if (cleaned.length === 0) return '無名修士';
  return cleaned.slice(0, MAX_NAME_LENGTH);
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

/** 仙緣換算成乘區。和 src/systems/loadout.ts 的 karmaBonuses 是同一組公式。 */
async function rankOf(env: Env, stage: number): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS ahead FROM scores WHERE hidden = 0 AND stage > ?')
    .bind(stage)
    .first<{ ahead: number }>();
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

  const loadout = sanitizeLoadout(record['loadout']);
  if (loadout === null) return fail('badRequest', env, origin, '配置不合法');
  const actions = actionsOf(record['actions']);
  if (actions === null) return fail('badRequest', env, origin, '操作記錄不合法');

  const runs = Number(record['runs']);
  const steps = Number(record['steps']);
  const claimed = Number(record['stage']);
  if (!Number.isInteger(runs) || runs < 0) return fail('badRequest', env, origin, 'runs 不合法');
  if (!Number.isInteger(claimed) || claimed < 1) return fail('badRequest', env, origin, 'stage 不合法');

  const input = { stage: claimed, runs, totalSteps: steps, actions };
  const rejection = validateReplay(input);
  if (rejection !== null) return fail('rejected', env, origin, rejection);

  // 重播。伺服器用自己算出來的結果，完全不採信客戶端宣稱的關卡。
  //
  // 組裝走的是遊戲**同一個** buildLoadoutFromSpec：修為、試煉、仙緣、符籙解鎖
  // 全部在裡面。這裡若自己拼一份，只要漏掉一個乘區，重播的就是另一場仗——
  // 而那個故障看起來會像「玩家作弊」，不像「伺服器算錯」。
  //
  // highestStage 夾在「不低於這一關」：剛通關第 N 關的人，歷史最高不可能低於 N。
  // 這條同時接住舊版客戶端——它根本不送這個欄位。
  const replayed = replayRun(
    buildLoadoutFromSpec({
      ...loadout,
      stage: claimed,
      highestStage: Math.max(loadout.highestStage, claimed),
    }),
    input,
  );

  // 只有真的通關才記分。沒斬掉首領就不算通關，這條規則和遊戲裡完全一致。
  if (replayed.outcome !== 'cleared') {
    return fail('rejected', env, origin, `重播的結果是 ${replayed.outcome}`);
  }

  const name = sanitizeName(record['name']);
  const now = Date.now();
  const existing = await env.DB.prepare('SELECT stage FROM scores WHERE player_id = ?')
    .bind(playerId)
    .first<{ stage: number }>();
  const best = existing === null || claimed > existing.stage;

  if (best) {
    await env.DB.prepare(
      `INSERT INTO scores (player_id, name, stage, runs, steps, actions, loadout, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id) DO UPDATE SET name = excluded.name,
                                            stage = excluded.stage,
                                            runs = excluded.runs,
                                            steps = excluded.steps,
                                            actions = excluded.actions,
                                            loadout = excluded.loadout,
                                            verified_at = excluded.verified_at`,
    )
      .bind(
        playerId,
        name,
        claimed,
        runs,
        replayed.steps,
        JSON.stringify(actions),
        JSON.stringify(loadout),
        now,
      )
      .run();
  }

  const rank = await rankOf(env, best ? claimed : (existing?.stage ?? claimed));
  return json<ScoreSubmitResult>({ ok: true, stage: claimed, rank, best }, env, origin);
}

export async function leaderboard(env: Env, origin: string | null): Promise<Response> {
  const rows = await env.DB.prepare(
    // 同分時先到的排前面：後來的人追平不該把先達成的人擠下去。
    'SELECT name, stage FROM scores WHERE hidden = 0 ORDER BY stage DESC, verified_at ASC LIMIT ?',
  )
    .bind(TOP_N)
    .all<{ name: string; stage: number }>();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE hidden = 0').first<{
    n: number;
  }>();

  const entries: LeaderboardEntry[] = (rows.results ?? []).map((row, index) => ({
    rank: index + 1,
    name: row.name,
    stage: row.stage,
  }));
  return json<LeaderboardResult>({ ok: true, entries, total: total?.n ?? 0 }, env, origin, 200, {
    // 榜單不需要即時。快取一分鐘，讓 CDN 擋掉絕大多數的請求。
    'cache-control': 'public, max-age=60',
  });
}

/**
 * 關卡分布。
 *
 * 回直方圖而不是「你贏過幾成」，是因為百分位在客戶端算——
 * 這樣同一份回應可以在 CDN 上快取給所有人，不必為每個玩家算一次。
 */
export async function distribution(env: Env, origin: string | null): Promise<Response> {
  const rows = await env.DB.prepare(
    'SELECT stage, COUNT(*) AS n FROM scores WHERE hidden = 0 GROUP BY stage ORDER BY stage ASC',
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
