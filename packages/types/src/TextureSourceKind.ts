// Owned by `@flighthq/texture` (its contract lane declares the same names). This deprecated structural
// copy stays because a core package may cross into an owner only with type-only edges.
// Open registry key declared by a TextureSource. Built-in sources use these unprefixed names;
// third-party source families use a vendor-prefixed value such as `acme.camera`.
export type TextureSourceKind = string;

export const BitmapTextureSourceKind = 'bitmap';
export const CompressedImageTextureSourceKind = 'compressedImage';
export const ExternalTextureSourceKind = 'external';
export const ImageTextureSourceKind = 'image';
export const RenderTargetTextureSourceKind = 'renderTarget';
export const VoxelGridTextureSourceKind = 'voxelGrid';
