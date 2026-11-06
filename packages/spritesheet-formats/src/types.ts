import type { SpritesheetData } from '@flighthq/spritesheet/contract';

import type { SpritesheetFormatKind } from './spritesheetFormatKind.ts';

export interface AsepriteRect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface AsepriteSize {
  h: number;
  w: number;
}

export interface AsepriteFrameTag {
  direction: 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';
  from: number;
  name: string;
  to: number;
  color?: string;
}

export interface AsepriteLayer {
  blendMode: string;
  name: string;
  opacity: number;
}

export interface AsepriteBaseFrame {
  duration: number;
  frame: AsepriteRect;
  rotated: boolean;
  sourceSize: AsepriteSize;
  spriteSourceSize: AsepriteRect;
  trimmed: boolean;
}

export type AsepriteHashFrame = AsepriteBaseFrame;

export interface AsepriteArrayFrame extends AsepriteBaseFrame {
  filename: string;
}

export interface AsepriteMeta {
  app: string;
  format: string;
  frameTags: AsepriteFrameTag[];
  image: string;
  layers?: AsepriteLayer[];
  scale: number | string;
  size: AsepriteSize;
  slices?: unknown[];
  version: string;
}

export interface AsepriteHashDocument {
  frames: Record<string, AsepriteHashFrame>;
  meta: AsepriteMeta;
}

export interface AsepriteArrayDocument {
  frames: AsepriteArrayFrame[];
  meta: AsepriteMeta;
}

export type AsepriteDocument = AsepriteArrayDocument | AsepriteHashDocument;

export interface AsepriteParsed {
  data: SpritesheetData;
  document: AsepriteDocument;
}

export interface AsepriteSerializeOptions {
  variant?: 'array' | 'hash';
}

export interface CocosPlistFrame {
  frame: string;
  spriteOffset: string;
  spriteSize: string;
  spriteSourceSize: string;
  spriteTrimmed: boolean;
  textureRotated: boolean;
  aliases?: string[];
}

export interface CocosPlistMetadata {
  format: number;
  size: string;
  textureFileName: string;
}

export interface CocosPlistDocument {
  frames: Record<string, CocosPlistFrame>;
  metadata: CocosPlistMetadata;
}

export interface CocosPlistParsed {
  data: SpritesheetData;
  document: CocosPlistDocument;
}

export interface LibgdxAtlasDocument {
  pages: LibgdxAtlasPage[];
}

export interface LibgdxAtlasPage {
  filterMag: string;
  filterMin: string;
  format: string;
  imageFile: string;
  regions: LibgdxAtlasRegion[];
  repeat: string;
  size: [number, number];
}

export interface LibgdxAtlasRegion {
  index: number;
  name: string;
  offset: [number, number];
  orig: [number, number];
  origSize: [number, number];
  rotate: boolean;
  size: [number, number];
  xy: [number, number];
}

export interface LibgdxAtlasParseOptions {
  frameDuration?: number;
}

export interface StarlingSubTexture {
  frameHeight?: number;
  frameWidth?: number;
  frameX?: number;
  frameY?: number;
  height: number;
  name: string;
  pivotX?: number;
  pivotY?: number;
  rotated?: boolean;
  width: number;
  x: number;
  y: number;
}

export interface StarlingDocument {
  imagePath: string;
  subTextures: StarlingSubTexture[];
}

export interface StarlingParsed {
  data: SpritesheetData;
  document: StarlingDocument;
}

export interface StarlingParseOptions {
  frameDuration?: number;
  imageHeight?: number;
  imageWidth?: number;
}

export interface TexturePackerRect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface TexturePackerSize {
  h: number;
  w: number;
}

export interface TexturePackerPivot {
  x: number;
  y: number;
}

export interface TexturePackerFrameTag {
  direction: 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';
  from: number;
  name: string;
  to: number;
}

export interface TexturePackerHashFrame {
  frame: TexturePackerRect;
  pivot?: TexturePackerPivot;
  rotated: boolean;
  sourceSize: TexturePackerSize;
  spriteSourceSize: TexturePackerRect;
  trimmed: boolean;
}

export interface TexturePackerArrayFrame extends TexturePackerHashFrame {
  filename: string;
}

export interface TexturePackerMeta {
  app: string;
  format: string;
  frameTags?: TexturePackerFrameTag[];
  image: string;
  scale: number | string;
  size: TexturePackerSize;
  version: string;
}

export interface TexturePackerHashDocument {
  frames: Record<string, TexturePackerHashFrame>;
  meta: TexturePackerMeta;
}

export interface TexturePackerArrayDocument {
  frames: TexturePackerArrayFrame[];
  meta: TexturePackerMeta;
}

export type TexturePackerDocument = TexturePackerArrayDocument | TexturePackerHashDocument;

export interface TexturePackerParsed {
  data: SpritesheetData;
  document: TexturePackerDocument;
}

export interface TexturePackerSerializeOptions {
  variant?: 'array' | 'hash';
}

export interface SpritesheetParseOptions {
  frameDuration?: number;
  imageHeight?: number;
  imageWidth?: number;
}

export interface SpritesheetFormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, options: SpritesheetParseOptions) => SpritesheetData;
}

export interface SpritesheetFormatDescriptor {
  readonly entry: SpritesheetFormatEntry;
  readonly kind: SpritesheetFormatKind;
}

export interface SpritesheetImportOptions {
  readonly formats?: readonly Readonly<SpritesheetFormatDescriptor>[];
}
