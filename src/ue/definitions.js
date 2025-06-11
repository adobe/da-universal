/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { fromHtml } from 'hast-util-from-html';
import { select, selectAll } from 'hast-util-select';
import { heading } from 'hast-util-heading';
import { toString } from 'hast-util-to-string';
import { isElement } from 'hast-util-is-element';
import { toHtml } from 'hast-util-to-html';
import { getFirstSheet } from '../utils/sheet.js';
import { getBlockNameAndClasses } from '../utils/hast.js';
import { toClassName } from '../utils/strings.js';
import { AEM_ORIGINS, DEFAULT_COMPONENT_DEFINITIONS, DEFAULT_COMPONENT_FILTERS, DEFAULT_COMPONENT_MODELS } from '../utils/constants.js';

// URL for the DA block collection
// const BLOCK_LIBRARY_URL =
//   'https://content.da.live/aemsites/vitamix/docs/library/blocks.json';
//
// const BLOCK_LIBRARY_URL = 'https://content.da.live/aemsites/da-block-collection/docs/library/blocks.json';
const BLOCK_LIBRARY_URL = 'https://content.da.live/mhaack/special-project/docs/library/blocks.json';

async function getBlocks(env, daCtx, sources) {
  try {
    const sourcesData = await Promise.all(
      sources.map(async (url) => {
        try {
          const resp = await fetch(url, {
            headers: {
              Authorization: daCtx.authToken,
            },
          });
          if (!resp.ok) throw new Error('Something went wrong.');
          return resp.json();
        } catch {
          return null;
        }
      }),
    );

    const blockList = [];
    sourcesData.forEach((blockData) => {
      if (!blockData) return;
      const data = getFirstSheet(blockData);
      if (!data) return;
      data.forEach((block) => {
        if (block.name && block.path) blockList.push(block);
      });
    });

    return blockList;
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return [];
  }
}

/**
 * Extracts key-value pairs from a block element.
 * Each pair is expected to be in a div structure where the first child is the key
 * and the second child is the value.
 * 
 * @param {Element} element - The block element containing key-value pairs
 * @returns {Array<{key: string, value: string}>} Array of key-value objects
 */
function getKeyValuesFromBlock(element) {
  const keyValues = [];
  const keyValuePairs = selectAll(':scope > div', element);
  keyValuePairs.forEach((pair) => {
    const key = toClassName(toString(pair.children[0]));
    const value = toString(pair.children[1]);
    keyValues.push({ key, value });
  });
  return keyValues;
}

async function getBlockVariants(env, daCtx, path) {
  const { origin } = new URL(path);
  const isAemHosted = AEM_ORIGINS.some((aemOrigin) => origin.endsWith(aemOrigin));

  const postfix = isAemHosted ? '.plain.html' : '';
  const resp = await fetch(`${path}${postfix}`); // TODO fetch via da-content and with token from daCtx
  if (!resp.ok) return [];

  const html = await resp.text();
  if (!html) return [];

  const hast = fromHtml(html, { fragment: true });
  const elements = selectAll('main > div > div, main > div > h1, main > div > h2, main > div > h3, main > div > h4, main > div > h5, main > div > h6', hast);

  const variants = [];
  elements.forEach((element, index) => {
    if (isElement(element, 'div')) {
      const blockConfig = getBlockNameAndClasses(element);
      if (blockConfig.name !== 'library-metadata') {
        const block = {
          model: blockConfig.name,
          classes: blockConfig.classes.filter((cls) => cls !== blockConfig.name),
          name: blockConfig.name,
          hast: element,
        };

        if (elements[index - 1]
          && heading(elements[index - 1])
          && elements[index - 1].children.length > 0) {
          block.name = toString(elements[index - 1]);
        }

        if (elements[index + 1] && isElement(elements[index + 1], 'div')) {
          const libraryBlockConfig = getBlockNameAndClasses(elements[index + 1]);
          if (libraryBlockConfig.name === 'library-metadata') {
            const libraryMetadata = elements[index + 1];
            const keyValues = getKeyValuesFromBlock(libraryMetadata);
            keyValues.forEach((keyValue) => {
              block[keyValue.key] = keyValue.value;
            });
          }
        }

        block.id = toClassName(block.name);
        variants.push(block);
      }
    }
  });
  return variants;
}

