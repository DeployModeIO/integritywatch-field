# DEPLOY.md — Modos de ejecución y despliegue

IntegrityWatch Field es una aplicación **100 % cliente**: no necesita servidor, ni base de datos, ni internet. Este documento explica todas las formas de ejecutarla, instalarla como PWA, actualizarla, respaldarla y (opcionalmente) sincronizarla.

---

## 1. Modos de ejecución

### 1.1 `file://` (abrir `index.html` directamente)

Es la forma más simple: doble clic en `index.html`. La aplicación se carga y funciona, porque todo el código es JavaScript clásico (no módulos ES, que los navegadores bloquean bajo `file://` por CORS).

**Limitaciones exactas en `file://`:**

| Función | Estado en `file://` | Motivo |
|---------|---------------------|--------|
| Service worker (offline / precache) | No disponible | Los navegadores solo permiten registrar un service worker en orígenes `http(s)`, nunca en `file://`. |
| Instalación como PWA | No disponible | El manifiesto y el service worker requieren `http(s)`. |
| Actualizaciones automáticas de caché | No disponible | Dependen del service worker. |
| Toda la lógica de cálculo, reglas y datos | Funciona | Se ejecuta en el navegador, sin servidor. |

Al abrir por `file://`, la aplicación muestra una **franja informativa** que explica estas limitaciones y sugiere usar un servidor local.

### 1.2 `START-HERE.bat` (Windows, recomendado)

Doble clic en `START-HERE.bat`. Intenta, en orden:

1. `powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 -Open` (servidor con `HttpListener`).
2. Si lo anterior falla, `py -3 tools\serve.py --open` (servidor con Python).

Abre el navegador en `http://localhost:8419/` y deja una ventana de consola abierta. **Cierra la aplicación deteniendo el servidor con `Ctrl+C`** en esa ventana.

