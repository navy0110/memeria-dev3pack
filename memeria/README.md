# Meme RPG

RPG de mundo abierto en Three.js con mascotas de memecoins de Solana como personajes, estética PS2 / low-poly. Por ahora es una demo single-player: **todavía no hay multiplayer, servidor, blockchain, tokens ni economía**. La lógica está separada del cliente para poder moverla luego a un servidor.

Hoy el proyecto tiene:

- selección de mascota (Pepe, Shiba Inu, Dogecoin; interpretaciones propias hechas con cajas, sin arte oficial). `?cls=pepe|shiba|doge` salta la selección;
- look PS2: render a 360 px de alto escalado con píxeles duros, texturas de 32 px, niebla y cielo en degradé;
- Hodl Hollow como mundo abierto de 200x160 m: villa, camino, campos, pradera, ruinas, pantano y lagunas, con edificios, vegetación y colinas. Árboles, rocas y mobs se generan con semilla fija en `src/data/zones/hodl-hollow.ts`;
- movimiento WASD, cámara que sigue al personaje, colisiones y límites del mundo;
- 12 NPCs del mundo memecoin (Diamond Dan, Paper Hands Pete, Whale Wanda, Degen Dex, Exit Liquidity Eddie, Gary the Grocer, Mod Mike, The Last Founder...) con modelo propio y diálogos (`src/client/npcmodels.ts`, `src/data/npcs.ts`); miran al jugador al acercarse. Diálogo con F;
- **página de ingreso** (`src/client/gate.ts`): cuenta de qué va el juego y entra con una wallet de Solana (Phantom, MetaMask u otra de Wallet Standard). Firma un mensaje gratuito que se verifica con `@solana/kit`; cada wallet es un usuario y su mascota queda guardada (`src/client/wallet.ts`, por ahora en el navegador). En desarrollo, `?cls=` o `?guest=1` saltan el ingreso;
- inventario (tecla I o botón en la barra de acciones): 20 casillas, monedas, detalle del ítem y botón Use. Los mobs sueltan monedas y materiales (`src/data/items.ts`, `coins` y `drops` en `src/data/mobs.ts`);
-  mobs con IA simple y combate (Espacio, habilidad con R);
- **todo el juego está en inglés**. Narrativa: prólogo "To the Last Breath", diálogos de NPC y un capítulo de tres misiones encadenadas (`src/data/quests.ts`);
- XP y niveles (máximo 10): los mobs y las misiones dan XP, y al subir de nivel crecen vida, magia y daño;
- interfaz con estética Final Fantasy (ventanas azules con degradé, borde claro, cursor ▶) y sonidos de menú sintetizados con WebAudio (cursor, confirmar, cancelar, abrir ventana, zumbido de error, campanitas de misión y arpegio de nivel); la tecla M silencia. No hay música ni sonido de combate;
- HUD nuevo: retrato con nivel, barras de vida (con estela de daño) y magia, barra de XP, barra de acciones con enfriamientos, misión en curso, cuadro de diálogo y avisos;
- combate con preparación visible: cada golpe tiene un `windup` (la animación sube el arma y el daño conecta al bajarla), las armas son largas y los mobs avisan su golpe con un disco rojo en el piso. Cada mascota firma su habilidad con efectos propios (caras de pixel art, anillos, columna de luz, monedas) y un grito sobre la cabeza;
- en la ciudad el personaje guarda el arma a la espalda y la saca al salir o al atacar; onomatopeyas de combate (PIUM!, PSH!, WHAM!, CHOMP!…) sobre cada golpe, sin sonido por ahora;
- caja de chat abajo a la izquierda (ícono de carta para plegarla, pestañas All/Combat/Story, Enter para escribir y Enter para mandar, Escape para volver al juego; mientras escribís las teclas del juego quedan pausadas; por ahora es local);
- minimapa y etiquetas de nombre;
- streaming por zonas con manifiestos y caché de assets (`src/assets/`).

`?at=x,z` cambia el punto de aparición (para mirar otras zonas del mapa) y `?slow=0.2` corre el juego en cámara lenta (para revisar animaciones y efectos).

## Cómo correrlo

Requisitos: Node 24, pnpm 10.

```bash
pnpm install
pnpm dev       # servidor de desarrollo de Vite, por defecto en http://localhost:5173
pnpm build     # typecheck (tsc --noEmit) + build de producción en dist/
pnpm preview   # sirve el build de dist/
```

## Estructura

| Carpeta | Qué hay |
|---|---|
| `src/shared/` | Reglas y simulación del juego, sin imports de Three.js. Lista para moverse a un servidor. |
| `src/data/` | Datos del juego: clases jugables, mobs, NPCs y la zona `villa-nilo` con colliders y spawns. |
| `src/client/` | Cliente Three.js: escena y escenografía (`scenery.ts`), mascotas, cámara, input, HUD, minimapa, bucle principal (`main.ts`). |
| `src/assets/` | Streaming por zonas, caché de GLTF con LRU y validación de manifiestos. |
| `public/assets/world/` | Índice del mundo y manifiestos por zona. Hoy solo hay placeholders propios. |
| `scripts/make-placeholder-glb.mjs` | Genera los GLB sintéticos de `public/assets/world/zones/`. |

## Assets y marcas

- Todo lo que se dibuja es geometría propia generada por código; no hay assets de terceros.
- Las mascotas son interpretaciones de arquetipos de meme, no usan arte ni logos oficiales. Antes de usar el arte, el nombre o la imagen de un proyecto real hace falta su permiso por escrito, y el contenido que funcione como publicidad debe estar identificado como tal.
- `AGENTS.md` lo genera una herramienta externa: no editar a mano.
