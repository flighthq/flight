import { addGraphChild, getGraphNumChildren } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import { createSprite } from '@flighthq/scenegraph-sprite';
import type { DisplayObject, SpriteBase } from '@flighthq/types';

test('can add display objects to display graph', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  const out: DisplayObject = addGraphChild(parent, child);
  expect(getGraphNumChildren(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('can add sprite objects to sprite graph', () => {
  const parent = createSprite();
  const child = createSprite();
  const out: SpriteBase = addGraphChild(parent, child);
  expect(getGraphNumChildren(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('cannot add display objects to sprite graph', () => {
  const parent = createSprite();
  const child = createDisplayObject();
  // @ts-expect-error: parent and child have different graph types
  addGraphChild(parent, child);
});

test('cannot add sprite objects to standard display graph', () => {
  const parent = createDisplayObject();
  const child = createSprite();
  // @ts-expect-error: parent and child have different graph types
  addGraphChild(parent, child);
});
