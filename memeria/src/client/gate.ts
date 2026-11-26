// Página de ingreso: cuenta de qué va el juego y deja entrar con una wallet de Solana
// (Phantom, MetaMask u otra compatible con Wallet Standard). Resuelve con la sesión.
//
// ?cls=... o ?guest=1 la saltan, solo en desarrollo (`pnpm dev`), para pruebas y capturas.
import type { Wallet } from '@wallet-standard/base';
import { CLASS_LIST } from '../data';
import './gate.css';
import { lang, t } from '../i18n';
import { setLang } from '../i18n/dom';
import { SKINS } from '../data/skins';
import { guestSignIn, tokenAlive } from './api';
import { setMood } from './music';
import { audioReady, isMuted, onMuteChange, sfx, toggleMute } from './sfx';
import {
  KNOWN_WALLETS,
  GAME_WALLET,
  connect,
  createGameWallet,
  importGameWalletCode,
  describeError,
  ensureMetaMask,
  listWallets,
  loadGameWallet,
  loadSession,
  onWalletsChange,
  saveSession,
  shortAddress,
  signIn,
  signInGameWallet,
  type Session,
} from './wallet';

// Contrato oficial de MMRIA (Token-2022 en Solana). Mismo valor que public/tokenomics.html.
const MINT = '6384VsyfFRmhq5XLftMpUGQfmPz76xWnVDrkUq3ypump';
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const FEATURES: Array<{ icon: string; title: string; text: string }> = [
  { icon: '♦', title: 'Pick a mascot', text: 'Play as a Mage, Warrior, Rogue, Monk or Ranger, each one a memecoin mascot with its own attacks and signature skill, and four color palettes to stand out in a crowd.' },
  { icon: '⚔', title: 'Fight the market', text: 'Hold back the Bear Markets and the Rug Pull Ghosts, take on quests and level up from the village of Hodl Hollow outward.' },
  { icon: '✦', title: 'Loot and craft', text: 'Monsters drop coins and materials. The best weapons need recipes lost since the Founders vanished.' },
  { icon: '◎', title: 'Two currencies', text: 'Coins are earned in the game and never run out. MMRIA, the game token, is live on Solana but not usable in the game yet: it will buy cosmetics and access, never power. Details at memeria.fun/tokenomics.html.' },
  { icon: '◆', title: 'Your wallet is your hero', text: 'No email and no password. One Solana wallet is one account, and your hero is tied to it.' },
  { icon: '☷', title: 'Shared world', text: 'Memeria is built to be played together. Multiplayer zones are on the way.' },
];

const HERO_ART: Record<string, { src: string; color: string }> = {
  pepe: { src: '/art/frog.webp', color: '#7be06a' },
  shiba: { src: '/art/shiba.webp', color: '#ff9a3d' },
  doge: { src: '/art/doge.webp', color: '#3ed0c3' },
  popcat: { src: '/art/popcat.webp', color: '#ff8fb3' },
  wif: { src: '/art/wif.webp', color: '#ff7fb0' },
};

