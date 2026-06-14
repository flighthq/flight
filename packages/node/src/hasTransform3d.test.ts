import type { HasTransform3D, HasTransform3DRuntime, Matrix4 } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';

describe('initTransform3DRuntimeTrait', () => {
  it('sets worldMatrix to null', () => {
    const runtime = {} as HasTransform3DRuntime;
    initTransform3DRuntimeTrait(runtime);
    expect(runtime.worldMatrix).toBeNull();
  });
});

describe('initTransform3DTrait', () => {
  it('creates an identity localMatrix by default', () => {
    const node = {} as HasTransform3D;
    initTransform3DTrait(node);
    expect(node.localMatrix).toBeDefined();
    const m = node.localMatrix.m;
    expect(m[0]).toBe(1);
    expect(m[5]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m[15]).toBe(1);
    expect(m[12]).toBe(0);
    expect(m[13]).toBe(0);
    expect(m[14]).toBe(0);
  });

  it('accepts an existing localMatrix', () => {
    const node = {} as HasTransform3D;
    const existing = { m: new Float32Array(16) } as unknown as Matrix4;
    existing.m[12] = 7;
    initTransform3DTrait(node, { localMatrix: existing });
    expect(node.localMatrix).toBe(existing);
    expect(node.localMatrix.m[12]).toBe(7);
  });
});
