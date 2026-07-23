import type { SpritesheetData } from './SpritesheetData';

// Aseprite JSON export schema — field names as they appear in the exported file.
// Reference: https://www.aseprite.org/docs/cli/#sheet-json
// Aseprite exports either a Hash variant (frames is a dict keyed by name) or
// an Array variant (frames is an array with a filename field per entry).

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
  /** Playback direction for this tag range. */
  direction: 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';
  /** Index of last frame in this tag (inclusive). */
  from: number;
  name: string;
  /** Index of first frame in this tag (inclusive). */
  to: number;
  /** Optional hex colour label assigned in Aseprite. */
  color?: string;
}

export interface AsepriteLayer {
  blendMode: string;
  name: string;
  opacity: number;
}

export interface AsepriteBaseFrame {
  /** Per-frame display duration in milliseconds — key difference from Texture Packer. */
  duration: number;
  frame: AsepriteRect;
  rotated: boolean;
  sourceSize: AsepriteSize;
  spriteSourceSize: AsepriteRect;
  trimmed: boolean;
}

/** Hash variant: each value in the `frames` dict is one of these. */
export type AsepriteHashFrame = AsepriteBaseFrame;

/** Array variant: each element of the `frames` array is one of these. */
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

/** Hash-keyed variant: `frames` is a plain object whose keys are frame names. */
export interface AsepriteHashDocument {
  frames: Record<string, AsepriteHashFrame>;
  meta: AsepriteMeta;
}

/** Array variant: `frames` is an array and each entry carries a `filename` field. */
export interface AsepriteArrayDocument {
  frames: AsepriteArrayFrame[];
  meta: AsepriteMeta;
}

export type AsepriteDocument = AsepriteArrayDocument | AsepriteHashDocument;

// The result of parsing an Aseprite export: the mapped SpritesheetData plus the raw parsed document.
export interface AsepriteParsed {
  data: SpritesheetData;
  document: AsepriteDocument;
}

export interface AsepriteSerializeOptions {
  /** Override the output format variant. Defaults to the variant of `existing`, or `'hash'`. */
  variant?: 'array' | 'hash';
}
