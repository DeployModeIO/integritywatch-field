/* IntegrityWatch Field — witsmlLite
   Pure-JS, DOM-free WITSML-lite subset parser (wells, trajectory stations, channels). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.witsmlLite = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Optional namespace prefix (e.g. "witsml:"). The parser is prefix-agnostic:
  // it accepts any "prefix:" before the subset element names, or none at all.
  var TAG_PREFIX = '[\\w.-]+:';

  // Decode the five XML predefined entities plus numeric character references.
  // &amp; is decoded last so "&amp;lt;" yields the literal text "&lt;".
  function decodeEntities(s) {
    return s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&amp;/g, '&');
  }

  // Extract attributes (double- or single-quoted) from an opening-tag body.
  function parseAttrs(body) {
    var out = {};
    var re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    var m;
    while ((m = re.exec(body)) !== null) {
      out[m[1]] = decodeEntities(m[2] !== undefined ? m[2] : m[3]);
    }
    return out;
  }

  function toNum(v) {
    if (v === undefined || v === null || v === '') { return undefined; }
    var n = Number(v);
    return isFinite(n) ? n : undefined;
  }

  // Strip the XML declaration, comments and DOCTYPE so they cannot be
  // mistaken for subset elements.
  function clean(xml) {
    return String(xml == null ? '' : xml)
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  }

  // Escape regex metacharacters so a tag name is always matched literally.
  // This keeps an untrusted name from injecting quantifiers/alternations that
  // could cause catastrophic backtracking (ReDoS).
  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Scan for a leaf element (<name …> or <name …/>), returning its attributes.
  // The lookahead after the (escaped) name requires the tag name to end at a
  // delimiter, keeping <well> from matching <wells>.
  function scanLeaf(xml, name) {
    var re = new RegExp('<(' + TAG_PREFIX + ')?' + escapeRegExp(name) + '(?=[\\s/>])([^>]*)>', 'gi');
    var out = [];
    var m;
    while ((m = re.exec(xml)) !== null) {
      out.push(parseAttrs(m[2]));
    }
    return out;
  }

  // Scan for <channel>…</channel> blocks, returning attributes + inner text.
  function scanChannels(xml) {
    var re = new RegExp(
      '<(' + TAG_PREFIX + ')?channel\\b([^>]*)>([\\s\\S]*?)<\\/(?:' + TAG_PREFIX + ')?channel\\s*>',
      'gi'
    );
    var out = [];
    var m;
    while ((m = re.exec(xml)) !== null) {
      out.push({ attrs: parseAttrs(m[2]), inner: m[3] });
    }
    return out;
  }

  // Subset limitations (documented, not certified ETP/WITSML 1.4.1):
  //  - Attribute values must not contain a raw '>' character.
  //  - Elements are matched by name only; namespace URIs are ignored.
  //  - <channel> blocks must be explicitly closed; self-closing channels are ignored.
  //  - CDATA sections inside the subset elements are not specially handled.
  function parse(xmlText) {
    var src = clean(xmlText);
    var result = { wells: [], trajectoryStations: [], channels: [], errors: [] };

    // Wells: every <well> element (leaf). Missing attributes simply map to undefined.
    scanLeaf(src, 'well').forEach(function (a) {
      result.wells.push({ uid: a.uid, name: a.name, field: a.field, operator: a.operator });
    });

    // Trajectory stations: every <station> element (leaf). md/incl/azi are numeric.
    scanLeaf(src, 'station').forEach(function (a) {
      result.trajectoryStations.push({
        wellUid: a.wellUid,
        md: toNum(a.md),
        incl: toNum(a.incl),
        azi: toNum(a.azi)
      });
    });

    // Channels: each <channel> block carries <point> leaves. A point missing its
    // time or value is reported as E_WITSML_POINT and skipped, so one bad point
    // never aborts the remaining points or channels.
    scanChannels(src).forEach(function (ch) {
      var channel = {
        wellUid: ch.attrs.wellUid,
        name: ch.attrs.name,
        unit: ch.attrs.unit,
        mpCode: ch.attrs.mpCode,
        points: []
      };
      scanLeaf(ch.inner, 'point').forEach(function (p) {
        var time = p.time;
        var value = p.value;
        if (value === undefined || value === '' || time === undefined || time === '') {
          result.errors.push({
            code: 'E_WITSML_POINT',
            detail: 'point without time/value in channel ' + (channel.name || channel.mpCode || '(unnamed)')
          });
          return;
        }
        channel.points.push({ time: time, value: toNum(value) });
      });
      result.channels.push(channel);
    });

    return result;
  }

  return { parse: parse, scanLeaf: scanLeaf };
});
