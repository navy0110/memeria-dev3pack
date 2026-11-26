# Memeria — lore (fuente de verdad)

El juego es **English first**: todo texto visible va en inglés. Este documento está en español para trabajar; los textos finales viven en `src/data/` (`quests.ts`, `npcs.ts`, `items.ts`, `mobs.ts`).

## La historia en una página

**Memeria** se alimenta de los **Liquidity Wells**: manantiales que no se secan mientras la Herd cree. Siete **Founders** encendieron el primero, el **Lantern Well** de Hodl Hollow, y llevaron un libro de promesas, el **Ledger of the Seven**. El pozo arde de *convicción*: mientras un solo Founder sostenga, no se apaga.

Una noche vino el **Great Rug Pull**. Se cuenta que los Founders huyeron con la receta, la caldera y el tesoro. **Es mentira.** Los Founders no fueron ladrones, fueron víctimas de **The Deployer**, un octavo, sin nombre, que escribió el contrato del Well y se guardó una línea que nadie leyó: la **Admin Key**, una puerta trasera que solo él podía abrir. Esa noche la usó, **drenó el Pool** que estaba bajo el tesoro, y cada promesa de Memeria se deslizó detrás. Seis Founders firmaron su página y el Pull los transformó, uno por vicio, en lo que más temían. El séptimo, **The Last Founder**, leyó algo en el margen, dejó la pluma y no firmó: por eso sigue ahí como espíritu y por eso el Well todavía arde.

El Ledger se rasgó en **siete páginas** y cada una quedó pegada a lo que nació de una promesa rota. Juntarlas es la historia del juego.

## Los siete Founders y sus páginas

| # | Vicio | En qué se convirtió | Dónde | Cómo se consigue la página |
|---|---|---|---|---|
| I | Fe | (el Well) | Hodl Hollow | recompensa de *Ghosts of the Rug* (Bruno) |
| II | **Greed** | **Fakeout, the Bull Trap Baron** (Lv 11) | Dead Cat Hills | siempre, al caer el jefe |
| III | **Fear** | **The Stop-Loss Colossus** (Lv 14) | Liquidation Canyon | siempre |
| IV | **Vanity** | **Hype Man, Lord of Shills** (Lv 17) | Whitepaper Wastes | siempre |
| V | La llave | — | The Drained Pool | recompensa de *Into the Drained Pool* (Rick) |
| VI | El Pull | — | The Drained Pool | recompensa de *Rekt* (Rick) |
| VII | El séptimo | **The Deployer** (Lv 20) | fondo del Drained Pool | siempre |

Las páginas son ítems (`ledger-page-1..7`): el texto está en la descripción del inventario. Ninguna depende de la suerte: I, V y VI las entrega la misión (`rewardItems`), II a IV y VII las suelta el jefe. Los tres Founders que no vemos como jefes (los de la «Llave» y el «Pull») entraron al Pool; las páginas V y VI cuentan eso. La VII se lee junto al Lantern Well (no hay escena de epílogo todavía).

## Party y Mend (multijugador)

Hasta 4 héroes (`P`, `/invite`, `/accept`, `/leave`, `/p`). `H` lanza **Mend**: cura al compañero más herido a tiro (o al elegido en su cuadro). Los jefes de capítulo (Baron, Colossus, Hype Man, Deployer) avisan en su misión que conviene ir en grupo; el Elder lo explica en sus líneas.

## Mapa y capítulos

| Cap. | Zona | Enemigos (Lv) | Dador | Misiones |
|---|---|---|---|---|
| 1 *To the Last Breath* | Hodl Hollow → Meadow, Fields, Ruins, Marsh | Cub 1, Bear 3, Grizzly 5, Ghost 7 | Elder Hodl, Bruno | The Dry Well, Hold the Line, Ghosts of the Rug |
| 2a | **Dead Cat Hills** (este, Dip Buyer Camp) | Dead Cat Bounce 9, Bull Trap 10, **Baron 11** | Dip Buyer Dolores | Dead Cats Don't Stay Dead, The Bull Trap, Fakeout the Baron |
| 2b | **Liquidation Canyon** (oeste, Last Margin Post) | Liquidation Golem 12, Margin Caller 13, **Colossus 14** | Margin Mary | Forced Sale, Call In the Margin, The Stop-Loss Colossus |
| 3 | **Whitepaper Wastes** (sur, campamento de Walt) | Shillbot 15, Vaporware Wisp 16, **Hype Man 17** | Whitepaper Walt | Shill Season, Vaporware, Silence the Hype Man |
| 4 | **The Drained Pool** (norte profundo, lámpara de Rick) | Slippage Wraith 18, Rekt Revenant 19, **The Deployer 20** | Rekt Rick | Into the Drained Pool, Rekt, The Deployer |

Cadena lineal (`requires`): cada misión se abre al entregar la anterior. 15 misiones en total.

## Tono

Humor de memecoin con corazón. Los enemigos son *conceptos* de mercado hechos criatura (Dead Cat Bounce, Bull Trap, Margin Call, Stop-Loss, Shill, Slippage, Rekt); los NPC, arquetipos (paper hands, diamond hands, ballena, degen). Nada de promesas financieras: el chiste siempre es sobre el comportamiento, no sobre ganar plata.

## Pendiente de lore

- Epílogo: el Elder reacciona a la página VII (hoy lo dice Rick). Podría ser un diálogo condicionado a la misión final.
- Qué es el **Genesis Block** y por qué el Well pide convicción: reservar para una expansión.
- Recipes y crafteo: las páginas podrían ser parte de la receta de las armas legendarias.
