import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';
import type { Rectangle } from './Rectangle';
import type { TextureAtlas } from './TextureAtlas';

export interface SpriteData extends Node2DData {
  atlas: TextureAtlas | null;
  id: number;
  rect: Rectangle | null;
}

export interface SpriteRuntime extends Node2DRuntime {}

export interface Sprite extends Node2D {
  data: SpriteData;
}

export const SpriteKind = 'Sprite';
