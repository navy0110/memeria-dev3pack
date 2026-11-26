# Meme RPG — plan

Estado al 2026-10-26. El juego es **English first**: todo texto visible va en inglés.

## Visión

Mundo de **Memeria**, un reino de mascotas memecoin. Hace tiempo los **Founders** construyeron el Lantern Well y se fueron con la receta, la caldera y el tesoro en una sola noche: el **Great Rug Pull**. Desde entonces los Bear Markets muerden los caminos y los Rug Pull Ghosts flotan en el pantano. Las **recipes** perdidas están dispersas por el mundo; sin ellas la forja no despierta.

## Economía (dos monedas)

| Moneda | Cómo se consigue | Para qué sirve |
|---|---|---|
| **Coins** | Caen de los mobs y misiones. Se farmean sin límite. | Pociones, comida, equipo básico y medio. |
| **MMRIA** (token Memeria) | Se compra afuera con wallet. | Recipes y materiales de gama alta, equipo top en el Grocery Store. |

Regla de diseño: el token da **acceso** (recipes, materiales), no armas ya hechas; hay que craftear. Los coins de los mobs nunca alcanzan para el mejor equipo.

Aviso: vender un token por dinero real tiene implicancias legales. Primero devnet; el lanzamiento real se decide aparte. Cero promesas financieras en el juego.

## Progresión (armonizada el 2026-10-26)

Escalera de dificultad, de la villa hacia afuera. El nivel del mob se ve en su nombre (`Lv 3 Bear Market`) y el color dice qué tan peligroso es para tu nivel (gris, verde, amarillo, naranja, rojo).

| Zona | Mob | Lv | HP | Daño | XP base |
|---|---|---|---|---|---|
| Diamond Meadow | Bearish Cub | 1 | 40 | 5 | 14 |
| Bagholder Fields / Moonlit Road | Bear Market | 3 | 70 | 8 | 24 |
| Ruins of the First Mint | Capitulation Grizzly | 5 | 120 | 12 | 42 |
| Rug Pull Marsh | Rug Pull Ghost | 7 | 140 | 16 | 70 |

- **XP por kill** (`xpForKill`): +10 % por nivel de ventaja del mob (tope +50 %); −25 % por nivel de ventaja del jugador (piso 10 %). Farmear lo fácil casi no rinde, así que subir de nivel empuja a la zona siguiente.
- **Curva** (`xpForLevel`): `40·L^1.8 + 20`. Simulado: capítulo 1 completo hacia el nivel 7-8 (~50 kills) y nivel 10 a ~150 kills. El tope pasó a **nivel 20** el 2026-10-28 (ver «Expansión: capítulos 2 a 4»).
- **Misiones** (cadena que sigue la escalera): The Dry Well (Elder, bears, Lv 2) → Hold the Line (Elder, grizzlies, Lv 5) → Ghosts of the Rug (Bruno, ghosts, Lv 7, cierra el capítulo). El nivel es recomendado, no una puerta.
- **Guardado** (`src/client/save.ts`, `GameState.snapshot/restore`): nivel, XP, monedas, inventario y misiones por wallet, en localStorage cada 10 s, al subir de nivel, al cerrar una misión y al cerrar la pestaña. Con servidor irá en D1 con la misma forma. Los guardados viejos se sanean al cargar.
- **Falta**: habilidades por nivel, recipes y crafteo, visuales de armadura y el balance de las dos clases nuevas (no se jugaron en combate).

## Tiendas y equipo

- **Gary the Grocer**: Apple 6c, Health Potion 25c (cura 40), Greater Potion 70c (cura 100). **Diamond Dan**: equipo de coins. Se habla con F; la ventana se cierra sola al alejarse, con × o con Escape. Se vende cualquier ítem con precio de venta (pelts 8c, wisps 18c, pociones, equipo a ~40 % del precio de compra).
- **Equipo**: una casilla de arma (una línea por clase) y una de armadura (todas las clases). El arma suma daño plano (a la habilidad, la mitad) antes del escalado por nivel; la armadura multiplica el daño recibido por `100 / (100 + 2·defensa)`. Equipar exige nivel y clase; el equipo equipado no se vende.

| Tier | Nivel | Arma | Armadura | Precio arma / armadura |
|---|---|---|---|---|
| 1 | 2 | +3 | 6 | 60c / 50c |
| 2 | 5 | +7 | 14 | 280c / 250c |
| 3 | 8 | +12 | 26 | 900c / 800c |

- **Monedas**: kills (cub 1-3, bear 3-7, grizzly 6-12, ghost 10-20), venta de materiales y recompensas de misión (40 / 150 / 300). El tier 3 completo (1700c) pide farmear la zona 4; es a propósito.
- **Posada** (Tom): descansar cuesta 3 monedas por nivel y devuelve vida y maná.

## Mascotas, paletas y armas especiales

