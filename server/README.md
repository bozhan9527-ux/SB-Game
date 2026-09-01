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

## 寄信（忘記密碼）

忘記密碼要寄一組六位數驗證碼，走 Resend。**這兩個是 secret，不進 wrangler.toml
也不進版控**——寫進去等於把金鑰公開在 GitHub 上。

| 名稱 | 值 | 說明 |
|---|---|---|
| `RESEND_KEY` | `re_...` | Resend 後台的 API Key |
| `RESEND_FROM` | `問道飛升 <no-reply@你的網域>` | 寄件人。網域必須在 Resend 驗證過 |

設定（兩條路擇一，設一次就好，**之後每次部署都不會被蓋掉**）：

```bash
cd server
npx wrangler secret put RESEND_KEY     # 貼上金鑰後 Enter
npx wrangler secret put RESEND_FROM
```

或到 Cloudflare 後台：**Workers & Pages → sb-game-api → Settings →
Variables and Secrets → Add**，型別選 **Secret**（選成 Text 的話值會
明碼顯示在後台，那就不叫 secret 了）。

**沒有自己的網域就寄不出去。** Resend 未驗證網域時只給你
`onboarding@resend.dev`，而那個寄件人**只能寄給你自己註冊 Resend 的那個信箱**，
寄給玩家一律被擋。所以順序是：先有一個網域 → 在 Resend 加上它並照指示設好
SPF 與 DKIM 兩筆 DNS → 才拿得到能寄給任何人的寄件人。
（SPF／DKIM 沒設好的下場不是被退信就是進垃圾桶，那是 DNS 那邊的事，
程式這邊無能為力。）

**沒設的時候會怎樣：** 整包是 no-op，但 `sendRecoveryMail` 會在 Worker 的
記錄裡寫 `mail: RESEND_KEY / RESEND_FROM 沒有設定，驗證碼沒有寄出`。
玩家那一端看到的仍然是「如果有註冊過，信已經在路上」——那句話是刻意的
（分開回等於送人一份「哪些信箱註冊過」的查詢工具），所以**畫面上永遠看不出
信有沒有真的寄出去**，只能看記錄：

```bash
npx wrangler tail sb-game-api
```

在那之前，忘記密碼這條路等於不存在，玩家唯一的救援手段是存檔碼。

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
