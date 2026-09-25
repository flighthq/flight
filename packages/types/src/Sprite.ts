import type { Node2D, Node2DData, Node2DRuntime } from './Node2D.ts';
import type { Texture } from './Texture.ts';

export interface SpriteData extends Node2DData {
  texture: Texture | null;
}

export interface SpriteRuntime extends Node2DRuntime {
  localBoundsTexture: Texture | null;
  localBoundsTextureVersion: number;
}

export interface Sprite extends Node2D {
  data: SpriteData;
}

export const SpriteKind = 'Sprite';
