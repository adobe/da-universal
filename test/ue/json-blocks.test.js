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

/* eslint-env mocha */
import assert from 'assert';
import { describe, it } from 'mocha';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { select, selectAll } from 'hast-util-select';
import { toString } from 'hast-util-to-string';
import { h } from 'hastscript';
import { injectUEAttributes, removeUEAttributes } from '../../src/ue/attributes.js';
import {
  collapseJsonBlocks, getJsonBlockConfig, resolveComponent,
} from '../../src/ue/json-blocks.js';

const FORM = {
  title: 'Contact',
  items: [
    {
      id: 'name', name: 'name', fieldType: 'text', label: { value: 'Name' }, required: true,
    },
    {
      id: 'country',
      name: 'country',
      fieldType: 'select',
      label: { value: 'Country' },
      enum: ['us', 'in'],
      enumNames: ['United States', 'India'],
      description: 'Pick one, please',
      rules: { visible: "name != ''" },
    },
    {
      id: 'submit', fieldType: 'button', label: { value: 'Send' }, events: { click: 'submitForm()' },
    },
  ],
};

const UE_CONFIG = {
  'component-definition': {
    groups: [{
      id: 'blocks',
      components: [
        { id: 'form', title: 'Form', plugins: { da: { unsafeHTML: '<div class="form"></div>' } } },
        {
          id: 'text-input',
          title: 'Text Input',
          plugins: { da: { type: 'key-value-block' } },
        },
        { id: 'drop-down', title: 'Drop Down', plugins: { da: { type: 'key-value-block' } } },
        { id: 'form-submit-button', title: 'Submit', plugins: { da: { type: 'key-value-block' } } },
        {
          id: 'panel', title: 'Panel', filter: 'form', plugins: { da: { type: 'key-value-block' } },
        },
      ],
    }],
  },
  'component-model': [
    {
      id: 'text-input',
      fields: [
        { component: 'tab', name: 'basic', label: 'Basic' },
        {
          component: 'container',
          name: 'group',
          fields: [
            { component: 'text', name: 'name', valueType: 'string' },
            {
              component: 'text', name: 'label.value', valueType: 'string', value: 'Text Input',
            },
          ],
        },
        {
          component: 'boolean', name: 'required', valueType: 'boolean', value: false,
        },
        {
          component: 'boolean', name: 'visible', valueType: 'boolean', value: true,
        },
        { component: 'text', name: 'constraintMessages.required', valueType: 'string' },
        { component: 'number', name: 'maxLength', valueType: 'number' },
        { component: 'text', name: 'properties.hint', valueType: 'string' },
      ],
    },
    {
      id: 'drop-down',
      fields: [
        { component: 'text', name: 'name', valueType: 'string' },
        { component: 'text', name: 'label.value', valueType: 'string' },
        {
          component: 'text', name: 'enum', valueType: 'string', multi: true,
        },
        {
          component: 'text', name: 'enumNames', valueType: 'string', multi: true,
        },
        { component: 'richtext', name: 'description', valueType: 'string' },
      ],
    },
    {
      id: 'panel',
      fields: [
        { component: 'text', name: 'label.value', valueType: 'string' },
        {
          component: 'text', name: 'fieldType', valueType: 'string', value: 'panel',
        },
      ],
    },
    {
      id: 'form-submit-button',
      fields: [
        { component: 'text', name: 'label.value', valueType: 'string' },
        { component: 'text', name: 'events.click', valueType: 'string' },
      ],
    },
  ],
  'component-filter': [{ id: 'form', components: ['text-input', 'drop-down', 'panel'] }],
  'component-json-mapping': [{
    block: 'form',
    filter: 'form',
    label: 'label.value',
    component: {
      match: [{ when: { fieldType: 'button', 'events.click': '/submitForm/' }, component: 'form-submit-button' }],
      keys: [':type', 'fieldType'],
      aliases: { text: 'text-input', select: 'drop-down' },
    },
    defaults: { 'text-input': { fieldType: 'text-input', properties: { colspan: 12 } } },
  }],
};

