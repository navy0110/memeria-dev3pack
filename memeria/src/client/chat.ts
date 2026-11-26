// Caja de chat del cliente (abajo a la izquierda): pestañas por canal, ícono de carta para
// plegarla, y entrada de texto con Enter. Por ahora el chat es local: el texto que escribe el
// jugador solo se ve acá. Cuando haya servidor, `onSend` es el punto donde se manda al resto.
import { sfx } from './sfx';
import { t } from '../i18n';

export type Channel = 'say' | 'emote' | 'announce' | 'system' | 'combat' | 'story' | 'party';

/** Detalles opcionales de una línea de chat. */
export interface LineMeta {
  cls?: string;
  lvl?: number;
  /** Te nombraron: se resalta la línea. */
  mention?: boolean;
  tone?: 'boss' | 'level' | 'join';
}
type Tab = 'all' | 'combat' | 'story';

const MAX_LINES = 200;
/** Enter no abre el chat en el primer segundo y medio: al entrar se mashea Enter para saltear el prólogo, y el sobrante dejaba el chat con el foco (y el WASD escribiendo ahí). */
const GRACE_MS = 1500;
/** Con el chat en modo escritura y nada escrito, a los 5 s se suelta solo y vuelve el movimiento. */
const IDLE_MS = 5000;
const TAB_OF: Record<Tab, (c: Channel) => boolean> = {
  all: () => true,
  combat: (c) => c === 'combat',
  story: (c) => c === 'story' || c === 'say' || c === 'emote' || c === 'announce' || c === 'party',
};

export class Chat {
  private readonly body: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly box: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly hint: HTMLElement;
  private tab: Tab = 'all';
  private unread = 0;
  private readonly bornAt = performance.now();
  private idleTimer = 0;
  onSend: (text: string) => void = () => {};
  /** El jugador empezó a escribir: el servidor avisa a los demás con puntos sobre su cabeza. */
  onTypingStart: () => void = () => {};
  private lastTypingPing = 0;
  private lastSubmit = 0;

  constructor(root: Document) {
    const q = <T extends HTMLElement>(id: string): T => {
      const el = root.getElementById(id);
      if (!el) throw new Error(`Missing element #${id} in index.html`);
      return el as T;
    };
    this.box = q('chat');
    this.body = q('chat-body');
    this.input = q<HTMLInputElement>('chat-input');
    this.badge = q('chat-badge');
    this.hint = q('chat-hint');

    q('chat-mail').addEventListener('click', () => this.toggle());
    this.box.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => this.setTab(b.dataset.tab as Tab)),
    );

    // Los teclados virtuales de celular mandan Enter con `code` vacío (a veces `key` «Unidentified» y keyCode 13/229):
    // se acepta por `key`, por `code` y por keyCode, y se suma el botón de enviar y beforeinput como respaldo.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.keyCode !== 13) return;
      if (e.repeat) return;
      if (document.activeElement === this.input) {
        e.preventDefault();
        this.submit();
      } else {
        if (performance.now() - this.bornAt < GRACE_MS) return;
        sfx.open();
        if (this.box.classList.contains('closed')) this.toggle();
        this.input.focus();
        e.preventDefault();
      }
    });
    this.input.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
        e.preventDefault();
        this.submit();
      }
    });
    // pointerdown + preventDefault: el botón no le quita el foco al input antes de enviar.
    const send = root.getElementById('chat-send');
    send?.addEventListener('pointerdown', (e) => e.preventDefault());
    send?.addEventListener('click', () => this.submit());
    // Modo escritura: el teclado es del chat. Click en el mundo o Escape devuelven el control al juego.
    this.input.addEventListener('focus', () => this.setTyping(true));
    this.input.addEventListener('blur', () => this.setTyping(false));
    this.input.addEventListener('input', () => {
      this.armIdle();
      const now = performance.now();
      if (this.input.value && now - this.lastTypingPing > 2500) {
        this.lastTypingPing = now;
        this.onTypingStart();
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (document.activeElement === this.input && !this.box.contains(e.target as Node)) this.input.blur();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        sfx.cancel();
        this.input.value = '';
        this.input.blur();
      }
    });
  }

  add(channel: Channel, text: string, who?: string, meta: LineMeta = {}): void {
    const line = document.createElement('div');
    line.className = `ln ${channel}${meta.mention ? ' mention' : ''}${meta.tone ? ` tone-${meta.tone}` : ''}`;
    line.dataset.ch = channel;
    if (who) {
      const w = document.createElement('b');
      if (meta.cls) w.className = `cls-${meta.cls}`;
      // Nivel junto al nombre: dice de un vistazo con quién hablás.
      w.textContent = `${meta.lvl ? `[${meta.lvl}] ` : ''}${who}${channel === 'emote' ? ' ' : ': '}`;
      line.appendChild(w);
    }
    line.appendChild(document.createTextNode(text));
    if (!TAB_OF[this.tab](channel)) line.style.display = 'none';
    const stick = this.body.scrollTop + this.body.clientHeight >= this.body.scrollHeight - 24;
    this.body.appendChild(line);
    while (this.body.childElementCount > MAX_LINES) this.body.firstElementChild?.remove();
    if (stick) this.body.scrollTop = this.body.scrollHeight;
    if (this.box.classList.contains('closed')) {
      this.unread++;
      this.badge.textContent = String(Math.min(this.unread, 99));
      this.badge.style.display = 'block';
    }
  }

  /** Envía lo escrito y suelta el chat. Keydown y beforeinput pueden llegar juntos: el segundo, dentro de 50 ms, se ignora. */
  private submit(): void {
    const now = performance.now();
    if (now - this.lastSubmit < 50) return;
    this.lastSubmit = now;
    const text = this.input.value.trim();
    this.input.value = '';
    this.input.blur();
    if (text) {
      sfx.confirm();
      this.onSend(text);
    } else sfx.cancel();
  }

  /** Reinicia la cuenta regresiva que suelta el chat si no se escribe nada. */
  private armIdle(): void {
    window.clearTimeout(this.idleTimer);
    if (document.activeElement !== this.input) return;
    this.idleTimer = window.setTimeout(() => {
      if (!this.input.value) this.input.blur();
      else this.armIdle();
    }, IDLE_MS);
  }

  private setTyping(on: boolean): void {
    if (on) this.armIdle();
    else window.clearTimeout(this.idleTimer);
    this.box.classList.toggle('typing', on);
    document.body.classList.toggle('typing', on);
    this.hint.textContent = on ? t('Keys paused · Enter send · Esc cancel') : t('Enter to chat');
    this.input.placeholder = on ? t('Type a message...') : t('Press Enter to type');
  }

  private toggle(): void {
    const closed = this.box.classList.toggle('closed');
    if (closed) sfx.cancel();
    else sfx.open();
    if (!closed) {
      this.unread = 0;
      this.badge.style.display = 'none';
      this.body.scrollTop = this.body.scrollHeight;
    }
  }

  private setTab(tab: Tab): void {
    if (tab !== this.tab) sfx.cursor();
    this.tab = tab;
    this.box.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const show = TAB_OF[tab];
    this.body.querySelectorAll<HTMLElement>('.ln').forEach((l) => {
      l.style.display = show(l.dataset.ch as Channel) ? '' : 'none';
    });
    this.body.scrollTop = this.body.scrollHeight;
  }
}
