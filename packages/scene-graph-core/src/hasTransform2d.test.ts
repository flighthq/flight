import type { GraphNode, GraphNodeRuntime, HasTransform2D, HasTransform2DRuntime } from '@flighthq/types';

import { createGraphNode, createGraphNodeRuntime } from './graphNode';
import { initHasTransform2D, initHasTransform2DRuntime } from './hasTransform2d';

describe('initHasTransform2D', () => {
  let node: HasTransform2D;

  beforeEach(() => {
    node = createGraphNode(NodeTestKind, NodeTestKind) as GraphNode<typeof NodeTestKind, HasTransform2D> &
      HasTransform2D;
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
  let runtime: GraphNodeRuntime<typeof NodeTestKind, HasTransform2D> & HasTransform2DRuntime;

  beforeEach(() => {
    runtime = createGraphNodeRuntime() as GraphNodeRuntime<typeof NodeTestKind, HasTransform2D> & HasTransform2DRuntime;
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

const NodeTestKind: unique symbol = Symbol('NodeTest');
