import { registerRenderer } from './renderer';
import { createRenderNode, getOrCreateRenderNode, syncRenderNodeRenderer } from './renderNode';
import { createRenderState } from './renderState';

const DisplayObjectKind = Symbol('DisplayObject');

function makeSource() {
  return { kind: DisplayObjectKind } as any;
}

function makeRenderer() {
  return { createData: () => ({ tag: 'data' }), draw: vi.fn() };
}

describe('createRenderNode', () => {
  it('initializes default values', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    expect(node.source).toBe(source);
    expect(node.kind).toBe(source.kind);
    expect(node.resolver).toBeNull();
    expect(node.next).toBeNull();
    expect(node.alpha).toBe(1);
    expect(node.appearanceFrameID).toBe(-1);
    expect(node.lastAppearanceID).toBe(-1);
    expect(node.lastLocalTransformID).toBe(-1);
    expect(node.transformFrameID).toBe(-1);
    expect(node.renderer).toBeNull();
    expect(node.rendererData).toBeNull();
    expect(node.rendererDataSource).toBe(source);
    expect(node.visible).toBe(true);
    expect(node.shader).toBeNull();
  });

  it('picks up a registered renderer', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderNode(state, source);
    expect(node.renderer).toBe(renderer);
    expect(node.rendererData).toEqual({ tag: 'data' });
  });

  it('uses null renderer when kind has no registration', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    expect(node.renderer).toBeNull();
  });
});

describe('getOrCreateRenderNode', () => {
  it('creates a new node on first call', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = getOrCreateRenderNode(state, source, createRenderNode);
    expect(node).toBeDefined();
    expect(node.source).toBe(source);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const source = makeSource();
    const node1 = getOrCreateRenderNode(state, source, createRenderNode);
    const node2 = getOrCreateRenderNode(state, source, createRenderNode);
    expect(node1).toBe(node2);
  });

  it('syncs renderer when rendererMapID has changed', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = getOrCreateRenderNode(state, source, createRenderNode);
    expect(node.renderer).toBeNull();

    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    getOrCreateRenderNode(state, source, createRenderNode);

    expect(node.renderer).toBe(renderer);
  });
});

describe('syncRenderNodeRenderer', () => {
  it('sets renderer from the map matching the node kind', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderNode(state, source);
    node.renderer = null;
    syncRenderNodeRenderer(state, node);
    expect(node.renderer).toBe(renderer);
  });

  it('sets renderer to null when no registration matches', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    node.renderer = { createData: vi.fn(), draw: vi.fn() } as any;
    syncRenderNodeRenderer(state, node);
    expect(node.renderer).toBeNull();
  });

  it('updates rendererMapID to current state value', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    node.rendererMapID = -1;
    syncRenderNodeRenderer(state, node);
    expect(node.rendererMapID).toBe(state.rendererMapID);
  });

  it('updates rendererData when source changes', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderNode(state, source);
    const newSource = makeSource();
    node.source = newSource;
    syncRenderNodeRenderer(state, node);
    expect(node.rendererDataSource).toBe(newSource);
  });
});
