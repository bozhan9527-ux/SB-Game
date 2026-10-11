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

// 帶一點藍紫的深色，和像素夜空背景同一個色系。
export const BG_DEEP = 0x0f1328;
export const BG_PANEL = 0x181d38;
export const BG_PANEL_ALT = 0x232a52;
export const LINE = 0x3a427a;

/** 像素描邊：所有面板、按鈕、符牌的最外圈。 */
export const EDGE = 0x12141c;

/** 觸控熱區下限（TECH_SPEC 第 6 節）。 */
export const MIN_TOUCH_SIZE = 44;

/** 點陣字型的 family 名稱，由 main.ts 在開遊戲前載入。 */
export const PIXEL_FONT = 'Cubic11';

export const FONT = `"${PIXEL_FONT}", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;

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
    // 點陣字沒有粗體字重，硬加粗是把每一筆抹寬一點，像素邊就糊了。
    // bold 參數保留給呼叫端表達意圖，畫面上靠字級與顏色區分。
    fontStyle: 'normal',
  };
}

/**
 * 點陣字「俐方體 11 號」的字寬（字級的倍數），在瀏覽器裡實測：全形字與全形標點是 13/12，
 * 半形約 0.52（取 0.55 留一點餘裕）。原本以全形 = 1 估算，每 12 個字就多出近一字寬，
 * 長句會超出面板右框。
 */
export const FULL_WIDTH_EM = 13 / 12;

/** 不放在行首的標點（中文排版的「避頭」）。 */
const NO_LINE_START = /[，。、：；！？）」』》〉,.!?:;)]/;
const HALF_WIDTH_EM = 0.55;

/** 半形裡比較寬的那幾類：大寫字母與 % + × 這類符號實測約 0.67，不是 0.55。 */
const WIDE_HALF_EM = 0.67;

function charWidth(char: string): number {
  // 破折號、刪節號、箭頭、圈號在這套點陣字裡是全形寬——原本當半形算，
  // 「——」一多，整行就溢出畫面右緣（結算頁的失敗診斷就這樣被切掉半句）。
  if (/[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f\u2014\u2015\u2026\u2190-\u21ff\u2460-\u24ff]/.test(char)) {
    return FULL_WIDTH_EM;
  }
  return /[A-Z%+×#&=@]/.test(char) ? WIDE_HALF_EM : HALF_WIDTH_EM;
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

  const minTail = Math.max(4, Math.floor(limit / FULL_WIDTH_EM / 4));

  for (const paragraph of text.split('\n')) {
    let line = '';
    const start = lines.length;
    /** 這一行是被整塊移下來的短詞塊開頭的，和上一行之間原本隔著一個空白。 */
    let spaced = false;
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
      // 短詞塊（「×0.95」「+25%」）整塊移到下一行，不從中間拆；
      // 長詞塊是一整句中文，接在這一行後面逐字填滿再斷——先換行再填的話，
      // 「…11 階（上限」這一行會只寫了一半，括號也被拆到兩行。
      const long = textWidthInEm(token) > limit * 0.4;
      let chunk = long && line.length > 0 ? `${line} ` : '';
      if (!long || line.length === 0) {
        spaced = line.length > 0;
        flush();
      } else {
        line = '';
        spaced = false;
      }
      let broke = false;
      for (const char of token) {
        if (textWidthInEm(chunk + char) > limit) {
          // 避頭：標點不放行首，把上一行最後一個字一起帶下來。
          if (NO_LINE_START.test(char) && [...chunk].length > 4) {
            const chars = [...chunk];
            lines.push(chars.slice(0, -1).join(''));
            chunk = chars[chars.length - 1] ?? '';
          } else {
            lines.push(chunk);
            chunk = '';
          }
          broke = true;
        }
        chunk += char;
      }
      // 孤行：段落最後一行只掛兩三個字很難看，從上一行借字，補到一行可容納字數的四分之一（至少四個）。
      const tail = [...chunk];
      const prev = [...(lines[lines.length - 1] ?? '')];
      const need = minTail - tail.length;
      if (broke && need > 0 && prev.length - need >= minTail) {
        lines[lines.length - 1] = prev.slice(0, -need).join('');
        chunk = prev.slice(-need).join('') + chunk;
      }
      line = chunk;
      if (broke) spaced = false;
    }
    // 短詞塊整塊換行也會變孤行（「+25%」自己一行）：從上一行尾巴借中文字下來。
    // 這裡只補到四個字寬：借太多會把詞拆開（「天｜雷符傷害 +25%」）。
    const tokenTail = 4;
    if (spaced && lines.length > start && textWidthInEm(line) < tokenTail) {
      const prev = [...(lines[lines.length - 1] ?? '')];
      let borrowed = '';
      while (
        prev.length > minTail &&
        prev[prev.length - 1] !== ' ' &&
        (textWidthInEm(borrowed + ' ' + line) < tokenTail ||
          NO_LINE_START.test(borrowed.charAt(0)))
      ) {
        borrowed = (prev.pop() ?? '') + borrowed;
      }
      if (borrowed.length > 0 && textWidthInEm(`${borrowed} ${line}`) <= limit) {
        lines[lines.length - 1] = prev.join('');
        line = `${borrowed} ${line}`;
      }
    }
    flush();
  }

  return lines.join('\n');
}

/** 文字超出指定寬度時等比縮小，避免長數字撐破面板。 */
export function fitText(text: Phaser.GameObjects.Text, maxWidth: number): void {
  if (text.width > maxWidth) {
    text.setScale(maxWidth / text.width);
    // 開發用：縮超過一成五的記下來，好找出「縮到看不清」的地方（正式版剔除）。
    if (import.meta.env.DEV && maxWidth / text.width < 0.97) {
      const log = ((globalThis as { __shrunk?: string[] }).__shrunk ??= []);
      log.push(`${Math.round((maxWidth / text.width) * 100)}% ${text.text.replace(/\n/g, '⏎')}`);
    }
  }
}

/**
 * 超出寬度就從尾巴截掉、補「…」，字級不動。
 *
 * 和 fitText 的差別：fitText 等比縮小，對一行固定的標籤沒問題；但別人取的名字可以長到
 * 十六個字，縮到塞得下時已經小到讀不出來——名字讀不出來比少看幾個字糟。
 */
export function truncateText(text: Phaser.GameObjects.Text, maxWidth: number): void {
  text.setScale(1);
  if (text.width <= maxWidth) return;
  const chars = [...text.text];
  while (chars.length > 1) {
    chars.pop();
    text.setText(`${chars.join('')}…`);
    if (text.width <= maxWidth) return;
  }
}

/** 千分位顯示，四位數以上的金幣才讀得出來。 */
export function formatNumber(value: number): string {
  const rounded = Math.round(value);
  // 一億以上改用中文大數單位：後期的輸出與金幣動輒十幾位數，
  // 「5,495,547,439,434」塞不進狀態列，只能被縮到看不清；「5.50兆」一眼就讀得出量級。
  const units: [number, string][] = [[1e16, '京'], [1e12, '兆'], [1e8, '億']];
  for (const [base, unit] of units) {
    if (Math.abs(rounded) >= base) {
      const scaled = rounded / base;
      const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      return `${scaled.toFixed(digits)}${unit}`;
    }
  }
  return rounded.toLocaleString('en-US');
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
