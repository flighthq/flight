// TexturePacker JSON schema — field names as they appear in the exported file.
// Reference: https://www.codeandweb.com/texturepacker/documentation/texture-settings
// Supports both the Hash (dict-keyed frames) and Array (array of frames with filename) variants.

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

/** Hash-keyed variant: `frames` is a plain object whose keys are frame names. */
export interface TexturePackerAtlasHashDocument {
  frames: Record<string, TexturePackerAtlasHashFrame>;
  meta: TexturePackerAtlasMeta;
}

/** Array variant: `frames` is an array and each entry carries a `filename` field. */
export interface TexturePackerAtlasArrayDocument {
  frames: TexturePackerAtlasArrayFrame[];
  meta: TexturePackerAtlasMeta;
}

export type TexturePackerAtlasDocument = TexturePackerAtlasArrayDocument | TexturePackerAtlasHashDocument;
