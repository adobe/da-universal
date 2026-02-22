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

/* eslint-env mocha */

import assert from 'assert';
import { describe, it } from 'mocha';
import { h } from 'hastscript';
import { makeImagesRelative, restoreAbsoluteImages } from '../../src/ue/rewrite-images.js';

describe('rewrite-images', () => {
  const daCtx = { org: 'myorg', site: 'mysite' };

  describe('img src rewriting', () => {
    it('rewrites img src with content.da.live prefix to a relative path', () => {
      const bodyTree = h('body', {}, [
        h('main', {}, [
          h('img', { src: 'https://content.da.live/myorg/mysite/media/image.png' }),
        ]),
      ]);

      makeImagesRelative(bodyTree, daCtx);

      const img = bodyTree.children[0].children[0];
      assert.strictEqual(img.properties.src, '/media/image.png');
    });

    it('rewrites img src with stage-content.da.live prefix to a relative path', () => {
      const bodyTree = h('body', {}, [
        h('main', {}, [
          h('img', { src: 'https://stage-content.da.live/myorg/mysite/media/photo.jpg' }),
        ]),
      ]);

      makeImagesRelative(bodyTree, daCtx);

      const img = bodyTree.children[0].children[0];
      assert.strictEqual(img.properties.src, '/media/photo.jpg');
    });

    it('returns "/" when the URL matches the prefix exactly with no trailing path', () => {
      const bodyTree = h('body', {}, [
        h('img', { src: 'https://content.da.live/myorg/mysite' }),
      ]);

      makeImagesRelative(bodyTree, daCtx);

      const img = bodyTree.children[0];
      assert.strictEqual(img.properties.src, '/');
    });

    it('does not rewrite img src with an unrelated host', () => {
      const bodyTree = h('body', {}, [
        h('img', { src: 'https://cdn.example.com/images/photo.jpg' }),
      ]);

      makeImagesRelative(bodyTree, daCtx);

      const img = bodyTree.children[0];
      assert.strictEqual(img.properties.src, 'https://cdn.example.com/images/photo.jpg');
    });

    it('does not rewrite img src that partially matches a content host', () => {
      const bodyTree = h('body', {}, [
        h('img', { src: 'https://content.da.live/otherorg/othersite/media/image.png' }),
      ]);

      makeImagesRelative(bodyTree, daCtx);

      const img = bodyTree.children[0];
      assert.strictEqual(img.properties.src, 'https://content.da.live/otherorg/othersite/media/image.png');
    });
  });

  describe('source srcSet rewriting', () => {
    it('rewrites source srcSet inside a picture element', () => {
      const bodyTree = h('body', {}, [
        h('picture', {}, [
          h('source', { srcSet: 'https://content.da.live/myorg/mysite/media/hero.webp' }),
          h('img', { src: 'https://content.da.live/myorg/mysite/media/hero.png' }),
        ]),
      ]);

      makeImagesRelative(bodyTree, daCtx);

      const picture = bodyTree.children[0];
      const source = picture.children[0];
      const img = picture.children[1];
      assert.strictEqual(source.properties.srcSet, '/media/hero.webp');
      assert.strictEqual(img.properties.src, '/media/hero.png');
    });

    it('rewrites source srcSet with stage-content.da.live prefix', () => {
      const bodyTree = h('body', {}, [
        h('picture', {}, [
          h('source', { srcSet: 'https://stage-content.da.live/myorg/mysite/media/hero.webp' }),
        ]),
      ]);

      makeImagesRelative(bodyTree, daCtx);

      const source = bodyTree.children[0].children[0];
      assert.strictEqual(source.properties.srcSet, '/media/hero.webp');
    });

    it('does not rewrite source srcSet with an unrelated host', () => {
      const bodyTree = h('body', {}, [
        h('picture', {}, [
          h('source', { srcSet: 'https://cdn.example.com/images/hero.webp' }),
        ]),
      ]);

      makeImagesRelative(bodyTree, daCtx);

      const source = bodyTree.children[0].children[0];
      assert.strictEqual(source.properties.srcSet, 'https://cdn.example.com/images/hero.webp');
    });
  });

  describe('restoreAbsoluteImages', () => {
    describe('img src restoration', () => {
      it('restores relative img src to absolute content.da.live URL', () => {
        const bodyTree = h('body', {}, [
          h('main', {}, [
            h('img', { src: '/media/image.png' }),
          ]),
        ]);

        restoreAbsoluteImages(bodyTree, daCtx);

        const img = bodyTree.children[0].children[0];
        assert.strictEqual(img.properties.src, 'https://content.da.live/myorg/mysite/media/image.png');
      });

      it('restores relative img src starting with / to absolute URL', () => {
        const bodyTree = h('body', {}, [
          h('img', { src: '/images/photo.jpg' }),
        ]);

        restoreAbsoluteImages(bodyTree, daCtx);

        const img = bodyTree.children[0];
        assert.strictEqual(img.properties.src, 'https://content.da.live/myorg/mysite/images/photo.jpg');
      });

      it('does not modify img src that is already an absolute HTTP URL', () => {
        const bodyTree = h('body', {}, [
          h('img', { src: 'https://cdn.example.com/images/photo.jpg' }),
        ]);

        restoreAbsoluteImages(bodyTree, daCtx);

        const img = bodyTree.children[0];
        assert.strictEqual(img.properties.src, 'https://cdn.example.com/images/photo.jpg');
      });

      it('does not modify img src that is a protocol-relative URL', () => {
        const bodyTree = h('body', {}, [
          h('img', { src: '//cdn.example.com/images/photo.jpg' }),
        ]);

        restoreAbsoluteImages(bodyTree, daCtx);

        const img = bodyTree.children[0];
        assert.strictEqual(img.properties.src, '//cdn.example.com/images/photo.jpg');
      });

      it('restores img src that is just "/" to absolute URL', () => {
        const bodyTree = h('body', {}, [
          h('img', { src: '/' }),
        ]);

        restoreAbsoluteImages(bodyTree, daCtx);

        const img = bodyTree.children[0];
        assert.strictEqual(img.properties.src, 'https://content.da.live/myorg/mysite/');
      });
    });

    describe('source srcSet restoration', () => {
      it('restores relative source srcSet to absolute content.da.live URL', () => {
        const bodyTree = h('body', {}, [
          h('picture', {}, [
            h('source', { srcSet: '/media/hero.webp' }),
            h('img', { src: '/media/hero.png' }),
          ]),
        ]);

        restoreAbsoluteImages(bodyTree, daCtx);

        const picture = bodyTree.children[0];
        const source = picture.children[0];
        const img = picture.children[1];
        assert.strictEqual(source.properties.srcSet, 'https://content.da.live/myorg/mysite/media/hero.webp');
        assert.strictEqual(img.properties.src, 'https://content.da.live/myorg/mysite/media/hero.png');
      });

      it('does not modify source srcSet that is already an absolute URL', () => {
        const bodyTree = h('body', {}, [
          h('picture', {}, [
            h('source', { srcSet: 'https://cdn.example.com/images/hero.webp' }),
          ]),
        ]);

        restoreAbsoluteImages(bodyTree, daCtx);

        const source = bodyTree.children[0].children[0];
        assert.strictEqual(source.properties.srcSet, 'https://cdn.example.com/images/hero.webp');
      });
    });

    describe('round-trip conversion', () => {
      it('successfully converts from absolute to relative and back to absolute', () => {
        const originalUrl = 'https://content.da.live/myorg/mysite/media/image.png';
        const bodyTree = h('body', {}, [
          h('img', { src: originalUrl }),
        ]);

        makeImagesRelative(bodyTree, daCtx);
        const img = bodyTree.children[0];
        assert.strictEqual(img.properties.src, '/media/image.png');

        restoreAbsoluteImages(bodyTree, daCtx);
        assert.strictEqual(img.properties.src, originalUrl);
      });

      it('handles picture elements with both source and img in round-trip', () => {
        const bodyTree = h('body', {}, [
          h('picture', {}, [
            h('source', { srcSet: 'https://content.da.live/myorg/mysite/media/hero.webp' }),
            h('img', { src: 'https://content.da.live/myorg/mysite/media/hero.png' }),
          ]),
        ]);

        makeImagesRelative(bodyTree, daCtx);
        const picture = bodyTree.children[0];
        const source = picture.children[0];
        const img = picture.children[1];
        assert.strictEqual(source.properties.srcSet, '/media/hero.webp');
        assert.strictEqual(img.properties.src, '/media/hero.png');

        restoreAbsoluteImages(bodyTree, daCtx);
        assert.strictEqual(source.properties.srcSet, 'https://content.da.live/myorg/mysite/media/hero.webp');
        assert.strictEqual(img.properties.src, 'https://content.da.live/myorg/mysite/media/hero.png');
      });
    });
  });
});
