/** Identifies a texture atlas metadata file format for detection and dispatch. */
export type TextureAtlasFormatKind = string;
/** Texture Packer JSON (Hash or Array variant). */
export const TextureAtlasFormatKindTexturePacker = 'texturePacker';
/** Aseprite JSON atlas. */
export const TextureAtlasFormatKindAseprite = 'aseprite';
/** Starling / Sparrow XML atlas. */
export const TextureAtlasFormatKindStarling = 'starling';
/** libGDX / Spine text-format atlas. */
export const TextureAtlasFormatKindLibgdxAtlas = 'libgdxAtlas';
/** Cocos Creator / Cocos2d-x plist XML atlas. */
export const TextureAtlasFormatKindCocosPlist = 'cocosPlist';
