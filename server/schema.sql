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
CREATE TABLE IF NOT EXISTS accounts (
  -- 正規化（NFKC + 小寫 + 去頭尾空白）後的名字。擋的是「看起來一樣」的重複。
  name_key    TEXT PRIMARY KEY,
  -- 顯示用的原字串。
  name        TEXT NOT NULL,
  -- 這個帳號擁有的身分。註冊時收編呼叫者現有的匿名身分，不發新的——
  -- 換一個 player_id 等於把他已經玩出來的雲端存檔和榜上那一筆孤立掉。
  player_id   TEXT NOT NULL UNIQUE,
  -- PBKDF2 的鹽。公開值，它的工作只是讓同樣的密碼在不同帳號推出不同的 secret。
  salt        TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
