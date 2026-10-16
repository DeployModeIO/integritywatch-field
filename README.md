# IntegrityWatch Field

**Centro de operaciones de integridad y cumplimiento, offline-first, para trabajo en campo petrolero.**

IntegrityWatch Field es una aplicación que funciona **completamente en tu computadora o dispositivo, sin internet y sin servidor obligatorio**. Reúne en un solo lugar las tareas de integridad más comunes de un campo: corrosión, válvulas de alivio, oleoductos, gestión de activos, inspecciones, recomendaciones e informes. Todo se guarda localmente en tu navegador (IndexedDB) y puedes instalarla como una aplicación (PWA) para usarla sin conexión.

> **Herramienta de apoyo. Valida siempre los resultados contra las ediciones vigentes de las normas y los datos del fabricante de los equipos.** Los cálculos se basan en fórmulas publicadas de normas reconocidas (NACE/AMPP, API, ASME, ASTM, ISO); consulta `docs/STANDARDS.md` para ver la referencia exacta y las aproximaciones.

---

## Qué incluye: los 11 módulos

| Módulo | Qué hace |
|--------|----------|
| **Panel** (Dashboard) | Resumen de indicadores clave: corrosión media, puntos críticos, válvulas vencidas, alertas de APM y cumplimiento, con mapa de calor y avisos recientes. |
| **Corrosión** | Puntos de monitoreo, lecturas, cupones gravimétricos, eficiencia de inhibidor, modelo De Waard-Milliams, servicio ácido (MR0175) y protección catódica (SP0169). |
| **Válvulas de alivio** (PSV) | Registro y dimensionamiento de válvulas de seguridad según API 520/526 (gas, vapor, líquido y líquido viscoso), con selección de orificio. |
| **Oleoductos y activos de línea** | Sistemas de línea, activos ubicados por estación kilométrica, inspecciones (ILD, UT, visual, reparación) y campañas. |
| **Mapa esquemático** | Vista esquemática del sistema de línea con los activos posicionados por kilómetro; navegable con teclado y legible para lectores de pantalla. |
| **APM / Gestión de activos** | Fiabilidad y disponibilidad (MTBF, MTTR, OEE), análisis de riesgo RBI (API 580/581) e intervalos de inspección sugeridos. |
| **Ingesta de datos** | Importación de archivos CSV y WITSML-lite con validación y mapeo de columnas, más historial de importaciones. |
| **Recomendaciones / Reglas** | Motor de reglas R1–R14 que detecta condiciones de riesgo y genera recomendaciones (abrir, confirmar, resolver, reabrir). |
| **Informes** | Informe trimestral, dossier por punto de monitoreo y ficha de válvula; se exportan a PDF con la opción de imprimir del navegador. |
| **Glosario** | Términos técnicos explicados en varios idiomas, con su referencia normativa y buscador. |
| **Administración** | Ajustes generales, idioma y tema, datos de demostración, respaldo/restauración, bloqueo con PIN y estado offline. |

---

## Requisitos

| Requisito | Detalle |
|-----------|---------|
| Navegador moderno | Chrome, Edge, Firefox o Safari actualizados. |
| Node.js (solo para pruebas) | Versión **20 o superior**, únicamente si quieres ejecutar las pruebas automatizadas. Para usar la aplicación **no necesitas Node**. |
| Sistema operativo | Windows (cualquier versión reciente), o cualquier equipo con un navegador moderno (macOS, Linux, Android, iOS). |

La aplicación **no requiere instalación**, **no usa internet**, **no usa CDN** y **no instala dependencias** en tiempo de ejecución.

---

## Inicio rápido

### Opción 1 — Doble clic en `START-HERE.bat` (Windows)

1. Abre la carpeta del proyecto.
2. Haz doble clic en `START-HERE.bat`.
3. Se abre tu navegador con la aplicación en modo completo (PWA activa, actualizaciones automáticas).

Este es el método recomendado. Si el puerto por defecto (8419) está ocupado, la ventana te indicará cómo usar otro puerto.

### Opción 2 — Doble clic en `index.html` (modo `file://`)

Abre `index.html` directamente en el navegador. La aplicación funciona, pero con **limitaciones**:

- No se puede **instalar como PWA** ni usar el **modo sin conexión** (el service worker exige una conexión `http(s)`, no funciona con `file://`).
- No hay **actualizaciones automáticas** de la caché.

Al abrirla de esta forma, una **franja informativa** te recordará estas limitaciones y te ofrecerá la opción de usar un servidor local. Para la mayoría de los casos de uso en campo, usa la Opción 1.

### Opción 3 — Tu propio servidor estático

