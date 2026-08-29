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
  /**
   * 飛升境（最後一個境界，第 82 關起）改用的節奏，比 stagesPerTier 快。
   *
   * 為什麼要分開一條：長期難度是兩條指數在賽跑——
   * 玩家的傷害上限每 stagesPerTier 關 ×tierGrowth，妖魔血量每關 ×hpGrowth。
   * 用 3 關 +1 階時，一段的淨變化是 1.35 ÷ 1.148³ = **×0.892**，
   * 也就是每三關玩家的相對戰力掉 10.8%，複利下去必然撞牆（實測在第 130 關附近）。
   * 那不是哪個數字填錯，是兩條指數的斜率本來就不同，要走到一百多關才顯形。
   *
   * 平衡點是 ln(1.35)/ln(1.148) ≈ 每 2.174 關 +1 階。取 2.2 讓淨變化落在 ×0.9965——
   * 推 30 關相對戰力 ×0.95，是很緩的坡而不是牆：無限模式該慢慢變難，
   * 但不該在固定的關卡數之後硬性終結。
   *
   * 只在第 82 關之後生效，而且保證不低於原本的節奏（見 maxTierForStage），
   * 因此第 1–81 關那條已經校準過的曲線一格都不會動。
   */
  ascendStagesPerTier: number;
  /** 抽到的符比當前上限低幾階。 */
  drawTierBelowMax: number;
  /** 抽到高一階的機率。 */
  drawTierBonusChance: number;
  drawIntervalMs: number;
  /**
   * 山河符回耐久的機率上限（整場加總後）。
   *
   * 沒有上限的話，鋪滿回耐久的符會變成「怎麼漏都不會死」，
   * 整個漏怪代價系統直接失效——那是一條規則，不是一個數值。
   */
  maxRepairChance: number;
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
/** 一種陣式在三個方向上的加成。 */
export interface FormationTierBalance {
  /** 一整橫列成陣：該列的傷害加成。 */
  rowDamage: number;
  /** 一整直行成陣：該行的出手速度加成。 */
  columnFireRate: number;
  /** 對角線成陣（需要 3×3，也就是陣法擴充買滿）：傷害加成。 */
  diagonalDamage: number;
}

