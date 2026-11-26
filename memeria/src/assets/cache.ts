import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Caché de assets GLB con:
//  - deduplicación: una URL se descarga una sola vez aunque la pidan varias zonas;
//  - conteo de referencias: un asset se libera cuando ninguna zona cargada lo usa;
//  - LRU de "inactivos": al liberarse, el asset queda en memoria hasta MAX_IDLE para
//    que volver a entrar en la zona no vuelva a descargarlo.

const MAX_IDLE = 4;

interface Entry {
  url: string;
  promise: Promise<GLTF>;
  refs: number;
  gltf: GLTF | null;
}

export interface CacheStats {
  fetches: number;
  dedupedRequests: number;
  disposed: number;
  idle: number;
  active: number;
}

export class AssetCache {
  private readonly loader = new GLTFLoader();
  private readonly entries = new Map<string, Entry>();
  // Orden de inactivos: el primero es el más antiguo (se descarta primero).
  private readonly idle: string[] = [];
  private readonly counters = { fetches: 0, dedupedRequests: 0, disposed: 0 };

  /** Obtiene el asset y suma una referencia. Dos pedidos de la misma URL comparten la descarga. */
  acquire(url: string): Promise<GLTF> {
    const existing = this.entries.get(url);
    if (existing) {
      this.counters.dedupedRequests++;
      existing.refs++;
      this.removeFromIdle(url);
      return existing.promise;
    }
    this.counters.fetches++;
    const entry: Entry = {
      url,
      refs: 1,
      gltf: null,
      promise: this.loader.loadAsync(url).then((g) => {
        // Si la entrada se descartó mientras descargaba, no dejar memoria sin dueño.
        if (this.entries.get(url) !== entry) disposeTree(g.scene);
        else entry.gltf = g;
        return g;
      }),
    };
    this.entries.set(url, entry);
    return entry.promise;
  }

  /** Quita una referencia. Si llega a cero, el asset pasa a inactivos (no se borra todavía). */
  release(url: string): void {
    const entry = this.entries.get(url);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0) return;
    this.idle.push(url);
    while (this.idle.length > MAX_IDLE) {
      const victim = this.idle.shift()!;
      this.drop(victim);
    }
  }

  /** Acceso al GLTF ya descargado (sin contar referencia). Undefined si no está listo. */
  peek(url: string): GLTF | undefined {
    return this.entries.get(url)?.gltf ?? undefined;
  }

  stats(): CacheStats {
    let active = 0;
    for (const e of this.entries.values()) if (e.refs > 0) active++;
    return { ...this.counters, idle: this.idle.length, active };
  }

  private removeFromIdle(url: string): void {
    const i = this.idle.indexOf(url);
    if (i >= 0) this.idle.splice(i, 1);
  }

  private drop(url: string): void {
    const entry = this.entries.get(url);
    if (!entry) return;
    this.entries.delete(url);
    this.counters.disposed++;
    if (entry.gltf) disposeTree(entry.gltf.scene);
  }
}

/** Libera geometrías, materiales y texturas de un árbol de objetos. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      m.dispose();
    }
  });
}