export async function fetchBlockLibrary(env, daCtx) {
  const blockList = await getBlocks(env, daCtx, [BLOCK_LIBRARY_URL]);

  const blocks = await Promise.all(
    (blockList || []).map(async (block) => {
      try {
        const blockVariants = await getBlockVariants(env, daCtx, block.path);
        if (blockVariants.length === 0) return { error: 'no blocks found' };
        return {
          name: block.name,
          path: block.path,
          group: block.group || 'blocks',
          items: block.items || null,
          variants: blockVariants,
        };
      } catch (e) {
        console.error('Error fetching block details:', e);
      }
    }),
  );

  // Filter out blocks with errors and flatten the array
  return blocks.filter((block) => !block.error).flat();
}

export function getComponentDefinitions(blocks) {
  const definitions = structuredClone(DEFAULT_COMPONENT_DEFINITIONS);
  const defaultBlocksDefinition = definitions.groups.find((definition) => definition.id === 'blocks');

  blocks
    .filter((block) => !block.name.toLowerCase().includes('metadata'))
    .forEach((block) => {
      let blockGroup = defaultBlocksDefinition;
      if (block.group !== 'blocks') {
        blockGroup = {
          title: block.name,
          id: toClassName(block.group),
          components: [],
        };
        definitions.groups.push(blockGroup);
      }

      const blockId = toClassName(block.name);

      let uniqueBlockVariants = block.variants.reduce((acc, variant) => {
        const isDuplicate = acc.some(
          (v) => v.id === variant.id && v.name === variant.name,
        );
        if (!isDuplicate) {
          acc.push(variant);
        }
        return acc;
      }, []);

      // if there are multiple variants, we need to add the core block definition and
      // the variants with individual sample content and unique id
      // only the "core" block definition get the model from the block name
      // otherise add the variants with the model from the block name
      if (uniqueBlockVariants.length > 1) {
        const baseBlockVariant = {
          name: block.name,
          id: blockId,
          model: toClassName(block.name),
        };
        uniqueBlockVariants = [baseBlockVariant, ...uniqueBlockVariants];
      }

      // map block variants to component definitions
      uniqueBlockVariants.forEach((variant, index) => {
        const blockVariant = {
          title: variant.name,
          id: index === 0 ? variant.id : `${variant.id}-${index}`,
          model: variant.model || null,
        };
        if (variant.hast) {
          blockVariant.plugins = {
            da: {
              unsafeHTML: toHtml(variant.hast),
            },
          };
        }
        blockGroup.components.push(blockVariant);

        // for container blocks, get the first and add the item block with the sample content
        if (block.items && index === 0) {
          const item = {
            title: block.items,
            id: `${blockId}-item`,
          };

          const firstVariant = uniqueBlockVariants.length > 1
            ? uniqueBlockVariants[1]
            : uniqueBlockVariants[0];
          if (firstVariant.hast) {
            const itemHast = select('div > div', firstVariant.hast);
            item.plugins = {
              da: {
                unsafeHTML: toHtml(itemHast),
              },
            };
          }
          blockGroup.components.push(item);
        }
      });
    });

  return definitions;
}

export function getComponentModels(blocks) {
  const models = structuredClone(DEFAULT_COMPONENT_MODELS);

  blocks.forEach((block) => {
    // for each block which has different classes we need to add a model
    const variantClasses = block.variants
      .filter((variant) => variant.classes)
      .flatMap((variant) => variant.classes);
    if (variantClasses.length > 0) {
      const field = {
        component: 'multiselect',
        name: 'classes',
        label: 'Styles',
        options: variantClasses.map((cls) => ({
          name: cls,
          value: cls,
        })),
      };

      const model = {
        id: toClassName(block.name),
        fields: [field],
      };
      models.push(model);
    }
  });

  return models;
}

export function getComponentFilters(blocks) {
  const filters = structuredClone(DEFAULT_COMPONENT_FILTERS);
  const sectionFilter = filters.find((filter) => filter.id === 'section');
  if (sectionFilter) {
    sectionFilter.components.push(
      ...blocks.filter((block) => !block.name.includes('metadata'))
        .flatMap((block) => block.variants)
        .map((variant) => variant.id),
    );
  }

  return filters;
}
