import {
  THREE_DS_CAMERA,
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_EDITOR,
  THREE_DS_KEYFRAME,
  THREE_DS_KEYFRAME_OBJECT_NODE,
  THREE_DS_LIGHT,
  THREE_DS_LIGHT_SPOT,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_BUMP_MAP,
  THREE_DS_MATERIAL_OPACITY_MAP,
  THREE_DS_MATERIAL_TEXTURE_MAP,
  THREE_DS_OBJECT,
  THREE_DS_TRIMESH,
} from '@flighthq/types/contract';

/**
 * Walks the 3DS chunk tree and counts how many top-level feature chunks of each type appear, reading
 * only chunk headers (uint16 ID + uint32 length). Unlike AWD2's flat block stream, 3DS is a
 * recursive tree, so this walk descends into MAIN, EDITOR, and OBJECT chunks to reach the feature
 * chunks that matter (TRIMESH, MATERIAL, LIGHT, CAMERA, KEYFRAME_OBJECT_NODE).
 *
 * Returns `null` when the file is too small or its MAIN chunk is missing — the same sentinel the
 * AWD2 census uses for an unreadable stream.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function collectThreeDsChunkCounts(source: Readonly<Uint8Array>): ReadonlyMap<number, number> | null {
  if (source.byteLength < THREE_DS_CHUNK_HEADER_BYTES) return null;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const mainId = view.getUint16(0, true);
  if (mainId !== THREE_DS_MAIN) return null;

  const counts = new Map<number, number>();
  walkThreeDsChunkCensus(view, 0, counts);
  return counts;
}

/**
 * The 3DS name for a chunk type this build knows, or a stable hex label for one it does not.
 * Keyed by the uint16 chunk ID. A label rather than a drop: an unrecognized chunk is exactly what
 * an inventory exists to surface.
 */
export function getThreeDsChunkName(chunkId: number): string {
  return THREE_DS_CHUNK_NAMES.get(chunkId) ?? `Unknown(0x${chunkId.toString(16).padStart(4, '0')})`;
}

/**
 * Every feature name a 3DS census can report, which is the vocabulary `parseThreeDsRequirements` emits under
 * `document.format`.
 *
 * Derived from the name table rather than restated beside it, so adding a chunk to the census adds it here on
 * the same edit. An inventory has to be able to say what its whole vocabulary IS — otherwise a gap in it
 * returns a smaller answer that looks like a complete one, and nothing downstream can tell which features
 * were considered.
 */
export function getThreeDsFeatureNames(): readonly string[] {
  return [...THREE_DS_CHUNK_NAMES.values()];
}

function walkThreeDsChunkCensus(view: Readonly<DataView>, offset: number, counts: Map<number, number>): void {
  const chunkLength = view.getUint32(offset + 2, true);
  if (chunkLength < THREE_DS_CHUNK_HEADER_BYTES) return;
  const end = Math.min(offset + chunkLength, view.byteLength);
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const childLength = view.getUint32(cursor + 2, true);
    if (childLength < THREE_DS_CHUNK_HEADER_BYTES) break;
    const chunkEnd = cursor + childLength;
    if (chunkEnd > end) break;

    if (chunkId === THREE_DS_MAIN || chunkId === THREE_DS_EDITOR || chunkId === THREE_DS_KEYFRAME) {
      walkThreeDsChunkCensus(view, cursor, counts);
    } else if (chunkId === THREE_DS_OBJECT) {
      walkThreeDsObjectCensus(view, cursor, end, counts);
    } else if (chunkId === THREE_DS_MATERIAL) {
      counts.set(THREE_DS_MATERIAL, (counts.get(THREE_DS_MATERIAL) ?? 0) + 1);
      walkThreeDsMaterialCensus(view, cursor, chunkEnd, counts);
    } else if (chunkId === THREE_DS_KEYFRAME_OBJECT_NODE) {
      counts.set(THREE_DS_KEYFRAME_OBJECT_NODE, (counts.get(THREE_DS_KEYFRAME_OBJECT_NODE) ?? 0) + 1);
    }

    cursor = chunkEnd;
  }
}

