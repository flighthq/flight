import { addChild, getNumChildren } from '@flighthq/scene-graph-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';
import { createSprite } from '@flighthq/scene-graph-sprite';
import type { DisplayObject, SpriteBase } from '@flighthq/types';

test('can add display objects to display graph', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  const out: DisplayObject = addChild(parent, child);
  expect(getNumChildren(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('can add sprite objects to sprite graph', () => {
  const parent = createSprite();
  const child = createSprite();
  const out: SpriteBase = addChild(parent, child);
  expect(getNumChildren(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('cannot add display objects to sprite graph', () => {
  const parent = createSprite();
  const child = createDisplayObject();
  // @ts-expect-error: parent and child have different graph types
  addChild(parent, child);
});

test('cannot add sprite objects to standard display graph', () => {
  const parent = createDisplayObject();
  const child = createSprite();
  // @ts-expect-error: parent and child have different graph types
  addChild(parent, child);
});
