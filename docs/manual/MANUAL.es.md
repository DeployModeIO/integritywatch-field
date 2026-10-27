# IntegrityWatch Field — Manual del usuario

**Para quién está dirigido:** operadores de campo, ingenieros de integridad, supervisores de mantenimiento y operaciones. No se requiere conocimiento de programación. La aplicación funciona **100% en modo offline**. Tus datos nunca abandonan tu computadora.

---

## 1. Instalación y apertura de la aplicación

### Windows (portátil)
1. Descarga `IntegrityWatch-Field-Portable.part1.rar` y `part2.rar` desde GitHub Releases.
2. Coloca todos los archivos en la misma carpeta y extrae con WinRAR o 7-Zip.
3. Haz doble clic en `START-HERE.bat`. Se inicia un servidor local y se abre la aplicación en el navegador.
4. La aplicación también puede ejecutarse desde un pendrive. No es necesario instalarla ni tener permisos de administrador.

### macOS
1. Extrae el paquete y haz doble clic en `START-HERE.command`.
2. Tu navegador abre `http://localhost:8419`.

### Linux
1. Extrae el paquete y haz doble clic en `start.sh` (o ejecuta `./start.sh`).
2. Tu navegador abre `http://localhost:8419`.

### Instalar como aplicación (PWA) — recomendado para uso diario
1. Inicia la aplicación con `START-HERE.bat`.
2. En la barra de direcciones del navegador, haz clic en el **ícono de Instalar** (o en el menú ⋮ → "Instalar aplicación").
3. A partir de ahora, la aplicación se abre desde su propio ícono y funciona completamente en modo offline.

**Requisitos:** Chrome, Edge, Firefox o Safari de los últimos dos años. Pantalla mínima de 1366×768. Funciona en tabletas y móviles.

---

## 2. Primera ejecución (5 minutos)

1. La aplicación carga con **datos de demostración**: 8 puntos de corrosión, 5 válvulas, una tubería con 12 activos, 9 activos de APM y aproximadamente 120 lecturas. Esto muestra que todas las pantallas funcionan correctamente.
2. **Elige tu idioma** en la barra superior: English, Español, Français, Português, 简体中文, Русский, العربية. El árabe cambia el diseño completo a derecha a izquierda.
3. **Elige tu tema**: el botón ☀/🌙/🖥 cambia entre luz → oscuridad → automático. Tu elección se guarda.
4. **Filtro por sector** (Todos / Alta presión / Medio / Bajo) filtra el Dashboard y los activos de APM.

> Para comenzar con tus propios datos: menú **Admin → Reset demo data** (o eliminar todo).

---

## 3. Monitoreo de corrosión

1. **Crea un punto de monitoreo**: Corrosión → "Nuevo punto". Rellena el código (ejemplo: MP-CORR-021), material (13 aceros y aleaciones), tipo de sensor (cupón, ER, LPR, detector de H₂S, UT, visual) y datos del proceso (H₂S, CO₂, presión, temperatura, BS&W, velocidad, objetivo de inhibidor y residuo). Añade protección catódica y aislamiento contra CUI si aplica.
2. **Registra lecturas**: abre el punto → "Nueva lectura" → fecha + tasa (mpy) + nota.
3. **Registra cupones (pares de inhibidor/blank)**: "Nuevo cupón" → elige **Rol** (Blank o Inhibido) y **Par** (ejemplo: P3), luego peso inicial y final, área y días. La tasa de corrosión se calcula automáticamente (ASTM G1/G4). El panel de **eficiencia del inhibidor** compara ambos cupones y asigna una calificación (Excelente ≥90%, Mala <70%).
4. **Paneles automáticos**: balance de inhibidor (ventana de 80–150%), modelo De Waard–Milliams frente a lecturas reales, cribado de tuberías ácidas NACE MR0175 (pH₂S), protección catódica y CUI.
5. **Informe del punto**: el botón "Informe del punto" genera un informe imprimible — una página por punto de monitoreo.

---

## 4. Válvulas de seguridad de presión (PSV)

1. **Registra una válvula**: "Nueva PSV" → etiqueta, tipo (convencional / con bolsa balanceada / con piloto), fluido (11 pre-cargados, editables), presión de ajuste, temperatura, presión de retorno y fechas de prueba.
2. **Calcula el tamaño**: abre la válvula → pestañas **Gas** y **Líquido**:
   - Gas: flujo W, presión/temperatura, Z, M, k → área requerida según API 520. La aplicación detecta flujo crítico o subcrítico.
   - Líquido: flujo Q, gravedad G, viscosidad → área con corrección de viscosidad Kv.
   - La aplicación **elige el orificio API 526** (D–T) y muestra el margen y la capacidad real.
3. **Guarda el cálculo** en la válvula y imprime el **folleto técnico** (formato API 520 / ISA).

---

## 5. Tuberías (medio proceso)

1. **Crea el sistema**: nombre, operador, producto, diámetro, grosor de pared, material, longitud y rango de estaciones (km).
2. **Activos de línea**: dentro del sistema, "Nuevo activo de línea" → tipo (12 tipos: válvulas, uniones, estaciones de bomba y compresor, tanques, cruces, ROW, medidores…), km de estación y lado.
3. **Inspecciones**: tipo (ILI, corrosión externa, visual, UT, reparación, sustitución), sección en km, severidad, hallazgos.
4. **Mapa**: nodos dibujados en escala de km, coloreados por la severidad de la última inspección. Navegación por teclado (Tab y Enter).

