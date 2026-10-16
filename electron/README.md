# Electron — Contenedor de escritorio (opcional)

Este directorio permite ejecutar IntegrityWatch Field como una **aplicación de escritorio independiente** usando Electron. No es necesario para usar la aplicación (puedes usar `START-HERE.bat` o un navegador), pero es útil si prefieres una ventana propia con icono en la barra de tareas.

## Cómo funciona

`main.js` levanta un **servidor HTTP interno en Node puro** (sin dependencias de terceros) que sirve la raíz del proyecto en `127.0.0.1` con un **puerto efímero**. Luego abre una ventana apuntando a `http://127.0.0.1:<puerto>/index.html`.

Se sirve por HTTP local **a propósito**: el service worker (modo sin conexión y PWA) no puede registrarse en `file://`, pero sí en un origen `http://127.0.0.1`. La CSP estricta definida en `index.html` se hereda sin cambios. La ventana usa `contextIsolation: true` y `nodeIntegration: false`; el `preload.js` expone únicamente la plataforma y las versiones.

## Requisitos

- Node.js instalado.
- Conexión a internet **una única vez** para instalar las dependencias de Electron.

## Instalación

Desde esta carpeta (`electron/`):

```
npm install
```

Esto instala `electron` y `electron-builder`. Solo es necesario la primera vez.

## Ejecutar

```
npm start
```

Se abre la ventana de escritorio con la aplicación completa (incluido el modo sin conexión, gracias al service worker).

## Generar un ejecutable `.exe` (opcional)

```
npm run dist
```

Usa `electron-builder` para empaquetar la aplicación. El resultado se escribe en `electron/dist/`.

Detalles del empaquetado:

- El `build` de `electron/package.json` copia la aplicación completa (raíz del proyecto) a `resources/app-root` mediante `extraResources`.
- `main.js` detecta esa ruta cuando está empaquetado y sirve desde ahí.
- El icono de la ventana y del ejecutable usa `assets/icons/icon-512.png`.

## Funcionamiento sin red

- La **aplicación empaquetada** (`.exe`) funciona **sin conexión** una vez generada: incluye todo el código, los estilos y los iconos.
- Solo el **proceso de empaquetado** (`npm run dist`) y la **instalación inicial** (`npm install`) requieren conexión.

## Desinstalación

- **Versión de desarrollo**: borra la carpeta `electron/` y (opcionalmente) `node_modules`.
- **Ejecutable portátil**: como es un `.exe` portátil, basta con borrar el archivo generado en `dist/`. No crea entradas de registro ni se "instala" en el sistema.

## Solución de problemas

| Problema | Causa | Solución |
|----------|-------|----------|
| `electron: command not found` | No se ejecutó `npm install`. | Ejecuta `npm install` dentro de `electron/`. |
| La ventana no abre o queda en blanco | La ruta del proyecto cambió. | `main.js` sirve desde `..` (la carpeta padre de `electron/`). Mantén `electron/` dentro de la raíz del proyecto. |
| El antivirus avisa al abrir el `.exe` | Ejecutable local sin firma de editor. | Revisa el aviso y añade una excepción para el archivo si confías en su origen. |
| No se ven los datos guardados | Se abrió una instancia distinta. | La app usa bloqueo de instancia única: solo hay una ventana. Los datos viven en el perfil de Electron (IndexedDB). |