- **Cinco mascotas**: Pepe (Mage), Shiba (Warrior), Doge (Rogue), **Popcat (Monk)**, rápido y de puño corto, y **Dogwifhat (Ranger)**, arquero de 6,5 m. Son interpretaciones propias; los modelos están en `src/client/mascots.ts` y el arte de la landing en `public/art/`.
- **Cuatro paletas por mascota** (`src/data/skins.ts`): Classic, Shadow, Aurora y Twilight. Son giros de tono sobre los colores del cuerpo, así que no hay un modelo por paleta. Se elige en la landing (puntos de color en cada card) o en el selector (← →). Se guarda con el héroe de la wallet.
- **Armas con modelo propio** (`src/client/weapons.ts`): la forma sale de la clase (espada, daga, bastón, bo, arco) y el aspecto del `look` del ítem. Los tiers de monedas van de sobrios a brillantes; cada ítem se ve en la mano al equiparlo.
- **Armas especiales** (una por clase, `rarity: 'legendary'`): Candle Cutter, Moonbreaker, Genesis Scepter, Poppin' Heavenly Bo y Hattrick Starbow. Daño +20, nivel 8, **solo se pagan en MMRIA** (2.500, precio provisorio). Más corpulentas, con halo, brasas, anillos u órbitas. En la herrería hay una **vista previa 3D** que gira, y arranca mostrando la especial de tu clase. Hoy el botón dice "Soon": se habilita cuando exista el token y la verificación de compras en el servidor.
- **Pendiente de decidir**: las armas especiales dan +8 de daño sobre el mejor arma de monedas (+12). Es la palanca pay-to-win; el alcance sigue abierto (ver preguntas).

## Próximos pasos (cierre del 2026-10-26)

1. Conectar **memeria.fun** (zona en Cloudflare, nameservers, ruta `custom_domain`).
2. **Web3 completo**: servidor con nonce y verificación de firma, guardado en D1, token MMRIA en devnet (`pnpm token:create` listo, falta SOL de devnet).
3. **Looting**: drops, recipes y crafteo; las armas especiales con MMRIA cuando exista el servidor que verifique compras.

## Reparto de NPCs (beta)

| Id | Nombre | Rol | Dónde |
|---|---|---|---|
| `elder-hodl` | Elder Hodl | Dador de misiones | Fuente de la villa |
| `bruno-scout` | Bruno the Scout | Misiones | Entrada este |
| `tom-innkeeper` | Tom the Innkeeper | Posada | Last Block Inn |
| `ana-trader` | Ana the Alchemist | Recipes (más adelante) | Casa oeste |
| `diamond-dan` | Diamond Dan | Herrero, crafteo | Forja |
| `paper-hands-pete` | Paper Hands Pete | Pociones baratas | Villa oeste |
| `whale-wanda` | Whale Wanda | Banquera, canje del token | Villa este |
| `degen-dex` | Degen Dex | Apuestas, humor | Callejón |
| `exit-eddie` | Exit Liquidity Eddie | Humor | Borde sur |
| `gary-grocer` | Gary the Grocer | **Grocery Store** | Puesto de la villa |
| `mod-mike` | Mod Mike | Guardia | Puerta este |
| `last-founder` | The Last Founder | Lore, pistas de recipes | Entrada de las ruinas |

## Hoja de ruta

- [x] Demo single-player: combate, XP, misiones, interfaz estilo Final Fantasy.
- [x] **Beta de NPCs**: reparto memecoin con modelos propios y diálogos.
- [x] Inventario en la barra de acciones (tecla I), monedas y drops básicos.
- [x] Tiendas con menú de compra y venta: Gary (provisiones) y Dan (equipo), se abren con F (`src/client/shop.ts`, `data/shops.ts`). Faltan los interiores y la posada.
- [x] Música: SummerTown (villa) y Heat Adventure (campo), ambas CC0, en `public/music/` (fuera de git, créditos en CREDITS.txt); cruce al salir de la zona segura (`src/client/music.ts`, con respaldo sintetizado). Para producción irán a R2.
- [x] Ítems de equipo (arma por clase y armadura, 3 tiers) y comprar/vender con monedas; se equipan desde el inventario.
- [ ] Recipes y crafteo (recipe = ítem; sin ella el banco no deja forjar).
- [ ] Multiplayer: `GameState` pasa a varios jugadores y corre en un Durable Object por zona.
- [x] Entrada **como invitado** desde la landing («or play as a guest» y fila en el modal): sin wallet, el héroe y el progreso quedan en este navegador bajo la clave `guest`. Mientras no haya web3 completo es la vía principal para probar.
- [x] Música de la landing: «Heroes Theme» de Alexandr Zhelanov (CC BY 3.0, 1,8 MB, `public/music/hero.mp3`); crédito en el pie de la landing y en `CREDITS.txt`. Arranca con el primer gesto del usuario (política de autoplay) y hay un botón ♪ para silenciarla; la landing no precarga las pistas del juego.
- [x] Ingreso con wallet de Solana (Phantom/MetaMask o wallet del juego creada en el navegador, clave no extraíble): conectar, firmar mensaje, usuario = wallet. El nonce y la verificación son del cliente; **falta el servidor** que emita el nonce y verifique.
- [x] Token $MMRIA creado en mainnet por pump.fun el 2026-10-28 (ver «Token y wallets»). Falta: wallet de tesorería/multisig, landing «live», compra con verificación en servidor.
- [~] Deploy a Cloudflare en **memeria.fun** — etapa 1 hecha el 2026-10-26: https://memeria.ethoslogliberty.workers.dev (cuenta «Neo Nach», Worker `memeria`, `pnpm run deploy`); falta conectar el dominio y la etapa 2 (dominio comprado el 2026-10-26). Etapa 1: estáticos (`dist/`, 18 MB) con Workers Static Assets; etapa 2: Worker + Durable Object por zona + D1.

