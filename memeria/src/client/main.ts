import * as THREE from 'three';
import { AssetCache } from '../assets/cache';
import { ZoneStreamer } from '../assets/streamer';
import { CLASS_LIST, ITEMS, MOB_TEMPLATES, NPC_DEFS, QUESTS, SHOPS, getZone } from '../data';
import { playIntro } from './intro';
import { Chat } from './chat';
import { ChatLink } from './net';
import { checkAlias } from '../shared/alias';
import { Remotes } from './remotes';
import { PartyUi } from './party';
import { EMOTES } from '../shared/emotes';
import { Inventory } from './inventory';
import { Hotbar } from './hotbar';
import { buyWithMmria } from './pay';
import { sfx as ui, isMuted, toggleMute } from './sfx';
import { PauseMenu } from './menu';
import { Board } from './board';
import { shareOnX } from './share';
import { enableTouch, wantsTouch } from './touch';
import { LootView } from './loot';
import { setMood, type Mood } from './music';
import { CLASS_FX, Fx } from './fx';
import { selectClass } from './select';
import { enterGate } from './gate';
import { GAME_WALLET, exportGameWalletCode, loadProfile, saveProfile, shortAddress, signOut } from './wallet';
import { checkAliasFree, fetchMe, putProfile, redeemTokens, savePusher } from './api';
import { loadSave, writeSave } from './save';
import { Shop } from './shop';
import { threatOf } from '../shared/rules';
import { GameState } from '../shared/game';
import { TICK_DT } from '../shared/rules';
import type { Command, GameEvent, PlayerClass } from '../shared/types';
import { validateZone } from '../shared/validate';
import { FollowCamera } from './camera';
import { Entities } from './entities';
import { edges, enableMouseLook, movementAxes, releaseMouseLook } from './input';
import { Hud } from './hud';
import { Labels, type NameLabel } from './labels';
import { Minimap } from './minimap';
import { createWorldScene } from './scene';
import { regionAt } from '../shared/collision';
import { lang, t } from '../i18n';
import { setLang, translateDom } from '../i18n/dom';

translateDom();

// Bucle del cliente. La simulación avanza en ticks fijos (TICK_DT). El render, la
// cámara y las etiquetas corren por frame. Entrada -> Command -> GameState.step
// -> events -> feedback. El servidor futuro reemplaza solo la fuente de Commands.

const baseZone = getZone('hodl-hollow');
// ?at=x,z mueve el punto de aparición (para mirar otras partes del mundo).
const at = new URLSearchParams(location.search).get('at')?.split(',').map(Number);
const zone = at && at.length === 2 && at.every(Number.isFinite) ? { ...baseZone, playerStart: [at[0], 0, at[1]] as [number, number, number] } : baseZone;
const issues = validateZone(zone, MOB_TEMPLATES, NPC_DEFS);
if (issues.length > 0) console.warn('[zona] problemas en los datos:', issues);