---

## 6. Rendimiento de activos (APM)

1. **Crea un activo**: código, nombre, sector, categoría (barriles, plataformas, bombas, compresores, intercambiadores, torres, servicios…), criticidad A/B/C y **riesgo POF × COF** (estilo RBI). La fecha de próxima inspección se sugiere según el nivel de riesgo.
2. **Registra eventos**: falla, mantenimiento, apagado no programado, orden de trabajo o inspección, con fechas y tiempo de inactividad. La aplicación calcula **disponibilidad, MTBF y MTTR** y muestra un indicador de salud en forma de semáforo.
3. La **matriz de riesgo 5×5** muestra dónde se encuentra cada activo y qué prioridad de inspección recibe.

---

## 7. Importar tus datos (CSV, WITSML, JSON)

1. Pestaña **CSV** → "Seleccionar archivo" (o arrastra el archivo). Acepta archivos separados por coma, punto y coma o tabulador.
2. Revisa la **asignación de columnas** — la aplicación detecta automáticamente el punto, fecha, tasa, Wi, Wf, área, días, residuo, temperatura, bsw, categoría, nota. Se reconocen encabezados en español e inglés.
3. Marca **"Crear puntos faltantes"** si el archivo contiene nuevos puntos de monitoreo.
4. **Ejecuta validación** → la tabla de errores muestra filas incorrectas (fecha futura, Wf mayor que Wi, fuera de rango, punto desconocido, duplicados omitidos). Si cambias la casilla, vuelve a validar antes de importar.
5. **Importa** → se muestra un resumen, y la acción se registra en el historial.
6. Pestañas adicionales: **WITSML** (barras, trayectorias, canales) y **JSON** (copia completa, modo de fusión o reemplazo).

---

## 8. Reglas y recomendaciones

- Haz clic en **Ejecutar reglas** (botón en la barra superior) para escanear todo. La aplicación tiene 17 reglas técnicas (R1–R17): tasas de pérdida de pared, pitting, pruebas de PSV vencidas, problemas de inhibidores, hallazgos en tuberías y movimientos de riesgo en APM.
- Cada recomendación muestra la regla, los valores reales, el activo afectado y un enlace a su registro.
- Acciones: **Acepta** → **Resuelve** (con una nota). Todo está firmado con fecha y usuario.
- Si la condición vuelve a presentarse tras resolverla, la recomendación **se abre automáticamente**.

---

## 9. Informes

1. **Informe trimestral**: elige el periodo → Generar → portada, KPIs, gráfico semanal, puntos más críticos, eficiencia de pares, campañas y recomendaciones abiertas. Botón **Imprimir** → "Guardar como PDF".
2. **Informe del punto**: hoja técnica + historial + cálculos ASTM G1/G4 + clasificación SP0775 + cribado MR0175.
3. **Folleto de válvula**: hoja completa de dimensionado, copiable al portapapeles.

---

## 10. Copias de seguridad

1. **Admin → Exportar** crea un archivo JSON con todos tus datos. Guarda el archivo en la red o en un pendrive.
2. **Restaurar**: Ingestión → pestaña JSON → elige el archivo → modo **fusionar** (añade) o **reemplazar** (restauración total).
3. Haz copias de seguridad **cada semana** y siempre antes de una gran importación.

---

## 11. Recetas rápidas

| Lo que deseas... | Haz esto |
|------------------|---------|
| Cargar la campaña mensual de cupones | Ingestión → CSV → archivo → validar → importar → asignar Rol/Par → Ejecutar reglas → revisar Recomendaciones |
| Programar una inspección RBI | APM → activo → ajustar POF/COF → reprogramar próxima inspección (la fecha sigue el riesgo) |
| Imprimir el informe trimestral | Informes → Trimestral → fechas → Generar → Imprimir → PDF |
| Mover datos a un segundo portátil | Admin → Exportar → copiar el JSON → en el otro portátil: Ingestión → JSON → fusionar |

---

## 12. Solución de problemas

| Síntoma | Causa probable | Solución |
|--------|----------------|---------|
| "Puerto ocupado" al iniciar START-HERE | Otro programa usa el puerto 8419 | Ejecuta `tools\serve.ps1 -Port 9000`, o cierra el otro programa |
| PowerShell bloquea el script | Política de ejecución | Usa `START-HERE.bat` (ya incluye la excepción), o `py tools\serve.py` |
| No aparece el botón "Instalar aplicación" | Abrió `index.html` desde disco | Inicia con `START-HERE.bat` (la PWA necesita `http://localhost`) |
| Los datos desaparecieron | Ventana privada/incógnito, o datos del sitio borrados | Restaura tu copia de seguridad JSON; evita el modo privado |
| Mensaje "Actualización disponible" | Se publicó una nueva versión | Haz clic en **Recargar** en el banner |
| Versión antigua aún mostrada | Cache del service worker | Haz clic en **Recargar**, o presiona Ctrl+F5, o en DevTools → Aplicación → Service Workers → Actualizar |

---

## 13. Notas importantes

- IntegrityWatch Field es una **herramienta de apoyo**. No reemplaza la juicio de un ingeniero cualificado.
- Verifica todos los cálculos contra la edición actual de los estándares aplicables (API 510/570/653, ASME PCC-2, NACE SP0775/MR0175, ASTM G1/G4) y los datos del fabricante antes de cualquier decisión operativa.
- Licencia MIT. Libre para usar, copiar y modificar. Enlace a GitHub: ver el repositorio de este proyecto.