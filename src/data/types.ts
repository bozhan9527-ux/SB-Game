/**
 * data/*.json 的型別對應（TECH_SPEC 第 3 節）。
 *
 * 每個 JSON 檔對應這裡的一個 interface，載入時以 src/data/validate.ts 做 runtime 驗證，
 * 格式錯誤必須在載入階段就報錯。
 */

/** 場上與手牌的容量、法寶階數與抽符節奏。 */
export interface FieldBalance {
  /** 場上可同時放幾張法寶符。 */
  fieldSlots: number;
  /** 手牌格數。手牌滿了就抽不進來，逼玩家一直做「放場上還是合成」的決定。 */
  handSlots: number;
  startingHand: number;
  startingField: number;
  /** 每升一階的傷害倍率。 */
  tierGrowth: number;
  /** 第 1 關的法寶階數上限。 */
  maxTierBase: number;
  /**
   * 每幾關把階數上限 +1——長期成長的指數來源就是這一條。
   *
   * 週期短是刻意的：上限每往上跳一階，玩家的輸出天花板就乘上 tierGrowth，
   * 而難度是連續成長的。週期太長會變成「同一境界內越打越吃力、一突破就輾壓」的鋸齒，
   * 落差大到前一關打不動、後一關無聊。
   */
  stagesPerTier: number;
  /** 抽到的符比當前上限低幾階。 */
  drawTierBelowMax: number;
  /** 抽到高一階的機率。 */
  drawTierBonusChance: number;
  drawIntervalMs: number;
}

/**
 * 陣法：場上格位排成一線時的加成。
 *
 * 這是格子唯一的意義。沒有它的話，六個陣位彼此完全可以互換，
 * 那個 3×N 的格子就只是個擺放位置而已，玩家沒有理由在意誰放哪裡。
 *
 * 加成刻意小於一階的成長（tierGrowth 1.35）——陣法是「排得好有賞」，
 * 不能大到讓「為了排陣而不敢合成」變成最佳解。
 */
export interface FormationBalance {
  /** 場上格位分幾欄。列數由格位總數推得。 */
  columns: number;
  /** 一整橫列同種符：該列的傷害加成。 */
  rowDamage: number;
  /** 一整直行同種符：該行的出手速度加成。 */
  columnFireRate: number;
  /** 對角線同種符（需要 3×3，也就是陣法擴充買滿）：傷害加成。 */
  diagonalDamage: number;
}

/** 一波妖魔的組成與推進速度。 */
export interface WaveBalance {
  wavesPerStage: number;
  /** 下一波開始的間隔。 */
  waveIntervalMs: number;
  /**
   * 同一波的妖魔攤在這一波多長的比例上出場。
   *
   * 全部擠在開頭出場的話，畫面會變成「兩秒的混戰、七秒的空場」，
   * 看起來不像被圍攻，只像在等下一批。攤開來才會是連續的推進壓力。
   */
  waveSpread: number;
  /** 出場間隔的下限，妖魔再多也不會疊在同一個點上。 */
  minSpawnGapMs: number;
  countBase: number;
  countPerWave: number;
  countPerRealm: number;
  countMax: number;
  hpBase: number;
  /** 每關的血量成長倍率。 */
  hpGrowth: number;
  /** 同一關內每波再加幾成血。 */
  hpPerWave: number;
  speedBase: number;
  speedPerStage: number;
  speedMax: number;
  /** 妖魔從出場到山門的距離，單位 px。 */
  trackPx: number;
  /** 第 1 關時，一隻妖魔攻進山門要損失幾名弟子。 */
  leakCostBase: number;
  /**
   * 漏怪代價每關的成長倍率。
   *
   * 若代價固定，「聚眾成軍」會一路把耐久堆到吃不完，整個系統退化成「買耐久就贏」——
   * 代價跟著關卡長，這條線才只是「多一點容錯」而不是免死金牌。
   */
  leakCostGrowth: number;
}

/** 山門的耐久（弟子數）。 */
export interface PowerBalance {
  baseDisciples: number;
  maxDisciples: number;
}

/** 關底首領。 */
export interface BossBalance {
  hpBase: number;
  hpGrowth: number;
  /** 首領推進得慢，但走到山門之後不會離開。 */
  speed: number;
  /**
   * 首領撞門一次的代價，是一般妖魔漏怪的幾倍。
   *
   * 首領走到山門不是「漏掉一隻」就結束——牠會停在那裡持續砸門，
   * 直到被打死或山門破。這是「沒打死首領就不算通關」的結構性保證：
   * 首領永遠不會自己離開場上，關卡也就不可能在牠還活著時判定通關。
   */
  gateHitMultiplier: number;
  gateHitIntervalMs: number;
  timeLimitMs: number;
  /** 斬殺首領額外給幾倍的擊殺金幣。 */
  goldBonus: number;
}

