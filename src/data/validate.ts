/**
 * data/*.json 的 runtime 驗證（TECH_SPEC 第 3 節）。
 *
 * 規格提案使用 zod，此處改為手寫驗證器：目前只有六個資料檔、結構單純，
 * 為此多裝一個 runtime 相依沒有效益。驗證強度維持規格要求——
 * 格式錯誤在載入階段就 throw，不會等到遊戲跑到該筆資料才崩潰。
 */

export class DataError extends Error {
  constructor(path: string, message: string) {
    super(`資料格式錯誤 ${path}：${message}`);
    this.name = 'DataError';
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DataError(path, '應為物件');
  }
  return value as Record<string, unknown>;
}

export function num(source: unknown, key: string, path: string): number {
  const value = asRecord(source, path)[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DataError(`${path}.${key}`, '應為有限數字');
  }
  return value;
}

export function str(source: unknown, key: string, path: string): string {
  const value = asRecord(source, path)[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new DataError(`${path}.${key}`, '應為非空字串');
  }
  return value;
}

export function bool(source: unknown, key: string, path: string): boolean {
  const value = asRecord(source, path)[key];
  if (typeof value !== 'boolean') {
    throw new DataError(`${path}.${key}`, '應為布林值');
  }
  return value;
}

/**
 * 選填的數字欄位。
 *
 * 給符籙特效用：二十張符各自只用到一兩種特效，若每一張都要把十幾個欄位補零，
 * 資料檔會被雜訊淹沒，真正生效的那一項反而看不出來。
 * 缺欄位時回傳 fallback，但欄位存在卻不是數字仍然報錯——省略是允許的，寫錯不是。
 */
export function optNum(source: unknown, key: string, path: string, fallback: number): number {
  const value = asRecord(source, path)[key];
  if (value === undefined) return fallback;
  return num(source, key, path);
}

export function optBool(source: unknown, key: string, path: string, fallback: boolean): boolean {
  const value = asRecord(source, path)[key];
  if (value === undefined) return fallback;
  return bool(source, key, path);
}

/** 只允許出現在白名單裡的鍵。打錯特效名稱時要當場報錯，不能默默失效。 */
export function assertKnownKeys(source: unknown, path: string, allowed: readonly string[]): void {
  for (const key of Object.keys(asRecord(source, path))) {
    if (!allowed.includes(key)) {
      throw new DataError(`${path}.${key}`, `不認得的欄位（可用：${allowed.join(' / ')}）`);
    }
  }
}

export function oneOf<T extends string>(
  source: unknown,
  key: string,
  path: string,
  allowed: readonly T[],
): T {
  const value = str(source, key, path);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new DataError(`${path}.${key}`, `應為 ${allowed.join(' / ')} 之一，收到 ${value}`);
  }
  return value as T;
}

/** 取出欄位但不限制型別，交由呼叫端（例如 list）自行驗證。 */
export function field(source: unknown, key: string, path: string): unknown {
  const value = asRecord(source, path)[key];
  if (value === undefined) throw new DataError(`${path}.${key}`, '缺少欄位');
  return value;
}

export function obj(source: unknown, key: string, path: string): unknown {
  const value = asRecord(source, path)[key];
  if (value === undefined) throw new DataError(`${path}.${key}`, '缺少欄位');
  return asRecord(value, `${path}.${key}`);
}

/** 驗證為陣列並逐項套用 mapper，index 會帶進錯誤訊息。 */
export function list<T>(value: unknown, path: string, mapper: (item: unknown, itemPath: string) => T): T[] {
  if (!Array.isArray(value)) throw new DataError(path, '應為陣列');
  if (value.length === 0) throw new DataError(path, '不得為空陣列');
  return value.map((item, index) => mapper(item, `${path}[${index}]`));
}

/** 檢查 id 欄位不重複。資料表以 id 索引，重複會造成靜默覆蓋。 */
export function assertUniqueIds(items: readonly { id: string }[], path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new DataError(path, `id 重複：${item.id}`);
    seen.add(item.id);
  }
}