const session = await enterGate(document.getElementById('select')!);
// Cada wallet es un usuario: su héroe queda guardado y no vuelve a elegir mascota.
// Los invitados de la landing guardan su héroe bajo la clave 'guest' (el modo de pruebas ?cls= no).
const profileOwner = session.address ?? (session.guest ? 'guest' : null);
const token = session.token;
// Perfil y guardado: los del servidor (D1) si responde; si no, la copia de este navegador (que también migra al servidor).
const remote = token ? await fetchMe(token) : null;
const profile = remote?.profile ?? (profileOwner ? loadProfile(profileOwner) : null);
const savedCls = CLASS_LIST.find((c) => c.id === profile?.classId);
let pickedCls = savedCls ?? CLASS_LIST.find((c) => c.id === session.classId);
let skin = savedCls ? (session.skin ?? profile?.skin ?? 0) : (session.skin ?? 0);
// Nombre del héroe: el que eligió el jugador; sin él se muestra la wallet abreviada.
let alias: string | undefined = profile?.alias;
if (!pickedCls) {
  const chosen = await selectClass(document.getElementById('select')!, token ? (n) => checkAliasFree(token, n) : undefined);
  pickedCls = chosen.cls;
  skin = chosen.skin;
  if (chosen.alias) alias = chosen.alias;
}
const cls: PlayerClass = pickedCls;
if (profileOwner) saveProfile(profileOwner, { classId: cls.id, skin, alias });
// Si el servidor no tiene este perfil (jugador nuevo o de antes de D1) o cambió algo, se lo mando. Un nombre ya tomado se descarta.
let aliasNote = '';
const rp = remote?.profile;
if (token && (!rp || rp.classId !== cls.id || (rp.skin ?? 0) !== skin || rp.alias !== alias)) {
  const problem = await putProfile(token, { classId: cls.id, skin, alias });
  if (problem && alias) {
    aliasNote = `${problem} Your name was reset to your wallet; pick another in the menu.`;
    alias = undefined;
    await putProfile(token, { classId: cls.id, skin, alias });
  }
}
await playIntro(document.getElementById('select')!, cls);
// La capa de ingreso está visible desde el HTML (para no mostrar el juego antes de tiempo): ahora se retira.
const gateRoot = document.getElementById('select')!;
gateRoot.style.display = 'none';
gateRoot.className = '';
gateRoot.innerHTML = '';
const game = new GameState(zone, MOB_TEMPLATES, NPC_DEFS, cls, QUESTS, ITEMS, SHOPS);
// Progreso guardado de esta wallet (o del modo de pruebas); sin guardado, kit de inicio.
const saveOwner = profileOwner;
// Entre la copia de este navegador y la del servidor manda la más nueva: si un envío se perdió (red caída, pestaña cerrada), no se retrocede.
const localSave = loadSave(saveOwner);
const saved = remote?.save && localSave ? ((localSave.at ?? 0) > (remote.save.at ?? 0) ? localSave : remote.save) : (remote?.save ?? localSave);
if (saved && (!saved.classId || saved.classId === cls.id)) {
  game.restore(saved);
} else {
  game.addItem('health-potion', 3);
  game.addItem('apple', 2);
}
game.tokens = remote?.tokens ?? 0;
game.payments = remote?.payments ?? false;
// Lo comprado con MMRIA vive en el servidor: si el guardado no lo trae (otro navegador, borrado), se entrega de nuevo.
for (const id of remote?.owned ?? []) game.grant(id);
// Solo en desarrollo: la consola puede dar ítems y mirar el estado (window.__game).
if (import.meta.env.DEV) (window as unknown as { __game: GameState }).__game = game;
// Copia local siempre; al servidor sube como mucho cada 15 s, y de inmediato al cerrar la pestaña.
const pushSave = token ? savePusher(token) : null;
const persist = (force = false): void => {
  const data = game.snapshot();
  writeSave(saveOwner, data);
  pushSave?.(data, force);
};
window.addEventListener('pagehide', () => persist(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist(true);
});
// El guardado de antes de D1 (solo en este navegador) pasa al servidor en el primer arranque.
if (token && (!remote?.save || saved !== remote.save)) persist(true);
const { renderer, scene, camera, follow, atmosphere } = createWorldScene(zone);
const entities = new Entities(scene, camera, game, cls, skin);
const cam = new FollowCamera(camera);
const labels = new Labels(document.getElementById('labels')!, camera);
const hud = new Hud(document);
const chat = new Chat(document);
const inventory = new Inventory(document, game);
inventory.onMessage = (text) => hud.log(text);
// Canje de fichas: solo con servidor (las fichas viven en su base). El servidor las descuenta y deja el pago pendiente.
if (token) {
  inventory.onRedeem = async () => {
    const r = await redeemTokens(token);
    if (!r.ok) {
      ui.error();
      chat.add('system', r.message);
      return r.message;
    }
    game.tokens = r.balance;
    const mmria = r.mmria.toFixed(2);
    const text =
      r.payout === 'paid'
        ? t('Sent! {mmria} MMRIA are in your wallet.', { mmria })
        : t('Redemption accepted: {n} tokens for {mmria} MMRIA. It is being sent to your wallet {addr} and will arrive in a moment.', { n: r.tokens, mmria, addr: session.address ? shortAddress(session.address) : '' });
    chat.add('system', text);
    hud.banner(r.payout === 'paid' ? t('MMRIA sent') : t('Redemption accepted'), t('{mmria} MMRIA on the way', { mmria }));
    return text;
  };
}
const hotbar = new Hotbar(document, game);
hotbar.onMessage = (text) => {
  hud.log(text);
  chat.add('system', text);
};
hotbar.onUsed = () => persist();
const shop = new Shop(document, game);
shop.onMessage = (text) => {
  hud.log(text);
  chat.add('system', text);
  persist();
};
shop.onBuyMmria = (def) => {
  if (!token || shop.paying) return;
  shop.paying = true;
  void buyWithMmria(session, token, def.id, (t) => hud.log(t, 4)).then((r) => {
    shop.paying = false;
    if (!r.ok) {
      ui.error();
      hud.log(r.message, 6);
      chat.add('system', r.message);
      return;
    }
    game.grant(r.itemId);
    persist(true);
    ui.chime();
    hud.banner(t('Purchase complete'), t('{name} is yours', { name: ITEMS[r.itemId]?.name ?? r.itemId }));
    chat.add('system', t('Payment confirmed on Solana. {name} is in your bags.', { name: ITEMS[r.itemId]?.name ?? r.itemId }));
  });
};
const fx = new Fx(scene);
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, zone);

// Assets por zona (streaming). Viven en un grupo propio: no tocan la lógica de juego
// ni las colisiones. Hoy los datos son locales (public/); mañana, un CDN.
const worldGroup = new THREE.Group();
worldGroup.name = 'world-assets';
scene.add(worldGroup);
const assetCache = new AssetCache();
const streamer = new ZoneStreamer({
  parent: worldGroup,
  cache: assetCache,
  baseUrl: '',
  zoneAt: (x, z) => regionAt(zone.geometry, x, z)?.id,
});
streamer.loadWorldIndex().catch((e: unknown) => console.warn('[streaming] índice del mundo:', e));


