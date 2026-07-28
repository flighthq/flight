// Open registry key declared by a Texture's backing. Built-in loaders use these unprefixed names;
// third-party backing families use a vendor-prefixed value such as `acme.camera`.
export type TextureBackingKind = string;

export const BitmapTextureBackingKind = 'bitmap';
export const CompressedImageTextureBackingKind = 'compressedImage';
export const ExternalTextureBackingKind = 'external';
export const ImageTextureBackingKind = 'image';
export const RenderTextureBackingKind = 'renderTexture';
export const VideoTextureBackingKind = 'video';
export const VolumeTextureBackingKind = 'volume';
