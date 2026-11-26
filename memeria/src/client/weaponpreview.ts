// Vista previa 3D de un arma en la tienda: gira sobre un fondo oscuro para que el brillo y los
// efectos se luzcan. Un solo renderer chico, que corre solo mientras la tienda está abierta.
import * as THREE from 'three';
import type { WeaponLook } from '../shared/types';
import { buildWeapon, FAMILY, type Weapon } from './weapons';

export class WeaponPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  private readonly spin = new THREE.Group();
  private readonly glow = new THREE.PointLight(0xffffff, 0, 12);
  private weapon: Weapon | null = null;
  private raf = 0;
  private t0 = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene.background = new THREE.Color(0x120e24);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x443366, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0cf, 1.2);
    sun.position.set(2, 4, 4);
    this.scene.add(sun, this.glow, this.spin);
    // Pedestal: un disco tenue para que el arma no flote en la nada.
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.04, 16), new THREE.MeshBasicMaterial({ color: 0x2a2150 }));
    disc.position.y = -1.7;
    this.scene.add(disc);
  }

  /** Muestra el arma de esa clase con ese aspecto, centrada y de pie. */
  show(classId: string, look: WeaponLook): void {
    if (this.weapon) this.spin.remove(this.weapon.group);
    const w = buildWeapon(classId, look);
    w.tick(0);
    const family = FAMILY[classId];
    // Espadas y dagas se modelan con la hoja hacia abajo (como en la mano): se las da vuelta.
    const pivot = new THREE.Group();
    if (family === 'sword' || family === 'dagger') pivot.rotation.z = Math.PI;
    pivot.add(w.group);
    const box = new THREE.Box3().setFromObject(pivot);
    const c = box.getCenter(new THREE.Vector3());
    w.group.position.sub(pivot.worldToLocal(c.clone()));
    // Se agrega envuelto para que el giro sea sobre el centro del arma.
    this.weapon = { group: pivot, tick: w.tick };
    this.spin.add(pivot);
    const size = Math.max(box.getSize(new THREE.Vector3()).y, 2);
    this.camera.position.set(0, 0, (size / 2 / Math.tan((this.camera.fov * Math.PI) / 360)) * 1.0 + 1);
    this.glow.color.set(look.glow ?? look.trim);
    this.glow.intensity = look.glow ? 18 : 0;
    this.glow.position.set(1.4, 0.6, 2.2);
  }

  start(): void {
    if (this.raf) return;
    this.t0 = performance.now();
    const loop = (now: number): void => {
      const t = (now - this.t0) / 1000;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (this.canvas.width !== w * this.renderer.getPixelRatio() || this.canvas.height !== h * this.renderer.getPixelRatio()) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
      }
      this.spin.rotation.y = t * 0.9;
      this.weapon?.tick(t);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
