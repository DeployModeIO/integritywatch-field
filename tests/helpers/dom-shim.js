'use strict';

class Node {
  constructor() {
    this.parentNode = null;
    this.childNodes = [];
  }

  appendChild(child) {
    const items = Array.isArray(child) ? child : [child];
    for (let i = 0; i < items.length; i++) {
      this._appendOne(items[i]);
    }
    return this;
  }

  _appendOne(item) {
    if (item === null || item === undefined || item === false) { return; }
    if (Array.isArray(item)) { this.appendChild(item); return; }
    if (typeof item === 'string' || typeof item === 'number') {
      item = document.createTextNode(String(item));
    }
    if (!(item instanceof Node)) { return; }
    if (item.parentNode && item.parentNode !== this) {
      const idx = item.parentNode.childNodes.indexOf(item);
      if (idx !== -1) { item.parentNode.childNodes.splice(idx, 1); }
    }
    item.parentNode = this;
    this.childNodes.push(item);
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(value) {
    this.childNodes = [];
    if (value !== null && value !== undefined && value !== '') {
      this._appendOne(value);
    }
  }

  get children() {
    return this.childNodes.filter((c) => c instanceof Element);
  }
}

class Text extends Node {
  constructor(data) {
    super();
    this._data = String(data);
  }

  get textContent() { return this._data; }
  set textContent(value) { this._data = String(value); }
}

class Element extends Node {
  constructor(tagName, namespaceURI) {
    super();
    this.tagName = tagName;
    this.namespaceURI = namespaceURI || null;
    this._attributes = {};
    this._className = '';
  }

  get className() { return this._className; }
  set className(value) { this._className = String(value); }

  setAttribute(name, value) {
    name = String(name);
    if (name === 'class') { this.className = value; }
    else { this._attributes[name] = String(value); }
  }

  getAttribute(name) {
    name = String(name);
    if (name === 'class') { return this._className; }
    return Object.prototype.hasOwnProperty.call(this._attributes, name) ? this._attributes[name] : null;
  }

  get classList() {
    if (!this._classList) { this._classList = new ClassList(this); }
    return this._classList;
  }
}

class ClassList {
  constructor(element) { this._element = element; }

  _tokens() {
    return this._element.className.split(/\s+/).filter(Boolean);
  }

  add() {
    const tokens = this._tokens();
    for (let i = 0; i < arguments.length; i++) {
      if (tokens.indexOf(arguments[i]) === -1) { tokens.push(arguments[i]); }
    }
    this._element.className = tokens.join(' ');
  }

  remove() {
    const removeSet = new Set(arguments);
    const tokens = this._tokens().filter((t) => !removeSet.has(t));
    this._element.className = tokens.join(' ');
  }

  contains(name) {
    return this._tokens().indexOf(name) !== -1;
  }
}

function createDocument() {
  return {
    createElement(tag) { return new Element(String(tag).toUpperCase(), null); },
    createElementNS(ns, tag) { return new Element(String(tag), String(ns)); },
    createTextNode(text) { return new Text(text); }
  };
}

const saved = { document: null, Node: null, hadDocument: false, hadNode: false };

function install() {
  saved.hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  saved.hadNode = Object.prototype.hasOwnProperty.call(globalThis, 'Node');
  saved.document = globalThis.document;
  saved.Node = globalThis.Node;
  globalThis.document = createDocument();
  globalThis.Node = Node;
}

function uninstall() {
  if (saved.hadDocument) { globalThis.document = saved.document; }
  else { delete globalThis.document; }
  if (saved.hadNode) { globalThis.Node = saved.Node; }
  else { delete globalThis.Node; }
}

function elementToOutline(el) {
  const seen = new WeakSet();
  return walk(el, seen);
}

function walk(node, seen) {
  const tag = node && node.tagName ? String(node.tagName).toLowerCase() : '';
  const out = { tag: tag };
  if (node && typeof node.className === 'string' && node.className) {
    out.class = node.className;
  }
  if (node && typeof node.textContent === 'string') {
    const text = node.textContent.trim();
    if (text) { out.text = text; }
  }
  if (node && !seen.has(node)) {
    seen.add(node);
    const kids = Array.isArray(node.children) ? node.children : [];
    if (kids.length) { out.children = kids.map((c) => walk(c, seen)); }
  }
  return out;
}

module.exports = { install, uninstall, Node, elementToOutline };