const SPEAKER_BASE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/>';
const SPEAKER_ON = `${SPEAKER_BASE}<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;
const SPEAKER_OFF = `${SPEAKER_BASE}<path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`;

export function enterGate(root: HTMLElement): Promise<Session> {
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV && (params.has('cls') || params.has('guest'))) {
    return Promise.resolve({ address: null, wallet: 'guest' });
  }

  return new Promise((resolve) => {
    root.className = 'gate';
    root.style.display = 'block';
    root.innerHTML = `
      <button class="lp-sound" id="lp-sound" type="button" aria-label="${t('Toggle music')}"></button>
      <button class="lp-lang" id="lp-lang" type="button" aria-label="Language / Idioma">${lang === 'es' ? 'EN' : 'ES'}</button>
      <section class="lp-hero" id="lp-hero">
        <div class="lp-bg"></div>
        <div class="lp-shade"></div>
        <div class="lp-flies">${Array.from({ length: 22 }, () => `<i style="left:${Math.random() * 100}%;top:${30 + Math.random() * 65}%;--d:${7 + Math.random() * 8}s;--delay:${(-Math.random() * 12).toFixed(1)}s;--dx:${Math.round(Math.random() * 80 - 40)}px;--dy:${-Math.round(30 + Math.random() * 70)}px"></i>`).join('')}</div>
        <div class="lp-main">
          <div class="lp-copy">
            <p class="lp-kicker">${t('A browser adventure in Memeria')}</p>
            <h1 class="lp-title" aria-label="Memeria"><svg class="lp-crest" viewBox="0 0 100 140" aria-hidden="true"><defs><linearGradient id="lp-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#ffd35a"/><stop offset="1" stop-color="#c98a14"/></linearGradient></defs><path d="M50 6 L92 22 V68 C92 98 73 120 50 134 C27 120 8 98 8 68 V22 Z" fill="#0a0c2c" stroke="url(#lp-g)" stroke-width="5" stroke-linejoin="round"/><path d="M25 98 V46 L50 80 L75 46 V98" fill="none" stroke="url(#lp-g)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M50 26 L54 35 L63 36 L56 42 L58 51 L50 46 L42 51 L44 42 L37 36 L46 35 Z" fill="#fff0b0"/></svg><span class="lp-word">Memeria</span></h1>
            <p class="lp-tag">${t('The land is surrendering. You are not. HODL.')}</p>
            <div class="lp-enter">
              <button class="lp-btn lp-btn-hero" id="lp-hero-btn" type="button">${t('Enter Memeria')}</button>
              <button class="lp-btn lp-btn-early" id="lp-early-btn" type="button">${t('Early bird: play now')}</button>
              <p class="lp-enter-sub lp-early-sub">${t('No wallet, no questions. Your progress stays in this browser.')}</p>
              <p class="lp-enter-sub">${t('Or connect {a}, {b} or a free {c}', { a: '<b>Phantom</b>', b: '<b>MetaMask</b>', c: `<b>${t('game wallet')}</b>` })}</p>
              <p class="gate-state" id="gate-state" aria-live="polite"></p>
            </div>
          </div>
          <div class="lp-stage" aria-hidden="true">
            <div class="lp-mascot lp-m-popcat"><img src="/art/popcat.webp" alt="" width="1024" height="1024" decoding="async" /></div>
            <div class="lp-mascot lp-m-wif"><img src="/art/wif.webp" alt="" width="1024" height="1024" decoding="async" /></div>
            <div class="lp-mascot lp-m-frog"><img src="/art/frog.webp" alt="" width="1024" height="1024" decoding="async" /></div>
            <div class="lp-mascot lp-m-doge"><img src="/art/doge.webp" alt="" width="1024" height="1024" decoding="async" /></div>
            <div class="lp-mascot lp-m-shiba"><img src="/art/shiba.webp" alt="" width="1024" height="1024" decoding="async" /></div>
          </div>
        </div>
      </section>
      <section class="lp-band" style="--bg:url(/art/meadow.webp)">
       <div class="lp-section">
        <h2 class="lp-reveal">${t('Choose your hero')}</h2>
        <p class="lp-sub lp-reveal">${t('Pick a mascot to enter. Your hero is tied to your wallet.')}</p>
        <div class="lp-heroes">
          ${CLASS_LIST.map((c, i) => {
            const art = HERO_ART[c.id];
            return `<article class="lp-card lp-reveal" role="button" tabindex="0" data-hero="${c.id}" aria-label="${esc(t('Enter Memeria as {name}', { name: c.name }))}" style="--c:${art.color};--rd:${i * 0.12}s">
              <div class="lp-card-art"><img src="${art.src}" alt="${esc(c.name)}" loading="lazy" width="1024" height="1024" /></div>
              <div class="lp-skins" role="group" aria-label="${t('Color palette')}">${SKINS.map((k, si) => `<button type="button" class="lp-skin${si === 0 ? ' on' : ''}" data-skin="${si}" title="${esc(k.name)}" aria-label="${esc(t('{name} palette', { name: k.name }))}" style="--sw:${k.swatch}"></button>`).join('')}</div>
              <h3>${esc(c.name)}</h3><span class="lp-role">${esc(c.role)}</span>
              <p>${esc(c.blurb)}</p>
              <div class="lp-bars">
                <span>HP</span><div class="lp-bar"><b style="width:${Math.round((c.maxHp / 130) * 100)}%"></b></div>
                <span>MP</span><div class="lp-bar"><b style="width:${Math.round((c.maxMp / 90) * 100)}%"></b></div>
                <span>SPD</span><div class="lp-bar"><b style="width:${Math.round((c.speed / 7.2) * 100)}%"></b></div>
                <span>ATK</span><div class="lp-bar"><b style="width:${Math.round(((c.attack.damage + c.skill.damage / 4) / 24) * 100)}%"></b></div>
              </div>
              <span class="lp-card-go">${t('Play as {name}', { name: esc(c.name) })} &rarr;</span>
            </article>`;
          }).join('')}
        </div>
       </div>
      </section>
      <section class="lp-band" style="--bg:url(/art/marsh.webp)">
       <div class="lp-section">
        <h2 class="lp-reveal">${t('What awaits')}</h2>
        <p class="lp-sub lp-reveal">${t('A small world with a big heart, built to be shared.')}</p>
        <div class="lp-feats">
          ${FEATURES.map((f, i) => `<article class="lp-feat lp-reveal" style="--rd:${(i % 3) * 0.1}s"><i>${f.icon}</i><h3>${esc(t(f.title))}</h3><p>${esc(t(f.text))}</p></article>`).join('')}
        </div>
        <div class="lp-token lp-reveal">
          <span class="lp-token-tag">${t('Official MMRIA contract')} &middot; Solana</span>
          <div class="lp-token-row">
            <code id="lp-mint">${MINT}</code>
            <button class="lp-token-copy" id="lp-mint-copy" type="button">${t('Copy')}</button>
          </div>
          <p class="lp-token-links"><a href="https://solscan.io/token/${MINT}" target="_blank" rel="noopener noreferrer">Solscan</a> &middot; <a href="https://pump.fun/coin/${MINT}" target="_blank" rel="noopener noreferrer">pump.fun</a> &middot; <a href="/tokenomics">${t('Tokenomics')}</a></p>
          <p class="lp-token-warn">${t('This is the only official address. Mint and freeze authority are revoked. We never ask for your seed phrase.')}</p>
        </div>
        <div class="lp-cta lp-reveal"><button class="lp-btn" id="lp-top-btn" type="button">${t('Enter Memeria')}</button></div>
       </div>
      </section>
      <div class="lp-modal" id="lp-modal" hidden>
        <div class="lp-modal-back" data-close></div>
        <aside class="gate-panel lp-modal-box" role="dialog" aria-modal="true" aria-labelledby="lp-modal-title">
          <button class="lp-modal-x" type="button" data-close aria-label="${t('Close')}">&times;</button>
          <div class="lp-modal-hero" id="lp-modal-hero"></div>
          <h2 id="lp-modal-title">${t('Enter Memeria')}</h2>
          <p class="gate-state"></p>
          <div class="gate-wallets"></div>
          <p class="gate-safe">${t('No wallet yet? Create a game wallet in one click. It lives only in this browser, so do not keep real funds in it. Signing in is free: it only asks you to sign a message, never moves funds, and never needs your seed phrase. If this wallet already has a hero, it keeps that one. Guests keep their progress in this browser only.')}</p>
        </aside>
      </div>
      <footer class="gate-foot">${t('Music')}: &ldquo;Heroes Theme&rdquo; ${t('by')} Alexandr Zhelanov, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a>, ${t('via')} <a href="https://opengameart.org/content/heroes-theme" target="_blank" rel="noopener noreferrer">OpenGameArt</a>. ${t('Not financial advice. The mascots are original interpretations and the game is not affiliated with any memecoin project. MMRIA exists on Solana but is not used in the game yet. Nothing here is an offer or a promise of returns.')} &copy; 2026 Ignacio Bavala. ${t('All rights reserved.')}</footer>`;

    const copyBtn = root.querySelector<HTMLButtonElement>('#lp-mint-copy')!;
    copyBtn.addEventListener('click', () => {
      const done = (txt: string): void => {
        copyBtn.textContent = txt;
        window.setTimeout(() => (copyBtn.textContent = t('Copy')), 1600);
      };
      navigator.clipboard.writeText(MINT).then(() => done(t('Copied')), () => done(t('Select it')));
    });

    // Parallax con el mouse y entrada de las secciones al hacer scroll.
    const hero = root.querySelector<HTMLElement>('#lp-hero')!;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', String(((e.clientX - r.left) / r.width - 0.5) * 2));
      hero.style.setProperty('--my', String(((e.clientY - r.top) / r.height - 0.5) * 2));
    });
    const reveals = root.querySelectorAll<HTMLElement>('.lp-reveal');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (en.isIntersecting) {
              en.target.classList.add('in');
              io.unobserve(en.target);
            }
          }
        },
        { root, threshold: 0.15 },
      );
      reveals.forEach((el) => io.observe(el));
    } else reveals.forEach((el) => el.classList.add('in'));
    // Modal de wallet: lo abren las cards (con el héroe elegido) y el botón final.
    const modal = root.querySelector<HTMLElement>('#lp-modal')!;
    const modalHero = root.querySelector<HTMLElement>('#lp-modal-hero')!;
    const closeModal = (): void => {
      // Cerrar también cancela un ingreso colgado (wallet que no responde): su resultado, si llega, se ignora.
      attempt++;
      if (busy) {
        busy = false;
        setState('');
        render();
      }
      modal.hidden = true;
      document.removeEventListener('keydown', onEsc);
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeModal();
    };
    const openModal = (heroId?: string, skin = 0): void => {
      pick = heroId;
      pickSkin = skin;
      const c = CLASS_LIST.find((x) => x.id === heroId);
      modalHero.innerHTML = c ? `<img src="${HERO_ART[c.id].src}" alt="" style="filter:${SKINS[skin].css}" /><span>Entering as <b>${esc(c.name)}</b> the ${esc(c.role)}${skin ? ` · ${esc(SKINS[skin].name)}` : ''}</span>` : '';
      modalHero.hidden = !c;
      modal.hidden = false;
      sfx.open();
      document.addEventListener('keydown', onEsc);
      modal.querySelector<HTMLElement>('.gate-wallet')?.focus();
    };
    modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
    root.querySelectorAll<HTMLElement>('.lp-card').forEach((card) => {
      // Cada card guarda su paleta; las muestras tiñen el arte (sin una imagen por paleta).
      let skin = 0;
      const art = card.querySelector<HTMLElement>('.lp-card-art img')!;
      card.querySelectorAll<HTMLElement>('.lp-skin').forEach((dot) => {
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          skin = Number(dot.dataset.skin);
          art.style.filter = SKINS[skin].css;
          card.querySelectorAll('.lp-skin').forEach((d) => d.classList.toggle('on', d === dot));
          sfx.cursor();
        });
        dot.addEventListener('keydown', (e) => e.stopPropagation());
      });
      card.addEventListener('click', () => openModal(card.dataset.hero, skin));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(card.dataset.hero, skin);
        }
      });
    });
    root.querySelector('#lp-top-btn')?.addEventListener('click', () => openModal());
    root.querySelector('#lp-hero-btn')?.addEventListener('click', () => openModal());
    root.querySelector('#lp-early-btn')?.addEventListener('click', () => void loginEarly());

    // Música de la landing. Los navegadores no dejan sonar nada antes de un gesto, así que arranca
    // con el primer click o tecla (setMood espera solo); el botón deja silenciarla.
    setMood('hero');
    root.querySelector('#lp-lang')!.addEventListener('click', () => setLang(lang === 'es' ? 'en' : 'es'));
    const soundBtn = root.querySelector<HTMLButtonElement>('#lp-sound')!;
    let startedRunning = false;
    const paintSound = (): void => {
      const ready = audioReady();
      const on = ready && !isMuted();
      soundBtn.innerHTML = on ? SPEAKER_ON : SPEAKER_OFF;
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.classList.toggle('hint', !ready);
      soundBtn.classList.toggle('off', ready && isMuted());
    };
    // Si este click es el que desbloquea el audio, no debe también silenciarlo.
    soundBtn.addEventListener('pointerdown', () => (startedRunning = audioReady()));
    soundBtn.addEventListener('click', () => {
      if (startedRunning) toggleMute();
      else if (isMuted()) toggleMute();
      window.setTimeout(paintSound, 80);
    });
    onMuteChange(paintSound);
    const soundTimer = window.setInterval(paintSound, 500);
    paintSound();

    const listEls = root.querySelectorAll<HTMLElement>('.gate-wallets');
    const stateEls = root.querySelectorAll<HTMLElement>('.gate-state');
    let pick: string | undefined;
    let pickSkin = 0;
    let busy = false;
    /** Cada intento de ingreso lleva su número; cerrar el modal lo invalida. */
    let attempt = 0;
    let hasGame = false;
    void loadGameWallet().then(
      (w) => {
        hasGame = !!w;
        render();
      },
      () => {
        /* si no se puede leer, el ingreso con la wallet del juego muestra el motivo */
      },
    );

    const setState = (text: string, kind: '' | 'err' | 'ok' = ''): void => {
      stateEls.forEach((el) => {
        el.textContent = text;
        el.className = `gate-state ${kind}`;
      });
    };

    const finish = (session: Session): void => {
      window.clearInterval(soundTimer);
      saveSession(session);
      setState(t('Welcome, {addr}. Opening the gates...', { addr: shortAddress(session.address ?? '') }), 'ok');
      sfx.chime();
      setTimeout(() => {
        root.style.display = 'none';
        root.className = '';
        root.innerHTML = '';
        resolve(session);
      }, 700);
    };

    const login = async (wallet: Wallet): Promise<void> => {
      if (busy) return;
      busy = true;
      const mine = ++attempt;
      render();
      try {
        setState(t('Approve the connection in {wallet}...', { wallet: wallet.name }));
        const account = await connect(wallet);
        setState(t('Sign the message in {wallet} to prove the wallet is yours...', { wallet: wallet.name }));
        const token = await signIn(wallet, account);
        if (mine !== attempt) return;
        finish({ address: account.address, wallet: wallet.name, classId: pick, skin: pickSkin, token });
      } catch (e) {
        if (mine !== attempt) return;
        sfx.error();
        setState(describeError(e), 'err');
        busy = false;
        render();
      }
    };

    /** Early bird: entra ya, sin wallet ni firma. Si el servidor no responde, juega solo en este navegador. */
    const loginEarly = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      render();
      setState(t('Opening the gates...'));
      let token: string | undefined;
      try {
        let id = localStorage.getItem('memeria.early');
        if (!id) localStorage.setItem('memeria.early', (id = crypto.randomUUID()));
        token = await guestSignIn(id);
      } catch {
        /* sin servidor o sin almacenamiento: entra igual, sin mundo compartido */
      }
      window.clearInterval(soundTimer);
      sfx.chime();
      root.style.display = 'none';
      root.className = '';
      root.innerHTML = '';
      resolve({ address: null, wallet: 'guest', guest: true, classId: pick, skin: pickSkin, token });
    };

    /** Wallet propia del juego: se crea la primera vez y después se reutiliza. */
    const loginGame = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      const mine = ++attempt;
      render();
      try {
        const existing = await loadGameWallet();
        setState(existing ? t('Signing in with your game wallet...') : t('Creating your game wallet...'));
        const w = existing ?? (await createGameWallet());
        const token = await signInGameWallet(w);
        if (mine !== attempt) return;
        finish({ address: w.address, wallet: GAME_WALLET, classId: pick, skin: pickSkin, token });
      } catch (e) {
        if (mine !== attempt) return;
        sfx.error();
        setState(describeError(e), 'err');
        busy = false;
        render();
      }
    };

    const icon = (w: Wallet | undefined, fallback: string): string =>
      w?.icon ? `<img src="${esc(w.icon)}" alt="" width="28" height="28" />` : `<span class="gate-w-ico">${esc(fallback)}</span>`;

    function buildRows(): HTMLElement[] {
      const found = listWallets();
      const rows: HTMLElement[] = [];
      const make = (html: string, onClick?: () => void, href?: string): HTMLElement => {
        const el = document.createElement(href ? 'a' : 'button');
        el.className = 'gate-wallet';
        el.innerHTML = html;
        if (href) {
          (el as HTMLAnchorElement).href = href;
          (el as HTMLAnchorElement).target = '_blank';
          (el as HTMLAnchorElement).rel = 'noopener noreferrer';
        } else {
          (el as HTMLButtonElement).disabled = busy;
          el.addEventListener('click', () => onClick?.());
        }
        return el;
      };

      for (const k of KNOWN_WALLETS) {
        const w = found.find((x) => k.match.test(x.name));
        if (w) rows.push(make(`${icon(w, k.name[0])}<span>${esc(w.name)}</span><em>${t('Detected')}</em>`, () => void login(w)));
        else rows.push(make(`${icon(undefined, k.name[0])}<span>${esc(k.name)}</span><em>${t('Install')}</em>`, undefined, k.installUrl));
      }
      for (const w of found) {
        if (KNOWN_WALLETS.some((k) => k.match.test(w.name))) continue;
        rows.push(make(`${icon(w, w.name[0])}<span>${esc(w.name)}</span><em>${t('Detected')}</em>`, () => void login(w)));
      }
      rows.push(make(`<span class="gate-w-ico">&#9733;</span><span>${t('Early bird')}</span><em>${t('No wallet')}</em>`, () => void loginEarly()));
      rows.push(make(`<span class="gate-w-ico">+</span><span>${hasGame ? t('Game wallet') : t('Create a game wallet')}</span><em>${hasGame ? t('Yours') : t('No extension')}</em>`, () => void loginGame()));
      const restore = document.createElement('div');
      restore.className = 'gate-restore';
      restore.innerHTML = `<button type="button" class="gate-wallet"><span class="gate-w-ico">&#8635;</span><span>${t('Restore with backup code')}</span><em>${t('Game wallet')}</em></button>`;
      restore.querySelector('button')!.addEventListener('click', () => {
        restore.innerHTML = `<input class="gate-restore-in" placeholder="memeria1-..." autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${t('Backup code')}" /><button type="button" class="gate-wallet"><span class="gate-w-ico">&#10003;</span><span>${t('Restore and enter')}</span></button>`;
        const input = restore.querySelector('input')!;
        input.focus();
        restore.querySelector('button')!.addEventListener('click', () => void restoreGame(input.value));
      });
      rows.push(restore);
      return rows;
    }

    /** Recupera la wallet del juego desde un código de respaldo y entra con ella. */
    const restoreGame = async (code: string): Promise<void> => {
      if (busy) return;
      busy = true;
      const mine = ++attempt;
      try {
        setState(t('Restoring your game wallet...'));
        const w = await importGameWalletCode(code);
        hasGame = true;
        const token = await signInGameWallet(w);
        if (mine !== attempt) return;
        finish({ address: w.address, wallet: GAME_WALLET, classId: pick, skin: pickSkin, token });
      } catch (e) {
        if (mine !== attempt) return;
        sfx.error();
        setState(describeError(e), 'err');
        busy = false;
        render();
      }
    };

    function render(): void {
      listEls.forEach((el) => el.replaceChildren(...buildRows()));
    }

    render();
    onWalletsChange(render);
    // MetaMask solo aparece como wallet de Solana cuando su cliente se inicializa.
    void ensureMetaMask().then(render);

    // Sesión de esta pestaña: reconecta en silencio, sin volver a firmar.
    const saved = loadSession();
    if (saved) {
      setState(t('Reconnecting your wallet...'));
      const tryRestore = async (): Promise<void> => {
        if (!tokenAlive(saved.token)) return setState(t('Your session expired. Choose your wallet.'));
        if (saved.wallet === GAME_WALLET) {
          const w = await loadGameWallet().catch(() => null);
          if (w && w.address === saved.address) return finish({ address: w.address, wallet: GAME_WALLET, token: saved.token });
          return setState(t('Choose your wallet.'));
        }
        // El token ya prueba que esta wallet firmó hace poco: la extensión no hace falta para jugar. Si deja reconectar en
        // silencio, se verifica que siga siendo la misma cuenta; si no (la mayoría de las wallets no lo permite), se confía en el token.
        for (let i = 0; i < 6; i++) {
          const w = listWallets().find((x) => x.name === saved.wallet);
          if (w) {
            try {
              const account = await connect(w, true);
              if (account.address !== saved.address) return setState(t('The wallet switched accounts. Choose your wallet.'));
            } catch {
              /* sin permiso previo para reconectar: sigue la sesión guardada */
            }
            break;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
        finish({ address: saved.address, wallet: saved.wallet, token: saved.token });
      };
      void tryRestore();
    }
  });
}
