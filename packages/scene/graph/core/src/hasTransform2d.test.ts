import type { GraphNode, HasTransform2D, HasTransform2DRuntime } from '@flighthq/types';

import { createGraphNode, createGraphNodeRuntime } from './graphNode';
import { initHasTransform2D, initHasTransform2DRuntime } from './hasTransform2d';

describe('initHasTransform2D', () => {
  let node: HasTransform2D<typeof TestGraph>;

  beforeEach(() => {
    node = createGraphNode(TestGraph, NodeTestKind) as GraphNode<typeof TestGraph> & HasTransform2D<typeof TestGraph>;
  });

  it('initializes default values', () => {
    initHasTransform2D(node);

    expect(node.rotation).toStrictEqual(0);
    expect(node.scaleX).toStrictEqual(1);
    expect(node.scaleY).toStrictEqual(1);
    expect(node.x).toStrictEqual(0);
    expect(node.y).toStrictEqual(0);
  });

  it('allows pre-defined values', () => {
    const base = {
      scaleX: 2,
      scaleY: 3,
      rotation: 45,
      x: 100,
      y: 200,
    };
    initHasTransform2D(node, base);
    expect(base.scaleX).toStrictEqual(base.scaleX);
    expect(base.scaleY).toStrictEqual(base.scaleY);
    expect(base.rotation).toStrictEqual(base.rotation);
    expect(base.x).toStrictEqual(base.x);
    expect(base.y).toStrictEqual(base.y);
  });
});

describe('initHasTransform2DRuntime', () => {
  let runtime: HasTransform2DRuntime<typeof TestGraph>;

  beforeEach(() => {
    runtime = createGraphNodeRuntime() as HasTransform2DRuntime<typeof TestGraph>;
  });

  it('initializes default values', () => {
    initHasTransform2DRuntime(runtime);

    expect(runtime.localTransform2D).toBeNull();
    expect(runtime.rotationAngle).toStrictEqual(0);
    expect(runtime.rotationCosine).toStrictEqual(1);
    expect(runtime.rotationSine).toStrictEqual(0);
    expect(runtime.worldTransform2D).toBeNull();

    // inherited graph runtime fields
    expect(runtime.appearanceID).toStrictEqual(0);
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');

const NodeTestKind: unique symbol = Symbol('NodeTest');