## Mundo compartido, ranking y móvil (2026-10-27, sin desplegar)

- **Mobs y botín compartidos** (`src/server/world.ts`, corre dentro del Durable Object): el servidor mueve los 70 mobs con la misma `stepMob` del cliente (10 veces por segundo, solo mientras haya alguien), valida cada golpe (alcance, tope de daño, ritmo con ráfaga de 12) y reparte créditos: **todos los que le pegaron** cobran XP, kill y avance de misión. La bolsa de botín es de quien llega primero (`pickup`). Al morir un mob, el servidor tira el botín.
- **El héroe sigue siendo del cliente** (vida, XP, inventario, daño informado). Por eso el tope de daño es generoso y la identidad del ranking no está firmada: trampa posible hasta que haya firma de wallet y D1. Sin conexión (o `pnpm dev` sin wrangler) el cliente corre el mundo local como antes (`GameState.online` decide).
- **Ranking semanal** (`src/server/ranking.ts`): kills por héroe y por mascota («mascot war»), tecla **L**, casilla de la barra o menú. Se guarda en el storage del Durable Object, la semana es ISO en UTC (cambia el lunes 00:00 UTC) y se conserva la anterior.
- **Compartir en X**: botón en el ranking y en el menú (abre la ventana de publicar con texto y enlace; no publica solo). Metaetiquetas Open Graph/Twitter con `public/art/og.jpg` (110 KB, hecha del banner).
- **Móvil**: palanca, botones, arrastrar para girar la cámara y botón de menú (`src/client/touch.ts`); se activa con `(pointer: coarse)` o `?touch=1`. Probado en Chrome headless a 360 y 390 px, no en un teléfono real.
- **Pruebas**: `pnpm check:world` (Node, sin Cloudflare) y `pnpm check:ws` (contra `wrangler dev --port 8799`, dos clientes comparten un oso).
- **Costo**: el ciclo del mundo son alarms cada 100 ms con alguien conectado: unas 36.000 invocaciones por hora de juego. El plan Paid incluye 1 M de requests al mes de Durable Objects, así que conviene vigilarlo (bajar a 200 ms es la palanca).
- **Pendiente**: un solo Durable Object para todos (sirve para ~40 jugadores; para más, un objeto por zona), firma de wallet para el ranking, daño calculado por el servidor, más zonas.

## Atmósfera: día y noche (2026-10-27, sin desplegar)

- **Ciclo de 12 minutos reales** sacado del reloj de pared, así que todos ven la misma hora sin servidor (`src/client/atmosphere.ts`). Reloj en el HUD y avisos en el chat al amanecer, atardecer y anochecer.
- **Cielo en un solo shader**: degradé por hora, sol, luna con cráteres, estrellas que titilan, **aurora boreal**, estrellas fugaces. Sol y luna mueven la luz y la sombra; hay niebla, nubes, ventanas y faroles que se encienden de noche.
- **Árboles**: se balancean con el viento y ~35 % son **encantados** (tinte propio, follaje que brilla de noche, tres orbes flotando). Luciérnagas de noche y pétalos de día alrededor del jugador.
- **Luna de Sangre**: una noche de cada 6 (~72 min) el cielo, la aurora, las luciérnagas y los orbes se ponen rojos. Hoy es solo visual y un aviso; se puede atar a una mecánica (más XP, mobs más fuertes).
- **Para mirar**: `?hour=23`, `?cycle=60` (día de 1 min), `?blood=1`, `?skycam=14` (levanta la cámara).
- **Chat**: Enter ignora el primer segundo y medio, no repite, y el modo escritura vacío se suelta solo a los 5 s.

## Hosting y dominio

- **Dominio**: `memeria.fun` (comprado el 2026-10-26). Pendiente: conectarlo a Cloudflare (nameservers o DNS) y definir si el juego va en la raíz o en un subdominio (`play.`), y si la web de presentación convive.
- **Etapa 1 (beta sin servidor)**: `dist/` como Workers Static Assets, plan gratis. El progreso vive en el navegador y la firma de la wallet es del cliente: sirve para mostrar y probar, no para economía real.
- **Etapa 2 (multijugador)**: Worker (nonce, verificación, compras) + un Durable Object por zona con WebSockets + D1; plan Workers Paid (~US$5/mes). Apagar el tick cuando la zona esté vacía. La música (15 MB) puede ir a R2.
- **Etapa 1 desplegada**: `wrangler.jsonc` (assets de `dist/`, 404 real para rutas inexistentes, cuenta fijada) y `public/_headers` (caché inmutable para `/assets`, una semana para la música, un día para el arte). Se sube con `pnpm run deploy` (ojo: `pnpm deploy` a secas es otro comando) (build + `wrangler deploy`). **Ojo**: la música no está en git, así que solo se puede desplegar desde esta máquina hasta que pase a R2. El atajo de desarrollo `?guest=1` / `?cls=` no existe en producción; el invitado real entra por la landing.
- **Conectar el dominio**: agregar `memeria.fun` como zona en la cuenta «Neo Nach», cambiar los nameservers en el registrador y descomentar la ruta `custom_domain` de `wrangler.jsonc`.
- **Pesos de hoy**: build de 18 MB en 42 archivos; la música es el 83 %.
- Tras apuntar el dominio, revisar que `location.host` / `origin` (mensaje de firma de la wallet) salga con `memeria.fun`.

