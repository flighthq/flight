import { createUnlitMaterial } from '@flighthq/materials/contract';
import { addNodeChild } from '@flighthq/node/contract';
import type { Node2D, Node2DData, ShapeCommandToken } from '@flighthq/types/contract';
import { BlendMode, DisplayObjectKind, HtmlViewKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createDisplayObject } from './displayObject';
import { createHtmlView } from './htmlView';
import { createScene2D } from './scene2d';
import { createScene2DKindUsage, getScene2DKindUsage, initializeScene2DKindUsage } from './sceneKindUsage';

// The walk detects a command stream structurally — any node whose `data` carries `commands` — rather
// than by node kind, so the tests record streams directly. That also keeps @flighthq/shape out of this
// package's dependencies, which it could not take anyway since shape depends on scene2d.
function shapeLikeNode(...commands: ShapeCommandToken[]): Node2D {
  const node = createDisplayObject();
  node.data = { commands } as unknown as Node2DData;
  return node;
}

function usageOf(build: (root: Node2D) => void) {
  const scene = createScene2D();
  build(scene.root);
  const usage = createScene2DKindUsage();
  getScene2DKindUsage(usage, scene);
  return usage;
}

describe('createScene2DKindUsage', () => {
  it('starts empty so a caller can reuse one record across scenes', () => {
    expect(createScene2DKindUsage()).toMatchObject({
      blendModes: [],
      materialKinds: [],
      nodeKinds: [],
      shapeCommandKeys: [],
    });
  });
});

describe('getScene2DKindUsage', () => {
  it('collects node kinds across the tree, deduped and sorted', () => {
    const usage = usageOf((root) => {
      addNodeChild(root, createHtmlView());
      addNodeChild(root, createHtmlView());
      addNodeChild(root, createDisplayObject());
    });
    expect(usage.nodeKinds).toEqual([DisplayObjectKind, HtmlViewKind]);
  });

  it('walks a nested child, not just the root generation', () => {
    const usage = usageOf((root) => {
      const group = createDisplayObject();
      addNodeChild(group, createHtmlView());
      addNodeChild(root, group);
    });
    expect(usage.nodeKinds).toContain(HtmlViewKind);
  });

  it('reads the command keys out of a recorded stream', () => {
    const usage = usageOf((root) => {
      addNodeChild(root, shapeLikeNode('beginFill', 2, 0xff0000ff, 1, 'drawRectangle', 4, 0, 0, 10, 10, 'endFill', 0));
    });
    expect(usage.shapeCommandKeys).toEqual(['beginFill', 'drawRectangle', 'endFill']);
  });

  it('dedupes a command key repeated within one stream and across nodes', () => {
    const usage = usageOf((root) => {
      addNodeChild(root, shapeLikeNode('drawRectangle', 4, 0, 0, 10, 10, 'drawRectangle', 4, 20, 0, 10, 10));
      addNodeChild(root, shapeLikeNode('drawRectangle', 4, 0, 0, 5, 5));
    });
    expect(usage.shapeCommandKeys).toEqual(['drawRectangle']);
  });

  it('advances by the declared argument count, so arguments are never read as command keys', () => {
    // The stream is [key, argCount, ...args]. Misreading the stride would report an argument value —
    // here the string 'round' — as if it were a command key. That is the failure this pins.
    const usage = usageOf((root) => {
      addNodeChild(root, shapeLikeNode('lineStyle', 3, 2, 0x000000ff, 'round', 'moveTo', 2, 0, 0));
    });
    expect(usage.shapeCommandKeys).toEqual(['lineStyle', 'moveTo']);
  });

  it('ignores a node whose data carries no command stream', () => {
    expect(usageOf((root) => addNodeChild(root, createHtmlView())).shapeCommandKeys).toEqual([]);
  });

  it('reports a non-default blend mode and omits Normal, which needs no realization', () => {
    const usage = usageOf((root) => {
      const plain = createDisplayObject();
      const lit = createDisplayObject();
      lit.blendMode = BlendMode.Multiply;
      addNodeChild(root, plain);
      addNodeChild(root, lit);
    });
    expect(usage.blendModes).toEqual([BlendMode.Multiply]);
  });

  it('reports the kind of a material a node carries', () => {
    const usage = usageOf((root) => {
      const node = createDisplayObject();
      node.material = createUnlitMaterial();
      addNodeChild(root, node);
    });
    expect(usage.materialKinds).toEqual(['UnlitMaterial']);
  });

  it('leaves material kinds empty when no node carries one', () => {
    expect(usageOf((root) => addNodeChild(root, createDisplayObject())).materialKinds).toEqual([]);
  });

  it('clears every list, so a reused record does not accumulate', () => {
    const scene = createScene2D();
    addNodeChild(scene.root, createHtmlView());
    const usage = createScene2DKindUsage();
    getScene2DKindUsage(usage, scene);
    getScene2DKindUsage(usage, scene);
    expect(usage.nodeKinds).toEqual([DisplayObjectKind, HtmlViewKind]);
  });
});
describe('initializeScene2DKindUsage', () => {
  it('is the construction initializer of createScene2DKindUsage', () => {
    expect(typeof initializeScene2DKindUsage).toBe('function');
  });
});
