// Emotes del chat: `/wave`, `/dance`... El servidor los reparte con su emoji y el cliente los muestra
// en una burbuja sobre la cabeza. Sin riesgo de texto libre: el texto sale de acá, no del jugador.
export interface Emote {
  emoji: string;
  /** Cómo se lee en el chat: «* Name <text>.» */
  text: string;
}

export const EMOTES: Record<string, Emote> = {
  wave: { emoji: '👋', text: 'waves hello' },
  gm: { emoji: '☀️', text: 'says gm' },
  gn: { emoji: '🌙', text: 'says gn' },
  dance: { emoji: '💃', text: 'busts a move' },
  lol: { emoji: '😂', text: 'cracks up' },
  gg: { emoji: '🏆', text: 'calls GG' },
  hodl: { emoji: '💎', text: 'HODLs the line' },
  moon: { emoji: '🚀', text: 'is going to the moon' },
  rip: { emoji: '🪦', text: 'is absolutely rekt' },
  cheer: { emoji: '🎉', text: 'cheers' },
  bonk: { emoji: '🔨', text: 'bonks everyone' },
  pray: { emoji: '🙏', text: 'prays to the Well' },
};

/** Cada cuántos niveles se avisa a todos que alguien subió. */
export const LEVEL_MILESTONE = 5;
/** Jefes del mundo: cuando caen, se anuncia a todos quién los derribó. */
export const BOSS_IDS = new Set(['bull-baron', 'stop-loss-colossus', 'hype-man', 'deployer', 'rugwyrm']);