const lootView = new LootView(scene, labels, (id) => ITEMS[id]?.name ?? id);
const playerLabel = labels.addName(entities.anchorOf(game.player.id)!, game.player.name, 2.5);
const npcLabels = new Map<string, NameLabel>();
for (const n of game.npcs) {
  npcLabels.set(n.id, labels.addName(entities.anchorOf(n.id)!, n.name, entities.heightOf(n.id) + 0.3));
}
const mobLabels = new Map<string, NameLabel>();
for (const m of game.mobs) {
  const handle = labels.addName(entities.anchorOf(m.id)!, mobTitle(m), entities.heightOf(m.id) + 0.65, `name mob ${mobThreat(m)}${game.templates[m.templateId].raid ? ' raid' : ''}`);
  mobLabels.set(m.id, handle);
}
/** Nombre con nivel: «Lv 3 Bear Market». */
function mobTitle(m: { templateId: string }): string {
  const tpl = game.templates[m.templateId];
  return `${tpl.raid ? '☠ RAID · ' : ''}${t('Lv {n}', { n: tpl.level })} ${tpl.name}`;
}
/** Clase CSS según lo peligroso que es el mob para el nivel actual del jugador. */
function mobThreat(m: { templateId: string }): string {
  return `t-${threatOf(game.templates[m.templateId].level, game.player.level)}`;
}
/** Repinta los nombres de los mobs cuando cambia el nivel del jugador. */
function refreshMobThreats(): void {
  for (const m of game.mobs) {
    const h = mobLabels.get(m.id);
    if (h) h.el.className = `name mob ${mobThreat(m)}${game.templates[m.templateId].raid ? ' raid' : ''}`;
  }
}

// Un solo Command reutilizado: el step no lo retiene.
const cmd: Command = { seq: 0, moveX: 0, moveZ: 0, attack: false, skill: false, interact: false, mend: false };
const dir = { x: 0, z: 0 };
// Acciones de un disparo pendientes: se consumen en el primer tick que se ejecute.
const pending = { attack: false, skill: false, interact: false, mend: false };

const style = CLASS_FX[cls.id];
const playerAnchor = entities.anchorOf(game.player.id)!;
const SHOUT: Record<string, string> = { pepe: 'Feels good, man!', shiba: 'AWOOOO!', doge: 'Much wow!', popcat: 'POP POP POP!', wif: 'Hat stays on!' };
// Onomatopeyas de combate: salen sobre el golpe, con rotación al azar.
const SFX = {
  swing: { pepe: ['PIUM!'], shiba: ['SWOOSH!'], doge: ['SHNK!'], popcat: ['pop!', 'pip!'], wif: ['TWANG!'] } as Record<string, string[]>,
  hit: { pepe: ['PSH!', 'ZAP!'], shiba: ['WHAM!', 'THWACK!'], doge: ['SLASH!', 'SHING!'], popcat: ['POP!', 'BOP!'], wif: ['THUNK!', 'THWIP!'] } as Record<string, string[]>,
  skill: { pepe: ['KABOOM!'], shiba: ['ROAAR!'], doge: ['POW!'], popcat: ['POP-POP-POP!'], wif: ['HAT TRICK!'] } as Record<string, string[]>,
  mobWindup: { cub: 'grr!', bear: 'GRRR!', grizzly: 'GRAAAH!', ghost: 'WOOOO~' } as Record<string, string>,
  mobHit: { cub: 'nip!', bear: 'CHOMP!', grizzly: 'CRUNCH!', ghost: 'BOO!' } as Record<string, string>,
};
let lastKind: 'attack' | 'skill' = 'attack';
let skillSfxShown = false;
let sfxCount = 0;
function sfx(anchor: THREE.Object3D, text: string, base: number, foe = false): void {
  labels.pop(anchor, text, foe ? 'sfx foe' : 'sfx', { base, rot: Math.round((Math.random() - 0.5) * 28) });
}
const pickOf = (list: string[]): string => list[sfxCount++ % list.length];
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

chat.add('system', wantsTouch() ? t('Welcome to Memeria. Stick moves · drag the world to turn the camera · buttons attack, use skills and talk.') : t('Welcome to Memeria. Click the world to look around with the mouse or trackpad (Esc frees it) · WASD move · Space attack · R skill · F talk · I inventory · L ranking · Enter chat · M sound.'));
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyM' || e.repeat || e.target instanceof HTMLInputElement) return;
  chat.add('system', toggleMute() ? t('Sound off.') : t('Sound on.'));
});
if (!wantsTouch()) chat.add('system', t('P opens the Party panel · H casts Mend on a hurt friend · /p talks to your party.'));
chat.add('system', t('{name} the {role} arrives in Hodl Hollow.', { name: cls.name, role: cls.role }));
setMood('town');
if (session.address) {
  const chip = document.getElementById('wallet-chip')!;
  chip.hidden = false;
  chip.textContent = `\u25C6 ${shortAddress(session.address)}`;
  chip.addEventListener('mousedown', (e) => e.stopPropagation());
  chip.addEventListener('click', () => void signOut(session).then(() => location.reload()));
  chat.add('system', t('Wallet {addr} connected ({wallet}).', { addr: shortAddress(session.address), wallet: session.wallet }));
}
// Chat global: lo que escribís va al Worker y vuelve a todos (incluido vos). Sin conexión queda local.
const nameOf = (): string => alias ?? (session.address ? shortAddress(session.address) : `${cls.name} (guest)`);
let chatName = nameOf();
labels.setText(playerLabel, chatName);
const link = new ChatLink(() => chatName, token);
if (aliasNote) chat.add('system', aliasNote);
game.net = link;
// Quién soy para el ranking: la wallet, o un id de invitado que queda en este navegador.
const guestId = ((): string => {
  try {
    let g = localStorage.getItem('memeria.gid');
    if (!g) localStorage.setItem('memeria.gid', (g = `guest:${crypto.randomUUID().slice(0, 12)}`));
    return g;
  } catch {
    return `guest:${crypto.randomUUID().slice(0, 12)}`;
  }
})();
const heroKey = session.address ?? guestId;
let linkWasUp = false;
let worldShared = false;
// Mundo compartido: los mobs y el botín los lleva el servidor; acá solo se reflejan.
link.onWorld = (mobs, drops) => {
  game.applyMobs(mobs, true);
  game.applyDrops(drops);
  if (!worldShared) chat.add('system', t('The world is shared: every Bear Market you see is fought over by everyone online.'));
  worldShared = true;
};
link.onMobs = (list) => game.applyMobs(list);
link.onMobStrike = (id, dmg) => game.applyMobStrike(id, dmg);
link.onRemoteHit = (id, amount) => game.applyRemoteHit(id, amount);
link.onKill = (tpl) => game.applyKill(tpl);
link.onDrop = (d) => game.applyDrop(d);
link.onDropGone = (id) => game.applyDropGone(id);
link.onLoot = (coins, items, tokens, balance) => game.applyLoot(coins, items, tokens, balance);
// Burbuja sobre la cabeza de quien habla: la mía, o la del jugador remoto con ese id.
const bubbleAnchor = (id?: string): THREE.Object3D | undefined =>
  !id ? undefined : id === link.myId ? entities.anchorOf(game.player.id) : remotes.anchorOf(id);
