import type { TextureAtlasPackerParseOptions } from './TextureAtlasPackerParseOptions';
import type { TextureAtlasStarlingParseOptions } from './TextureAtlasStarlingParseOptions';

// The options a format-agnostic parseTextureAtlas call may carry. Every field is optional and every
// format reads only the ones it understands — a Starling document ignores stripPathPrefix, a
// TexturePacker document ignores the image dimensions — so one call site can serve every format
// without the caller knowing which was detected.
//
// Defined as the union of the per-format option types rather than a hand-copied field list, so a new
// field on a format's own options type reaches the dispatcher without a second edit.
export type TextureAtlasParseOptions = TextureAtlasPackerParseOptions & TextureAtlasStarlingParseOptions;
