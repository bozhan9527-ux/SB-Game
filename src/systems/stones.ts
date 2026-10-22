/**
 * 靈石：第二種貨幣，只買外觀（時裝），不影響任何數值與排行榜。
 *
 * 免費的靈石全部是「做到某件事」才給——破境、斬首領、飛升、每日挑戰、天劫塔、成就——
 * 而且一次性的只在歷代第一次給，輪迴重打不會再拿一次。數量都在 data/shop.json。
 *
 * 付費的靈石由 128 平台付款：平台回報成功才入帳，同時記一筆流水（見 StoneState.ledger）。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import { SHOP } from '../data';
import type { ShopCostume, ShopPack, ShopPaper, ShopWeapon } from '../data';
import type { SaveData } from '../save/types';
import { realmForStage } from './realms';

export interface StoneGain {
  label: string;
  amount: number;
}

/** 一次性的：claimed 裡沒有這個 key 才給。回傳這次入帳的那一筆，已經領過回 null。 */
function once(save: SaveData, key: string, amount: number, label: string): StoneGain | null {
  const stones = save.player.stones;
  if (amount <= 0 || stones.claimed.includes(key)) return null;
  stones.claimed.push(key);
  stones.balance += amount;
  return { label, amount };
}

export interface RunStoneContext {
  victory: boolean;
  stage: number;
  /** 主線、不是重播。副本裡的首領也算「斬過」，但破境只看主線。 */
  mainline: boolean;
  brokeThrough: boolean;
  bossId: string | null;
  bossName: string;
  bossKilled: boolean;
  replay: boolean;
}

/** 一場打完之後的靈石：破境（第一次、每境第一次）與首領第一次擊敗。 */
export function grantAfterRun(save: SaveData, ctx: RunStoneContext): StoneGain[] {
  if (ctx.replay) return [];
  const gains: (StoneGain | null)[] = [];
  const g = SHOP.grants;
  if (ctx.victory && ctx.mainline && ctx.brokeThrough) {
    const realm = realmForStage(ctx.stage);
    gains.push(once(save, 'break:first', g.firstBreak, '第一次破境'));
    gains.push(once(save, `realm:${realm.id}`, g.realm, `初破${realm.name}`));
  }
  if (ctx.bossKilled && ctx.bossId !== null) gains.push(once(save, `boss:${ctx.bossId}`, g.boss, `初斬${ctx.bossName}`));
  return gains.filter((x): x is StoneGain => x !== null);
}

/** 飛升：第一次給得多，之後每一次都有。 */
export function grantAscension(save: SaveData): StoneGain {
  const first = once(save, 'ascend:first', SHOP.grants.firstAscend, '第一次飛升');
  if (first !== null) return first;
  save.player.stones.balance += SHOP.grants.ascend;
  return { label: '飛升', amount: SHOP.grants.ascend };
}

/**
 * 每日挑戰：今天第一次撐過門檻波數給一份；月卡期間，今天第一次打完（不論幾波）再給月卡那一份。
 * 兩份都要「打」才有——月卡也一樣，不打不領。
 */
export function grantDaily(save: SaveData, day: number, waves: number): StoneGain[] {
  const stones = save.player.stones;
  const gains: StoneGain[] = [];
  if (waves >= SHOP.grants.dailyWaves && stones.dailyDay !== day) {
    stones.dailyDay = day;
    stones.balance += SHOP.grants.daily;
    gains.push({ label: `每日挑戰 ${SHOP.grants.dailyWaves} 波`, amount: SHOP.grants.daily });
  }
  if (cardActive(save, day) && stones.cardDay !== day) {
    stones.cardDay = day;
    stones.balance += SHOP.monthCard.daily;
    gains.push({ label: '月卡供奉', amount: SHOP.monthCard.daily });
  }
  return gains;
}

/** 天劫塔這一週打到頂。 */
export function grantTower(save: SaveData, week: number): StoneGain | null {
  const stones = save.player.stones;
  if (stones.towerWeek === week) return null;
  stones.towerWeek = week;
  stones.balance += SHOP.grants.tower;
  return { label: '天劫塔登頂', amount: SHOP.grants.tower };
}

/** 成就領獎時一起給（金幣照舊，靈石另外依獎勵大小分三檔）。 */
export function grantAchievement(save: SaveData, id: string, goldReward: number, name: string): StoneGain | null {
  return once(save, `ach:${id}`, achievementStones(goldReward), name);
}

/** 成就給幾顆靈石：照金幣獎勵分三檔（data/shop.json 的 grants.achievement）。 */
export function achievementStones(goldReward: number): number {
  for (const [below, stones] of SHOP.grants.achievement) if (below === 0 || goldReward < below) return stones;
  return 0;
}

// ---------- 月卡 ----------

export function cardActive(save: SaveData, day: number): boolean {
  return save.player.stones.cardUntil > day;
}

