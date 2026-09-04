import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  PartialNode,
  RectangleLike,
  Scale9Sprite,
  Scale9SpriteData,
  Scale9SpriteRuntime,
} from '@flighthq/types/contract';
import { Scale9SpriteKind } from '@flighthq/types/contract';

import { createNode2D, getNode2DRuntime } from './displayObject';
import { createSpriteRuntime } from './sprite';

export function createScale9Sprite(
  scale9Grid: Readonly<RectangleLike>,
  obj?: Readonly<PartialNode<Scale9Sprite>>,
): Scale9Sprite {
  return createNode2D(
    Scale9SpriteKind,
    obj as Readonly<PartialNode<Scale9Sprite>>,
    (data) => createScale9SpriteData(scale9Grid, data),
    createScale9SpriteRuntime,
  ) as Scale9Sprite;
}

export function createScale9SpriteData(
  scale9Grid: Readonly<RectangleLike>,
  data?: Readonly<Partial<Scale9SpriteData>>,
): Scale9SpriteData {
  const out = allocateEntity<Scale9SpriteData>();
  out.scale9Grid = scale9Grid;
  out.texture = data?.texture ?? null;
  return finishEntity(out);
}

export function createScale9SpriteRuntime(): Scale9SpriteRuntime {
  return createSpriteRuntime() as Scale9SpriteRuntime;
}

export function getScale9SpriteRuntime(source: Readonly<Scale9Sprite>): Readonly<Scale9SpriteRuntime> {
  return getNode2DRuntime(source) as Scale9SpriteRuntime;
}
