export const SpritesheetFormatKindAseprite = 'Aseprite';
export const SpritesheetFormatKindCocosPlist = 'CocosPlist';
export const SpritesheetFormatKindLibgdxAtlas = 'LibgdxAtlas';
export const SpritesheetFormatKindStarling = 'Starling';
export const SpritesheetFormatKindTexturePacker = 'TexturePacker';

/** Open string alias for spritesheet format identifiers.
 *
 *  Use a vendor-prefixed value (e.g. `'acme.MyAtlas'`) for custom formats to
 *  avoid colliding with built-in kind strings. */
export type SpritesheetFormatKind = string;