## Decisiones técnicas

- **Solana**: `@solana/kit` (el SDK oficial actual; `@solana/web3.js` quedó como legacy) con conexión de wallet por Wallet Standard. Verificar si `@solana/client` sirve sin React antes de instalar. Docs: https://solana.com/docs/clients/official/javascript
- **Token**: SPL token clásico, primero en devnet. El servidor nunca confía en el cliente: la wallet se vincula firmando un mensaje y la compra se verifica por RPC (patrón de la skill `cripto-cobro-directo-wallet`: monto único o hash, confirmaciones, acreditar una sola vez).
- **Cloudflare**: cliente (`dist/`) como Workers Static Assets; **un Durable Object por zona** con WebSockets que corre el `GameState` autoritativo; D1 para cuentas, inventario y compras. Pendiente de probar: cómo sostener un tick de ~20 Hz (`setInterval` impide la hibernación; las alarms son de un solo disparo).
- **Refactor grande**: `GameState` hoy tiene un único `player`. Pasar a `players: Map` antes de tocar el servidor.

## Preguntas abiertas

- Alcance del token: ¿solo recipes y materiales, o también equipo hecho? (el nombre ya está: **Memeria, $MMRIA**).
- Permiso de cada proyecto para usar sus mascotas reales (hoy son interpretaciones propias).

## Token y wallets ($MMRIA)

- **Nombre**: Memeria, ticker `MMRIA` (mayúsculas; `MMRIA/SOL` sería el par de trading, no el token).
- **Tipo (real, creado el 2026-10-28 en pump.fun)**: Token-2022, 6 decimales, supply fijo de 1.000.000.000 MMRIA. Mint: `6384VsyfFRmhq5XLftMpUGQfmPz76xWnVDrkUq3ypump`. Verificado por RPC: mint authority, freeze authority y update authority de la metadata revocadas (null); extensiones solo metadataPointer y tokenMetadata, sin transfer fee ni hooks. Reemplaza el plan original (100 M, SPL clásico, script `token:create`, que ya no se usa para mainnet).
- **Reparto inicial**: a decidir (tesorería del juego, equipo con vesting, venta/liquidez).
- **Wallets**: tesorería = multisig (Squads), no una clave suelta; wallet de cada jugador = la que usa para ingresar; clave "hot" del servidor con poco saldo, solo para entregar compras, rotable.
- **Contrato**: sin programa propio en la beta. El jugador transfiere MMRIA a la tesorería con una referencia única (memo); el Worker verifica la transacción por RPC, espera confirmación y acredita el ítem una sola vez (D1). Programa propio (Anchor) solo si más adelante hacen falta NFTs, compras atómicas o staking.
- **Devnet primero**; las claves de prueba van en `.keys/` (en `.gitignore`), nunca al repo. Mainnet se decide aparte por las implicancias legales de vender un token.

## D1 y verificación de wallet (2026-10-28, hecho en local, sin desplegar)

- **Ingreso con firma verificada en el servidor** (`src/server/auth.ts`): el Worker arma el mensaje con nonce y vencimiento (5 min) sellado con HMAC, la wallet lo firma, y el Worker verifica la firma Ed25519 contra la dirección y entrega un token de sesión de 7 días (HMAC). Sin estado. Secreto: `AUTH_SECRET` (`wrangler secret put`; en local, `.dev.vars`, ignorado por git).
- **`/ws` exige token.** La identidad del ranking y el nombre salen del servidor; el cliente ya no puede mandar una `key` ni un `name` ajenos. Cerrado el ingreso sin wallet de verdad, no solo en la landing.
- **D1** (`migrations/0001_init.sql`): `players` (wallet, clase, paleta, nombre único sin distinguir mayúsculas) y `saves` (guardado JSON, tope 64 KB). API: `/api/me`, `/api/profile`, `/api/save`, `/api/alias/check`. El guardado de antes (localStorage) migra solo al primer ingreso.
- **Pruebas:** `pnpm check:auth` (firma falsa, mensaje alterado, nombres repetidos, guardado por wallet) y `pnpm check:ws`, contra `wrangler dev --port 8799`.
- **Sigue siendo del cliente:** vida, XP, inventario y el daño informado. El guardado en D1 es lo que el cliente dice, no lo que el servidor calculó; mientras sea así, no hay plata real en juego.
- **Para desplegar:** `wrangler d1 create memeria`, poner el `database_id` en `wrangler.jsonc`, `wrangler d1 migrations apply memeria --remote`, `wrangler secret put AUTH_SECRET`, `pnpm run deploy`.

## Expansión: capítulos 2 a 4 y lore (2026-10-28, sin desplegar)

El lore completo está en `LORE.md`. Resumen de lo que cambió:

