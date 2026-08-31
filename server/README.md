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

帶密鑰的請求一律 POST + JSON body，不放 query string——網址會進到各種存取記錄裡。
