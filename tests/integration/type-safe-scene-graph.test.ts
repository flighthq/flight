import { createDisplayObject } from '@flighthq/displayobject';
import { addSceneChild, getSceneNumChildren } from '@flighthq/node';
import { createSprite } from '@flighthq/sprite';
import type { DisplayObject, SpriteNode } from '@flighthq/types';

test('can add display objects to display graph', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  const out: DisplayObject = addSceneChild(parent, child);
  expect(getSceneNumChildren(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('can add sprite objects to sprite graph', () => {
  const parent = createSprite();
  const child = createSprite();
  const out: SpriteNode = addSceneChild(parent, child);
  expect(getSceneNumChildren(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('cannot add display objects to sprite graph', () => {
  const parent = createSprite();
  const child = createDisplayObject();
  // @ts-expect-error: parent and child have different graph types
  addSceneChild(parent, child);
});

test('cannot add sprite objects to standard display graph', () => {
  const parent = createDisplayObject();
  const child = createSprite();
  // @ts-expect-error: parent and child have different graph types
  addSceneChild(parent, child);
});
