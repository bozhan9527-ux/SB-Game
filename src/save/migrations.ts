/**
 * 存檔遷移（TECH_SPEC 第 4.2 節）。
 *
 * 規則：存檔結構一有變更就把 SAVE_VERSION +1，並在此陣列尾端追加一支遷移函式，
 * 索引 i 的函式負責 v(i+1) → v(i+2)。禁止改結構而不寫遷移。
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** 目前只有 v1，尚無遷移。新增時往後 push，不得插隊或修改既有項目。 */
export const MIGRATIONS: readonly Migration[] = [];

/**
 * 把任意版本的存檔套用至最新版。
 * 版本高於目前程式（玩家降版）時原樣回傳，交由上層決定是否放棄該存檔。
 */
export function migrate(data: Record<string, unknown>, targetVersion: number): Record<string, unknown> {
  let current = data;
  let version = typeof current['version'] === 'number' ? (current['version'] as number) : 1;

  while (version < targetVersion) {
    const migration = MIGRATIONS[version - 1];
    if (migration === undefined) break;
    current = migration(current);
    version += 1;
    current['version'] = version;
  }
  return current;
}
