import type { HasTransform2D, HasTransform2DRuntime, Node, NodeRuntime } from '@flighthq/types';

import { initTransformRuntimeTrait, initTransformTrait } from './hasTransform2d';
import { createNode, createNodeRuntime } from './node';

describe('initTransformRuntimeTrait', () => {
  let runtime: NodeRuntime<typeof NodeTestKind, HasTransform2D> & HasTransform2DRuntime;

  beforeEach(() => {
    runtime = createNodeRuntime() as NodeRuntime<typeof NodeTestKind, HasTransform2D> & HasTransform2DRuntime;
  });

  it('initializes default values', () => {
    initTransformRuntimeTrait(runtime);

    expect(runtime.localTransform2D).toBeNull();
    expect(runtime.rotationAngle).toStrictEqual(0);
    expect(runtime.rotationCosine).toStrictEqual(1);
    expect(runtime.rotationSine).toStrictEqual(0);
    expect(runtime.worldTransform2D).toBeNull();

    // inherited graph runtime fields
    expect(runtime.appearanceID).toStrictEqual(0);
  });
});

describe('initTransformTrait', () => {
  let node: HasTransform2D;

  beforeEach(() => {
    node = createNode(NodeTestKind, NodeTestKind) as Node<typeof NodeTestKind, HasTransform2D> & HasTransform2D;
  });

  it('initializes default values', () => {
    initTransformTrait(node);

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
    initTransformTrait(node, base);
    expect(base.scaleX).toStrictEqual(base.scaleX);
    expect(base.scaleY).toStrictEqual(base.scaleY);
    expect(base.rotation).toStrictEqual(base.rotation);
    expect(base.x).toStrictEqual(base.x);
    expect(base.y).toStrictEqual(base.y);
  });
});

const NodeTestKind: unique symbol = Symbol('NodeTest');
