import { describe, it, expect } from 'vitest';
import { BALANCE, DUNGEONS, SECTS, UPGRADES } from '../src/data';
import { cardDps, fieldDps, maxTierForStage } from '../src/systems/deck';
import type { Card } from '../src/systems/deck';
import type { CardSlot, DefenseState } from '../src/systems/defense';
import {
  clearReward,
  createDefenseState,
  defeatReward,
  deployCard,
  discardHand,
  mergeInto,
  swapCards,
  swapSlots,
  tickCombat,
} from '../src/systems/defense';
import { buildLoadoutFromSpec, buildLoadoutFor } from '../src/systems/loadout';
import { talismanDefs } from '../src/systems/talismans';
import { createRng } from '../src/systems/rng';
import { trackById, upgradeCost } from '../src/systems/upgrades';

/**
 * 數值平衡的自動驗算。
 *
 * 場景與這裡跑的是**同一支 tickCombat**，因此模擬出來的難度就是玩家實際遇到的難度，
 * 不是另一套近似模型。整個遊戲循環（防守 → 拿金幣 → 升級 → 下一關）跑完 81 關，
 * 用來擋住「某一關突然守不住」或「首領被秒殺」這種只有實際玩才會發現的失衡。
 */

/**
 * 模擬玩家每 250ms 做一個決定。
 *
 * 這個數字對「數值夠不夠」是合理的，但對「來不來得及操作」是**嚴重高估**：
 * 它等於一場做將近兩百次零延遲的拖曳。真人一次拖放約 0.6–1.5 秒。
 * 因此凡是牽涉「玩家有沒有時間做完」的問題，一律要用 HUMAN_DECISION_MS 另外驗
 * （見下方「飛升境」那一段與 PROGRESS 的 L-18）。
 */
const DECISION_MS = 250;
/**
 * 真人一次拖放的耗時。用來驗「操作預算」而不是「數值」。
 *
 * 1500ms 是「肯花時間把陣排好」的玩家——他正是上一版被懲罰的那一種：
 * 排得越慢死得越快，而陣法本來就是設計來獎勵他的。
 */
const HUMAN_DECISION_MS = 1500;
const TICK_MS = 100;

function dpsOf(card: Card | null, state: DefenseState): number {
  return card === null ? 0 : cardDps(card, state.loadout);
}

/**
 * 一個「會玩但不完美」的策略：能合就合，有空位就放最強的，卡住就換掉場上最弱的。
 *
 * 刻意不做長期規劃（不會為了湊某一種符而留手牌），因此模擬結果對真人是保守的。
 */
function playOneAction(state: DefenseState, rng: ReturnType<typeof createRng>): void {
  const maxTier = maxTierForStage(state.stage);
  const all: CardSlot[] = [
    ...state.hand.map((_, index) => ({ where: 'hand' as const, index })),
    ...state.field.map((_, index) => ({ where: 'field' as const, index })),
  ];
  const at = (slot: CardSlot): Card | null =>
    (slot.where === 'hand' ? state.hand[slot.index] : state.field[slot.index]) ?? null;

  // 1. 能合就合。手牌之間也算，因為玩家會先在手裡湊一對再放下去。
  let best: { a: CardSlot; b: CardSlot; score: number } | null = null;
  for (const a of all) {
    const cardA = at(a);
    if (cardA === null || cardA.tier >= maxTier) continue;
    for (const b of all) {
      if (a.where === b.where && a.index === b.index) continue;
      const cardB = at(b);
      if (cardB === null || cardB.type !== cardA.type || cardB.tier !== cardA.tier) continue;
      // 同樣能合的話優先合在場上，合完就立刻在打。
      const score = cardA.tier * 2 + (b.where === 'field' ? 1 : 0);
      if (best === null || score > best.score) best = { a, b, score };
    }
  }
  if (best !== null) {
    mergeInto(state, best.a, best.b, rng);
    return;
  }

  // 2. 場上有空位就放手牌裡最強的一張。
  const empty = state.field.indexOf(null);
  if (empty >= 0) {
    let pick = -1;
    for (let h = 0; h < state.hand.length; h += 1) {
      if (state.hand[h] == null) continue;
      if (pick < 0 || dpsOf(state.hand[h] ?? null, state) > dpsOf(state.hand[pick] ?? null, state)) {
        pick = h;
      }
    }
    if (pick >= 0) {
      deployCard(state, pick, empty);
      return;
    }
  }

  // 3. 手牌滿了又合不了：換掉場上最弱的一張，換不划算就直接棄掉最弱的手牌。
  if (!state.hand.includes(null)) {
    let worstField = 0;
    let bestHand = 0;
    for (let f = 1; f < state.field.length; f += 1) {
      if (dpsOf(state.field[f] ?? null, state) < dpsOf(state.field[worstField] ?? null, state)) {
        worstField = f;
      }
    }
    for (let h = 1; h < state.hand.length; h += 1) {
      if (dpsOf(state.hand[h] ?? null, state) > dpsOf(state.hand[bestHand] ?? null, state)) {
        bestHand = h;
      }
    }
    if (dpsOf(state.hand[bestHand] ?? null, state) > dpsOf(state.field[worstField] ?? null, state)) {
      swapCards(state, bestHand, worstField);
    } else {
      let worstHand = 0;
      for (let h = 1; h < state.hand.length; h += 1) {
        if (dpsOf(state.hand[h] ?? null, state) < dpsOf(state.hand[worstHand] ?? null, state)) {
          worstHand = h;
        }
      }
      discardHand(state, worstHand);
    }
  }
}

