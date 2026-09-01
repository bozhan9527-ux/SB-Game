/**
 * 一場戰鬥的重播。
 *
 * **這是排行榜防作弊的地基。** 客戶端不上報「我打到第幾關」，而是上報
 * 「種子＋我做過的每一個操作」，由伺服器用**同一份 tickCombat** 重跑一遍，
 * 伺服器算出來的結果才算數。
 *
 * 要讓這件事成立，戰鬥必須是**完全確定性**的，而它原本不是——
 * 舊版把瀏覽器的畫格時間直接餵給 tickCombat，同一組操作在 60fps 與 30fps 的機器上
 * 會跑出不同的結果。所以 RunScene 改成固定時步：真實時間累積成一格一格的
 * STEP_MS，模擬只看格數，不看畫格率。這件事本身也是個修正——
 * 掉幀不再等於變難。
 *
 * **它證明的是「這一場在規則下跑得出來」，不是「這一場是人打出來的」。**
 * 有人可以自己搜一個好種子、用程式算出最優操作序列再送上來，那份紀錄會
 * 完全合法地驗過。這是客戶端權威型遊戲的結構性限制，不是這段程式的缺陷；
 * 它把作弊的門檻從「打開 console 改個數字」提高到「看得懂程式並願意花幾小時」。
 *
 * 本檔不 import Phaser，全部是純函式——Cloudflare Worker 直接 import 它。
 */
import type { CardSlot, DefenseState, Outcome } from './defense';
import { createDefenseState, discardHand, dropOn, tickCombat } from './defense';
import type { Loadout } from './loadout';
import { createRng } from './rng';

/**
 * 一格模擬的長度（ms）。
 *
 * 16 對應 60fps，是最常見的畫格率，所以絕大多數機器上一幀正好跑一格。
 * 它同時是重播的時間單位：操作記錄裡的 step 就是「第幾格」。
 */
export const STEP_MS = 16;

/**
 * 一幀最多補幾格。
 *
 * 分頁被切到背景再切回來時，delta 可能是好幾秒；不設上限的話會一次補上幾百格，
 * 畫面凍住而且妖魔瞬間衝到山門。寧可少算那段時間——玩家沒在看的時候，
 * 遊戲不該繼續推進。
 */
export const MAX_STEPS_PER_FRAME = 12;

/** 一個操作本身，不含時間。 */
export type ReplayActionInput =
  | { kind: 'drop'; from: CardSlot; to: CardSlot }
  | { kind: 'discard'; index: number };

/** 操作加上它發生在第幾格。分成兩層是因為 Omit 套在聯集型別上會把成員拆散。 */
export type ReplayAction = ReplayActionInput & { step: number };

export interface ReplayInput {
  /** 關卡編號。與 runs 一起決定種子。 */
  stage: number;
  /** 這是玩家的第幾次挑戰。種子的另一半。 */
  runs: number;
  /** 總共跑了幾格。伺服器最多跑這麼多格，提早分出勝負就停。 */
  totalSteps: number;
  actions: readonly ReplayAction[];
}

export interface ReplayResult {
  outcome: Outcome;
  stage: number;
  /** 這一場的模擬時間。速通榜看它。 */
  elapsedMs: number;
  /** 無限模式連下幾波。競技榜看它。 */
  clearedStages: number;
  steps: number;
  disciples: number;
  kills: number;
  leaks: number;
  peakTier: number;
  bossKilled: boolean;
}

/** 一場的種子。與 RunScene 用的算式必須完全一致，否則重播出來的是另一場。 */
export function runSeed(stage: number, runs: number): number {
  return stage * 7919 + runs * 104729;
}

