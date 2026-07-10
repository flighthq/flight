import type { TextureContainer } from '@flighthq/types';
import type { TextureContainerFormat } from '@flighthq/types';

import { createByteReader, hasByteReaderBytes, readByteReaderU32, skipByteReader } from './byteReader';
import { computeTextureContainerLevels } from './textureLevelLayout';

// Parses a DDS container (DirectDraw Surface) into a `TextureContainer`, or returns `null` if the bytes
// are not DDS, are truncated, or carry a pixel format this package does not map (e.g. a legacy 16/24-bit
// layout, a YUV/luminance format, or a volume texture).
//
// Reads the `DDS_HEADER` (`dwHeight`/`dwWidth`/`dwMipMapCount`, the `DDS_PIXELFORMAT` FourCC, and
// `dwCaps2` for cubemaps) and, when the FourCC is `DX10`, the `DDS_HEADER_DXT10` extension
// (`dxgiFormat`, `miscFlag` for cube, `arraySize`). The format comes from the DXGI code, the FourCC
// (DXT1-5 / ATI1/2 / BC4-5 / DX9 float codes), or the RGBA channel masks for uncompressed data. DDS
// carries no level index, so every mip's byte range is computed from the block size (see
// `computeTextureContainerLevels`): sub-images are nested layer → face → mip, matching D3D subresource
// order (a cubemap's 6 faces each hold a full mip chain).
export function parseDds(bytes: Readonly<Uint8Array>): TextureContainer | null {
  if (!hasDdsMagic(bytes)) return null;
  if (bytes.byteLength < ddsDataOffset) return null;

  const reader = createByteReader(bytes, 4);
  skipByteReader(reader, 4); // dwSize
  skipByteReader(reader, 4); // dwFlags
  const dwHeight = readByteReaderU32(reader);
  const dwWidth = readByteReaderU32(reader);
  skipByteReader(reader, 4); // dwPitchOrLinearSize
  const dwDepth = readByteReaderU32(reader);
  const dwMipMapCount = readByteReaderU32(reader);

  reader.offset = 80; // DDS_PIXELFORMAT.dwFlags
  const pfFlags = readByteReaderU32(reader);
  const fourCC = readByteReaderU32(reader);
  const rgbBitCount = readByteReaderU32(reader);
  const rMask = readByteReaderU32(reader);
  const gMask = readByteReaderU32(reader);
  const bMask = readByteReaderU32(reader);
  const aMask = readByteReaderU32(reader);

  reader.offset = 112; // dwCaps2
  const caps2 = readByteReaderU32(reader);
  if ((caps2 & ddsCaps2Volume) !== 0 || dwDepth > 1) return null; // volume textures not modeled yet

  let format: TextureContainerFormat | null;
  let cube = (caps2 & ddsCaps2Cubemap) !== 0;
  let layers = 1;
  let dataOffset = ddsDataOffset;

  if ((pfFlags & ddsPfFourCC) !== 0 && fourCC === ddsFourCcDx10) {
    if (!hasByteReaderBytes(createByteReader(bytes, ddsDataOffset), 20)) return null;
    const dx10 = createByteReader(bytes, ddsDataOffset);
    const dxgiFormat = readByteReaderU32(dx10);
    skipByteReader(dx10, 4); // resourceDimension
    const miscFlag = readByteReaderU32(dx10);
    const arraySize = readByteReaderU32(dx10);
    format = ddsDxgiFormat[dxgiFormat] ?? null;
    cube = cube || (miscFlag & ddsDx10MiscCube) !== 0;
    layers = Math.max(1, arraySize);
    dataOffset = ddsDataOffset + 20;
  } else if ((pfFlags & ddsPfFourCC) !== 0) {
    format = ddsFourCcFormat[fourCC] ?? null;
  } else if ((pfFlags & ddsPfRgb) !== 0) {
    format = mapDdsUncompressed(rgbBitCount, rMask, gMask, bMask, aMask);
  } else {
    format = null;
  }
  if (format === null) return null;

  const width = Math.max(1, dwWidth);
  const height = Math.max(1, dwHeight);
  const faces = cube ? 6 : 1;
  const mipLevels = Math.max(1, dwMipMapCount);

  const layout = computeTextureContainerLevels(format, width, height, mipLevels, layers, faces, dataOffset);
  if (layout === null || layout.endOffset > bytes.byteLength) return null;

  return {
    depth: 1,
    faces,
    format,
    height,
    layers,
    levels: layout.levels,
    mipLevels,
    supercompression: 'None',
    width,
  };
}

