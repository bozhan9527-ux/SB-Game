import { describe, it, expect } from 'vitest';
import { FULL_WIDTH_EM, MIN_TOUCH_SIZE, formatNumber, hexToNumber, wrapText } from '../src/ui/theme';

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

  it('以點陣字的實際字寬換行：全形字一個佔 13/12 字級，每行不超過指定寬度', () => {
    const text = '按住一張符拖到別的格位放開，或是點一下選起來、再點目標格，兩種都行。';
    const width = 464;
    const size = 16;
    for (const line of wrapText(text, width, size).split('\n')) {
      expect([...line].length * FULL_WIDTH_EM * size).toBeLessThanOrEqual(width);
    }
  });

  it('段落最後一行至少四個字，標點不放行首', () => {
    const text = '按住一張符拖到別的格位放開，或是點一下選起來、再點目標格，兩種都行。';
    for (const width of [200, 260, 320, 464]) {
      const lines = wrapText(text, width, 16).split('\n');
      expect([...(lines[lines.length - 1] ?? '')].length).toBeGreaterThanOrEqual(4);
      for (const line of lines.slice(1)) expect(line).not.toMatch(/^[，。、：]/);
    }
  });

  it('長句接在前一段後面填滿，不會留下半行空白', () => {
    const text = '法寶只合到 11 階（上限 14）——與其鋪滿低階符，不如集中合成同一種';
    const lines = wrapText(text, 488, 19).split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('（上限 14）');
  });

  it('短詞塊整塊換行時不會自己掛一行', () => {
    const text = '【被動】符籙相生：合成有 30% 機率保留一張符；天雷符傷害 +25%';
    const lines = wrapText(text, 452, 14).split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).not.toBe('+25%');
    expect(lines[1]).toBe('傷害 +25%');
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
