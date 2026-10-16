/* IntegrityWatch Field — csv
   Delimited-file import: detect, parse, map, validate and convert. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.csv = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Load the sibling corrosion engine when required standalone so that
  // toRecords can resolve IW.calc.corrosion at call time (browser relies on
  // script order in index.html). Protected: never fails the module load.
  if (typeof require === 'function' && !(root.IW && root.IW.calc && root.IW.calc.corrosion)) {
    try { require('../calc/corrosion.js'); } catch (e) { /* ignore */ }
  }

  var DEFAULT_DENSITY = 7.85;

  function corrosion() { return root.IW && root.IW.calc && root.IW.calc.corrosion; }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad3(n) { return ('00' + n).slice(-3); }

  function daysInMonth(year, month) {
    var d = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) { return 29; }
    return d[month - 1];
  }

  // Normalize a header for alias lookup: lowercase, strip diacritics (NFD),
  // collapse whitespace/underscore/hyphen runs to a single space, trim edges.
  function normalizeHeader(s) {
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_\-]+/g, ' ')
      .trim();
  }

  var ALIAS_SOURCE = {
    mpCode: ['punto', 'code', 'código', 'codigo', 'código punto', 'codigo punto', 'mp', 'mp-code', 'point', 'tag', 'id punto', 'monitoring point', 'mpCode'],
    date: ['fecha', 'date', 'reading date', 'fecha lectura'],
    crMpy: ['tasa', 'rate', 'cr', 'mpy', 'corrosion rate', 'tasa de corrosión', 'tasa corrosion', 'crMpy'],
    wiMg: ['wi', 'w initial', 'peso inicial', 'initial weight', 'w_i', 'wiMg'],
    wfMg: ['wf', 'w final', 'peso final', 'final weight', 'w_f', 'wfMg'],
    areaIn2: ['área', 'area', 'a', 'area in2', 'exposición', 'areaIn2'],
    days: ['días', 'dias', 'days', 'exposición días', 'exposure days'],
    inhibitorResidualPpm: ['residual', 'inhibidor residual', 'inhibitor residual', 'residual ppm', 'inhibitorResidualPpm'],
    tempC: ['temperatura', 'temp', 'temperature', '°c', 'temp c', 'tempC'],
    bswPct: ['bsw', '%bsw', 'bs&w', 'agua y sedimentos', 'bswPct'],
    category: ['categoría', 'categoria', 'category'],
    note: ['nota', 'note', 'comentarios', 'remarks']
  };

  var aliasLookup = {};
  Object.keys(ALIAS_SOURCE).forEach(function (canonical) {
    ALIAS_SOURCE[canonical].forEach(function (alias) {
      aliasLookup[normalizeHeader(alias)] = canonical;
    });
  });

  // Majority vote over the first 5 non-empty lines: count occurrences of each
  // candidate delimiter and return the one with the most votes.
  function detectDelimiter(text) {
    text = String(text || '');
    var lines = text.split(/\r\n|\r|\n/);
    var votes = { ',': 0, ';': 0, '\t': 0 };
    var counted = 0;
    for (var i = 0; i < lines.length && counted < 5; i++) {
      var line = lines[i];
      if (line === '') { continue; }
      votes[','] += (line.match(/,/g) || []).length;
      votes[';'] += (line.match(/;/g) || []).length;
      votes['\t'] += (line.match(/\t/g) || []).length;
      counted++;
    }
    var best = ',';
    var bestCount = -1;
    for (var d in votes) {
      if (votes[d] > bestCount) { best = d; bestCount = votes[d]; }
    }
    return best;
  }

  // Parse delimited text into { headers, rows } supporting double quotes and
  // "" escapes, and CRLF / LF / CR line endings (newlines inside quotes kept).
  function parse(text, opts) {
    text = String(text || '');
    opts = opts || {};
    var delim = opts.delimiter || detectDelimiter(text);

    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    var n = text.length;

    function pushField() { row.push(field); field = ''; }
    function pushRow() { pushField(); rows.push(row); row = []; }

    while (i < n) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"' && field === '') { inQuotes = true; i++; continue; }
      if (ch === delim) { pushField(); i++; continue; }
      if (ch === '\r') {
        if (text[i + 1] === '\n') { i += 2; } else { i += 1; }
        pushRow(); continue;
      }
      if (ch === '\n') { i += 1; pushRow(); continue; }
      field += ch; i++;
    }
    if (field !== '' || row.length > 0) { pushRow(); }

    var headers = rows.length ? rows[0] : [];
    return { headers: headers, rows: rows.slice(1) };
  }

  // Map file headers to canonical fields via alias table; unrecognized headers
  // are reported in `unmapped` (original strings preserved).
  function mapColumns(headers) {
    var mapping = {};
    var unmapped = [];
    (headers || []).forEach(function (h) {
      var canonical = aliasLookup[normalizeHeader(h)];
      if (canonical) { mapping[h] = canonical; }
      else { unmapped.push(h); }
    });
    return { mapping: mapping, unmapped: unmapped };
  }

  function getCell(row, field) {
    var v = row[field];
    return (v === undefined || v === null) ? '' : String(v).trim();
  }
  function hasCell(row, field) { return getCell(row, field) !== ''; }
  function isEmptyRow(row) {
    return Object.keys(row).every(function (k) { return getCell(row, k) === ''; });
  }
  function err(rowNum, code, field, message) {
    return { rowNum: rowNum, code: code, field: field, message: message };
  }
  function toNum(str) {
    var s = String(str).trim();
    if (s === '') { return null; }
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  // Parse an accepted date form into a normalized 'YYYY-MM-DD' string, or null.
  function parseDate(str) {
    str = String(str).trim();
    if (str === '') { return null; }

    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      var ms = Date.parse(str);
      if (isNaN(ms)) { return null; }
      return new Date(ms).toISOString().slice(0, 10);
    }

    var m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (m1) {
      var y = +m1[1], mo = +m1[2], d = +m1[3];
      if (mo < 1 || mo > 12) { return null; }
      if (d < 1 || d > daysInMonth(y, mo)) { return null; }
      return str;
    }

    var m2 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
    if (m2) {
      var dd = +m2[1], mo2 = +m2[2], y2 = +m2[3];
      if (mo2 < 1 || mo2 > 12) { return null; }
      if (dd < 1 || dd > daysInMonth(y2, mo2)) { return null; }
      return pad2(y2) + '-' + pad2(mo2) + '-' + pad2(dd);
    }

    return null;
  }

  // Validate canonical rows (objects keyed by canonical field). Each row is
  // classified as a reading (has crMpy) or a coupon (has wi/wf/area/days).
  function validateRows(opts) {
    opts = opts || {};
    var rows = opts.rows || [];
    var existingPointIds = opts.existingPointIds || [];
    var nowISO = opts.nowISO || new Date().toISOString();
    var autoCreatePoints = !!opts.autoCreatePoints;

    var existingSet = {};
    existingPointIds.forEach(function (id) { existingSet[id] = true; });

    var valid = [];
    var invalid = [];
    var duplicates = [];
    var newPoints = [];
    var seen = {};
    var nextNewId = 1;
    var newIdByCode = {};

    var nowMs = Date.parse(nowISO);
    var limitDate = isNaN(nowMs) ? null : new Date(nowMs + 86400000).toISOString().slice(0, 10);

    rows.forEach(function (row, idx) {
      var rowNum = idx + 1;
      if (isEmptyRow(row)) { return; }

      var code = getCell(row, 'mpCode');
      var dateStr = getCell(row, 'date');

      if (code === '') {
        invalid.push(err(rowNum, 'E_ID', 'mpCode', 'Missing point code'));
        return;
      }
      if (dateStr === '') {
        invalid.push(err(rowNum, 'E_EMPTY', 'date', 'Missing date'));
        return;
      }
      var parsedDate = parseDate(dateStr);
      if (parsedDate === null) {
        invalid.push(err(rowNum, 'E_DATE_FORMAT', 'date', 'Invalid date format'));
        return;
      }
      if (limitDate !== null && parsedDate > limitDate) {
        invalid.push(err(rowNum, 'E_DATE_FUTURE', 'date', 'Date is in the future'));
        return;
      }

      var mpId = code;
      if (!existingSet[code]) {
        if (autoCreatePoints) {
          if (!newIdByCode[code]) {
            newIdByCode[code] = 'MP-IMP-' + pad3(nextNewId++);
            newPoints.push({ id: newIdByCode[code], code: code });
          }
          mpId = newIdByCode[code];
        } else {
          invalid.push(err(rowNum, 'E_MP_UNKNOWN', 'mpCode', 'Unknown monitoring point'));
          return;
        }
      }

      var hasRate = hasCell(row, 'crMpy');
      var hasCoupon = hasCell(row, 'wiMg') || hasCell(row, 'wfMg') || hasCell(row, 'areaIn2') || hasCell(row, 'days');

      var crMpy = null;
      var wiMg = null;
      var wfMg = null;
      var areaIn2 = null;
      var days = null;

      if (hasRate) {
        crMpy = toNum(getCell(row, 'crMpy'));
        if (crMpy === null || crMpy < 0 || crMpy > 1000) {
          invalid.push(err(rowNum, 'E_RANGE', 'crMpy', 'Corrosion rate out of range [0, 1000]'));
          return;
        }
      } else if (hasCoupon) {
        var missing = [];
        if (!hasCell(row, 'wiMg')) { missing.push('wiMg'); }
        if (!hasCell(row, 'wfMg')) { missing.push('wfMg'); }
        if (!hasCell(row, 'areaIn2')) { missing.push('areaIn2'); }
        if (!hasCell(row, 'days')) { missing.push('days'); }
        if (missing.length > 0) {
          invalid.push(err(rowNum, 'E_EMPTY', missing[0], 'Missing required coupon field'));
          return;
        }
        wiMg = toNum(getCell(row, 'wiMg'));
        wfMg = toNum(getCell(row, 'wfMg'));
        areaIn2 = toNum(getCell(row, 'areaIn2'));
        days = toNum(getCell(row, 'days'));
        if (wiMg === null || wfMg === null || areaIn2 === null || days === null) {
          invalid.push(err(rowNum, 'E_EMPTY', 'wiMg', 'Non-numeric coupon field'));
          return;
        }
        if (wfMg > wiMg) {
          invalid.push(err(rowNum, 'E_WF', 'wfMg', 'Final weight exceeds initial weight'));
          return;
        }
        if (areaIn2 <= 0) {
          invalid.push(err(rowNum, 'E_RANGE', 'areaIn2', 'Area must be > 0'));
          return;
        }
        if (days <= 0) {
          invalid.push(err(rowNum, 'E_RANGE', 'days', 'Days must be > 0'));
          return;
        }
      } else {
        invalid.push(err(rowNum, 'E_EMPTY', 'crMpy', 'Row has no reading or coupon data'));
        return;
      }

      var dupKey = hasRate
        ? code + '|' + parsedDate + '|' + crMpy
        : code + '|' + wiMg + '|' + wfMg + '|' + areaIn2 + '|' + days;
      if (seen[dupKey]) {
        duplicates.push(err(rowNum, 'E_DUPLICATE', hasRate ? 'crMpy' : 'wiMg', 'Duplicate row'));
        return;
      }
      seen[dupKey] = true;

      var entry = {
        rowNum: rowNum,
        mpCode: code,
        mpId: mpId,
        date: parsedDate,
        crMpy: crMpy,
        wiMg: wiMg,
        wfMg: wfMg,
        areaIn2: areaIn2,
        days: days
      };
      ['inhibitorResidualPpm', 'tempC', 'bswPct', 'category', 'note'].forEach(function (f) {
        if (hasCell(row, f)) { entry[f] = getCell(row, f); }
      });
      valid.push(entry);
    });

    return { valid: valid, invalid: invalid, duplicates: duplicates, newPoints: newPoints };
  }

  // Convert valid rows into store records: a row with a rate becomes a
  // reading; a row with wi/wf/area/days becomes a coupon whose corrosion rate
  // is derived via IW.calc.corrosion.crFromWeightLoss (ASTM G4).
  function toRecords(validRows, mapping) {
    var readings = [];
    var coupons = [];
    (validRows || []).forEach(function (r) {
      if (r.crMpy !== null && r.crMpy !== undefined) {
        var reading = { mpId: r.mpId, date: r.date, crMpy: r.crMpy, source: 'import' };
        if (r.note) { reading.note = r.note; }
        readings.push(reading);
      } else if (r.wiMg !== null && r.wiMg !== undefined) {
        var cr = corrosion().crFromWeightLoss({
          deltaWmg: r.wiMg - r.wfMg,
          densityGcm3: DEFAULT_DENSITY,
          areaIn2: r.areaIn2,
          days: r.days
        });
        coupons.push({
          mpId: r.mpId,
          material: null,
          densityGcm3: DEFAULT_DENSITY,
          wiMg: r.wiMg,
          wfMg: r.wfMg,
          areaIn2: r.areaIn2,
          days: r.days,
          exposedHours: r.days * 24,
          startDate: r.date,
          crMpy: cr.mpy
        });
      }
    });
    return { readings: readings, coupons: coupons };
  }

  return {
    detectDelimiter: detectDelimiter,
    parse: parse,
    mapColumns: mapColumns,
    validateRows: validateRows,
    toRecords: toRecords
  };
});