### 1.3 `tools/serve.ps1` (PowerShell)

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8419 -Open
```

| Parámetro | Descripción |
|-----------|-------------|
| `-Port <n>` | Puerto (por defecto `8419`). |
| `-Open` | Abre el navegador automáticamente. |
| `-Root <ruta>` | Carpeta a servir (por defecto la raíz del proyecto). |

### 1.4 `tools/serve.py` (Python 3.8+)

```
python tools/serve.py --port 8419 --open
```

Parámetros: `--port`, `--open`, `--root`.

### 1.5 Cualquier servidor estático

Sirve la carpeta raíz del proyecto con cualquier servidor HTTP estático. Ejemplos:

**nginx** (fragmento):

```nginx
server {
    listen 8419;
    root /ruta/a/integritywatch-field;
    index index.html;

    types {
        application/manifest+json webmanifest;
        text/javascript js;
        image/svg+xml svg;
        image/x-icon ico;
        application/xml xml;
        text/csv csv;
        text/tab-separated-values tsv;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**IIS** (nota de MIME): IIS no conoce el tipo `.webmanifest` por defecto. Añade un tipo MIME en el sitio o en `web.config`:

```xml
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".webmanifest" />
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>
  </system.webServer>
</configuration>
```

La PWA y el service worker funcionan en `http://` (localhost) y `https://`.

---

## 2. Instalación como PWA

| Plataforma | Pasos |
|------------|-------|
| **Windows — Edge** | Abre la app servida → icono de instalación en la barra de direcciones (o menú ⋯ → *Aplicaciones* → *Instalar este sitio como aplicación*). |
| **Windows — Chrome** | Abre la app servida → icono de instalación (monitor con flecha) en la barra de direcciones → *Instalar*. |
| **Android — Chrome** | Abre la app → menú ⋯ → *Instalar aplicación* / *Añadir a pantalla de inicio*. |
| **iOS — Safari** | Abre la app → botón *Compartir* → *Añadir a pantalla de inicio* → *Añadir*. |

En iOS, Safari usa el icono `apple-touch-icon.png` (ya incluido en `assets/icons/`). Una vez instalada, la app se abre a pantalla completa desde su propio icono y funciona sin conexión.

---

## 3. Actualizaciones

La versión de caché se define en `sw.js`:

```js
const CACHE_NAME = 'iw-v3';   // IMPORTANTE: incrementar en CADA publicación
```

Para publicar una actualización:

1. Ejecuta `node tools/bump-cache.cjs` (incrementa la versión automáticamente).
2. El `install` precachea los recursos nuevos y llama a `self.skipWaiting()`.
3. En `activate`, se borran las cachés antiguas y se avisa a las pestañas abiertas con un mensaje `sw:updated`.
4. La aplicación muestra un **toast de actualización** ("Actualización disponible → Recargar") y, además,
   `main.js` **fuerza la comprobación de actualización en cada carga** (`registration.update()`), de modo
   que la siguiente recarga del usuario ya recibe la versión nueva.
5. ⚠️ **Olvidar el paso 1 deja a los clientes con la versión anterior indefinidamente** (la estrategia es
   *cache-first*): es exactamente la causa del síntoma "sigo viendo todo igual". Si un navegador quedó
   atascado de una publicación anterior: Ctrl+F5 una vez, o DevTools → Application → Service Workers → Update.

Los recursos se sirven con `Cache-Control: no-cache` y el service worker usa *stale-while-revalidate* para las peticiones del mismo origen.

---

## 4. Respaldos (backups)

- **Exportar**: en **Administración → Gestión de datos**, botón *Exportar* (o en **Ingesta**, exportación JSON). Genera un archivo JSON con todos los datos.
- **Importar**: en el mismo lugar, con dos modos:
  - **Merge** (combinar): añade y actualiza registros sin borrar los existentes.
  - **Replace** (reemplazar): vacía los almacenes presentes en el archivo y carga los datos del respaldo.
- **Recomendación**: haz una copia periódica del archivo exportado (por ejemplo, una vez a la semana o antes de cada cierre de campaña) y guárdala fuera del dispositivo.

---

## 5. Sincronización remota (opcional)

La aplicación **nunca requiere** un servidor remoto. Si quieres consolidar datos en un servidor propio, puedes configurar un endpoint:

- Se configura en **Administración** con `meta.syncEndpoint` (URL de tu servidor).
- Cada guardado/borrado se encola localmente (`mutationQueue`) y se envía cuando hay conexión.
- El envío es un `POST` con cuerpo JSON de la forma:

```json
{ "op": { "type": "put", "store": "readings", "rec": { "id": "…", "…": "…" } } }
```

`op.type` puede ser `put` o `delete` (`store` + `rec`/`id`). Los reintentos usan backoff (1 s, 5 s, 30 s) y, tras 5 intentos, la operación queda marcada como `dead` (reintentable desde Administración).

- **Sin endpoint configurado**, la cola permanece latente y no tiene coste.
- La cola se procesa automáticamente al recuperar la conexión (`online`).

---

## 6. Electron (opcional)

Contenedor de escritorio opcional. Detalles completos en `electron/README.md`.

- **Requisitos**: Node.js y una instalación única de dependencias (`npm install` dentro de `electron/`, requiere conexión una única vez).
- **Ejecutar**: `npm start` dentro de `electron/`.
- **Empaquetar**: `npm run dist` (usa `electron-builder`, salida en `electron/dist/`).

### Cómo funciona

`electron/main.js` levanta un **servidor HTTP interno en Node puro** (sin dependencias) que sirve la raíz del proyecto en `127.0.0.1` con un **puerto efímero** (`server.listen(0)`). Luego abre una ventana `BrowserWindow` (1280×860) apuntando a `http://127.0.0.1:<puerto>/index.html`.

Se sirve por HTTP local **precisamente para que el service worker funcione**: el SW no puede registrarse en `file://`, y con un origen `http://127.0.0.1` sí lo hace. La CSP definida en `index.html` se hereda tal cual.

### Empaquetado `.exe`

Configuración de ejemplo en `electron/package.json` (`build`):

```jsonc
{
  "appId": "local.integritywatch.field",
  "win": { "target": "portable", "icon": "../assets/icons/icon-512.png" }
  // los archivos de la app se incluyen con "extraResources" hacia "app-root"
}
```

El ejecutable portátil resultante funciona **sin red** una vez generado.

### Limitaciones de Electron

- Usa un **servidor HTTP interno** en un puerto efímero de `127.0.0.1` (no un puerto fijo).
- Sin el servidor HTTP no habría SW: por eso **no se sirve por `file://`**, sino por `http://127.0.0.1`.
- El empaquetado incluye la app completa copiándola a `resources/app-root` (`extraResources`); `main.js` resuelve esa ruta al detectar que está empaquetado.

---

## 7. Solución de problemas (troubleshooting)

| Problema | Causa probable | Solución |
|----------|----------------|----------|
| "Could not start server on port 8419" | Puerto ocupado por otra aplicación. | Usa otro puerto: `powershell -File tools\serve.ps1 -Port 8500` (o `python tools/serve.py --port 8500`). |
| PowerShell bloquea el script (`serve.ps1`) | `ExecutionPolicy` restrictiva. | `START-HERE.bat` ya usa `-ExecutionPolicy Bypass`. Manualmente: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1`. |
| El antivirus avisa al ejecutar `START-HERE.bat` o Electron | Falso positivo por script/ejecutable local sin firma. | Revisa el aviso y añade una excepción para la carpeta del proyecto. |
| No se guardan datos / se borran al cerrar | Navegador en **modo privado/incógnito** (IndexedDB se limpia al cerrar). | Usa una ventana normal. |
| No aparece la opción de instalar (PWA) | Estás en `file://` o el servidor no sirve el manifest. | Sirve por `http(s)` (Opción 1) y verifica el tipo MIME `.webmanifest`. |
| La app no se actualiza tras un cambio | La caché del SW aún apunta a la versión anterior. | Aumenta `CACHE_NAME` en `sw.js` y recarga (o usa "Vaciar caché y recargar" en DevTools). |
| Electron no arranca | Falta `npm install` en `electron/`. | Ejecuta `npm install` una vez dentro de `electron/`. |
