import type { TextureContainer } from '@flighthq/types';
import type { TextureContainerFormat } from '@flighthq/types';
import type { TextureContainerLevel } from '@flighthq/types';
import type { TextureContainerSupercompression } from '@flighthq/types';

import {
  createByteReader,
  hasByteReaderBytes,
  readByteReaderU32,
  readByteReaderU64,
  skipByteReader,
} from './byteReader';

// Parses a KTX2 container (Khronos KTX 2.0) into a `TextureContainer`, or returns `null` if the bytes
// are not KTX2, are truncated, or carry a `vkFormat`/supercompression this package does not map yet.
//
// Reads the 12-byte identifier, the fixed header (`vkFormat`, `pixelWidth/Height/Depth`, `layerCount`,
// `faceCount`, `levelCount`, `supercompressionScheme`), and the level index (per-level `byteOffset` /
// `byteLength`). The Data Format Descriptor and key/value data are skipped — `vkFormat` alone
// determines the format, except when it is `VK_FORMAT_UNDEFINED` (0), where the payload is Basis: a
// `BasisLZ`-supercompressed level is ETC1S, otherwise it is UASTC (the DFD's exact colorModel is not
// deep-parsed). Supercompressed levels are reported as single compressed blobs (they cannot be split
// per face/layer without inflating); uncompressed levels are split into their per-`(layer, face)`
// sub-images, nested mip-major → layer → face to match the KTX2 image order.
export function parseKtx2(bytes: Readonly<Uint8Array>): TextureContainer | null {
  if (!hasKtx2Identifier(bytes)) return null;

  // 12 id + 68 header/index (17 u32 = 68 bytes) before the level index at offset 80.
  if (bytes.byteLength < ktx2LevelIndexOffset) return null;

  const reader = createByteReader(bytes, 12);
  const vkFormat = readByteReaderU32(reader);
  skipByteReader(reader, 4); // typeSize
  const pixelWidth = readByteReaderU32(reader);
  const pixelHeight = readByteReaderU32(reader);
  const pixelDepth = readByteReaderU32(reader);
  const layerCount = readByteReaderU32(reader);
  const faceCount = readByteReaderU32(reader);
  const levelCount = readByteReaderU32(reader);
  const supercompressionScheme = readByteReaderU32(reader);
  // dfd/kvd/sgd index (2 u32 + 2 u32 + 2 u64 = 32 bytes) — not needed to locate levels.

  const supercompression = ktx2Supercompression[supercompressionScheme];
  if (supercompression === undefined) return null;

  const format = mapKtx2Format(vkFormat, supercompressionScheme);
  if (format === null) return null;

  const width = Math.max(1, pixelWidth);
  const height = Math.max(1, pixelHeight);
  const depth = Math.max(1, pixelDepth);
  const layers = Math.max(1, layerCount);
  const faces = faceCount === 6 ? 6 : 1;
  const levelCountPresent = Math.max(1, levelCount);

  reader.offset = ktx2LevelIndexOffset;
  if (!hasByteReaderBytes(reader, levelCountPresent * 24)) return null;

  const levels: TextureContainerLevel[] = [];
  const imagesPerLevel = layers * faces;
  for (let mip = 0; mip < levelCountPresent; mip += 1) {
    const byteOffset = readByteReaderU64(reader);
    const byteLength = readByteReaderU64(reader);
    skipByteReader(reader, 8); // uncompressedByteLength
    if (byteOffset + byteLength > bytes.byteLength) return null;

    const mipWidth = Math.max(1, width >> mip);
    const mipHeight = Math.max(1, height >> mip);

    const splittable = supercompression === 'None' && imagesPerLevel > 1 && byteLength % imagesPerLevel === 0;
    if (!splittable) {
      levels.push({ byteLength, byteOffset, height: mipHeight, width: mipWidth });
      continue;
    }
    const imageSize = byteLength / imagesPerLevel;
    for (let image = 0; image < imagesPerLevel; image += 1) {
      levels.push({
        byteLength: imageSize,
        byteOffset: byteOffset + image * imageSize,
        height: mipHeight,
        width: mipWidth,
      });
    }
  }

  return {
    depth,
    faces,
    format,
    height,
    layers,
    levels,
    mipLevels: levelCountPresent,
    supercompression,
    width,
  };
}

