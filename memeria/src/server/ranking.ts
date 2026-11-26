// Ranking semanal de Memeria: kills por héroe y por mascota (la «guerra de bandos»). Los kills los cuenta el
// servidor (salen de las muertes que él mismo arbitra); el nivel y el nombre los informa el cliente, así que el
// nivel es decorativo y la identidad (`key`) todavía no está verificada con firma de wallet.
export interface RankEntry {
  /** Nombre que se muestra. */
  n: string;
  /** Mascota (id de clase). */
  c: string;
  /** Kills en la semana. */
  k: number;
  /** Nivel informado por el cliente. */
  l: number;
}

export interface RankStore {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(keys: string[]): Promise<number>;
  list(options: { prefix: string }): Promise<Map<string, unknown>>;
}

const MAX_ENTRIES = 1500;

/** Semana ISO en UTC («2026-W44»); cambia los lunes a las 00:00 UTC. */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const year = d.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export class Ranking {
  private week = '';
  private entries: Record<string, RankEntry> = {};
  private dirty = false;

  constructor(private readonly store: RankStore) {}

  /** Carga la semana en curso; si cambió la semana, arranca de cero y borra las viejas (se conserva la anterior). */
  async sync(now: number): Promise<void> {
    const wk = weekKey(now);
    if (wk === this.week) return;
    await this.flush();
    this.week = wk;
    this.entries = (await this.store.get<Record<string, RankEntry>>(`lb:${wk}`)) ?? {};
    const prev = weekKey(now - 7 * 86400000);
    const old = [...(await this.store.list({ prefix: 'lb:' })).keys()].filter((k) => k !== `lb:${wk}` && k !== `lb:${prev}`);
    if (old.length) await this.store.delete(old);
  }

  addKill(key: string, name: string, cls: string, level: number): void {
    let e = this.entries[key];
    if (!e) {
      if (Object.keys(this.entries).length >= MAX_ENTRIES) this.evictLowest();
      e = this.entries[key] = { n: name, c: cls, k: 0, l: 1 };
    }
    e.k++;
    e.n = name;
    e.c = cls;
    e.l = level;
    this.dirty = true;
  }

  async flush(): Promise<void> {
    if (!this.dirty || !this.week) return;
    this.dirty = false;
    await this.store.put(`lb:${this.week}`, this.entries);
  }

  top(n: number): RankEntry[] {
    return this.sorted().slice(0, n).map(([, e]) => e);
  }

  /** Puesto (1 = primero) y kills de un héroe, o null si todavía no mató nada esta semana. */
  rankOf(key: string): { rank: number; k: number } | null {
    const i = this.sorted().findIndex(([k]) => k === key);
    return i < 0 ? null : { rank: i + 1, k: this.entries[key].k };
  }

  /** Kills de la semana sumados por mascota. */
  factions(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of Object.values(this.entries)) out[e.c] = (out[e.c] ?? 0) + e.k;
    return out;
  }

  get label(): string {
    return this.week;
  }

  private sorted(): [string, RankEntry][] {
    return Object.entries(this.entries).sort((a, b) => b[1].k - a[1].k || b[1].l - a[1].l);
  }

  private evictLowest(): void {
    const low = this.sorted().at(-1);
    if (low) delete this.entries[low[0]];
  }
}