export interface FormationBalance {
  /** 場上格位分幾欄。列數由格位總數推得。 */
  columns: number;
  /**
   * 同心陣：一整條線都是同一種符。
   *
   * 好排、而且同種本來就好合成，所以給得少——這是「順手就有」的那一條路。
   */
  same: FormationTierBalance;
  /**
   * 五行陣：一整條線每一張都不同種。
   *
   * 難排，而且和合成互相牽制（合成要湊同種），所以給得多。
   */
  distinct: FormationTierBalance;
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
  /**
   * 同一波裡兩隻妖魔出場的最短間隔。
   *
   * 原本只是「別疊在同一個點上」的防呆值（260ms），現在是一條**節奏下限**。
   * 一波的隻數隨關卡成長，而出場間隔＝波長÷隻數，所以它會一路被壓縮到半秒一隻——
   * 玩家連把符拖到定位的時間都沒有，陣法等於在後期自動關閉。
   *
   * 注意它的作用機制：**不是讓同時出現的妖魔變少**（隻數一隻都沒少），
   * 而是把一波攤得比波長還開，於是波次開始互相重疊，
   * 每一隻妖魔分到的處理時間變長。實測第 97 關平均 576ms → 639ms，
   * 而「肯花時間排陣」的玩家勝率 50% → 88%。
   * 代價是波與波的界線在後期會糊掉——那是換來操作空間的自覺取捨。
   */
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
  /**
   * 妖魔速度的上限，也就是**玩家反應窗口的下限**。
   *
   * 妖魔走完全程的時間 = trackPx ÷ speed，這就是玩家從「看到它出場」到
   * 「它砸到山門」之間能做事的全部時間。速度若無上限地隨關卡長，
   * 這個窗口會單調縮短，但排一次陣需要的拖曳次數不變——
   * 於是後期「肯花時間排陣」變成純懲罰，這是實際回報過的 bug（見 PROGRESS 的 L-18）。
   *
   * 難度該由血量（hpGrowth 1.148，真正的指數）承擔，不該由手速承擔。
   */
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

/**
 * 門派的長期承諾。
 *
 * 門派原本是「隨時可改的修飾選單」：換派完全免費、沒有任何門派專屬的長期進度，
 * 於是它不是身分，只是一個下拉選單。這一塊給它重量——
 * 修為只在該門派身上累積，換派要付錢，而且離開時把已經累積的加成留在原地。
 */
export interface SectBalance {
  /** 每通關幾次升一階修為。 */
  clearsPerMastery: number;
  maxMasteryTier: number;
  /** 每一階修為給該門派多少法寶傷害（加算後乘進 damageMultiplier）。 */
  masteryDamagePerTier: number;
  /** 換派費用 = 現任門派已累積的通關次數 × 這個數。沒有累積就不用錢。 */
  switchCostPerClear: number;
}

/**
 * 妖魔習性的數值。
 *
 * 護甲用的是「該隻自身血量的百分比」而不是固定值：血量是指數成長的，
 * 固定值在第 5 關能擋死人、到第 50 關等於不存在。同時再夾一個上限比例，
 * 保證任何一發都至少打得進去一部分——完全免疫會讓某些牌組直接卡死一整關，
 * 而習性要造成的是「這套牌組比較吃力」，不是「這套牌組打不動」。
 */
export interface TraitBalance {
  /** 每次命中扣掉的傷害，佔該隻最大血量的比例。 */
  armorPercentOfMaxHp: number;
  /** 但最多只能削掉這一發傷害的這個比例。 */
  armorMaxCut: number;
  /**
   * 帶習性的妖魔血量要打折。
   *
   * **這幾個係數是整個習性系統成不成立的關鍵。** 習性若只是「多一層防禦」，
   * 那就不是行為而是難度——實測全輔助那一副在第 78 關直接卡死，
   * 因為護甲對它等於一律扣掉三成五的輸出。血量打折之後，
   * 護甲改變的是「誰打它比較有效率」而不是「大家都打不動」：
   * 總工作量相當，分佈換了一個形狀。疾行與分裂同理。
   */
  armorHpRatio: number;
  swiftMultiplier: number;
  swiftHpRatio: number;
  /** 會分裂的母體血量打折，因為牠死後還會留下兩隻。 */
  splitParentHpRatio: number;
  splitCount: number;
  /** 分裂出來的小妖血量，佔母體最大血量的比例。 */
  splitHpRatio: number;
  splitSpeedMultiplier: number;
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
  trait: TraitBalance;
  sect: SectBalance;
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

/**
 * 符籙特效。
 *
 * 二十張符全部共用這一組欄位，每一張只用到一兩項，其餘留在預設值（等於沒有）。
 * 用「一組固定欄位 + 預設值」而不是「每張符一段自訂邏輯」的理由：
 * 特效要能在 tickCombat 裡一次結算完，而且平衡模擬跑的必須是同一份實作。
 * 若每張符各寫各的，模擬就得複製一份規則，兩邊立刻走散（見 PROGRESS 的 L-04）。
 *
 * 分成兩類：**逐發結算**的在開火迴圈裡生效，**在場被動**只要符還在陣位上就持續生效。
 */
export interface CardEffect {
  // ── 逐發結算 ────────────────────────────────────────────────
  /** 命中時把目標的速度降低這個比例。 */
  slowPercent: number;
  /** 減速持續多久（ms）。同一隻身上取較強的一次，不疊加。 */
  slowMs: number;
  /** 命中時附加灼燒，總量為該次傷害的這個比例。 */
  burnPercent: number;
  /** 灼燒攤在多久內燒完（ms）。 */
  burnMs: number;
  /** 目標血量低於這個比例時直接斬殺。首領免疫——否則關底變成一發定生死。 */
  executeBelow: number;
  /** 打死目標後把溢出的傷害轉給下一隻，而不是浪費掉。 */
  carryOverkill: boolean;
  /** 暴擊機率與倍率。 */
  critChance: number;
  critMultiplier: number;
  /** 對首領的額外傷害倍率。 */
  bossMultiplier: number;
  /** 對血量已低於一半的目標的額外倍率。 */
  woundedMultiplier: number;
  /** 對血量仍在八成以上的目標的額外倍率。 */
  freshMultiplier: number;
  /** 連續出手時每一發累加的傷害比例；場上沒有敵人時歸零。 */
  rampPerShot: number;
  /** 累加的上限倍率。 */
  rampMax: number;