- **Cuatro zonas nuevas** en el borde del mapa: Dead Cat Hills (este), Liquidation Canyon (oeste), Whitepaper Wastes (sur) y The Drained Pool (norte profundo). Las regiones del mismo suelo son rectángulos contiguos (el primero que contiene el punto gana). Campo, ruinas, pradera y pantano se achicaron para dejarles lugar.
- **Nueve enemigos nuevos + cuatro jefes** (los Founders caídos), con dos modelos nuevos (`bull`, `golem`). Los jefes tienen respawn largo (5-10 min) y sueltan siempre una página del Ledger.
- **Nivel máximo 20** (`RULES.progression.maxLevel`); el tope de daño del servidor se calcula desde ahí. Con la curva `40·L^1.8+20` son ~220 kills más entre el 10 y el 20.
- **Equipo**: tiers 4 (Lv 12, arma +16, armadura 40) y 5 (Lv 16, arma +21, armadura 56), diez armas nuevas (dos por clase) y dos armaduras. **Ojo:** el tier 5 de monedas (+21) supera a las legendarias en MMRIA (+20, Lv 8). Decidir si se suben las legendarias o si queda así (el token da acceso, no el mejor arma). Poción nueva: Grand Potion (220 HP).
- **Misiones**: 12 nuevas (15 en total), cadena lineal, cuatro dadores nuevos (Dolores, Mary, Walt, Rick).
- **Cámara de escritorio**: un click en el mundo captura el mouse y la cámara sigue el mouse o el trackpad (yaw y pitch); WASD sigue siendo relativo a la cámara. Esc lo suelta, y se suelta solo al abrir inventario, ranking, tienda o chat. El arrastre con botón sigue como respaldo; el táctil no cambió.
- **Selector de mascota**: una sola pantalla sin scroll (lista compacta, detalle de la elegida a un costado, nombre y Play en una barra fija abajo). Probado a 1280x720, 1100x520 y 390x760.
- **Pendiente de balance**: no se jugó en combate ninguna de las zonas nuevas (HP/daño estimados contra la curva del jugador), y falta habilidades por nivel.

## Arreglos y economía de fichas (2026-10-29, sin desplegar)

- **Mobs trabados en árboles**: `steerBody` (`src/shared/movement.ts`) rodea el obstáculo hacia el lado que funcionó la última vez y saca al mob de un colisionable si quedó adentro. `pnpm exec tsx scripts/check-steer.ts`: con el movimiento viejo 4941/4941 casos alineados contra un árbol quedaban trabados; ahora 52 (≈1 %, racimos de árboles).
- **Proyectil que salía hacia otro lado**: la mira se fija al apretar y se mantiene durante el windup del ataque (`game.ts`); el modelo gira suave y alcanza la mira al golpear (`entities.ts`).
- **Íconos**: `src/client/icons.ts` dibuja cada ítem en SVG (frascos con líquido, armas con los colores de su `look`, armaduras que ganan adornos por tier) y fija una rareza (común a legendaria) que colorea casilla, tienda y barra.
- **Barra de consumibles** (`hotbar.ts`): teclas 1-5. Lo nuevo ocupa la primera casilla libre; con la mochila abierta, un número reasigna el ítem elegido. Se guarda con el héroe.
- **Fichas MMRIA** (`server/tokens.ts`, migración `0002_tokens.sql`): las tira solo el servidor (jefes siempre, mobs por nivel), se acreditan al recoger la bolsa con tope diario por wallet y su saldo vive en D1. Botón **Redeem** en la mochila: descuenta las fichas y deja un pedido `pending` en `redemptions`. **El envío del MMRIA real todavía es manual**: falta decidir la tesorería/clave que paga. Números provisorios en `TOKEN` (`rules.ts`: 100 fichas = 1 MMRIA, mínimo 100, tope 150/día).
- **Sesión de wallet**: el token se recuerda en localStorage (7 días) para cualquier wallet; la wallet del juego ya no se pisa si falla la lectura de IndexedDB; el guardado más nuevo (local vs servidor) gana.
- **Para desplegar**: `wrangler d1 migrations apply memeria --remote` antes de `pnpm run deploy`.

## Compras con MMRIA real (2026-10-29, sin desplegar, probado solo con RPC falso)

