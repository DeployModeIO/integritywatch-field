# Informe: iconografía de proceso y experiencia visual

**Fecha:** 31-10-2026
**Alcance:** propuesta de rediseño de la capa visual (símbolos de equipo + navegación)
**Estado:** informe previo. **No se ha modificado código de la aplicación.**

---

## 1. Resumen

La app se ve **ordenada pero genérica**: usa iconos de interfaz (Lucide/Tabler) y solo un
glifo propio de válvula. No existen pictogramas de equipo, y el "mapa" de ductos es en
realidad una tabla ordenada por kilómetro. Para un operador de planta, oleoducto o
refinería eso significa que **tiene que leer para entender**, en lugar de reconocer de un
vistazo.

La propuesta es construir un **sistema de símbolos de proceso original**, alineado con lo
que hace reconocible a un HMI de clase DCS (Experion PKS), pero apoyado en normas públicas
(ISO 14617, ISA-5.1, ISA-101/EEMUA 191) y sin copiar arte propietario.

---

## 2. Qué hace Experion PKS (fuentes públicas)

De la documentación pública de producto (Operator Stations / HMI):

| Principio publicado | Qué implica para nosotros |
|---|---|
| **Single Visual Workspace** (4K, sin marcos) | El proceso debe ocupar el espacio, no la decoración |
| **Group and detail displays** | Jerarquía: visión general → grupo → detalle, no todo en una tabla |
| **Powerful trending** junto al dato | El valor siempre acompañado de su tendencia |
| **Touch optimized** | Objetivos táctiles grandes, pocos niveles |
| **HMIWeb basado en el consorcio ASM** | Doctrina *high-performance HMI*: fondo sobrio, color solo para lo anormal |
| **Alarm management** integrado | El estado crítico debe saltar sin competir con el resto |

> Citas parafraseadas de la página pública de Operator Stations (Honeywell Process
> Solutions, consultada 31-10-2026). No se reproduce material propietario.

### Límite que aplicaré

**No voy a replicar el arte de los iconos de Honeywell.** Son obra propietaria (derecho de
autor y *trade dress*), y además un operador reconoce **símbolos de norma**, no el trazo de
un fabricante. Lo que sí se replica es el **modelo de diseño**: jerarquía, economía de
color, símbolos normalizados y estado siempre visible. Eso da el mismo resultado práctico
—intuición inmediata— sin riesgo legal y sin ataduras a un proveedor.

Base normativa propuesta: **ISO 14617** (símbolos gráficos para diagramas), **ISA-5.1**
(instrumentación y lazos), **ISA-101 / EEMUA 191** (HMI de alto desempeño y alarmas).

---

## 3. Auditoría real de la app

| Elemento | Estado actual | Evidencia |
|---|---|---|
| Catálogo de iconos | 165 líneas, 24×24, `currentColor`, generado por `tools/build-icons.cjs` | `src/components/icons.js` |
| Origen | Lucide (ISC) + Tabler (MIT) + 1 propio (`valve`) | cabecera del archivo |
| Glifos de equipo | `valve`, `pipeline`, `pump`, `engine`, `substation`, `fire`, `tank`, `compressor` | claves del catálogo |
| Glifos ausentes | intercambiador, columna, horno, PSV, separador, pig, riser, soplador, filtro | no existen |
| "Mapa" de ductos | **tabla** ordenada por `stationKm`, sin diagrama | `src/views/pipelines.js:377` |
| Paleta | tokens con severidad (`--sev-*`, `--alert-*`), claro/oscuro | `assets/styles/base.css` |
| Estado | badges + texto; el color no siempre va acompañado de forma | vistas APM/corrosión |

**Conclusión de la auditoría:** elproblema no es la estética —que es consistente— sino que
**no hay lenguaje visual de proceso**. Faltan las tres cosas que hacen intuitivo un HMI:
pictograma reconocible, estado codificado por forma+color, y una vista de proceso.

---

## 4. Sistema propuesto: IFS-24

Nombre de trabajo: **Integrity Field Symbols**, retícula 24.

### 4.1 Reglas de dibujo

