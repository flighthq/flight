// Aseprite JSON export schema — field names as they appear in the exported file.
// Reference: https://www.aseprite.org/docs/cli/#sheet-json
// Aseprite exports either a Hash variant (frames is a dict keyed by name) or
// an Array variant (frames is an array with a filename field per entry).

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
  /** Playback direction for this tag range. */
  direction: 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';
  /** Index of first frame in this tag (inclusive). */
  from: number;
  name: string;
  /** Index of last frame in this tag (inclusive). */
  to: number;
  /** Optional hex colour label assigned in Aseprite. */
  color?: string;
}

export interface TextureAtlasAsepriteBaseFrame {
  /** Per-frame display duration in milliseconds. */
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
