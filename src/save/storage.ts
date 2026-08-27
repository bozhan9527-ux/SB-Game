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
        // 配額用盡或隱私模式：不讓存檔失敗把遊戲打斷。
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

/** 依執行環境挑選實作。 */
export function defaultStorage(): Storage {
  const candidate = typeof globalThis === 'undefined' ? undefined : globalThis.localStorage;
  return candidate === undefined || candidate === null
    ? createMemoryStorage()
    : createLocalStorage(candidate);
}