function walkThreeDsObjectCensus(
  view: Readonly<DataView>,
  offset: number,
  parentEnd: number,
  counts: Map<number, number>,
): void {
  const chunkLength = view.getUint32(offset + 2, true);
  if (chunkLength < THREE_DS_CHUNK_HEADER_BYTES) return;
  const end = Math.min(offset + chunkLength, parentEnd);
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  // Skip the null-terminated object name.
  while (cursor < end && view.getUint8(cursor) !== 0) cursor++;
  cursor++; // past the null terminator

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const childLength = view.getUint32(cursor + 2, true);
    if (childLength < THREE_DS_CHUNK_HEADER_BYTES) break;
    const chunkEnd = cursor + childLength;
    if (chunkEnd > end) break;

    if (chunkId === THREE_DS_TRIMESH || chunkId === THREE_DS_CAMERA) {
      counts.set(chunkId, (counts.get(chunkId) ?? 0) + 1);
      return;
    }

    if (chunkId === THREE_DS_LIGHT) {
      counts.set(THREE_DS_LIGHT, (counts.get(THREE_DS_LIGHT) ?? 0) + 1);
      walkThreeDsLightCensus(view, cursor, chunkEnd, counts);
      return;
    }

    cursor = chunkEnd;
  }
}

function walkThreeDsLightCensus(
  view: Readonly<DataView>,
  offset: number,
  parentEnd: number,
  counts: Map<number, number>,
): void {
  const end = Math.min(offset + (view.getUint32(offset + 2, true) || 0), parentEnd);
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES + 12;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const childLength = view.getUint32(cursor + 2, true);
    if (childLength < THREE_DS_CHUNK_HEADER_BYTES) break;
    const chunkEnd = cursor + childLength;
    if (chunkEnd > end) break;

    if (chunkId === THREE_DS_LIGHT_SPOT) {
      counts.set(THREE_DS_LIGHT_SPOT, (counts.get(THREE_DS_LIGHT_SPOT) ?? 0) + 1);
      return;
    }

    cursor = chunkEnd;
  }
}

function walkThreeDsMaterialCensus(
  view: Readonly<DataView>,
  offset: number,
  parentEnd: number,
  counts: Map<number, number>,
): void {
  const end = Math.min(offset + (view.getUint32(offset + 2, true) || 0), parentEnd);
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const childLength = view.getUint32(cursor + 2, true);
    if (childLength < THREE_DS_CHUNK_HEADER_BYTES) break;
    const chunkEnd = cursor + childLength;
    if (chunkEnd > end) break;

    if (
      chunkId === THREE_DS_MATERIAL_TEXTURE_MAP ||
      chunkId === THREE_DS_MATERIAL_BUMP_MAP ||
      chunkId === THREE_DS_MATERIAL_OPACITY_MAP
    ) {
      counts.set(chunkId, (counts.get(chunkId) ?? 0) + 1);
    }

    cursor = chunkEnd;
  }
}

const THREE_DS_CHUNK_NAMES = new Map<number, string>([
  [THREE_DS_TRIMESH, 'Trimesh'],
  [THREE_DS_MATERIAL, 'Material'],
  [THREE_DS_MATERIAL_TEXTURE_MAP, 'MaterialTextureMap'],
  [THREE_DS_MATERIAL_OPACITY_MAP, 'MaterialOpacityMap'],
  [THREE_DS_MATERIAL_BUMP_MAP, 'MaterialBumpMap'],
  [THREE_DS_LIGHT, 'Light'],
  [THREE_DS_LIGHT_SPOT, 'LightSpot'],
  [THREE_DS_CAMERA, 'Camera'],
  [THREE_DS_KEYFRAME_OBJECT_NODE, 'KeyframeObjectNode'],
]);
