/**
 * 副本。
 *
 * **這一套取代了原本的「試煉」。** 舊做法是把限制疊在玩家自己挑的關卡上，
 * 而那有一個結構性的漏洞：難度是相對於**現在的實力**的，所以玩家會把限制
 * 疊在一個早就打爛的關卡上，領走倍率卻沒有付出任何難度。實測第 26 關開
 * 「獨門一符」是勝率 100%、山門一滴血沒掉、金幣正好 ×1.5——那不是挑戰，是提款機。
 *
 * 副本把關卡從玩家手上收回來：深度由副本自己決定，所以「回頭刷簡單關」
 * 這條路直接不存在。唯一可重複的聚寶洞，深度還跟著你的最高關卡走。
 *
 * 五個副本各有各的產出（符籙／門派修為／仙緣／格位／金幣），
 * 其中藏經閣是**必經內容**——十六張非基礎符只有它產出。這一點是刻意的取捨：
 * 它讓副本從「自找的挑戰」變成「遊戲的一部分」，代價是它的難度必須
 * 用「爬到那一層的人都過得了」的標準來調，不能用「想找罪受的人才會來」。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import { CARDS, DUNGEONS } from '../data';
import type { DungeonDef, DungeonFloor } from '../data/types';
import type { SaveData } from '../save/types';
import type { LoadoutSpec } from './loadout';
import { dungeonThreatFactor, loadoutSpecOf } from './loadout';

/** 產出符籙的那一個。符籙的解鎖完全由它決定。 */
export const LIBRARY_ID = 'library';

export function dungeonById(id: string): DungeonDef | null {
  return DUNGEONS.find((item) => item.id === id) ?? null;
}

/** 這個副本已經通到第幾層（0 表示一層都還沒過）。 */
export function clearedFloors(save: SaveData, dungeonId: string): number {
  return Math.max(0, save.player.dungeons[dungeonId] ?? 0);
}

/**
 * 這一世推到第幾關。副本的門檻與深度全部看它，不看歷史最高。
 *
 * **highestStage 不會因為轉世歸零**，所以拿它當門檻的話，轉世之後所有副本
 * 會在第一秒全部開放：進度被清光、關卡卻一層都不用再爬，而玩家手上還多了
 * 整套仙緣。聚寶洞更糟——它的深度是歷史最高的 0.85 倍，剛轉世的人一進去
 * 就是必死的第 170 關。
 *
 * world.stage 是「下一關要打第幾關」，轉世時歸 1，之後只會往前走，
 * 所以它正好就是「這一世走到哪」。
 */
export function lifeStage(save: SaveData): number {
  return Math.max(1, Math.floor(save.world.stage));
}

/**
 * 一層的實際戰鬥深度。
 *
 * stageRatio 的那一種跟著玩家**這一世**的進度走——這是聚寶洞不會退化成
 * 提款機的唯一原因：它永遠開在你現在打得動的邊緣，而不是你三十關前打爛的地方。
 */
export function floorStage(floor: DungeonFloor, currentStage: number): number {
  if (floor.stage !== undefined) return Math.max(1, Math.round(floor.stage));
  const ratio = floor.stageRatio ?? 1;
  return Math.max(1, Math.round(Math.max(1, currentStage) * ratio));
}

/**
 * 這一層這一世實際會打到第幾關。
 *
 * 固定層數的那一種要乘上轉世係數（見 dungeonThreatFactor）：
 * 轉世把副本進度清光，重走的那一趟若難度停在原地，就只是勞動。
 *
 * 跟著進度走的那一種（聚寶洞）**不再乘一次**——它看的本來就是這一世的
 * 進度，而那個數字已經反映了變硬的世界。
 */
export function floorDepth(save: SaveData, dungeon: DungeonDef, index: number): number {
  const floor = floorAt(dungeon, index);
  if (floor === null) return 1;
  const base = floorStage(floor, lifeStage(save));
  if (floor.stage === undefined) return base;
  const scaled = Math.round(base * dungeonThreatFactor(save.player.karma.claimedStage));
  // **深度不得超過那一層的門檻。**
  //
  // 這是整套副本平衡的地基：副本難的是規則不是深度，所以一層的關卡永遠開得比
  // 「你得推到哪才進得來」淺。轉世係數若能把它推過門檻，鎮妖塔第四層會從
  // 第 55 關被推到第 78 關而門檻只有 58——實測勝率直接歸零。
  // 上限一夾，係數就只能把那一層從「比門檻淺很多」推到「貼著門檻」為止。
  return Math.max(1, Math.min(scaled, floorGate(dungeon, index)));
}

/**
 * 下一層是第幾層（1 起算）。全部通完且不可重複時回 null。
 *
 * 可重複的副本永遠回第一層——它只有一層，而且那一層每次的深度都跟著進度走。
 */
