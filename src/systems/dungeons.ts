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
import { loadoutSpecOf } from './loadout';

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
 * 一層的實際戰鬥深度。
 *
 * stageRatio 的那一種跟著玩家的最高關卡走——這是聚寶洞不會退化成提款機的
 * 唯一原因：它永遠開在你現在打得動的邊緣，而不是你三十關前打爛的地方。
 */
export function floorStage(floor: DungeonFloor, highestStage: number): number {
  if (floor.stage !== undefined) return Math.max(1, Math.round(floor.stage));
  const ratio = floor.stageRatio ?? 1;
  return Math.max(1, Math.round(Math.max(1, highestStage) * ratio));
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
  const floor = floorAt(dungeon, index);
  const stage = floor === null ? 1 : floorStage(floor, save.world.highestStage);
  return {
    ...loadoutSpecOf(save, stage),
    rules: [...dungeon.rules],
    goldMultiplier: dungeon.goldMultiplier,
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
  return save.world.highestStage >= dungeon.minStage;
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
  return save.world.highestStage >= floorGate(dungeon, index);
}