- **Flujo** (`server/payments.ts`, `client/pay.ts`, migración `0003_payments.sql`): `/api/order` abre una orden (monto en unidades mínimas, tesorería, referencia única, blockhash) → la wallet del jugador firma y envía una transferencia Token-2022 `TransferChecked` a la tesorería, con la referencia como cuenta extra → `/api/order/confirm` lee la transacción por RPC (`getTransaction`, `confirmed`) y comprueba: sin error, firmada por el comprador, lleva la referencia, la tesorería recibió ≥ monto y el comprador envió ≥ monto. Recién ahí marca la orden pagada y otorga el ítem en un solo lote; la firma es única (una transferencia paga una sola orden). El cliente nunca decide si pagó.
- **Mint verificado en mainnet el 2026-10-29**: programa Token-2022, 6 decimales, supply 1.000.000.000, sin mint authority.
- **Apagado hasta configurar**: sin `TREASURY_ADDRESS` el botón dice «Soon». Para abrirlo: poner la dirección pública de la tesorería (multisig) en `wrangler.jsonc` → `vars`, y de preferencia `SOLANA_RPC` como secret (el RPC público tiene límites). `wrangler d1 migrations apply memeria --remote` antes de desplegar.
- **Límites**: la wallet del juego (la del navegador) no paga; hace falta Phantom, MetaMask u otra con `signAndSendTransaction`. Lo comprado se guarda en `entitlements` y se vuelve a entregar al entrar, pero el inventario sigue siendo del cliente (ver «El héroe sigue siendo del cliente»).
- **Falta**: precios de «otros ítems» (hoy solo las 5 legendarias a 2.500 MMRIA, provisorio), probar un pago real con un monto chico, y una pantalla de historial/soporte para pagos que quedan «waiting».
- **Pruebas**: `pnpm exec tsx scripts/test-pay.ts` contra `wrangler dev --port 8799 --var TREASURY_ADDRESS:<dir> --var SOLANA_RPC:http://127.0.0.1:8801`.
- [x] Party y curaciones (31/10/26): party de hasta 4 en el Durable Object (invitar/aceptar/salir/echar, líder, chat `/p`), cuadros de vida de compañeros, **Mend** (tecla H, 18 MP, 2,5 s) que cura según el nivel de quien lanza, el servidor valida party, alcance y ritmo. Test: `pnpm check:party`. Historia: capítulos rotulados en el rastreador, páginas del Ledger garantizadas por misión, avisos de grupo en los jefes.
- [ ] **Pendiente (decidido 31/10/26): tesorería.** No usar la wallet de dev. Mínimo: billetera nueva e independiente en Phantom (frase propia, guardada en papel; una cuenta dentro de la misma billetera comparte frase y no separa el riesgo). Ideal: multisig en Squads (app.squads.so), la tesorería es la dirección del **vault**; empezar 1 de 1 deja la dirección definitiva y se suman miembros después. Pasar solo la dirección pública → `wrangler.jsonc` `vars.TREASURY_ADDRESS`, `SOLANA_RPC` como secret, desplegar y probar un pago chico.

## Plan 2026-11-01: tesorería por CLI, token en el juego, raid y mundo más grande

Decisiones de Ignacio (1/11/26): **dos wallets por CLI** (tesorería + pagadora), **premios automáticos con tope diario**, **raid con entrada gratis y pozo puesto por el juego** (sin apuesta de los jugadores). Orden: 1 → 2 → 3 → 4; cada fase se despliega sola.

### Fase 1 — Tesorería por terminal (sin Phantom ni contraseñas)

- `scripts/treasury.ts` (`pnpm treasury init | status | wire`). `init` genera dos keypairs Ed25519 con `@solana/kit`, los guarda en `.keys/` (fuera de git, permisos 600) y muestra solo las direcciones públicas:
  - **Tesorería** (`.keys/treasury.json`): recibe las compras. Su clave casi no se usa; solo hace falta para mover fondos.
  - **Pagadora** (`.keys/payer-game.json`): hot wallet con poco saldo. Firma los premios y paga las cuentas de token de los jugadores nuevos (~0,002 SOL cada una) y las comisiones.
- `status`: saldos de SOL y MMRIA de cada una por RPC. `wire`: escribe `TREASURY_ADDRESS` en `wrangler.jsonc` y sube la clave pagadora con `wrangler secret put PAYER_KEY` (nunca al repo).
- Fondeo: Ignacio envía desde su wallet de dev (tiene ~2,6 M MMRIA) un lote chico a la pagadora (ej. 5.000 MMRIA + 0,1 SOL) y nada a la tesorería. Respaldo: copia offline de `.keys/*.json` (la clave de la tesorería importa a Phantom como clave base58 si algún día hace falta). Más adelante la tesorería puede pasar a un vault de Squads cambiando solo `TREASURY_ADDRESS`.
- Cierra el pendiente de la tesorería: con `TREASURY_ADDRESS` puesto, el flujo de compras ya desplegado se enciende. Probar un pago real de monto chico antes de abrirlo.

### Fase 2 — El token funciona dentro del juego

1. **Pago automático de premios** (`server/payout.ts`): al canjear fichas, el Worker arma la transferencia Token-2022 (`TransferChecked`, con `createAssociatedTokenIdempotent` para el destinatario), la firma con `PAYER_KEY` y la envía. Estados de `redemptions`: `pending → sending → paid` (con `tx`); si falla o vence el blockhash, vuelve a `pending` sin duplicar (se confirma por RPC antes de reintentar).
2. **Frenos**: tope diario por wallet (hoy 150 fichas = 1,5 MMRIA), **tope diario global** (`TOKEN.globalDailyBudget`) y corte automático si la pagadora baja de un mínimo; se avisa «rewards paused» en el juego. Todo número en `rules.ts`, sin tocar código para ajustarlo.
3. **Gastar fichas, no solo canjearlas**: las fichas también compran dentro del juego (recipes, materiales, crafteo) sin firmar nada. Sirve de sumidero: cuanto más se gasta, menos se paga afuera. MMRIA real sigue siendo la otra vía (órdenes ya hechas).
4. **Recipes y crafteo** (lo que sigue sin tildar en la hoja de ruta): Ana vende recipes, Dan forja con recipe + materiales (drops) + costo en fichas o MMRIA; el endpoint de crafteo descuenta la moneda en el servidor y entrega el ítem como `entitlement`. Límite conocido: el inventario sigue siendo del cliente, así que lo valioso (la moneda y la recipe) vive en D1.
5. **Precios**: definir la tabla de precios en MMRIA/fichas de recipes y materiales (hoy solo están las 5 legendarias a 2.500, provisorio).

