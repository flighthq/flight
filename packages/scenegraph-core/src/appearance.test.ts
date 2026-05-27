import { getRuntime } from '@flighthq/entity';
import type { GraphNode, GraphNodeRuntime, HasAppearance } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { setAlpha, setBlendMode, setColorTransform, setShader, setVisible } from './appearance';
import { createGraphNode } from './graphNode';
import { initHasAppearance } from './hasAppearance';

function createTestNode(): TestNode {
  const node = createGraphNode(TestKind, TestKind) as TestNode;
  initHasAppearance(node);
  return node;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

describe('setAlpha', () => {
  it('sets alpha on the node', () => {
    setAlpha(node, 0.5);
    expect(node.alpha).toBe(0.5);
  });

  it('invalidates appearance', () => {
    const runtime = getRuntime(node) as GraphNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setAlpha(node, 0.5);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

describe('setBlendMode', () => {
  it('sets blendMode on the node', () => {
    setBlendMode(node, BlendMode.Add);
    expect(node.blendMode).toBe(BlendMode.Add);
  });

  it('accepts null', () => {
    setBlendMode(node, null);
    expect(node.blendMode).toBeNull();
  });

  it('invalidates appearance', () => {
    const runtime = getRuntime(node) as GraphNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setBlendMode(node, BlendMode.Add);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

describe('setColorTransform', () => {
  it('sets colorTransform on the node', () => {
    const ct = {} as any;  
    setColorTransform(node, ct);
    expect(node.colorTransform).toBe(ct);
  });

  it('accepts null', () => {
    setColorTransform(node, null);
    expect(node.colorTransform).toBeNull();
  });

  it('invalidates appearance', () => {
    const runtime = getRuntime(node) as GraphNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setColorTransform(node, null);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

describe('setShader', () => {
  it('sets shader on the node', () => {
    const shader = {} as any;  
    setShader(node, shader);
    expect(node.shader).toBe(shader);
  });

  it('accepts null', () => {
    setShader(node, null);
    expect(node.shader).toBeNull();
  });

  it('invalidates appearance', () => {
    const runtime = getRuntime(node) as GraphNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setShader(node, null);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

describe('setVisible', () => {
  it('sets visible on the node', () => {
    setVisible(node, false);
    expect(node.visible).toBe(false);
  });

  it('invalidates appearance', () => {
    const runtime = getRuntime(node) as GraphNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setVisible(node, false);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

type TestNode = GraphNode<typeof TestKind, HasAppearance> & HasAppearance;

const TestKind: unique symbol = Symbol('Test');
