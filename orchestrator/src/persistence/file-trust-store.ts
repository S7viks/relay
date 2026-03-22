import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TrustRecord } from "../domain/trust.js";
import type { TrustRepository } from "./contracts.js";

interface Snapshot {
  records: TrustRecord[];
}

/**
 * JSON file-backed trust store for durability (swap for Postgres without touching orchestration).
 */
export class FileTrustRepository implements TrustRepository {
  constructor(private readonly filePath: string) {}

  private async load(): Promise<Map<string, TrustRecord>> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const snap = JSON.parse(raw) as Snapshot;
      const m = new Map<string, TrustRecord>();
      for (const r of snap.records ?? []) {
        m.set(`${r.modelId}::${r.domain}`, r);
      }
      return m;
    } catch {
      return new Map();
    }
  }

  private async save(m: Map<string, TrustRecord>): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const snap: Snapshot = { records: [...m.values()] };
    await writeFile(this.filePath, JSON.stringify(snap, null, 2), "utf8");
  }

  async getTrust(modelId: string, domain: string): Promise<TrustRecord | null> {
    const m = await this.load();
    return m.get(`${modelId}::${domain}`) ?? null;
  }

  async upsertTrust(record: TrustRecord): Promise<void> {
    const m = await this.load();
    m.set(`${record.modelId}::${record.domain}`, record);
    await this.save(m);
  }

  async listByDomain(domain: string): Promise<TrustRecord[]> {
    const m = await this.load();
    return [...m.values()].filter((r) => r.domain === domain);
  }
}
