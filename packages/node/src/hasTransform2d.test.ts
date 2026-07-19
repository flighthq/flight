import type { HasTransform2D, HasTransform2DRuntime, Node, NodeRuntime } from '@flighthq/types';

import { initTransform2DRuntimeTrait, initTransform2DTrait } from './hasTransform2d';
import { createNode, createNodeRuntime } from './node';

describe('initTransform2DRuntimeTrait', () => {
  let runtime: NodeRuntime<HasTransform2D> & HasTransform2DRuntime;

  beforeEach(() => {
    runtime = createNodeRuntime() as NodeRuntime<HasTransform2D> & HasTransform2DRuntime;
  });

  it('initializes default values', () => {
    initTransform2DRuntimeTrait(runtime);

    expect(runtime.localMatrix).toBeNull();
    expect(runtime.rotationAngle).toStrictEqual(0);
    expect(runtime.rotationCosine).toStrictEqual(1);
    expect(runtime.rotationSine).toStrictEqual(0);
    expect(runtime.worldMatrix).toBeNull();

    // inherited graph runtime fields
    expect(runtime.appearanceId).toStrictEqual(0);
  });
});

describe('initTransform2DTrait', () => {
  let node: HasTransform2D;

  beforeEach(() => {
    node = createNode(NodeTestKind) as Node<HasTransform2D> & HasTransform2D;
  });

  it('initializes default values', () => {
    initTransform2DTrait(node);

    expect(node.rotation).toStrictEqual(0);
    expect(node.scaleX).toStrictEqual(1);
    expect(node.scaleY).toStrictEqual(1);
    expect(node.skewX).toStrictEqual(0);
    expect(node.skewY).toStrictEqual(0);
    expect(node.x).toStrictEqual(0);
    expect(node.y).toStrictEqual(0);
  });

  it('allows pre-defined values', () => {
    const base = {
      scaleX: 2,
      scaleY: 3,
      skewX: 15,
      skewY: 30,
      rotation: 45,
      x: 100,
      y: 200,
    };
    initTransform2DTrait(node, base);
    expect(node.scaleX).toStrictEqual(base.scaleX);
    expect(node.scaleY).toStrictEqual(base.scaleY);
    expect(node.skewX).toStrictEqual(base.skewX);
    expect(node.skewY).toStrictEqual(base.skewY);
    expect(node.rotation).toStrictEqual(base.rotation);
    expect(node.x).toStrictEqual(base.x);
    expect(node.y).toStrictEqual(base.y);
  });
});

const NodeTestKind = 'NodeTest';
