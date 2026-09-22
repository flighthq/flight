import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type {
  Awd2Block,
  Awd2BlockDispatch,
  Awd2BlockHandler,
  Awd2BlockRegistry,
  Awd2ParseState,
  Decompressor,
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  ImportDiagnostic,
  Scene3D,
  Scene3DDocument,
} from '@flighthq/types/contract';
import { CompressionFraming, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createAwd2ParseState, getAwd2BlockDispatch, getAwd2BlockHandlers } from './awd2BlockDispatch';
import {
  AWD2_BLOCK_HEADER_BYTES,
  AWD2_COMPRESSION_DEFLATE,
  AWD2_COMPRESSION_LZMA,
  AWD2_COMPRESSION_NONE,
  AWD2_FORMAT_VERSION,
  AWD2_HEADER_BYTES,
  AWD2_MAGIC_0,
  AWD2_MAGIC_1,
  AWD2_MAGIC_2,
  AWD2_NAMESPACE_CORE,
  AWD2_VERSION_MAJOR_OFFSET,
} from './awd2Schema';

// Parses an Away3D AWD 2.x binary file into a Scene3D. Convenience over
// `createScene3DFromDocument(parseAwd2(...))`. See parseAwd2 for the import model, and for why the block
// registry is the caller's to choose.
export function createScene3DFromAwd2(
  bytes: Readonly<Uint8Array>,
  registry: Readonly<Awd2BlockRegistry>,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
  diagnostics?: ImportDiagnostic[],
): Scene3D {
  return createScene3DFromDocument(parseAwd2(bytes, registry, deflate, lzma, diagnostics));
}

export function parseAwd2(
  bytes: Readonly<Uint8Array>,
  registry: Readonly<Awd2BlockRegistry>,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
  diagnostics?: ImportDiagnostic[],
): Scene3DDocument {
  const input = bytes as Uint8Array;
  if (input.byteLength < AWD2_HEADER_BYTES) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'awd2.header-too-short', 'parseAwd2');
    return emptyAwdDocument();
  }

  if (input[0] !== AWD2_MAGIC_0 || input[1] !== AWD2_MAGIC_1 || input[2] !== AWD2_MAGIC_2) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'awd2.bad-magic', 'parseAwd2');
    return emptyAwdDocument();
  }

  if (!isAwd2Version(input, diagnostics)) return emptyAwdDocument();

  // A compressed body is inflated and spliced back behind the header so the block walk below is identical
  // for compressed and uncompressed input; bails to empty when the caller supplied no codec for the
  // file's compression method.
  const rehydrated = rehydrateAwdBody(input, deflate, lzma, diagnostics);
  if (rehydrated === null) return emptyAwdDocument();

  const state = createAwd2ParseState(emptyAwdDocument(), rehydrated.source, rehydrated.view, diagnostics);
  const dispatch = getAwd2BlockDispatch(registry);
  walkAwd2Blocks(state, dispatch);
  for (const handler of getAwd2BlockHandlers(registry)) handler.build?.(state);
  return state.document;
}

// Walks the block stream twice: once for everything a handler can read immediately, once for the blocks
// whose handler declared itself deferred.
//
// A block no registered handler claims costs its header read and nothing else — AWD2 blocks are
// length-prefixed, so the walk already knows where the next one begins. That is the whole mechanism by
// which a build can read a file containing capabilities it did not link.
function walkAwd2Blocks(state: Awd2ParseState, dispatch: Awd2BlockDispatch): void {
  const { diagnostics, source, view } = state;
  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD2_HEADER_BYTES + bodyLength, source.byteLength);

  // Blocks nobody consumed, tallied by (namespace, blockType) so one diagnostic is reported per distinct
  // kind rather than one per occurrence — an unknown block type usually repeats for every object in the
  // file, and a per-block report would bury the rest of the diagnostics under thousands of lines.
  const unhandled = new Map<string, { blockType: number; count: number; firstBlockId: number; namespace: number }>();
  const deferred: { block: Awd2Block; handler: Readonly<Awd2BlockHandler> }[] = [];

  let offset = AWD2_HEADER_BYTES;
  while (offset + AWD2_BLOCK_HEADER_BYTES <= bodyEnd) {
    const blockId = view.getUint32(offset, true);
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const dataStart = offset + AWD2_BLOCK_HEADER_BYTES;

    if (dataStart + blockLength > bodyEnd) {
      // Drop: the `break` abandons every remaining block and nothing stands in for them — a file with an
      // inflated block length comes back with fewer nodes. Data absent with no substitute, so not
      // Recover; a document is still returned, so not Reject.
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.block-length-past-end', 'parseAwd2');
      break;
    }

    const handler = namespace === AWD2_NAMESPACE_CORE ? dispatch.get(blockType) : undefined;
    if (handler === undefined) {
      // A non-CORE namespace is an extension block (an exporter's own, or a vendor's), reported for the
      // same reason as an unknown CORE type but meaning something different: an unknown CORE type is a
      // gap in our coverage of the spec, an extension namespace is content we were never going to
      // understand without knowing whose it is. A CORE type a handler would have claimed had it been
      // registered lands here too, which is correct — this build genuinely does not carry it.
      tallyUnhandledAwdBlock(unhandled, namespace, blockType, blockId);
    } else {
      const block: Awd2Block = {
        blockId,
        blockType,
        dataEnd: dataStart + blockLength,
        dataStart,
        geometryWide: (blockFlags & 2) !== 0,
        matrixWide: (blockFlags & 1) !== 0,
        source,
        view,
      };
      if (handler.deferred === true) deferred.push({ block, handler });
      else handler.parse(state, block);
    }

    offset = dataStart + blockLength;
  }

  // The second pass: blocks written against data an earlier block type carries, so they could not be read
  // until the first pass finished. A skeleton pose is written against its skeleton's joint count.
  for (const entry of deferred) entry.handler.parse(state, entry.block);

  // One diagnostic per distinct unhandled (namespace, blockType), carrying the first block's id and how
  // many there were, so a reader learns both what was missed and how much of the file it accounted for.
  for (const entry of unhandled.values()) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.block-unhandled', 'parseAwd2', {
      blockType: entry.blockType,
      count: entry.count,
      firstBlockId: entry.firstBlockId,
      namespace: entry.namespace,
    });
  }
}