function hasDdsMagic(bytes: Readonly<Uint8Array>): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x53 && bytes[3] === 0x20;
}

function mapDdsUncompressed(
  rgbBitCount: number,
  rMask: number,
  gMask: number,
  bMask: number,
  aMask: number,
): TextureContainerFormat | null {
  if (rgbBitCount !== 32) return null;
  if (rMask === 0x00ff0000 && gMask === 0x0000ff00 && bMask === 0x000000ff && aMask === 0xff000000) {
    return 'bgra8unorm';
  }
  if (rMask === 0x000000ff && gMask === 0x0000ff00 && bMask === 0x00ff0000 && aMask === 0xff000000) {
    return 'rgba8unorm';
  }
  return null;
}

// 4 (magic) + 124 (DDS_HEADER). A DX10 file adds a 20-byte DDS_HEADER_DXT10 after this.
const ddsDataOffset = 128;

const ddsCaps2Cubemap = 0x200;
const ddsCaps2Volume = 0x20_0000;
const ddsDx10MiscCube = 0x4;
const ddsFourCcDx10 = 0x3031_5844; // 'DX10'
const ddsPfFourCC = 0x4;
const ddsPfRgb = 0x40;

// DXGI_FORMAT → `TextureContainerFormat`. The BC set (with sRGB twins), 8-bit RGBA/BGRA, and the two
// standard float formats. `_TYPELESS` and unmapped codes → `null`.
const ddsDxgiFormat: Readonly<Record<number, TextureContainerFormat>> = {
  2: 'rgba32f',
  10: 'rgba16f',
  28: 'rgba8unorm',
  29: 'rgba8Srgb',
  49: 'rg8unorm',
  61: 'r8unorm',
  71: 'bc1',
  72: 'bc1Srgb',
  74: 'bc2',
  75: 'bc2Srgb',
  77: 'bc3',
  78: 'bc3Srgb',
  80: 'bc4',
  81: 'bc4Snorm',
  83: 'bc5',
  84: 'bc5Snorm',
  87: 'bgra8unorm',
  91: 'bgra8Srgb',
  95: 'bc6hUfloat',
  96: 'bc6hSfloat',
  98: 'bc7',
  99: 'bc7Srgb',
};

// DDS_PIXELFORMAT.dwFourCC → format. Includes the DXT1-5 / ATI1-2 / BC4-5 block codes and the DX9
// D3DFMT float codes (113 = A16B16G16R16F, 116 = A32B32G32R32F) some tools store in the FourCC slot.
const ddsFourCcFormat: Readonly<Record<number, TextureContainerFormat>> = {
  113: 'rgba16f',
  116: 'rgba32f',
  0x3154_5844: 'bc1', // DXT1
  0x3254_5844: 'bc2', // DXT2
  0x3354_5844: 'bc2', // DXT3
  0x3454_5844: 'bc3', // DXT4
  0x3554_5844: 'bc3', // DXT5
  0x3149_5441: 'bc4', // ATI1
  0x5534_4342: 'bc4', // BC4U
  0x5334_4342: 'bc4Snorm', // BC4S
  0x3249_5441: 'bc5', // ATI2
  0x5535_4342: 'bc5', // BC5U
  0x5335_4342: 'bc5Snorm', // BC5S
};
