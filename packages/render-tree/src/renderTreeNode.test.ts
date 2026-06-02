import { createEntity } from '@flighthq/entity';
import { createMatrix } from '@flighthq/geometry';
import { createColorTransform } from '@flighthq/materials';
import { createRenderState, registerRenderer } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scene-display';
import type { DisplayObject, DisplayObjectRenderTreeNode, RenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { createRenderNode, getOrCreateRenderNode, syncRenderNodeRenderer } from './renderTreeNode';
import { createDisplayObjectRenderNode, getOrCreateDisplayObjectRenderNode } from './renderTreeNode2d';

describe('createDisplayObjectRenderNode', () => {
  let data: DisplayObjectRenderTreeNode;
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
    expect(data.presentationTransform2D).toStrictEqual(null);
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
    expect(node.rendererDataSource).toBe(source);
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

describe('syncRenderNodeRenderer', () => {
  it('updates renderer and renderer data for the node kind', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = createRenderNode(state, source);
    const data = createEntity();
    const renderer = { createData: vi.fn(() => data), draw: vi.fn() };
    registerRenderer(state, source.kind, renderer);
    syncRenderNodeRenderer(state, node);
    expect(node.renderer).toBe(renderer);
    expect(node.rendererData).toBe(data);
    expect(node.rendererDataSource).toBe(source);
    expect(renderer.createData).toHaveBeenCalledWith(state, source);
  });

  it('updates renderer data when the presentation source changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = createRenderNode(state, source);
    const data = createEntity();
    const presentationSource = createEntity({ kind: source.kind });
    const renderer = { createData: vi.fn(() => data), draw: vi.fn() };
    registerRenderer(state, source.kind, renderer);
    node.presentationSource = presentationSource;
    syncRenderNodeRenderer(state, node);
    expect(node.rendererData).toBe(data);
    expect(node.rendererDataSource).toBe(presentationSource);
    expect(renderer.createData).toHaveBeenCalledWith(state, presentationSource);
  });
});