const EMOTE_HELP = t('Emotes: {list} · /me <action> · type @name to call someone.', { list: Object.keys(EMOTES).map((k) => `/${k}`).join(' ') });
link.onLine = (l) => {
  const anchor = bubbleAnchor(l.id);
  if (anchor) labels.clearBubble(anchor); // sale el «escribiendo...» y entra el mensaje
  if (l.kind === 'party') {
    chat.add('party', l.text, `${t('Party')} · ${l.name}`, { cls: l.cls, lvl: l.lvl });
    if (l.id !== link.myId) ui.open();
    return;
  }
  if (l.kind === 'announce') {
    chat.add('announce', l.text, undefined, { tone: l.tone });
    return;
  }
  const meta = { cls: l.cls, lvl: l.lvl };
  if (l.kind === 'emote') {
    chat.add('emote', `${t(l.text)}${l.emoji ? ' ' + l.emoji : ''}`, l.name, meta);
    if (anchor) labels.bubble(anchor, l.emoji ? `${l.emoji} ${t(l.text)}` : `*${t(l.text)}*`, 'emote', undefined, 4.5);
    return;
  }
  const mention = l.id !== link.myId && chatName.length > 2 && l.text.toLowerCase().includes(chatName.toLowerCase());
  chat.add('say', l.text, l.name, { ...meta, mention });
  if (mention) ui.open();
  if (anchor) labels.bubble(anchor, l.text, 'say');
};
link.onTyping = (id) => {
  const anchor = remotes.anchorOf(id);
  if (anchor) labels.bubble(anchor, '•••', 'typing', 2.55, 2.5);
};
chat.onTypingStart = () => link.typing();
link.onOnline = (n) => {
  if (!linkWasUp) chat.add('system', t('Global chat connected \u00B7 {n} online.', { n }));
  linkWasUp = true;
};
link.onStatus = (up) => {
  if (!up && linkWasUp) {
    worldShared = false;
    chat.add('system', t('Disconnected from the server. Playing offline while we reconnect...'));
    linkWasUp = false;
  }
};
chat.onSend = (text) => {
  if (/^\/(help|emotes|\?)$/i.test(text)) {
    chat.add('system', EMOTE_HELP);
    return;
  }
  if (party.command(text)) return;
  if (link.send(text)) return;
  // Sin conexión: se ve igual, solo para mí.
  chat.add('say', text, cls.name);
  const mine = entities.anchorOf(game.player.id);
  if (mine) labels.bubble(mine, text, 'say');
};
const remotes = new Remotes(scene, labels);
link.onPeer = (p) => remotes.upsert(p);
link.onLeft = (id) => remotes.remove(id);
const prevStatus = link.onStatus;
link.onStatus = (up) => {
  prevStatus(up);
  if (!up) remotes.clear();
};
let posTimer = 0;
let lastSentX = NaN;
let lastSentZ = NaN;
let lastSentR = NaN;
let lastSentHp = NaN;
let sinceSent = 0;
/** Cuenta dónde estoy a los demás: hasta 10 veces por segundo si me moví, y un latido cada 2 s si no. */
function sharePosition(dt: number): void {
  posTimer -= dt;
  sinceSent += dt;
  if (posTimer > 0 || !link.up) return;
  posTimer = 0.1;
  const p = game.player;
  const moved = p.x !== lastSentX || p.z !== lastSentZ || p.facing !== lastSentR || Math.ceil(p.hp) !== lastSentHp;
  if (!moved && sinceSent < 2) return;
  sinceSent = 0;
  lastSentX = p.x;
  lastSentZ = p.z;
  lastSentR = p.facing;
  lastSentHp = Math.ceil(p.hp);
  link.sendPos({ name: chatName, cls: cls.id, skin, x: p.x, z: p.z, r: p.facing, key: heroKey, lvl: p.level, hp: lastSentHp, maxHp: p.maxHp });
}
// Party y curaciones entre amigos. El servidor lleva la party; acá se dibuja y se manda lo que hago.
const party = new PartyUi(document, link, remotes, {
  myId: () => link.myId,
  log: (text, seconds) => hud.log(text, seconds),
  say: (text) => chat.add('system', text),
});
game.mendTarget = () => party.mendTarget(game.player);
link.onMendRefused = () => game.refundMend();
link.onHeal = ({ from, name, to, amt }) => {
  const target = to === link.myId ? playerAnchor : remotes.anchorOf(to);
  const src = from === link.myId ? playerAnchor : remotes.anchorOf(from);
  if (target) {
    labels.pop(target, `+${amt}`, 'heal', { base: 2.8 });
    fx.ring(target.position.x, target.position.z, 0x7dffa6, 0.3, 2.2, 0.6);
    fx.sparks(target.position.x, 1.2, target.position.z, 0x7dffa6, 12, 4);
    fx.pillar(target.position.x, target.position.z, 0x7dffa6, 0.8, 0.6);
  }
  if (src && target && src !== target) {
    _from.set(src.position.x, 1.8, src.position.z);
    _to.set(target.position.x, 1.3, target.position.z);
    fx.bolt(_from, _to, 0x7dffa6);
  }
  if (to === link.myId) game.applyHeal(amt, name);
  else if (from !== link.myId) chat.add('combat', t('{from} heals {to} for {n}.', { from: name, to: party.party?.members.find((m) => m.id === to)?.name ?? '?', n: amt }));
};
link.connect();