### Fase 3 — Raid boss: «Super Bear Market» (alterna con «Super Bull Market»)

- **Formato**: evento a horario fijo (ej. sábados 20:00 UTC-3, aviso 30 min antes en chat y HUD). Un lobby gratuito en la arena; dos equipos de clanes, **Diamond Hands vs Paper Hands**, que se eligen al anotarse. Solo se limita la diferencia de cantidad entre equipos (±1): el **nivel no se compensa**, así que subir de nivel hace ganar más seguido, que es justo el objetivo.
- **Combate**: un solo jefe gigante con barra compartida que ambos equipos golpean; el daño ya escala por nivel y el servidor lo valida y topea. Gana el equipo que da el **golpe final**. Riesgo: el «robo del último golpe» le quita peso al nivel; opción a probar en la primera prueba: que la última fase (<10 %) cuente el daño acumulado de cada equipo en vez del golpe suelto.
- **Pozo**: lo pone la tesorería (ej. 500 MMRIA por evento, número en `rules.ts`) y se reparte entre los integrantes del equipo ganador **según su daño**, pagado por el mismo canal automático de la Fase 2. Los perdedores cobran un premio de participación chico en fichas. Antes-abuso: nivel mínimo para anotarse (propuesta Lv 8), daño mínimo para cobrar, un cobro por wallet y por evento, el tope global diario sigue valiendo.
- **Código**: `shared/raid.ts` (reglas), `server/raid.ts` (máquina de estados dentro del Durable Object: `idle → announce → lobby → fight → ended`, con alarms), cliente `raid.ts` (cartel, cuenta regresiva, barra del jefe, marcador por equipo, resultado), arena como región nueva en el mapa actual (no depende de la Fase 4), modelo del jefe y prueba `pnpm check:raid`. Reusa las parties (hasta 4) como unidad dentro de cada equipo.
- **Por qué no apuesta**: una entrada en MMRIA con pozo y ganador por azar/último golpe se parece a un juego de apuestas; en Argentina y en la mayoría de los países eso está regulado. Queda anotado como una ampliación posible detrás de un flag apagado, solo después de una consulta legal.

### Fase 4 — Un mundo más grande: ciudades y mazmorras

Hoy todo es un mapa de 320×260 con un único Durable Object. Para ciudades y mazmorras de verdad hace falta **multizona**; esa es la parte grande:

- **Infraestructura**: registro de zonas (`data/zones/index.ts`, hoy hay un `ZoneDef` solo), `GameState` y minimapa que cargan la zona pedida, `/ws?zone=…` que enruta a un Durable Object por zona, portales/puertas con viaje que guarda antes de cambiar, y **instancias** de mazmorra (un DO por party, que se apaga al vaciarse).
- **Ciudades** (zonas seguras con sus NPCs y tiendas): *Liquidity Port* (puerto-mercado: crafteo y comercio, segundo hub) y *Airdrop Heights* (ciudad de altura de fin de juego, Lv 15+).
- **Mazmorras** (party de 2-4, con jefe final): *The Mempool* (Lv 6-9, tres salas y jefe), *Seed Phrase Catacombs* (Lv 12-16) y *The Sunken Vault* (Lv 17-20, pensada con los últimos Founders). Sueltan materiales de crafteo, páginas del Ledger y fichas, que enlaza con la Fase 2.
- **Primer corte**: infraestructura + Liquidity Port + The Mempool; el resto, en tandas. Cada mazmorra pide mobs y modelos nuevos (más trabajo de arte que de código).

### Riesgos y preguntas abiertas

- La pagadora es una clave en el Worker: saldo bajo a propósito, rotable, y el tope global limita la pérdida si alguien encuentra trampa en el daño (que sigue siendo del cliente).
- ¿Cuánto vale 1 MMRIA hoy? Define cuánto cuesta en realidad el tope diario y el pozo; con eso se fijan los números de `TOKEN`.
- Costo de Durable Objects al sumar zonas e instancias: vigilar las requests mensuales (ver «Costo» en la sección de mundo compartido).
- Sin tests de balance de las zonas nuevas ni de las dos clases nuevas; conviene jugar el combate antes de sumar más contenido.

### Fase 2, paso 1 hecho (1/11/26, sin desplegar): pago automático de premios

