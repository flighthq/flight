import type { TextureAtlas } from '@flighthq/textureatlas/contract';

import type { TextureAtlasFormatKind } from './textureAtlasFormatKind.ts';

export interface TexturePackerAtlasRect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface TexturePackerAtlasSize {
  h: number;
  w: number;
}

export interface TexturePackerAtlasPivot {
  x: number;
  y: number;
}

export interface TexturePackerAtlasFrameTag {
  direction?: 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';
  from: number;
  name: string;
  to: number;
}

export interface TexturePackerAtlasHashFrame {
  frame: TexturePackerAtlasRect;
  pivot?: TexturePackerAtlasPivot;
  rotated: boolean;
  sourceSize: TexturePackerAtlasSize;
  spriteSourceSize: TexturePackerAtlasRect;
  trimmed: boolean;
}

export interface TexturePackerAtlasArrayFrame extends TexturePackerAtlasHashFrame {
  filename: string;
}

export interface TexturePackerAtlasMeta {
  app: string;
  format: string;
  frameTags?: TexturePackerAtlasFrameTag[];
  image: string;
  scale: number | string;
  size: TexturePackerAtlasSize;
  version: string;
}

export interface TexturePackerAtlasHashDocument {
  frames: Record<string, TexturePackerAtlasHashFrame>;
  meta: TexturePackerAtlasMeta;
}

export interface TexturePackerAtlasArrayDocument {
  frames: TexturePackerAtlasArrayFrame[];
  meta: TexturePackerAtlasMeta;
}

export type TexturePackerAtlasDocument = TexturePackerAtlasArrayDocument | TexturePackerAtlasHashDocument;

export interface TextureAtlasAsepriteRect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface TextureAtlasAsepriteSize {
  h: number;
  w: number;
}

export interface TextureAtlasAsepriteFrameTag {
  direction: 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';
  from: number;
  name: string;
  to: number;
  color?: string;
}

export interface TextureAtlasAsepriteBaseFrame {
  duration: number;
  frame: TextureAtlasAsepriteRect;
  rotated: boolean;
  sourceSize: TextureAtlasAsepriteSize;
  spriteSourceSize: TextureAtlasAsepriteRect;
  trimmed: boolean;
}

export type TextureAtlasAsepriteHashFrame = TextureAtlasAsepriteBaseFrame;

export interface TextureAtlasAsepriteArrayFrame extends TextureAtlasAsepriteBaseFrame {
  filename: string;
}

export interface TextureAtlasAsepriteMeta {
  app: string;
  format: string;
  frameTags?: TextureAtlasAsepriteFrameTag[];
  image: string;
  scale: number | string;
  size: TextureAtlasAsepriteSize;
  version: string;
}

export interface TextureAtlasAsepriteHashDocument {
  frames: Record<string, TextureAtlasAsepriteHashFrame>;
  meta: TextureAtlasAsepriteMeta;
}

export interface TextureAtlasAsepriteArrayDocument {
  frames: TextureAtlasAsepriteArrayFrame[];
  meta: TextureAtlasAsepriteMeta;
}

export type TextureAtlasAsepriteDocument = TextureAtlasAsepriteArrayDocument | TextureAtlasAsepriteHashDocument;

export interface TexturePackerAtlasParseOptions {
  stripPathPrefix?: boolean;
}

export type TextureAtlasParseOptions = TexturePackerAtlasParseOptions;

export interface TextureAtlasFormatEntry {
  detect: (content: string) => boolean;
  parse: (content: string, atlas: TextureAtlas, options: TextureAtlasParseOptions) => void;
}

export interface TextureAtlasFormatDescriptor {
  readonly entry: TextureAtlasFormatEntry;
  readonly kind: TextureAtlasFormatKind;
}

export interface TextureAtlasImportOptions {
  readonly formats?: readonly Readonly<TextureAtlasFormatDescriptor>[];
}
