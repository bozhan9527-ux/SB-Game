# sb-game-api

雲端存檔、排行榜、百分位。Cloudflare Workers + D1。

沒有它遊戲照樣完整可玩——前端沒設定 `VITE_API_BASE` 時，雲端相關的畫面
整個不出現（一個按了會失敗的按鈕比沒有那個按鈕更糟）。

## 本機開發

```bash
# 起 Worker（本機模式，不需要 Cloudflare 帳號）
cd server
npx wrangler dev --local --port 8788 --var 'ALLOWED_ORIGIN:http://localhost:4173'

# 另開一個終端，建本機資料庫
npx wrangler d1 execute sb-game --local --file=schema.sql

# 回專案根目錄，帶著 API 位址 build 前端
VITE_API_BASE=http://localhost:8788 npm run build && npx vite preview --port 4173
```

`ALLOWED_ORIGIN` 要用 `--var` 覆蓋，不要寫進 wrangler.toml：
那個檔案裡的值是**正式部署**會用的，而 localhost 是別人的機器上也存在的位址。

## 部署

```bash
npx wrangler login
npx wrangler d1 create sb-game          # 把回傳的 database_id 填進 wrangler.toml
npx wrangler d1 execute sb-game --remote --file=schema.sql
npx wrangler deploy
```

部署完會拿到一個 `https://sb-game-api.<你的帳號>.workers.dev` 位址，
把它填進 GitHub repo 的 **Settings → Secrets and variables → Actions → Variables**：

| 名稱 | 值 |
|---|---|
| `VITE_API_BASE` | `https://sb-game-api.<你的帳號>.workers.dev` |

它是變數不是密鑰——這個位址本來就會出現在前端的 JS 裡。

## 端點

| 方法 | 路徑 | 用途 |
|---|---|---|
| GET | `/v1/health` | 活著沒 |
| POST | `/v1/save/put` | 上傳存檔（第一次上傳等於註冊） |
| POST | `/v1/save/get` | 下載存檔 |
| POST | `/v1/score` | 送出成績（伺服器重播驗證後才記分） |
| GET | `/v1/leaderboard` | 前 50 名 |
| GET | `/v1/distribution` | 關卡分布直方圖，客戶端用它算百分位 |

## 排行榜怎麼驗

客戶端**不上報分數**，上報的是「種子＋每一個操作」，伺服器用同一份
`tickCombat` 重跑一遍，伺服器算出來的結果才算數。

擋得住：打開 console 改數字、直接對端點 POST 一個誇張的關卡。
（實測：拿第 12 關的操作記錄宣稱第 999 關，重播出來是 `defeated`，被拒。）

擋不住：有人自己搜一個好種子、用程式算出最優操作序列再送上來——
那份紀錄會完全合法地驗過。這是客戶端權威型遊戲的結構性限制。

## 檢舉與下架

`scores.hidden` 設成 1 就不再出現在榜上與分布裡，但那一列**不刪除**——
刪掉就查不出當初發生什麼事。

```bash
npx wrangler d1 execute sb-game --remote \
  --command "UPDATE scores SET hidden = 1 WHERE player_id = '...'"
```

帶密鑰的請求一律 POST + JSON body，不放 query string——網址會進到各種存取記錄裡。
