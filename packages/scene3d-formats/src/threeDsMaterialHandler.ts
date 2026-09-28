import type { ThreeDsChunkHandler, ThreeDsMaterial, ThreeDsParseState } from '@flighthq/types/contract';
import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_AMBIENT,
  THREE_DS_MATERIAL_BUMP_MAP,
  THREE_DS_MATERIAL_DIFFUSE,
  THREE_DS_MATERIAL_NAME,
  THREE_DS_MATERIAL_OPACITY_MAP,
  THREE_DS_MATERIAL_SHININESS,
  THREE_DS_MATERIAL_SPECULAR,
  THREE_DS_MATERIAL_TEXTURE_FILENAME,
  THREE_DS_MATERIAL_TEXTURE_MAP,
  THREE_DS_MATERIAL_TRANSPARENCY,
  THREE_DS_PERCENT_FLOAT,
  THREE_DS_PERCENT_INT,
} from '@flighthq/types/contract';

import { parseColorChunk, readChunkEnd, readNullTerminatedString } from './threeDsParse.ts';

export const threeDsMaterialHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_MATERIAL],
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number): void {
    const material = parseThreeDsMaterial(view, offset, end);
    if (material.name.length > 0) state.materials.set(material.name, material);
  },
};

// Parses a material block (0xAFFF): walks sub-chunks for the name, the diffuse/specular/ambient color
// blocks, the shininess and transparency percentages, and the diffuse and bump texture-map filenames.
export function parseThreeDsMaterial(view: Readonly<DataView>, offset: number, end: number): ThreeDsMaterial {
  let name = '';
  let ambient: readonly [number, number, number] = [0, 0, 0];
  let bumpFilename: string | null = null;
  let diffuse: readonly [number, number, number] = [1, 1, 1];
  let opacity = 1;
  let opacityFilename: string | null = null;
  // null = absent (use the material default); a parsed value (including an explicit 0) is passed through.
  let shininess: number | null = null;
  let specular: readonly [number, number, number] = [1, 1, 1];
  let textureFilename: string | null = null;

  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_MATERIAL_NAME) {
      name = readNullTerminatedString(view, dataStart, chunkEnd);
    } else if (chunkId === THREE_DS_MATERIAL_AMBIENT) {
      ambient = parseColorChunk(view, dataStart, chunkEnd) ?? ambient;
    } else if (chunkId === THREE_DS_MATERIAL_DIFFUSE) {
      diffuse = parseColorChunk(view, dataStart, chunkEnd) ?? diffuse;
    } else if (chunkId === THREE_DS_MATERIAL_SPECULAR) {
      specular = parseColorChunk(view, dataStart, chunkEnd) ?? specular;
    } else if (chunkId === THREE_DS_MATERIAL_SHININESS) {
      // The MAT_SHININESS percentage (0..1) maps to a Blinn-Phong specular exponent; 100% → 128, a
      // conventional maximum. 3DS's shininess slider has no exact Phong-exponent equivalent.
      const fraction = parsePercentageChunk(view, dataStart, chunkEnd);
      if (fraction !== null) shininess = fraction * 128;
    } else if (chunkId === THREE_DS_MATERIAL_TRANSPARENCY) {
      // MAT_TRANSPARENCY is the transparent fraction (0 = opaque); opacity is its complement.
      const fraction = parsePercentageChunk(view, dataStart, chunkEnd);
      if (fraction !== null) opacity = 1 - fraction;
    } else if (chunkId === THREE_DS_MATERIAL_TEXTURE_MAP) {
      textureFilename = parseTextureFilename(view, dataStart, chunkEnd);
    } else if (chunkId === THREE_DS_MATERIAL_BUMP_MAP) {
      bumpFilename = parseTextureFilename(view, dataStart, chunkEnd);
    } else if (chunkId === THREE_DS_MATERIAL_OPACITY_MAP) {
      opacityFilename = parseTextureFilename(view, dataStart, chunkEnd);
    }

    cursor = chunkEnd;
  }

  return { ambient, bumpFilename, diffuse, name, opacity, opacityFilename, shininess, specular, textureFilename };
}

// Reads a percentage material sub-chunk (shininess/transparency), returning a fraction in [0,1]: an
// INT_PERCENTAGE (0x0030) uint16 in [0,100] is divided by 100; a FLOAT_PERCENTAGE (0x0031) float32 is a
// fraction already. Returns null if neither is present.
function parsePercentageChunk(view: Readonly<DataView>, offset: number, end: number): number | null {
  let cursor = offset;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_PERCENT_INT && dataStart + 2 <= chunkEnd) {
      return Math.min(1, Math.max(0, view.getUint16(dataStart, true) / 100));
    }
    if (chunkId === THREE_DS_PERCENT_FLOAT && dataStart + 4 <= chunkEnd) {
      return Math.min(1, Math.max(0, view.getFloat32(dataStart, true)));
    }

    cursor = chunkEnd;
  }
  return null;
}

// Reads a texture map block (0xA200 diffuse, 0xA230 bump, …), returning its filename sub-chunk (0xA300)
// or null.
function parseTextureFilename(view: Readonly<DataView>, offset: number, end: number): string | null {
  let cursor = offset;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    if (chunkId === THREE_DS_MATERIAL_TEXTURE_FILENAME) {
      const name = readNullTerminatedString(view, cursor + THREE_DS_CHUNK_HEADER_BYTES, chunkEnd);
      return name.length > 0 ? name : null;
    }
    cursor = chunkEnd;
  }
  return null;
}
