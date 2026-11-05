/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { select, selectAll } from 'hast-util-select';
import { toString } from 'hast-util-to-string';
import { toHtml } from 'hast-util-to-html';
import { h } from 'hastscript';

/*
 * JSON blocks
 * -----------
 * A JSON block stores a structured document (e.g. an Adaptive Form definition) as JSON in a
 * single cell, by default `<pre><code>{...}</code></pre>`. To let the Universal Editor edit
 * every entry of the JSON's item list as its own component, the UE rendition of the block is
 * expanded: each item becomes a virtual key-value element (one row per model property) that
 * the DA plugin of the UE service can read and patch like any key-value block. On write the
 * virtual elements are folded back into the JSON, so the stored document only contains JSON.
 *
 * Blocks opt in through the optional `component-json-mappings.json` of the site (next to
 * component-definition.json). The model fields of the item components are named by the JSON
 * path they edit (e.g. `label.value`). Every setting is optional except the block name:
 *
 *   [{
 *     "block": "form",
 *     "selector": "pre > code",          // where the JSON lives          (default)
 *     "items": "items",                   // path of the item list        (default)
 *     "filter": "form-fields",            // UE filter of the container   (default: block filter)
 *     "root": "form-settings",            // model of the block: the document's own properties,
 *                                         // mapped by the block definition with selectors
 *                                         // .json-prop-<name> > div (non-alphanumerics as _)
 *     "label": "label.value",             // item path used as UE label   (default: "title")
 *     "component": {                      // how an item maps to a UE component
 *       "keys": [":type", "fieldType"],   // item paths tried in order    (default: ["type"])
 *       "match": [{ "when": { "fieldType": "button", "events.click": "/submitForm/" },
 *                   "component": "form-submit-button" }],
 *       "aliases": { "text": "text-input" }
 *     },
 *     "defaults": { "form-submit-button": { "events": { "click": "submitForm()" } } }
 *   }]
 *
 * New items start with the `value` of their model fields, merged with `defaults`.
 */

const DEFAULTS = {
  selector: 'pre > code',
  items: 'items',
};

export function getJsonBlockConfig(ueConfig, blockName) {
  const mappings = ueConfig?.['component-json-mapping'];
  if (!mappings || !blockName) return null;
  const cfg = Array.isArray(mappings)
    ? mappings.find((m) => m?.block === blockName)
    : mappings[blockName];
  return cfg ? { ...DEFAULTS, ...cfg } : null;
}

function getComponentDefinition(ueConfig, id) {
  const groups = ueConfig?.['component-definition']?.groups || [];
  return groups.flatMap((group) => group.components || []).find((c) => c.id === id) || null;
}

function getModelFields(ueConfig, id) {
  const model = ueConfig?.['component-model']?.find((m) => m.id === id);
  const flat = [];
  const walk = (fields) => (fields || []).forEach((field) => {
    if (Array.isArray(field.fields)) walk(field.fields);
    if (field.name && field.component !== 'tab' && field.component !== 'container') flat.push(field);
  });
  walk(model?.fields);
  return flat;
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  });
  const last = keys[keys.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
}

function matches(item, when) {
  return Object.entries(when || {}).every(([path, expected]) => {
    const actual = getPath(item, path);
    const text = typeof actual === 'string' ? actual : JSON.stringify(actual ?? '');
    if (typeof expected === 'string' && expected.length > 1 && expected.startsWith('/') && expected.endsWith('/')) {
      return new RegExp(expected.slice(1, -1)).test(text);
    }
    return actual === expected;
  });
}

export function resolveComponent(item, cfg, ueConfig) {
  const { component = {} } = cfg;
  const rule = (component.match || []).find((r) => matches(item, r.when));
  if (rule) return rule.component;

  const keys = component.keys || (component.key ? [component.key] : ['type']);
  for (const key of keys) {
    const value = getPath(item, key);
    if (typeof value === 'string' && value) {
      const id = component.aliases?.[value] || value;
      if (getComponentDefinition(ueConfig, id)) return id;
    }
  }
  return null;
}

