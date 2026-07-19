import { createQuaternion, createVector3 } from '@flighthq/geometry';
import type { HasTransform3D, HasTransform3DRuntime } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';

describe('initTransform3DRuntimeTrait', () => {
  it('nulls the matrix caches and clears the detached flag', () => {
    const runtime = {} as HasTransform3DRuntime;
    initTransform3DRuntimeTrait(runtime);
    expect(runtime.localMatrix4).toBeNull();
    expect(runtime.worldMatrix4).toBeNull();
    expect(runtime.localMatrix4Detached).toBe(false);
  });
});

describe('initTransform3DTrait', () => {
  it('defaults to identity translation/rotation/scale', () => {
    const node = {} as HasTransform3D;
    initTransform3DTrait(node);
    expect(node.translation).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(node.rotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(node.scale).toMatchObject({ x: 1, y: 1, z: 1 });
  });

  it('accepts existing translation/rotation/scale', () => {
    const node = {} as HasTransform3D;
    const translation = createVector3(7, 0, 0);
    const rotation = createQuaternion();
    const scale = createVector3(2, 2, 2);
    initTransform3DTrait(node, { rotation, scale, translation });
    expect(node.translation).toBe(translation);
    expect(node.rotation).toBe(rotation);
    expect(node.scale).toBe(scale);
  });
});
