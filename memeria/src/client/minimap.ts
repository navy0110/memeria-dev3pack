import type { GameState } from '../shared/game';
import type { GroundKind, ZoneDef } from '../shared/types';

const SIZE = 180;
/** A cuántos metros de un jefe de raid aparece marcado en el mapa. */
const RAID_REVEAL = 55;
const GROUND_CSS: Record<GroundKind, string> = {
  grass: 'rgba(61,90,58,0.9)',
  road: 'rgba(107,90,62,0.9)',
  stone: 'rgba(138,128,112,0.9)',
  swamp: 'rgba(43,58,42,0.95)',
};

// Minimapa norte-arriba. El fondo (regiones y obstáculos) se dibuja una vez en un
// canvas auxiliar; cada frame solo se copia y se dibujan las entidades móviles.
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly scale: number;
  private readonly minX: number;
  private readonly minZ: number;

  constructor(canvas: HTMLCanvasElement, zone: ZoneDef) {
    canvas.width = SIZE;
    canvas.height = SIZE;
    this.ctx = canvas.getContext('2d')!;
    const b = zone.geometry.bounds;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.scale = SIZE / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);

    this.base = document.createElement('canvas');
    this.base.width = SIZE;
    this.base.height = SIZE;
    this.drawBase(zone);
  }

  private sx(x: number): number {
    return (x - this.minX) * this.scale;
  }

  private sy(z: number): number {
    return (z - this.minZ) * this.scale;
  }

  private drawBase(zone: ZoneDef): void {
    const g = this.base.getContext('2d')!;
    g.fillStyle = '#0b0d12';
    g.fillRect(0, 0, SIZE, SIZE);
    for (const r of zone.geometry.regions) {
      g.fillStyle = GROUND_CSS[r.ground];
      const x = this.sx(r.bounds.minX);
      const y = this.sy(r.bounds.minZ);
      g.fillRect(x, y, (r.bounds.maxX - r.bounds.minX) * this.scale, (r.bounds.maxZ - r.bounds.minZ) * this.scale);
    }
    for (const c of zone.geometry.colliders) {
      if (c.shape === 'circle') {
        g.fillStyle = c.visual === 'tree' ? '#1f3d24' : '#6b6459';
        g.beginPath();
        g.arc(this.sx(c.x), this.sy(c.z), Math.max(1.5, c.r * this.scale), 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = c.visual === 'inn' ? '#b5603a' : '#d8b878';
        const bx = this.sx(c.minX);
        const by = this.sy(c.minZ);
        const bw = (c.maxX - c.minX) * this.scale;
        const bh = (c.maxZ - c.minZ) * this.scale;
        g.fillRect(bx, by, bw, bh);
        g.strokeStyle = '#1a1208';
        g.lineWidth = 1;
        g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      }
    }
    g.strokeStyle = '#4a463f';
    g.lineWidth = 2;
    const b = zone.geometry.bounds;
    g.strokeRect(this.sx(b.minX), this.sy(b.minZ), (b.maxX - b.minX) * this.scale, (b.maxZ - b.minZ) * this.scale);
  }

  /** Jefes de raid ya descubiertos (los marca el mapa para siempre en esta sesión). */
  private readonly found = new Set<string>();
  private pulse = 0;

  /** Dibuja el mapa. Devuelve el nombre de un jefe de raid si recién se lo descubrió, para avisarlo. */
  draw(game: GameState): string | null {
    const c = this.ctx;
    c.drawImage(this.base, 0, 0);
    this.pulse += 0.1;
    let discovered: string | null = null;

    c.fillStyle = '#e6c25a';
    for (const n of game.npcs) {
      c.beginPath();
      c.arc(this.sx(n.x), this.sy(n.z), 3, 0, Math.PI * 2);
      c.fill();
    }

    c.fillStyle = '#ff4d4d';
    for (const m of game.mobs) {
      if (!m.alive) continue;
      c.beginPath();
      c.arc(this.sx(m.x), this.sy(m.z), 2.5, 0, Math.PI * 2);
      c.fill();
    }

    // Jefes de raid: escondidos hasta que alguien se acerca; después quedan marcados con una calavera.
    for (const m of game.mobs) {
      const tpl = game.templates[m.templateId];
      if (!tpl.raid) continue;
      if (!this.found.has(m.id)) {
        if (!m.alive || Math.hypot(m.x - game.player.x, m.z - game.player.z) > RAID_REVEAL) continue;
        this.found.add(m.id);
        discovered = tpl.name;
      }
      const x = this.sx(m.x);
      const y = this.sy(m.z);
      const beat = 1 + 0.25 * Math.sin(this.pulse * 3);
      c.strokeStyle = m.alive ? '#d36bff' : '#6b5a78';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x, y, 8 * beat, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = m.alive ? '#d36bff' : '#6b5a78';
      c.font = 'bold 11px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('\u2620', x, y + 0.5);
      c.font = 'bold 8px sans-serif';
      c.fillStyle = '#f0d8ff';
      c.fillText('RAID', x, y + 15);
    }

    // Jugador: triángulo apuntando hacia donde mira.
    const p = game.player;
    const px = this.sx(p.x);
    const py = this.sy(p.z);
    const dx = Math.sin(p.facing);
    const dy = Math.cos(p.facing);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(px + dx * 7, py + dy * 7);
    c.lineTo(px - dy * 4 - dx * 3, py + dx * 4 - dy * 3);
    c.lineTo(px + dy * 4 - dx * 3, py - dx * 4 - dy * 3);
    c.closePath();
    c.fill();
    return discovered;
  }
}
