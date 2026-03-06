import { matrix3x2 } from '@flighthq/geometry';
import { colorTransform } from '@flighthq/materials';
import { createDisplayObject } from '@flighthq/scene-graph-stage';
import type { Renderable, RenderNode, RenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { createRenderNode, getRenderNode } from './renderNode';
import { createRenderState } from './renderState';

describe('createRenderNode', () => {
  let data: RenderNode;
  let state: RenderState;
  let source: Renderable = {} as Renderable;

  beforeEach(() => {
    state = createRenderState();
    data = createRenderNode(state, source);
  });

  it('initializes default values', () => {
    expect(data.alpha).toStrictEqual(1);
    expect(data.appearanceFrameID).toStrictEqual(-1);
    expect(data.blendMode).toStrictEqual(BlendMode.Normal);
    expect(data.cacheBitmap).toBeNull();
    expect(data.cacheAsBitmap).toStrictEqual(false);
    expect(data.colorTransform).toStrictEqual(colorTransform.create());
    expect(data.isMaskFrameID).toStrictEqual(-1);
    expect(data.lastAppearanceID).toStrictEqual(-1);
    expect(data.lastLocalTransformID).toStrictEqual(-1);
    expect(data.maskDepth).toStrictEqual(0);
    expect(data.scrollRectDepth).toStrictEqual(0);
    expect(data.shader).toStrictEqual(null);
    expect(data.source).toStrictEqual(source);
    expect(data.transform).toStrictEqual(matrix3x2.create());
    expect(data.transformFrameID).toStrictEqual(-1);
    expect(data.useColorTransform).toStrictEqual(false);
    expect(data.visible).toStrictEqual(true);
  });
});

describe('getRenderNode', () => {
  it('creates renderable data if not present already', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    expect(state.renderNodeMap.has(source)).toBe(false);
    getRenderNode(state, source);
    expect(state.renderNodeMap.has(source)).toBe(true);
  });
});
