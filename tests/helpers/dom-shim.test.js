'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const domShim = require('./dom-shim.js');

domShim.install();
after(() => domShim.uninstall());

test('createElement tag/class/text', () => {
  const el = document.createElement('section');
  el.className = 'report-section';
  el.textContent = 'Hello';
  assert.deepEqual(
    { tag: el.tagName, class: el.className, text: el.textContent },
    { tag: 'SECTION', class: 'report-section', text: 'Hello' }
  );
});

test('appendChild with arrays', () => {
  const ul = document.createElement('ul');
  const li = document.createElement('li');
  li.textContent = 'item';
  ul.appendChild([li, 'tail', 42, document.createTextNode('-end')]);
  assert.deepEqual(
    { count: ul.children.length, text: ul.textContent },
    { count: 1, text: 'itemtail42-end' }
  );
});

test('textContent concatenation', () => {
  const p = document.createElement('p');
  p.appendChild(document.createTextNode('Hello '));
  const b = document.createElement('b');
  b.textContent = 'World';
  p.appendChild(b);
  assert.equal(p.textContent, 'Hello World');
});

test('elementToOutline shape', () => {
  const div = document.createElement('div');
  div.className = 'wrap';
  const p = document.createElement('p');
  p.textContent = '  Hi  ';
  div.appendChild(p);
  assert.deepEqual(domShim.elementToOutline(div), {
    tag: 'div',
    class: 'wrap',
    text: 'Hi',
    children: [{ tag: 'p', text: 'Hi' }]
  });
});