- Lienzo 24×24 (y versión 48 para diagrama), trazo 1,75, uniones redondeadas.
- `fill="none"` + `stroke="currentColor"`: hereda tema claro/oscuro sin duplicar arte.
- Máximo 12 nodos por símbolo; legible a 16 px.
- Sin texto dentro del símbolo (el texto va al lado, traducible a 7 idiomas).
- SVG inline (la app es offline-first, cero dependencias, sin fuentes de iconos).

### 4.2 Familias y símbolos (24 en total)

| Familia | Símbolos |
|---|---|
| **A · Estáticos** | tanque atmosférico, tanque a presión, esfera, columna/torre, reactor, intercambiador (tubos), horno, filtro, separador |
| **B · Rotativos** | bomba centrífuga, bomba de desplazamiento positivo, compresor, soplador, turbina |
| **C · Válvulas** | compuerta, globo, bola, mariposa, retención, control, **PSV/alivio**, disco de ruptura |
| **D · Línea** | tubería, riser, pig trap, brida, tee, reducción |
| **E · Estado** | corrosión, CUI, MIC, fuga, fuego/gas |

### 4.3 Codificación de estado (nunca solo color)

| Estado | Forma | Color | Uso |
|---|---|---|---|
| Normal | contorno continuo | neutro | operativo sin desvío |
| Atención (L1) | contorno + punto | ámbar | deriva, pre-alerta |
| Advertencia (L2) | contorno + triángulo | naranja | barrera degradada |
| Crítico (L3) | contorno + octágono | rojo | barrera superada |
| Fuera de servicio | trama diagonal | gris | aislado/mantenimiento |
| Sin dato | contorno punteado | gris | sensor caído |

Cumple daltonismo (forma + color) y el requisito de contraste 4.5:1 del proyecto.

---

## 5. De tabla a diagrama (el cambio que más se nota)

Hoy el detalle de un sistema de ducto muestra una lista por km. Propuesta:

1. **Esquema de línea (L2)** en SVG: estaciones como nodos, activos sobre la línea por
   `stationKm`, severidad por color, tooltip con el dato y clic a la ficha del activo.
2. **Franja de estado por activo**: icono + badge + sparkline de la última serie.
3. **Leyenda persistente** (una sola vez, no por pantalla).
4. **Tres niveles** como Experion: resumen del sistema → grupo de estaciones → activo.

Para refinería/planta, el mismo componente dibuja el lazo: tanque → bomba → intercambiador
→ columna → PSV, con el estado de cada equipo y del lazo.

---

## 6. Plan de ejecución (4 fases)

| Fase | Entrega | Verificación |
|---|---|---|
| **1** | Set IFS-24 + hoja de contactos (24 símbolos en 3 estados) + `tools/build-symbols.cjs` | Revisión visual a 16/24/48 px, contraste, claro/oscuro |
| **2** | Mapeo categoría ISO 14224 → símbolo, aplicado en APM, ductos y corrosión | Cada activo muestra su pictograma y su estado |
| **3** | Diagrama L2 de sistema/planta con estados y tooltip | Capturas A4 y tablet; sin desbordes |
| **4** | Modo "sala de control" (alto contraste, sin sombras ni degradados) | Cumple ISA-101; conmutable |

**Esfuerzo:** Fase 1 y 2 son las de mayor retorno; la 3 es la que cambia la percepción del
producto. Delegación prevista: `designer` (arte y hoja de contactos), `coder` (integración
y build script), `reviewer` (consistencia y accesibilidad).

**Riesgo principal:** que los símbolos queden "bonitos pero no reconocibles". Mitigación:
validar contra ISO 14617 y con la prueba de reconocimiento a 16 px y en gris.

---

## 7. Qué no se hará

1. **No** se copian iconos, capturas ni pantallas de Experion/Honeywell.
2. **No** se usan logos ni marcas de terceros.
3. **No** se añaden dependencias ni fuentes de iconos: todo SVG inline.
4. **No** se toca la lógica de cálculo, datos ni informes en esta fase.

---

## 8. Decisión que necesito

Confirmar dos cosas antes de empezar:

1. **Alcance del set**: 24 símbolos (propuesto) o solo los 12 más usados para una primera
   entrega más rápida.
2. **Diagrama L2**: incluirlo en esta fase (es el mayor salto de intuición) o dejarlo para
   después de validar los símbolos.

Con eso arranco por la Fase 1 y entrego la hoja de contactos para tu revisión antes de
tocar ninguna vista.
