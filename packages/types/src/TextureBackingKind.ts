// Open registry key declared by a Texture's backing. Built-in loaders use these unprefixed names;
// third-party backing families use a vendor-prefixed value such as `acme.camera`.
export type TextureBackingKind = string;

export const ImageTextureBackingKind: TextureBackingKind = 'image';
export const ProducedTextureBackingKind: TextureBackingKind = 'produced';
export const VideoTextureBackingKind: TextureBackingKind = 'video';
export const VolumeTextureBackingKind: TextureBackingKind = 'volume';
