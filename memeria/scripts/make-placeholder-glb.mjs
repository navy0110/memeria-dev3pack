// Genera GLB sintéticos (cajas) para probar el pipeline de streaming con assets propios.
// Son geometría propia escrita a mano en formato glTF 2.0 binario.
// Uso: node scripts/make-placeholder-glb.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Una caja centrada en x/z y apoyada en y=0, con normales planas por cara.
function boxGeometry(w, h, d) {
  const hx = w / 2, hz = d / 2;
  const faces = [
    { n: [1, 0, 0], v: [[hx, 0, -hz], [hx, h, -hz], [hx, h, hz], [hx, 0, hz]] },
    { n: [-1, 0, 0], v: [[-hx, 0, hz], [-hx, h, hz], [-hx, h, -hz], [-hx, 0, -hz]] },
    { n: [0, 1, 0], v: [[-hx, h, -hz], [-hx, h, hz], [hx, h, hz], [hx, h, -hz]] },
    { n: [0, -1, 0], v: [[-hx, 0, hz], [-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz]] },
    { n: [0, 0, 1], v: [[-hx, 0, hz], [hx, 0, hz], [hx, h, hz], [-hx, h, hz]] },
    { n: [0, 0, -1], v: [[hx, 0, -hz], [-hx, 0, -hz], [-hx, h, -hz], [hx, h, -hz]] },
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  faces.forEach((f, fi) => {
    for (const p of f.v) {
      positions.push(...p);
      normals.push(...f.n);
    }
    const b = fi * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { positions, normals, indices };
}

function buildGlb({ name, w, h, d, color }) {
  const g = boxGeometry(w, h, d);
  const posBuf = Buffer.from(new Float32Array(g.positions).buffer);
  const nrmBuf = Buffer.from(new Float32Array(g.normals).buffer);
  const idxBuf = Buffer.from(new Uint16Array(g.indices).buffer);
  const bin = Buffer.concat([posBuf, nrmBuf, idxBuf]);
  const minPos = [Math.min(...g.positions.filter((_, i) => i % 3 === 0)), 0, Math.min(...g.positions.filter((_, i) => i % 3 === 2))];
  const maxPos = [Math.max(...g.positions.filter((_, i) => i % 3 === 0)), h, Math.max(...g.positions.filter((_, i) => i % 3 === 2))];
  const vertCount = g.positions.length / 3;

  const json = {
    asset: { version: '2.0', generator: 'meme-rpg placeholder' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: `${name}-mat`, pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertCount, type: 'VEC3', min: minPos, max: maxPos },
      { bufferView: 1, componentType: 5126, count: vertCount, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: g.indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: nrmBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + nrmBuf.length, byteLength: idxBuf.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jpad = (4 - (jsonBuf.length % 4)) % 4;
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
  const bpad = (4 - (bin.length % 4)) % 4;
  const binPadded = Buffer.concat([bin, Buffer.alloc(bpad, 0)]);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length, 0);
  jh.write('JSON', 4, 'ascii');
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binPadded.length, 0);
  bh.write('BIN\0', 4, 'ascii');
  return Buffer.concat([header, jh, jsonBuf, bh, binPadded]);
}

const outputs = [
  { dir: 'public/assets/world/zones/villa', file: 'monolito.glb', name: 'monolito-placeholder', w: 1.2, h: 3.4, d: 1.2, color: [0.6, 0.58, 0.52] },
  { dir: 'public/assets/world/zones/pantano', file: 'obelisco.glb', name: 'obelisco-placeholder', w: 1.0, h: 4.2, d: 1.0, color: [0.3, 0.2, 0.42] },
];

for (const o of outputs) {
  const dir = join(root, o.dir);
  mkdirSync(dir, { recursive: true });
  const glb = buildGlb(o);
  writeFileSync(join(dir, o.file), glb);
  console.log(`${o.dir}/${o.file}  ${glb.length} bytes`);
}
