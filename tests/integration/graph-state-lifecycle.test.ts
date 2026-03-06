import {
  addChild,
  createDisplayObject,
  getLocalBoundsRect,
  getLocalTransform,
  removeChild,
} from '@flighthq/scene-graph-stage';
import type { DisplayObject } from '@flighthq/types';
import { GraphStateKey } from '@flighthq/types';

it('should allow undefined when first created', () => {
  const object: Partial<DisplayObject> = { x: 100, y: 100 };
  expect(object[GraphStateKey]).toBeUndefined();
});

it('should become defined when fetching bounds', () => {
  const object = createDisplayObject();
  getLocalBoundsRect(object);
  expect(object[GraphStateKey]).not.toBeUndefined();
});

it('should become defined when fetching transform', () => {
  const object = createDisplayObject();
  getLocalTransform(object);
  expect(object[GraphStateKey]).not.toBeUndefined();
});

it('should become defined when adding as a child', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  addChild(parent, child);
  expect(child[GraphStateKey]).not.toBeUndefined();
});

it('should remain defined, even when removed', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  addChild(parent, child);
  removeChild(parent, child);
  expect(child[GraphStateKey]).not.toBeUndefined();
});