  // ── 在場被動 ────────────────────────────────────────────────
  /** 上下左右相鄰陣位的傷害加成。 */
  auraDamage: number;
  /** 上下左右相鄰陣位的出手速度加成。 */
  auraFireRate: number;
  /** 在場上時的全場金幣加成。 */
  goldBonus: number;
  /** 在場上時的全場抽符加速。 */
  drawSpeedBonus: number;
  /** 每次斬殺回復一名弟子的機率。 */
  repairChance: number;
  /** 這張符自己吃到的陣法加成放大幾倍。 */
  formationMultiplier: number;
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
  /** 抽符時的權重。只在同一副符籙配置（四張）之內比較。 */
  weight: number;
  /** 歷史最高關卡到達這一關才解鎖。前四張是 1，開局就有。 */
  unlockStage: number;
  effect: CardEffect;
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

/**
 * 妖魔的習性。
 *
 * 原本全部的妖魔只有一種行為：直線往下走、有血量。這是符籙選擇空間窄的根源——
 * 面對只會走路的目標，二十張符全部塌成同一個問題「每秒打多少」，
 * 於是永遠有一個最優解，其餘十六張是裝飾。
 *
 * 三種習性刻意互為剋制，各自對上一種符的原型：
 * - 護甲：每一下都被削掉一截，**多發小傷害**吃虧（風刃、萬劍），大單發划算（天雷、驚雷）。
 * - 疾行：走得快，拖延型的價值被壓縮，**減速**（寒冰、鎮魔）與秒殺（玄冥）翻身。
 * - 分裂：死掉會裂成兩隻，**單體高傷**吃虧，範圍與灼燒（風刃、焚天、萬劍）翻身。
 *
 * 護甲與分裂互為反面：同一套牌組不可能同時最擅長兩者，這才逼出「帶哪四張」的取捨。
 */
export type MobTrait = 'none' | 'armor' | 'swift' | 'split';

export interface MobDef {
  id: string;
  realm: string;
  name: string;
  art: MobArt;
  trait: MobTrait;
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

/**
 * 分關卡教學：一次一條規則，在它第一次派上用場的那一關講。
 *
 * 為什麼不寫在說明頁裡：說明頁是「寫給已經懂的人查的」，
 * 一次攤開八個章節，新手一條都讀不進去（製作人的原話：「文字那麼多沒有人會看」）。
 * 拆成十條、綁在關卡上，每條只有一個標題兩行字，在那條規則開始有意義的當下出現。
 */
export interface LessonDef {
  id: string;
  /** 推到這一關（含）之後才會出現。 */
  stage: number;
  title: string;
  /** 最多兩行。超過兩行就回到「沒有人會看」的老路。 */
  body: string;
  /**
   * 這一課取代哪一則觸發式提示（`src/systems/tutorial.ts` 的 HINT_*）；沒有就是空字串。
   *
   * 兩套機制講同一條規則時要互相認得：觸發式的在「事情發生的當下」講，時機更好但不保證會發生；
   * 課程綁在關卡上，保證會講到。哪一邊先講到，另一邊就不再重複。
   */
  hint: string;
}

/** 成就的達成條件種類。 */
export type AchievementKind =
  | 'stage'
  | 'maxTier'
  | 'kills'
  | 'perfect'
  | 'clears'
  | 'gold'
  | 'sects'
  | 'sectMastery';

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
