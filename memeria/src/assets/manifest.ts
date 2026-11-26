// Formato de manifiesto por zona. Conceptualmente:
//   { zone, version, neighbors, assets, placements }
// Es dato puro (sin Three.js) para poder leerlo también desde el servidor o desde
// una herramienta de importación. Los assets se referencian por id; la URL es la
// que el cliente descarga, y el id es lo que deduplica entre zonas.

export interface AssetEntry {
  id: string;
  url: string;
  bytes?: number;
}

export interface Placement {
  asset: string;
  position: [number, number, number];
  rotationY?: number;
}

export interface ZoneManifest {
  zone: string;
  version: string;
  neighbors: string[];
  assets: AssetEntry[];
  placements: Placement[];
}

export interface WorldIndex {
  world: string;
  version: string;
  zones: string[];
}

/** Valida la forma mínima del manifiesto. Lanza con un mensaje claro si algo falta. */
export function parseManifest(raw: unknown, expectedZone: string): ZoneManifest {
  const m = raw as Partial<ZoneManifest> | null;
  if (!m || typeof m !== 'object') throw new Error(`manifest de ${expectedZone}: no es un objeto`);
  if (m.zone !== expectedZone) throw new Error(`manifest de ${expectedZone}: dice zone="${m.zone}"`);
  if (!Array.isArray(m.assets) || !Array.isArray(m.placements) || !Array.isArray(m.neighbors)) {
    throw new Error(`manifest de ${expectedZone}: faltan assets/placements/neighbors`);
  }
  const ids = new Set<string>();
  for (const a of m.assets) {
    if (!a.id || !a.url) throw new Error(`manifest de ${expectedZone}: asset sin id o url`);
    ids.add(a.id);
  }
  for (const p of m.placements) {
    if (!ids.has(p.asset)) throw new Error(`manifest de ${expectedZone}: placement usa asset desconocido "${p.asset}"`);
  }
  return m as ZoneManifest;
}
