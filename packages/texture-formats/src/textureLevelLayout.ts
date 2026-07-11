import type { TextureContainerFormat } from '@flighthq/types';
import type { TextureContainerLevel } from '@flighthq/types';

// Block-size-aware mip-chain layout, shared by the container parsers. A `TextureContainerFormat` is
// either uncompressed (a 1x1 "block" of N bytes per pixel) or block-compressed (a fixed WxH block of N
// bytes); a mip level's byte length is `bytesPerBlock * ceil(width/blockWidth) * ceil(height/blockHeight)`.
// DDS stores no level index, so it computes every level's size here; KTX2 and Basis carry explicit
// per-level ranges and use this only where they still need a size.

// Builds the flat sub-image list for a mip chain that is laid out contiguously from `startOffset`, in
// DDS/D3D subresource order — layer-major, then face, then mip contiguous within a face
// (`subresource = mip + (face + layer * faces) * mipLevels`). Returns the built `levels` plus the
// offset just past the last level, or `null` if the format has no fixed block size (a transcoded
// Basis format never reaches this path). Dimensions halve per mip, floored at 1.
export function computeTextureContainerLevels(
  format: TextureContainerFormat,
  baseWidth: number,
  baseHeight: number,
  mipLevels: number,
  layers: number,
  faces: number,
  startOffset: number,
): { readonly levels: TextureContainerLevel[]; readonly endOffset: number } | null {
  if (getTextureContainerFormatBlockInfo(format) === null) return null;

  const levels: TextureContainerLevel[] = [];
  let offset = startOffset;
  for (let layer = 0; layer < layers; layer += 1) {
    for (let face = 0; face < faces; face += 1) {
      for (let mip = 0; mip < mipLevels; mip += 1) {
        const width = Math.max(1, baseWidth >> mip);
        const height = Math.max(1, baseHeight >> mip);
        const byteLength = getTextureContainerLevelByteLength(format, width, height);
        levels.push({ byteOffset: offset, byteLength, height, width });
        offset += byteLength;
      }
    }
  }
  return { endOffset: offset, levels };
}

// Bytes occupied by a single mip level of the given format at the given pixel dimensions, or `-1` if the
// format has no fixed block size (`etc1s`, whose rate is variable and only known after transcoding).
export function getTextureContainerLevelByteLength(
  format: TextureContainerFormat,
  width: number,
  height: number,
): number {
  const block = getTextureContainerFormatBlockInfo(format);
  if (block === null) return -1;
  const blocksWide = Math.ceil(width / block.blockWidth);
  const blocksHigh = Math.ceil(height / block.blockHeight);
  return blocksWide * blocksHigh * block.bytesPerBlock;
}

interface TextureFormatBlockInfo {
  readonly blockWidth: number;
  readonly blockHeight: number;
  readonly bytesPerBlock: number;
}

function getTextureContainerFormatBlockInfo(format: TextureContainerFormat): TextureFormatBlockInfo | null {
  return formatBlockInfo[format];
}

function pixelBlock(bytesPerPixel: number): TextureFormatBlockInfo {
  return { blockHeight: 1, blockWidth: 1, bytesPerBlock: bytesPerPixel };
}

function compressedBlock(blockWidth: number, blockHeight: number, bytesPerBlock: number): TextureFormatBlockInfo {
  return { blockHeight, blockWidth, bytesPerBlock };
}

// Exhaustive so the compiler flags any new `TextureContainerFormat` that lacks block sizing. `etc1s` is
// intentionally null (variable-rate Basis ETC1S — its byte layout comes from the container's own slice
// table, not from a block formula).
const formatBlockInfo: Record<TextureContainerFormat, TextureFormatBlockInfo | null> = {
  astc4x4: compressedBlock(4, 4, 16),
  astc5x4: compressedBlock(5, 4, 16),
  astc5x5: compressedBlock(5, 5, 16),
  astc6x5: compressedBlock(6, 5, 16),
  astc6x6: compressedBlock(6, 6, 16),
  astc8x5: compressedBlock(8, 5, 16),
  astc8x6: compressedBlock(8, 6, 16),
  astc8x8: compressedBlock(8, 8, 16),
  astc10x5: compressedBlock(10, 5, 16),
  astc10x6: compressedBlock(10, 6, 16),
  astc10x8: compressedBlock(10, 8, 16),
  astc10x10: compressedBlock(10, 10, 16),
  astc12x10: compressedBlock(12, 10, 16),
  astc12x12: compressedBlock(12, 12, 16),
  bc1: compressedBlock(4, 4, 8),
  bc1Srgb: compressedBlock(4, 4, 8),
  bc2: compressedBlock(4, 4, 16),
  bc2Srgb: compressedBlock(4, 4, 16),
  bc3: compressedBlock(4, 4, 16),
  bc3Srgb: compressedBlock(4, 4, 16),
  bc4: compressedBlock(4, 4, 8),
  bc4Snorm: compressedBlock(4, 4, 8),
  bc5: compressedBlock(4, 4, 16),
  bc5Snorm: compressedBlock(4, 4, 16),
  bc6hSfloat: compressedBlock(4, 4, 16),
  bc6hUfloat: compressedBlock(4, 4, 16),
  bc7: compressedBlock(4, 4, 16),
  bc7Srgb: compressedBlock(4, 4, 16),
  bgra8Srgb: pixelBlock(4),
  bgra8unorm: pixelBlock(4),
  eacR11: compressedBlock(4, 4, 8),
  eacR11Snorm: compressedBlock(4, 4, 8),
  eacRg11: compressedBlock(4, 4, 16),
  eacRg11Snorm: compressedBlock(4, 4, 16),
  etc1: compressedBlock(4, 4, 8),
  etc1s: null,
  etc2Rgb: compressedBlock(4, 4, 8),
  etc2RgbA1: compressedBlock(4, 4, 8),
  etc2RgbA1Srgb: compressedBlock(4, 4, 8),
  etc2RgbSrgb: compressedBlock(4, 4, 8),
  etc2Rgba: compressedBlock(4, 4, 16),
  etc2RgbaSrgb: compressedBlock(4, 4, 16),
  r8unorm: pixelBlock(1),
  rg8unorm: pixelBlock(2),
  rgba16f: pixelBlock(8),
  rgba32f: pixelBlock(16),
  rgba8Srgb: pixelBlock(4),
  rgba8unorm: pixelBlock(4),
  uastc: compressedBlock(4, 4, 16),
};
