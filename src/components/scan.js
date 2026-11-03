/* IntegrityWatch Field — scan
   Escaneo QR de placas (cámara), captura GPS y lectura de EXIF de fotos.
   Todas las funciones son seguras en Node: si la API del navegador falta,
   devuelven una Promise rechazada con código SCAN_* en vez de lanzar.
   Nunca usa console.log. Los errores tipados llevan e.code = 'SCAN_*'. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.components = root.IW.components || {};
  root.IW.components.scan = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Carga el parser hermano al ejecarse suelto en Node (en el navegador la
  // dependencia se resuelve por orden de scripts en index.html). Protegido:
  // nunca falla la carga del módulo.
  if (typeof require === 'function' && !(root.IW && root.IW.calc && root.IW.calc.exif)) {
    try { require('../calc/exif.js'); } catch (e) { /* ignorar */ }
  }

  function exifApi() { return root.IW && root.IW.calc && root.IW.calc.exif; }

  // Errores tipados: todo rechazo de este módulo es un Error con .code SCAN_*.
  function scanError(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  // Normalización de códigos de placa.
  // Pasos: recortar → MAYÚSCULAS → quitar prefijo 'TAG:'/'PLACA:'/'PLATE:'/
  // 'ETIQUETA:' (opcionalmente con espacios alrededor de los dos puntos) →
  // quitar TODOS los espacios en blanco.
  // Regex del prefijo (tras mayuscular ya no hay acentos que considerar):
  var PREFIX_RE = /^(?:TAG|PLACA|PLATE|ETIQUETA)[ \t]*:[ \t]*/;

  function qrTextToValue(text) {
    var s = (text === null || text === undefined) ? '' : String(text);
    s = s.trim().toUpperCase();
    s = s.replace(PREFIX_RE, '');
    return s.replace(/[\s\u00A0]+/g, '');
  }

  // Soporte QR síncrono y conservador: BarcodeDetector expuesto en window
  // (root === window en el navegador), cámara accesible y DOM presente.
  // El formato 'qr_code' se verifica de nuevo en scanNameplate, porque
  // getSupportedFormats() es asincrónico y aquí no se puede esperar.
  function isQrSupported() {
    return typeof root.BarcodeDetector === 'function' &&
      !!(root.navigator && root.navigator.mediaDevices &&
        typeof root.navigator.mediaDevices.getUserMedia === 'function') &&
      typeof root.document !== 'undefined' &&
      typeof root.document.createElement === 'function';
  }

  // Escanea una placa por cámara con QR. Opciones:
  //   preferBack   true = cámara trasera ('environment'), false = frontal.
  //   timeoutMs    milisegundos antes de rechazar con SCAN_TIMEOUT (12000).
  //   onFrame      callback({width,height}) en cada cuadro del loop de detección.
  //   signalCancel función que devuelve true para cancelar (SCAN_CANCELLED);
  //                además la Promise devuelta trae .cancel() (misma función).
  // Resolución: {value, format} con value normalizado vía qrTextToValue.
  // La promesa SE RECHAZA en Node (sin APIs) con SCAN_UNSUPPORTED y el
  // flujo de cámara se limpia SIEMPRE (try/finally lógico en cleanup()).
  function scanNameplate(opts) {
    var o = opts || {};
    var preferBack = o.preferBack !== false;
    var timeoutMs = (typeof o.timeoutMs === 'number' && o.timeoutMs > 0) ? o.timeoutMs : 12000;
    var onFrame = (typeof o.onFrame === 'function') ? o.onFrame : null;
    var signalCancel = (typeof o.signalCancel === 'function') ? o.signalCancel : null;

    if (!isQrSupported()) {
      var early = Promise.reject(scanError('SCAN_UNSUPPORTED',
        'Escaneo QR no disponible en este entorno (BarcodeDetector/cámara ausentes).'));
      early.cancel = function () { /* ya rechazada: nada que cancelar */ };
      return early;
    }

    var cancelFn = null;
    var result = new Promise(function (resolve, reject) {
      var settled = false;
      var stream = null;
      var video = null;
      var rafId = null;
      var timerId = null;
      var timeoutId = null;

      function cleanup() {
        // Apaga la cámara y detiene todo loop/temporizador. Nunca deja la
        // cámara encendida, pase lo que pase.
        if (timeoutId !== null) { root.clearTimeout(timeoutId); timeoutId = null; }
        if (timerId !== null) { root.clearTimeout(timerId); timerId = null; }
        if (rafId !== null && typeof root.cancelAnimationFrame === 'function') {
          root.cancelAnimationFrame(rafId); rafId = null;
        }
        if (video) {
          try { video.pause(); } catch (e) { /* ignorar */ }
          try { video.srcObject = null; } catch (e) { /* ignorar */ }
        }
        if (stream && typeof stream.getTracks === 'function') {
          var tracks = stream.getTracks();
          for (var i = 0; i < tracks.length; i++) {
            try { tracks[i].stop(); } catch (e) { /* ignorar */ }
          }
        }
        stream = null;
        video = null;
      }

      function finish(fn, args) {
        if (settled) { return; }
        settled = true;
        cleanup();
        fn.apply(null, args);
      }

      cancelFn = function () {
        finish(reject, [scanError('SCAN_CANCELLED', 'Escaneo cancelado.')]);
      };

      function schedule() {
        if (settled) { return; }
        if (typeof root.requestAnimationFrame === 'function') {
          rafId = root.requestAnimationFrame(tick);
        } else {
          timerId = root.setTimeout(tick, 150);
        }
      }

      function tick() {
        if (settled) { return; }
        if (signalCancel && signalCancel()) {
          finish(reject, [scanError('SCAN_CANCELLED', 'Escaneo cancelado por signalCancel.')]);
          return;
        }
        if (onFrame) {
          try { onFrame({ width: video.videoWidth || 0, height: video.videoHeight || 0 }); }
          catch (e) { /* el callback no debe romper el loop */ }
        }
        var pending;
        try { pending = detector.detect(video); }
        catch (e) { finish(reject, [scanError('SCAN_UNSUPPORTED', 'BarcodeDetector falló al detectar.')]); return; }
        Promise.resolve(pending).then(function (codes) {
          if (settled) { return; }
          if (codes && codes.length > 0) {
            var c = codes[0];
            finish(resolve, [{
              value: qrTextToValue(c.rawValue),
              format: c.format || 'qr_code'
            }]);
            return;
          }
          schedule();
        }, function () {
          // Un fallo transitorio de detección no aborta: reintenta hasta timeout.
          if (settled) { return; }
          schedule();
        });
      }

      var detector;
      try {
        detector = new root.BarcodeDetector();
      } catch (e) {
        finish(reject, [scanError('SCAN_UNSUPPORTED', 'BarcodeDetector no se pudo instanciar.')]);
        return;
      }

      var formatsP = (typeof detector.getSupportedFormats === 'function')
        ? Promise.resolve(detector.getSupportedFormats())
        : Promise.resolve(null);

      timeoutId = root.setTimeout(function () {
        finish(reject, [scanError('SCAN_TIMEOUT', 'El escaneo superó ' + timeoutMs + ' ms.')]);
      }, timeoutMs);

      formatsP.then(function (formats) {
        if (settled) { return; }
        if (formats && formats.length > 0 && formats.indexOf('qr_code') === -1) {
          finish(reject, [scanError('SCAN_UNSUPPORTED', 'El dispositivo no soporta formato QR.')]);
          return;
        }
        return root.navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: preferBack ? 'environment' : 'user' }
        }).then(function (s) {
          if (settled) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
          stream = s;
          video = root.document.createElement('video');
          video.setAttribute('playsinline', 'true');
          video.muted = true;
          video.srcObject = s;
          return Promise.resolve(video.play()).then(function () { schedule(); });
        });
      }).then(null, function (err) {
        if (settled) { return; }
        var name = (err && err.name) || '';
        var code;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          code = 'SCAN_CAMERA_DENIED';
        } else if (name === 'NotFoundError' || name === 'NotReadableError' ||
          name === 'OverconstrainedError') {
          code = 'SCAN_CAMERA_UNAVAILABLE';
        } else {
          code = 'SCAN_CAMERA_ERROR';
        }
        finish(reject, [scanError(code, 'No se pudo abrir la cámara: ' + name)]);
      });
    });

    result.cancel = function () {
      if (cancelFn) { cancelFn(); }
    };
    return result;
  }

  // Captura GPS de alta precisión. Resolución:
  //   {lat, lon, accuracyM, heightM|null, tsIso}
  // Rechazos: SCAN_UNSUPPORTED (sin API), SCAN_GPS_DENIED (permiso),
  // SCAN_GPS_TIMEOUT (code 3) y SCAN_GPS_UNAVAILABLE (resto de errores).
  function captureGps(opts) {
    var o = opts || {};
    var timeoutMs = (typeof o.timeoutMs === 'number' && o.timeoutMs > 0) ? o.timeoutMs : 8000;

    var geo = root.navigator && root.navigator.geolocation;
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      return Promise.reject(scanError('SCAN_UNSUPPORTED',
        'Geolocalización no disponible en este entorno.'));
    }

    return new Promise(function (resolve, reject) {
      geo.getCurrentPosition(function (pos) {
        var c = (pos && pos.coords) || {};
        var ts = (typeof pos.timestamp === 'number') ? pos.timestamp : Date.now();
        var iso;
        try { iso = new Date(ts).toISOString(); } catch (e) { iso = null; }
        resolve({
          lat: c.latitude,
          lon: c.longitude,
          accuracyM: (typeof c.accuracy === 'number') ? c.accuracy : null,
          heightM: (typeof c.altitude === 'number') ? c.altitude : null,
          tsIso: iso
        });
      }, function (err) {
        var code = (err && err.code);
        var outCode;
        if (code === 1) { outCode = 'SCAN_GPS_DENIED'; }
        else if (code === 3) { outCode = 'SCAN_GPS_TIMEOUT'; }
        else { outCode = 'SCAN_GPS_UNAVAILABLE'; }
        reject(scanError(outCode, 'GPS falló: ' + ((err && err.message) || 'sin detalle')));
      }, { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 });
    });
  }

  // Acepta ArrayBuffer, TypedArray/Buffer o Blob y devuelve Uint8Array.
  function toBytes(input) {
    if (input === null || input === undefined) { return Promise.resolve(null); }
    if (input instanceof Uint8Array) { return Promise.resolve(input); }
    if (typeof ArrayBuffer !== 'undefined') {
      if (input instanceof ArrayBuffer) { return Promise.resolve(new Uint8Array(input)); }
      if (ArrayBuffer.isView(input)) {
        return Promise.resolve(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
      }
    }
    if (typeof input.arrayBuffer === 'function') {
      // Blob (y File): conversión asincrónica disponible en navegadores y Node 18+.
      return Promise.resolve(input.arrayBuffer()).then(function (ab) {
        return new Uint8Array(ab);
      });
    }
    return Promise.resolve(null);
  }

  function noExif() {
    return { ok: false, reason: 'SCAN_NO_EXIF' };
  }

  // Lee los EXIF de una foto usando IW.calc.exif.parseExif (nunca se modifica).
  // IMPORTANTE — API real de exif.js: solo expone {capturedAt, gps, make,
  // model}. Los campos gpsAccuracy, pixelsX, pixelsY y orientation de este
  // resultado SIEMPRE salen null, porque el parser base no lee la etiqueta
  // Orientation (0x0112) ni los IFD de tamaño/precisión. Se conservan en la
  // forma por compatibilidad con la UI.
  // Resolución: {ok:true, camera, dateIso, lat, lon, gpsAccuracy, pixelsX,
  // pixelsY, orientation, rawKeys} o {ok:false, reason:'SCAN_NO_EXIF'}.
  function readPhotoExif(input) {
    return Promise.resolve().then(function () {
      var exif = exifApi();
      if (!exif || typeof exif.parseExif !== 'function') {
        return { ok: false, reason: 'SCAN_UNSUPPORTED' };
      }
      return toBytes(input).then(function (bytes) {
        if (!bytes || bytes.length < 4) { return noExif(); }
        var parsed = exif.parseExif(bytes);
        if (!parsed) { return noExif(); }
        var hasAny = !!(parsed.make || parsed.model || parsed.capturedAt || parsed.gps);
        if (!hasAny) { return noExif(); }

        var camera = null;
        if (parsed.make && parsed.model) {
          camera = String(parsed.make).trim() + ' ' + String(parsed.model).trim();
        } else if (parsed.make) {
          camera = String(parsed.make).trim();
        } else if (parsed.model) {
          camera = String(parsed.model).trim();
        }

        var rawKeys = [];
        var keyNames = ['make', 'model', 'capturedAt', 'gps'];
        for (var i = 0; i < keyNames.length; i++) {
          if (parsed[keyNames[i]] !== null && parsed[keyNames[i]] !== undefined) {
            rawKeys.push(keyNames[i]);
          }
        }

        var gps = parsed.gps || null;
        return {
          ok: true,
          camera: camera,
          dateIso: parsed.capturedAt || null,
          lat: gps ? gps.lat : null,
          lon: gps ? gps.lon : null,
          gpsAccuracy: null,
          pixelsX: null,
          pixelsY: null,
          orientation: null,
          rawKeys: rawKeys
        };
      });
    });
  }

  return {
    isQrSupported: isQrSupported,
    scanNameplate: scanNameplate,
    captureGps: captureGps,
    readPhotoExif: readPhotoExif,
    qrTextToValue: qrTextToValue
  };
});