const board = new Board(document, link, { clsId: cls.id, clsName: cls.name, key: heroKey });
const langBtn = document.getElementById('pause-lang')!;
langBtn.textContent = lang === 'es' ? 'English' : 'Español';
langBtn.addEventListener('click', () => setLang(lang === 'es' ? 'en' : 'es'));
document.getElementById('pause-share')!.addEventListener('click', () => {
  shareOnX(t("I'm a level {lvl} {cls} in Memeria, a browser RPG of memecoin mascots. Come fight with me.", { lvl: game.player.level, cls: cls.name }));
});
// Respaldo de la wallet del juego: el código permite recuperar el héroe en otro navegador o si se borran los datos.
if (session.wallet === GAME_WALLET) {
  const btn = document.getElementById('pause-backup') as HTMLButtonElement;
  const box = document.getElementById('pause-backupbox') as HTMLFormElement;
  const codeEl = document.getElementById('pause-backupcode') as HTMLInputElement;
  const msg = document.getElementById('pause-backupmsg')!;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    box.hidden = !box.hidden;
    if (box.hidden) return;
    void exportGameWalletCode().then((code) => {
      codeEl.value = code ?? '';
      msg.textContent = code
        ? t('Keep this code secret: whoever has it controls your hero. Paste it in "Restore with backup code" at login.')
        : t('This wallet was created before backups existed and cannot be exported.');
    });
  });
  document.getElementById('pause-backupcopy')!.addEventListener('click', () => {
    if (!codeEl.value) return;
    codeEl.select();
    void navigator.clipboard?.writeText(codeEl.value).then(
      () => (msg.textContent = t('Copied. Save it somewhere safe.')),
      () => (msg.textContent = t('Select the code and copy it by hand.')),
    );
  });
}
const pauseMenu = new PauseMenu(document, {
  busy: () => inventory.isOpen || board.isOpen || party.isOpen || !!game.openShop || document.body.classList.contains('typing'),
  muted: isMuted,
  name: () => chatName,
  // Texto vacío vuelve a la wallet abreviada; devuelve el motivo si el nombre no sirve.
  rename: async (raw) => {
    let next: string | undefined;
    if (raw.trim()) {
      const r = checkAlias(raw);
      if (!r.ok) return r.error;
      next = r.alias;
    }
    // El servidor decide: si el nombre ya es de otro, lo rechaza.
    if (token) {
      const problem = await putProfile(token, { classId: cls.id, skin, alias: next });
      if (problem) return problem;
    }
    alias = next;
    chatName = nameOf();
    labels.setText(playerLabel, chatName);
    if (profileOwner) saveProfile(profileOwner, { classId: cls.id, skin, alias });
    link.renamed();
    return null;
  },
  toggleMute: () => void toggleMute(),
  exit: () => {
    persist(true);
    link.close();
    void signOut(session).then(() => location.reload());
  },
});

if (wantsTouch()) enableTouch(pauseMenu, renderer.domElement);
else enableMouseLook(renderer.domElement);

