import type { PlayerClass } from '../shared/types';
import { sfx } from './sfx';
import { t } from '../i18n';

// Prólogo: el trasfondo del mundo, línea por línea. Enter, Espacio o click aceleran y terminan.
// ?cls=... (modo pruebas) lo salta; ?intro=1 lo fuerza.
export function playIntro(root: HTMLElement, cls: PlayerClass): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.has('cls') && params.get('intro') !== '1') return Promise.resolve();
  const lines = [
    t('Memeria was once fed by the Liquidity Wells, springs that never ran dry while the Herd believed.'),
    t('Then came the Great Rug Pull. The Founders vanished overnight, and the Wells began to die.'),
    t('Their abandoned promises rose as Rug Ghosts. Bear Markets now prowl every road, hunting anyone still holding.'),
    t('The land is under siege, and it needs warriors of conviction: those who will hold to their last breath.'),
    cls.calling,
  ];
  // Una ilustración por línea: la villa, el Rug Pull, los fantasmas con el pozo y el amanecer del héroe.
  const scenes = ['/art/village.webp', '/art/intro-rug.webp', '/art/intro-ghosts.webp', '/art/intro-ghosts.webp', '/art/meadow.webp'];
  const urls = [...new Set(scenes)];
  for (const u of urls) new Image().src = u;
  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="intro-bg">${urls.map((u) => `<i style="background-image:url(${u})"></i>`).join('')}</div>
      <div class="intro-shade"></div>
      <div class="intro-box">
        <p class="intro-chap">${t('Chapter One')}</p>
        <h2>${t('To the Last Breath')}</h2>
        <div class="intro-lines" id="intro-lines"></div>
        <p class="intro-hint" id="intro-hint">${t('Press Enter to continue')}</p>
      </div>`;
    root.style.display = 'flex';
    root.classList.add('intro-on');
    const layers = [...root.querySelectorAll<HTMLElement>('.intro-bg i')];
    const showScene = (i: number): void => layers.forEach((el, k) => el.classList.toggle('on', k === urls.indexOf(scenes[Math.min(i, scenes.length - 1)])));
    const box = root.querySelector<HTMLElement>('#intro-lines')!;
    const hint = root.querySelector<HTMLElement>('#intro-hint')!;
    let shown = 0;
    let timer = 0;
    const reveal = (): void => {
      if (shown >= lines.length) return;
      const p = document.createElement('p');
      showScene(shown);
      box.textContent = ''; // una línea a la vez: así la ilustración se ve y la historia no se amontona
      p.textContent = lines[shown++];
      if (shown === lines.length) p.className = 'calling';
      box.appendChild(p);
      sfx.cursor();
      if (shown < lines.length) timer = window.setTimeout(reveal, 2600);
      else hint.textContent = t('Press Enter to begin');
    };
    const finish = (): void => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('click', advance);
      root.style.display = 'none';
      root.classList.remove('intro-on');
      root.innerHTML = '';
      sfx.confirm();
      resolve();
    };
    const advance = (): void => {
      if (shown < lines.length) {
        window.clearTimeout(timer);
        while (shown < lines.length) reveal();
      } else finish();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') advance();
    };
    window.addEventListener('keydown', onKey);
    root.addEventListener('click', advance);
    reveal();
  });
}
