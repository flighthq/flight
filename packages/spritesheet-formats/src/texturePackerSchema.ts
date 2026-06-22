// Texture Packer JSON schema — field names as they appear in the exported file.
// Reference: https://www.codeandweb.com/texturepacker/documentation/texture-settings
// Supports both the Hash (dict-keyed frames) and Array (array of frames with filename) variants.

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

/** Hash-keyed variant: `frames` is a plain object whose keys are frame names. */
export interface TexturePackerHashDocument {
  frames: Record<string, TexturePackerHashFrame>;
  meta: TexturePackerMeta;
}

/** Array variant: `frames` is an array and each entry carries a `filename` field. */
export interface TexturePackerArrayDocument {
  frames: TexturePackerArrayFrame[];
  meta: TexturePackerMeta;
}

export type TexturePackerDocument = TexturePackerArrayDocument | TexturePackerHashDocument;
