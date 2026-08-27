import { describe, it, expect } from 'vitest';
import { MIN_TOUCH_SIZE, formatNumber, hexToNumber, wrapText } from '../src/ui/theme';

describe('文字排版', () => {
  it('中文沒有空白也會斷行（Phaser 的 word wrap 不會處理）', () => {
    const text = '門人肉身強橫，開局弟子多、防禦高，敵陣衝殺時傷亡最少。';
    const wrapped = wrapText(text, 300, 18);
    expect(wrapped).toContain('\n');
    for (const line of wrapped.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(Math.ceil(300 / 18));
    }
  });

  it('以空白分隔的詞塊不會被從中間切開', () => {
    const wrapped = wrapText('人數+2 攻擊+1 防禦+2 首領傷害×0.95 金幣×1.5 敵陣傷亡×0.85', 420, 16);
    for (const line of wrapped.split('\n')) {
      expect(line).not.toMatch(/[×+]$/);
      expect(line).not.toMatch(/^\d/);
    }
  });

  it('短字串不動它', () => {
    expect(wrapText('確定入門', 400, 20)).toBe('確定入門');
  });

  it('保留原本的換行', () => {
    expect(wrapText('甲\n乙', 400, 20)).toBe('甲\n乙');
  });
});

describe('視覺工具', () => {
  it('色碼字串轉為 Phaser 用的數值', () => {
    expect(hexToNumber('#7fdba0')).toBe(0x7fdba0);
    expect(hexToNumber('7fdba0')).toBe(0x7fdba0);
  });

  it('金幣以千分位顯示', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('按鈕熱區不小於 44×44 px（TECH_SPEC 第 6 節）', () => {
    expect(MIN_TOUCH_SIZE).toBeGreaterThanOrEqual(44);
  });
});
