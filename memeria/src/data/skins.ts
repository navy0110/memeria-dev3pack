// Paletas de color de las mascotas: la misma mascota con otros colores, para que en un mundo
// compartido no se vea todo el mundo igual. Cada skin retoca los colores del cuerpo (tono,
// saturación, luz); ojos, armas y detalles no cambian. `css` es el filtro que tiñe el arte
// de la landing para mostrar la skin sin tener una imagen por cada una.
export interface Skin {
  id: string;
  name: string;
  /** Giro de tono en vueltas completas (0 a 1). */
  hue: number;
  sat: number;
  light: number;
  /** Color de la muestra en el selector. */
  swatch: string;
  css: string;
}

// Los giros de tono repartidos en tercios dan colores distintos en todas las mascotas
// (naranja, verde y amarillo no caen en lo mismo); Shadow las apaga.
export const SKINS: Skin[] = [
  { id: 'classic', name: 'Classic', hue: 0, sat: 1, light: 1, swatch: '#e58a3c', css: 'none' },
  { id: 'shadow', name: 'Shadow', hue: 0, sat: 0.3, light: 0.55, swatch: '#3b3748', css: 'brightness(0.62) saturate(0.35)' },
  { id: 'aurora', name: 'Aurora', hue: 0.33, sat: 1.1, light: 1.02, swatch: '#3fd0b0', css: 'hue-rotate(120deg) saturate(1.1)' },
  { id: 'twilight', name: 'Twilight', hue: 0.66, sat: 1.1, light: 0.95, swatch: '#9a6bff', css: 'hue-rotate(238deg) saturate(1.1)' },
];
