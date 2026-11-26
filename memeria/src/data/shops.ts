import type { ShopDef } from '../shared/types';

// Tiendas de la villa. Los precios están en el ítem (`buy` en monedas, `mmria` en el token).
// El stock de equipo se filtra por clase al mostrarlo. Tom no vende nada: ofrece cama.
export const SHOPS: Record<string, ShopDef> = {
  'gary-grocer': {
    npc: 'gary-grocer',
    stock: ['apple', 'health-potion', 'greater-potion', 'grand-potion'],
  },
  'diamond-dan': {
    npc: 'diamond-dan',
    stock: [
      'tin-sword', 'twig-staff', 'rusty-dagger', 'wooden-bo', 'hunting-bow', 'leather-vest',
      'hodlers-blade', 'feels-staff', 'wow-dagger', 'red-lacquer-bo', 'pink-longbow', 'bearhide-coat',
      'diamond-paw-sword', 'rare-staff', 'moonshot-dagger', 'pop-rod', 'hat-trick-bow', 'grizzly-plate',
      'liquidation-cleaver', 'sadge-crook', 'dip-buyer-dirk', 'pop-crusher', 'brimmed-bow', 'golem-mail',
      'conviction-greatsword', 'comfy-scepter', 'diamond-tooth-kris', 'resonant-bo', 'knitted-windbow', 'aegis-of-conviction',
      // Armas especiales: solo con MMRIA (todavía sin salida a la venta)
      'candle-cutter', 'genesis-scepter', 'moonbreaker', 'heavenly-bo', 'hattrick-starbow',
    ],
  },
  'tom-innkeeper': {
    npc: 'tom-innkeeper',
    stock: [],
    // Descansar cuesta esto por nivel y deja la vida y el maná al máximo.
    restPerLevel: 3,
  },
};
