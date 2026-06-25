import { addNodeChild, getNodeChildCount, getNodeParent } from '@flighthq/node';

import { createSceneNode, enableSceneNodeSignals, getSceneNodeRuntime } from './sceneNode';
import { disposeSceneNode } from './sceneNodeDispose';

describe('disposeSceneNode', () => {
  it('clears signals after disposal', () => {
    const node = createSceneNode();
    enableSceneNodeSignals(node);
    disposeSceneNode(node);
    expect(getSceneNodeRuntime(node).nodeSignals).toBeNull();
  });

  it('detaches the node from its parent', () => {
    const parent = createSceneNode();
    const child = createSceneNode();
    addNodeChild(parent, child);
    disposeSceneNode(child);
    expect(getNodeParent(child)).toBeNull();
    expect(getNodeChildCount(parent)).toBe(0);
  });

  it('disposes a standalone leaf node without throwing', () => {
    const leaf = createSceneNode();
    expect(() => disposeSceneNode(leaf)).not.toThrow();
  });

  it('recursively disposes all descendants', () => {
    const root = createSceneNode();
    const child = createSceneNode();
    const grandchild = createSceneNode();
    addNodeChild(root, child);
    addNodeChild(child, grandchild);
    disposeSceneNode(root);
    expect(getNodeParent(grandchild)).toBeNull();
    expect(getNodeChildCount(child)).toBe(0);
  });
});
