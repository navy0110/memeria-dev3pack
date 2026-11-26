// Menú de pausa (Escape): volver al juego, silenciar o salir al título. No frena el mundo: el juego es
// online, así que seguir adentro es seguir expuesto; «Exit» guarda y vuelve a la landing.
import { sfx } from './sfx';
import { t } from '../i18n';

export interface MenuHooks {
  /** ¿Hay algo que Escape ya cierra (inventario, tienda, chat)? Entonces el menú no se abre. */
  busy: () => boolean;
  muted: () => boolean;
  toggleMute: () => void;
  exit: () => void;
  /** Nombre que se muestra hoy. */
  name: () => string;
  /** Cambia el nombre; devuelve el motivo del rechazo, o null si quedó guardado. */
  rename: (raw: string) => Promise<string | null>;
}

export class PauseMenu {
  private readonly el: HTMLElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly nameBtn: HTMLButtonElement;

  constructor(
    root: Document,
    private readonly hooks: MenuHooks,
  ) {
    this.el = root.getElementById('pause')!;
    this.soundBtn = root.getElementById('pause-sound') as HTMLButtonElement;
    root.getElementById('pause-resume')!.addEventListener('click', () => this.toggle(false));
    root.getElementById('pause-exit')!.addEventListener('click', () => hooks.exit());
    const form = root.getElementById('pause-nameform') as HTMLFormElement;
    const input = root.getElementById('pause-nameinput') as HTMLInputElement;
    const err = root.getElementById('pause-nameerr')!;
    this.nameBtn = root.getElementById('pause-name') as HTMLButtonElement;
    this.nameBtn.addEventListener('click', () => {
      form.hidden = !form.hidden;
      err.textContent = '';
      if (!form.hidden) {
        input.value = '';
        input.focus();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      err.textContent = t('Saving...');
      void hooks.rename(input.value).then((problem) => {
        err.textContent = problem ? t(problem) : '';
        if (problem) return;
        form.hidden = true;
        sfx.confirm();
        this.paint();
      });
    });
    this.soundBtn.addEventListener('click', () => {
      hooks.toggleMute();
      this.paint();
    });
    // En captura y antes que los demás: se decide con el estado previo, así el Escape que cierra el
    // inventario o la tienda no abre además el menú.
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'Escape' || e.repeat) return;
        if (this.isOpen) this.toggle(false);
        else if (!hooks.busy()) this.toggle(true);
      },
      true,
    );
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.toggle(false);
    });
  }

  get isOpen(): boolean {
    return this.el.classList.contains('on');
  }

  toggle(on: boolean = !this.isOpen): void {
    this.el.classList.toggle('on', on);
    (on ? sfx.open : sfx.cancel)();
    if (on) this.paint();
  }

  private paint(): void {
    this.soundBtn.textContent = this.hooks.muted() ? t('Sound: off') : t('Sound: on');
    this.nameBtn.textContent = `${t('Name')}: ${this.hooks.name()}`;
  }
}
