import { getEntityRuntime } from '@flighthq/entity';
import type { HasAppearance, SceneNode, SceneNodeRuntime } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import {
  setAppearanceAlpha,
  setAppearanceBlendMode,
  setAppearanceColorTransform,
  setAppearanceShader,
  setAppearanceVisible,
} from './appearance';
import { initAppearanceTrait } from './hasAppearance';
import { createSceneNode } from './sceneNode';

function createTestNode(): TestNode {
  const node = createSceneNode(TestKind, TestKind) as TestNode;
  initAppearanceTrait(node);
  return node;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

describe('setAppearanceAlpha', () => {
  it('sets alpha on the node', () => {
    setAppearanceAlpha(node, 0.5);
    expect(node.alpha).toBe(0.5);
  });

  it('invalidates appearance', () => {
    const runtime = getEntityRuntime(node) as SceneNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setAppearanceAlpha(node, 0.5);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

describe('setAppearanceBlendMode', () => {
  it('sets blendMode on the node', () => {
    setAppearanceBlendMode(node, BlendMode.Add);
    expect(node.blendMode).toBe(BlendMode.Add);
  });

  it('accepts null', () => {
    setAppearanceBlendMode(node, null);
    expect(node.blendMode).toBeNull();
  });

  it('invalidates appearance', () => {
    const runtime = getEntityRuntime(node) as SceneNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setAppearanceBlendMode(node, BlendMode.Add);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

describe('setAppearanceColorTransform', () => {
  it('sets colorTransform on the node', () => {
    const ct = {} as any;
    setAppearanceColorTransform(node, ct);
    expect(node.colorTransform).toBe(ct);
  });

  it('accepts null', () => {
    setAppearanceColorTransform(node, null);
    expect(node.colorTransform).toBeNull();
  });

  it('invalidates appearance', () => {
    const runtime = getEntityRuntime(node) as SceneNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setAppearanceColorTransform(node, null);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

describe('setAppearanceShader', () => {
  it('sets shader on the node', () => {
    const shader = {} as any;
    setAppearanceShader(node, shader);
    expect(node.shader).toBe(shader);
  });

  it('accepts null', () => {
    setAppearanceShader(node, null);
    expect(node.shader).toBeNull();
  });

  it('invalidates appearance', () => {
    const runtime = getEntityRuntime(node) as SceneNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setAppearanceShader(node, null);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

describe('setAppearanceVisible', () => {
  it('sets visible on the node', () => {
    setAppearanceVisible(node, false);
    expect(node.visible).toBe(false);
  });

  it('invalidates appearance', () => {
    const runtime = getEntityRuntime(node) as SceneNodeRuntime<typeof TestKind, HasAppearance>;
    const idBefore = runtime.appearanceID;
    setAppearanceVisible(node, false);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});

type TestNode = SceneNode<typeof TestKind, HasAppearance> & HasAppearance;

const TestKind: unique symbol = Symbol('Test');
