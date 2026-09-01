/**
 * 全遊戲共用的視覺常數與小工具。
 *
 * 這裡放的是「呈現」層級的設定（顏色、字級），不是玩法數值，
 * 因此不受 TECH_SPEC 第 3 節「數值不得寫在 src/」的限制。
 */
export const INK = '#e9e2cf';
export const INK_DIM = '#9a917c';
export const GOLD = '#e8c46a';
export const DANGER = '#e0616a';
export const JADE = '#7fdba0';

export const BG_DEEP = 0x0d1116;
export const BG_PANEL = 0x161d24;
export const BG_PANEL_ALT = 0x1e2730;
export const LINE = 0x3a4652;

/** 觸控熱區下限（TECH_SPEC 第 6 節）。 */
export const MIN_TOUCH_SIZE = 44;

export const FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

/** "#7fdba0" → 0x7fdba0，供 Phaser 的幾何圖形使用。 */
export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16) || 0xffffff;
}

export interface TextStyleOptions {
  size: number;
  color?: string;
  bold?: boolean;
}

export function textStyle(options: TextStyleOptions): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${options.size}px`,
    color: options.color ?? INK,
    fontStyle: options.bold === true ? 'bold' : 'normal',
  };
}

/** 全形字約佔一個字級寬，半形約 0.55。 */
function charWidth(char: string): number {
  return /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(char) ? 1 : 0.55;
}

function textWidthInEm(text: string): number {
  let total = 0;
  for (const char of text) total += charWidth(char);
  return total;
}

/**
 * 以估算寬度斷行。
 *
 * Phaser 的 word wrap 只在空白處斷行，中文沒有空白就整段不斷、直接溢出面板。
 * 這裡以空白切成詞塊後貪婪排版，詞塊本身太長（整句中文）才逐字硬斷，
 * 這樣「金幣×1.5」這種帶數字的詞就不會被從中間切開。
 */
export function wrapText(text: string, widthPx: number, fontSize: number): string {
  const limit = Math.max(4, widthPx / fontSize);
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    let line = '';
    const flush = (): void => {
      if (line.length > 0) lines.push(line);
      line = '';
    };

    for (const token of paragraph.split(' ')) {
      if (token.length === 0) continue;
      const candidate = line.length === 0 ? token : `${line} ${token}`;
      if (textWidthInEm(candidate) <= limit) {
        line = candidate;
        continue;
      }
      flush();
      // 單一詞塊就超過一行（整句中文）時逐字硬斷。
      let chunk = '';
      for (const char of token) {
        if (textWidthInEm(chunk + char) > limit) {
          lines.push(chunk);
          chunk = '';
        }
        chunk += char;
      }
      line = chunk;
    }
    flush();
  }

  return lines.join('\n');
}

/** 文字超出指定寬度時等比縮小，避免長數字撐破面板。 */
export function fitText(text: Phaser.GameObjects.Text, maxWidth: number): void {
  if (text.width > maxWidth) text.setScale(maxWidth / text.width);
}

/** 千分位顯示，四位數以上的金幣才讀得出來。 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * 毫秒 → 「2:14」。
 *
 * 秒數是榜單上的分數，所以格式要能讓人一眼比大小：固定兩位的秒、
 * 分鐘不補零。超過一小時的一場寫成 h:mm:ss——那種紀錄不常見，
 * 但寫成「87:03」會被讀成八十七秒。
 */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}