/** 月卡還剩幾天（含今天）。 */
export function cardDaysLeft(save: SaveData, day: number): number {
  return Math.max(0, save.player.stones.cardUntil - day);
}

// ---------- 付款入帳 ----------

export type ShopItem = { kind: 'pack'; pack: ShopPack } | { kind: 'card' };

export function shopItem(id: string): ShopItem | null {
  if (id === SHOP.monthCard.id) return { kind: 'card' };
  const pack = SHOP.packs.find((p) => p.id === id);
  return pack === undefined ? null : { kind: 'pack', pack };
}

/**
 * 平台回報付款成功之後入帳。回傳入帳的靈石數（不認得的商品回 0、不入帳）。
 * 月卡疊買會往後延，不會浪費掉還沒用完的天數。
 */
export function creditPurchase(save: SaveData, id: string, day: number, now: number): number {
  const item = shopItem(id);
  if (item === null) return 0;
  const stones = save.player.stones;
  let amount: number;
  if (item.kind === 'card') {
    amount = SHOP.monthCard.stones;
    stones.cardUntil = Math.max(stones.cardUntil, day) + SHOP.monthCard.days;
  } else {
    amount = item.pack.stones;
  }
  stones.balance += amount;
  stones.ledger.push({ item: id, stones: amount, at: now });
  if (stones.ledger.length > 100) stones.ledger.splice(0, stones.ledger.length - 100);
  return amount;
}

// ---------- 時裝 ----------

export function costumeById(id: string): ShopCostume | undefined {
  return SHOP.costumes.find((c) => c.id === id);
}

export function ownsCostume(save: SaveData, id: string): boolean {
  return save.player.stones.costumes.includes(id);
}

export type BuyResult = 'ok' | 'owned' | 'short' | 'unknown';

/** 用靈石買時裝；買到就直接穿上。 */
export function buyCostume(save: SaveData, id: string): BuyResult {
  const costume = costumeById(id);
  if (costume === undefined) return 'unknown';
  const stones = save.player.stones;
  if (stones.costumes.includes(id)) return 'owned';
  if (stones.balance < costume.price) return 'short';
  stones.balance -= costume.price;
  stones.costumes.push(id);
  stones.equipped = id;
  return 'ok';
}

/** 換穿（null 是脫下、換回門派原本的衣服）。沒有的時裝穿不上。 */
export function equipCostume(save: SaveData, id: string | null): boolean {
  if (id !== null && !ownsCostume(save, id)) return false;
  save.player.stones.equipped = id;
  return true;
}

// ---------- 武器外觀與符紙紋樣 ----------

export function weaponSkinById(id: string): ShopWeapon | undefined {
  return SHOP.weapons.find((w) => w.id === id);
}

export function paperById(id: string): ShopPaper | undefined {
  return SHOP.papers.find((p) => p.id === id);
}

/** 用靈石買武器外觀；買到就直接配在那一種武器上。 */
export function buyWeaponSkin(save: SaveData, id: string): BuyResult {
  const skin = weaponSkinById(id);
  if (skin === undefined) return 'unknown';
  const stones = save.player.stones;
  if (stones.weapons.includes(id)) return 'owned';
  if (stones.balance < skin.price) return 'short';
  stones.balance -= skin.price;
  stones.weapons.push(id);
  stones.weaponOn[skin.weapon] = id;
  return 'ok';
}

/** 配上（或 on 為 false 時卸下、換回原本的樣子）。沒有的外觀配不上。 */
export function equipWeaponSkin(save: SaveData, id: string, on: boolean): boolean {
  const skin = weaponSkinById(id);
  const stones = save.player.stones;
  if (skin === undefined || !stones.weapons.includes(id)) return false;
  if (on) stones.weaponOn[skin.weapon] = id;
  else if (stones.weaponOn[skin.weapon] === id) delete stones.weaponOn[skin.weapon];
  return true;
}

/** 用靈石買符紙紋樣；買到就直接換上。 */
export function buyPaper(save: SaveData, id: string): BuyResult {
  const paper = paperById(id);
  if (paper === undefined) return 'unknown';
  const stones = save.player.stones;
  if (stones.papers.includes(id)) return 'owned';
  if (stones.balance < paper.price) return 'short';
  stones.balance -= paper.price;
  stones.papers.push(id);
  stones.paper = id;
  return 'ok';
}

/** 換符紙（null 是原本的黃符紙）。 */
export function equipPaper(save: SaveData, id: string | null): boolean {
  if (id !== null && !save.player.stones.papers.includes(id)) return false;
  save.player.stones.paper = id;
  return true;
}

/** 存檔裡的外觀（給 art.ts 疊門人用）。 */
export function lookOf(save: SaveData): { costume: string | null; weapons: Record<string, string> } {
  return { costume: save.player.stones.equipped, weapons: { ...save.player.stones.weaponOn } };
}
