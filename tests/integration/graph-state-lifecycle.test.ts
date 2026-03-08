import { addChild, getLocalBoundsRect, getLocalTransform, removeChild } from '@flighthq/scene-graph-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';
import type { DisplayObject } from '@flighthq/types';
import { SceneNodeRuntimeKey } from '@flighthq/types';

it('should allow undefined when first created', () => {
  const object: Partial<DisplayObject> = { x: 100, y: 100 };
  expect(object[SceneNodeRuntimeKey]).toBeUndefined();
});

it('should become defined when fetching bounds', () => {
  const object = createDisplayObject();
  getLocalBoundsRect(object);
  expect(object[SceneNodeRuntimeKey]).not.toBeUndefined();
});

it('should become defined when fetching transform', () => {
  const object = createDisplayObject();
  getLocalTransform(object);
  expect(object[SceneNodeRuntimeKey]).not.toBeUndefined();
});

it('should become defined when adding as a child', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  addChild(parent, child);
  expect(child[SceneNodeRuntimeKey]).not.toBeUndefined();
});

it('should remain defined, even when removed', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  addChild(parent, child);
  removeChild(parent, child);
  expect(child[SceneNodeRuntimeKey]).not.toBeUndefined();
});
