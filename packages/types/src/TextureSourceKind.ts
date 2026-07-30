// Open registry key declared by a TextureSource. Built-in sources use these unprefixed names;
// third-party source families use a vendor-prefixed value such as `acme.camera`.
export type TextureSourceKind = string;

export const BitmapTextureSourceKind = 'bitmap';
export const CompressedImageTextureSourceKind = 'compressedImage';
export const ExternalTextureSourceKind = 'external';
export const ImageTextureSourceKind = 'image';
export const RenderTargetTextureSourceKind = 'renderTarget';
export const VoxelGridTextureSourceKind = 'voxelGrid';
