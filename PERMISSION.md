# Autorización para adaptar Memeria y presentar la adaptación en Dev3pack

**Borrador pendiente de aprobación.** Completá los campos entre corchetes y confirmá el alcance de la lista antes de que el titular apruebe este documento.

- **Titular que autoriza:** Ignacio Bavala.
- **Persona autorizada:** Natalia Gonzalez, cuenta de GitHub `navy0110`.
- **Proyecto original:** Memeria (`rpg.meme`), versión de referencia `5be039522e256f8eb75144d733134ecab84f86e1`.
- **Repositorio de la entrega:** https://github.com/navy0110/memeria-dev3pack
- **Licencia abierta autorizada para los componentes indicados:** MIT License (MIT)

Yo, Ignacio Bavala, autorizo a la persona indicada arriba, de forma no exclusiva y sin cargo, a copiar, modificar e integrar los componentes de Memeria enumerados abajo para adaptar el combate contra Rugwyrm e integrarlo con ByteArena. Autorizo a publicar y distribuir esos componentes, en su forma original o modificada, en el repositorio de la entrega bajo la licencia abierta indicada. También autorizo a alojar y mostrar públicamente la adaptación y a presentarla a los organizadores y jurados de Dev3pack.

## Componentes autorizados

| Ruta en el repositorio original | Descripción |
| --- | --- |
| `src/data/mobs.ts` | Entrada `rugwyrm`: nombre del jefe, apariencia, vida, daño, alcance, tiempos de ataque y demás parámetros del encuentro. |
| `src/shared/ai.ts` | Lógica de IA de enemigos que usa Rugwyrm para detectar, perseguir y atacar al jugador. |
| `src/shared/game.ts` y `src/shared/combat.ts` | Fragmentos que gestionan la selección de objetivos, los ataques, el daño y la derrota en el encuentro. |
| `src/client/mobmodels.ts` y `src/client/mascots.ts` | Generación del modelo 3D procedural que usa Rugwyrm, incluidos los fragmentos de `Builder` y `pivot` necesarios para construirlo. |
| `src/client/entities.ts` | Fragmentos que instancian el modelo de Rugwyrm y representan sus movimientos y la preparación de sus ataques. |

La autorización se limita a los componentes enumerados sobre los que tengo facultad para otorgarla. El material de terceros se rige por sus propias licencias. El nombre Memeria puede mencionarse para acreditar el proyecto original. El uso del logotipo como parte de la identidad de la adaptación requiere autorización aparte.

La entrega acreditará a Ignacio Bavala como autor original de Memeria, conservará los avisos aplicables e identificará las modificaciones hechas para Dev3pack. La titularidad del proyecto original y la licencia de sus demás archivos se mantienen.

## Aprobación del titular

- **Nombre:** Ignacio Bavala
- **Fecha:** 26-11-2026
- **Firma o referencia a la confirmación escrita: Aprobado por Ignacio Bavala por correo electrónico el 26-11-2026. Versión aprobada. Confirmación disponible a solicitud.