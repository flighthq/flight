import type { Node2D, Node2DData, Node2DRuntime } from './Node2D.ts';
import type { Scene2DTexture } from './Scene2DTexture.ts';
export interface SpriteData extends Node2DData {
  texture: Scene2DTexture | null;
}
export interface SpriteRuntime extends Node2DRuntime {
  localBoundsTexture: Scene2DTexture | null;
  localBoundsTextureVersion: number;
}
export interface Sprite extends Node2D {
  data: SpriteData;
}
export const SpriteKind = 'Sprite';
