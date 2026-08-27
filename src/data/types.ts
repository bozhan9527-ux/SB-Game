/**
 * data/*.json 的型別對應（TECH_SPEC 第 3 節）。
 *
 * 每個 JSON 檔對應這裡的一個 interface，載入時以 src/data/validate.ts 做 runtime 驗證，
 * 格式錯誤必須在載入階段就報錯。
 */

/** 觸控跟隨的手感參數（TECH_SPEC 第 4.5 節）。 */
export interface InputBalance {
  /** 隊伍逼近手指的速度，越大越跟手、越小越滑順。單位為每秒的逼近率。 */
  followSpeed: number;
  /** 隊伍中心與路面邊緣的最小距離，避免整團跑出賽道。 */
  trackMarginPx: number;
  /** 首領戰中，每移動一像素累積的氣勢。 */
  momentumPerPixel: number;
}

/** 關卡推進（閘門捲動）相關常數。 */
export interface RunBalance {
  gateSpeedBase: number;
  gateSpeedPerStage: number;
  gateSpeedMax: number;
  /** 兩個遭遇之間的距離，單位 px。 */
  encounterSpacingPx: number;
  /** 閘門加算值每關的成長倍率，讓後段關卡的閘門數字跟著變大。 */
  gateValueGrowth: number;
  gatesPerStageBase: number;
  gatesPerStagePerRealm: number;
  gatesPerStageMax: number;
  /** 每幾道閘門插入一次敵陣。 */
  mobWaveEvery: number;
  /** 閘門為金幣閘門的機率。 */
  goldGateChance: number;
  /** 閘門對其中一側出現陷阱的機率。 */
  trapChance: number;
}

/** 隊伍戰力公式的係數。 */
export interface PowerBalance {
  baseDisciples: number;
  baseAttack: number;
  baseDefense: number;
  baseArms: number;
  maxDisciples: number;
  /** 防禦計入減傷的權重。 */
  defenseMitigation: number;
  /** 武裝值計入減傷的權重。 */
  armsMitigation: number;
  /** 減傷分母的下限，避免除以 0。 */
  mitigationFloor: number;
  /** 單次受擊至少損失的人數。 */
  minLossPerHit: number;
}

/**
 * 敵陣（小怪）數值。
 *
 * 敵陣造成的是「比例傷亡」而非固定人數：小隊不會被一波打光，大隊也不會無傷輾過，
 * 而武裝值是主要的減傷來源，讓武裝閘門與人數閘門形成真正的取捨。
 */
export interface MobBalance {
  /** 威脅值基準。 */
  powerBase: number;
  powerExponent: number;
  /** 戰力隨機浮動幅度（±）。 */
  powerJitter: number;
}

/** 首領戰數值。 */
export interface BossBalance {
  hpBase: number;
  /** 每關的血量成長倍率。 */
  hpGrowth: number;
  /** 首領的威脅值，與隊伍的抵禦能力相比後換算成每次攻擊的傷亡比例。 */
  attackBase: number;
  attackGrowth: number;
  attackIntervalMs: number;
  timeLimitMs: number;
  /** 隊伍戰力換算為每秒傷害的係數。 */
  dpsFactor: number;
  tickMs: number;
  /** 氣勢（傷害加成）的上限。 */
  momentumMax: number;
  momentumDecayPerSec: number;
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
  gateGoldBase: number;
  gateGoldGrowth: number;
  /** 失敗時保留的比例。 */
  defeatRatio: number;
}

export interface Balance {
  input: InputBalance;
  run: RunBalance;
  power: PowerBalance;
  mob: MobBalance;
  boss: BossBalance;
  gold: GoldBalance;
}

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
}

/** 門派造型，對應 public/art/disciple-*.svg。 */
export type SectArt = 'body' | 'sword' | 'talisman' | 'alchemy';

/** 門派。開局選擇，影響起始屬性與若干乘區。 */
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
  discipleBonus: number;
  attackBonus: number;
  defenseBonus: number;
  /** 武裝值閘門的效果倍率。 */
  armsMultiplier: number;
  bossDamageMultiplier: number;
  goldMultiplier: number;
  /** 敵陣傷亡倍率，越低越耐打。 */
  mobLossMultiplier: number;
}

export type GateTarget = 'disciples' | 'arms' | 'gold';
export type GateOp = 'add' | 'mul';

/** 閘門模板。實際出現的閘門由 src/systems/run.ts 依境界抽樣組成。 */
export interface GateTemplate {
  id: string;
  target: GateTarget;
  op: GateOp;
  /** target 為 gold 時代表「幾份基礎金幣」，其餘為第 1 關的基準值。 */
  value: number;
  weight: number;
  trap: boolean;
}

/** 五條金幣升級線。 */
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

export interface EnemyBook {
  mobs: MobDef[];
  bosses: BossDef[];
}
