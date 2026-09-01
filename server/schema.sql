-- 雲端存檔。
--
-- 一個玩家一列，存檔本身就是一段 JSON——TECH_SPEC 第 9 節要求存檔是
-- 單一可序列化物件，正是為了這一刻：不必為了上雲端把結構拆成一堆欄位，
-- 也就不會有前後端算法不一致的問題。
CREATE TABLE IF NOT EXISTS saves (
  player_id   TEXT PRIMARY KEY,
  -- 只存 secret 的 SHA-256。伺服器沒有必要知道原文，外洩時也拿不到別人的身分。
  secret_hash TEXT NOT NULL,
  blob        TEXT NOT NULL,
  -- 存檔自己帶的時間戳，用來判斷「雲端那份比較新還是本機那份比較新」。
  saved_at    INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 排行榜。一個玩家只留最好的一筆，不是每一場都留。
CREATE TABLE IF NOT EXISTS scores (
  player_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  stage       INTEGER NOT NULL,
  -- 重播用的原始資料，留著才有辦法事後複驗或申訴。
  runs        INTEGER NOT NULL,
  steps       INTEGER NOT NULL,
  actions     TEXT NOT NULL,
  -- 重播時用的配置，同樣留存。
  loadout     TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  -- 被檢舉下架的不刪除，只標記——刪掉就查不出當初發生什麼事。
  hidden      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS scores_rank ON scores (hidden, stage DESC, verified_at ASC);

-- 帳號。
--
-- 註冊才能上榜（製作人的決定），所以榜上每一筆都對得到這裡的一列——
-- 改名、檢舉、跨裝置才都有意義。
--
-- **這裡沒有密碼，也沒有可以直接拿來用的秘密。** 身分那一把 secret 是
-- 客戶端用「密碼 + salt」推導出來的（PBKDF2），這裡存的仍然只是它的
-- SHA-256，和匿名時代的 saves.secret_hash 完全同一種東西。
-- **一次性重建。** accounts 是上一次部署才建的，而 CREATE TABLE IF NOT EXISTS
-- 加不了欄位——這裡要補的 email 是「註冊當下沒收就永遠補不回來」的東西，
-- 所以趁表還是空的把它換掉。下一次部署會把這一行拿掉。
DROP TABLE IF EXISTS accounts;

-- 帳號。**帳號是電子信箱，道號只負責顯示。**
--
-- 登入要的是一個唯一、記得住、能拿來找回帳號的東西（信箱正好是這三樣）；
-- 榜上要的是一個看得順眼的名字。綁在一起的話，改個名就變成換一個帳號。
--
-- 這裡沒有密碼，也沒有可以直接拿來用的秘密：身分那一把 secret 是客戶端
-- 用「密碼 + salt」推導出來的（PBKDF2），這裡存的仍然只是它的 SHA-256。
CREATE TABLE IF NOT EXISTS accounts (
  -- 正規化（小寫、去頭尾空白）之後的信箱。這是帳號本身。
  email       TEXT PRIMARY KEY,
  -- 榜上顯示的道號。
  name        TEXT NOT NULL,
  -- 正規化後的道號，只用來擋重複：榜上兩個一模一樣的名字等於誰都能冒充誰。
  name_key    TEXT NOT NULL UNIQUE,
  -- 這個帳號擁有的身分。註冊時收編呼叫者現有的匿名身分，不發新的——
  -- 換一個 player_id 等於把他已經玩出來的雲端存檔和榜上那一筆孤立掉。
  player_id   TEXT NOT NULL UNIQUE,
  -- PBKDF2 的鹽。公開值，它的工作只是讓同樣的密碼在不同帳號推出不同的 secret。
  salt        TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  -- 忘記密碼時發出去的驗證碼：只存雜湊，和密碼同一種待遇。
  reset_hash  TEXT,
  reset_at    INTEGER,
  created_at  INTEGER NOT NULL
);

-- 榜單。三個榜共用一張表，用 board 分。
--
-- **取代了舊的 scores。** 舊表是匿名時代的：沒有帳號可以對應、沒有秒數。
-- 上榜改成要註冊之後，那些列已經沒有主人了，所以整張換掉而不是加欄位。
--
-- 一個帳號在一個榜上只留最好的一筆，不是每一場都留：榜單要看的是
-- 「誰走得最遠」，而且一個人洗版一百筆會把別人全擠掉。
CREATE TABLE IF NOT EXISTS board_runs (
  -- 'depth'：主線推得最深，同深度比秒數。
  -- 'speed'：主線終點（第 81 關）的速通。
  -- 'arena'：競技場連下幾波。
  board       TEXT NOT NULL,
  player_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  -- 這個榜的主要分數：深度／秒數／波數，各榜自己解釋。
  score       INTEGER NOT NULL,
  -- 打到第幾關。速通榜與競技榜也記，畫面上要講得出「哪一關」。
  stage       INTEGER NOT NULL,
  -- 模擬時間。加速鍵改不了它，所以拿來排名是公平的。
  elapsed_ms  INTEGER NOT NULL,
  -- 重播用的原始資料，留著才有辦法事後複驗或申訴。
  runs        INTEGER NOT NULL,
  steps       INTEGER NOT NULL,
  actions     TEXT NOT NULL,
  loadout     TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  -- 被檢舉下架的不刪除，只標記——刪掉就查不出當初發生什麼事。
  hidden      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (board, player_id)
);

-- 深度榜與競技榜：分數大的在前，同分比秒數快的。
CREATE INDEX IF NOT EXISTS board_runs_high ON board_runs (board, hidden, score DESC, elapsed_ms ASC);
-- 速通榜：分數（秒數）小的在前。
CREATE INDEX IF NOT EXISTS board_runs_low ON board_runs (board, hidden, score ASC, verified_at ASC);