/** 場上有沒有還能合的一對，或有沒有空位可以補。 */
function hasMergeOrDeploy(state: DefenseState): boolean {
  const maxTier = maxTierForStage(state.stage);
  const all: (Card | null)[] = [...state.hand, ...state.field];
  for (let i = 0; i < all.length; i += 1) {
    const a = all[i] ?? null;
    if (a === null || a.tier >= maxTier) continue;
    for (let j = i + 1; j < all.length; j += 1) {
      const b = all[j] ?? null;
      if (b !== null && b.type === a.type && b.tier === a.tier) return true;
    }
  }
  return state.field.includes(null) && state.hand.some((card) => card != null);
}

/**
 * 「會排陣」的玩家：在 playOneAction 之上多一步——把場上兩格對調，只要總輸出更高就換。
 *
 * 為什麼要另外寫一支，而不是把它加進 playOneAction：
 * 上面所有測試的難度門檻都是在「不排陣的 AI」之下校準的，動它等於重訂全部門檻。
 * 而且這兩種玩家本來就該分開量——**會排陣的那一種，正是 L-18 那一版被懲罰的那一種**。
 *
 * 順序很要緊：**合成與補位永遠優先於排陣**。第一版寫成「只要有更好的擺法就先換」，
 * 結果九宮格擺滿之後幾乎永遠找得到微幅更優的交換，這支 AI 就再也不合成了，
 * 深層關卡直接掛零——那不是玩家會做的事，是我把模型寫錯了。
 */
function playOneArrangingAction(state: DefenseState, rng: ReturnType<typeof createRng>): void {
  if (hasMergeOrDeploy(state)) {
    playOneAction(state, rng);
    return;
  }
  const before = fieldDps(state.field, state.loadout);
  let gain = 0;
  let move: [number, number] | null = null;
  for (let i = 0; i < state.field.length; i += 1) {
    for (let j = i + 1; j < state.field.length; j += 1) {
      const copy = [...state.field];
      const a = copy[i] ?? null;
      const b = copy[j] ?? null;
      copy[i] = b;
      copy[j] = a;
      const delta = fieldDps(copy, state.loadout) - before;
      if (delta > gain + 1e-9) {
        gain = delta;
        move = [i, j];
      }
    }
  }
  if (move === null) {
    playOneAction(state, rng);
    return;
  }
  swapSlots(state, { where: 'field', index: move[0] }, { where: 'field', index: move[1] });
}

interface RunOutcome {
  victory: boolean;
  survivors: number;
  leaks: number;
  /** 首領砸門的次數。大於 0 代表這一場撐到了「首領已經在門口」的階段。 */
  bossGateHits: number;
  peakTier: number;
  elapsedMs: number;
  gold: number;
}

