// Números de balance y del tick. Un solo lugar para cambiarlos.

export const TICK_DT = 1 / 60;

/** Segundos que dura el botín en el suelo, y a qué distancia lo recoge el jugador. */
export const DROP_LIFE = 90;
export const PICKUP_RADIUS = 1.7;

/** Casillas de la barra de consumibles (teclas 1 a N). */
export const HOTBAR_SLOTS = 5;

/**
 * Fichas MMRIA: la moneda del juego que se canjea por MMRIA real. Las tira el servidor (nunca el cliente)
 * y se guardan en su base, con tope diario por wallet. Todos los números son provisorios hasta decidir la economía.
 */
export const TOKEN = {
  /** Fichas por 1 MMRIA real. */
  perMmria: 100,
  /** Mínimo para pedir un canje. */
  redeemMin: 100,
  /** Tope de fichas que puede ganar una wallet por día (UTC): acota lo que se pierde si alguien hace trampa. */
  dailyCap: 150,
  /** Tope global de MMRIA que se puede canjear por día (UTC), entre todas las wallets: acota lo que puede salir de la pagadora. */
  globalDailyMmria: 300,
  /** La pagadora no paga si le quedan menos SOL que esto (comisiones y cuentas nuevas de token). */
  payerMinSol: 0.01,
  /** Fichas que suelta un jefe al caer (siempre). */
  bossDrop: [8, 15] as [number, number],
  /** Probabilidad de que un mob de este nivel suelte fichas. */
  chance: (level: number): number => Math.min(0.1, 0.012 + 0.005 * level),
  /** Cuántas fichas suelta cuando suelta. */
  amount: (level: number): number => 1 + Math.floor(level / 8),
};

export const RULES = {
  player: {
    maxHp: 100,
    maxMp: 60,
    mpRegen: 2,
    speed: 6,
    radius: 0.45,
  },
  attack: {
    damage: 12,
    range: 2.5,
    cooldown: 0.8,
  },
  skill: {
    damage: 30,
    range: 3.5,
    cost: 20,
    cooldown: 3,
  },
  interactRange: 3,
  progression: {
    maxLevel: 20,
    hpPerLevel: 0.12,
    mpPerLevel: 0.08,
    damagePerLevel: 0.1,
  },
} as const;

/**
 * XP que rinde un mob según la diferencia de nivel con el jugador. Cazar algo más fuerte paga
 * un poco más (hasta +50 %); farmear algo mucho más débil casi no paga, para que subir de
 * nivel empuje a seguir hacia zonas nuevas en vez de repetir la primera.
 */
export function xpForKill(baseXp: number, mobLevel: number, playerLevel: number): number {
  const diff = mobLevel - playerLevel;
  const mult = diff >= 0 ? 1 + 0.1 * Math.min(diff, 5) : Math.max(0.1, 1 + 0.25 * diff);
  return Math.max(1, Math.round(baseXp * mult));
}

/** Cómo se ve un mob para este jugador: decide el color del nombre. */
export type Threat = 'trivial' | 'easy' | 'even' | 'hard' | 'deadly';
export function threatOf(mobLevel: number, playerLevel: number): Threat {
  const diff = mobLevel - playerLevel;
  if (diff <= -4) return 'trivial';
  if (diff <= -2) return 'easy';
  if (diff <= 1) return 'even';
  if (diff <= 3) return 'hard';
  return 'deadly';
}

/** XP necesaria para pasar de `level` al siguiente. */
export function xpForLevel(level: number): number {
  return Math.round(40 * Math.pow(level, 1.8) + 20);
}
