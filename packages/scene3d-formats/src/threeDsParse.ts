import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ImportDiagnostic,
  Scene3DDocument,
  ThreeDsChunkDispatch,
  ThreeDsChunkHandler,
  ThreeDsDropTally,
  ThreeDsParseState,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_COLOR_BYTE,
  THREE_DS_COLOR_FLOAT,
  THREE_DS_EDITOR,
  THREE_DS_KEYFRAME,
  THREE_DS_MAIN,
  THREE_DS_OBJECT,
} from '@flighthq/types/contract';

// Packs a 3DS sRGB-space [r,g,b] triple plus an alpha (each in [0,1]) into a 0xRRGGBBAA integer.
export function packThreeDsColor(rgb: readonly [number, number, number], alpha = 1): number {
  const r = Math.round(Math.min(1, Math.max(0, rgb[0])) * 0xff);
  const g = Math.round(Math.min(1, Math.max(0, rgb[1])) * 0xff);
  const b = Math.round(Math.min(1, Math.max(0, rgb[2])) * 0xff);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 0xff);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

// Reads the nested color sub-chunk of a material color block: COLOR_FLOAT (0x0010, 3 float32 in [0,1])
// or COLOR_BYTE (0x0011, 3 uint8 in [0,255], normalized). Returns [r,g,b] in [0,1], or null if absent.
export function parseColorChunk(
  view: Readonly<DataView>,
  offset: number,
  end: number,
): readonly [number, number, number] | null {
  let cursor = offset;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_COLOR_FLOAT && dataStart + 12 <= chunkEnd) {
      return [
        view.getFloat32(dataStart, true),
        view.getFloat32(dataStart + 4, true),
        view.getFloat32(dataStart + 8, true),
      ];
    }
    if (chunkId === THREE_DS_COLOR_BYTE && dataStart + 3 <= chunkEnd) {
      return [view.getUint8(dataStart) / 255, view.getUint8(dataStart + 1) / 255, view.getUint8(dataStart + 2) / 255];
    }

    cursor = chunkEnd;
  }
  return null;
}

/**
 * Parses a 3DS file with an explicit chunk dispatch — the seam `parse3ds` supplies a default for.
 *
 * ★ WHY THE DEFAULT LIVES SOMEWHERE ELSE. The handlers import shared primitives from this file, so a
 * default family resolved here would close a cycle: parser to registry to handlers and back. Vitest
 * tolerates that cycle and Node does not — it throws "Cannot access 'threeDsCameraHandler' before
 * initialization" — so the tests would have kept passing while every Node consumer broke. Taking the
 * dispatch as a parameter keeps this module free of the handler graph entirely, and `threeDsDocument.ts`
 * owns the one edge that needs the registry.
 */
export function parseThreeDsDocumentWithDispatch(
  bytes: Readonly<Uint8Array>,
  diagnostics: ImportDiagnostic[] | undefined,
  dispatch: ThreeDsChunkDispatch,
): Scene3DDocument {
  const document: Scene3DDocument = {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };

  if (bytes.byteLength < THREE_DS_CHUNK_HEADER_BYTES) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, '3ds.input-too-small', 'parse3ds');
    return document;
  }

  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);

  const mainId = view.getUint16(0, true);
  if (mainId !== THREE_DS_MAIN) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, '3ds.wrong-main-chunk', 'parse3ds', {
      foundId: mainId,
    });
    return document;
  }

  // The material table (0xAFFF chunks) and the meshes are siblings under the editor chunk, and a mesh
  // references its materials by name via FACE_MATERIAL — so collect the whole table first, then
  // resolve each mesh's referenced names against it.
  const threeDsDrops = diagnostics ? new Map<string, ThreeDsDropTally>() : null;
  const state: ThreeDsParseState = {
    cameras: [],
    diagnostics,
    document,
    drops: threeDsDrops,
    lights: [],
    materials: new Map(),
    meshes: [],
    pivots: new Map(),
  };
  // ★ ONE WALK, ONE DISPATCH. The feature branches used to be hard-coded at two levels — materials under
  // the editor chunk, mesh/light/camera inside a named object — with the keyframer walked separately for
  // pivots. A handler now claims each of those chunk ids, so the walk consults one map and a family that
  // omits a handler genuinely never reaches that parser: the code behind the feature is unreferenced
  // rather than merely unused.
  walkThreeDsChunks(view, 0, state, dispatch);

  // Build phase: each handler assembles its collected data into the document. The walk populated the
  // state's collectors; now handlers that have a build step resolve cross-family references (material
  // names, keyframe pivots) and emit document entries. Handlers without a build step (material,
  // keyframe) contributed their data to the state during collect, and it is consumed by the handlers
  // that do build (mesh uses materials and pivots).
  const built = new Set<Readonly<ThreeDsChunkHandler>>();
  for (const handler of dispatch.values()) {
    if (!built.has(handler) && handler.build !== undefined) {
      built.add(handler);
      handler.build(state);
    }
  }

  // parse3ds is the single physical emitter for every aggregated crumb (hence the origin); the tallies
  // store no origin. Flush once so per-chunk faults collapse to one crumb per kind/discriminator + count.
  if (threeDsDrops !== null) {
    for (const tally of threeDsDrops.values()) {
      reportImportDiagnostic(diagnostics, tally.severity, tally.kind, 'parse3ds', {
        ...tally.detail,
        count: tally.count,
      });
    }
  }

  return document;
}

