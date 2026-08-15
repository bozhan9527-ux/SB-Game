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
  },
});
