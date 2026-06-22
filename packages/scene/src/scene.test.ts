import { addNodeChild, getNodeChildCount, getNodeRoot } from '@flighthq/node';
import { SceneNodeKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createScene } from './scene';
import { createSceneNode, getSceneNodeRuntime } from './sceneNode';

describe('createScene', () => {
  it('creates a root node with SceneNodeKind', () => {
    const scene = createScene();
    expect(scene.kind).toBe(SceneNodeKind);
  });

  it('defaults enabled to true and name to null', () => {
    const scene = createScene();
    expect(scene.enabled).toBe(true);
    expect(scene.name).toBe(null);
  });

  it('accepts partial initial values', () => {
    const scene = createScene({ enabled: false, name: 'world' });
    expect(scene.enabled).toBe(false);
    expect(scene.name).toBe('world');
  });

  it('starts with an identity localMatrix and a null worldMatrix slot', () => {
    const scene = createScene();
    expect(scene.localMatrix.m[0]).toBe(1);
    expect(scene.localMatrix.m[5]).toBe(1);
    expect(scene.localMatrix.m[10]).toBe(1);
    expect(scene.localMatrix.m[15]).toBe(1);
    expect(getSceneNodeRuntime(scene).worldMatrix).toBeNull();
  });

  it('starts with no children', () => {
    const scene = createScene();
    expect(getNodeChildCount(scene)).toBe(0);
  });

  it('is the root for nodes attached beneath it', () => {
    const scene = createScene();
    const child = createSceneNode();
    addNodeChild(scene, child);
    expect(getNodeRoot(child)).toBe(scene);
    expect(getNodeChildCount(scene)).toBe(1);
  });
});
