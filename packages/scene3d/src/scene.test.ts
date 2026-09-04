import { addNodeChild, getNodeChildCount, getNodeLocalMatrix4, getNodeRoot } from '@flighthq/node/contract';
import { Node3DKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene3D, initializeScene3D } from './scene';
import { createNode3D, getNode3DRuntime } from './sceneNode';

describe('createScene3D', () => {
  it('owns a root Node3D with Node3DKind', () => {
    const scene = createScene3D();
    expect(scene.root.kind).toBe(Node3DKind);
  });

  it('starts with empty animations and null metadata', () => {
    const scene = createScene3D();
    expect(scene.animations).toEqual({});
    expect(scene.metadata).toBeNull();
  });

  it('defaults the root enabled to true and name to null', () => {
    const scene = createScene3D();
    expect(scene.root.enabled).toBe(true);
    expect(scene.root.name).toBe(null);
  });

  it('passes partial initial values to the root', () => {
    const scene = createScene3D({ enabled: false, name: 'world' });
    expect(scene.root.enabled).toBe(false);
    expect(scene.root.name).toBe('world');
  });

  it('starts the root with an identity localMatrix and a null worldMatrix slot', () => {
    const scene = createScene3D();
    expect(getNodeLocalMatrix4(scene.root).m[0]).toBe(1);
    expect(getNodeLocalMatrix4(scene.root).m[5]).toBe(1);
    expect(getNodeLocalMatrix4(scene.root).m[10]).toBe(1);
    expect(getNodeLocalMatrix4(scene.root).m[15]).toBe(1);
    expect(getNode3DRuntime(scene.root).worldMatrix4).toBeNull();
  });

  it('starts the root with no children', () => {
    const scene = createScene3D();
    expect(getNodeChildCount(scene.root)).toBe(0);
  });

  it('the root parents nodes attached beneath it', () => {
    const scene = createScene3D();
    const child = createNode3D();
    addNodeChild(scene.root, child);
    expect(getNodeRoot(child)).toBe(scene.root);
    expect(getNodeChildCount(scene.root)).toBe(1);
  });
});
describe('initializeScene3D', () => {
  it('is the construction initializer of createScene3D', () => {
    expect(typeof initializeScene3D).toBe('function');
  });
});
