import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';
import type { RectangleLike } from '@flighthq/geometry/contract';

import type { Scale9Sprite, Scale9SpriteData, Scale9SpriteRuntime } from './contract.scene2d-types.ts';
import { Scale9SpriteKind } from './contract.scene2d-types.ts';
import { createNode2D, getNode2DRuntime } from './displayObject.ts';
import { createSpriteRuntime } from './sprite.ts';

export function createScale9Sprite(scale9Grid: Readonly<RectangleLike>): Scale9Sprite {
  return createNode2D(
    Scale9SpriteKind,
    () => createScale9SpriteData(scale9Grid),
    createScale9SpriteRuntime,
  ) as Scale9Sprite;
}

export function createScale9SpriteData(scale9Grid: Readonly<RectangleLike>): Scale9SpriteData {
  const out = allocateEntity<Scale9SpriteData>();
  initializeScale9SpriteData(out, scale9Grid);
  return finishEntity(out);
}

export function createScale9SpriteRuntime(): Scale9SpriteRuntime {
  return createSpriteRuntime() as Scale9SpriteRuntime;
}

export function getScale9SpriteRuntime(source: Readonly<Scale9Sprite>): Readonly<Scale9SpriteRuntime> {
  return getNode2DRuntime(source) as Scale9SpriteRuntime;
}

export function initializeScale9SpriteData(
  out: EntityConstruction<Scale9SpriteData>,
  scale9Grid: Readonly<RectangleLike>,
): void {
  out.scale9Grid = scale9Grid;
  out.texture = null;
}