/**
 * 金幣產出。
 *
 * 獎勵採等比成長而非線性：升級花費是指數曲線，收入若是線性，
 * 深層等級永遠買不起，中後期的升級系統就等於停擺。
 */
export interface GoldBalance {
  clearBase: number;
  clearGrowth: number;
  killBase: number;
  killGrowth: number;
  /** 失敗時保留的比例。 */
  defeatRatio: number;
}

export interface Balance {
  field: FieldBalance;
  formation: FormationBalance;
  wave: WaveBalance;
  power: PowerBalance;
  boss: BossBalance;
  gold: GoldBalance;
}

/** 背景地貌。十個境界不只換色，連遠景的形狀都不同。 */
export type Scenery = 'peaks' | 'forest' | 'sea' | 'volcano' | 'voidrock' | 'storm' | 'palace' | 'celestial';

/** 境界。關卡編號落在 [stageFrom, stageTo] 之間即為該境界。 */
export interface Realm {
  id: string;
  name: string;
  subtitle: string;
  stageFrom: number;
  stageTo: number;
  /** 十六進位色碼字串，如 "#7fdba0"。 */
  color: string;
  /** 境界壓制：對隊伍戰力的加成比例。 */
  powerBonus: number;
  /** 遠景地貌。 */
  scenery: Scenery;
}

/** 門派造型，對應 public/art/disciple-*.svg。 */
export type SectArt = 'body' | 'sword' | 'talisman' | 'alchemy';

/** 門派。開局選擇，決定起始耐久與一條會改變打法的被動。 */
export interface Sect {
  id: string;
  /** 門人的造型。 */
  art: SectArt;
  name: string;
  /** 體修 / 劍修 / 符修 / 丹修。 */
  path: string;
  motto: string;
  desc: string;
  color: string;
  /** 山門弟子（耐久）倍率。 */
  discipleMultiplier: number;
  /** 所有法寶的傷害倍率。 */
  damageMultiplier: number;
  goldMultiplier: number;
  drawSpeedMultiplier: number;
  bossDamageMultiplier: number;

  // 以下是「會改變玩法決策」的被動，不只是數值差異。
  /** 被動的一句話說明。 */
  passive: string;
  /** 專精的符種：這一種符的傷害額外乘上 favoredDamageMultiplier。 */
  favoredCard: string;
  favoredDamageMultiplier: number;
  /** 每關前幾次漏怪完全免傷（體修）。 */
  leakImmunityCount: number;
  /** 合成時保留其中一張的機率（符修）。 */
  mergeRefundChance: number;
}

/** 法寶符的種類。實際出現的階數由 src/systems/deck.ts 依境界決定。 */
export interface CardDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  art: string;
  /** 一階時每一道的傷害。 */
  damage: number;
  /** 出手間隔，單位 ms。 */
  intervalMs: number;
  /** 一次同時打幾個目標。 */
  targets: number;
  /** 抽符時的權重。 */
  weight: number;
}

/** 六條金幣升級線。 */
export interface UpgradeTrack {
  id: string;
  name: string;
  desc: string;
  unit: string;
  /** 每級提供的數值。 */
  perLevel: number;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
}

/**
 * 敵陣造型，對應 public/art/enemy-*.svg。
 * 前六種是妖獸，各自畫成名字裡的那種生物；後四種是人形。
 */
export type MobArt =
  | 'wolf'
  | 'bear'
  | 'yeti'
  | 'centipede'
  | 'scorpion'
  | 'serpent'
  | 'bandit'
  | 'undead'
  | 'demon'
  | 'celestial';

export interface MobDef {
  id: string;
  realm: string;
  name: string;
  art: MobArt;
}

/** 首領的造型，對應 public/art/boss-*.svg。 */
export type BossArt = 'beast' | 'demon' | 'storm' | 'celestial';

export interface BossDef {
  id: string;
  realm: string;
  name: string;
  taunt: string;
  art: BossArt;
}

/** 成就的達成條件種類。 */
export type AchievementKind =
  | 'stage'
  | 'maxTier'
  | 'kills'
  | 'perfect'
  | 'clears'
  | 'gold'
  | 'sects';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  kind: AchievementKind;
  /** 門檻，一律為下限。 */
  value: number;
  /** 達成時發放的金幣。 */
  reward: number;
}

export interface EnemyBook {
  mobs: MobDef[];
  bosses: BossDef[];
}
