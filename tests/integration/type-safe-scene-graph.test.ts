import { createDisplayObject } from '@flighthq/displayobject';
import { addNodeChild, getNodeChildCount } from '@flighthq/node';
import { createSprite } from '@flighthq/sprite';
import type { DisplayObject, SpriteNode } from '@flighthq/types';

test('can add display objects to display graph', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  const out: DisplayObject = addNodeChild(parent, child);
  expect(getNodeChildCount(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('can add sprite objects to sprite graph', () => {
  const parent = createSprite();
  const child = createSprite();
  const out: SpriteNode = addNodeChild(parent, child);
  expect(getNodeChildCount(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('adding display objects to sprite graph is blocked at the type level', () => {
  const parent = createSprite();
  const child = createDisplayObject();
  // @ts-expect-error — traits phantom field makes DisplayObjectTraits incompatible with SpriteNodeTraits
  addNodeChild(parent, child);
});

test('adding sprite objects to display graph is blocked at the type level', () => {
  const parent = createDisplayObject();
  const child = createSprite();
  // @ts-expect-error — traits phantom field makes SpriteNodeTraits incompatible with DisplayObjectTraits
  addNodeChild(parent, child);
});
