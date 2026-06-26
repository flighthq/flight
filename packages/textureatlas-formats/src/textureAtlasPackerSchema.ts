// TexturePacker JSON schema — field names as they appear in the exported file.
// Reference: https://www.codeandweb.com/texturepacker/documentation/texture-settings
// Supports both the Hash (dict-keyed frames) and Array (array of frames with filename) variants.

export interface TextureAtlasPackerRect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface TextureAtlasPackerSize {
  h: number;
  w: number;
}

export interface TextureAtlasPackerPivot {
  x: number;
  y: number;
}

export interface TextureAtlasPackerFrameTag {
  direction?: 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';
  from: number;
  name: string;
  to: number;
}

export interface TextureAtlasPackerHashFrame {
  frame: TextureAtlasPackerRect;
  pivot?: TextureAtlasPackerPivot;
  rotated: boolean;
  sourceSize: TextureAtlasPackerSize;
  spriteSourceSize: TextureAtlasPackerRect;
  trimmed: boolean;
}

export interface TextureAtlasPackerArrayFrame extends TextureAtlasPackerHashFrame {
  filename: string;
}

export interface TextureAtlasPackerMeta {
  app: string;
  format: string;
  frameTags?: TextureAtlasPackerFrameTag[];
  image: string;
  scale: number | string;
  size: TextureAtlasPackerSize;
  version: string;
}

/** Hash-keyed variant: `frames` is a plain object whose keys are frame names. */
export interface TextureAtlasPackerHashDocument {
  frames: Record<string, TextureAtlasPackerHashFrame>;
  meta: TextureAtlasPackerMeta;
}

/** Array variant: `frames` is an array and each entry carries a `filename` field. */
export interface TextureAtlasPackerArrayDocument {
  frames: TextureAtlasPackerArrayFrame[];
  meta: TextureAtlasPackerMeta;
}

export type TextureAtlasPackerDocument = TextureAtlasPackerArrayDocument | TextureAtlasPackerHashDocument;