export function nextFloor(save: SaveData, dungeon: DungeonDef): number | null {
  const cleared = clearedFloors(save, dungeon.id);
  if (dungeon.repeatable) return 1;
  if (cleared >= dungeon.floors.length) return null;
  return cleared + 1;
}

/** 第 index 層（1 起算）的定義。超出範圍回 null。 */
export function floorAt(dungeon: DungeonDef, index: number): DungeonFloor | null {
  return dungeon.floors[index - 1] ?? null;
}

/**
 * 藏經閣通關層數 → 已解鎖的符。
 *
 * 四張基礎符永遠有；其餘十六張依 cards.json 的順序，一層一張。
 */
export function libraryFloor(save: SaveData): number {
  return clearedFloors(save, LIBRARY_ID);
}

/**
 * 一層通關要發什麼。
 *
 * **回傳描述而不是直接寫存檔的原因**：結算畫面要把「你拿到了什麼」講出來，
 * 而發放與顯示如果各算一次，兩邊遲早會不一致——那種錯的症狀是
 * 「畫面說給了，存檔裡沒有」，最難查。
 */
export interface FloorReward {
  lines: string[];
}

export function grantFloor(save: SaveData, dungeon: DungeonDef, index: number): FloorReward {
  const floor = floorAt(dungeon, index);
  const lines: string[] = [];
  if (floor === null) return { lines };

  // **已經通過的層不再發獎勵。**
  //
  // 一次性的回報（符籙、修為、仙緣、格位）只能拿一次，否則重打同一層就是無限產出。
  // 這條真的漏過一次：試劍台打完之後每通一關就多一格，因為這裡不管那一層
  // 是不是已經過了，一律照發。
  if (!dungeon.repeatable) {
    if (index <= clearedFloors(save, dungeon.id)) return { lines };
    save.player.dungeons[dungeon.id] = index;
  }

  if (floor.talisman !== undefined) {
    const def = CARDS.find((card) => card.id === floor.talisman);
    lines.push(def === undefined ? '新的符籙' : `習得 ${def.name}`);
  }
  if (floor.mastery !== undefined && save.player.sectId !== null) {
    const id = save.player.sectId;
    save.player.sectClears[id] = (save.player.sectClears[id] ?? 0) + floor.mastery;
    lines.push(`門派修為 +${floor.mastery}`);
  }
  if (floor.karma !== undefined) {
    save.player.karma.points += floor.karma;
    lines.push(`仙緣 +${floor.karma}`);
  }
  return { lines };
}

/**
 * 一場副本戰鬥的完整輸入。
 *
 * 和一般關卡走同一個 buildLoadoutFromSpec——副本只是把規則、倍率與深度
 * 填進同一個 spec 裡。兩條路徑若各自組裝，排行榜的重播驗證立刻會對不上。
 */
export function dungeonSpecOf(save: SaveData, dungeon: DungeonDef, index: number): LoadoutSpec {
  return {
    ...loadoutSpecOf(save, floorDepth(save, dungeon, index)),
    rules: [...dungeon.rules],
    goldMultiplier: dungeon.goldMultiplier,
    endless: dungeon.endless,
    // 轉世的加成已經算進 floorDepth 了，這裡要把主線那條關掉，否則同一件事
    // 會被算兩次——深層的副本本來就會超過第 82 關，threatStage 會再加一次。
    bankedStage: 0,
  };
}

/**
 * 開放條件。
 *
 * 一層一層開：沒過第一層就看不到第二層。這不只是節奏，也是安全網——
 * 玩家不可能一頭撞進一個他還差三十關的深度，然後以為遊戲壞掉。
 *
 * 另外整個副本要到「最高關卡不低於第一層的深度」才出現，否則新玩家
 * 會看到五個他一個都打不動的入口。
 */
export function dungeonAvailable(save: SaveData, dungeon: DungeonDef): boolean {
  return lifeStage(save) >= dungeon.minStage;
}

/** 這一層的開放門檻（主線要推到第幾關）。 */
export function floorGate(dungeon: DungeonDef, index: number): number {
  return floorAt(dungeon, index)?.minStage ?? dungeon.minStage;
}

/**
 * 這一層開得了嗎。
 *
 * 兩個條件：前一層過了，而且主線推得夠深。後者是這一套平衡的地基——
 * 副本的關卡開得比玩家的進度淺，難的是規則不是深度，所以「你推到哪」
 * 才是真正的門檻，「這一層第幾關」只是它有多難。
 */
export function floorOpen(save: SaveData, dungeon: DungeonDef, index: number): boolean {
  if (clearedFloors(save, dungeon.id) < index - 1) return false;
  return lifeStage(save) >= floorGate(dungeon, index);
}
