import { format } from 'hast-util-format';
import { fromHtml } from 'hast-util-from-html';
import { select, selectAll } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';

export function prepareHtml(daCtx, aemCtx, bodyHtmlStr, headHtmlStr) {
  // get the HTML document tree
  const htmlDocTree = getHtmlDoc();

  // prepare the additional head HTML script and meta tags
  const headNode = select('head', htmlDocTree);
  injectAEMHtmlHeadEntries(daCtx, headNode, headHtmlStr);
  injectUEHtmlHeadEntries(daCtx, aemCtx, headNode);

  // parse and inject the body HTML
  const bodyNode = select('body', htmlDocTree);
  const bodyTree = fromHtml(bodyHtmlStr, { fragment: true });
  bodyNode.children = bodyTree.children;

  // output the final HTML document
  format(htmlDocTree);
  let htmlDocStr = toHtml(htmlDocTree, {
    allowDangerousHtml: true,
    upperDoctype: true
  });
  return htmlDocStr;
}

function getHtmlDoc() {
  const htmlDocStr = '<!DOCTYPE html><html><head></head><body></body></html>';
  return fromHtml(htmlDocStr);
}

function injectAEMHtmlHeadEntries(daCtx, headNode, headHtmlStr) {
  const { org, site } = daCtx;
  const aemHeadHtmlTree = fromHtml(headHtmlStr, { fragment: true });
  const headScriptsAndLinks = selectAll(
    'script[src], link[href]',
    aemHeadHtmlTree
  );
  headScriptsAndLinks.forEach((node) => {
    const attrName = node.tagName === 'script' ? 'src' : 'href';
    const url = node.properties[attrName];
    if (
      !url.startsWith('http') &&
      !url.startsWith(`/${org}/${site}`)
    ) {
      node.properties[attrName] = `/${org}/${site}${url}`;
    }
  });

  headNode.children.push(...aemHeadHtmlTree.children);
}

function injectUEHtmlHeadEntries(daCtx, aemCtx, headNode) {
  const { org, site, pathname, ext } = daCtx;
  const { ueUrl, ueService } = aemCtx;
  const { children } = headNode;

  children.push(
    createHeadNode('meta', {
      name: 'urn:adobe:aue:system:ab',
      content: `${ueUrl}/${org}${pathname}`,
    })
  );
  if (ueService) {
    children.push(
      createHeadNode('meta', {
        name: 'urn:adobe:aue:config:service',
        content: ueService,
      })
    );
  }
  children.push(
    createHeadNode('script', {
      src: 'https://universal-editor-service.adobe.io/cors.js',
      async: '',
    })
  );
  children.push(
    createHeadNode('script', {
      type: 'application/vnd.adobe.aue.component+json',
      src: `/${org}/${site}/component-definition.json`,
    })
  );
  children.push(
    createHeadNode('script', {
      type: 'application/vnd.adobe.aue.model+json',
      src: `/${org}/${site}/component-models.json`,
    })
  );
  children.push(
    createHeadNode('script', {
      type: 'application/vnd.adobe.aue.filter+json',
      src: `/${org}/${site}/component-filters.json`,
    })
  );
}

function createHeadNode(tagName, properties) {
  return {
    type: 'element',
    tagName,
    properties,
    children: [],
  };
}
