-- 「目前有多少人玩過？」
--
-- 走檔案而不是 --command：wrangler-action 會把 command 照空白拆開，
-- 引號包起來的 SQL 一樣會被切碎（實測只有 SELECT 這個字被傳過去）。
-- schema.sql 從第一天就是走 --file，這裡照抄那個做法。
--
-- **只有 COUNT，沒有任何一列原始資料。** accounts 裡的信箱是這個專案唯一
-- 存下來的個人資料，而 workflow 的 log 是公開的。

-- 三個數字的意思不一樣：
--   玩過   ＝ 雲端身分是「第一次成功送出成績」時自動建立的，所以它等於
--            「至少通關過一關、而且當時網路是通的人」。這是最接近
--            「玩過的人數」的一個，但它少算打開遊戲就放棄、以及離線玩的人。
--   上過榜 ＝ 成績通過伺服器重播驗證的人。和上面的差就是驗證失敗的人。
--   註冊   ＝ 填過信箱的人。一定最少，因為不註冊也能上榜。
SELECT
  (SELECT COUNT(*) FROM saves)                                   AS 玩過,
  (SELECT COUNT(DISTINCT player_id) FROM board_runs)             AS 上過榜,
  (SELECT COUNT(*) FROM accounts)                                AS 註冊,
  (SELECT COUNT(*) FROM saves
    WHERE updated_at > (strftime('%s','now') - 7*86400)*1000)    AS 近七天有動,
  (SELECT COUNT(*) FROM saves
    WHERE updated_at > (strftime('%s','now') - 86400)*1000)      AS 近一天有動;

-- 各榜的人數與最佳成績。速通榜一關一個，所以這裡會列出好幾列。
SELECT board AS 榜, COUNT(*) AS 人數, MAX(score) AS 最佳
FROM board_runs WHERE hidden = 0
GROUP BY board ORDER BY 人數 DESC, board LIMIT 30;

-- 卡關的位置就在這張表上：某一關特別多人停著，那一關就是門檻太高。
SELECT stage AS 關卡, COUNT(*) AS 人數
FROM board_runs WHERE board = 'depth' AND hidden = 0
GROUP BY stage ORDER BY stage;
