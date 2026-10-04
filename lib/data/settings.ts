export interface SettingRow {
  key: string;
  value: unknown;
}

export interface SettingRepo {
  find(key: string): Promise<SettingRow | null>;
  findMany(keys: string[]): Promise<SettingRow[]>;
  /** `updatedById` is null for a seed or script. */
  upsert(key: string, value: unknown, updatedById: string | null): Promise<void>;
}
