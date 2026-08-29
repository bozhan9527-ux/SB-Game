import { describe, it, expect } from 'vitest';

/**
 * Phaser **重用同一個 Scene 實例**：scene.start() 不會新建物件，只跑 shutdown → create。
 * 上一場建立的 GameObject 在 shutdown 時被銷毀，但如果類別欄位還抓著它們，
 * 下一場繪製時就會炸在已銷毀物件的內部欄位上
 * （實際訊息：Cannot read properties of null (reading 'glTexture')），畫面直接卡死。
 *
 * 這個 bug 真的發生過：新增「每格倍率標籤」時只 push、沒重新指派，
 * 於是每打完一關按繼續就當掉。它不是打錯字，是這個框架的結構陷阱，
 * 所以用一條掃原始碼的測試守住整類問題，而不是只修那一個欄位。
 *
 * 規則：**凡是 this.X.push(...) 的欄位，同一個檔案裡就必須有 this.X = ... 把它整個重新指派。**
 *
 * 認的是「重新指派」而不是「= []」：有些欄位每次 create() 都整包換成新資料
 * （例如 TalismanScene 的 this.chosen = sanitizeTalismans(...)），那同樣不會殘留。
 * 只認 = [] 的第一版把那個欄位誤判成 bug——守備規則過嚴，抓到的是自己人。
 *
 * 用 import.meta.glob 讀原始碼而不是 node:fs：測試環境沒有 node 型別，
 * 而且這樣讀到的就是 Vite 眼中的那份檔案。
 */
const SOURCES = import.meta.glob('../src/scenes/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('場景狀態', () => {
  const entries = Object.entries(SOURCES);

  it('有場景檔可掃', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const [path, source] of entries) {
    const file = path.split('/').pop() ?? path;
    it(`${file}：每個 push 進去的欄位都有被重新指派`, () => {
      const pushed = new Set<string>();
      for (const match of source.matchAll(/this\.(\w+)\.push\(/g)) {
        const name = match[1];
        if (name !== undefined) pushed.add(name);
      }
      for (const name of pushed) {
        // 屬性宣告寫的是「name: T[] = []」，不含 this.，所以這裡只會配到方法裡的指派。
        const reassigned = new RegExp(`this\\.${name}\\s*=[^=]`).test(source);
        expect(
          reassigned,
          `${file} 的 this.${name} 只有 push 沒有重新指派——Phaser 重用 Scene 實例，` +
            '下一場會拿到上一場已銷毀的物件，畫面會卡死',
        ).toBe(true);
      }
    });
  }
});
