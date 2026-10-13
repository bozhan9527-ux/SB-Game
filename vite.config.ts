// 從 vitest/config 匯入，才能在同一份設定裡帶 test 區塊。
import { defineConfig } from 'vitest/config';

// GitHub Pages 部署於 https://<user>.github.io/SB-Game/
// base 未設會導致資源路徑 404，見 TECH_SPEC 第 5 節。
export default defineConfig({
  base: '/SB-Game/',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 數值平衡的測試是整段模擬（推 81 關、每種配置各推一次），平常三五秒，
    // 機器一忙就超過預設的五秒。逾時不是失衡，別讓它在 CI 上隨機變紅。
    testTimeout: 30_000,
  },
});
