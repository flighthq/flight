import { addNodeChild, getNodeChildCount, getNodeLocalMatrix4, getNodeRoot } from '@flighthq/node';
import { SceneNodeKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createScene } from './scene';
import { createSceneNode, getSceneNodeRuntime } from './sceneNode';

describe('createScene', () => {
  it('owns a root SceneNode with SceneNodeKind', () => {
    const scene = createScene();
    expect(scene.root.kind).toBe(SceneNodeKind);
  });

  it('starts with empty animations and null metadata', () => {
    const scene = createScene();
    expect(scene.animations).toEqual([]);
    expect(scene.metadata).toBeNull();
  });

  it('defaults the root enabled to true and name to null', () => {
    const scene = createScene();
    expect(scene.root.enabled).toBe(true);
    expect(scene.root.name).toBe(null);
  });

  it('passes partial initial values to the root', () => {
    const scene = createScene({ enabled: false, name: 'world' });
    expect(scene.root.enabled).toBe(false);
    expect(scene.root.name).toBe('world');
  });

  it('starts the root with an identity localMatrix and a null worldMatrix slot', () => {
    const scene = createScene();
    expect(getNodeLocalMatrix4(scene.root).m[0]).toBe(1);
    expect(getNodeLocalMatrix4(scene.root).m[5]).toBe(1);
    expect(getNodeLocalMatrix4(scene.root).m[10]).toBe(1);
    expect(getNodeLocalMatrix4(scene.root).m[15]).toBe(1);
    expect(getSceneNodeRuntime(scene.root).worldMatrix4).toBeNull();
  });

  it('starts the root with no children', () => {
    const scene = createScene();
    expect(getNodeChildCount(scene.root)).toBe(0);
  });

  it('the root parents nodes attached beneath it', () => {
    const scene = createScene();
    const child = createSceneNode();
    addNodeChild(scene.root, child);
    expect(getNodeRoot(child)).toBe(scene.root);
    expect(getNodeChildCount(scene.root)).toBe(1);
  });
});
