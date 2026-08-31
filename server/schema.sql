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