// Resolves the end of the chunk whose header starts at `cursor`, or -1 when that chunk cannot be
// walked: a declared length shorter than the header itself, or one that overruns the enclosing region.
//
// The short-length half is what makes a walk TERMINATE. Every chunk loop advances by
// `cursor = chunkEnd`, so a declared length of 0 puts the end back at the cursor and the loop spins
// forever — and the trigger is not adversarial, it is zero padding inside a parent whose declared
// length still covers it. Bounding the advance here, at the one place every walk derives it, is what
// makes a non-terminating walk unrepresentable rather than an invariant eight loops must each
// remember; five of them did and three did not.
export function readChunkEnd(view: Readonly<DataView>, cursor: number, end: number): number {
  const chunkLength = readChunkLength(view, cursor);
  if (chunkLength < THREE_DS_CHUNK_HEADER_BYTES) return -1;
  const chunkEnd = cursor + chunkLength;
  return chunkEnd > end ? -1 : chunkEnd;
}

export function readChunkLength(view: Readonly<DataView>, offset: number): number {
  return view.getUint32(offset + 2, true);
}

// Reads a null-terminated ASCII string starting at `offset`, stopping at the first null byte or at
// `end` (whichever comes first).
export function readNullTerminatedString(view: Readonly<DataView>, offset: number, end: number): string {
  const chars: string[] = [];
  let cursor = offset;
  while (cursor < end) {
    const byte = view.getUint8(cursor);
    if (byte === 0) break;
    chars.push(String.fromCharCode(byte));
    cursor++;
  }
  return chars.join('');
}

// Records one offender against its (kind, discriminator) tally — the aggregate-once alternative to a
// per-chunk/per-mesh `reportImportDiagnostic` while walking the recursive chunk tree. No-op (never
// allocates) when no collector is engaged. `firstDetail` is kept from the FIRST offender; later ones only
// bump the count. The discriminator is the categorical sub-reason (never an instance name), so faults of
// the same kind across many meshes collapse to one crumb.
export function tallyThreeDsDrop(
  tallies: Map<string, ThreeDsDropTally> | null,
  severity: ImportDiagnosticSeverity,
  kind: string,
  discriminator: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  if (tallies === null) return;
  const key = `${kind}|${discriminator}`;
  const existing = tallies.get(key);
  if (existing === undefined) tallies.set(key, { count: 1, detail: firstDetail, kind, severity });
  else existing.count++;
}

/**
 * Walks a container chunk, handing each chunk it recognizes to the family's handler.
 *
 * ★ THE GUARDS LIVE HERE, ONCE. Every bound — the parent's end, a child claiming more bytes than its
 * parent holds, the header that must fit before a chunk can be read at all — is checked in this loop and
 * in `walkThreeDsObject`, never inside a handler. A handler that had to re-derive its own end would be a
 * second place for an off-by-one to live, and a caller's own handler would have to get it right too.
 * Handlers receive an offset and an end they can trust.
 *
 * Containers recurse; a named object defers to `walkThreeDsObject` because its children are read relative
 * to a name the object itself carries. The keyframer is a container like the others now: its pivots reach
 * the state through the keyframe handler rather than through a second walk from the root.
 */
function walkThreeDsChunks(
  view: Readonly<DataView>,
  offset: number,
  state: ThreeDsParseState,
  dispatch: ThreeDsChunkDispatch,
): void {
  const end = Math.min(offset + readChunkLength(view, offset), view.byteLength);
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkLength = readChunkLength(view, cursor);
    const chunkEnd = readChunkEnd(view, cursor, end);

    if (chunkEnd < 0) {
      tallyThreeDsDrop(state.drops, ImportDiagnosticSeverity.Recover, '3ds.chunk-exceeds-parent', '', {
        firstChunkId: chunkId,
        firstLength: chunkLength,
        firstOffset: cursor,
      });
      break;
    }

    const handler = dispatch.get(chunkId);
    if (handler !== undefined) {
      handler.collect(state, view, cursor, chunkEnd, '');
    } else if (chunkId === THREE_DS_EDITOR || chunkId === THREE_DS_MAIN || chunkId === THREE_DS_KEYFRAME) {
      walkThreeDsChunks(view, cursor, state, dispatch);
    } else if (chunkId === THREE_DS_OBJECT) {
      walkThreeDsObject(view, cursor, chunkEnd, state, dispatch);
    }

    cursor = chunkEnd;
  }
}

/**
 * Walks a named object chunk (0x4000): a null-terminated name, then the sub-chunks that decide what the
 * object IS.
 *
 * The first recognized entity sub-chunk decides and the walk stops, which is the behaviour the hard-coded
 * version had — a 3DS object carries exactly one of trimesh, light or camera, and scanning past the one
 * it found would at best waste work and at worst let a malformed sibling overwrite it.
 *
 * An object carrying no recognized sub-chunk is a dummy or helper — a pivot, a target point, a group —
 * which Flight models as nothing and reports as recognized-and-skipped. Note this also fires when a
 * caller OMITS the handler for the entity the object actually carries: from the walk's point of view an
 * unclaimed chunk id and an unmodelled one are the same thing, and the diagnostic says what happened.
 */
function walkThreeDsObject(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  state: ThreeDsParseState,
  dispatch: ThreeDsChunkDispatch,
): void {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  const name = readNullTerminatedString(view, cursor, end);
  cursor += name.length + 1;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);

    if (chunkEnd < 0) {
      tallyThreeDsDrop(state.drops, ImportDiagnosticSeverity.Recover, '3ds.subchunk-exceeds-object', '', {
        firstOffset: cursor,
      });
      return;
    }

    const handler = dispatch.get(chunkId);
    if (handler !== undefined) {
      handler.collect(state, view, cursor, chunkEnd, name);
      return;
    }

    cursor = chunkEnd;
  }

  tallyThreeDsDrop(state.drops, ImportDiagnosticSeverity.Skip, '3ds.non-entity-object', '', { firstName: name });
}
