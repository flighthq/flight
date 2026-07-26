import { addNodeChild, getNodeChildCount, getNodeParent } from '@flighthq/node/contract';

import { createNode3D, enableNode3DSignals, getNode3DRuntime } from './sceneNode';
import { disposeNode3D } from './sceneNodeDispose';

describe('disposeNode3D', () => {
  it('clears signals after disposal', () => {
    const node = createNode3D();
    enableNode3DSignals(node);
    disposeNode3D(node);
    expect(getNode3DRuntime(node).nodeSignals).toBeNull();
  });

  it('detaches the node from its parent', () => {
    const parent = createNode3D();
    const child = createNode3D();
    addNodeChild(parent, child);
    disposeNode3D(child);
    expect(getNodeParent(child)).toBeNull();
    expect(getNodeChildCount(parent)).toBe(0);
  });

  it('disposes a standalone leaf node without throwing', () => {
    const leaf = createNode3D();
    expect(() => disposeNode3D(leaf)).not.toThrow();
  });

  it('recursively disposes all descendants', () => {
    const root = createNode3D();
    const child = createNode3D();
    const grandchild = createNode3D();
    addNodeChild(root, child);
    addNodeChild(child, grandchild);
    disposeNode3D(root);
    expect(getNodeParent(grandchild)).toBeNull();
    expect(getNodeChildCount(child)).toBe(0);
  });
});
