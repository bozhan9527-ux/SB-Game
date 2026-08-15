# TECH_SPEC.md — 技術規格

> 玩法規格見 `GAME_DESIGN.md`，進度見 `PROGRESS.md`。
> 本檔的規範為硬性要求。違反任一條需先提出並取得同意，不得逕行變更。

---

## 1. 技術棧

| 項目 | 選型 | 理由 |
|---|---|---|
| 遊戲引擎 | Phaser 3 | 2D 網頁遊戲成熟方案，觸控支援完整 |
| 語言 | TypeScript（strict） | 開發者本人不寫程式碼，型別檢查是唯一可自動化的正確性防線 |
| 建置 | Vite | 快速熱重載，輸出靜態檔可直上 GitHub Pages |
| 測試 | Vitest | 與 Vite 同源，設定成本低 |
| 網頁部署 | GitHub Pages + GitHub Actions | push 即自動部署，供手機瀏覽器實測 |
| App 封裝 | Capacitor | 直接包裝既有網頁專案，程式碼共用，不需重寫 |

### 版本鎖定

`package.json` 一律使用精確版本（不用 `^` 或 `~`），並提交 lockfile。長期專案跨月開發，浮動版本會造成無法重現的建置失敗。

---

## 2. 目錄結構

```
/
├─ .github/workflows/deploy.yml   # CI：build + 部署 Pages
├─ public/                        # 靜態資源（圖片、音效）
├─ data/                          # 遊戲資料（JSON）— 見第 3 節
│   ├─ enemies.json
│   ├─ abilities.json
│   ├─ forms.json
│   ├─ gates.json                # 戰鬥階段 A：閘門類型與數值
│   ├─ attackPatterns.json      # 戰鬥階段 B：敵人出招序列與預兆窗
│   ├─ areas.json               # 含 affinity：地圖屬性 × 形變加成
│   └─ balance.json             # 全域數值常數（含體力、經驗曲線係數）
├─ src/
│   ├─ main.ts                    # 進入點
│   ├─ scenes/                    # ExploreScene / BattleScene / 轉場
│   ├─ input/                     # 搖桿（探索）、拖曳走位（階段 A）、滑動手勢（階段 B）
│   ├─ systems/                   # 投影 / 閘門推進 / 吸收 / 形變 / 分裂 / 閃避
│   ├─ entities/                  # 玩家、敵人
│   ├─ data/                      # JSON 讀取與型別定義
│   ├─ save/                      # 存檔、遷移
│   └─ ui/
├─ tests/
├─ GAME_DESIGN.md
├─ TECH_SPEC.md
└─ PROGRESS.md
```

---

## 3. 資料驅動（硬性規範）

**所有遊戲數值一律寫在 `data/*.json`，禁止硬編碼於 `src/`。**

包含但不限於：敵人屬性、能力效果、形變參數、經驗曲線、掉落表、區域配置、**閘門類型與數值、敵人出招序列與預兆時間窗**。

戰鬥難度的調整一律透過 `attackPatterns.json` 與 `gates.json` 完成，不得改動 `src/`。

程式碼中只允許出現：讀取資料的邏輯、計算公式的結構。公式中的係數本身也放進 `balance.json`。

理由：三大系統各自會膨脹至數十至數百筆項目，硬編碼在第二個月就會失控，且每次調整數值都要重新建置。

### 型別對應

每個 JSON 檔對應 `src/data/types.ts` 中的一個 interface，載入時以 runtime 驗證（提案使用 zod）。資料格式錯誤必須在載入階段就報錯，不得等到遊戲跑到該筆資料才崩潰。

範例：

```jsonc
// data/enemies.json
{
  "slime_green": {
    "name": "綠泥",
    "hp": 40,
    "atk": 6,
    "ai": "charger",
    "absorbThreshold": 0.3,
    "drops": { "type": "ability", "id": "acid_spit" }
  }
}
```

---

## 4. 存檔規範（硬性規範）

### 4.1 版本號

**存檔結構第一天就必須帶版本號。** 這是不可協商的。

```ts
interface SaveData {
  version: number;      // 每次結構變更 +1
  savedAt: number;      // Unix ms，用於離線結算
  player: PlayerState;
  world: WorldState;
  spawns: SpawnState[]; // 分裂系統，Lv.15 前為空陣列
}
```

