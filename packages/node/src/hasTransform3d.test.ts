import { createQuaternion, createVector3 } from '@flighthq/geometry/contract';
import type { HasTransform3D, HasTransform3DRuntime, Node, NodeRuntime } from '@flighthq/types/contract';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';
import { createNode, createNodeRuntime } from './node';

describe('initTransform3DRuntimeTrait', () => {
  let runtime: NodeRuntime<HasTransform3D> & HasTransform3DRuntime;

  beforeEach(() => {
    runtime = createNodeRuntime() as NodeRuntime<HasTransform3D> & HasTransform3DRuntime;
  });

  it('nulls the matrix caches and clears the detached flag', () => {
    initTransform3DRuntimeTrait(runtime);

    expect(runtime.localMatrix4).toBeNull();
    expect(runtime.worldMatrix4).toBeNull();
    expect(runtime.localMatrix4Detached).toBe(false);
  });
});

describe('initTransform3DTrait', () => {
  let node: HasTransform3D;

  beforeEach(() => {
    node = createNode(NodeTestKind) as Node<HasTransform3D> & HasTransform3D;
  });

  it('defaults to identity position/rotation/scale', () => {
    initTransform3DTrait(node);

    expect(node.position).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(node.rotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(node.scale).toMatchObject({ x: 1, y: 1, z: 1 });
  });

  it('accepts existing position/rotation/scale', () => {
    const position = createVector3(7, 0, 0);
    const rotation = createQuaternion();
    const scale = createVector3(2, 2, 2);
    initTransform3DTrait(node, { position, rotation, scale });

    expect(node.position).toMatchObject({ x: 7, y: 0, z: 0 });
    expect(node.rotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(node.scale).toMatchObject({ x: 2, y: 2, z: 2 });
  });

  it('copies out of the options object so two nodes never share storage', () => {
    const options = { position: createVector3(1, 2, 3), rotation: createQuaternion(), scale: createVector3(2, 2, 2) };
    const second = createNode(NodeTestKind) as Node<HasTransform3D> & HasTransform3D;
    initTransform3DTrait(node, options);
    initTransform3DTrait(second, options);

    node.position.x = 999;
    node.scale.y = 999;
    node.rotation.w = 0;

    expect(second.position.x).toBe(1);
    expect(second.scale.y).toBe(2);
    expect(second.rotation.w).toBe(1);
    expect(options.position.x).toBe(1);
    expect(options.scale.y).toBe(2);
    expect(options.rotation.w).toBe(1);
  });
});

const NodeTestKind = 'NodeTest';