function hasKtx2Identifier(bytes: Readonly<Uint8Array>): boolean {
  if (bytes.byteLength < 12) return false;
  for (let i = 0; i < 12; i += 1) {
    if (bytes[i] !== ktx2Identifier[i]) return false;
  }
  return true;
}

function mapKtx2Format(vkFormat: number, supercompressionScheme: number): TextureContainerFormat | null {
  if (vkFormat === 0) return supercompressionScheme === 1 ? 'etc1s' : 'uastc';
  return ktx2VkFormat[vkFormat] ?? null;
}

// «KTX 20»\r\n\x1A\n
const ktx2Identifier: readonly number[] = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

// 12 (identifier) + 48 (header: 9 u32) + 20 (dfd/kvd offsets: 2 u32 each + 2 u64) = 80.
const ktx2LevelIndexOffset = 80;

const ktx2Supercompression: Readonly<Record<number, TextureContainerSupercompression>> = {
  0: 'None',
  1: 'BasisLZ',
  2: 'Zstd',
  3: 'ZLIB',
};

// Curated Vulkan `vkFormat` → `TextureContainerFormat`. Uncompressed 8-bit/float, the full BC set, ETC2/EAC,
// and ASTC LDR block sizes. ASTC sRGB codes collapse onto their unorm block (the vocabulary keys ASTC by
// block size, not color space); BC1 RGB and RGBA codes both map to `bc1`. Unmapped codes → `null`.
const ktx2VkFormat: Readonly<Record<number, TextureContainerFormat>> = {
  9: 'r8unorm',
  16: 'rg8unorm',
  37: 'rgba8unorm',
  43: 'rgba8Srgb',
  44: 'bgra8unorm',
  50: 'bgra8Srgb',
  97: 'rgba16f',
  109: 'rgba32f',
  131: 'bc1',
  132: 'bc1Srgb',
  133: 'bc1',
  134: 'bc1Srgb',
  135: 'bc2',
  136: 'bc2Srgb',
  137: 'bc3',
  138: 'bc3Srgb',
  139: 'bc4',
  140: 'bc4Snorm',
  141: 'bc5',
  142: 'bc5Snorm',
  143: 'bc6hUfloat',
  144: 'bc6hSfloat',
  145: 'bc7',
  146: 'bc7Srgb',
  147: 'etc2Rgb',
  148: 'etc2RgbSrgb',
  149: 'etc2RgbA1',
  150: 'etc2RgbA1Srgb',
  151: 'etc2Rgba',
  152: 'etc2RgbaSrgb',
  153: 'eacR11',
  154: 'eacR11Snorm',
  155: 'eacRg11',
  156: 'eacRg11Snorm',
  157: 'astc4x4',
  158: 'astc4x4',
  159: 'astc5x4',
  160: 'astc5x4',
  161: 'astc5x5',
  162: 'astc5x5',
  163: 'astc6x5',
  164: 'astc6x5',
  165: 'astc6x6',
  166: 'astc6x6',
  167: 'astc8x5',
  168: 'astc8x5',
  169: 'astc8x6',
  170: 'astc8x6',
  171: 'astc8x8',
  172: 'astc8x8',
  173: 'astc10x5',
  174: 'astc10x5',
  175: 'astc10x6',
  176: 'astc10x6',
  177: 'astc10x8',
  178: 'astc10x8',
  179: 'astc10x10',
  180: 'astc10x10',
  181: 'astc12x10',
  182: 'astc12x10',
  183: 'astc12x12',
  184: 'astc12x12',
};