### 4.2 遷移

`src/save/migrations.ts` 維護 `v1→v2`、`v2→v3` 的遷移函式陣列。載入舊存檔時依序套用至最新版。

**禁止**：直接改變存檔結構而不寫遷移。長期專案中玩家（包含開發者自己）的測試存檔必須能一路沿用，否則每次改格式都要重玩。

### 4.3 儲存位置

- 網頁版：`localStorage`（鍵名 `slime_save_v1`）
- App 版：Capacitor Preferences API
- 抽象於 `src/save/storage.ts`，上層程式碼不直接接觸任一實作。

### 4.4 離線結算與時間防護

分裂系統結算依 `savedAt` 與當前時間差計算。**必須防範系統時間竄改**：

1. 若 `now < savedAt`（時間倒退）→ 判定為異常，該次結算產出為 0，並將 `savedAt` 更新為 `now`。
2. 單次結算上限封頂（見 `balance.json` 的 `offlineCapHours`）。
3. 伺服器授時：單機版不做。上架變現版必須做，見第 9 節。

---

## 4.5 兩種場景與輸入層

本作有兩個操作模式，實作上必須分離：

| Scene | 輸入 | 說明 |
|---|---|---|
| `ExploreScene` | 虛擬搖桿 / 拖曳 | 2D 俯視自由走動，物理碰撞由 Phaser Arcade Physics 處理 |
| `BattleScene` 階段 A | 按住拖曳（橫向） | 2.5D 偽透視推進，不使用物理引擎，以時間軸驅動 |
| `BattleScene` 階段 B | 左滑 / 右滑 / 上滑 | 同上，鏡頭拉近，改為離散手勢 |

戰鬥的兩個階段使用**兩套獨立的輸入辨識器**，切換時機為抵達對手。同一時間只有一套處於啟用狀態，不得並存。

**拖曳走位規範**（`src/input/drag.ts`，階段 A）：

- 追蹤單一指標的橫向位移，輸出正規化的橫向位置 `x ∈ [-1, 1]`，`0` 為道路正中。
- 採**相對位移**而非絕對座標：按下的位置為基準點，之後依相對於基準點的位移改變 `x`。避免玩家的手指必須放在畫面正中央才能走直線。
- 靈敏度（多少 px 位移對應 `x` 變化 1.0）放進 `balance.json`，手機實測後再調。
- 抬指後保持最後位置，不自動歸中。
- 縱向位移一律忽略，階段 A 不存在上下操作。

**滑動手勢辨識規範**（`src/input/swipe.ts`，階段 B 與探索以外的確認動作）：

- 判定閾值：位移 ≥ 40 px 且時間 ≤ 300 ms
- 主軸判定：水平位移 > 垂直位移 ×1.5 才算左右滑，反之才算上下滑，避免誤判
- 一次手勢只觸發一次事件，抬指前不重複觸發
- 需可設定判定閾值（放進 `balance.json`），手機實測後再調

**禁止**在 `BattleScene` 使用搖桿，或在 `ExploreScene` 綁定滑動戰鬥手勢。三套輸入不共用實作。

戰鬥時間軸與畫格率解耦：所有時間窗以毫秒計，不以 frame 計。低階手機掉幀時預兆窗長度不得改變。

---

## 4.6 2.5D 偽透視（硬性規範）

戰鬥畫面的縱深是**畫出來的，不是算出來的**。Phaser 3 是 2D 引擎，本作不引入任何 3D 函式庫。

### 投影模型

世界座標只有兩個量：`x`（橫向偏移，`0` 為道路中線）與 `z`（在攝影機前方的距離，恆 `> 0`）。投影至螢幕：

```
scale   = focalLength / z
screenX = GAME_WIDTH / 2 + x * scale
screenY = horizonY + cameraHeight * scale
```

`focalLength`、`cameraHeight`、`horizonY`、道路半寬等參數一律放進 `balance.json` 的 `projection` 區塊，**不得寫死於 `src/`**。

### 硬性要求