/**
 * 上限：一場最多允許幾格。防止有人送一份要跑三小時的紀錄把伺服器綁住。
 *
 * 120000 格 ＝ 32 分鐘的模擬時間，重播大約 1.6 秒的 CPU（實測每格約 13 微秒），
 * 在 Worker 的預算裡很寬鬆。
 *
 * **它是為競技場放寬的。** 原本的 60000 是對著主線一關調的，而競技場一場
 * 打十幾波很正常——實測一個「會合成」的自動玩法就跑到 37676 格，人打得更久。
 * 超過上限的後果是成績**安靜地被退回**，而那正是這個榜最不能發生的事：
 * 打得最好的人反而上不了榜，還看不出原因。
 */
export const MAX_REPLAY_STEPS = 120_000;
/** 上限：一場最多允許幾個操作。人手一場大約幾百個，一萬是很寬鬆的天花板。 */
export const MAX_REPLAY_ACTIONS = 10_000;

export type ReplayRejection = 'tooManySteps' | 'tooManyActions' | 'actionsOutOfOrder' | 'stepOutOfRange';

/**
 * 檢查一份紀錄在跑之前是否明顯不合法。
 *
 * 先擋掉再跑，是因為重播要花真實的 CPU 時間——而任何人都能對著端點送東西。
 */
export function validateReplay(input: ReplayInput): ReplayRejection | null {
  if (!Number.isInteger(input.totalSteps) || input.totalSteps < 0) return 'stepOutOfRange';
  if (input.totalSteps > MAX_REPLAY_STEPS) return 'tooManySteps';
  if (input.actions.length > MAX_REPLAY_ACTIONS) return 'tooManyActions';
  let previous = -1;
  for (const action of input.actions) {
    if (!Number.isInteger(action.step) || action.step < 0) return 'stepOutOfRange';
    if (action.step > input.totalSteps) return 'stepOutOfRange';
    // 必須照時間排好。亂序的紀錄重播出來不會是原本那一場。
    if (action.step < previous) return 'actionsOutOfOrder';
    previous = action.step;
  }
  return null;
}

/**
 * 重跑一場。
 *
 * 順序是「先套用這一格的操作，再推進一格」——
 * 和 RunScene 完全一致：Phaser 的輸入事件永遠落在兩幀之間，
 * 不可能插進固定時步的 while 迴圈中間，所以每個操作都對齊在格的邊界上。
 * 這個順序若對調，rng 被消耗的次序就會不同，重播的結果會慢慢飄開。
 */
export function replayRun(loadout: Loadout, input: ReplayInput): ReplayResult {
  const rng = createRng(runSeed(input.stage, input.runs));
  const state = createDefenseState(loadout, rng);

  let cursor = 0;
  let steps = 0;
  for (; steps < input.totalSteps; steps += 1) {
    while (cursor < input.actions.length) {
      const action = input.actions[cursor];
      if (action === undefined || action.step > steps) break;
      applyAction(state, action, rng);
      cursor += 1;
    }
    tickCombat(state, STEP_MS, rng);
    if (state.outcome !== 'running') {
      steps += 1;
      break;
    }
  }

  return {
    outcome: state.outcome,
    stage: state.stage,
    // 模擬時間，不是牆上時間。加速鍵改的是「一幀補幾格」，所以開 3× 打完
    // 這個數字完全一樣——它才有資格拿來排速通榜。
    elapsedMs: state.elapsedMs,
    // 無限模式打了幾波。有終點的一場永遠是 0。
    clearedStages: state.clearedStages,
    steps,
    disciples: state.disciples,
    kills: state.kills,
    leaks: state.leaks,
    peakTier: state.peakTier,
    bossKilled: state.bossKilled,
  };
}

function applyAction(state: DefenseState, action: ReplayAction, rng: ReturnType<typeof createRng>): void {
  // 非法的操作（指到空格、超出範圍）不是錯誤，是 no-op：
  // dropOn 與 discardHand 本來就會自己回 false。伺服器不需要為此拒絕整份紀錄，
  // 因為那一步在原本那一場裡同樣什麼都沒做。
  if (action.kind === 'discard') {
    discardHand(state, action.index);
    return;
  }
  dropOn(state, action.from, action.to, rng);
}