Sirve la carpeta del proyecto con cualquier servidor estático. Ver `docs/DEPLOY.md` para ejemplos con PowerShell, Python, nginx e IIS.

### Opción 4 — Electron (opcional)

Si prefieres una ventana de escritorio independiente, usa el contenedor Electron. Ver `docs/DEPLOY.md` y `electron/README.md`. Requiere Node y una instalación única de dependencias.

---

## Instalar como aplicación (PWA)

Para instalarla como PWA necesitas servirla por `http://` o `https://` (usa la Opción 1). Después:

| Plataforma | Pasos |
|------------|-------|
| **Windows (Edge o Chrome)** | Abre la app → clic en el icono de "instalar" de la barra de direcciones (o menú → *Instalar aplicación*) → confirma. |
| **Android (Chrome)** | Abre la app → menú (tres puntos) → *Instalar aplicación* / *Añadir a pantalla de inicio*. |
| **iOS (Safari)** | Abre la app → botón *Compartir* → *Añadir a pantalla de inicio* → *Añadir*. |

Una vez instalada, la aplicación se abre desde su propio icono y funciona sin conexión.

---

## Datos de demostración

La primera vez que se inicia, la aplicación **carga datos de demostración** automáticamente (puntos de monitoreo, lecturas, cupones, válvulas, activos e inspecciones) para que puedas explorar todas las pantallas y ver el motor de reglas en acción.

Para empezar de cero o volver a cargar la demo: entra en **Administración → Gestión de datos** y usa la opción *Restablecer demo*.

---

## Idiomas y temas

| Característica | Opciones |
|----------------|----------|
| Idiomas | Inglés, español, portugués, francés, chino, ruso y árabe (7 idiomas, con cambio instantáneo sin recargar). El árabe se muestra de derecha a izquierda (RTL). |
| Temas | Claro, oscuro y sistema (sigue automáticamente la preferencia de tu dispositivo). |

Ambos se guardan localmente y se recuerdan entre sesiones.

---

## Pruebas automatizadas (opcional, para desarrolladores)

| Comando | Qué hace |
|---------|----------|
| `npm test` | Ejecuta toda la suite de pruebas. |
| `npm run test:coverage` | Ejecuta las pruebas y muestra la cobertura de código. |

Requieren Node.js 20 o superior y se ejecutan desde la carpeta raíz del proyecto.

---

## Estructura de carpetas (resumen)

| Carpeta / archivo | Contenido |
|-------------------|-----------|
| `index.html` | Página principal (punto de entrada de la aplicación). |
| `src/` | Código de la aplicación: motores de cálculo, reglas, ingesta, vistas, i18n. |
| `assets/` | Estilos (CSS), iconos e imágenes. |
| `docs/` | Documentación: `CONTRACTS.md`, `SCHEMA.md`, `TESTS.md`, `DEPLOY.md`, `STANDARDS.md`. |
| `tools/` | Servidores locales (`serve.ps1`, `serve.py`) y utilidades. |
| `tests/` | Pruebas automatizadas y datos de ejemplo. |
| `electron/` | Contenedor de escritorio opcional (Electron). |
| `sw.js` | Service worker para funcionamiento sin conexión. |
| `manifest.webmanifest` | Manifiesto de la PWA (instalación e iconos). |
| `START-HERE.bat` | Acceso directo de inicio para Windows. |

---

## Seguridad y privacidad

- **Todo es local**: tus datos se guardan en tu navegador (IndexedDB) y no salen de tu equipo.
- **Sin telemetría**: la aplicación no envía ningún dato a terceros.
- **Sin CDN**: no se cargan recursos desde internet.
- **Bloqueo PIN opcional**: puedes proteger la aplicación con un PIN local (roles de administrador y operador, con límite de intentos).

---

## Desafío de ingeniería

**Herramienta de apoyo. Valida siempre contra las ediciones vigentes de las normas y los datos del fabricante.** Los resultados de cálculo (tasas de corrosión, dimensionamiento de válvulas, análisis de riesgo) son orientativos y deben ser revisados por personal cualificado antes de tomar decisiones de ingeniería u operación.

---

## Quick start (English)

1. **Windows, easiest:** double-click `START-HERE.bat`. It starts a local server and opens the app with full PWA support.
2. **Just browse the files:** open `index.html` in any modern browser (limited mode: no offline/PWA).
3. **Own static server:** serve the project folder with any static server (`tools/serve.ps1`, `tools/serve.py`, nginx, IIS, …).
4. **Desktop (optional):** use the Electron wrapper in `electron/`.

No installation, no internet, no CDN. Demo data loads on first run. 7 languages, light/dark/system themes, local-only storage, optional PIN lock. See `docs/DEPLOY.md` for full details.
