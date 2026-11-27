import * as THREE from 'three';
import { rotateHeld, takeDragPitch, takeDragYaw } from './input';

// Radio de la órbita y ángulo de elevación por defecto (los de siempre: 9 m atrás, 3,5 m arriba).
const RADIUS = Math.hypot(9, 3.5);
const DEFAULT_PITCH = Math.atan2(3.5, 9);
const MIN_PITCH = 0.1;
const MAX_PITCH = 1.15;
const MOUSE_SENSITIVITY = 0.005;
const KEY_SPEED = 1.8;

// ?skycam=8 levanta la mirada (para mirar el cielo en capturas y pruebas).
const SKY_LOOK = Number(new URLSearchParams(location.search).get('skycam')) || 0;
const offset = new THREE.Vector3();
const target = new THREE.Vector3();

// Cámara de tercera persona orbital. Solo afecta al render y a la traducción
// de WASD a dirección de mundo: la simulación no conoce la cámara.
export class FollowCamera {
  yaw = 0;
  pitch = DEFAULT_PITCH;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly radius = RADIUS) {}

  update(focusX: number, focusZ: number, dt: number): void {
    this.yaw -= takeDragYaw() * MOUSE_SENSITIVITY;
    this.yaw += rotateHeld() * KEY_SPEED * dt;

    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch + takeDragPitch() * MOUSE_SENSITIVITY));
    const flat = Math.cos(this.pitch) * this.radius;
    offset.set(Math.sin(this.yaw) * flat, Math.sin(this.pitch) * this.radius, Math.cos(this.yaw) * flat);
    target.set(focusX, 1.2 + SKY_LOOK, focusZ);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
  }

  /** Convierte ejes de cámara (adelante/derecha) en dirección de mundo, escribiendo en out. */
  worldDirection(forward: number, side: number, out: { x: number; z: number }): void {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    out.x = -s * forward + c * side;
    out.z = -c * forward - s * side;
  }
}
