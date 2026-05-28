import { createGraphNode, getGraphNodeRuntime } from '@flighthq/scenegraph-core';
import type { GraphNode, GraphNodeRuntime, ImageCacheResult } from '@flighthq/types';
import { NullGraph } from '@flighthq/types';

import { clearImageCache, getImageCache } from './imageCache';

function makeObj(): GraphNode<symbol, object> {
  return createGraphNode(NullGraph, Symbol('TestNode'));
}

function makeResult(): ImageCacheResult {
  return { canvas: null, transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } };
}

describe('getImageCache', () => {
  it('returns null when slot is empty', () => {
    const obj = makeObj();
    expect(getImageCache(obj)).toBeNull();
  });

  it('returns the result when slot is set', () => {
    const obj = makeObj();
    const result = makeResult();
    (getGraphNodeRuntime(obj) as GraphNodeRuntime<symbol, object>).imageCache = result;
    expect(getImageCache(obj)).toBe(result);
  });
});

describe('clearImageCache', () => {
  it('sets the slot to null', () => {
    const obj = makeObj();
    const result = makeResult();
    (getGraphNodeRuntime(obj) as GraphNodeRuntime<symbol, object>).imageCache = result;
    clearImageCache(obj);
    expect(getImageCache(obj)).toBeNull();
  });

  it('is a no-op when slot is already null', () => {
    const obj = makeObj();
    expect(() => clearImageCache(obj)).not.toThrow();
  });
});