- `src/server/payout.ts`: al canjear fichas, la pagadora (secret `PAYER_KEY`) envía el MMRIA Token-2022 al jugador y le crea su cuenta de token si no la tiene. Estados del canje: `pending → sending → paid`. Antes de enviar se anota la firma y `last_valid`; si se corta, se reconcilia contra la cadena (confirmada → paid; fallida o vencida sin rastro → vuelve a pending y recién ahí se arma otra). Un canje se reclama con UPDATE condicional, así que dos pedidos simultáneos no lo envían dos veces. Se reintenta al entrar al juego (`/api/me`), hasta 8 intentos.
- Frenos en `rules.ts` (`TOKEN`): `globalDailyMmria` = 300 (si el día ya pidió más, el canje se rechaza **sin descontar las fichas**) y `payerMinSol` = 0,01. Sin saldo suficiente de SOL o MMRIA, la pagadora no paga y el canje queda en cola con `note = payer_low_*`.
- Sin `PAYER_KEY` todo esto se apaga y los canjes quedan pendientes para pago manual, como antes.
- Migración `0004_payouts.sql` (`last_valid`, `attempts`, `note`). Antes de desplegar: `wrangler d1 migrations apply memeria --remote`.
- Prueba: `pnpm exec tsx scripts/test-payout.ts setup`, `wrangler dev` con la clave de prueba y `pnpm exec tsx scripts/test-payout.ts` (RPC falso: camino feliz, sin confirmar, blockhash vencido, pagadora sin saldo y tope global).

**Estado al cierre del 1/11/26:** `pnpm build` compila. En `scripts/test-payout.ts` pasan el camino feliz y el canje sin confirmar; el vencimiento (3) quedó con una espera fija que pudo ser corta y se cambió por una espera con tope (`waitFor`), **sin volver a correr**; la pagadora sin saldo (4) y el tope global (5) **no se llegaron a verificar**. Además el pago ahora se rearma en la misma pasada cuando una transacción vence. Retomar: levantar `wrangler dev` (ojo: un `workerd` viejo puede quedar en el puerto 8799; matarlo por PID con `ss -ltnp`), correr la prueba y recién después desplegar. Pendientes de la fase 2: fichas como moneda de gasto, recipes y crafteo, tabla de precios.

### Cierre del 5/11/26: pagos verificados, desplegado con las compras apagadas

**Hecho hoy**
- `scripts/test-payout.ts` pasa completo (`OK payout`, 5 escenarios). Lo que fallaba eran defectos de la prueba, no del pago: el RPC falso dejaba sockets keep-alive (workerd reusaba uno cerrado → "Network connection lost"), devolvía siempre el mismo blockhash (el reintento salía con la misma firma que el original) y la cuenta del tope global estaba mal (290 + 7 = 297 < 300). Ojo: cada canje espera ~15 s la confirmación, la prueba entera tarda ~3 min; correrla con `timeout` ≥ 400 s.
- Migración `0004_payouts.sql` aplicada en D1 **remoto**.
- Desplegado el código (jefe de raid, diálogo en teléfono, minimapa, pago automático). **Las compras y los pagos siguen apagados**: no hay `TREASURY_ADDRESS` ni `PAYER_KEY` en Cloudflare (solo `AUTH_SECRET`), así que `payoutsEnabled` es falso y los canjes quedan pendientes.
- Arreglos de interfaz: el diálogo de los NPC usa todo el ancho en teléfono (la regla de escritorio le daba ancho negativo); el minimapa dibuja los edificios con contorno y tiene leyenda (NPC / Enemigo / Edificios / Raid, solo en escritorio).
- **Jefe de raid «Rugwyrm, el Devorador de Liquidez»** (Lv 22, `raid: true` en `MobTemplate`): 24.000 PV, golpe de 120 con windup de 1,1 s, guarida escondida en el rincón sudeste del pantano (146, -90, respawn 30 min). Aparece en el minimapa solo cuando alguien se acerca a menos de 55 m (calavera violeta + «RAID»), con aviso en el log/chat/banner; nombre flotante «☠ RAID · Lv 22». Al caer lo anuncia el servidor (`BOSS_IDS`). Números de balance **sin probar en combate**. Sus fichas MMRIA son las de cualquier jefe (`bossDrop`); no se tocó la economía.

**Para abrir las compras y los premios (en este orden)**
1. Mandar a la PAGADORA `BAQNWfEKC3d9iz35oQ15LXjh31kErtXDZK47qBdGVf6X` ~0,1 SOL y ~5.000 MMRIA (hoy 0 y 0; `pnpm treasury status` lo muestra). La tesorería `HYih7gwJkaMc7jtkLAzcCPwkH8HcSN8DL8EqqBq2HqR3` no necesita nada.
2. Copia **offline** de `.keys/treasury.json` y `.keys/payer-game.json` (si se pierden, se pierden los fondos).
3. `pnpm treasury wire` (escribe `TREASURY_ADDRESS` en `wrangler.jsonc` y sube el secret `PAYER_KEY`) y `pnpm run deploy`. Esto es lo que enciende las compras.
4. Un pago real chico de punta a punta antes de anunciarlo.
5. Recomendado: `SOLANA_RPC` propio como secret (el RPC público de mainnet limita).

**Siguientes fases:** precios definitivos (hoy 2.500 MMRIA provisorios fuera de las 5 legendarias), fichas como gasto, recipes/crafteo, raid con pozo de la tesorería (ver Fase 3), multizona (Fase 4). Probar el combate contra Rugwyrm con una party antes de ajustar sus números.

**Trampas:** `pkill -f` o `fuser -k` desde Bash mata la propia shell o no mata `workerd`; usar `ss -ltnp` y `kill -9 PID`. Los comandos `wrangler d1` necesitan `CLOUDFLARE_ACCOUNT_ID=0b9fa37fb6f4e91c4c1bf33b77ae1d13`.