function runOnce(
  stage: number,
  upgrades: Record<string, number>,
  sectId: string,
  seed: number,
  talismans?: readonly string[],
  decisionMs: number = DECISION_MS,
  arranging = false,
): RunOutcome {
  const sect = SECTS.find((item) => item.id === sectId);
  if (sect === undefined) throw new Error(`測試用門派不存在：${sectId}`);
  const rng = createRng(seed);
  const pool = talismans === undefined ? undefined : talismanDefs(talismans, 999);
  const state = createDefenseState(buildLoadoutFor(sect, upgrades, stage, pool), rng);

  let sinceDecision = 0;
  let bossGateHits = 0;
  // 上限是「首領時限 + 所有波次的排程長度」，正常情況不會走到。
  const hardLimit =
    BALANCE.wave.wavesPerStage * BALANCE.wave.waveIntervalMs + BALANCE.boss.timeLimitMs + 30000;

  while (state.outcome === 'running' && state.elapsedMs < hardLimit) {
    const report = tickCombat(state, TICK_MS, rng);
    bossGateHits += report.leaks.filter((leak) => leak.boss).length;
    sinceDecision += TICK_MS;
    while (sinceDecision >= decisionMs) {
      sinceDecision -= decisionMs;
      if (arranging) playOneArrangingAction(state, rng);
      else playOneAction(state, rng);
    }
  }

  const victory = state.outcome === 'cleared';
  return {
    victory,
    survivors: state.disciples,
    leaks: state.leaks,
    bossGateHits,
    peakTier: state.peakTier,
    elapsedMs: state.elapsedMs,
    gold: Math.round(state.gold) + (victory ? clearReward(state) : defeatReward(state)),
  };
}

/** 有錢就買最便宜的那一項，模擬玩家不做長期規劃的花錢方式。 */
function spendGold(levels: Record<string, number>, gold: number): number {
  for (;;) {
    let cheapest: { id: string; cost: number } | null = null;
    for (const track of UPGRADES) {
      const cost = upgradeCost(trackById(track.id), levels[track.id] ?? 0);
      if (cost === null || cost > gold) continue;
      if (cheapest === null || cost < cheapest.cost) cheapest = { id: track.id, cost };
    }
    if (cheapest === null) return gold;
    gold -= cheapest.cost;
    levels[cheapest.id] = (levels[cheapest.id] ?? 0) + 1;
  }
}

interface Progress {
  totalRuns: number;
  maxAttempts: number;
  /** 卡關的關卡編號，全部通關則為 null。 */
  stuckAt: number | null;
  durations: number[];
  leaks: number[];
  /** 每一場通關時，首領砸了幾次門。 */
  bossGateHits: number[];
}

const RETRY_LIMIT = 12;
const STAGES = 81;

function playThrough(sectId: string, maxStage: number, talismans?: readonly string[]): Progress {
  const levels: Record<string, number> = {};
  const durations: number[] = [];
  const leaks: number[] = [];
  const bossGateHits: number[] = [];
  let gold = 0;
  let totalRuns = 0;
  let maxAttempts = 0;

  for (let stage = 1; stage <= maxStage; stage += 1) {
    let attempts = 0;
    for (;;) {
      const outcome = runOnce(stage, levels, sectId, stage * 7919 + attempts * 104729, talismans);
      totalRuns += 1;
      attempts += 1;
      gold = spendGold(levels, gold + outcome.gold);
      if (outcome.victory) {
        durations.push(outcome.elapsedMs);
        leaks.push(outcome.leaks);
        bossGateHits.push(outcome.bossGateHits);
        break;
      }
      if (attempts >= RETRY_LIMIT) {
        return { totalRuns, maxAttempts: attempts, stuckAt: stage, durations, leaks, bossGateHits };
      }
    }
    maxAttempts = Math.max(maxAttempts, attempts);
  }
  return { totalRuns, maxAttempts, stuckAt: null, durations, leaks, bossGateHits };
}

