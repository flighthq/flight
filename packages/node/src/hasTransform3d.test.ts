import { createQuaternion, createVector3 } from '@flighthq/geometry/contract';
import type { HasTransform3D, HasTransform3DRuntime } from '@flighthq/types/contract';
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
  it('defaults to identity position/rotation/scale', () => {
    const node = {} as HasTransform3D;
    initTransform3DTrait(node);
    expect(node.position).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(node.rotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(node.scale).toMatchObject({ x: 1, y: 1, z: 1 });
  });

  it('accepts existing position/rotation/scale', () => {
    const node = {} as HasTransform3D;
    const position = createVector3(7, 0, 0);
    const rotation = createQuaternion();
    const scale = createVector3(2, 2, 2);
    initTransform3DTrait(node, { position, rotation, scale });
    expect(node.position).toMatchObject({ x: 7, y: 0, z: 0 });
    expect(node.rotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(node.scale).toMatchObject({ x: 2, y: 2, z: 2 });
  });

  it('copies out of the options object so two nodes never share storage', () => {
    const options = { position: createVector3(1, 2, 3), rotation: createQuaternion(), scale: createVector3(2, 2, 2) };
    const first = {} as HasTransform3D;
    const second = {} as HasTransform3D;
    initTransform3DTrait(first, options);
    initTransform3DTrait(second, options);

    first.position.x = 999;
    first.scale.y = 999;
    first.rotation.w = 0;

    expect(second.position.x).toBe(1);
    expect(second.scale.y).toBe(2);
    expect(second.rotation.w).toBe(1);
    expect(options.position.x).toBe(1);
    expect(options.scale.y).toBe(2);
    expect(options.rotation.w).toBe(1);
  });
});
