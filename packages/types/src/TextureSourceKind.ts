/** @deprecated Import TextureSourceKind from @flighthq/texture/contract. */
export type { TextureSourceKind } from '@flighthq/texture/contract';

// Exact value bridge for the runtime @flighthq/types -> @flighthq/texture core-layer cycle.
// Keep aligned with @flighthq/texture/contract until legacy value exports can be removed.
export const BitmapTextureSourceKind = 'bitmap';
export const CompressedImageTextureSourceKind = 'compressedImage';
export const ExternalTextureSourceKind = 'external';
export const ImageTextureSourceKind = 'image';
export const RenderTargetTextureSourceKind = 'renderTarget';
export const VoxelGridTextureSourceKind = 'voxelGrid';
