// Compartir en X (Twitter): abre la ventana de publicar con el texto y el enlace al juego. No sube nada
// por su cuenta: es el propio jugador quien confirma el tuit.
export const SITE_URL = 'https://memeria.fun';

export function shareOnX(text: string): void {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SITE_URL)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
