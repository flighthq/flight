import type { Texture, Vector3Like } from '@flighthq/types';
import { ModifierSlot, VertexDisplaceModifierKind, VertexDisplaceModifierSource } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createVertexDisplaceModifier } from './createVertexDisplaceModifier';

describe('createVertexDisplaceModifier', () => {
  it('sets the kind and the Vertex slot', () => {
    const modifier = createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.Sine, amplitude: 0.1 });
    expect(modifier.kind).toBe(VertexDisplaceModifierKind);
    expect(modifier.slot).toBe(ModifierSlot.Vertex);
  });

  it('defaults the Sine wave params and leaves axis/map absent', () => {
    const modifier = createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.Sine, amplitude: 0.2 });
    expect(modifier.frequency).toBe(1);
    expect(modifier.speed).toBe(1);
    expect(modifier.direction).toEqual({ x: 1, y: 0, z: 0 });
    expect(modifier.axis).toBeUndefined();
    expect(modifier.map).toBeUndefined();
  });

  it('keeps a fixed axis and a height map by reference when provided', () => {
    const axis: Vector3Like = { x: 0, y: 1, z: 0 };
    const map = {} as Texture;
    const modifier = createVertexDisplaceModifier({
      source: VertexDisplaceModifierSource.HeightMap,
      amplitude: 1,
      axis,
      map,
    });
    expect(modifier.source).toBe(VertexDisplaceModifierSource.HeightMap);
    expect(modifier.axis).toBe(axis);
    expect(modifier.map).toBe(map);
  });
});