function skillFx(): void {
  const p = playerAnchor.position;
  const R = cls.skill.range;
  const c = style.color;
  fx.ring(p.x, p.z, c, 0.5, R, 0.55);
  fx.ring(p.x, p.z, 0xffffff, 0.3, R * 0.7, 0.35);
  fx.faces(p.x, p.z, style.face, cls.id === 'doge' ? 5 : 7, R * 0.9, 0.95);
  fx.sparks(p.x, 1.2, p.z, c, 14, 6);
  if (cls.id === 'pepe') fx.pillar(p.x, p.z, c, 1.1, 0.7);
  if (cls.id === 'shiba') fx.ring(p.x, p.z, 0xffd27a, 0.2, R * 1.1, 0.75);
  if (cls.id === 'doge') fx.coins(p.x, p.z, 10, 1.1);
  if (cls.id === 'popcat') fx.pillar(p.x, p.z, 0xffb3c8, 0.8, 0.5);
  if (cls.id === 'wif') fx.ring(p.x, p.z, 0xffd0e4, 0.2, R * 1.05, 0.7);
  labels.pop(playerAnchor, SHOUT[cls.id], 'cast');
  chat.add('combat', t('{name} unleashes {skill}!', { name: cls.name, skill: cls.skill.name }));
}

function handleEvents(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'swing':
        entities.startSwing(e.windup);
        if (e.kind === 'skill') fx.charge(playerAnchor, style.color, cls.skill.range * 0.7, e.windup);
        break;
      case 'strike': {
        const p = playerAnchor.position;
        lastKind = e.kind;
        skillSfxShown = false;
        if (e.kind === 'attack') sfx(playerAnchor, pickOf(SFX.swing[cls.id]), 2.3);
        if (e.kind === 'skill') {
          skillFx();
        } else if (cls.ranged) {
          const tgt = e.targetId ? entities.anchorOf(e.targetId) : undefined;
          _from.set(p.x + Math.sin(game.player.facing) * 0.8, 2.3, p.z + Math.cos(game.player.facing) * 0.8);
          if (tgt) _to.set(tgt.position.x, 1.0, tgt.position.z);
          else _to.set(p.x + Math.sin(game.player.facing) * 5, 1.2, p.z + Math.cos(game.player.facing) * 5);
          fx.bolt(_from, _to, style.color);
        } else {
          fx.slash(p.x, p.z, game.player.facing, cls.attack.range, style.color);
        }
        break;
      }
      case 'mobWindup': {
        const anchor = entities.anchorOf(e.id);
        const mob = game.mobs.find((m) => m.id === e.id);
        if (anchor && mob) {
          fx.telegraph(anchor, game.templates[mob.templateId].attackRange * 1.35, e.duration);
          sfx(anchor, SFX.mobWindup[mob.templateId] ?? 'GRR!', entities.heightOf(e.id) + 0.2, true);
        }
        break;
      }
      case 'damage': {
        entities.flashHit(e.targetId);
        const anchor = entities.anchorOf(e.targetId);
        if (e.remote) {
          // Le pegó otro jugador: solo el número, sin onomatopeya ni línea de combate.
          if (anchor) labels.pop(anchor, `-${e.amount}`, 'hit');
          break;
        }
        const toPlayer = e.targetId === 'player';
        if (anchor) {
          labels.pop(anchor, `-${e.amount}`, toPlayer ? 'hurt' : 'hit');
          fx.sparks(anchor.position.x, 1.2, anchor.position.z, toPlayer ? 0xff4040 : style.color, 8);
        }
        if (anchor && toPlayer) {
          const src = game.mobs.find((m) => m.id === e.sourceId);
          sfx(anchor, SFX.mobHit[src?.templateId ?? ''] ?? 'OUCH!', 1.9, true);
        } else if (anchor && (lastKind === 'attack' || !skillSfxShown)) {
          sfx(anchor, pickOf(lastKind === 'skill' ? SFX.skill[cls.id] : SFX.hit[cls.id]), 1.7);
          if (lastKind === 'skill') skillSfxShown = true;
        }
        if (toPlayer) {
          hud.hurt();
          chat.add('combat', t('{name} hits you for {n}.', { name: game.nameOf(e.sourceId), n: e.amount }));
        } else {
          chat.add('combat', t('You hit {name} for {n}.', { name: game.nameOf(e.targetId), n: e.amount }));
        }
        break;
      }
      case 'death': {
        const anchor = entities.anchorOf(e.id);
        if (anchor) {
          fx.sparks(anchor.position.x, 0.8, anchor.position.z, 0xb59cff, 16, 5);
          sfx(anchor, 'POOF!', 1.2);
        }
        hud.log(t('{name} defeated', { name: game.nameOf(e.id) }), 1.5);
        chat.add('combat', t('{name} is defeated.', { name: game.nameOf(e.id) }));
        break;
      }
      case 'respawn':
        break;
      case 'talk':
        ui.open();
        hud.say(e.name, e.text);
        chat.add('story', e.text, e.name);
        break;
      case 'shop':
        shop.greeting = e.text;
        chat.add('story', e.text, e.name);
        break;
      case 'mend': {
        const p = playerAnchor.position;
        fx.ring(p.x, p.z, 0x7dffa6, 0.4, 2.6, 0.5);
        labels.pop(playerAnchor, 'MEND', 'cast');
        ui.confirm();
        break;
      }
      case 'healed':
        ui.chime();
        hud.log(t('{name} heals you for {n}.', { name: e.from, n: e.amount }), 3);
        chat.add('system', t('{name} heals you for {n}.', { name: e.from, n: e.amount }));
        break;
      case 'playerDeath':
        hud.log(t('You fell. You wake up by the Lantern Well, a few coins lighter.'), 4);
        chat.add('system', t('You fell. You wake up by the Lantern Well, a few coins lighter.'));
        break;
      case 'xp':
        labels.pop(playerAnchor, `+${e.amount} XP`, 'xp');
        chat.add('system', t('You gain {n} XP.', { n: e.amount }));
        break;
      case 'drop':
        lootView.add(e.drop);
        break;
      case 'dropGone':
        lootView.remove(e.id);
        break;
      case 'loot': {
        fx.sparks(playerAnchor.position.x, 1.1, playerAnchor.position.z, 0xffd35a, 10, 3);
        ui.confirm();
        const found = e.items.map((id) => ITEMS[id]?.name ?? id);
        if (e.coins > 0) labels.pop(playerAnchor, t('+{n} coins', { n: e.coins }), 'xp');
        if (e.tokens) {
          labels.pop(playerAnchor, `+${e.tokens} MMRIA`, 'xp');
          fx.sparks(playerAnchor.position.x, 1.4, playerAnchor.position.z, 0xffe680, 14, 4);
          hud.log(t(e.tokens > 1 ? '+{n} MMRIA tokens' : '+{n} MMRIA token', { n: e.tokens }), 2.5);
        }
        const parts = [t('{n} coins', { n: e.coins }), ...(e.tokens ? [t(e.tokens > 1 ? '{n} MMRIA tokens' : '{n} MMRIA token', { n: e.tokens })] : []), ...found];
        chat.add('system', t('You find {list}.', { list: parts.join(', ') }));
        break;
      }
      case 'levelUp':
        ui.levelUp();
        refreshMobThreats();
        persist();
        hud.banner(t('LEVEL UP'), t('You reached level {n}. Health and mana restored.', { n: e.level }));
        chat.add('system', t('Level up! You are now level {n}.', { n: e.level }));
        fx.ring(playerAnchor.position.x, playerAnchor.position.z, 0xffe58a, 0.5, 4, 0.8);
        fx.pillar(playerAnchor.position.x, playerAnchor.position.z, 0xffe58a, 1.2, 0.9);
        break;
      case 'quest':
        if (e.kind === 'accepted') {
          ui.confirm();
          hud.banner(t('Quest accepted'), e.title);
          chat.add('story', t('Quest accepted: {title}.', { title: e.title }));
        } else if (e.kind === 'ready') {
          ui.chime();
          hud.log(t('Objective complete: {title}. Return to the quest giver.', { title: e.title }), 4);
          chat.add('story', t('Objective complete: {title}. Return to the quest giver.', { title: e.title }));
        } else {
          ui.chime();
          hud.banner(t('Quest complete'), `${e.title} · +${e.xp} XP · ${t('+{n} coins', { n: e.coins ?? 0 })}`);
          chat.add('story', t('Quest complete: {title}. +{xp} XP, +{coins} coins.', { title: e.title, xp: e.xp ?? 0, coins: e.coins ?? 0 }));
          if (e.items?.length) chat.add('story', t('You receive {list}.', { list: e.items.map((id) => ITEMS[id]?.name ?? id).join(', ') }));
          persist();
        }
        break;
      case 'info':
        // Acción rechazada (sin MP, en recarga, nadie para hablar): zumbido; el resto del texto, no.
        if (e.error) ui.error();
        hud.log(e.text, 2.5);
        chat.add('system', e.text);
        break;
    }
  }
}

