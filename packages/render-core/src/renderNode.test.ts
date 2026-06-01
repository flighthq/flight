import { createMatrix } from '@flighthq/geometry';
import { createColorTransform } from '@flighthq/materials';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import type { DisplayObject, DisplayObjectRenderNode, RenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { createRenderNode, getOrCreateRenderNode } from './renderNode';
import { createDisplayObjectRenderNode, getOrCreateDisplayObjectRenderNode } from './renderNode2d';
import { createRenderState } from './renderState';

describe('createDisplayObjectRenderNode', () => {
  let data: DisplayObjectRenderNode;
  let state: RenderState;
  let source: DisplayObject = {} as DisplayObject;

  beforeEach(() => {
    state = createRenderState();
    data = createDisplayObjectRenderNode(state, source);
  });

  it('initializes default values', () => {
    expect(data.alpha).toStrictEqual(1);
    expect(data.appearanceFrameID).toStrictEqual(-1);
    expect(data.blendMode).toStrictEqual(BlendMode.Normal);
    expect(data.colorTransform).toStrictEqual(createColorTransform());
    expect(data.isMaskFrameID).toStrictEqual(-1);
    expect(data.lastAppearanceID).toStrictEqual(-1);
    expect(data.lastLocalTransformID).toStrictEqual(-1);
    expect(data.maskDepth).toStrictEqual(0);
    expect(data.scrollRectDepth).toStrictEqual(0);
    expect(data.shader).toStrictEqual(null);
    expect(data.source).toStrictEqual(source);
    expect(data.transform2D).toStrictEqual(createMatrix());
    expect(data.transformFrameID).toStrictEqual(-1);
    expect(data.useColorTransform).toStrictEqual(false);
    expect(data.visible).toStrictEqual(true);
  });
});

describe('createRenderNode', () => {
  it('creates a render node with default values', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = createRenderNode(state, source);
    expect(node.alpha).toBe(1);
    expect(node.blendMode).toStrictEqual(BlendMode.Normal);
    expect(node.visible).toBe(true);
    expect(node.source).toBe(source);
    expect(node.renderer).toBeNull();
    expect(node.rendererData).toBeNull();
  });
});

describe('getOrCreateDisplayObjectRenderNode', () => {
  it('creates renderable data if not present already', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    expect(state.renderNodeMap.has(source)).toBe(false);
    getOrCreateDisplayObjectRenderNode(state, source);
    expect(state.renderNodeMap.has(source)).toBe(true);
  });
});

describe('getOrCreateRenderNode', () => {
  it('creates and caches a render node on first call', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = getOrCreateRenderNode(state, source, createDisplayObjectRenderNode);
    expect(state.renderNodeMap.has(source)).toBe(true);
    expect(node.source).toBe(source);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const first = getOrCreateRenderNode(state, source, createDisplayObjectRenderNode);
    const second = getOrCreateRenderNode(state, source, createDisplayObjectRenderNode);
    expect(first).toBe(second);
  });
});