1. **投影必須是純函式**，實作於 `src/systems/projection.ts`，不得 import Phaser、不得讀取全域狀態。理由：這是全戰鬥畫面的座標來源，必須能在 node 環境下單元測試。
2. **`z` 必須夾在 `nearZ` 以上**。`z → 0` 會使 `scale → ∞` 導致座標溢位與繪製崩潰。
3. **推進由時間驅動，不由畫格驅動**。每幀依 `delta`（毫秒）推進 `z`，禁止「每幀固定減少 N」的寫法。
4. **繪製順序由遠至近**。`z` 大的先畫，否則近處物件會被遠處物件蓋住。

### 狀態與畫面分離

階段 A 的推進邏輯實作於 `src/systems/gateRun.ts`，同樣是**不含 Phaser 的純模組**：輸入為經過的毫秒數與玩家橫向位置，輸出為閘門狀態與結算事件。`BattleScene` 只負責把這個狀態畫出來。

理由：閘門判定是本作最核心且最容易出錯的規則，必須能在測試中以固定時間序列重現，不能只能靠手動遊玩驗證。

---

## 5. CI／部署

`.github/workflows/deploy.yml` 於 push 到 `main` 時執行：

1. `npm ci`
2. `npx tsc --noEmit` — 型別檢查，失敗即中止
3. `npm test` — 單元測試，失敗即中止
4. `npm run build`
5. 部署 `dist/` 至 GitHub Pages

**型別檢查與測試必須在部署前擋關。** 由於開發者不逐行審查程式碼，CI 是實質上的品質閘門。

Vite 的 `base` 需設為 `/<repo-name>/`，否則 GitHub Pages 上資源路徑會 404。

---

## 6. 手機測試流程

1. push 到 main
2. 等 Actions 綠燈（約 1-2 分鐘）
3. 手機瀏覽器開 `https://<user>.github.io/<repo>/`
4. 加入主畫面可全螢幕測試，接近 App 體驗

觸控需求：目標裝置最小支援 360×640 CSS px。UI 熱區不小於 44×44 px。

---

## 7. 轉 App（後期，尚未執行）

Capacitor 加入時機：網頁版首章可完整遊玩之後。提前導入只會增加建置複雜度而沒有收益。

屆時需處理：直向鎖定、返回鍵行為、存檔遷移（localStorage → Preferences）、圖示與啟動畫面。

---

## 9. 後端預留（單機版不實作）

**現階段為單機版：純前端、localStorage 存檔、無帳號、無廣告、無內購。**
玩法驗證完成前不蓋後端——在還沒人玩的東西上花數週後端工是浪費。

但存檔結構從第一天就必須設計成**可搬遷至伺服器**，否則日後改造等於重寫。硬性要求：

1. **存檔為單一可序列化物件**，不散落在多個 localStorage 鍵。搬遷時整包上傳即可。
2. **所有存取走 `src/save/storage.ts` 抽象層**，上層程式碼不直接呼叫 `localStorage`。日後只需替換該檔為 API 呼叫。
3. **權威數值集中**：體力、貨幣、素材等日後需伺服器驗證的欄位，統一放在 `SaveData.player.wallet` 之下，不與 UI 狀態混雜。
4. **不在存檔中儲存衍生值**（如「當前體力上限」）。只存等級，上限由公式算出。伺服器化後才不會出現前後端算法不一致。
5. **時間相關欄位一律存 Unix ms 絕對時間戳**，不存「剩餘秒數」。

### 上架版才需要的（尚未規劃）

帳號系統（提案匿名登入）、伺服器端權威存檔、伺服器授時、廣告 server-to-server 驗證回調、App Store / Google Play 收據驗證。

---

## 10. 給 Claude Code 的工作規範

1. 動工前先讀 `PROGRESS.md`，結束前更新它。
0. **不要實作變現、廣告、帳號、後端相關功能。** 現階段為單機版，僅需遵守第 9 節的搬遷預留規範。
2. 資料類改動只碰 `data/`，不要順手改 `src/`。
3. 不為「未來可能需要」預先建立抽象層。
4. 完成的定義是：`tsc --noEmit` 通過 + 測試通過 + 在瀏覽器實際跑起來確認畫面正確。三者缺一不算完成。
5. 環境限制（跑不動、測不到、看不到畫面）直接說明是限制，不要包裝成已完成。