// Validates the header version-major byte before the block walk. An 'AWD'-magic file with a version other
// than 2 (in practice version 3 — AWD3, AwayJS's Scene3DGraph format) has an entirely different block model,
// so the AWD2 block walk would silently misparse it to an empty/garbage document. Reject it by name here
// instead, pointing at AWD3 as a recognized but not-yet-implemented future format.
function isAwd2Version(input: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): boolean {
  const versionMajor = input[AWD2_VERSION_MAJOR_OFFSET];
  if (versionMajor === AWD2_FORMAT_VERSION) return true;
  reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'awd2.unsupported-version', 'isAwd2Version', {
    version: versionMajor,
  });
  return false;
}

// The empty Scene3DDocument returned when AWD parsing fails or before assembly begins — every table present.
function emptyAwdDocument(): Scene3DDocument {
  return {
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
}

// Resolves the block-stream buffer to walk: the source unchanged for an uncompressed body, or the 12-byte
// header spliced in front of the inflated body for a compressed one — so the caller's walk is identical
// either way (compression byte rewritten to NONE, body-length field to the inflated length). Returns null
// (after recording a diagnostic) when the compression method has no registered decompressor or the codec fails.
function rehydrateAwdBody(
  input: Uint8Array,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
  diagnostics?: ImportDiagnostic[],
): { source: Uint8Array; view: DataView } | null {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const compression = input[7];
  if (compression === AWD2_COMPRESSION_NONE) return { source: input, view };

  const decompressor = resolveAwdDecompressor(compression, deflate, lzma);
  if (decompressor === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.compression-no-decompressor',
      'rehydrateAwdBody',
      { compression },
    );
    return null;
  }

  // The header's body-length field is the on-disk (compressed) length; the compressed stream is the bytes
  // from the end of the 12-byte header to there.
  const compressedEnd = Math.min(AWD2_HEADER_BYTES + view.getUint32(8, true), input.byteLength);
  // AWD declares no uncompressed length, so the codec is told 0 and decides for itself whether that
  // matters — DEFLATE grows its own buffer, LZMA reads its stream's own end marker.
  const framing = compression === AWD2_COMPRESSION_DEFLATE ? CompressionFraming.Rfc1950 : CompressionFraming.Raw;
  const inflated = decompressor(input.subarray(AWD2_HEADER_BYTES, compressedEnd), 0, framing);
  if (inflated === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.decompression-failed',
      'rehydrateAwdBody',
      { compression },
    );
    return null;
  }

  const rehydrated = new Uint8Array(AWD2_HEADER_BYTES + inflated.byteLength);
  rehydrated.set(input.subarray(0, AWD2_HEADER_BYTES), 0);
  rehydrated.set(inflated, AWD2_HEADER_BYTES);
  const rehydratedView = new DataView(rehydrated.buffer);
  rehydrated[7] = AWD2_COMPRESSION_NONE;
  rehydratedView.setUint32(8, inflated.byteLength, true);
  return { source: rehydrated, view: rehydratedView };
}

// Maps AWD's header compression byte onto the host slot that can read it. The file format numbers its
// methods; the Host names them per algorithm, so the same slot serves every container carrying it. A
// method the host cannot supply resolves to null, which the caller reports rather than guessing at.
function resolveAwdDecompressor(
  compression: number,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
): Decompressor | null {
  if (compression === AWD2_COMPRESSION_DEFLATE) return deflate?.decompress ?? null;
  return compression === AWD2_COMPRESSION_LZMA ? (lzma?.decompress ?? null) : null;
}

// Records one unhandled block against its (namespace, blockType) bucket, keeping the first block id seen.
function tallyUnhandledAwdBlock(
  tally: Map<string, { blockType: number; count: number; firstBlockId: number; namespace: number }>,
  namespace: number,
  blockType: number,
  blockId: number,
): void {
  const key = `${namespace}:${blockType}`;
  const entry = tally.get(key);
  if (entry === undefined) {
    tally.set(key, { blockType, count: 1, firstBlockId: blockId, namespace });
    return;
  }
  entry.count++;
}
