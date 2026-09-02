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

-- （這裡曾經有一張 scores 表，那是匿名時代的排行榜：沒有帳號可以對應、
-- 也沒有秒數。board_runs 取代它之後就沒有任何程式碼讀寫它了，所以停止建立。
-- **刻意不 DROP**：已經部署的資料庫留著那張表不會怎麼樣，而一行 DROP 寫進
-- 每次部署都會重跑的檔案裡，是這個專案已經犯過一次的錯。）
-- 帳號。
--
-- 註冊才能上榜（製作人的決定），所以榜上每一筆都對得到這裡的一列——
-- 改名、檢舉、跨裝置才都有意義。
--
-- **這裡沒有密碼，也沒有可以直接拿來用的秘密。** 身分那一把 secret 是
-- 客戶端用「密碼 + salt」推導出來的（PBKDF2），這裡存的仍然只是它的
-- SHA-256，和匿名時代的 saves.secret_hash 完全同一種東西。
-- （這裡曾經有一行 DROP TABLE IF EXISTS accounts，用來補上 email 欄位。
-- 它只該存在一次部署，任務完成後就拿掉了——留著的話每一次部署都會
-- 把所有帳號清光，而那種錯不會有人發現，直到有人抱怨登不進去。）

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

-- 救援問題。忘記密碼時的第二條路。
--
-- **為什麼是獨立一張表，不是 accounts 多兩欄。** schema.sql 每次部署都會整份
-- 重跑，而 CREATE TABLE IF NOT EXISTS 是冪等的、ALTER TABLE 不是——加欄位那條
-- 路第二次部署就會失敗。獨立一張表同時解決另一件事：既有帳號不必遷移，
-- 他們只是還沒有這一列而已。
--
-- **answer_hash 和密碼同一種待遇**：客戶端用「前綴 + 正規化過的答案 + 帳號的鹽」
-- 推導出一把密鑰（PBKDF2），這裡存的只有它的 SHA-256。資料庫外洩拿不到答案，
-- 也拿不到密碼——這正是「答對只能設新密碼、不能看舊密碼」的原因：
-- 舊密碼從來沒有存在過這裡。
CREATE TABLE IF NOT EXISTS account_recovery (
  email       TEXT PRIMARY KEY,
  -- 問題是明文。它本來就要顯示給「知道這個信箱的人」看，不是秘密——
  -- 所以註冊畫面要提醒玩家不要把答案寫進問題裡。
  question    TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  -- 連續猜錯幾次。答對就歸零。**這是這套救援唯一真正的煞車**：
  -- 答案的熵很低，沒有次數上限的話它等於一個四位數的鎖。
  attempts    INTEGER NOT NULL DEFAULT 0,
  -- 猜錯太多次之後鎖到什麼時候。是冷卻不是永久鎖定——永久的話，
  -- 任何知道你信箱的人都能故意猜錯把你的救援管道關掉。
  locked_at   INTEGER,
  set_at      INTEGER NOT NULL
);

-- 速率限制的計數器。
--
-- **為什麼需要它。** 上榜的驗證是伺服器把整場戰鬥重跑一遍，實測一般通關
-- 約 40 毫秒 CPU、跑滿上限的一場約 1.5 秒。沒有煞車的話，任何人只要上傳
-- 一次雲端存檔拿到身分，就能無限次送出 1.5 秒 CPU 的請求——那不會讓資料
-- 壞掉，它會讓帳單壞掉，而且是安靜地壞。
--
-- 固定視窗計數：key 是「做什麼事 + 對誰算」（playerId 或 IP），
-- window_at 是這個視窗的起點。過期的列由 limits.ts 的 sweep 順手清掉——
-- 不清的話，一個換 IP 的攻擊者可以用垃圾列把資料庫塞滿。
CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  hits      INTEGER NOT NULL DEFAULT 0,
  window_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_sweep ON rate_limits (window_at);

-- 伺服器自己的秘密。目前只有一個用途，見下。
--
-- **給沒註冊過的信箱發一把「假鹽」用的胡椒。** /account/salt 對已註冊的信箱
-- 回它真正的鹽，對沒註冊的回一把新的——而「新的」如果是隨機值，同一個信箱
-- 問兩次會拿到兩把不同的鹽，那本身就洩漏了它沒註冊過。所以假鹽改成
-- 從「胡椒 + 信箱」推導：對同一個信箱永遠一樣，而沒有這張表就算不出來。
--
-- 值在第一次需要時自己生出來（INSERT OR IGNORE），不必人工設定——
-- 要人設定的秘密，忘了設就會安靜地退化成「沒有秘密」。
CREATE TABLE IF NOT EXISTS server_secrets (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
