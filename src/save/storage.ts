/**
 * 存檔的儲存抽象層（TECH_SPEC 第 4.3 / 9.2 節）。
 *
 * 上層程式碼一律走這裡，不直接碰 localStorage。日後換成 Capacitor Preferences
 * 或伺服器 API 時只需替換本檔。
 */
export interface Storage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/** 無 localStorage 時（node 測試、瀏覽器隱私模式）的後備，資料只存活於本次執行。 */
export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    read: (key) => map.get(key) ?? null,
    write: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}

/**
 * 這台裝置**存不存得住東西**。
 *
 * 原本 write 只是把例外吞掉（配額用盡、Safari 私密模式），而那個取捨的
 * 上半段是對的——存檔失敗不該把遊戲打斷。但它沒有下半段：玩家會一路玩下去，
 * 重新整理才發現進度全沒了，而且畫面上一個字都沒說。
 *
 * 所以改成「吞掉例外，但記下來」，讓畫面有東西可以講。
 */
let storageBroken = false;

/** 這台裝置的進度會不會在關掉分頁之後消失。畫面要據此警告玩家。 */
export function storageUnavailable(): boolean {
  return storageBroken;
}

/**
 * 探一次：真的寫得進去、讀得回來、刪得掉嗎。
 *
 * 不能只看 `localStorage` 存不存在——私密模式下它存在，setItem 才丟例外。
 * 也不能只看 setItem 沒丟例外：有些環境會安靜地不存。所以要走完一圈。
 */
function usable(source: globalThis.Storage): boolean {
  const probe = '__xianxia_probe__';
  try {
    source.setItem(probe, '1');
    const back = source.getItem(probe);
    source.removeItem(probe);
    return back === '1';
  } catch {
    return false;
  }
}

function createLocalStorage(source: globalThis.Storage): Storage {
  return {
    read(key) {
      try {
        return source.getItem(key);
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        source.setItem(key, value);
      } catch {
        // 配額用盡或隱私模式：不讓存檔失敗把遊戲打斷，但要記下來——
        // 開場探測過關、玩到一半才被配額擋住，走的是這一條。
        storageBroken = true;
      }
    },
    remove(key) {
      try {
        source.removeItem(key);
      } catch {
        // 同上。
      }
    },
  };
}

/**
 * 依執行環境挑選實作。
 *
 * 探測只做一次並把結論記下來——這個函式每次存檔、每次讀檔都會被呼叫，
 * 每次都寫一輪探測鍵太浪費。快取的是**結論**不是實例：測試靠
 * 「每次拿到一個乾淨的記憶體儲存」來互相隔離。
 */
let localUsable: boolean | null = null;

export function defaultStorage(): Storage {
  const candidate = typeof globalThis === 'undefined' ? undefined : globalThis.localStorage;
  // 沒有 localStorage 的環境（node 測試）不算「壞掉」，那是預期之內的。
  if (candidate === undefined || candidate === null) return createMemoryStorage();
  if (localUsable === null) {
    localUsable = usable(candidate);
    // **私密模式與配額用盡走這一條。** 退回記憶體儲存，讓這一次遊玩正常進行，
    // 但把旗標立起來——畫面要講出「這個瀏覽器不會保存進度」，
    // 否則玩家會在重新整理之後才發現，而那時候已經來不及了。
    if (!localUsable) storageBroken = true;
  }
  return localUsable ? createLocalStorage(candidate) : createMemoryStorage();
}
