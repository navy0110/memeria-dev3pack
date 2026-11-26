// Party y curación entre jugadores. Lo comparten el servidor (que arbitra) y el cliente (que dibuja).
// Sin dependencias del navegador ni de Cloudflare.

export const PARTY = {
  /** Cuántos héroes entran en una party. */
  maxSize: 4,
  /** Cuánto dura una invitación sin responder. */
  inviteTtlMs: 30_000,
  /** Mend: la curación a distancia que tienen todos los héroes (tecla H). */
  mend: {
    cost: 18,
    cooldown: 2.5,
    /** Alcance con el que el cliente elige a quién curar. */
    range: 16,
    /** El servidor perdona un poco: las posiciones que ve llegan con unas décimas de retraso. */
    slack: 4,
  },
} as const;

/** Vida que devuelve Mend según el nivel de quien lo lanza: una poción chica al principio, una grande al final. */
export const mendAmount = (level: number): number => 30 + 4 * (Math.max(1, Math.floor(level)) - 1);

/** Un integrante tal como lo cuenta el servidor a toda la party. */
export interface PartyMember {
  id: string;
  name: string;
  cls: string;
  lvl: number;
  hp: number;
  maxHp: number;
}

export interface PartyView {
  /** Id de conexión de quien lidera. */
  leader: string;
  members: PartyMember[];
}

/** Aviso del servidor para mostrar en el chat: el texto en inglés (se traduce en el cliente) y sus variables. */
export interface PartyNote {
  s: string;
  v?: Record<string, string | number>;
  err?: boolean;
}
