import type { TexturePackerAtlasParseOptions } from './TexturePackerAtlasParseOptions';

// The options a format-agnostic parseTextureAtlas call may carry. Every field is optional and every
// format reads only the ones it understands — a Starling document ignores stripPathPrefix — so one
// call site can serve every format without the caller knowing which was detected.
//
// Defined as the intersection of the per-format option types rather than a hand-copied field list, so
// a new field on a format's own options type reaches the dispatcher without a second edit. Only
// TexturePacker declares options today; a second format's type joins this intersection.
export type TextureAtlasParseOptions = TexturePackerAtlasParseOptions;