let wasSafe = game.inSafeZone;
const clockEl = document.getElementById('clock')!;
let clockTimer = 0;
let lastPhase = atmosphere.phase;
let lastBlood = false;
/** Reloj del mundo y avisos de amanecer, atardecer, noche y Luna de Sangre. */
function updateClock(dt: number): void {
  clockTimer -= dt;
  if (clockTimer <= 0) {
    clockTimer = 1;
    const icon = atmosphere.night > 0.5 ? (atmosphere.bloodMoon ? `\u263E ${t('BLOOD MOON')}` : '\u263E') : '\u2600';
    clockEl.textContent = `${icon} ${atmosphere.clockText}`;
    clockEl.classList.toggle('blood', atmosphere.bloodMoon);
  }
  if (atmosphere.phase !== lastPhase) {
    lastPhase = atmosphere.phase;
    if (lastPhase === 'dawn') chat.add('system', t('Dawn breaks over Memeria.'));
    else if (lastPhase === 'dusk') chat.add('system', t('The sun sets. Fireflies wake in the fields.'));
    else if (lastPhase === 'night') chat.add('system', t('Night falls over Memeria.'));
  }
  if (atmosphere.bloodMoon !== lastBlood) {
    lastBlood = atmosphere.bloodMoon;
    if (lastBlood) {
      hud.banner(t('BLOOD MOON'), t('The sky bleeds over Memeria. Hold the line.'));
      chat.add('story', t('A Blood Moon rises over Memeria.'));
      ui.chime();
    }
  }
}

