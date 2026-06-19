import { createDisplayObject } from '@flighthq/displayobject';
import { addNodeChild, getNodeChildCount } from '@flighthq/node';
import { createSprite } from '@flighthq/sprite';
import type { DisplayObject } from '@flighthq/types';

// Sprite now builds on DisplayObject (the separate SpriteNode base was retired), so sprites and display
// objects share one trait family (DisplayObjectTraits). There is no longer a type-level wall between a
// "sprite graph" and a "display graph" — they combine freely in one 2D node graph.

test('can add display objects to a display graph', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  const out: DisplayObject = addNodeChild(parent, child);
  expect(getNodeChildCount(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('can add sprites to a sprite graph', () => {
  const parent = createSprite();
  const child = createSprite();
  const out: DisplayObject = addNodeChild(parent, child);
  expect(getNodeChildCount(parent)).toBe(1);
  expect(out).not.toBeNull();
});

test('sprites and display objects share one trait family and combine freely', () => {
  const container = createDisplayObject();
  addNodeChild(container, createSprite());

  const spriteParent = createSprite();
  addNodeChild(spriteParent, createDisplayObject());

  expect(getNodeChildCount(container)).toBe(1);
  expect(getNodeChildCount(spriteParent)).toBe(1);
});
