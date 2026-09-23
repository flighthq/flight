import type { HostDecompressDeflateCapability, HostDecompressLzmaCapability } from '@flighthq/types/contract';

import { parseAwd2Header } from './awd2Header';
import { rehydrateAwd2Body } from './awd2Parse';
import {
  AWD2_BLOCK_CAMERA,
  AWD2_BLOCK_CONTAINER,
  AWD2_BLOCK_HEADER_BYTES,
  AWD2_BLOCK_LIGHT,
  AWD2_BLOCK_LIGHT_PICKER,
  AWD2_BLOCK_MATERIAL,
  AWD2_BLOCK_MESH_INSTANCE,
  AWD2_BLOCK_SKELETON,
  AWD2_BLOCK_SKELETON_ANIMATION,
  AWD2_BLOCK_SKELETON_POSE,
  AWD2_BLOCK_TEXTURE,
  AWD2_BLOCK_TRIANGLE_GEOMETRY,
  AWD2_HEADER_BYTES,
  AWD2_NAMESPACE_CORE,
} from './awd2Schema';

/**
 * Walks the block stream and counts how many blocks of each core-namespace type appear, reading only
 * each block's 11-byte header. AWD2 blocks are length-prefixed, so a block of a type this build does
 * not know still costs its header and nothing else — the same property that lets the importer read a
 * file containing capabilities it did not link.
 *
 * Blocks outside the core namespace are counted under their namespace-qualified name rather than being
 * folded into a core type they do not belong to. Returns `null` when the stream is not readable.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function collectAwd2BlockCounts(
  source: Uint8Array,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
): ReadonlyMap<string, number> | null {
  if (parseAwd2Header(source, deflate, lzma) === null) return null;
  const rehydrated = rehydrateAwd2Body(source, deflate, lzma);
  if (rehydrated === null) return null;
  const data = rehydrated.source;
  const view = rehydrated.view;

  const counts = new Map<string, number>();
  let pos = AWD2_HEADER_BYTES;
  while (pos + AWD2_BLOCK_HEADER_BYTES <= data.byteLength) {
    const namespace = data[pos + 4];
    const blockType = data[pos + 5];
    const blockLength = view.getUint32(pos + 7, true);
    pos += AWD2_BLOCK_HEADER_BYTES;
    if (blockLength > data.byteLength - pos) return null;
    pos += blockLength;
    const name = getAwd2BlockName(namespace, blockType);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * The AWD2 name for a block type in the core namespace, or a stable namespace-qualified label for a
 * type this build does not name. A label rather than a drop: an unrecognized block is exactly what an
 * inventory exists to surface.
 */
export function getAwd2BlockName(namespace: number, blockType: number): string {
  if (namespace !== AWD2_NAMESPACE_CORE) return `Namespace${namespace}Block(${blockType})`;
  return AWD2_BLOCK_NAMES.get(blockType) ?? `Unknown(${blockType})`;
}

const AWD2_BLOCK_NAMES = new Map<number, string>([
  [AWD2_BLOCK_TRIANGLE_GEOMETRY, 'TriangleGeometry'],
  [AWD2_BLOCK_CONTAINER, 'Container'],
  [AWD2_BLOCK_MESH_INSTANCE, 'MeshInstance'],
  [AWD2_BLOCK_LIGHT, 'Light'],
  [AWD2_BLOCK_CAMERA, 'Camera'],
  [AWD2_BLOCK_LIGHT_PICKER, 'LightPicker'],
  [AWD2_BLOCK_MATERIAL, 'Material'],
  [AWD2_BLOCK_TEXTURE, 'Texture'],
  [AWD2_BLOCK_SKELETON, 'Skeleton'],
  [AWD2_BLOCK_SKELETON_POSE, 'SkeletonPose'],
  [AWD2_BLOCK_SKELETON_ANIMATION, 'SkeletonAnimation'],
]);