function cellText(value) {
  if (Array.isArray(value)) return value.join(',');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// components whose definition has a filter hold child items (e.g. form panels)
function childFilter(ueConfig, componentId) {
  return componentId ? getComponentDefinition(ueConfig, componentId)?.filter : undefined;
}

function rowsFor(target, componentId, ueConfig) {
  const rows = [];
  getModelFields(ueConfig, componentId).forEach((field) => {
    const value = getPath(target, field.name);
    if (value !== undefined && value !== null) {
      rows.push(h('div', [h('div', field.name), h('div', cellText(value))]));
    }
  });
  return rows;
}

// class of the element of a document property. The DA plugin reads an attribute of the selected
// element when it has one, so the value is in an attribute-free child: .json-prop-<name> > div
const PROP_PREFIX = 'json-prop-';

export function propClass(name) {
  return `${PROP_PREFIX}${name.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

const isPropElement = (node) => (node.properties.className || [])
  .some((name) => String(name).startsWith(PROP_PREFIX));

function expandItems(items, parentPath, ctx, out) {
  const { cfg, ueConfig, blockResource } = ctx;
  items.forEach((item, i) => {
    const path = [...parentPath, i];
    const componentId = resolveComponent(item, cfg, ueConfig);
    const rows = componentId ? rowsFor(item, componentId, ueConfig) : [];
    const properties = {
      className: componentId ? [componentId] : [],
      'data-json-index': path.join('.'),
      'data-json-id': String(item.id ?? item.name ?? ''),
    };
    const filter = childFilter(ueConfig, componentId);
    if (componentId) {
      const label = getPath(item, cfg.label || 'title')
        ?? item.name ?? getComponentDefinition(ueConfig, componentId)?.title;
      Object.assign(properties, {
        'data-aue-resource': `${blockResource}/${path.map((n) => `item-${n}`).join('/')}`,
        'data-aue-type': filter ? 'container' : 'component',
        'data-aue-component': componentId,
        'data-aue-model': componentId,
        'data-aue-label': String(label ?? componentId),
      });
      if (filter) {
        Object.assign(properties, { 'data-aue-behavior': 'component', 'data-aue-filter': filter });
      }
    }
    out.push(h('div', properties, rows));
    // the DA plugin reads every child of a key-value element as property row, so the child
    // items of a container follow it in their own element
    if (filter) {
      const children = [];
      const childItems = getPath(item, cfg.items);
      expandItems(Array.isArray(childItems) ? childItems : [], path, ctx, children);
      out.push(h('div', { 'data-json-children': path.join('.') }, children));
    }
  });
}

/**
 * Expands a JSON block of the UE rendition: the block becomes a container and every item of
 * the JSON a virtual key-value component, addressed as `<blockResource>/item-<index>`. Child
 * items of container components are addressed as `.../item-<index>/item-<childIndex>`.
 * @returns {boolean} true if the block was handled as JSON block
 */
export function expandJsonBlock(block, blockName, blockResource, cfg, ueConfig) {
  const code = select(cfg.selector, block);
  if (!code) return false;
  let doc;
  try {
    doc = JSON.parse(toString(code));
  } catch {
    return false;
  }
  const items = getPath(doc, cfg.items);
  if (!Array.isArray(items)) return false;

  const blockCmpDef = getComponentDefinition(ueConfig, blockName);
  const filter = cfg.filter
    || ueConfig?.['component-filter']?.find((f) => f.id === blockName)?.id;
  Object.assign(block.properties, {
    'data-aue-resource': blockResource,
    'data-aue-type': 'container',
    'data-aue-behavior': 'component',
    'data-aue-component': blockName,
    'data-aue-label': blockCmpDef?.title || blockName,
    'data-json-block': blockName,
  });
  if (filter) block.properties['data-aue-filter'] = filter;

  // the properties of the document itself (e.g. form title and submit settings) are the
  // block's own model: one element per property, which the block definition of the site maps
  // with `plugins.da.fields` selectors (.json-prop-<name> > div, see propClass)
  // (direct children of the block, the DA plugin writes block fields there)
  if (cfg.root && getModelFields(ueConfig, cfg.root).length) {
    block.properties['data-aue-model'] = cfg.root;
    getModelFields(ueConfig, cfg.root).forEach((field) => {
      const value = getPath(doc, field.name);
      block.children.push(h('div', { className: [propClass(field.name)] }, [
        h('div', value == null ? '' : cellText(value)),
      ]));
    });
  }
  expandItems(items, [], { cfg, ueConfig, blockResource }, block.children);
  return true;
}

function readCell(cell) {
  const elements = (cell.children || []).filter((c) => c.type === 'element');
  return elements.length ? toHtml(cell.children).trim() : toString(cell).trim();
}

function readRows(element) {
  const data = {};
  (element.children || []).filter((c) => c.type === 'element').forEach((row) => {
    const cells = (row.children || []).filter((c) => c.type === 'element');
    if (cells.length !== 2) return;
    const key = toString(cells[0]).trim();
    if (key) data[key] = readCell(cells[1]);
  });
  return data;
}

const normalizeCommas = (s) => String(s).replace(/\s*,\s*/g, ',');

function coerce(field, raw, original) {
  const { component, valueType = '' } = field;
  if (component === 'boolean' || valueType === 'boolean') return raw === true || raw === 'true';
  const isArray = field.multi || valueType.endsWith('[]') || component === 'multiselect';
  if (isArray) {
    const list = Array.isArray(raw) ? raw : String(raw).split(',').map((s) => s.trim()).filter((s) => s);
    return valueType.startsWith('number') ? list.map(Number) : list;
  }
  if ((component === 'number' || valueType === 'number') && raw !== '' && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  // the key-value round trip loses blanks after commas and turns lists into text; keep the
  // stored value when nothing changed
  if ((typeof original === 'string' || Array.isArray(original))
    && normalizeCommas(cellText(original)) === normalizeCommas(raw)) {
    return original;
  }
  return raw;
}

function fallbackForRemoved(original) {
  if (typeof original === 'boolean') return false;
  if (typeof original === 'number') return 0;
  return undefined;
}

function collectNames(items, names = new Set()) {
  (items || []).forEach((it) => {
    if (it?.name) names.add(it.name);
    if (it?.id) names.add(it.id);
    collectNames(it?.items, names);
  });
  return names;
}

function uniqueName(used, base) {
  const clean = String(base || 'item').replace(/[^A-Za-z0-9_-]/g, '_');
  let name = clean;
  for (let n = 1; used.has(name); n += 1) name = `${clean}_${n}`;
  used.add(name);
  return name;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    if (isObject(value) && isObject(target[key])) merge(target[key], value);
    else target[key] = structuredClone(value);
  });
  return target;
}

function newItem(componentId, cfg, ueConfig) {
  const item = {};
  getModelFields(ueConfig, componentId).forEach((field) => {
    const { value } = field;
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      setPath(item, field.name, structuredClone(value));
    }
  });
  merge(item, cfg.defaults?.[componentId]);
  if (childFilter(ueConfig, componentId) && getPath(item, cfg.items) === undefined) {
    setPath(item, cfg.items, []);
  }
  return item;
}

// new and copied items, including their child items, need their own name/id
function rename(item, base, used, cfg) {
  const name = uniqueName(used, base || item.name || item.fieldType);
  item.name = name;
  item.id = name;
  const children = getPath(item, cfg.items);
  if (Array.isArray(children)) {
    children.forEach((child) => rename(child, child.name || child.fieldType, used, cfg));
  }
}

function applyRows(item, rows, componentId, ueConfig, original) {
  getModelFields(ueConfig, componentId).forEach((field) => {
    const before = getPath(original, field.name);
    if (Object.prototype.hasOwnProperty.call(rows, field.name)) {
      setPath(item, field.name, coerce(field, rows[field.name], before));
    } else if (before !== undefined) {
      // the DA plugin drops rows with falsy values when patching
      setPath(item, field.name, fallbackForRemoved(before));
    }
  });
}

const isElement = (node) => node.type === 'element';

// virtual item elements, as opposed to the property rows of an item element
function isItemElement(node) {
  if (!isElement(node)) return false;
  if (node.properties.dataJsonChildren !== undefined || isPropElement(node)) return false;
  const { dataJsonIndex, dataAueComponent, className } = node.properties;
  return dataJsonIndex !== undefined || Boolean(dataAueComponent) || Boolean(className?.length);
}

function getOriginal(items, index, cfg) {
  return String(index).split('.').reduce((list, n, i, all) => {
    const item = Array.isArray(list) ? list[Number(n)] : undefined;
    return i === all.length - 1 ? item : getPath(item, cfg.items);
  }, items);
}

function foldItems(elements, ctx) {
  const { cfg, ueConfig } = ctx;
  return elements.map((element) => {
    const index = element.properties.dataJsonIndex;
    const componentId = element.properties.dataAueComponent
      || (element.properties.className || [])[0];
    const rows = readRows(element);
    const original = index !== undefined ? getOriginal(ctx.originals, index, cfg) : undefined;
    const isOriginal = original !== undefined;
    const isCopy = isOriginal && ctx.seen.has(index);
    if (index !== undefined) ctx.seen.add(index);
    const item = isOriginal ? structuredClone(original) : newItem(componentId, cfg, ueConfig);
    if (componentId) applyRows(item, rows, componentId, ueConfig, original || {});

    // child items: the container element of the item, then items the DA plugin added into
    // the item element itself
    const container = isOriginal && !isCopy ? ctx.containers.get(index) : undefined;
    const added = element.children.filter(isItemElement);
    if (container || added.length) {
      const children = container ? container.children.filter(isItemElement) : [];
      const existing = isOriginal && !container ? getPath(item, cfg.items) || [] : [];
      setPath(item, cfg.items, [
        ...existing, ...foldItems(children, ctx), ...foldItems(added, ctx),
      ]);
    }
    if (!isOriginal || isCopy) rename(item, rows.name || item.name || componentId, ctx.used, cfg);
    return item;
  });
}

/**
 * Folds the virtual item elements of all JSON blocks back into the block JSON and removes
 * them, so only the JSON source is persisted. Unknown item properties are kept from the
 * original JSON item the element was created from. An item belongs to the container it is
 * placed in, so items moved into or out of container items follow.
 */
export function collapseJsonBlocks(bodyTree, ueConfig) {
  selectAll('[data-json-block]', bodyTree).forEach((block) => {
    const blockName = block.properties.dataJsonBlock;
    delete block.properties.dataJsonBlock;
    const cfg = getJsonBlockConfig(ueConfig, blockName) || { ...DEFAULTS };
    const code = select(cfg.selector, block);
    const sourceRow = code
      && block.children.find((c) => isElement(c) && select(cfg.selector, c) === code);
    const virtual = block.children.filter((c) => isElement(c) && c !== sourceRow);
    // the virtual elements are never persisted, even if the JSON cannot be updated
    block.children = block.children.filter((c) => !virtual.includes(c));
    if (!code || !getJsonBlockConfig(ueConfig, blockName)) return;

    let doc;
    try {
      doc = JSON.parse(toString(code));
    } catch {
      return;
    }
    const originals = getPath(doc, cfg.items) || [];
    const containers = new Map();
    virtual.forEach((el) => selectAll('[data-json-children]', { type: 'root', children: [el] })
      .forEach((c) => containers.set(c.properties.dataJsonChildren, c)));
    const ctx = {
      cfg, ueConfig, originals, containers, used: collectNames(originals), seen: new Set(),
    };
    const items = foldItems(virtual.filter(isItemElement), ctx);

    if (cfg.root && getModelFields(ueConfig, cfg.root).length) {
      // the last element of a property wins (the DA plugin may add one); empty or removed
      // properties are unset
      const values = {};
      getModelFields(ueConfig, cfg.root).forEach(({ name }) => {
        const el = virtual.filter((v) => (v.properties.className || []).includes(propClass(name)))
          .pop();
        const cell = el && (el.children.find(isElement) || el);
        const value = cell ? readCell(cell) : '';
        if (value !== '') values[name] = value;
      });
      applyRows(doc, values, cfg.root, ueConfig, structuredClone(doc));
    }
    setPath(doc, cfg.items, items);
    code.children = [{ type: 'text', value: JSON.stringify(doc, null, 2) }];
  });
  return bodyTree;
}
