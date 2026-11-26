import * as THREE from 'three';
import { AssetCache, type CacheStats } from './cache';
import { parseManifest, type ZoneManifest, type WorldIndex } from './manifest';

// Streaming por zonas. Una zona = una región del mundo jugable.
//  - Zona actual: la que contiene al jugador. Siempre cargada.
//  - Vecinas: definidas en el manifiesto de la zona actual. Se precargan.
//  - Lo demás se descarga (sus assets vuelven a la caché, que los libera con LRU).
// El origen de los datos es una URL base; hoy es el servidor de Vite (public/), mañana un CDN.

export interface StreamerState {
  current: string | null;
  loaded: string[];
  pending: string[];
  cache: CacheStats;
}

interface LoadedZone {
  group: THREE.Group;
  urls: string[];
}

export interface StreamerOptions {
  parent: THREE.Object3D;
  cache: AssetCache;
  baseUrl: string;
  /** Devuelve el id de zona donde está el punto (x, z), o undefined. */
  zoneAt: (x: number, z: number) => string | undefined;
}

export class ZoneStreamer {
  private readonly loaded = new Map<string, LoadedZone>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly manifests = new Map<string, Promise<ZoneManifest>>();
  private current: string | null = null;
  private neighborsOfCurrent: string[] = [];
  private errors: string[] = [];

  constructor(private readonly opts: StreamerOptions) {}

  /** Llamar cada frame (o cada tick) con la posición del jugador. Barato si no cambia de zona. */
  update(x: number, z: number): void {
    const zone = this.opts.zoneAt(x, z) ?? null;
    if (zone !== this.current) {
      this.current = zone;
      this.onZoneChanged();
    }
    if (!this.current) return;
    const desired = new Set<string>([this.current, ...this.neighborsOfCurrent]);
    for (const id of desired) {
      if (!this.loaded.has(id) && !this.loading.has(id)) this.startLoad(id);
    }
    for (const id of [...this.loaded.keys()]) {
      if (!desired.has(id)) this.unloadZone(id);
    }
  }

  /** Índice del mundo: lista de zonas conocidas. */
  async loadWorldIndex(): Promise<WorldIndex> {
    const res = await fetch(`${this.opts.baseUrl}/assets/world/index.json`);
    if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
    return (await res.json()) as WorldIndex;
  }

  state(): StreamerState {
    return {
      current: this.current,
      loaded: [...this.loaded.keys()].sort(),
      pending: [...this.loading.keys()].sort(),
      cache: this.opts.cache.stats(),
    };
  }

  errorsSeen(): string[] {
    return this.errors.slice();
  }

  private onZoneChanged(): void {
    if (!this.current) {
      this.neighborsOfCurrent = [];
      return;
    }
    // Los vecinos se conocen cuando llega el manifiesto de la zona actual.
    this.fetchManifest(this.current).then((m) => {
      this.neighborsOfCurrent = m.neighbors;
    }).catch((e: unknown) => this.recordError(this.current!, e));
  }

  private fetchManifest(zone: string): Promise<ZoneManifest> {
    let p = this.manifests.get(zone);
    if (!p) {
      p = fetch(`${this.opts.baseUrl}/assets/world/zones/${zone}/manifest.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`manifest ${zone}: HTTP ${res.status}`);
          return res.json();
        })
        .then((raw) => parseManifest(raw, zone));
      this.manifests.set(zone, p);
    }
    return p;
  }

  private startLoad(zone: string): void {
    const p = this.loadZone(zone)
      .catch((e: unknown) => this.recordError(zone, e))
      .finally(() => this.loading.delete(zone));
    this.loading.set(zone, p);
  }

  private async loadZone(zone: string): Promise<void> {
    const manifest = await this.fetchManifest(zone);
    const group = new THREE.Group();
    group.name = `zone:${zone}`;
    const urls = manifest.assets.map((a) => a.url);
    const gltfs = await Promise.all(urls.map((u) => this.opts.cache.acquire(u)));
    const byId = new Map(manifest.assets.map((a, i) => [a.id, gltfs[i]] as const));

    // Si el jugador se alejó mientras cargaba, soltar lo que pedimos y no montar nada.
    if (this.shouldAbort(zone)) {
      for (const u of urls) this.opts.cache.release(u);
      return;
    }

    for (const p of manifest.placements) {
      const gltf = byId.get(p.asset);
      if (!gltf) continue;
      const inst = gltf.scene.clone(true);
      inst.position.set(p.position[0], p.position[1], p.position[2]);
      inst.rotation.y = p.rotationY ?? 0;
      group.add(inst);
    }
    this.opts.parent.add(group);
    this.loaded.set(zone, { group, urls });
  }

  private shouldAbort(zone: string): boolean {
    return !(this.current === zone || this.neighborsOfCurrent.includes(zone));
  }

  private unloadZone(zone: string): void {
    const z = this.loaded.get(zone);
    if (!z) return;
    this.opts.parent.remove(z.group);
    // Las instancias comparten geometría y material con la plantilla: no se disponen aquí,
    // solo se sueltan referencias. La caché decide cuándo liberar la plantilla.
    z.group.clear();
    for (const u of z.urls) this.opts.cache.release(u);
    this.loaded.delete(zone);
  }

  private recordError(zone: string, e: unknown): void {
    const msg = `[streaming] ${zone}: ${e instanceof Error ? e.message : String(e)}`;
    this.errors.push(msg);
    console.warn(msg);
  }
}
