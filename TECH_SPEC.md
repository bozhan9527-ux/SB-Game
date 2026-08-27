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
├─ public/art/                    # 手寫 SVG 美術資源
├─ data/                          # 遊戲資料（JSON）— 見第 3 節
│   ├─ balance.json              # 全域數值常數（滑動門檻、戰力公式、敵陣、首領、金幣）
│   ├─ realms.json               # 境界：關卡區間、配色、境界壓制
│   ├─ sects.json                # 門派：起始屬性與各項乘區
│   ├─ gates.json                # 閘門模板：資源、加算／乘算、基準值、權重、是否陷阱
│   ├─ upgrades.json             # 五條金幣升級線
│   └─ enemies.json              # 各境界的敵陣與首領
├─ src/
│   ├─ main.ts                    # 進入點
│   ├─ art.ts                     # 美術資源載入
│   ├─ state.ts                   # 執行期的存檔單例
│   ├─ scenes/                    # Boot / Title / Sect / Run / Result / Upgrade
│   ├─ input/                     # 滑動手勢辨識
│   ├─ systems/                   # 閘門 / 敵陣 / 首領 / 境界 / 升級 / 開局配置
│   ├─ audio/                     # 音高、合成、播放與配樂排程
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

包含但不限於：**閘門類型與數值、境界區間與壓制、門派加成、升級線的效果與花費曲線、
敵陣威脅值、首領血量與攻擊的成長曲線**。

關卡難度的調整一律透過 `balance.json` 與 `gates.json` 完成，不得改動 `src/`。

程式碼中只允許出現：讀取資料的邏輯、計算公式的結構。公式中的係數本身也放進 `balance.json`。

理由：這些表會膨脹至數十至數百筆項目，硬編碼在第二個月就會失控，且每次調整數值都要重新建置。

例外：畫面座標、面板大小、字級這類**版面參數**，以及音色合成參數，留在 `src/`。
本節規範的是遊戲數值，把版面搬進 JSON 只會讓調整變麻煩。

### 型別對應

每個 JSON 檔對應 `src/data/types.ts` 中的一個 interface，載入時以 runtime 驗證（提案使用 zod）。資料格式錯誤必須在載入階段就報錯，不得等到遊戲跑到該筆資料才崩潰。

範例：

```jsonc
// data/gates.json — 閘門模板
[
  { "id": "d_mul_2", "target": "disciples", "op": "mul", "value": 2, "weight": 7, "trap": false },
  { "id": "a_add_7", "target": "arms",      "op": "add", "value": 7, "weight": 9, "trap": false },
  { "id": "d_sub_4", "target": "disciples", "op": "add", "value": -4, "weight": 8, "trap": true }
]
```

---

## 4. 存檔規範（硬性規範）

### 4.1 版本號

**存檔結構第一天就必須帶版本號。** 這是不可協商的。

```ts
interface SaveData {
  version: number;      // 每次結構變更 +1
  savedAt: number;      // Unix ms，用於離線結算
  player: PlayerState;   // 門派、金幣、升級等級
  world: WorldState;     // 關卡進度與統計
  settings: SettingsState; // 本機偏好（音效開關）
}
```

### 4.2 遷移

`src/save/migrations.ts` 維護 `v1→v2`、`v2→v3` 的遷移函式陣列。載入舊存檔時依序套用至最新版。

**禁止**：直接改變存檔結構而不寫遷移。長期專案中玩家（包含開發者自己）的測試存檔必須能一路沿用，否則每次改格式都要重玩。

### 4.3 儲存位置

- 網頁版：`localStorage`（鍵名 `xianxia_save_v1`）
- App 版：Capacitor Preferences API
- 抽象於 `src/save/storage.ts`，上層程式碼不直接接觸任一實作。

### 4.4 時間防護

`savedAt` 一律存 Unix ms 絕對時間戳。日後若加入任何依時間差計算的機制，
**必須防範系統時間竄改**：`now < savedAt`（時間倒退）視為異常，該次產出為 0 並把 `savedAt` 更新為 `now`。
伺服器授時單機版不做，上架變現版必須做，見第 9 節。

---

## 4.5 輸入層

**滑動手勢辨識規範**（`src/input/swipe.ts`）：

- 判定閾值：位移 ≥ 40 px 且時間 ≤ 300 ms
- 主軸判定：水平位移 > 垂直位移 ×1.5 才算左右滑，反之才算上下滑，避免誤判
- 一次手勢只觸發一次事件，抬指前不重複觸發
- 需可設定判定閾值（放進 `balance.json`），手機實測後再調

**禁止**在關卡場景引入搖桿或連續拖曳操作。左右滑是唯一的推進輸入，
另外允許點擊畫面左／右半邊作為誤觸補救——那仍是單次離散輸入。

戰鬥時間軸與畫格率解耦：所有時間窗以毫秒計，不以 frame 計。低階手機掉幀時節奏不得改變。

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
3. **權威數值集中**：金幣等日後需伺服器驗證的欄位，統一放在 `SaveData.player.wallet` 之下，不與 UI 狀態混雜。
4. **不在存檔中儲存衍生值**（如「目前的起始人數」）。只存升級等級，實際數值由公式算出。伺服器化後才不會出現前後端算法不一致。
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
