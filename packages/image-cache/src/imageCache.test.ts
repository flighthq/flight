import { createMatrix } from '@flighthq/geometry';
import { createSceneNode, getSceneNodeRuntime } from '@flighthq/scene';
import type { ImageCacheResult, SceneNode, SceneNodeRuntime } from '@flighthq/types';
import { NullScene } from '@flighthq/types';

import { clearImageCache, getImageCache, setImageCache } from './imageCache';

function makeObj(): SceneNode<symbol, object> {
  return createSceneNode(NullScene, Symbol('TestNode'));
}

function makeResult(): ImageCacheResult {
  return { source: null, transform: createMatrix() };
}

describe('clearImageCache', () => {
  it('removes the resolver', () => {
    const obj = makeObj();
    setImageCache(obj, makeResult());
    clearImageCache(obj);
    expect((getSceneNodeRuntime(obj) as SceneNodeRuntime<symbol, object>).resolver).toBeNull();
    expect(getImageCache(obj)).toBeNull();
  });

  it('is a no-op when slot is already null', () => {
    const obj = makeObj();
    expect(() => clearImageCache(obj)).not.toThrow();
  });
});

describe('getImageCache', () => {
  it('returns null when no resolver is set', () => {
    const obj = makeObj();
    expect(getImageCache(obj)).toBeNull();
  });

  it('returns the result when set via setImageCache', () => {
    const obj = makeObj();
    const result = makeResult();
    setImageCache(obj, result);
    expect(getImageCache(obj)).toBe(result);
  });
});

describe('setImageCache', () => {
  it('sets the result on the resolver', () => {
    const obj = makeObj();
    const result = makeResult();
    setImageCache(obj, result);
    expect(getImageCache(obj)).toBe(result);
  });

  it('replaces an existing result', () => {
    const obj = makeObj();
    const first = makeResult();
    const second = makeResult();
    setImageCache(obj, first);
    setImageCache(obj, second);
    expect(getImageCache(obj)).toBe(second);
  });

  it('reuses the same ImageCacheSceneNodeResolver across calls', () => {
    const obj = makeObj();
    setImageCache(obj, makeResult());
    const r1 = (getSceneNodeRuntime(obj) as SceneNodeRuntime<symbol, object>).resolver;
    setImageCache(obj, makeResult());
    const r2 = (getSceneNodeRuntime(obj) as SceneNodeRuntime<symbol, object>).resolver;
    expect(r1).toBe(r2);
  });
});
