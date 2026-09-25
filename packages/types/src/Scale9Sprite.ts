import type { RectangleLike } from './Rectangle.ts';
import type { Sprite, SpriteData, SpriteRuntime } from './Sprite.ts';

export interface Scale9SpriteData extends SpriteData {
  readonly scale9Grid: Readonly<RectangleLike>;
}

export interface Scale9SpriteRuntime extends SpriteRuntime {}

export interface Scale9Sprite extends Sprite {
  data: Scale9SpriteData;
}

export const Scale9SpriteKind = 'Scale9Sprite';
