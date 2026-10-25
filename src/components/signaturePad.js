/* IntegrityWatch Field — signaturePad
   Canvas-based signature capture with Pointer Events and devicePixelRatio scaling. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.components = root.IW.components || {};
  root.IW.components.signaturePad = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function createSignaturePad(container, opts) {
    opts = opts || {};
    var width = opts.width || 300;
    var height = opts.height || 120;
    var labelKey = opts.labelKey || 'evidence.signature.label';
    var hintKey = opts.hintKey || 'evidence.signature.hint';

    var wrapper = document.createElement('div');
    wrapper.className = 'signature-pad';

    var label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = (root.IW && root.IW.i18n && typeof root.IW.i18n.t === 'function')
      ? root.IW.i18n.t(labelKey) : labelKey;
    wrapper.appendChild(label);

    var canvas = document.createElement('canvas');
    canvas.className = 'signature-pad__canvas';
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label.textContent);
    wrapper.appendChild(canvas);

    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    var drawing = false;
    var dirty = false;

    var hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.textContent = (root.IW && root.IW.i18n && typeof root.IW.i18n.t === 'function')
      ? root.IW.i18n.t(hintKey) : 'Draw your signature above';
    wrapper.appendChild(hint);

    var clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-ghost';
    clearBtn.type = 'button';
    clearBtn.textContent = (root.IW && root.IW.i18n && typeof root.IW.i18n.t === 'function')
      ? root.IW.i18n.t('evidence.signature.clear') : 'Clear';
    clearBtn.addEventListener('click', function () { clear(); });
    wrapper.appendChild(clearBtn);

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onPointerDown(e) {
      drawing = true;
      dirty = true;
      var p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!drawing) { return; }
      var p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      e.preventDefault();
    }

    function onPointerUp(e) {
      drawing = false;
      e.preventDefault();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    function isEmpty() {
      return !dirty;
    }

    function toDataURL() {
      return canvas.toDataURL('image/png');
    }

    function clear() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#000000';
      dirty = false;
    }

    function destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      if (wrapper.parentNode) { wrapper.parentNode.removeChild(wrapper); }
    }

    container.appendChild(wrapper);

    return { canvas: canvas, isEmpty: isEmpty, toDataURL: toDataURL, clear: clear, destroy: destroy, node: wrapper };
  }

  function downscaleDataUrl(dataUrl, maxDim) {
    maxDim = maxDim || 1024;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        if (w <= maxDim && h <= maxDim) {
          resolve(dataUrl);
          return;
        }
        var scale = maxDim / Math.max(w, h);
        var nw = Math.round(w * scale);
        var nh = Math.round(h * scale);
        var c = document.createElement('canvas');
        c.width = nw;
        c.height = nh;
        var cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, nw, nh);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { reject(new Error('Failed to load image for downscale')); };
      img.src = dataUrl;
    });
  }

  return { createSignaturePad: createSignaturePad, downscaleDataUrl: downscaleDataUrl };
});