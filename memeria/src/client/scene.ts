import * as THREE from 'three';
import type { WorldGeometry, ZoneDef } from '../shared/types';
import { Atmosphere } from './atmosphere';
import { addBackdrop, addDecor, addGround, addTrees, buildObstacle, lampGlass, lampGlows, takeTreeOrbs, windowGlass, type Spot } from './scenery';

export interface WorldScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Mueve el sol (o la luna) y su sombra para que sigan al jugador. */
  follow: (x: number, z: number) => void;
  /** Día y noche, cielo y partículas; hay que llamarle update() en cada frame. */
  atmosphere: Atmosphere;
}

// Crea renderer, luces y el mundo estático de la zona (suelo, obstáculos, bordes).
// Todo se construye una vez: nada de esto se recrea por frame.
// Look PS2: se dibuja a una altura fija y baja y el navegador escala el canvas con píxeles duros.
const RENDER_HEIGHT = 360;
const SKY = 0xcfe3ec;

export function createWorldScene(zone: ZoneDef): WorldScene {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.id = 'game';
  document.body.appendChild(renderer.domElement);
  const resize = (): void => {
    const aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(Math.round(RENDER_HEIGHT * aspect), RENDER_HEIGHT, false);
  };
  resize();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  const fog = new THREE.Fog(SKY, 60, 240);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x7a8a50, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -60;
  sc.right = 60;
  sc.top = 60;
  sc.bottom = -60;
  sc.far = 160;
  scene.add(sun);

  addGround(scene, zone.geometry);
  const treeSpots: Spot[] = [];
  for (const c of zone.geometry.colliders) {
    if (c.shape === 'circle' && c.visual === 'tree') treeSpots.push({ x: c.x, z: c.z });
    else scene.add(buildObstacle(c));
  }
  addTrees(scene, treeSpots);
  addDecor(scene, zone.geometry);
  const clouds = addBackdrop(scene, zone.geometry);
  addBoundaryWalls(scene, zone.geometry);
  // El cielo, las luces y las partículas dependen de la hora; se arman al final, con el mundo ya puesto.
  const atmosphere = new Atmosphere({ scene, sun, hemi, fog, clouds, windows: windowGlass(), lamps: lampGlass() });
  atmosphere.addGlows([...takeTreeOrbs(), ...lampGlows()]);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    resize();
  });

  scene.add(sun.target);
  const follow = (x: number, z: number): void => atmosphere.focus(x, z);

  return { renderer, scene, camera, follow, atmosphere };
}

// Muros bajos fuera del mapa: marcan el límite visible. No son colisionables: el
// límite jugable lo impone la geometría (bounds), con el radio del personaje.
function addBoundaryWalls(scene: THREE.Scene, geo: WorldGeometry): void {
  const b = geo.bounds;
  const h = 1.6;
  const t = 1.2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6f6a5e, roughness: 1, flatShading: true });
  const make = (cx: number, cz: number, w: number, d: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(cx, h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  const len = b.maxX - b.minX;
  const depth = b.maxZ - b.minZ;
  make((b.minX + b.maxX) / 2, b.minZ - t / 2, len + t * 2, t);
  make((b.minX + b.maxX) / 2, b.maxZ + t / 2, len + t * 2, t);
  make(b.minX - t / 2, (b.minZ + b.maxZ) / 2, t, depth);
  make(b.maxX + t / 2, (b.minZ + b.maxZ) / 2, t, depth);
}
