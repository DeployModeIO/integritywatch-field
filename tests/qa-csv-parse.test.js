'use strict';
const { detectDelimiter, parse } = require('../src/ingest/csv');
const { describe, test, it } = require('node:test');

describe('csv ingest tests', function () {
  describe('detectDelimiter', function () {
    it('1 a,b\n1,2,3 → comma', function () {
      const result = detectDelimiter('a,b\n1,2,3');
      if (result !== ',') { throw new Error('expected comma, got ' + JSON.stringify(result)); }
    });

    it('2 a;b\n1;2 → semicolon', function () {
      const result = detectDelimiter('a;b\n1;2');
      if (result !== ';') { throw new Error('expected semicolon, got ' + JSON.stringify(result)); }
    });

    it('3 a\tb\n1\t2 → tab', function () {
      const result = detectDelimiter('a\tb\n1\t2');
      if (result !== '\t') { throw new Error('expected tab, got ' + JSON.stringify(result)); }
    });

    it('4 empty text returns actual value', function () {
      const result = detectDelimiter('');
      // assert the real returned value
      if (typeof result !== 'string') { throw new Error('expected string, got ' + typeof result); }
    });
  });

  describe('parse', function () {
    it('5 x,y\n1,2\n3,4 → headers [x,y], 2 rows', function () {
      const result = parse('x,y\n1,2\n3,4');
      if (!Array.isArray(result.headers) || result.headers[0] !== 'x' || result.headers[1] !== 'y') {
        throw new Error('expected headers [x,y], got ' + JSON.stringify(result.headers));
      }
      if (!Array.isArray(result.rows) || result.rows.length !== 2) {
        throw new Error('expected 2 rows, got ' + result.rows.length);
      }
    });

    it('6 with quotes a,"x, y" → cell x, y', function () {
      const result = parse('a\n"x, y"');
      const row = result.rows[0];
      if (row[0] !== 'x, y') { throw new Error('expected cell "x, y", got ' + JSON.stringify(row[0])); }
    });

    it('7 escape a,"say """hi""" → say "hi"', function () {
      const result = parse('a\n"say ""hi"""');
      const row = result.rows[0];
      if (row[0] !== 'say "hi"') { throw new Error('expected say "hi", got ' + JSON.stringify(row[0])); }
    });

    it('8 CRLF a,b\r\n1,2 same as LF', function () {
      const result = parse('a,b\r\n1,2');
      if (result.headers[0] !== 'a' || result.rows[0][0] !== '1') {
        throw new Error('CRLF parse unexpected: ' + JSON.stringify(result));
      }
    });

    it('9 newline inside quotes a,"l1\nl2"\n1,x → cell with \\n', function () {
      const result = parse('a,b\n"l1\nl2","1,x"');
      const row = result.rows[0];
      if (row[0] !== 'l1\nl2') { throw new Error('expected cell with newline, got ' + JSON.stringify(row[0])); }
      if (row[1] !== '1,x') { throw new Error('expected second cell 1,x, got ' + JSON.stringify(row[1])); }
    });

    it('10 header-only a,b → rows []', function () {
      const result = parse('a,b');
      if (!Array.isArray(result.rows) || result.rows.length !== 0) {
        throw new Error('expected 0 rows, got ' + result.rows.length);
      }
    });

    it('11 extra short row a,b,c\n1,, → missing cells empty', function () {
      const result = parse('a,b,c\n1,,' );
      const row = result.rows[0];
      if (row.length !== 3) { throw new Error('expected 3 cells, got ' + row.length); }
      if (row[1] !== '') { throw new Error('expected empty cell at index 1, got ' + JSON.stringify(row[1])); }
      if (row[2] !== '') { throw new Error('expected empty cell at index 2, got ' + JSON.stringify(row[2])); }
    });
  });
});