describe('數值平衡', () => {
  it('第 1 關在零升級下，四個門派的勝率都在六成以上', () => {
    const samples = 24;
    for (const sect of SECTS) {
      let wins = 0;
      for (let i = 0; i < samples; i += 1) {
        if (runOnce(1, {}, sect.id, 1000 + i * 7919).victory) wins += 1;
      }
      const rate = wins / samples;
      expect(rate, `${sect.name} 的第 1 關勝率只有 ${Math.round(rate * 100)}%`).toBeGreaterThan(0.6);
    }
  });

  it('照著「打完就把金幣花掉」玩，四個門派都能一路推到第 81 關', () => {
    for (const sect of SECTS) {
      const progress = playThrough(sect.id, STAGES);
      expect(progress.stuckAt, `${sect.name} 卡在第 ${progress.stuckAt} 關`).toBeNull();
      expect(
        progress.totalRuns,
        `${sect.name} 需要 ${progress.totalRuns} 場才推到 ${STAGES} 關`,
      ).toBeLessThanOrEqual(STAGES * 2);
      expect(progress.maxAttempts, `${sect.name} 有一關重打了 ${progress.maxAttempts} 次`).toBeLessThanOrEqual(6);
    }
  });

  it('守得住不代表守得輕鬆：即使是幾乎完美的打法，也會有關卡掉耐久', () => {
    // 門檻的歷史：0.15 → 0.05 → 0.02。
    //
    // 0.15 是在一個 bug 底下訂的（首領走到山門會直接消失卻照樣判定通關，
    // 那些「首領跑掉」被算成漏怪，把比例灌高了）。0.05 是修掉之後的真值。
    //
    // 0.02 是**開局就給 3×3 之後的真值**，而且這是一個明知的取捨：
    // 陣法擴充整條從洞府移出去、基礎格位從 6 拉到 9 之後，早期的主線確實變寬鬆了。
    // 試過首領血量、雜兵血量、每波隻數、漏怪代價四個旋鈕想把張力補回來，
    // 每一個能讓「零延遲的模擬 AI」開始掉耐久的設定，都會同時把最弱的那一副牌組
    // 擋在第 81 關外——**九格讓再差的配置也覆蓋得住全場，強弱的差距被拉近了**。
    // 首領血量已經從 3000 提到 5000 把關底的壓力補回來（下一條測試守著它），
    // 這一條就照實記錄變寬鬆的事實，而不是把數字硬湊回去。
    const { leaks } = playThrough('body', STAGES);
    const withLeaks = leaks.filter((count) => count > 0).length;
    expect(withLeaks / leaks.length, '連一關都不掉耐久，代表難度太低').toBeGreaterThan(0.02);
  });

  it('首領會撐到山門前才被斬掉——關底的緊張感是真的存在的', () => {
    // 首領走到山門不會消失，牠會停在門口一直砸。若這個數字是 0，
    // 代表首領永遠在半路就死了，那條「撐住別讓牠進門」的張力等於不存在。
    const { bossGateHits } = playThrough('body', STAGES);
    const reachedGate = bossGateHits.filter((count) => count > 0).length;
    expect(reachedGate, '首領從來沒摸到山門，關底完全沒有壓力').toBeGreaterThan(0);
  });

  it('每一種符籙配置都推得完 81 關——沒有一副牌是死路', () => {
    // 二十張裡帶四張，組合上千種，不可能全跑。這裡挑的是「各走極端」的幾副：
    // 純輸出、純控場、純關底、以及最極端的全輔助（幾乎不輸出）。
    // 全輔助那一副本來就該很難打，但**難不等於不可能**——若它推不完，
    // 就代表某幾張符是陷阱，玩家選了會卡死，那是設計缺陷而不是難度。
    const builds: Record<string, string[]> = {
      起手四符: ['sword', 'bolt', 'fan', 'flame'],
      控場流: ['frost', 'pyre', 'pierce', 'flame'],
      關底流: ['slayer', 'myriad', 'grand', 'seal'],
      斬殺流: ['tempest', 'abyss', 'soul', 'breaker'],
      全輔助: ['spirit', 'gale', 'bastion', 'fortune'],
    };
    for (const [name, pool] of Object.entries(builds)) {
      const progress = playThrough('body', STAGES, pool);
      expect(progress.stuckAt, `${name} 卡在第 ${progress.stuckAt} 關`).toBeNull();
    }
  });

  it('模擬的 AI 完全看不懂特效，卻仍推得完——真人只會更輕鬆', () => {
    // AI 挑牌只看 cardDps，而 cardDps 刻意不含特效（見 deck.ts）。
    // 也就是說它會把引靈符當成廢牌、不知道要把寒冰符留著。
    // 這條在意的不是分數，是「這份模擬對真人是保守的」這個前提還成立。
    const supportOnly = playThrough('body', STAGES, ['spirit', 'gale', 'bastion', 'fortune']);
    const starters = playThrough('body', STAGES, ['sword', 'bolt', 'fan', 'flame']);
    expect(supportOnly.stuckAt).toBeNull();
    // 幾乎不輸出的那一副理應打得比較辛苦，否則特效就等於白給。
    expect(supportOnly.totalRuns).toBeGreaterThan(starters.totalRuns);
  });

  it('飛升境（第 82 關之後）在真人操作速度下仍然守得住', () => {
    // PROGRESS L-18：製作人在第 97 關回報「出怪太快，符陣來不及排好就被淹沒」。
    // 第 115 關那一項守的是 L-19（飛升境的長期指數失衡）：
    // 舊規則下真人速度在第 110 關附近就再也過不去，那不是難度，是曲線斷掉。
    // 上面所有測試都跑 250ms 決策——那等於一場做將近兩百次零延遲的拖曳，
    // 於是「來不來得及操作」這一整類問題在模擬裡完全隱形，而且 STAGES 只到 81，
    // 無限模式從來沒被跑過。這條測試補的正是這兩個洞。
    const maxed: Record<string, number> = {};
    for (const track of UPGRADES) maxed[track.id] = track.maxLevel;

    for (const stage of [90, 97, 115]) {
      let wins = 0;
      const samples = 8;
      for (let i = 0; i < samples; i += 1) {
        const outcome = runOnce(
          stage, maxed, 'body', stage * 7919 + i * 104729, undefined, HUMAN_DECISION_MS, true,
        );
        if (outcome.victory) wins += 1;
      }
      expect(
        wins / samples,
        `第 ${stage} 關，肯花時間排陣的玩家只有 ${Math.round((wins / samples) * 100)}% 勝率`,
      ).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('不花金幣升級的話會在中後期卡死，升級才有意義', () => {
    const seeds = [0, 1, 2, 3, 4];
    let wall: number | null = null;
    for (let stage = 1; stage <= STAGES; stage += 1) {
      const anyWin = seeds.some((seed) => runOnce(stage, {}, 'body', stage * 7919 + seed * 104729).victory);
      if (!anyWin) {
        wall = stage;
        break;
      }
    }
    expect(wall, '零升級也能一路推到 81 關，升級系統形同虛設').not.toBeNull();
    expect(wall ?? Infinity, '零升級連第 1 關都過不了').toBeGreaterThanOrEqual(2);
    expect(wall ?? Infinity, '零升級撐太久，升級系統前期沒有存在感').toBeLessThanOrEqual(40);
  });

  it('五條戰鬥升級線在「快打不過的那一關」都能明顯提高勝率（不得有形同虛設的線）', () => {
    // 這是 PROGRESS L-05 的教訓：升級線看起來有數字，不代表它真的改變得了任何一關。
    // 量測的是玩家真正在乎的事——買了這條線，這一關贏得了嗎。
    const winRate = (levels: Record<string, number>, stage: number): number => {
      const samples = 16;
      let wins = 0;
      for (let i = 0; i < samples; i += 1) {
        if (runOnce(stage, levels, 'body', stage * 7919 + i * 104729).victory) wins += 1;
      }
      return wins / samples;
    };

    // 找一關「零升級大多會輸」的關卡當作量測點。
    let probe = 2;
    for (let stage = 2; stage <= STAGES; stage += 1) {
      if (winRate({}, stage) <= 0.25) {
        probe = stage;
        break;
      }
    }
    const base = winRate({}, probe);

    for (const track of UPGRADES) {
      // 聚寶之術只影響金幣，照定義不會改變單場勝負，另外驗。
      if (track.id === 'goldGain') continue;
      const improved = winRate({ [track.id]: Math.min(track.maxLevel, 12) }, probe);
      expect(
        improved,
        `第 ${probe} 關的勝率在買滿 ${track.name} 之後仍是 ${Math.round(improved * 100)}%（原本 ${Math.round(base * 100)}%），這條線是死的`,
      ).toBeGreaterThan(base);
    }
  });

  it('聚寶之術確實提高單場收入（它改變的是升級速度，不是單場勝負）', () => {
    const plain = runOnce(5, {}, 'body', 4242).gold;
    const rich = runOnce(5, { goldGain: 10 }, 'body', 4242).gold;
    expect(rich).toBeGreaterThan(plain);
  });
});

/**
 * 副本的難度標準。
 *
 * 這一組存在的理由是**藏經閣現在是必經內容**：十六張非基礎符只有它產出，
 * 所以它的每一層都必須是「爬到那一層的人都過得了」，不能用
 * 「想找罪受的人才會來」的標準去調。另外四個副本是自願的，可以硬，
 * 但硬到打不過就等於不存在。
 *
 * 量測的玩家是**剛好達到開放門檻的那一個**——那是會來打這一層的人裡最弱的一種。
 * 升級等級不是猜的，是走一遍主線、每關打完就把金幣花掉之後真正會有的數字。
 *
 * 這一組擋下的是一個真實發生過的設計失誤：「不合之道」（拿掉合成）對
 * **同深度**的玩家在任何關卡都是 0%，因為合成正是這個遊戲唯一的指數成長。
 * 它唯一能存在的方式是把關卡開得比玩家的進度淺得多——難的是打法不是深度。
 * 若哪天有人把 minStage 和 stage 合成一個數字，這一組就會紅。
 */
describe('副本難度', () => {
  function progressionSnapshots(): Map<number, Record<string, number>> {
    const levels: Record<string, number> = {};
    let gold = 0;
    const snaps = new Map<number, Record<string, number>>();
    for (let stage = 1; stage <= 81; stage += 1) {
      snaps.set(stage, { ...levels });
      const result = runOnce(stage, levels, 'sword', 4000 + stage, undefined, 1000, true);
      gold = spendGold(levels, gold + result.gold);
    }
    return snaps;
  }

  function clearRate(
    dungeon: (typeof DUNGEONS)[number],
    index: number,
    upgrades: Record<string, number>,
    stage: number,
  ): number {
    const loadout = buildLoadoutFromSpec({
      sectId: 'sword',
      stage,
      // 藏經閣是符籙的來源，所以打第 N 層的人手上只有 N-1 張。
      libraryFloor: dungeon.id === 'library' ? index : 16,
      talismans: ['swordArray', 'flame', 'thunder', 'gale'],
      upgrades,
      karma: {},
      sectClears: 0,
      rules: [...dungeon.rules],
      goldMultiplier: dungeon.goldMultiplier,
      extraFieldSlots: 0,
      bankedStage: 0,
    });
    let wins = 0;
    const runs = 12;
    for (let i = 0; i < runs; i += 1) {
      const rng = createRng(900 + i);
      const state = createDefenseState(loadout, rng);
      let since = 0;
      const hardLimit =
        BALANCE.wave.wavesPerStage * BALANCE.wave.waveIntervalMs + BALANCE.boss.timeLimitMs + 30000;
      while (state.outcome === 'running' && state.elapsedMs < hardLimit) {
        tickCombat(state, TICK_MS, rng);
        since += TICK_MS;
        while (since >= 1000) {
          since -= 1000;
          playOneArrangingAction(state, rng);
        }
      }
      if (state.outcome === 'cleared') wins += 1;
    }
    return wins / runs;
  }

  it('剛達到門檻的玩家，每一層都打得過——必經的藏經閣還要穩過', () => {
    const snaps = progressionSnapshots();
    for (const dungeon of DUNGEONS) {
      dungeon.floors.forEach((floor, index) => {
        const gate = floor.minStage ?? dungeon.minStage;
        const stage = floor.stage ?? Math.round(gate * (floor.stageRatio ?? 1));
        const upgrades = snaps.get(Math.min(81, Math.max(1, gate))) ?? {};
        const rate = clearRate(dungeon, index, upgrades, stage);
        // 藏經閣拿不到就等於少一張符，它的門檻要高得多。
        const floorLabel = `${dungeon.name} 第 ${index + 1} 層（門檻 ${gate}、第 ${stage} 關）`;
        expect(rate, floorLabel).toBeGreaterThanOrEqual(dungeon.id === 'library' ? 0.7 : 0.4);
      });
    }
  });

  it('開放門檻永遠比那一層的關卡深——副本難的是規則，不是深度', () => {
    for (const dungeon of DUNGEONS) {
      dungeon.floors.forEach((floor, index) => {
        const gate = floor.minStage ?? dungeon.minStage;
        const stage = floor.stage ?? Math.round(gate * (floor.stageRatio ?? 1));
        // 唯一的例外是藏經閣最前面幾層：那時玩家還沒有進度可言。
        if (dungeon.id === 'library' && index < 3) return;
        expect(stage, `${dungeon.name} 第 ${index + 1} 層`).toBeLessThanOrEqual(gate);
      });
    }
  });
});