function page(json = FORM) {
  const code = JSON.stringify(json, null, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<html><body><main><div><div class="form"><div><div><pre><code>${code}</code></pre></div></div></div></div></main></body></html>`;
}

// UE rendition, as loaded by the DA plugin of the UE service
function render(json) {
  const tree = fromHtml(page(json));
  injectUEAttributes(select('body', tree), UE_CONFIG);
  return fromHtml(toHtml(tree));
}

// what da-universal persists after the DA plugin posted the edited rendition
function store(tree) {
  const body = select('body', tree);
  collapseJsonBlocks(body, UE_CONFIG);
  removeUEAttributes(body);
  return body;
}

const storedJson = (body) => JSON.parse(toString(select('pre > code', body)));
const byResource = (tree, resource) => select(`[data-aue-resource="${resource}"]`, tree);

// mirrors KeyValue#details / KeyValue#patch of the DA plugin of the UE service
function pluginDetails(element) {
  const data = {};
  element.children.filter((r) => r.type === 'element').forEach((row) => {
    const [key, value] = row.children.filter((c) => c.type === 'element');
    const tokens = toString(value).split(',');
    const text = toString(value).trim();
    data[toString(key).trim()] = tokens.length > 1 ? tokens.map((t) => t.trim()) : text;
  });
  return data;
}

function pluginPatch(tree, resource, ops) {
  const element = byResource(tree, resource);
  const data = pluginDetails(element);
  ops.forEach(({ op, path, value }) => {
    const key = path.slice(1);
    if (op === 'remove') delete data[key];
    else data[key] = value;
  });
  element.children = Object.entries(data)
    .filter(([, v]) => v && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => h('div', [h('div', k), h('div', Array.isArray(v) ? v.join(',') : String(v))]));
}

describe('JSON blocks', () => {
  it('is disabled without a mapping for the block', () => {
    assert.strictEqual(getJsonBlockConfig({}, 'form'), null);
    assert.strictEqual(getJsonBlockConfig(UE_CONFIG, 'cards'), null);
    const tree = fromHtml(page());
    injectUEAttributes(select('body', tree), { ...UE_CONFIG, 'component-json-mapping': undefined });
    assert.strictEqual(select('[data-json-block]', tree), undefined);
  });

  it('accepts the mapping as object keyed by block name and applies defaults', () => {
    const cfg = getJsonBlockConfig({ 'component-json-mapping': { form: {} } }, 'form');
    assert.strictEqual(cfg.selector, 'pre > code');
    assert.strictEqual(cfg.items, 'items');
  });

  it('resolves components by rules, keys and aliases, skipping unknown values', () => {
    const cfg = getJsonBlockConfig(UE_CONFIG, 'form');
    assert.strictEqual(resolveComponent(FORM.items[0], cfg, UE_CONFIG), 'text-input');
    assert.strictEqual(resolveComponent(FORM.items[2], cfg, UE_CONFIG), 'form-submit-button');
    assert.strictEqual(resolveComponent({ ':type': 'core/fd/x', fieldType: 'drop-down' }, cfg, UE_CONFIG), 'drop-down');
    assert.strictEqual(resolveComponent({ fieldType: 'unknown' }, cfg, UE_CONFIG), null);
  });

  it('expands every item into a key-value component of the block container', () => {
    const tree = render();
    const block = select('.form', tree);
    assert.strictEqual(block.properties.dataAueType, 'container');
    assert.strictEqual(block.properties.dataAueFilter, 'form');
    assert.strictEqual(block.properties.dataAueResource, 'urn:ab:section-0/block-0');
    assert.ok(select('pre > code', block), 'JSON source is kept');

    const items = selectAll('[data-json-index]', block);
    assert.strictEqual(items.length, 3);
    const name = byResource(tree, 'urn:ab:section-0/block-0/item-0');
    assert.strictEqual(name.properties.dataAueComponent, 'text-input');
    assert.strictEqual(name.properties.dataAueLabel, 'Name');
    assert.strictEqual(name.properties.dataJsonId, 'name');
    assert.deepStrictEqual(pluginDetails(name), { name: 'name', 'label.value': 'Name', required: 'true' });
    assert.deepStrictEqual(pluginDetails(byResource(tree, 'urn:ab:section-0/block-0/item-1')).enum, ['us', 'in']);
  });

  it('keeps the JSON unchanged when nothing was edited', () => {
    assert.deepStrictEqual(storedJson(store(render())), FORM);
  });

  it('persists only the JSON source', () => {
    const body = store(render());
    assert.strictEqual(selectAll('[data-json-index]', body).length, 0);
    assert.strictEqual(select('[data-json-block]', body), undefined);
    assert.strictEqual(select('.form', body).children.length, 1);
  });

  it('applies property patches to the JSON paths of the model fields with their value types', () => {
    const tree = render();
    pluginPatch(tree, 'urn:ab:section-0/block-0/item-0', [
      { op: 'replace', path: '/label.value', value: 'Full name' },
      { op: 'add', path: '/constraintMessages.required', value: 'Required!' },
      { op: 'add', path: '/maxLength', value: 20 },
      { op: 'add', path: '/properties.hint', value: 'custom' },
    ]);
    const [name] = storedJson(store(tree)).items;
    assert.deepStrictEqual(name.label, { value: 'Full name' });
    assert.strictEqual(name.required, true);
    assert.deepStrictEqual(name.constraintMessages, { required: 'Required!' });
    assert.strictEqual(name.maxLength, 20);
    assert.deepStrictEqual(name.properties, { hint: 'custom' });
  });

  it('turns booleans dropped by the plugin into false', () => {
    const tree = render();
    pluginPatch(tree, 'urn:ab:section-0/block-0/item-0', [{ op: 'replace', path: '/required', value: false }]);
    assert.strictEqual(storedJson(store(tree)).items[0].required, false);
  });

  it('keeps unmapped data and text with commas of patched items', () => {
    const tree = render();
    pluginPatch(tree, 'urn:ab:section-0/block-0/item-1', [{ op: 'replace', path: '/label.value', value: 'Land' }]);
    const country = storedJson(store(tree)).items[1];
    assert.strictEqual(country.label.value, 'Land');
    assert.strictEqual(country.description, 'Pick one, please');
    assert.deepStrictEqual(country.enum, ['us', 'in']);
    assert.deepStrictEqual(country.rules, FORM.items[1].rules);
  });

  it('keeps stored values the key-value round trip cannot represent', () => {
    const json = structuredClone(FORM);
    json.items[2].events.click = ['submitForm()', "dispatch($form, 'done')"];
    const tree = render(json);
    pluginPatch(tree, 'urn:ab:section-0/block-0/item-2', [{ op: 'replace', path: '/label.value', value: 'Go' }]);
    const submit = storedJson(store(tree)).items[2];
    assert.strictEqual(submit.label.value, 'Go');
    assert.deepStrictEqual(submit.events.click, json.items[2].events.click);
  });

  it('adds new items from the model field values and the defaults', () => {
    const tree = render();
    // the DA plugin creates `<div class="<component>"></div>` for key-value blocks
    select('.form', tree).children.splice(3, 0, h('div', { className: ['text-input'] }));
    const { items } = storedJson(store(tree));
    assert.strictEqual(items.length, 4);
    assert.deepStrictEqual(items[2], {
      label: { value: 'Text Input' },
      visible: true,
      fieldType: 'text-input',
      properties: { colspan: 12 },
      name: 'text-input',
      id: 'text-input',
    });
    assert.strictEqual(items[3].id, 'submit');
  });

  it('applies moves, copies and removals', () => {
    const tree = render();
    const block = select('.form', tree);
    const [source, name, country, submit] = block.children.filter((c) => c.type === 'element');
    const copy = structuredClone(name);
    block.children = [source, country, name, copy];
    assert.ok(submit);
    const { items } = storedJson(store(tree));
    assert.deepStrictEqual(items.map((i) => i.id), ['country', 'name', 'name_1']);
    assert.strictEqual(items[2].name, 'name_1');
  });

  it('drops the virtual items but keeps the JSON when no mapping is available', () => {
    const tree = render();
    pluginPatch(tree, 'urn:ab:section-0/block-0/item-0', [{ op: 'replace', path: '/label.value', value: 'X' }]);
    const body = select('body', tree);
    collapseJsonBlocks(body, undefined);
    assert.strictEqual(selectAll('[data-json-index]', body).length, 0);
    assert.deepStrictEqual(storedJson(body), FORM);
  });

  it('leaves blocks without valid JSON to the generic instrumentation', () => {
    const tree = fromHtml('<html><body><main><div><div class="form"><div><div><pre><code>not json</code></pre></div></div></div></div></main></body></html>');
    injectUEAttributes(select('body', tree), UE_CONFIG);
    const block = select('.form', tree);
    assert.strictEqual(block.properties.dataJsonBlock, undefined);
    assert.strictEqual(block.properties['data-aue-resource'], 'urn:ab:section-0/block-0');
  });

  describe('container items', () => {
    const NESTED = {
      items: [
        {
          id: 'address',
          name: 'address',
          fieldType: 'panel',
          label: { value: 'Address' },
          items: [
            {
              id: 'street', name: 'street', fieldType: 'text-input', label: { value: 'Street' },
            },
            {
              id: 'city', name: 'city', fieldType: 'text-input', label: { value: 'City' },
            },
          ],
        },
        {
          id: 'submit', fieldType: 'button', label: { value: 'Send' }, events: { click: 'submitForm()' },
        },
      ],
    };
    const container = (tree, index) => select(`[data-json-children="${index}"]`, tree);
    const ids = (items) => items.map((i) => i.id);

    it('expands child items into a container element after their parent', () => {
      const tree = render(NESTED);
      const panel = byResource(tree, 'urn:ab:section-0/block-0/item-0');
      assert.strictEqual(panel.properties.dataAueType, 'container');
      assert.strictEqual(panel.properties.dataAueBehavior, 'component');
      assert.strictEqual(panel.properties.dataAueFilter, 'form');
      assert.deepStrictEqual(pluginDetails(panel), { 'label.value': 'Address', fieldType: 'panel' });
      const city = byResource(tree, 'urn:ab:section-0/block-0/item-0/item-1');
      assert.strictEqual(city.properties.dataJsonIndex, '0.1');
      assert.strictEqual(container(tree, '0').children.filter((c) => c.type === 'element').length, 2);
      assert.deepStrictEqual(storedJson(store(tree)), NESTED);
    });

    it('patches container and child items', () => {
      const tree = render(NESTED);
      pluginPatch(tree, 'urn:ab:section-0/block-0/item-0', [{ op: 'replace', path: '/label.value', value: 'Home' }]);
      pluginPatch(tree, 'urn:ab:section-0/block-0/item-0/item-1', [{ op: 'replace', path: '/label.value', value: 'Town' }]);
      const [address] = storedJson(store(tree)).items;
      assert.strictEqual(address.label.value, 'Home');
      assert.deepStrictEqual(ids(address.items), ['street', 'city']);
      assert.strictEqual(address.items[1].label.value, 'Town');
    });

    it('adds items appended to a container item and before a child item', () => {
      const tree = render(NESTED);
      // add without position: appended into the container element
      byResource(tree, 'urn:ab:section-0/block-0/item-0').children.push(h('div', { className: ['text-input'] }));
      // add before the second child: placed next to it
      const kids = container(tree, '0').children;
      kids.splice(kids.indexOf(byResource(tree, 'urn:ab:section-0/block-0/item-0/item-1')), 0, h('div', { className: ['drop-down'] }));
      const [address] = storedJson(store(tree)).items;
      assert.deepStrictEqual(ids(address.items), ['street', 'drop-down', 'city', 'text-input']);
    });

    it('adds container items with an empty item list', () => {
      const tree = render(NESTED);
      select('.form', tree).children.push(h('div', { className: ['panel'] }));
      const added = storedJson(store(tree)).items.at(-1);
      assert.deepStrictEqual(added, {
        fieldType: 'panel', items: [], name: 'panel', id: 'panel',
      });
    });

    it('moves items into and out of container items', () => {
      const tree = render(NESTED);
      const block = select('.form', tree);
      const city = byResource(tree, 'urn:ab:section-0/block-0/item-0/item-1');
      const submit = byResource(tree, 'urn:ab:section-0/block-0/item-1');
      // city out of the panel, before submit; submit into the panel, before street
      const kids = container(tree, '0').children;
      kids.splice(kids.indexOf(city), 1);
      block.children.splice(block.children.indexOf(submit), 1, city);
      kids.unshift(submit);
      const { items } = storedJson(store(tree));
      assert.deepStrictEqual(ids(items), ['address', 'city']);
      assert.deepStrictEqual(ids(items[0].items), ['submit', 'street']);
      assert.deepStrictEqual(items[0].items[0].events, { click: 'submitForm()' });
    });

    it('copies container items with renamed child items', () => {
      const tree = render(NESTED);
      const block = select('.form', tree);
      const panel = byResource(tree, 'urn:ab:section-0/block-0/item-0');
      block.children.splice(block.children.indexOf(panel) + 1, 0, structuredClone(panel));
      const { items } = storedJson(store(tree));
      assert.deepStrictEqual(ids(items), ['address', 'address_1', 'submit']);
      assert.deepStrictEqual(ids(items[0].items), ['street', 'city']);
      assert.deepStrictEqual(ids(items[1].items), ['street_1', 'city_1']);
    });

    it('removes child items', () => {
      const tree = render(NESTED);
      const kids = container(tree, '0').children;
      kids.splice(kids.indexOf(byResource(tree, 'urn:ab:section-0/block-0/item-0/item-0')), 1);
      assert.deepStrictEqual(ids(storedJson(store(tree)).items[0].items), ['city']);
    });
  });

  describe('document properties', () => {
    const config = structuredClone(UE_CONFIG);
    config['component-model'].push({
      id: 'form-settings',
      fields: [
        { component: 'text', name: 'title', valueType: 'string' },
        { component: 'text', name: 'properties.fd:submit.actionName', valueType: 'string' },
        { component: 'richtext', name: 'thankYouMsg', valueType: 'string' },
      ],
    });
    config['component-json-mapping'][0].root = 'form-settings';
    const renderWith = (json) => {
      const tree = fromHtml(page(json));
      injectUEAttributes(select('body', tree), config);
      return fromHtml(toHtml(tree));
    };
    const storeWith = (tree) => {
      const body = select('body', tree);
      collapseJsonBlocks(body, config);
      removeUEAttributes(body);
      return body;
    };
    const prop = (tree, name) => select(`.json-prop-${name.replace(/[^A-Za-z0-9_-]/g, '_')} > div`, tree);
    // mirrors the DA plugin patching a block field mapped by selector
    const patchProp = (tree, name, value) => {
      prop(tree, name).children = value ? fromHtml(value, { fragment: true }).children : [];
    };

    it('expands the document properties as the model of the block', () => {
      const tree = renderWith(FORM);
      const block = select('.form', tree);
      assert.strictEqual(block.properties.dataAueModel, 'form-settings');
      assert.strictEqual(block.properties.dataAueType, 'container');
      assert.strictEqual(toString(prop(tree, 'title')), 'Contact');
      assert.strictEqual(toString(prop(tree, 'properties.fd:submit.actionName')), '');
      assert.deepStrictEqual(storedJson(storeWith(tree)), FORM);
    });

    it('applies patched document properties and keeps the items', () => {
      const tree = renderWith(FORM);
      patchProp(tree, 'title', 'Contact us');
      patchProp(tree, 'properties.fd:submit.actionName', 'spreadsheet');
      patchProp(tree, 'thankYouMsg', '<p>Thanks!</p>');
      const json = storedJson(storeWith(tree));
      assert.strictEqual(json.title, 'Contact us');
      assert.deepStrictEqual(json.properties, { 'fd:submit': { actionName: 'spreadsheet' } });
      assert.strictEqual(json.thankYouMsg, '<p>Thanks!</p>');
      assert.deepStrictEqual(json.items, FORM.items);
    });

    it('takes properties the DA plugin wrote to new elements and never stores them as items', () => {
      const tree = renderWith(FORM);
      const block = select('.form', tree);
      block.children.push(h('div', { className: ['json-prop-title'] }, [h('div', 'Written')]));
      const json = storedJson(storeWith(tree));
      assert.strictEqual(json.title, 'Written');
      assert.deepStrictEqual(json.items, FORM.items);
    });

    it('removes cleared document properties', () => {
      const tree = renderWith(FORM);
      patchProp(tree, 'title', '');
      assert.strictEqual(storedJson(storeWith(tree)).title, undefined);
    });
  });
});
