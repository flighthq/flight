import { MD2_HEADER_SIZE, MD2_MAGIC, MD2_VERSION } from './md2Schema.ts';

/**
 * Which content features an MD2 binary actually contains, determined from validated header counts.
 *
 * Features:
 * - `Mesh` — present when the file has triangles AND at least one frame (geometry is renderable).
 * - `Material` — present when `numSkins > 0` (skin records carry texture paths for materials).
 * - `Animation` — present when `numFrames > 1` (frame 0 is the bind pose; >1 means motion).
 *
 * Returns `null` when the file is too small, has the wrong magic/version, or has negative header
 * fields — the same sentinel `collectThreeDsChunkCounts` uses for an unreadable stream, so a caller
 * can tell "inspected, found nothing" from "could not inspect."
 *
 * Build-time only: reads only the 68-byte header. No geometry is decoded, no frames are
 * decompressed, and no skin paths are resolved.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function collectMd2Features(source: Readonly<Uint8Array>): ReadonlySet<string> | null {
  if (source.byteLength < MD2_HEADER_SIZE) return null;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);

  const magic = view.getInt32(0, true);
  if (magic !== MD2_MAGIC) return null;

  const version = view.getInt32(4, true);
  if (version !== MD2_VERSION) return null;

  const numSkins = view.getInt32(20, true);
  const numTriangles = view.getInt32(32, true);
  const numFrames = view.getInt32(40, true);

  if (numSkins < 0 || numTriangles < 0 || numFrames < 0) return null;

  const found = new Set<string>();
  if (numTriangles > 0 && numFrames > 0) found.add('Mesh');
  if (numSkins > 0) found.add('Material');
  if (numFrames > 1) found.add('Animation');
  return found;
}
