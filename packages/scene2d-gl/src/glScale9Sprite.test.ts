import { createBitmap } from '@flighthq/bitmap/contract';
import { createRectangle } from '@flighthq/geometry/contract';
import {
  getGlRenderStateRuntime,
  registerGlBitmapTextureResolver,
  registerGlMaterialRenderer,
} from '@flighthq/render-gl/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import { createScale9Sprite } from '@flighthq/scene2d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type {
  GlColorAdjustmentMaterialFeature,
  GlMaterialRenderer,
  GlRenderState,
  Material,
  RenderProxy2D,
  Scale9Sprite,
} from '@flighthq/types/contract';
import { BatchFormat, RegistryEntryState, Scale9SpriteKind } from '@flighthq/types/contract';

import { defaultGlScale9SpriteRenderer, drawGlScale9Sprite } from './glScale9Sprite';
import { registerGlStandardMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

const INSTANCE_FLOATS = 13;

function createTestScale9Sprite(width = 40, height = 30): Scale9Sprite {
  const texture = createTexture({ dimension: '2d', source: createBitmap(width, height) });
  return createScale9Sprite(createRectangle(10, 5, 15, 10), { data: { texture } });
}

function prepareScale9Sprite(state: GlRenderState, source: Scale9Sprite): RenderProxy2D {
  registerRenderer(state, Scale9SpriteKind, defaultGlScale9SpriteRenderer);
  prepareScene2DRender(state, source);
  return getOrCreateRenderProxy2D(state, source);
}

describe('defaultGlScale9SpriteRenderer', () => {
  it('declares the quad format, identity hooks, and dedicated submit function', () => {
    expect(defaultGlScale9SpriteRenderer.format).toBe(BatchFormat.Quad);
    expect(typeof defaultGlScale9SpriteRenderer.createData).toBe('function');
    expect(typeof defaultGlScale9SpriteRenderer.isDirty).toBe('function');
    expect(defaultGlScale9SpriteRenderer.submit).toBe(drawGlScale9Sprite);
  });
});

describe('drawGlScale9Sprite', () => {
  it('emits all nine stretched quads with matching texture segments', () => {
    const { state } = createGlState();
    registerGlBitmapTextureResolver(state);
    registerGlStandardMaterial(state);
    const source = createTestScale9Sprite();
    source.x = 7;
    source.y = 11;
    source.scaleX = 2;
    source.scaleY = 3;

    drawGlScale9Sprite(state, prepareScale9Sprite(state, source));

    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.quadBatchWriterCount).toBe(9);
    const expectedSegments = [
      [7, 11, 10, 5, 0, 0, 0.25, 1 / 6],
      [17, 11, 55, 5, 0.25, 0, 0.625, 1 / 6],
      [72, 11, 15, 5, 0.625, 0, 1, 1 / 6],
      [7, 16, 10, 70, 0, 1 / 6, 0.25, 0.5],
      [17, 16, 55, 70, 0.25, 1 / 6, 0.625, 0.5],
      [72, 16, 15, 70, 0.625, 1 / 6, 1, 0.5],
      [7, 86, 10, 15, 0, 0.5, 0.25, 1],
      [17, 86, 55, 15, 0.25, 0.5, 0.625, 1],
      [72, 86, 15, 15, 0.625, 0.5, 1, 1],
    ].map((segment) => segment.map(Math.fround));
    const actualSegments = Array.from({ length: 9 }, (_, index) => {
      const base = index * INSTANCE_FLOATS;
      expect(Array.from(runtime.quadBatchWriterInstanceData.slice(base, base + 4))).toEqual([1, 0, 0, 1]);
      expect(runtime.quadBatchWriterInstanceData[base + 12]).toBe(1);
      return Array.from(runtime.quadBatchWriterInstanceData.slice(base + 4, base + 12));
    });
    expect(actualSegments).toEqual(expectedSegments);
  });

  it('records material and color data from index zero after a texture-change flush', () => {
    const { gl, state } = createGlState();
    registerGlBitmapTextureResolver(state);
    const material = { kind: 'flight.test.Scale9Material' } as Material;
    const packInstance = vi.fn();
    const materialRenderer: GlMaterialRenderer = {
      bind: vi.fn(),
      instanceFloatCount: 1,
      packInstance,
    };
    registerGlMaterialRenderer(state, material.kind, materialRenderer);
    const record = vi.fn();
    const colorAdjustmentFeature: GlColorAdjustmentMaterialFeature = {
      drawShapeMeshes: vi.fn(),
      flush: vi.fn(() => false),
      fragmentShaderChunk: '',
      matrixFragmentShaderChunk: '',
      record,
    };
    const runtime = getGlRenderStateRuntime(state);
    runtime.registries.colorAdjustmentFeature = {
      entry: { state: RegistryEntryState.Bound, value: colorAdjustmentFeature },
      onMiss: 'Disabled',
      registry: 'GlColorAdjustmentFeature',
      shape: 'slot',
    };

    const first = createTestScale9Sprite();
    first.material = material;
    const firstProxy = prepareScale9Sprite(state, first);
    const second = createTestScale9Sprite();
    second.material = material;
    const secondProxy = prepareScale9Sprite(state, second);

    drawGlScale9Sprite(state, firstProxy);
    expect(runtime.quadBatchWriterCount).toBe(9);
    packInstance.mockClear();
    record.mockClear();

    drawGlScale9Sprite(state, secondProxy);

    expect(gl.drawElementsInstanced).toHaveBeenCalledOnce();
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 9);
    expect(runtime.quadBatchWriterCount).toBe(9);
    expect(packInstance.mock.calls.map((call) => call[3])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(record.mock.calls.map((call) => call[2])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
