/**
 * 128 合 1 平台橋接。
 *
 * `arcade128.js` 是平台提供的原檔（不要改它），這裡只負責：判斷是不是被平台框架嵌著、
 * 找出平台的來源網域、建立橋接，並包成遊戲用得到的三件事——接關付費、回報結束。
 *
 * 不在平台裡（直接開 github.io、本機開發）時什麼都不做，`available()` 回 false，
 * 遊戲照舊：失守就直接結算，不會出現接關。
 */
import "./arcade128.js";

export interface PurchaseResult {
  ok: boolean;
  reason?: string;
  [key: string]: unknown;
}

interface Arcade128Bridge {
  purchase(item: string): Promise<PurchaseResult>;
  gameOver(): void;
  destroy(): void;
}

type Arcade128Ctor = new (options: {
  platformOrigin: string;
  onState?: (data: Record<string, unknown>) => void;
}) => Arcade128Bridge;

/** 接關在平台後台的商品代號。 */
export const CONTINUE_ITEM = "continue";

let bridge: Arcade128Bridge | null = null;
let lastState: Record<string, unknown> | null = null;

/**
 * 平台的來源網域。順序：網址參數 `?platform=`（平台可以自己帶）→ 瀏覽器提供的上層框架來源
 * → referrer。不在框架裡就是 null。
 */
function platformOrigin(): string | null {
  if (window.parent === window) return null;
  const candidates = [
    new URLSearchParams(location.search).get("platform"),
    location.ancestorOrigins?.[0],
    document.referrer,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // 格式不對就試下一個
    }
  }
  return null;
}

/** 在建立遊戲前呼叫一次。 */
export function initPlatform(): void {
  if (bridge !== null) return;
  const origin = platformOrigin();
  const Ctor = (window as unknown as { Arcade128?: Arcade128Ctor }).Arcade128;
  if (origin === null || Ctor === undefined) return;
  try {
    bridge = new Ctor({
      platformOrigin: origin,
      onState: (data) => {
        lastState = data;
      },
    });
  } catch {
    bridge = null;
  }
}

export const platform = {
  /** 是否在 128 平台裡（可以接關付費）。 */
  available(): boolean {
    return bridge !== null;
  },
  /** 平台最近一次送來的狀態（除錯用）。 */
  state(): Record<string, unknown> | null {
    return lastState;
  },
  /** 向平台買一次接關。平台回 ok 才算數；取消、逾時、不在平台都回 ok:false。 */
  purchaseContinue(): Promise<PurchaseResult> {
    if (bridge === null) return Promise.resolve({ ok: false, reason: "unavailable" });
    return bridge.purchase(CONTINUE_ITEM).catch(() => ({ ok: false, reason: "error" }));
  },
  /** 這一場確定結束（失守不接、放棄、逾時）。 */
  gameOver(): void {
    bridge?.gameOver();
  },
};