/** Tema que toca ahora: villa, combate (un mob cerca), ruinas o campo. */
function currentMood(): Mood {
  if (game.inSafeZone) return 'town';
  const p = game.player;
  if (game.mobs.some((m) => m.alive && Math.hypot(m.x - p.x, m.z - p.z) < 8)) return 'battle';
  const region = regionAt(zone.geometry, p.x, p.z)?.id;
  return region === 'estepa' || region === 'canon' || region === 'pozo' ? 'ruins' : 'field';
}
let moodTimer = 0;
let barkTimer = 6;
/** Un NPC cercano dice una frase corta en voz alta: la villa se siente viva aunque nadie hable con ellos. */
function npcBark(): void {
  if (game.openShop) return;
  const near = game.npcs.filter((n) => Math.hypot(n.x - game.player.x, n.z - game.player.z) < 14);
  if (!near.length) return;
  const n = near[Math.floor(Math.random() * near.length)];
  const sentences = n.lines.flatMap((l) => l.split(/(?<=[.!?])\s+/)).filter((t) => t.length >= 8 && t.length <= 80);
  const anchor = entities.anchorOf(n.id);
  if (anchor && sentences.length) labels.bubble(anchor, sentences[Math.floor(Math.random() * sentences.length)], 'npc', entities.heightOf(n.id) + 0.9, 5);
}
let saveTimer = 10;
// ?slow=0.2 corre el juego en cámara lenta (para revisar animaciones y efectos).
const timeScale = Number(new URLSearchParams(location.search).get('slow')) || 1;
let last = performance.now();
let acc = 0;
let minimapTimer = 0;

function frame(now: number): void {
  // El primer fotograma puede traer una marca de tiempo anterior a `last`: sin el piso en 0, el dt negativo congelaba el reloj y el simulador.
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.25)) * timeScale;
  last = now;
  acc += dt;

  // Acciones de un disparo: se copian y se limpian del teclado, quedan pendientes hasta un tick.
  if (edges.attack) pending.attack = true;
  if (edges.skill) pending.skill = true;
  if (edges.interact) pending.interact = true;
  if (edges.mend) pending.mend = true;
  edges.attack = edges.skill = edges.interact = edges.mend = false;

  const axes = movementAxes();
  cam.worldDirection(axes.forward, axes.side, dir);

  while (acc >= TICK_DT) {
    cmd.seq++;
    cmd.moveX = dir.x;
    cmd.moveZ = dir.z;
    cmd.attack = pending.attack;
    cmd.skill = pending.skill;
    cmd.interact = pending.interact;
    cmd.mend = pending.mend;
    pending.attack = pending.skill = pending.interact = pending.mend = false;

    game.step(cmd, TICK_DT);
    handleEvents(game.events);
    acc -= TICK_DT;
  }

  cam.update(game.player.x, game.player.z, dt);
  follow(game.player.x, game.player.z);
  atmosphere.update(dt, camera, game.player.x, game.player.z);
  entities.sync(game, dt);

  // Etiquetas: nombre del jugador, mobs (solo vivos) y NPCs con indicador de interacción.
  const near = game.nearbyNpc();
  for (const n of game.npcs) {
    const h = npcLabels.get(n.id)!;
    labels.setText(h, near === n ? `[F] Talk · ${n.name}` : `${n.name} · ${n.title}`);
    // Con campamentos lejanos en el mapa, los nombres de NPC también se muestran solo de cerca.
    labels.setVisible(h, Math.hypot(n.x - game.player.x, n.z - game.player.z) < 40);
  }
  barkTimer -= dt;
  if (barkTimer <= 0) {
    barkTimer = 9 + Math.random() * 9;
    npcBark();
  }
  // Nombres de mobs solo cerca: con el mapa grande, los lejanos se amontonaban en el horizonte.
  for (const m of game.mobs) {
    const d = Math.hypot(m.x - game.player.x, m.z - game.player.z);
    labels.setVisible(mobLabels.get(m.id)!, m.alive && d < 26);
  }
  labels.setText(playerLabel, game.player.name);

  if (game.inSafeZone !== wasSafe) {
    wasSafe = game.inSafeZone;
    chat.add('system', wasSafe ? t('You enter {zone}. You sheathe your weapon.', { zone: game.zoneLabel }) : t('You leave the safe zone. You draw your weapon.'));
  }
  saveTimer -= dt;
  if (saveTimer <= 0) {
    saveTimer = 10;
    persist();
  }
  moodTimer -= dt;
  if (moodTimer <= 0) {
    moodTimer = 0.5;
    setMood(currentMood());
  }
  updateClock(dt);
  sharePosition(dt);
  remotes.update(dt, now / 1000);
  lootView.update(now / 1000);
  fx.update(dt);
  hud.update(game, dt);
  inventory.update();
  hotbar.update(dt);
  // Paneles abiertos o chat: el cursor vuelve para poder hacer click.
  if (inventory.isOpen || board.isOpen || party.isOpen || game.openShop || document.body.classList.contains('typing')) releaseMouseLook();
  board.update(dt);
  party.update(dt, game.player);
  shop.update();
  streamer.update(game.player.x, game.player.z);

  minimapTimer -= dt;
  if (minimapTimer <= 0) {
    const found = minimap.draw(game);
    if (found) {
      const line = t('A RAID BOSS stirs nearby. It cannot be beaten alone: bring a full party (P).');
      hud.log(line, 6);
      chat.add('system', line);
      hud.banner('☠ RAID BOSS', t(found));
    }
    minimapTimer = 0.1;
  }

  renderer.render(scene, camera);
  // Después del render: la cámara ya tiene sus matrices del frame actual para proyectar etiquetas.
  labels.update(dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Exposición mínima para depuración desde la consola y pruebas automatizadas.
Object.assign(window, { __game: game, __streamer: streamer, __renderer: renderer, __scene: scene });
