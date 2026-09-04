import { createColorScaleBiasAdjustment } from '@flighthq/adjustments/contract';
import { createAudioResource, createEmbeddedAudioResourceReference } from '@flighthq/audio/contract';
import { createClipRegionFromContours, createClipRegionFromPath } from '@flighthq/clip/contract';
import { getDecompressor } from '@flighthq/compression/contract';
import { createEntity } from '@flighthq/entity/contract';
import { createMatrix, inverseMatrix, matrixTransformPointXY, multiplyMatrix } from '@flighthq/geometry/contract';
import { createEmbeddedImageResourceReference } from '@flighthq/image/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { addMovieClipFrameScript, createMovieClip, setMovieClipSource } from '@flighthq/movieclip/contract';
import {
  addNodeChild,
  addNodeOrderListEntry,
  applyNodeOrderList,
  clearNodeOrderList,
  createNodeOrderList,
  getNodeRuntime,
  invalidateNodeAppearance,
  invalidateNodeLocalBounds,
  removeNodeChild,
  setNodeColorAdjustments,
  setNodeLocalMatrix,
} from '@flighthq/node/contract';
import {
  createScene2DDocument,
  createScene2DSlotReference,
  registerScene2DDocumentImporter,
} from '@flighthq/scene2d-resources/contract';
import { createDisplayObject, createSprite, setNode2DClip } from '@flighthq/scene2d/contract';
import {
  copyShapeCommands,
  createScale9Shape,
  createShape,
  getShapeFillRegions,
  setMorphShapeProgress,
} from '@flighthq/shape/contract';
import { createSampler, createTexture } from '@flighthq/texture/contract';
import type {
  Adjustment,
  AudioResource,
  AudioResourceReference,
  BoundsNodeAny,
  ClipRegion,
  EmbeddedImageResourceReference,
  EntityWithoutRuntime,
  FrameScript,
  GlyphOutlineSource,
  ImageResourceReference,
  ImportDiagnostic,
  MorphShape,
  MovieClip,
  MovieClipData,
  Node2D,
  NodeData,
  Node2DData,
  Node2DRuntime,
  Node2DTraits,
  Rectangle,
  RenderEffect,
  RichText,
  Scene2DDocument,
  Scene2DDocumentImportContext,
  Scene2DDocumentImporterRegistry,
  Scene2DSlotReference,
  SwfDocumentImport,
  SwfJpegAlphaPayload,
  SwfNodeAppearance,
  Scale9Shape,
  Shape,
  ShapeData,
  TimelineAudioCue,
  TimelineAudioEnvelopePoint,
  TimelineCue,
  TimelineStreamAudioCue,
  Sprite,
  Texture2D,
  TimelineLabel,
  TimelineSource,
} from '@flighthq/types/contract';
import {
  AdvancedBlendMode,
  BlendMode,
  Compression,
  CompressionFraming,
  ImportDiagnosticSeverity,
  MorphShapeKind,
  TimelineAudioCueKind,
  TimelineStreamAudioCueKind,
} from '@flighthq/types/contract';

import { readSwfEditTextFactory } from './swfEditText';
import { readSwfFilterList } from './swfFilter';
import { readSwfAbcFrameScripts, readSwfFrameActions } from './swfFrameAction';
import { SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE } from './swfImageDecoder';
import { createSwfMorphShape } from './swfMorphShape';
import { SwfReader } from './swfReader';
import { createSwfShape } from './swfShape';
import { createSwfTextShape, readSwfFontGlyphOutlineSource } from './swfText';

// Recovers every embedded DefineFont/2/3 as the generic, glyph-index-keyed outline seam. The map key
// is the SWF character id used by DefineText and DefineEditText. This is a separate parse entry from
// Scene2D construction so callers that only need embedded fonts do not have to retain a document.
export function createGlyphOutlineSourcesFromSwf(
  source: Uint8Array,
  diagnostics?: ImportDiagnostic[],
): ReadonlyMap<number, GlyphOutlineSource> | null {
  const file = readSwfFile(source, diagnostics);
  return file === null ? null : new Map(file.parsed.fontOutlineSources);
}

// The document alone, for a caller that wants the graph and nothing else — the importer registry among
// them. A file whose placements carry an advanced blend or a filter list still imports fully here; what
// it loses is the report of them, which is what createScene2DImportFromSwf returns.
export function createScene2DFromSwf(source: Uint8Array, diagnostics?: ImportDiagnostic[]): Scene2DDocument | null {
  return createScene2DImportFromSwf(source, diagnostics)?.document ?? null;
}

// The full import: the document, plus the placement appearance no node can carry. SWF puts a blend mode
// and a filter list on the same record as the matrix, and Flight expresses neither on a node — an
// advanced blend needs a BlendEffect and an effect is a descriptor a caller runs explicitly, since
// `displayObject.filters` is an anti-goal. Both therefore travel beside the document instead of being
// dropped at the seam or silently flattened onto a node.
export function createScene2DImportFromSwf(
  source: Uint8Array,
  diagnostics?: ImportDiagnostic[],
): SwfDocumentImport | null {
  const file = readSwfFile(source, diagnostics);
  if (file === null) return null;
  const { frameRate, parsed, stageBounds } = file;

  const slots: Scene2DSlotReference[] = [];
  const instantiation: SwfInstantiationState = {
    activeSymbols: new Set<number>(),
    appearances: [],
    diagnostics,
    frameRate: frameRate > 0 ? frameRate : null,
    resolvingBounds: new Set<number>(),
    resolvedBounds: new Map<number, SwfRectangle | null>(),
  };
  const root = createSwfTimelineNode(parsed.timeline, stageBounds, parsed, slots, instantiation, 0);
  if (root === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.timeline-instantiation-failed',
      'createScene2DImportFromSwf',
    );
    return null;
  }
  const imageResources = createSwfImageResources(parsed);

  return createEntity({
    appearances: instantiation.appearances,
    document: createScene2DDocument(
      root,
      slots,
      'swf',
      parsed.backgroundColor,
      imageResources.resources,
      createSwfAudioResources(parsed),
    ),
    jpegAlphaPayloads: createSwfJpegAlphaPayloads(parsed, imageResources.references),
  });
}

// Instantiates a symbol the file exported by linkage name but never placed on a timeline. A library
// symbol is content the authoring tool published for code to create — OpenFL's `new Layout()` — so a
// document built only from placements has nothing to show for it, which is why this is a separate entry
// rather than something the root carries. Each call builds a fresh instance, because a symbol is a
// template rather than a shared node.
//
// A symbol carries the same two resolve contracts a whole file does — named slots to fill and image
// bytes to decode — so it comes back as a document rooted at the symbol rather than as a bare node.
// Anything less would hand back artwork whose bitmaps could never be paired with their pixels, since
// each call parses afresh and its Textures are its own. `backgroundColor` stays null: the stage colour
// belongs to the stage, and a symbol instantiated into someone else's scene is not it.
export function createScene2DSymbolFromSwf(
  source: Uint8Array,
  linkageName: string,
  diagnostics?: ImportDiagnostic[],
): Scene2DDocument | null {
  const file = readSwfFile(source, diagnostics);
  if (file === null) return null;
  const { frameRate, parsed } = file;

  let characterId = -1;
  for (const [id, name] of parsed.linkages) {
    if (name === linkageName) characterId = id;
  }
  // A linkage name nothing exports is the caller naming a symbol this file does not have — worth telling
  // them apart from a file that failed to parse, since both come back null.
  if (characterId < 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.unknown-linkage-name',
      'createScene2DSymbolFromSwf',
      {
        linkageName,
      },
    );
    return null;
  }

  const slots: Scene2DSlotReference[] = [];
  const instantiation: SwfInstantiationState = {
    activeSymbols: new Set<number>(),
    appearances: [],
    diagnostics,
    frameRate: frameRate > 0 ? frameRate : null,
    resolvingBounds: new Set<number>(),
    resolvedBounds: new Map<number, SwfRectangle | null>(),
  };
  const root = createSwfSymbolNode(parsed, characterId, slots, instantiation);
  if (root === null) return null;

  return createScene2DDocument(
    root,
    slots,
    'swf',
    null,
    createSwfImageResources(parsed).resources,
    createSwfAudioResources(parsed),
  );
}

// Every linkage name the file exported, whether or not the symbol was ever placed. Pair with
// `createScene2DSymbolFromSwf` to instantiate one.
export function readSwfExportedSymbolNames(source: Uint8Array): string[] {
  const file = readSwfFile(source);
  return file === null ? [] : [...file.parsed.linkages.values()];
}

export function registerSwfScene2DDocumentImporter(registry: Scene2DDocumentImporterRegistry): void {
  registerScene2DDocumentImporter(registry, 'swf', matchesSwfDocument, (source) => createScene2DFromSwf(source));
}

interface SwfMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

interface SwfRectangle {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface SwfAuthoredBoundsData extends NodeData {
  authoredBounds: SwfRectangle;
}

// A morph carries both endpoints' boxes so its authored bounds can be the box it actually occupies at the
// current ratio. The union of the two would be correct for neither endpoint: a morph at rest would report
// room for the shape it is not yet.
interface SwfMorphBoundsData extends SwfAuthoredBoundsData {
  morphEndBounds: SwfRectangle;
  morphStartBounds: SwfRectangle;
}

interface SwfDisplayObjectData extends Node2DData, SwfAuthoredBoundsData {}

interface SwfMovieClipData extends MovieClipData, SwfAuthoredBoundsData {}

interface SwfShapeNodeData extends ShapeData, SwfAuthoredBoundsData {}

// One CXFORM, already split into the two homes a node gives it. See readSwfColorTransform.
interface SwfColorTransform {
  alpha: number;
  colorAdjustments: readonly Adjustment[] | null;
}

interface SwfPlacement {
  // The record's blend mode when it is destination-reading or non-separable, which no node can carry.
  // It rides out on the import's appearance report instead; null when the mode folded onto the node.
  advancedBlendMode: AdvancedBlendMode | null;
  // The colour transform's alpha multiplier, which is what a fade animates.
  alpha: number;
  // The fixed-function blend the node carries. An advanced mode leaves this Normal, so a node never
  // silently renders as ordinary alpha compositing while claiming the authored mode.
  blendMode: BlendMode;
  // The rest of the colour transform, as the pointwise adjustment stack a node carries, or null when the
  // record tints nothing. Built once at parse and shared by every frame that keeps the placement, so
  // constructFrame compares one reference rather than rebuilding a descriptor per frame.
  colorAdjustments: readonly Adjustment[] | null;
  // Kept separate from filterAdjustments so a move can replace either authored channel without
  // retaining or dropping the other before they are joined for the node.
  colorTransformAdjustments: readonly Adjustment[] | null;
  characterId: number;
  // The depth this placement masks up to, inclusive, or 0 when it is ordinary content. A masking
  // placement is never drawn itself: it contributes its shape as the clip on everything it covers.
  clipDepth: number;
  depth: number;
  directLinkage: string | null;
  // The record's filter list as spatial effect descriptors, in authored order. Reported, never attached.
  effects: readonly RenderEffect[];
  // The pointwise members of the record's filter list. A declared list replaces this channel, including
  // when it is empty; silence on a move inherits it.
  filterAdjustments: readonly Adjustment[];
  matrix: SwfMatrix;
  name: string | null;
  // A morph shape's progress, 0..1. SWF stores it as a 16-bit ratio on the placement rather than on the
  // definition, so one morph character shows a different shape at every depth and frame that places it.
  ratio: number;
}

// One SWF timeline: the full display list of every frame it shows, in ShowFrame order, plus the frame
// labels declared against those frames. Frames are complete snapshots rather than the authored deltas, so
// a seek to any frame is a plain lookup and never has to replay the frames before it.
interface SwfTimeline {
  // Recognized timeline commands, keyed by the frame that carries them. Only blocks made entirely of
  // playback commands appear here; see readSwfFrameActions.
  actions: Map<number, FrameScript>;
  // Edge-triggered cues the frames authored, in tag order. A sound trigger is not frame content — it is
  // something entering the frame *does* — so it rides here rather than in the display list.
  cues: TimelineCue[];
  frames: Map<number, SwfPlacement>[];
  labels: TimelineLabel[];
}

// One drawn placement of a frame, with the clip its mask imposes on it, or null when nothing masks it.
interface SwfFrameEntry {
  clip: ClipRegion | null;
  placement: Readonly<SwfPlacement>;
}

// An image definition's encoded payload, held as a view over the source. Nothing here is decoded at
// import: the bytes ride out on an asset reference for the resolve step to decode, which may be
// asynchronous and which a caller that does not need pixels never runs.
interface SwfImagePayload {
  bytes: Uint8Array;
  mimeType: string;
}

// The container facts retained beside one JPEG colour stream. The public record is completed only after
// image resources exist, so a placed character and this report share the exact same reference object.
interface SwfJpegAlphaSource {
  characterId: number;
  compressedAlphaBytes: Uint8Array;
  deblockingParameterRaw: number | null;
  height: number;
  width: number;
}

// The bounded header of one video character. Stage A retains enough identity to materialize the display
// leaf honestly; the timeline-indexed VideoFrame packets remain unsupported and are not retained here.
interface SwfVideoDefinition {
  codecId: number;
  deblocking: number;
  frameCount: number;
  height: number;
  smoothing: boolean;
  width: number;
}

// One trigger's SOUNDINFO, with positions still in the samples the format counted.
interface SwfSoundInfo {
  envelope: TimelineAudioEnvelopePoint[];
  inPointSamples: number;
  loopCount: number;
  // -1 when the trigger declared none, which is not the same as an out point at sample zero.
  outPointSamples: number;
  skipIfPlaying: boolean;
  stop: boolean;
}

// One event sound's encoded payload. `mimeType` is null for a SWF-only format (ADPCM, Nellymoser, raw
// PCM), which is what tells a resolver it needs a decoder the platform does not already have.
interface SwfSoundPayload {
  bytes: Uint8Array;
  mimeType: string | null;
  // The sound's own sample rate. A cue's offset and duration are counted in these samples, and the MIME
  // type cannot carry it back for MP3, whose type names no parameters.
  sampleRate: number;
}

interface SwfTagResult {
  backgroundColor: number | null;
  editTexts: Map<number, (resolveFontName: (fontId: number) => string) => RichText>;
  fontNames: Map<number, string>;
  characterBounds: Map<number, SwfRectangle>;
  fontOutlineSources: Map<number, GlyphOutlineSource>;
  images: Map<number, SwfImagePayload>;
  imageTextures: Map<number, Map<string, Texture2D>>;
  jpegAlphaPayloads: Map<number, SwfJpegAlphaSource>;
  linkages: Map<number, string>;
  // One decoded Shape per shape character, drawn once and copied into each placement of it.
  morphBounds: Map<number, { end: SwfRectangle; start: SwfRectangle }>;
  morphShapes: Map<number, () => MorphShape | null>;
  // The nine-slice splitter a DefineScalingGrid names, keyed by the sprite character it applies to.
  scalingGrids: Map<number, SwfRectangle>;
  shapes: Map<number, Shape>;
  // The AudioResource each sound character's cues and document reference share.
  soundResources: Map<number, AudioResource>;
  sounds: Map<number, SwfSoundPayload>;
  streamSounds: { bytes: Uint8Array; mimeType: string; resource: AudioResource }[];
  sprites: Map<number, SwfTimeline>;
  timeline: SwfTimeline;
  videoTextures: Map<number, Texture2D>;
  videos: Map<number, SwfVideoDefinition>;
}

// A static text definition, held until every font in the file is known. Text records address glyphs by
// index into a font that may be defined after them, so composition waits for the whole tag walk.
interface SwfPendingText {
  characterId: number;
  end: number;
  start: number;
  version: number;
}

interface SwfParseState {
  backgroundColor: number | null;
  characterBounds: Map<number, SwfRectangle>;
  definedCharacters: Set<number>;
  // The caller's diagnostic sink, or undefined when nobody engaged a collector. Threading it on the
  // parse state rather than through every reader's signature keeps the no-collector path free: the
  // reporting seam is one undefined check and builds nothing.
  diagnostics: ImportDiagnostic[] | undefined;
  fontCodePoints: Map<number, number[]>;
  fontOutlineSources: Map<number, GlyphOutlineSource>;
  images: Map<number, SwfImagePayload>;
  imageTextures: Map<number, Map<string, Texture2D>>;
  jpegAlphaPayloads: Map<number, SwfJpegAlphaSource>;
  // The shared JPEG encoding tables a legacy DefineBits image is missing, held until one needs them.
  jpegTables: Uint8Array | null;
  linkages: Map<number, string>;
  pendingTexts: SwfPendingText[];
  // Init actions name the sprite they belong to, which may be defined after them.
  pendingInitActions: { characterId: number; script: FrameScript }[];
  // Every DoABC payload in the file, held until the whole thing is walked: a class binds to a character
  // through SymbolClass, which may be read after the script that declares its frame scripts.
  // The named flag is retained so a blob that yields nothing can name which of the two DoABC forms it
  // came from: the two are separate capabilities and a diagnostic that cannot tell them apart is not a
  // join key.
  abcBlobs: { bytes: Uint8Array; named: boolean }[];
  // A field's node factory per DefineEditText character, and the family name of each embedded font, so a
  // field declared before its font tag still resolves the family.
  editTexts: Map<number, (resolveFontName: (fontId: number) => string) => RichText>;
  fontNames: Map<number, string>;
  // Frames are retained as whole display lists, so a file can multiply a display list it placed once by
  // every ShowFrame that follows. This budget is what the whole document has left to spend on those
  // snapshots, shared across the root timeline and every sprite in it.
  remainingFrameEntries: number;
  morphBounds: Map<number, { end: SwfRectangle; start: SwfRectangle }>;
  morphShapes: Map<number, () => MorphShape | null>;
  scalingGrids: Map<number, SwfRectangle>;
  shapes: Map<number, Shape>;
  // Every stream sound the file interleaved with a timeline's frames, each already concatenated into one
  // payload. A stream belongs to the timeline that carried its blocks rather than to a character, so it
  // has no id to be keyed by.
  streamSounds: { bytes: Uint8Array; mimeType: string; resource: AudioResource }[];
  // Cues that named their sound by class, held until SymbolClass says which character that class is.
  soundCuesAwaitingClass: { className: string; cue: TimelineAudioCue }[];
  // Cues whose offset and duration are still counted in samples, held until the sound they name is read.
  // A trigger may precede its DefineSound, so the conversion cannot happen where the cue is built.
  soundCuesAwaitingRate: { characterId: number; cue: TimelineAudioCue }[];
  // One AudioResource per sound character, shared by every cue that names it and by the document's
  // reference. Acquired on demand because a trigger can name a sound defined later in the tag stream.
  soundResources: Map<number, AudioResource>;
  sounds: Map<number, SwfSoundPayload>;
  sprites: Map<number, SwfTimeline>;
  // Created only when a video character is placed or exported. A character's placements share the
  // sourceless Texture that a later payload implementation can fill without changing the node kind.
  videoTextures: Map<number, Texture2D>;
  videos: Map<number, SwfVideoDefinition>;
}

interface SwfInstantiationState {
  activeSymbols: Set<number>;
  // Every placement appearance no node can carry, filled as the timelines instantiate. It rides here
  // rather than through each call because it is per-import state exactly as the rest of this is.
  appearances: SwfNodeAppearance[];
  // The same sink the parse carried, so instantiation-time losses report through one channel.
  diagnostics: ImportDiagnostic[] | undefined;
  frameRate: number | null;
  resolvedBounds: Map<number, SwfRectangle | null>;
  resolvingBounds: Set<number>;
}

// The half of the parse/result state acquireSwfImageTexture needs, so it serves the tag walk (shape fills)
// and the instantiation walk (placed bitmaps) without either state knowing about the other.
interface SwfImageTextureOwner {
  imageTextures: Map<number, Map<string, Texture2D>>;
}

interface SwfFile {
  frameRate: number;
  parsed: SwfTagResult;
  stageBounds: SwfRectangle;
}

function readSwfFile(source: Uint8Array, diagnostics?: ImportDiagnostic[]): SwfFile | null {
  const uncompressed = uncompressSwfSource(source, diagnostics);
  if (uncompressed === null) return null;

  // Every rejection below loses the WHOLE document, and each has a distinct cause. Without a report per
  // cause the caller receives one null from `createScene2DFromSwf` and cannot tell an unregistered
  // decompressor — which IS reported, upstream — from a truncated header, which was not.
  const header = new SwfReader(uncompressed, 0, uncompressed.length);
  const signature = header.readUint8();
  if (signature !== FWS_SIGNATURE || header.readUint8() !== W_SIGNATURE || header.readUint8() !== S_SIGNATURE) {
    // Distinct from the container's `swf.invalid-signature`: that one reads the ORIGINAL bytes, this one
    // reads the decompressed body, whose header the decompressor rewrote. NOTHING CAN REACH THIS TODAY —
    // an FWS container is returned unchanged and every compressed path writes `FWS_SIGNATURE` into byte 0,
    // while bytes 1 and 2 were validated before either. The report stays because unreachable-by-
    // construction is a property of today's two container paths, not of the format: a third path, or a
    // decompressor that stops rewriting the header, makes it reachable, and silence would return with it.
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.uncompressed-signature-invalid',
      'readSwfFile',
    );
    return null;
  }

  const version = header.readUint8();
  const fileLength = header.readUint32();
  if (!header.valid || version === 0 || fileLength < MIN_SWF_LENGTH || fileLength > uncompressed.length) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'swf.header-fields-invalid', 'readSwfFile', {
      declaredLength: fileLength,
      available: uncompressed.length,
      version,
    });
    return null;
  }

  const body = new SwfReader(uncompressed, SWF_PREFIX_LENGTH, fileLength);
  const stageBounds = readSwfRectangle(body);
  if (stageBounds === null) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'swf.stage-bounds-unreadable', 'readSwfFile');
    return null;
  }
  // Header FrameRate is 8.8 fixed and governs every timeline in the file; the authored FrameCount that
  // follows it is advisory, so the real root frame count comes from the ShowFrame tags themselves.
  const frameRate = body.readUint16() / FIXED_8_8_ONE;
  body.readUint16();
  if (!body.valid) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'swf.header-truncated', 'readSwfFile');
    return null;
  }

  const parsed = readSwfTags(body, diagnostics);
  return parsed === null ? null : { frameRate, parsed, stageBounds };
}

// Presents any container form as the uncompressed bytes the rest of the importer reads. `FWS` is already
// that and is returned as-is, with no copy. `CWS` and `ZWS` compress everything after the 8-byte header,
// so the body is inflated through the registered decompressor and spliced back behind a header rewritten
// to `FWS` — the declared length already counts uncompressed bytes, so it carries over untouched.
// Compression the caller has not registered a decompressor for is reported as the document's null
// sentinel, exactly like a malformed file: the bytes are unreadable either way.
function uncompressSwfSource(source: Uint8Array, diagnostics: ImportDiagnostic[] | undefined): Uint8Array | null {
  if (source.length < SWF_PREFIX_LENGTH || source[1] !== W_SIGNATURE || source[2] !== S_SIGNATURE) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.invalid-signature',
      'uncompressSwfSource',
      {
        length: source.length,
      },
    );
    return null;
  }
  const signature = source[0];
  if (signature === FWS_SIGNATURE) return source;

  const compression =
    signature === CWS_SIGNATURE ? Compression.Deflate : signature === ZWS_SIGNATURE ? Compression.Lzma : null;
  if (compression === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.unknown-container',
      'uncompressSwfSource',
      {
        signature,
      },
    );
    return null;
  }
  const decompress = getDecompressor(compression);
  // Distinct from a malformed body on purpose. Both return the same null sentinel, but a caller that
  // never registered a decompressor has a file it could read after one registration, while a corrupt
  // stream is unreadable however the caller is configured — and only the crumb can tell them apart.
  if (decompress === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.no-decompressor-registered',
      'uncompressSwfSource',
      { compression },
    );
    return null;
  }

  const header = new SwfReader(source, 0, SWF_PREFIX_LENGTH);
  header.readUint32();
  const fileLength = header.readUint32();
  if (fileLength < MIN_SWF_LENGTH) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.declared-length-too-small',
      'uncompressSwfSource',
      {
        fileLength,
      },
    );
    return null;
  }

  // LZMA puts a compressed length and the 5 property bytes between the header and its stream; zlib starts
  // its stream immediately. Either way the decompressor receives the stream itself.
  const bodyLength = fileLength - SWF_PREFIX_LENGTH;
  const streamStart = compression === Compression.Lzma ? SWF_LZMA_PREFIX_LENGTH : SWF_PREFIX_LENGTH;
  if (streamStart > source.length) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.truncated-container',
      'uncompressSwfSource',
      {
        length: source.length,
        streamStart,
      },
    );
    return null;
  }
  const framing = compression === Compression.Deflate ? CompressionFraming.Rfc1950 : CompressionFraming.Raw;
  const body = decompress(source.subarray(streamStart), bodyLength, framing);
  if (body === null || body.length < bodyLength) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'swf.decompression-failed',
      'uncompressSwfSource',
      {
        compression,
        expected: bodyLength,
        received: body === null ? -1 : body.length,
      },
    );
    return null;
  }

  const uncompressed = new Uint8Array(SWF_PREFIX_LENGTH + bodyLength);
  uncompressed.set(source.subarray(0, SWF_PREFIX_LENGTH));
  uncompressed[0] = FWS_SIGNATURE;
  uncompressed.set(body.subarray(0, bodyLength), SWF_PREFIX_LENGTH);
  return uncompressed;
}

function matchesSwfDocument(source: Uint8Array, context: Readonly<Scene2DDocumentImportContext>): boolean {
  if (context.mimeType === SWF_MIME_TYPE) return true;
  if (source.length < 3 || source[1] !== W_SIGNATURE || source[2] !== S_SIGNATURE) return false;
  return source[0] === FWS_SIGNATURE || source[0] === CWS_SIGNATURE || source[0] === ZWS_SIGNATURE;
}

// Instantiates one SWF timeline as a MovieClip that plays it. Every node the timeline can ever show is
// allocated here, once per depth+character instance across every frame, so the enumerable slot manifest
// covers the whole timeline and not only its opening frame. Playback then only attaches, detaches,
// reorders, and re-transforms those nodes. Returns null for the rejection cases the document reports as
// its null sentinel: a symbol that contains itself, nesting past the depth bound, or a graph that would
// exceed the instantiated-node budget.
function createSwfTimelineNode(
  timeline: Readonly<SwfTimeline>,
  bounds: SwfRectangle | null,
  parsed: Readonly<SwfTagResult>,
  slots: Scene2DSlotReference[],
  state: SwfInstantiationState,
  depth: number,
): MovieClip | null {
  const clip = createSwfMovieClip(bounds);
  return populateSwfTimelineNode(clip, timeline, parsed, slots, state, depth) ? clip : null;
}

// Instantiates one placed instance of a timeline. Every instance of a symbol gets its own subtree, because
// each plays independently, so the node count grows with instances × subtree size rather than with what a
// frame shows: an ordinary authored room reaches a few hundred thousand nodes, all of them retained — the
// ones a frame does not place are detached, not discarded. Nothing here caps that count. A cap fires on
// content whose only fault is being large, and losing a whole document to one is worse than the memory,
// so the bounds that remain are the structural ones: MAX_SPRITE_NESTING for depth and `activeSymbols` for
// a symbol that contains itself. Lazy per-frame instantiation is the lever that would actually lower the
// ceiling; a cap only decides when to give up.
function populateSwfTimelineNode(
  clip: MovieClip,
  timeline: Readonly<SwfTimeline>,
  parsed: Readonly<SwfTagResult>,
  slots: Scene2DSlotReference[],
  state: SwfInstantiationState,
  depth: number,
): boolean {
  if (depth > MAX_SPRITE_NESTING) return false;

  const nodes = new Map<number, Node2D>();
  const frames: SwfFrameEntry[][] = [];
  const clips = new Map<Readonly<SwfPlacement>, Map<Readonly<SwfPlacement>, ClipRegion | null>>();

  for (const frame of timeline.frames) {
    const ordered = [...frame.values()].sort(compareSwfPlacementDepth);
    frames.push(buildSwfFrameEntries(ordered, parsed, clips, state.diagnostics));
    for (const placement of ordered) {
      const key = createSwfInstanceKey(placement);
      if (nodes.has(key)) continue;
      const sprite = parsed.sprites.get(placement.characterId);
      const shape = parsed.shapes.get(placement.characterId);
      const morphShape = parsed.morphShapes.get(placement.characterId);
      const image = parsed.images.get(placement.characterId);
      const editText = parsed.editTexts.get(placement.characterId);
      const video = parsed.videos.get(placement.characterId);
      // A masking placement is never drawn — it contributes its shape as a clip on what it covers, so it
      // earns no node of its own.
      if (placement.clipDepth > 0) continue;
      // A placement earns a node when it is named, when it carries a timeline, or when its definition is
      // visual content — geometry, pixels, a text field, or a deliberately sourceless video leaf.
      if (
        !placement.name &&
        sprite === undefined &&
        shape === undefined &&
        morphShape === undefined &&
        image === undefined &&
        editText === undefined &&
        video === undefined
      ) {
        continue;
      }
      // The node and its reference exist before the symbol behind it is populated, so a manifest lists a
      // container ahead of the named descendants it carries.
      const targetBounds = resolveSwfCharacterBounds(parsed, placement.characterId, state, 0);
      // A placed bitmap character becomes a Sprite over the character's shared waiting Texture, so the
      // node exists at its authored size before any pixels do and every placement of one character
      // decodes once.
      // A scaling grid collapses its wrapper sprite into one nine-slice shape, so the node it produces is
      // the whole symbol rather than a container to populate afterwards.
      const scale9Grid = sprite === undefined ? undefined : parsed.scalingGrids.get(placement.characterId);
      const scale9 =
        scale9Grid === undefined ? null : createSwfScale9ShapeNode(sprite!, scale9Grid, parsed, targetBounds);
      if (scale9Grid !== undefined && scale9 === null) {
        reportImportDiagnostic(
          state.diagnostics,
          ImportDiagnosticSeverity.Drop,
          'swf.scaling-grid-dropped',
          'populateSwfTimelineNode',
          { characterId: placement.characterId },
        );
      }
      const target =
        scale9 !== null
          ? scale9
          : editText !== undefined
            ? createSwfEditTextTarget(editText, parsed, targetBounds, state.diagnostics)
            : image !== undefined
              ? createSwfTexturedSprite(
                  acquireSwfImageTexture(parsed, placement.characterId, false, true),
                  targetBounds,
                )
              : video !== undefined
                ? createSwfTexturedSprite(acquireSwfVideoTexture(parsed, placement.characterId, video), targetBounds)
                : morphShape !== undefined
                  ? createSwfMorphShapeTarget(morphShape, targetBounds, parsed.morphBounds.get(placement.characterId))
                  : createSwfPlacementNode(sprite, shape, targetBounds);
      nodes.set(key, target);
      if (placement.name) {
        slots.push(
          createScene2DSlotReference(
            placement.name,
            target,
            placement.directLinkage ?? parsed.linkages.get(placement.characterId) ?? null,
          ),
        );
      }

      if (sprite !== undefined && scale9 === null) {
        if (state.activeSymbols.has(placement.characterId)) return false;
        state.activeSymbols.add(placement.characterId);
        const populated = populateSwfTimelineNode(target as MovieClip, sprite, parsed, slots, state, depth + 1);
        state.activeSymbols.delete(placement.characterId);
        if (!populated) return false;
      }
    }
  }

  collectSwfNodeAppearances(frames, nodes, state.appearances, state.diagnostics);
  setMovieClipSource(clip, createSwfTimelineSource(frames, nodes, timeline.labels, timeline.cues, state.frameRate));
  // Frame scripts attach after the source, so the clip already knows how many frames it has when a
  // recognized command addresses one.
  for (const [frame, script] of timeline.actions) {
    if (frame <= frames.length) addMovieClipFrameScript(clip, frame, script);
  }
  return true;
}

// Records the appearance a frame's placements carry that their nodes cannot: an advanced blend, and the
// filter list as effect descriptors. It is a report, not an application — nothing here touches a node,
// because an effect is something a caller runs explicitly.
//
// One entry per (instance, frame) that carries either, so a filter that changes across frames reads as
// the per-frame data it is. Frames are 1-based, matching gotoAndStopMovieClip.
function collectSwfNodeAppearances(
  frames: readonly (readonly Readonly<SwfFrameEntry>[])[],
  nodes: ReadonlyMap<number, Node2D>,
  out: SwfNodeAppearance[],
  diagnostics?: ImportDiagnostic[],
): void {
  for (let frame = 0; frame < frames.length; frame++) {
    for (const entry of frames[frame]) {
      const { advancedBlendMode, effects } = entry.placement;
      if (advancedBlendMode === null && effects.length === 0) continue;
      const node = nodes.get(createSwfInstanceKey(entry.placement));
      if (node === undefined) {
        // The appearance report is the only carrier for these two channels, so a placement whose node was
        // never allocated loses them outright. Reaching here means the placement declared one or both,
        // which is why the earlier `continue` is not a loss and this one is. A masking placement cannot
        // reach here despite also earning no node: masks are excluded from frame entries upstream.
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'swf.appearance-without-node',
          'collectSwfNodeAppearances',
          {
            capability: advancedBlendMode !== null ? 'swf.placement.blend-mode' : 'swf.placement.filter-list',
            frame: frame + 1,
          },
        );
        continue;
      }
      out.push({ advancedBlendMode, effects: [...effects], frame: frame + 1, node });
    }
  }
}

// Exposes a parsed SWF timeline as the TimelineSource a MovieClip plays. The node set was allocated by
// createSwfTimelineNode before this source exists, so constructFrame allocates nothing: it attaches the
// frame's instances in depth order, detaches the ones that frame does not place, and writes each placement
// matrix. A detached instance keeps its node, so a slot reference target stays valid while its instance is
// off-frame and a loop back to frame 1 restores the same nodes rather than replacing them. The node set
// belongs to one placed instance of the symbol, so this source belongs to that instance too rather than
// being shared across every instance of it.
function createSwfTimelineSource(
  frames: readonly (readonly Readonly<SwfFrameEntry>[])[],
  nodes: ReadonlyMap<number, Node2D>,
  labels: readonly TimelineLabel[],
  cues: readonly TimelineCue[],
  frameRate: number | null,
): TimelineSource {
  const attached = new Set<Node2D>();
  const framed = new Set<Node2D>();
  const depths = createNodeOrderList<Node2DTraits>();
  const appliedMatrices = new Map<Node2D, Readonly<SwfMatrix>>();
  const appliedClips = new Map<Node2D, ClipRegion | null>();
  const appliedAlphas = new Map<Node2D, number>();
  const appliedColorAdjustments = new Map<Node2D, readonly Adjustment[] | null>();
  const appliedRatios = new Map<Node2D, number>();
  return createEntity<EntityWithoutRuntime<TimelineSource>>({
    totalFrames: frames.length,
    labels,
    frameRate,
    // A source with nothing to dispatch carries an empty array rather than null, so a caller never
    // branches on absence.
    cues,
    constructFrame(target: Node2D, frame: number): void {
      const entries = frames[frame - 1];
      if (entries === undefined) return;

      // Membership and order are two passes, not one. Only the instances this frame drops are detached
      // and only the newly placed ones attached; depth ordering is then a permutation of what is
      // already there, so an instance placed between two others costs one apply rather than detaching
      // and reattaching the whole list.
      framed.clear();
      clearNodeOrderList(depths);
      for (const entry of entries) {
        const node = nodes.get(createSwfInstanceKey(entry.placement));
        if (node === undefined) continue;
        framed.add(node);
        addNodeOrderListEntry(depths, node, entry.placement.depth);
      }

      for (const node of attached) {
        if (framed.has(node)) continue;
        removeNodeChild(target, node);
        attached.delete(node);
      }
      // Iterates in depth order, since `framed` was filled from the depth-sorted entries.
      for (const node of framed) {
        if (attached.has(node)) continue;
        addNodeChild(target, node);
        attached.add(node);
      }
      applyNodeOrderList(target, depths);

      for (const entry of entries) {
        const node = nodes.get(createSwfInstanceKey(entry.placement));
        if (node === undefined) continue;
        // Placement records are immutable once parsed, so an unchanged matrix is the same object and the
        // transform does not have to be rewritten or invalidated on every frame the instance survives.
        if (appliedMatrices.get(node) !== entry.placement.matrix) {
          setNodeLocalMatrix(node, entry.placement.matrix);
          appliedMatrices.set(node, entry.placement.matrix);
        }
        // Alpha is per-frame data like the matrix, so a fade authored across frames follows.
        if (appliedAlphas.get(node) !== entry.placement.alpha) {
          node.alpha = entry.placement.alpha;
          invalidateNodeAppearance(node);
          appliedAlphas.set(node, entry.placement.alpha);
        }
        // A fixed-function blend is per-frame data like the matrix. An advanced mode never reaches here:
        // it left BlendMode.Normal on the placement and rode out on the import's appearance report.
        if (node.blendMode !== entry.placement.blendMode) {
          node.blendMode = entry.placement.blendMode;
          invalidateNodeAppearance(node);
        }
        // The rest of the colour transform rides the same per-frame path as alpha. The stack was built at
        // parse and is shared by every frame that keeps the placement, so an unchanged tint compares equal
        // by reference and never re-resolves.
        if (appliedColorAdjustments.get(node) !== entry.placement.colorAdjustments) {
          setNodeColorAdjustments(node, entry.placement.colorAdjustments);
          appliedColorAdjustments.set(node, entry.placement.colorAdjustments);
        }
        // A morph's ratio is per-frame data too — it is what animates a morph at all, since the shape
        // itself is one definition and every frame names a different point along it.
        if (node.kind === MorphShapeKind && appliedRatios.get(node) !== entry.placement.ratio) {
          setMorphShapeProgress(node as MorphShape, entry.placement.ratio);
          applySwfMorphBounds(node as MorphShape, entry.placement.ratio);
          appliedRatios.set(node, entry.placement.ratio);
        }
        // What masks an instance can change from frame to frame, so the clip is per-frame data applied the
        // same way: written only when this frame's region differs from the one already on the node.
        if (appliedClips.get(node) !== entry.clip) {
          setNode2DClip(node, entry.clip);
          appliedClips.set(node, entry.clip);
        }
      }
    },
  });
}

// Pairs each drawn placement of a frame with the clip its mask imposes. SWF masks by depth range — a
// placement with a clip depth covers every depth above its own through that clip depth — while Flight
// clips a node and its subtree. Applying one region to each covered sibling is equivalent to grouping
// them under a clipped container, and it leaves the attach/detach/reorder path untouched.
function buildSwfFrameEntries(
  ordered: readonly Readonly<SwfPlacement>[],
  parsed: Readonly<SwfTagResult>,
  clips: Map<Readonly<SwfPlacement>, Map<Readonly<SwfPlacement>, ClipRegion | null>>,
  diagnostics: ImportDiagnostic[] | undefined,
): SwfFrameEntry[] {
  const entries: SwfFrameEntry[] = [];
  for (const placement of ordered) {
    if (placement.clipDepth > 0) continue;
    const mask = resolveSwfPlacementMask(ordered, placement, diagnostics);
    const clip = mask === null ? null : resolveSwfMaskClip(mask, placement, parsed, clips);
    // A mask that resolves to no region leaves its covered instance UNCLIPPED, which is a visible
    // difference and not a no-op: the mask character had no decoded geometry, so imposing nothing was
    // the honest choice over imposing a wrong clip. Recover rather than Drop — the instance still draws.
    if (mask !== null && clip === null) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'swf.mask-without-geometry',
        'buildSwfFrameEntries',
        {
          capability: 'swf.placement.clip-depth',
          depth: placement.depth,
          maskCharacterId: mask.characterId,
        },
      );
    }
    entries.push({ clip, placement });
  }
  return entries;
}

// The innermost mask covering a depth. Flight carries one clip per node, so where masks nest, the
// deepest one wins rather than intersecting them.
function resolveSwfPlacementMask(
  ordered: readonly Readonly<SwfPlacement>[],
  placement: Readonly<SwfPlacement>,
  diagnostics: ImportDiagnostic[] | undefined,
): Readonly<SwfPlacement> | null {
  let mask: Readonly<SwfPlacement> | null = null;
  let covering = 0;
  for (const candidate of ordered) {
    if (candidate.clipDepth <= 0 || candidate.depth >= placement.depth) continue;
    if (placement.depth > candidate.clipDepth) continue;
    covering++;
    if (mask === null || candidate.depth > mask.depth) mask = candidate;
  }
  // Two masks over one instance means the outer one is not applied at all, so the instance shows more
  // than the file said it should. Skip rather than Recover: a node carries one clip, so this is a
  // vocabulary gap in the clip subject rather than geometry this decoder failed to read.
  if (covering > 1) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'swf.nested-mask-collapsed',
      'resolveSwfPlacementMask',
      {
        capability: 'swf.placement.clip-depth',
        covering,
        depth: placement.depth,
      },
    );
  }
  return mask;
}

function resolveSwfMaskClip(
  mask: Readonly<SwfPlacement>,
  placement: Readonly<SwfPlacement>,
  parsed: Readonly<SwfTagResult>,
  clips: Map<Readonly<SwfPlacement>, Map<Readonly<SwfPlacement>, ClipRegion | null>>,
): ClipRegion | null {
  let byMasked = clips.get(mask);
  if (byMasked === undefined) {
    byMasked = new Map<Readonly<SwfPlacement>, ClipRegion | null>();
    clips.set(mask, byMasked);
  }
  const cached = byMasked.get(placement);
  if (cached !== undefined) return cached;
  const region = createSwfMaskClipRegion(mask, placement, parsed);
  byMasked.set(placement, region);
  return region;
}

// Builds the clip a mask imposes on one covered instance, in that instance's own local space — which is
// where a ClipRegion's contours live. The mask's geometry is authored in its own space, so it crosses two
// transforms: out of the mask's placement into the parent, then back through the covered instance's
// placement. A mask whose character has no decoded geometry (a sprite, or a shape body this decoder could
// not read) imposes no clip rather than a wrong one.
function createSwfMaskClipRegion(
  mask: Readonly<SwfPlacement>,
  placement: Readonly<SwfPlacement>,
  parsed: Readonly<SwfTagResult>,
): ClipRegion | null {
  const shape = parsed.shapes.get(mask.characterId);
  if (shape === undefined) return null;

  const inverse = createMatrix();
  if (!inverseMatrix(inverse, placement.matrix)) return null;
  const combined = createMatrix();
  multiplyMatrix(combined, mask.matrix, inverse);

  const contours: number[][] = [];
  for (const region of getShapeFillRegions(shape.data.commands) ?? []) {
    for (const contour of createClipRegionFromPath(region.path).contours ?? []) {
      const transformed = new Array<number>(contour.length);
      for (let i = 0; i < contour.length; i += 2) {
        matrixTransformPointXY(_maskPoint, combined, contour[i], contour[i + 1]);
        transformed[i] = _maskPoint.x;
        transformed[i + 1] = _maskPoint.y;
      }
      contours.push(transformed);
    }
  }
  return contours.length === 0 ? null : createClipRegionFromContours(contours, 'nonZero');
}

function compareSwfPlacementDepth(a: Readonly<SwfPlacement>, b: Readonly<SwfPlacement>): number {
  return a.depth - b.depth;
}

function computeSwfLocalBoundsRectangle(out: Rectangle, source: Readonly<BoundsNodeAny>): void {
  const bounds = (source.data as SwfAuthoredBoundsData).authoredBounds;
  out.x = bounds.x;
  out.y = bounds.y;
  out.width = bounds.width;
  out.height = bounds.height;
}

// Instance identity within one timeline. A move keeps its depth and character so it keeps its node across
// frames, while a replacement at the same depth is a different instance and gets a node of its own.
function createSwfInstanceKey(placement: Readonly<SwfPlacement>): number {
  return placement.depth * SWF_INSTANCE_KEY_SCALE + placement.characterId;
}

// Returns the Texture a bitmap character is sampled through for one combination of the two flags SWF
// encodes in a fill type, allocating it on first use. Pixels are shared and sampling is not: every variant
// of one character is a separate Texture over the same image resource, so one decode serves them all.
//
// The image payload does not have to be known yet. A shape can reference a character defined later in the
// tag stream, so the texture is created blind and createSwfImageResources pairs it with its bytes after
// the whole file is walked. A character that never gets a payload leaves its textures sourceless, which is
// how a dangling bitmap fill draws nothing instead of guessing.
function acquireSwfImageTexture(
  state: Readonly<SwfImageTextureOwner>,
  characterId: number,
  repeat: boolean,
  smoothed: boolean,
): Texture2D {
  let variants = state.imageTextures.get(characterId);
  if (variants === undefined) {
    variants = new Map<string, Texture2D>();
    state.imageTextures.set(characterId, variants);
  }
  const key = `${repeat ? 'r' : 'c'}${smoothed ? 's' : 'n'}`;
  let texture = variants.get(key);
  if (texture === undefined) {
    texture = createTexture({
      sampler: createSampler({
        magFilter: smoothed ? 'linear' : 'nearest',
        minFilter: smoothed ? 'linear-mipmap-linear' : 'nearest',
        mipmaps: smoothed,
        wrapU: repeat ? 'repeat' : 'clamp-to-edge',
        wrapV: repeat ? 'repeat' : 'clamp-to-edge',
      }),
    });
    variants.set(key, texture);
  }
  return texture;
}

// Allocates the stable 2D texture identity a video character's Sprites share. Its source deliberately
// stays null: DefineVideoStream declares a packet sequence rather than a browser-playable file, and
// Stage A promises graph structure and authored extents without pretending those packets are pixels.
function acquireSwfVideoTexture(
  parsed: Readonly<SwfTagResult>,
  characterId: number,
  definition: Readonly<SwfVideoDefinition>,
): Texture2D {
  let texture = parsed.videoTextures.get(characterId);
  if (texture === undefined) {
    texture = createTexture({
      sampler: createSampler({
        magFilter: definition.smoothing ? 'linear' : 'nearest',
        minFilter: definition.smoothing ? 'linear' : 'nearest',
        mipmaps: false,
      }),
    });
    parsed.videoTextures.set(characterId, texture);
  }
  return texture;
}

// Pairs every bitmap character that something actually samples with the bytes it was defined from. A
// payload nothing references costs no reference, and a reference names every Texture waiting on it, so
// loading one binds all of them.
// Every event sound the file defined, in character order, each carrying the export name the file gave it
// when it gave one. Sounds are enumerated rather than discovered from the graph because nothing in the
// graph refers to them: a SWF triggers a sound from a timeline or from script, so a document that dropped
// the ones no frame happens to start would be discarding most of the audio a file ships with.
function createSwfAudioResources(parsed: Readonly<SwfTagResult>): AudioResourceReference[] {
  const resources: AudioResourceReference[] = [];
  for (const [characterId, sound] of parsed.sounds) {
    // ExportAssets is what publishes a sound for code to start. Every sound in a real file that no frame
    // triggers turns out to be one of these, so the name is the only way back to it.
    const name = parsed.linkages.get(characterId) ?? null;
    const reference = createEmbeddedAudioResourceReference(sound.bytes, sound.mimeType, name);
    // Every cue naming this sound already holds this resource, so decode has to fill that one rather than
    // the fresh one the constructor made.
    const shared = parsed.soundResources.get(characterId);
    if (shared !== undefined) reference.resource = shared;
    resources.push(reference);
  }
  // A stream has no character id and so no export name; the cue that starts it is its only handle.
  for (const stream of parsed.streamSounds) {
    const reference = createEmbeddedAudioResourceReference(stream.bytes, stream.mimeType, null);
    reference.resource = stream.resource;
    resources.push(reference);
  }
  return resources;
}

interface SwfImageResourceSet {
  references: Map<number, EmbeddedImageResourceReference>;
  resources: ImageResourceReference[];
}

function createSwfImageResources(parsed: Readonly<SwfTagResult>): SwfImageResourceSet {
  const references = new Map<number, EmbeddedImageResourceReference>();
  const resources: ImageResourceReference[] = [];
  for (const [characterId, variants] of parsed.imageTextures) {
    const image = parsed.images.get(characterId);
    if (image === undefined) continue;
    const alphaType =
      image.mimeType === SWF_LOSSLESS_ALPHA_MIME_TYPE
        ? 'premultiplied'
        : image.mimeType === SWF_LOSSLESS_MIME_TYPE
          ? 'opaque'
          : 'straight';
    const reference = createEmbeddedImageResourceReference(image.bytes, image.mimeType, alphaType);
    reference.textures = [...variants.values()];
    references.set(characterId, reference);
    resources.push(reference);
  }
  return { references, resources };
}

// Completes the full-import sidecar after document references exist. An unplaced definition still earns
// a report record and its own zero-texture reference; a placed one reuses the document's exact object.
function createSwfJpegAlphaPayloads(
  parsed: Readonly<SwfTagResult>,
  references: Map<number, EmbeddedImageResourceReference>,
): SwfJpegAlphaPayload[] {
  const payloads: SwfJpegAlphaPayload[] = [];
  for (const [characterId, source] of parsed.jpegAlphaPayloads) {
    let reference = references.get(characterId);
    if (reference === undefined) {
      const image = parsed.images.get(characterId);
      if (image === undefined) continue;
      reference = createEmbeddedImageResourceReference(image.bytes, image.mimeType);
      references.set(characterId, reference);
    }
    payloads.push({ ...source, reference });
  }
  return payloads;
}

function createSwfTexturedSprite(texture: Texture2D, bounds: SwfRectangle | null): Sprite {
  const target = createSprite();
  target.data.texture = texture;
  if (bounds !== null) {
    // The authored RECT sizes the node before the image resolves, so layout does not shift when pixels
    // arrive and a document that never loads its images still measures correctly.
    (target.data as unknown as SwfAuthoredBoundsData).authoredBounds = { ...bounds };
    (getNodeRuntime(target) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return target;
}

function createSwfDisplayObject(bounds: SwfRectangle | null): ReturnType<typeof createDisplayObject> {
  const target = createDisplayObject();
  if (bounds !== null) {
    target.data = { authoredBounds: { ...bounds } } as SwfDisplayObjectData;
    (getNodeRuntime(target) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return target;
}

function createSwfMovieClip(bounds: SwfRectangle | null): MovieClip {
  const clip = createMovieClip();
  if (bounds !== null) {
    (clip.data as SwfMovieClipData).authoredBounds = { ...bounds };
    (getNodeRuntime(clip) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return clip;
}

// A field becomes its own node per placement, because its text is per-instance state rather than shared
// artwork. The authored RECT still sizes it, so a field reports the box the tool drew even before any
// layout has run.
function createSwfEditTextTarget(
  create: (resolveFontName: (fontId: number) => string) => RichText,
  parsed: Readonly<SwfTagResult>,
  bounds: SwfRectangle | null,
  diagnostics?: ImportDiagnostic[],
): Node2D {
  // The field survives with its size, box and colour and simply has no font family, which is the
  // diminished case: it exists, it is smaller than authored, and nothing else says so. Reported once per
  // unresolved id rather than per call, since the resolver runs for every run of text.
  const unresolved = new Set<number>();
  const node = create((fontId) => {
    const name = parsed.fontNames.get(fontId);
    if (name !== undefined) return name;
    if (!unresolved.has(fontId)) {
      unresolved.add(fontId);
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'swf.edit-text-font-name-unresolved',
        'createSwfEditTextTarget',
        { capability: 'swf.text.define-edit-text', fontId },
      );
    }
    return '';
  });
  if (bounds !== null) {
    (node.data as unknown as SwfAuthoredBoundsData).authoredBounds = { ...bounds };
    (getNodeRuntime(node) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return node;
}

// Chooses what a placed character becomes: a MovieClip for a symbol with a timeline, a Shape carrying its
// own copy of the definition's commands, and otherwise the bounded container a placement with neither
// still needs.
function createSwfPlacementNode(
  sprite: Readonly<SwfTimeline> | undefined,
  shape: Readonly<Shape> | undefined,
  bounds: SwfRectangle | null,
): Node2D {
  if (sprite !== undefined) return createSwfMovieClip(bounds);
  return shape === undefined ? createSwfDisplayObject(bounds) : createSwfShapeNode(shape, bounds);
}

// Each placement of a morph character decodes its own node, because a morph's progress is per instance:
// two placements of one character routinely sit at different points along the same morph. A factory that
// declines leaves an empty display object, so the placement keeps its box and its slot reference.
function createSwfMorphShapeTarget(
  decode: () => MorphShape | null,
  bounds: SwfRectangle | null,
  morphBounds: Readonly<{ end: SwfRectangle; start: SwfRectangle }> | undefined,
): Node2D {
  const shape = decode();
  if (shape === null) return createSwfDisplayObject(bounds);
  if (morphBounds !== undefined) {
    const data = shape.data as unknown as SwfMorphBoundsData;
    data.morphStartBounds = { ...morphBounds.start };
    data.morphEndBounds = { ...morphBounds.end };
    data.authoredBounds = { ...morphBounds.start };
    (getNodeRuntime(shape) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  } else if (bounds !== null) {
    (shape.data as unknown as SwfAuthoredBoundsData).authoredBounds = { ...bounds };
    (getNodeRuntime(shape) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return shape;
}

// Moves a morph's authored box to the ratio its geometry is at. Written in place, because the box is read
// through the bounds hook rather than copied out of it.
function applySwfMorphBounds(shape: MorphShape, progress: number): void {
  const data = shape.data as unknown as SwfMorphBoundsData;
  const start = data.morphStartBounds;
  const end = data.morphEndBounds;
  if (start === undefined || end === undefined) return;
  data.authoredBounds = {
    height: start.height + (end.height - start.height) * progress,
    width: start.width + (end.width - start.width) * progress,
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
  invalidateNodeLocalBounds(shape);
}

// Each placement of a shape character gets its own copy of the decoded commands, so a document that places
// one symbol many times still holds independently editable geometry per instance.
// Builds the nine-slice node a scaling-grid sprite becomes, or null when the sprite is not one this can
// express. Flash hangs the grid on a sprite, but Flight's nine-slice lives on the shape whose commands get
// remapped, so the two only meet where the sprite is a wrapper: one frame placing one unnamed, unmasked
// shape at identity, which is what an authoring tool emits when a designer sets scale9Grid on artwork.
// Returning null leaves the sprite an ordinary MovieClip — the grid is dropped rather than misapplied,
// because a grid on a multi-frame or multi-layer sprite means something this node cannot honor.
function createSwfScale9ShapeNode(
  sprite: Readonly<SwfTimeline>,
  grid: Readonly<SwfRectangle>,
  parsed: Readonly<SwfTagResult>,
  bounds: SwfRectangle | null,
): Scale9Shape | null {
  if (sprite.frames.length !== 1 || sprite.actions.size > 0) return null;
  const placements = [...sprite.frames[0].values()];
  if (placements.length !== 1) return null;
  const inner = placements[0];
  if (inner.name !== null || inner.clipDepth > 0 || inner.alpha !== 1) return null;
  const { a, b, c, d, tx, ty } = inner.matrix;
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1 || tx !== 0 || ty !== 0) return null;
  const shape = parsed.shapes.get(inner.characterId);
  if (shape === undefined) return null;

  const target = createScale9Shape({ height: grid.height, width: grid.width, x: grid.x, y: grid.y });
  copyShapeCommands(target, shape);
  if (bounds !== null) {
    (target.data as unknown as SwfShapeNodeData).authoredBounds = { ...bounds };
    (getNodeRuntime(target) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return target;
}

function createSwfShapeNode(template: Readonly<Shape>, bounds: SwfRectangle | null): Shape {
  const target = createShape();
  copyShapeCommands(target, template);
  if (bounds !== null) {
    // The authored RECT wins over the geometry's own extent: SWF sizes a character by what the tool
    // recorded, including stroke width and authoring padding the command stream does not carry.
    (target.data as SwfShapeNodeData).authoredBounds = { ...bounds };
    (getNodeRuntime(target) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return target;
}

// Builds the node one exported character becomes, resolving the same character kinds in the same order a
// placement does — an exported bitmap or edit text is as ordinary a library symbol as an exported sprite,
// and dispatching differently here would make a symbol import unlike the identical character placed on a
// timeline.
function createSwfSymbolNode(
  parsed: Readonly<SwfTagResult>,
  characterId: number,
  slots: Scene2DSlotReference[],
  state: SwfInstantiationState,
): Node2D | null {
  const bounds = resolveSwfCharacterBounds(parsed, characterId, state, 0);
  const editText = parsed.editTexts.get(characterId);
  if (editText !== undefined) return createSwfEditTextTarget(editText, parsed, bounds, state.diagnostics);
  if (parsed.images.has(characterId)) {
    return createSwfTexturedSprite(acquireSwfImageTexture(parsed, characterId, false, true), bounds);
  }
  const video = parsed.videos.get(characterId);
  if (video !== undefined) return createSwfTexturedSprite(acquireSwfVideoTexture(parsed, characterId, video), bounds);
  const sprite = parsed.sprites.get(characterId);
  if (sprite !== undefined) return createSwfTimelineNode(sprite, bounds, parsed, slots, state, 0);
  const shape = parsed.shapes.get(characterId);
  return shape === undefined ? null : createSwfShapeNode(shape, bounds);
}

function mergeSwfRectangles(a: SwfRectangle, b: Readonly<SwfRectangle>): SwfRectangle {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { height: maxY - y, width: maxX - x, x, y };
}

function resolveSwfCharacterBounds(
  parsed: Readonly<SwfTagResult>,
  characterId: number,
  state: SwfInstantiationState,
  depth: number,
): SwfRectangle | null {
  const direct = parsed.characterBounds.get(characterId);
  if (direct !== undefined) return direct;
  if (state.resolvedBounds.has(characterId)) return state.resolvedBounds.get(characterId) ?? null;
  const sprite = parsed.sprites.get(characterId);
  if (sprite === undefined || depth > MAX_SPRITE_NESTING || state.resolvingBounds.has(characterId)) return null;

  state.resolvingBounds.add(characterId);
  // A symbol's authored extent covers everything it can show, so this unions every frame's placements
  // rather than only the first frame's: the node's local bounds do not change as its playhead moves.
  let bounds: SwfRectangle | null = null;
  let missingChildren = 0;
  for (const frame of sprite.frames) {
    for (const placement of frame.values()) {
      const childBounds = resolveSwfCharacterBounds(parsed, placement.characterId, state, depth + 1);
      if (childBounds === null) {
        // Two different things reach here and only one is a loss. A sprite that resolved to an empty
        // union has no extent to contribute and is correct; a character with neither authored bounds nor
        // a sprite body was never imported at all, and the union it should have widened is short.
        if (!parsed.characterBounds.has(placement.characterId) && !parsed.sprites.has(placement.characterId)) {
          missingChildren++;
        }
        continue;
      }
      const transformed = transformSwfRectangle(childBounds, placement.matrix);
      bounds = bounds === null ? transformed : mergeSwfRectangles(bounds, transformed);
    }
  }
  state.resolvingBounds.delete(characterId);
  if (missingChildren > 0) {
    // A count rather than a flag: the box survives and is simply smaller than the sprite's contents, and
    // a count is the only thing that separates a full union from a short one.
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.sprite-bounds-short',
      'resolveSwfCharacterBounds',
      { capability: 'swf.timeline.define-sprite', characterId, missingChildren },
    );
  }
  state.resolvedBounds.set(characterId, bounds);
  return bounds;
}

function transformSwfRectangle(bounds: Readonly<SwfRectangle>, matrix: Readonly<SwfMatrix>): SwfRectangle {
  const x0 = matrix.a * bounds.x + matrix.c * bounds.y + matrix.tx;
  const y0 = matrix.b * bounds.x + matrix.d * bounds.y + matrix.ty;
  const x1 = matrix.a * (bounds.x + bounds.width) + matrix.c * bounds.y + matrix.tx;
  const y1 = matrix.b * (bounds.x + bounds.width) + matrix.d * bounds.y + matrix.ty;
  const x2 = matrix.a * bounds.x + matrix.c * (bounds.y + bounds.height) + matrix.tx;
  const y2 = matrix.b * bounds.x + matrix.d * (bounds.y + bounds.height) + matrix.ty;
  const x3 = matrix.a * (bounds.x + bounds.width) + matrix.c * (bounds.y + bounds.height) + matrix.tx;
  const y3 = matrix.b * (bounds.x + bounds.width) + matrix.d * (bounds.y + bounds.height) + matrix.ty;
  const x = Math.min(x0, x1, x2, x3);
  const y = Math.min(y0, y1, y2, y3);
  const maxX = Math.max(x0, x1, x2, x3);
  const maxY = Math.max(y0, y1, y2, y3);
  return { height: maxY - y, width: maxX - x, x, y };
}

function readPlaceObject(
  body: SwfReader,
  placements: Map<number, SwfPlacement>,
  hasExtendedFlags: boolean,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const flags = body.readUint8();
  const extendedFlags = hasExtendedFlags ? body.readUint8() : 0;
  const depth = body.readUint16();
  const existing = placements.get(depth);
  const isMove = (flags & 0x01) !== 0;
  const inherited = isMove ? existing : undefined;
  const hasCharacter = (flags & 0x02) !== 0;
  const hasClassName = (extendedFlags & 0x08) !== 0 || ((extendedFlags & 0x10) !== 0 && hasCharacter);
  const directLinkage = hasClassName ? body.readString() : (inherited?.directLinkage ?? null);
  const characterId = hasCharacter ? body.readUint16() : (inherited?.characterId ?? 0);
  const matrix = (flags & 0x04) !== 0 ? readSwfMatrix(body) : (inherited?.matrix ?? IDENTITY_MATRIX);
  const colorTransform =
    (flags & 0x08) !== 0
      ? readSwfColorTransform(body)
      : { alpha: inherited?.alpha ?? 1, colorAdjustments: inherited?.colorTransformAdjustments ?? null };
  const ratio = (flags & 0x10) !== 0 ? body.readUint16() / MORPH_RATIO_ONE : (inherited?.ratio ?? 0);
  const name = (flags & 0x20) !== 0 ? body.readString() : (inherited?.name ?? null);
  const clipDepth = (flags & 0x40) !== 0 ? body.readUint16() : (inherited?.clipDepth ?? 0);

  // A filter list is variable-width and the blend mode sits behind it, so the list reports whether it
  // reached its end. An unknown filter has no skippable payload length; the blend byte is then out of
  // reach and must not be invented from the unknown payload's first byte.
  const hasFilterList = (extendedFlags & 0x01) !== 0;
  const readEffects: RenderEffect[] = [];
  const readFilterAdjustments: Adjustment[] = [];
  const filterListComplete = !hasFilterList || readSwfFilterList(body, readEffects, readFilterAdjustments, diagnostics);
  const declaresBlendMode = (extendedFlags & 0x02) !== 0;
  const hasBlendMode = declaresBlendMode && filterListComplete;
  if (declaresBlendMode && !filterListComplete) {
    // The record declared a blend mode and the byte carrying it is unreachable behind a list that did
    // not finish. The placement keeps the filters read so far, so nothing about the result says a
    // declared channel went unread.
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.blend-mode-behind-unread-filters',
      'readPlaceObject',
      { capability: 'swf.placement.blend-mode' },
    );
  }
  const blendModeValue = hasBlendMode ? body.readUint8() : 0;

  if (!body.valid || (isMove && existing === undefined) || (characterId === 0 && directLinkage === null)) return;
  // A record that declares a channel replaces it, including with nothing; one that stays silent about it
  // keeps whatever the move inherited. That is why an empty list a record did declare is not the same
  // value as no list at all.
  const effects = hasFilterList ? readEffects : (inherited?.effects ?? EMPTY_EFFECTS);
  const filterAdjustments = hasFilterList ? readFilterAdjustments : (inherited?.filterAdjustments ?? EMPTY_ADJUSTMENTS);
  placements.set(depth, {
    advancedBlendMode: hasBlendMode
      ? resolveSwfAdvancedBlendMode(blendModeValue)
      : (inherited?.advancedBlendMode ?? null),
    alpha: colorTransform.alpha,
    blendMode: hasBlendMode ? resolveSwfBlendMode(blendModeValue) : (inherited?.blendMode ?? BlendMode.Normal),
    characterId,
    clipDepth,
    colorAdjustments: joinSwfColorAdjustments(colorTransform.colorAdjustments, filterAdjustments),
    colorTransformAdjustments: colorTransform.colorAdjustments,
    depth,
    directLinkage,
    effects,
    filterAdjustments,
    matrix,
    name,
    ratio,
  });
}

function readLegacyPlaceObject(body: SwfReader, placements: Map<number, SwfPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  const matrix = readSwfMatrix(body);
  // The legacy record's colour transform has no alpha channel at all, so it can only tint.
  const colorTransform = body.pos < body.end ? readSwfColorTransform(body, 3) : null;
  if (!body.valid || characterId === 0) return;
  placements.set(depth, {
    advancedBlendMode: null,
    alpha: 1,
    blendMode: BlendMode.Normal,
    characterId,
    clipDepth: 0,
    colorAdjustments: colorTransform?.colorAdjustments ?? null,
    colorTransformAdjustments: colorTransform?.colorAdjustments ?? null,
    depth,
    directLinkage: null,
    effects: EMPTY_EFFECTS,
    filterAdjustments: EMPTY_ADJUSTMENTS,
    matrix,
    name: null,
    ratio: 0,
  });
}

function readLegacyRemoveObject(body: SwfReader, placements: Map<number, SwfPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  if (!body.valid) return;
  const existing = placements.get(depth);
  if (existing?.characterId === characterId) placements.delete(depth);
}

// Reads a colour transform (`C' = C * multiply / 256 + add`) and splits it across the two places Flight
// carries colour on a node. The alpha multiplier becomes `node.alpha`, because that is the channel the
// render walk concatenates down a subtree — the same thing SWF's own transform does for a sprite, and
// the reason the multiplier does not ride in the adjustment. Everything else becomes a
// ColorScaleBiasAdjustment: the Adjustment tier's `out = in * scale + bias` is exactly a CXFORM, with
// SWF's byte-domain add terms normalized at this seam.
//
// The alpha add is pre-divided by the alpha multiply so that composing the two — the adjustment first,
// `node.alpha` at draw — reproduces SWF's `A * multiply + add` exactly. A record with a zero alpha
// multiply and a non-zero add cannot be expressed that way and drops its add; the node is fully
// transparent either way in every other respect.
function readSwfColorTransform(reader: SwfReader, channelCount = 4): SwfColorTransform {
  const hasAdd = reader.readUnsignedBits(1) !== 0;
  const hasMultiply = reader.readUnsignedBits(1) !== 0;
  const bits = reader.readUnsignedBits(4);
  const multiply = [1, 1, 1, 1];
  const add = [0, 0, 0, 0];
  if (hasMultiply) {
    for (let i = 0; i < channelCount; i++) multiply[i] = reader.readSignedBits(bits) / FIXED_8_8_ONE;
  }
  if (hasAdd) {
    for (let i = 0; i < channelCount; i++) add[i] = reader.readSignedBits(bits) / COLOR_CHANNEL_ONE;
  }
  reader.alignToByte();

  const alpha = channelCount > ALPHA_CHANNEL ? Math.max(0, Math.min(1, multiply[ALPHA_CHANNEL])) : 1;
  const alphaBias = alpha > 0 ? add[ALPHA_CHANNEL] / alpha : 0;
  const tints =
    multiply[0] !== 1 || multiply[1] !== 1 || multiply[2] !== 1 || add[0] !== 0 || add[1] !== 0 || add[2] !== 0;
  if (!tints && alphaBias === 0) return { alpha, colorAdjustments: null };
  return {
    alpha,
    colorAdjustments: [
      createColorScaleBiasAdjustment({
        alphaBias,
        alphaScale: 1,
        blueBias: add[2],
        blueScale: multiply[2],
        greenBias: add[1],
        greenScale: multiply[1],
        redBias: add[0],
        redScale: multiply[0],
      }),
    ],
  };
}

// Concatenates the two pointwise sources a placement can carry — its colour transform and a colour-matrix
// filter from its filter list — into the single stack a node takes, in the order SWF applies them: the
// transform tints the object, then a filter operates on the result. Returns null rather than an empty
// array so an untinted placement compares equal to the untinted default by reference.
function joinSwfColorAdjustments(
  colorTransform: readonly Adjustment[] | null,
  filters: readonly Adjustment[],
): readonly Adjustment[] | null {
  if (filters.length === 0) return colorTransform;
  return colorTransform === null ? filters : [...colorTransform, ...filters];
}

function readSwfLinkages(body: SwfReader, linkages: Map<number, string>): void {
  const count = body.readUint16();
  for (let i = 0; i < count && body.valid; i++) {
    const characterId = body.readUint16();
    const name = body.readString();
    if (name) linkages.set(characterId, name);
  }
}

function readSwfMatrix(reader: SwfReader): SwfMatrix {
  let a = 1;
  let d = 1;
  if (reader.readUnsignedBits(1) !== 0) {
    const scaleBits = reader.readUnsignedBits(5);
    a = reader.readSignedBits(scaleBits) / FIXED_16_ONE;
    d = reader.readSignedBits(scaleBits) / FIXED_16_ONE;
  }

  let b = 0;
  let c = 0;
  if (reader.readUnsignedBits(1) !== 0) {
    const rotateBits = reader.readUnsignedBits(5);
    b = reader.readSignedBits(rotateBits) / FIXED_16_ONE;
    c = reader.readSignedBits(rotateBits) / FIXED_16_ONE;
  }

  const translateBits = reader.readUnsignedBits(5);
  const tx = reader.readSignedBits(translateBits) / TWIPS_PER_PIXEL;
  const ty = reader.readSignedBits(translateBits) / TWIPS_PER_PIXEL;
  reader.alignToByte();
  return { a, b, c, d, tx, ty };
}

// The advanced half of the blend split. Flight separates the modes that fold into fixed-function blend
// state from the destination-reading and non-separable ones, which need a BlendEffect bouncing through
// an offscreen — so a mode in the second set is reported rather than assigned, and assigning it to
// `node.blendMode` to get a silent Normal is exactly the bug the split exists to prevent.
//
// SWF's remaining modes have no home in either tier: `layer` is a compositing hint rather than a blend,
// and subtract, invert, alpha and erase are destination-alpha operations Flight does not express. They
// stay Normal and are not reported, because there is nothing a caller could apply.
function resolveSwfAdvancedBlendMode(value: number): AdvancedBlendMode | null {
  if (value === SWF_BLEND_DIFFERENCE) return AdvancedBlendMode.Difference;
  if (value === SWF_BLEND_OVERLAY) return AdvancedBlendMode.Overlay;
  return value === SWF_BLEND_HARD_LIGHT ? AdvancedBlendMode.HardLight : null;
}

function resolveSwfBlendMode(value: number): BlendMode {
  if (value === SWF_BLEND_MULTIPLY) return BlendMode.Multiply;
  if (value === SWF_BLEND_SCREEN) return BlendMode.Screen;
  if (value === SWF_BLEND_LIGHTEN) return BlendMode.Lighten;
  if (value === SWF_BLEND_DARKEN) return BlendMode.Darken;
  return value === SWF_BLEND_ADD ? BlendMode.Add : BlendMode.Normal;
}

function readSwfRectangle(reader: SwfReader): SwfRectangle | null {
  const bits = reader.readUnsignedBits(5);
  const xMin = reader.readSignedBits(bits);
  const xMax = reader.readSignedBits(bits);
  const yMin = reader.readSignedBits(bits);
  const yMax = reader.readSignedBits(bits);
  reader.alignToByte();
  // Only a reader that ran out of bits is a failure. An inverted extent is not: real authoring tools
  // emit degenerate bounds for characters that occupy no space, and a RECT is an advisory extent rather
  // than the geometry itself — the shape body carries that. Reading one as an empty box keeps a single
  // odd character from discarding the whole file.
  if (!reader.valid) return null;
  return {
    height: Math.max(0, yMax - yMin) / TWIPS_PER_PIXEL,
    width: Math.max(0, xMax - xMin) / TWIPS_PER_PIXEL,
    x: xMin / TWIPS_PER_PIXEL,
    y: yMin / TWIPS_PER_PIXEL,
  };
}

function readSwfTags(reader: SwfReader, diagnostics: ImportDiagnostic[] | undefined): SwfTagResult | null {
  const state: SwfParseState = {
    abcBlobs: [],
    backgroundColor: null,
    diagnostics,
    pendingInitActions: [],
    editTexts: new Map<number, (resolveFontName: (fontId: number) => string) => RichText>(),
    fontNames: new Map<number, string>(),
    characterBounds: new Map<number, SwfRectangle>(),
    definedCharacters: new Set<number>(),
    fontCodePoints: new Map<number, number[]>(),
    fontOutlineSources: new Map<number, GlyphOutlineSource>(),
    images: new Map<number, SwfImagePayload>(),
    imageTextures: new Map<number, Map<string, Texture2D>>(),
    jpegAlphaPayloads: new Map<number, SwfJpegAlphaSource>(),
    jpegTables: null,
    pendingTexts: [],
    linkages: new Map<number, string>(),
    remainingFrameEntries: MAX_TIMELINE_FRAME_ENTRIES,
    morphBounds: new Map<number, { end: SwfRectangle; start: SwfRectangle }>(),
    morphShapes: new Map<number, () => MorphShape | null>(),
    scalingGrids: new Map<number, SwfRectangle>(),
    shapes: new Map<number, Shape>(),
    soundCuesAwaitingClass: [],
    soundCuesAwaitingRate: [],
    streamSounds: [],
    soundResources: new Map<number, AudioResource>(),
    sounds: new Map<number, SwfSoundPayload>(),
    sprites: new Map<number, SwfTimeline>(),
    videoTextures: new Map<number, Texture2D>(),
    videos: new Map<number, SwfVideoDefinition>(),
  };
  const timeline = readSwfTimeline(reader, state);
  if (timeline === null) return null;
  composeSwfFontCodePoints(state);
  resolveSwfSoundClassCues(state);
  convertSwfSoundCueTimes(state);
  appendSwfPendingTextShapes(reader, state);
  appendSwfAbcFrameScripts(state, timeline);
  for (const pending of state.pendingInitActions) {
    const sprite = state.sprites.get(pending.characterId);
    if (sprite !== undefined && !sprite.actions.has(1)) sprite.actions.set(1, pending.script);
  }
  return {
    backgroundColor: state.backgroundColor,
    editTexts: state.editTexts,
    fontNames: state.fontNames,
    characterBounds: state.characterBounds,
    fontOutlineSources: state.fontOutlineSources,
    images: state.images,
    imageTextures: state.imageTextures,
    jpegAlphaPayloads: state.jpegAlphaPayloads,
    linkages: state.linkages,
    morphBounds: state.morphBounds,
    morphShapes: state.morphShapes,
    scalingGrids: state.scalingGrids,
    shapes: state.shapes,
    soundResources: state.soundResources,
    sounds: state.sounds,
    streamSounds: state.streamSounds,
    sprites: state.sprites,
    timeline,
    videoTextures: state.videoTextures,
    videos: state.videos,
  };
}

// Reads one tag stream — the root's or a sprite's — into frames and labels. The stream is complete when
// it reaches its bounded end, whether or not an explicit End tag arrived: real files written by Flash's
// own tooling end a sprite, and sometimes the root, with the last content tag and no terminator, and
// rejecting those loses the whole document over a byte no reader needs. Truncation is still caught, by
// the declared file length, by a tag body reaching past the stream, and by the reader's own overrun flag.
// Composes every static text definition once the whole file has been walked, so a text record can address
// a font declared after it. A text whose body does not decode keeps its bounded placeholder, the same way
// an unreadable shape body does.
// A DoABC payload names itself before its bytecode: the tag carries flags and a null-terminated name that
// the anonymous form omits.
function readSwfAbcPayload(body: Readonly<SwfReader>, hasName: boolean): Uint8Array {
  if (!hasName) return body.source.subarray(body.pos, body.end);
  let start = body.pos + 4;
  while (start < body.end && body.source[start] !== 0) start++;
  return body.source.subarray(Math.min(start + 1, body.end), body.end);
}

// Binds recognized AVM2 frame scripts to the timelines they belong to. A script declares them against a
// class name; SymbolClass is what ties that name back to a character, and character 0 is the root.
function appendSwfAbcFrameScripts(state: SwfParseState, timeline: SwfTimeline): void {
  if (state.abcBlobs.length === 0) return;
  const charactersByClass = new Map<string, number>();
  for (const [characterId, className] of state.linkages) charactersByClass.set(className, characterId);

  for (const blob of state.abcBlobs) {
    const byClass = readSwfAbcFrameScripts(blob.bytes, state.diagnostics);
    if (byClass === null) {
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'swf.abc-frame-scripts-unreadable',
        'appendSwfAbcFrameScripts',
        { capability: blob.named ? 'swf.script.do-abc' : 'swf.script.do-abc-anonymous' },
      );
      continue;
    }
    for (const [className, frames] of byClass) {
      const characterId = charactersByClass.get(className);
      if (characterId === undefined) continue;
      const target = characterId === 0 ? timeline : state.sprites.get(characterId);
      if (target === undefined) continue;
      for (const [frame, script] of frames) target.actions.set(frame, script);
    }
  }
}

function appendSwfPendingTextShapes(reader: SwfReader, state: SwfParseState): void {
  for (const pending of state.pendingTexts) {
    const shape = createSwfTextShape(
      new SwfReader(reader.source, pending.start, pending.end),
      pending.version,
      state.fontOutlineSources,
    );
    if (shape === null) {
      // Composition is deferred because the records address glyphs by index into a font that may not
      // have been read yet, so the failure lands here rather than at the tag. Without a report the
      // character is simply absent and every placement of it resolves to nothing.
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'swf.text-shape-uncomposable',
        'appendSwfPendingTextShapes',
        {
          capability: pending.version === 2 ? 'swf.text.define-text-2' : 'swf.text.define-text',
          characterId: pending.characterId,
        },
      );
      continue;
    }
    state.shapes.set(pending.characterId, shape);
  }
}

function readSwfTimeline(reader: SwfReader, state: SwfParseState): SwfTimeline | null {
  const placements = new Map<number, SwfPlacement>();
  const actions = new Map<number, FrameScript>();
  const cues: TimelineCue[] = [];
  const frames: Map<number, SwfPlacement>[] = [];
  const labels: TimelineLabel[] = [];
  const streamChunks: Uint8Array[] = [];
  let streamFormat = -1;
  let streamStartFrame = 1;

  while (reader.pos < reader.end && reader.valid) {
    const tagHeader = reader.readUint16();
    const code = tagHeader >> 6;
    const shortLength = tagHeader & 0x3f;
    const length = shortLength === 0x3f ? reader.readUint32() : shortLength;
    const bodyEnd = reader.pos + length;
    if (!reader.valid || bodyEnd > reader.end) return null;

    const body = new SwfReader(reader.source, reader.pos, bodyEnd);
    reader.pos = bodyEnd;
    if (code === TAG_END) break;
    if (code === TAG_SHOW_FRAME) {
      state.remainingFrameEntries -= placements.size + 1;
      if (state.remainingFrameEntries < 0) return null;
      frames.push(new Map(placements));
    } else if (code === TAG_DO_ABC || code === TAG_DO_ABC_ANONYMOUS) {
      state.abcBlobs.push({ bytes: readSwfAbcPayload(body, code === TAG_DO_ABC), named: code === TAG_DO_ABC });
    } else if (code === TAG_DO_INIT_ACTION) {
      // An init action runs once for the sprite it names, before that sprite's own first frame, so a
      // recognized block belongs to frame 1 of that sprite rather than to the timeline reading the tag.
      const spriteId = body.readUint16();
      const script = readSwfFrameActions(new SwfReader(body.source, body.pos, body.end));
      if (script === null) {
        // Same decline as DoAction below and the same Skip reasoning: the bytecode is outside this
        // importer's scope by charter rather than data it failed to read. It reports the sprite it names
        // rather than a frame, because an init action runs before that sprite's first frame.
        reportImportDiagnostic(
          state.diagnostics,
          ImportDiagnosticSeverity.Skip,
          'swf.frame-script-declined',
          'readSwfTimeline',
          { capability: 'swf.script.do-init-action', characterId: spriteId },
        );
      } else {
        state.pendingInitActions.push({ characterId: spriteId, script });
      }
    } else if (code === TAG_DO_ACTION) {
      // A DoAction belongs to the frame being assembled — the one the next ShowFrame closes.
      const script = readSwfFrameActions(new SwfReader(body.source, body.pos, body.end));
      if (script !== null) actions.set(frames.length + 1, script);
      // A block is recognized only when EVERY action in it is a playback command, because honouring the
      // legible half would misrepresent what the frame does. Skip rather than Drop: the bytecode is
      // outside this importer's scope by charter, not data it failed to read.
      else {
        reportImportDiagnostic(
          state.diagnostics,
          ImportDiagnosticSeverity.Skip,
          'swf.frame-script-declined',
          'readSwfTimeline',
          {
            capability: 'swf.script.do-action',
            frame: frames.length + 1,
          },
        );
      }
    } else if (code === TAG_FRAME_LABEL) {
      addSwfTimelineLabel(labels, frames.length + 1, body.readString());
    } else if (code === TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA) {
      readSwfSceneAndFrameLabelData(body, labels, state.diagnostics);
    } else if (code === TAG_DEFINE_SCALING_GRID) {
      readSwfScalingGrid(body, state);
    } else if (code === TAG_PLACE_OBJECT) {
      readLegacyPlaceObject(body, placements);
    } else if (code === TAG_PLACE_OBJECT_2) {
      readPlaceObject(body, placements, false, state.diagnostics);
    } else if (code === TAG_REMOVE_OBJECT) {
      readLegacyRemoveObject(body, placements);
    } else if (code === TAG_REMOVE_OBJECT_2) {
      placements.delete(body.readUint16());
    } else if (code === TAG_JPEG_TABLES) {
      state.jpegTables = body.source.subarray(body.pos, body.end);
    } else if (code === TAG_DEFINE_BITS) {
      readSwfLegacyImageDefinition(body, state);
    } else if (code === TAG_DEFINE_BUTTON || code === TAG_DEFINE_BUTTON_2) {
      readSwfButtonDefinition(body, state, code === TAG_DEFINE_BUTTON_2 ? 2 : 1);
    } else if (code === TAG_DEFINE_FONT || code === TAG_DEFINE_FONT_2 || code === TAG_DEFINE_FONT_3) {
      readSwfFontDefinition(body, state, code);
    } else if (code === TAG_DEFINE_FONT_INFO || code === TAG_DEFINE_FONT_INFO_2) {
      readSwfFontInfo(body, state, code === TAG_DEFINE_FONT_INFO_2);
    } else if (code === TAG_SET_BACKGROUND_COLOR) {
      readSwfBackgroundColor(body, state);
    } else if (code === TAG_EXPORT_ASSETS || code === TAG_SYMBOL_CLASS) {
      readSwfLinkages(body, state.linkages);
    } else if (code === TAG_DEFINE_BITS_JPEG_2 || code === TAG_DEFINE_BITS_JPEG_3 || code === TAG_DEFINE_BITS_JPEG_4) {
      readSwfEmbeddedImageDefinition(body, state, code);
    } else if (code === TAG_DEFINE_BITS_LOSSLESS || code === TAG_DEFINE_BITS_LOSSLESS_2) {
      if (!readSwfLosslessBitmapDefinition(body, state, code === TAG_DEFINE_BITS_LOSSLESS_2)) return null;
    } else if (code === TAG_DEFINE_SOUND) {
      readSwfSoundDefinition(body, state);
    } else if (code === TAG_DEFINE_VIDEO_STREAM) {
      if (!readSwfVideoDefinition(body, state)) return null;
    } else if (isSwfBoundedDefinitionTag(code)) {
      if (!readSwfBoundedDefinition(body, state, code)) return null;
    } else if (code === TAG_DEFINE_SPRITE) {
      const spriteId = body.readUint16();
      body.readUint16();
      if (!body.valid || spriteId === 0 || state.definedCharacters.has(spriteId)) return null;
      state.definedCharacters.add(spriteId);
      const spriteReader = new SwfReader(body.source, body.pos, body.end);
      const spriteTimeline = readSwfTimeline(spriteReader, state);
      if (spriteTimeline === null || spriteReader.pos !== spriteReader.end) {
        return null;
      }
      state.sprites.set(spriteId, spriteTimeline);
    } else if (code === TAG_PLACE_OBJECT_3 || code === TAG_PLACE_OBJECT_4) {
      readPlaceObject(body, placements, true, state.diagnostics);
    } else if (code === TAG_START_SOUND) {
      readSwfStartSound(body, state, cues, frames.length + 1);
    } else if (code === TAG_START_SOUND_2) {
      readSwfStartSound2(body, state, cues, frames.length + 1);
    } else if (code === TAG_SOUND_STREAM_HEAD || code === TAG_SOUND_STREAM_HEAD_2) {
      const declared = readSwfSoundStreamHead(body);
      // A header declaring no samples per frame is the empty one an authoring tool writes into every
      // sprite. Only a header that promises samples starts a stream.
      if (declared >= 0) {
        streamFormat = declared;
        streamStartFrame = frames.length + 1;
      }
    } else if (code === TAG_SOUND_STREAM_BLOCK) {
      if (streamFormat === SOUND_FORMAT_MP3) {
        // Each MP3 block leads with its own sample count and seek offset; only the frames concatenate.
        body.readUint16();
        body.readUint16();
        if (body.valid && body.pos < body.end) streamChunks.push(body.source.subarray(body.pos, body.end));
      } else if (streamFormat >= 0) {
        reportImportDiagnostic(
          state.diagnostics,
          ImportDiagnosticSeverity.Skip,
          'swf.stream-sound-format',
          'readSwfTimeline',
          {
            capability: 'swf.axis.sound-format-non-mp3',
            format: streamFormat,
          },
        );
      }
    } else {
      reportSwfDeclinedTag(state.diagnostics, code);
    }
    if (!body.valid) return null;
  }

  if (!reader.valid) return null;
  // A timeline that never shows a frame still has the one display list its tags built.
  if (frames.length === 0) frames.push(placements);
  appendSwfStreamSoundCue(state, cues, streamChunks, streamStartFrame);
  // A label or cue authored after the last ShowFrame names a frame the timeline never reaches, so it is
  // dropped rather than bound to a frame that does not exist. Found by auditing the claim rather than the
  // wire: `swf.scene-names` covered only the scene table, while THIS is the other way that tag's data is
  // lost, and silence about it was being reported as trustworthy.
  const reachableCues = cues.filter((cue) => cue.frame <= frames.length);
  const reachableLabels = labels.filter((label) => label.frame <= frames.length);
  if (reachableLabels.length !== labels.length) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.label-past-last-frame',
      'readSwfTimeline',
      {
        capability: 'swf.timeline.frame-label',
        dropped: labels.length - reachableLabels.length,
        frames: frames.length,
      },
    );
  }
  if (reachableCues.length !== cues.length) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.cue-past-last-frame',
      'readSwfTimeline',
      {
        dropped: cues.length - reachableCues.length,
        frames: frames.length,
      },
    );
  }
  return {
    actions,
    cues: reachableCues,
    frames,
    labels: reachableLabels.sort(compareSwfTimelineLabelFrame),
  };
}

// Reports the tags this importer deliberately reads past that cost a real capability, and stays silent on
// the ones that cost nothing. The line matters: a document is not worse off for having skipped
// `FileAttributes` or a font's hinting table, so reporting those would bury the entries that do mean
// something under noise a caller has to filter. Every code below is a decision recorded in
// `agents/packages/swf/tag-coverage.md`, not an unrecognized tag.
function reportSwfDeclinedTag(diagnostics: ImportDiagnostic[] | undefined, code: number): void {
  if (diagnostics === undefined) return;
  const kind = SWF_DECLINED_TAG_KINDS.get(code);
  if (kind === undefined) return;
  const capability = SWF_DECLINED_TAG_CAPABILITIES.get(code);
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Skip,
    kind,
    'readSwfTimeline',
    capability === undefined ? { tag: code } : { capability, tag: code },
  );
}

// The stage colour, as an RGB record. SWF gives it no alpha, and a stage is opaque, so it packs to fully
// opaque RGBA. Last declaration wins, matching how a player applies the most recent one it has read.
// A button is a display character whose content is a small display list per interaction state. A document
// is a still scene, so the up state is what it holds — the same thing a player shows before any pointer
// touches it — and the other states are dropped rather than layered invisibly on top of one another.
//
// The up state is expressed as a one-frame timeline, so a button instantiates, bounds, nests, and masks
// through exactly the same path a sprite does and needs no separate node kind.
function readSwfButtonDefinition(body: Readonly<SwfReader>, state: SwfParseState, version: number): void {
  const reader = new SwfReader(body.source, body.pos, body.end);
  const buttonId = reader.readUint16();
  if (version === 2) {
    reader.readUint8();
    reader.readUint16();
  }
  if (!reader.valid || buttonId === 0 || state.definedCharacters.has(buttonId)) return;

  const placements = new Map<number, SwfPlacement>();
  for (let records = 0; records < MAX_BUTTON_RECORDS; records++) {
    const flags = reader.readUint8();
    if (!reader.valid) return;
    if (flags === 0) break;

    const characterId = reader.readUint16();
    const depth = reader.readUint16();
    const matrix = readSwfMatrix(reader);
    const colorTransform = version === 2 ? readSwfColorTransform(reader) : null;
    if (!reader.valid) return;
    if ((flags & BUTTON_STATE_UP) === 0 && characterId !== 0) {
      // A document is a still scene, so only the up state is held. The other states are a real capability
      // gap rather than data this decoder could not read, which is why they Skip rather than Drop.
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Skip,
        'swf.button-interaction-state',
        'readSwfButtonDefinition',
        {
          characterId,
          flags,
        },
      );
    }
    if ((flags & BUTTON_STATE_UP) !== 0 && characterId !== 0) {
      placements.set(depth, {
        advancedBlendMode: null,
        alpha: colorTransform?.alpha ?? 1,
        blendMode: BlendMode.Normal,
        characterId,
        clipDepth: 0,
        colorAdjustments: colorTransform?.colorAdjustments ?? null,
        colorTransformAdjustments: colorTransform?.colorAdjustments ?? null,
        depth,
        directLinkage: null,
        effects: EMPTY_EFFECTS,
        filterAdjustments: EMPTY_ADJUSTMENTS,
        matrix,
        name: null,
        ratio: 0,
      });
    }
    // A filter list has no fixed width, so a record carrying one would desynchronize every record after
    // it. Stopping keeps what was read rather than misreading the rest.
    if ((flags & BUTTON_HAS_FILTER_LIST) !== 0) break;
    if ((flags & BUTTON_HAS_BLEND_MODE) !== 0) reader.readUint8();
  }

  state.definedCharacters.add(buttonId);
  // A button's up state is a still one-frame display list; nothing about it is edge-triggered.
  state.sprites.set(buttonId, { actions: new Map<number, FrameScript>(), cues: [], frames: [placements], labels: [] });
}

// Font glyphs decode on a reader of their own, so a font this decoder cannot read costs its glyphs and
// nothing else. A font declares no placeable bounds and is never itself placed — it is a table the text
// definitions draw from.
function readSwfFontDefinition(body: Readonly<SwfReader>, state: SwfParseState, code: number): void {
  const version = code === TAG_DEFINE_FONT ? 1 : code === TAG_DEFINE_FONT_2 ? 2 : 3;
  const reader = new SwfReader(body.source, body.pos, body.end);
  const fontId = reader.source[body.pos] + reader.source[body.pos + 1] * 0x100;
  const source = readSwfFontGlyphOutlineSource(reader, version, state.diagnostics, fontId);
  // A glyph table this decoder cannot read at all costs the WHOLE font, not one glyph, so it is a
  // separate loss from `swf.font-glyph-outline` and must report separately: without this, a font that
  // vanished entirely and a font that imported cleanly both produce no crumb.
  if (source === null) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.font-glyph-table',
      'readSwfFontDefinition',
      {
        capability: version === 1 ? 'swf.font.define-font' : `swf.font.define-font-${version}`,
        characterId: fontId,
      },
    );
    return;
  }
  if (fontId === 0) return;
  if (state.fontOutlineSources.has(fontId)) {
    // Every other definition kind rejects the document on a repeated character id; fonts do not, so the
    // second table silently replaces the first. The document imports, the font exists, and it is the
    // wrong font — no existence check and no count can see that, which is why it is reported here.
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.font-character-id-reused',
      'readSwfFontDefinition',
      {
        capability: version === 1 ? 'swf.font.define-font' : `swf.font.define-font-${version}`,
        characterId: fontId,
      },
    );
  }
  state.fontOutlineSources.set(fontId, source);
  const fontName = readSwfFontName(body, version);
  if (fontName !== '') state.fontNames.set(fontId, fontName);
}

// DefineFont's original form predates embedded character codes. DefineFontInfo/2 supplies its parallel
// code table in a separate tag, which may appear before or after the font definition. Keep that metadata
// during the tag walk and compose it only once every timeline has been visited.
function readSwfFontInfo(body: SwfReader, state: SwfParseState, hasLanguage: boolean): void {
  const fontId = body.readUint16();
  const nameLength = body.readUint8();
  for (let index = 0; index < nameLength; index++) body.readUint8();
  const flags = body.readUint8();
  if (hasLanguage) body.readUint8();
  if (!body.valid || fontId === 0) return;

  const codePoints: number[] = [];
  const wideCodes = (flags & FONT_INFO_FLAG_WIDE_CODES) !== 0;
  while (body.pos < body.end && body.valid) codePoints.push(wideCodes ? body.readUint16() : body.readUint8());
  if (body.valid) state.fontCodePoints.set(fontId, codePoints);
}

function composeSwfFontCodePoints(state: SwfParseState): void {
  for (const [fontId, codePoints] of state.fontCodePoints) {
    const source = state.fontOutlineSources.get(fontId);
    if (source === undefined) continue;
    const codepointToGlyphIndex = new Map<number, number>();
    for (let glyphIndex = 0; glyphIndex < codePoints.length; glyphIndex++) {
      const codePoint = codePoints[glyphIndex];
      if (!codepointToGlyphIndex.has(codePoint)) codepointToGlyphIndex.set(codePoint, glyphIndex);
    }
    state.fontOutlineSources.set(fontId, {
      getGlyphOutline: (out, glyphIndex) => source.getGlyphOutline(out, glyphIndex),
      getGlyphOutlineAdvance: (glyphIndex) => source.getGlyphOutlineAdvance(glyphIndex),
      getGlyphOutlineIndexForCodePoint: (codePoint) => codepointToGlyphIndex.get(codePoint) ?? -1,
      getGlyphOutlineMetrics: () => source.getGlyphOutlineMetrics(),
    });
  }
}

// A version 2 or 3 font names its family between its flags and its glyph count. A version 1 font carries
// no name of its own; a DefineFontInfo tag supplies one, which this importer does not yet read.
function readSwfFontName(body: Readonly<SwfReader>, version: number): string {
  if (version === 1) return '';
  const reader = new SwfReader(body.source, body.pos + 2, body.end);
  reader.readUint8();
  reader.readUint8();
  const length = reader.readUint8();
  if (!reader.valid || length === 0 || reader.pos + length > reader.end) return '';
  return _fontNameDecoder.decode(body.source.subarray(reader.pos, reader.pos + length));
}

function readSwfBackgroundColor(body: SwfReader, state: SwfParseState): void {
  const red = body.readUint8();
  const green = body.readUint8();
  const blue = body.readUint8();
  if (!body.valid) return;
  state.backgroundColor = red * 0x1000000 + green * 0x10000 + blue * 0x100 + 0xff;
}

function addSwfTimelineLabel(labels: TimelineLabel[], frame: number, name: string): void {
  if (!name || labels.some((label) => label.frame === frame && label.name === name)) return;
  labels.push({ frame, name });
}

function compareSwfTimelineLabelFrame(a: Readonly<TimelineLabel>, b: Readonly<TimelineLabel>): number {
  return a.frame - b.frame;
}

// DefineSceneAndFrameLabelData carries the whole root timeline's scene and label tables in one record, so
// a file that uses it declares no FrameLabel tags. Its frame offsets are zero-based. The scene table is
// read to reach the label table that follows it; scene names are a separate authoring concept from a frame
// label and are not imported as one.
// DefineScalingGrid names the sprite it applies to and the centre rectangle of that sprite's nine-slice
// grid. The tag can precede or follow the sprite it names, so this only records the pair; instantiation
// decides what a grid can be applied to.
function readSwfScalingGrid(body: SwfReader, state: SwfParseState): void {
  const characterId = body.readUint16();
  const splitter = readSwfRectangle(body);
  if (!body.valid || characterId === 0 || splitter === null) return;
  state.scalingGrids.set(characterId, splitter);
}

function readSwfSceneAndFrameLabelData(
  body: SwfReader,
  labels: TimelineLabel[],
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const sceneCount = body.readEncodedUint32();
  for (let i = 0; i < sceneCount && body.valid; i++) {
    body.readEncodedUint32();
    body.readString();
  }
  // Scene names are read past to reach the label table behind them. Skip rather than Drop: Flight has
  // frame labels but no subject for a named frame range, so this is a capability gap rather than data
  // this decoder failed to read.
  if (sceneCount > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'swf.scene-names',
      'readSwfSceneAndFrameLabelData',
      {
        capability: 'swf.timeline.define-scene-and-frame-label-data',
        sceneCount,
      },
    );
  }
  const labelCount = body.readEncodedUint32();
  for (let i = 0; i < labelCount && body.valid; i++) {
    const frame = body.readEncodedUint32();
    const name = body.readString();
    if (body.valid) addSwfTimelineLabel(labels, frame + 1, name);
  }
}

function isSwfBoundedDefinitionTag(code: number): boolean {
  return (
    code === TAG_DEFINE_SHAPE ||
    code === TAG_DEFINE_SHAPE_2 ||
    code === TAG_DEFINE_SHAPE_3 ||
    code === TAG_DEFINE_SHAPE_4 ||
    code === TAG_DEFINE_TEXT ||
    code === TAG_DEFINE_TEXT_2 ||
    code === TAG_DEFINE_EDIT_TEXT ||
    code === TAG_DEFINE_MORPH_SHAPE ||
    code === TAG_DEFINE_MORPH_SHAPE_2
  );
}

function readSwfBoundedDefinition(body: SwfReader, state: SwfParseState, code: number): boolean {
  const hasEndBounds = code === TAG_DEFINE_MORPH_SHAPE || code === TAG_DEFINE_MORPH_SHAPE_2;
  const characterId = body.readUint16();
  const startBounds = readSwfRectangle(body);
  const endBounds = hasEndBounds ? readSwfRectangle(body) : null;
  if (
    !body.valid ||
    characterId === 0 ||
    startBounds === null ||
    (hasEndBounds && endBounds === null) ||
    state.definedCharacters.has(characterId)
  ) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, endBounds === null ? startBounds : mergeSwfRectangles(startBounds, endBounds));
  // The merged box is what everything that only needs an extent reads. A morph additionally keeps its two
  // endpoints, because its own box moves with its ratio.
  if (endBounds !== null) state.morphBounds.set(characterId, { end: endBounds, start: startBounds });

  const version = resolveSwfShapeVersion(code);
  if (version > 0) readSwfShapeBody(body, state, characterId, version);
  const morphVersion = resolveSwfMorphShapeVersion(code);
  if (morphVersion > 0) readSwfMorphShapeBody(body, state, characterId, morphVersion);
  // A static text definition is queued rather than composed: its records address glyphs by index into a
  // font that may not have been read yet. Everything after the bounds and the definition matrix is its
  // record stream.
  if (code === TAG_DEFINE_EDIT_TEXT) {
    const reader = new SwfReader(body.source, body.pos, body.end);
    const bounds = state.characterBounds.get(characterId);
    const factory = readSwfEditTextFactory(reader, bounds?.width ?? 0, bounds?.height ?? 0);
    if (factory === null) {
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'swf.edit-text-unparseable',
        'readSwfBoundedDefinition',
        { capability: 'swf.text.define-edit-text', characterId },
      );
    } else {
      state.editTexts.set(characterId, factory);
    }
  }
  if (code === TAG_DEFINE_TEXT || code === TAG_DEFINE_TEXT_2) {
    const reader = new SwfReader(body.source, body.pos, body.end);
    readSwfMatrix(reader);
    if (reader.valid) {
      state.pendingTexts.push({
        characterId,
        end: body.end,
        start: reader.pos,
        version: code === TAG_DEFINE_TEXT ? 1 : 2,
      });
    }
  }
  return true;
}

// Decodes a shape definition's geometry on a reader of its own, so a body this decoder cannot read costs
// only that body's geometry. The definition keeps its authored bounds and contributes no drawing, which
// is what every shape did before any geometry was decoded, rather than failing the whole document.
function readSwfShapeBody(body: Readonly<SwfReader>, state: SwfParseState, characterId: number, version: number): void {
  const reader = new SwfReader(body.source, body.pos, body.end);
  if (version >= 4) {
    // Shape 4 carries an edge-bounds RECT and a flags byte between its bounds and its styles.
    readSwfRectangle(reader);
    reader.readUint8();
  }
  if (!reader.valid) return;
  // The fill's character is not this shape's, hence the distinct name: a bitmap fill names whatever
  // character carries its pixels, which may be defined later in the tag stream.
  const shape = createSwfShape(
    reader,
    version,
    (fillCharacterId, repeat, smoothed) => acquireSwfImageTexture(state, fillCharacterId, repeat, smoothed),
    state.diagnostics,
  );
  if (shape === null) {
    // Recover rather than Drop: the character survives as the bounded placeholder it was before any
    // geometry existed, so the document still places and sizes it — only the drawing is missing.
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Recover,
      'swf.shape-body-unreadable',
      'readSwfShapeDefinition',
      {
        capability: version === 1 ? 'swf.shape.define-shape' : `swf.shape.define-shape-${version}`,
        characterId,
        version,
      },
    );
    return;
  }
  state.shapes.set(characterId, shape);
}

// Decodes a morph definition's geometry and paint on a reader of its own, so a body this decoder cannot
// read costs only that body. The definition keeps its authored bounds and contributes no drawing, which
// is the same degradation a static shape gets.
function readSwfMorphShapeBody(
  body: Readonly<SwfReader>,
  state: SwfParseState,
  characterId: number,
  version: number,
): void {
  // A morph is stored as a factory rather than a node: progress is per placement, so two placements of
  // one character sit at different points along the same morph and cannot share one node's sampled path.
  // Decoding is deferred to first use, so a definition nothing places costs only its bytes.
  const source = body.source;
  const start = body.pos;
  const end = body.end;
  // Only the parse-time validation call carries the sink. The stored closure runs again per placement,
  // potentially long after import returned, and a sink written to then would append to a collection
  // whose consumer has already read it.
  const decode = (diagnostics?: ImportDiagnostic[]): MorphShape | null =>
    createSwfMorphShape(
      new SwfReader(source, start, end),
      version,
      (fillCharacterId, repeat, smoothed) => acquireSwfImageTexture(state, fillCharacterId, repeat, smoothed),
      diagnostics,
    );
  if (decode(state.diagnostics) === null) {
    // The character is simply absent from the document afterwards, so without this the loss has no
    // signal at all: a placement of it resolves to nothing and the import still reports success.
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.morph-shape-undecodable',
      'readSwfMorphShapeBody',
      { capability: version === 2 ? 'swf.morph.define-morph-shape-2' : 'swf.morph.define-morph-shape', characterId },
    );
    return;
  }
  state.morphShapes.set(characterId, decode);
}

function resolveSwfMorphShapeVersion(code: number): number {
  if (code === TAG_DEFINE_MORPH_SHAPE) return 1;
  return code === TAG_DEFINE_MORPH_SHAPE_2 ? 2 : 0;
}

function resolveSwfShapeVersion(code: number): number {
  if (code === TAG_DEFINE_SHAPE) return 1;
  if (code === TAG_DEFINE_SHAPE_2) return 2;
  if (code === TAG_DEFINE_SHAPE_3) return 3;
  return code === TAG_DEFINE_SHAPE_4 ? 4 : 0;
}

// The legacy split-JPEG form: DefineBits carries an image whose encoding tables were factored out into a
// single JPEGTables tag shared by every such image in the file. Neither half is a valid JPEG alone, so
// they are spliced — the tables lose their end-of-image marker and the image its start-of-image marker —
// and the result travels as an ordinary encoded payload for the resolve step, exactly like a self-contained
// one. A pair that will not splice into something readable contributes no image and leaves the rest of the
// document alone: real files carry these halves inside sprites and in either order, so failing the whole
// import over one of them would cost far more than the image is worth.
function readSwfLegacyImageDefinition(body: SwfReader, state: SwfParseState): void {
  const characterId = body.readUint16();
  if (!body.valid || characterId === 0 || state.definedCharacters.has(characterId)) return;
  const tables = state.jpegTables;
  if (tables === null) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.jpeg-tables-missing',
      'readSwfLegacyImageDefinition',
      {
        capability: 'swf.bitmap.define-bits-jpeg-tables',
        characterId,
      },
    );
    return;
  }

  const tablesEnd =
    tables.length >= 2 && tables[tables.length - 2] === 0xff && tables[tables.length - 1] === JPEG_END_OF_IMAGE
      ? tables.length - 2
      : tables.length;
  const imageStart =
    body.source[body.pos] === 0xff && body.source[body.pos + 1] === JPEG_START_OF_IMAGE ? body.pos + 2 : body.pos;
  const spliced = new Uint8Array(tablesEnd + (body.end - imageStart));
  spliced.set(tables.subarray(0, tablesEnd));
  spliced.set(body.source.subarray(imageStart, body.end), tablesEnd);

  const image = readSwfEmbeddedImage(spliced, 0, spliced.length);
  if (image === null) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.jpeg-tables-unsplittable',
      'readSwfLegacyImageDefinition',
      {
        capability: 'swf.bitmap.define-bits-jpeg-tables',
        characterId,
      },
    );
    return;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, image.bounds);
  state.images.set(characterId, { bytes: spliced, mimeType: image.mimeType });
}

// An image this decoder cannot read contributes no image and leaves the document alone, the same way an
// unreadable shape body, font glyph, or legacy image pair does. Failing a whole document over one picture
// costs far more than the picture is worth.
function readSwfEmbeddedImageDefinition(body: SwfReader, state: SwfParseState, code: number): void {
  const characterId = body.readUint16();
  let deblockingParameterRaw: number | null = null;
  let imageStart = body.pos;
  let imageEnd = body.end;
  let hasAlphaPayload = false;
  if (code === TAG_DEFINE_BITS_JPEG_3 || code === TAG_DEFINE_BITS_JPEG_4) {
    hasAlphaPayload = true;
    const alphaDataOffset = body.readUint32();
    const alphaOffsetBase = body.pos;
    if (code === TAG_DEFINE_BITS_JPEG_4) deblockingParameterRaw = body.readUint16();
    imageStart = body.pos;
    imageEnd = alphaOffsetBase + alphaDataOffset;
  }
  if (
    !body.valid ||
    characterId === 0 ||
    imageEnd < imageStart ||
    imageEnd > body.end ||
    state.definedCharacters.has(characterId)
  ) {
    return;
  }
  const image = readSwfEmbeddedImage(body.source, imageStart, imageEnd);
  if (image === null) return;
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, image.bounds);
  state.images.set(characterId, {
    bytes: stripSwfJpegStreamBoundary(body.source, imageStart, imageEnd, image.mimeType),
    mimeType: image.mimeType,
  });
  if (hasAlphaPayload) {
    const compressedAlphaBytes = body.source.subarray(imageEnd, body.end);
    state.jpegAlphaPayloads.set(characterId, {
      characterId,
      compressedAlphaBytes,
      deblockingParameterRaw,
      height: image.bounds.height,
      width: image.bounds.width,
    });
    // The full report retains this stream, but the document's colour reference still resolves without
    // applying it. Keep the existing fidelity diagnostic until the separately-gated composition stage.
    if (compressedAlphaBytes.length > 0) {
      reportImportDiagnostic(
        state.diagnostics,
        // Skip: the alpha stream is recognized and deliberately not applied until the composition stage
        // exists. A capability gap on a well-formed file, with no substitute written.
        ImportDiagnosticSeverity.Skip,
        'swf.jpeg-alpha-stream',
        'readSwfEmbeddedImageDefinition',
        {
          capability:
            code === TAG_DEFINE_BITS_JPEG_3 ? 'swf.bitmap.define-bits-jpeg-3' : 'swf.bitmap.define-bits-jpeg-4',
          characterId,
          discardedBytes: compressedAlphaBytes.length,
        },
      );
    }
  }
  return;
}

// Identifies an embedded payload by its magic bytes and reads the dimensions out of its header, without
// decoding a pixel. The media type travels with the bytes so a resolver can dispatch on format.
// Removes the end-of-image / start-of-image pair the legacy two-stream layout leaves in the middle of a
// JPEG. The bytes on either side are one valid stream once it is gone, and a strict decoder is entitled to
// stop at that marker, so a resolver should never have to know the file's history to read the image.
function stripSwfJpegStreamBoundary(source: Uint8Array, start: number, end: number, mimeType: string): Uint8Array {
  if (mimeType !== JPEG_MIME_TYPE) return source.subarray(start, end);
  for (let pos = start; pos + 3 < end; pos++) {
    if (
      source[pos] === 0xff &&
      source[pos + 1] === JPEG_END_OF_IMAGE &&
      source[pos + 2] === 0xff &&
      source[pos + 3] === JPEG_START_OF_IMAGE
    ) {
      const spliced = new Uint8Array(end - start - 4);
      spliced.set(source.subarray(start, pos));
      spliced.set(source.subarray(pos + 4, end), pos - start);
      return spliced;
    }
  }
  return source.subarray(start, end);
}

function readSwfEmbeddedImage(
  source: Uint8Array,
  start: number,
  end: number,
): { bounds: SwfRectangle; mimeType: string } | null {
  if (
    end - start >= 24 &&
    source[start] === 0x89 &&
    source[start + 1] === 0x50 &&
    source[start + 2] === 0x4e &&
    source[start + 3] === 0x47 &&
    source[start + 4] === 0x0d &&
    source[start + 5] === 0x0a &&
    source[start + 6] === 0x1a &&
    source[start + 7] === 0x0a &&
    readBigEndianUint32(source, start + 8) === 13 &&
    source[start + 12] === 0x49 &&
    source[start + 13] === 0x48 &&
    source[start + 14] === 0x44 &&
    source[start + 15] === 0x52
  ) {
    const bounds = createSwfDimensionBounds(
      readBigEndianUint32(source, start + 16),
      readBigEndianUint32(source, start + 20),
    );
    return bounds === null ? null : { bounds, mimeType: PNG_MIME_TYPE };
  }

  if (
    end - start >= 10 &&
    source[start] === 0x47 &&
    source[start + 1] === 0x49 &&
    source[start + 2] === 0x46 &&
    source[start + 3] === 0x38 &&
    (source[start + 4] === 0x37 || source[start + 4] === 0x39) &&
    source[start + 5] === 0x61
  ) {
    const bounds = createSwfDimensionBounds(
      source[start + 6] + source[start + 7] * 0x100,
      source[start + 8] + source[start + 9] * 0x100,
    );
    return bounds === null ? null : { bounds, mimeType: GIF_MIME_TYPE };
  }

  if (end - start < 4 || source[start] !== 0xff || source[start + 1] !== JPEG_START_OF_IMAGE) return null;
  let pos = start + 2;
  while (pos < end) {
    if (source[pos++] !== 0xff) return null;
    while (pos < end && source[pos] === 0xff) pos++;
    if (pos >= end) return null;
    const marker = source[pos++];
    if (marker === JPEG_START_OF_SCAN) return null;
    // Encoders of the era wrote the encoding tables and the image as two concatenated streams, so an
    // end-of-image commonly sits before the frame header with a second start-of-image after it. Treating
    // that first marker as the end of the file would abandon the scan before it ever reached the
    // dimensions.
    if (marker === JPEG_END_OF_IMAGE) {
      if (pos + 1 < end && source[pos] === 0xff && source[pos + 1] === JPEG_START_OF_IMAGE) continue;
      return null;
    }
    if (marker === JPEG_START_OF_IMAGE || marker === JPEG_TEMPORARY || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 2 > end) return null;
    const length = readBigEndianUint16(source, pos);
    if (length < 2 || pos + length > end) return null;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== JPEG_DEFINE_HUFFMAN_TABLES &&
      marker !== JPEG_EXTENSION &&
      marker !== JPEG_DEFINE_ARITHMETIC_CODING
    ) {
      if (length < 7) return null;
      const bounds = createSwfDimensionBounds(
        readBigEndianUint16(source, pos + 5),
        readBigEndianUint16(source, pos + 3),
      );
      return bounds === null ? null : { bounds, mimeType: JPEG_MIME_TYPE };
    }
    pos += length;
  }
  return null;
}

function createSwfDimensionBounds(width: number, height: number): SwfRectangle | null {
  return width === 0 || height === 0 ? null : { height, width, x: 0, y: 0 };
}

function readBigEndianUint16(source: Uint8Array, offset: number): number {
  return source[offset] * 0x100 + source[offset + 1];
}

function readBigEndianUint32(source: Uint8Array, offset: number): number {
  return source[offset] * 0x1000000 + source[offset + 1] * 0x10000 + source[offset + 2] * 0x100 + source[offset + 3];
}

function readSwfLosslessBitmapDefinition(body: SwfReader, state: SwfParseState, hasAlpha: boolean): boolean {
  const characterId = body.readUint16();
  // Everything after the character id is the payload a decoder needs: format, dimensions, an optional
  // colormap size, and the zlib-compressed pixels. It stays compressed here.
  const payloadStart = body.pos;
  const format = body.readUint8();
  const width = body.readUint16();
  const height = body.readUint16();
  if (format === LOSSLESS_BITMAP_FORMAT_COLORMAPPED) body.readUint8();
  const validFormat =
    format === LOSSLESS_BITMAP_FORMAT_COLORMAPPED ||
    format === LOSSLESS_BITMAP_FORMAT_32_BIT ||
    (!hasAlpha && format === LOSSLESS_BITMAP_FORMAT_15_BIT);
  if (
    !body.valid ||
    characterId === 0 ||
    width === 0 ||
    height === 0 ||
    state.definedCharacters.has(characterId) ||
    !validFormat
  ) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, { height, width, x: 0, y: 0 });
  state.images.set(characterId, {
    bytes: body.source.subarray(payloadStart, body.end),
    mimeType: hasAlpha ? SWF_LOSSLESS_ALPHA_MIME_TYPE : SWF_LOSSLESS_MIME_TYPE,
  });
  return true;
}

// Reads a stream header, returning the compression format when it declares a real stream and -1 when it
// does not. An authoring tool writes an empty header into practically every sprite, so the sample count is
// what separates a stream from that boilerplate.
function readSwfSoundStreamHead(body: SwfReader): number {
  body.readUint8();
  const streamFlags = body.readUint8();
  const samplesPerFrame = body.readUint16();
  if (!body.valid || samplesPerFrame === 0) return -1;
  return streamFlags >> 4;
}

// Joins a timeline's stream blocks into the one payload a decoder can take, and gives the timeline a cue to
// start it. SWF interleaves a stream with the display list so the two advance together, which is why the
// bytes arrive in pieces and why the cue names the frame the stream begins on rather than a duration.
function appendSwfStreamSoundCue(
  state: SwfParseState,
  cues: TimelineCue[],
  chunks: readonly Uint8Array[],
  startFrame: number,
): void {
  if (chunks.length === 0) return;
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  if (length === 0) return;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const resource = createAudioResource();
  state.streamSounds.push({ bytes, mimeType: 'audio/mpeg', resource });
  const cue: TimelineStreamAudioCue = createEntity({
    frame: startFrame,
    gain: 1,
    kind: TimelineStreamAudioCueKind,
    resource,
  });
  cues.push(cue);
}

// StartSound triggers a sound the library already defines, carrying a SOUNDINFO that says how to play it.
// It becomes a TimelineAudioCue rather than anything that plays: an importer emits authored data, and only
// a registered handler acts on it.
//
// Every position SOUNDINFO carries is a sample count, and the two kinds count differently — an envelope
// point is always in 44.1kHz samples whatever the sound's rate, while the in and out points are in the
// sound's own. The envelope converts here; the in/out pair waits, because the sound it names may be
// defined further down the tag stream and its rate is not known yet.
function readSwfStartSound(body: SwfReader, state: SwfParseState, cues: TimelineCue[], frame: number): void {
  const characterId = body.readUint16();
  const info = readSwfSoundInfo(body);
  if (characterId === 0 || info === null) return;
  const cue = createSwfAudioCue(info, frame, acquireSwfSoundResource(state, characterId));
  cues.push(cue);
  state.soundCuesAwaitingRate.push({ characterId, cue });
}

// StartSound2 names its sound by the class an AS3 file bound to it rather than by character id, so the
// trigger cannot be resolved where it is read: SymbolClass, which is what maps a class name back to a
// character, is written near the end of a file and practically always after the sprite that triggers it.
// The cue is built against a resource of its own and adopted into the character's once the name resolves.
function readSwfStartSound2(body: SwfReader, state: SwfParseState, cues: TimelineCue[], frame: number): void {
  const className = body.readString();
  const info = readSwfSoundInfo(body);
  if (className === '' || info === null) return;
  const cue = createSwfAudioCue(info, frame, createAudioResource());
  cues.push(cue);
  state.soundCuesAwaitingClass.push({ className, cue });
}

// Reads the SOUNDINFO both triggers carry, or null when it does not decode. Positions stay in the samples
// the format counted them in; only the envelope converts here, because its unit is fixed at 44.1kHz while
// the in and out points are in a sound's own rate and that sound may not have been read yet.
function readSwfSoundInfo(body: SwfReader): SwfSoundInfo | null {
  const flags = body.readUint8();
  if (!body.valid) return null;
  const inPointSamples = (flags & SOUND_INFO_HAS_IN_POINT) !== 0 ? body.readUint32() : 0;
  const outPointSamples = (flags & SOUND_INFO_HAS_OUT_POINT) !== 0 ? body.readUint32() : -1;
  const loopCount = (flags & SOUND_INFO_HAS_LOOPS) !== 0 ? body.readUint16() : 1;
  const envelope: TimelineAudioEnvelopePoint[] = [];
  if ((flags & SOUND_INFO_HAS_ENVELOPE) !== 0) {
    const points = body.readUint8();
    for (let i = 0; i < points && body.valid; i++) {
      const position = body.readUint32();
      const leftLevel = body.readUint16();
      const rightLevel = body.readUint16();
      if (!body.valid) return null;
      envelope.push({
        leftGain: Math.min(leftLevel, SOUND_ENVELOPE_LEVEL_ONE) / SOUND_ENVELOPE_LEVEL_ONE,
        rightGain: Math.min(rightLevel, SOUND_ENVELOPE_LEVEL_ONE) / SOUND_ENVELOPE_LEVEL_ONE,
        time: position / SOUND_ENVELOPE_RATE,
      });
    }
  }
  if (!body.valid) return null;
  return {
    envelope,
    inPointSamples,
    loopCount,
    outPointSamples,
    skipIfPlaying: (flags & SOUND_INFO_SYNC_NO_MULTIPLE) !== 0,
    stop: (flags & SOUND_INFO_SYNC_STOP) !== 0,
  };
}

// Builds the cue one trigger becomes. A stop names the sound to silence and nothing else: every play field
// SOUNDINFO carries alongside it describes a playback being ended rather than started.
function createSwfAudioCue(info: Readonly<SwfSoundInfo>, frame: number, resource: AudioResource): TimelineAudioCue {
  return createEntity({
    duration: info.stop || info.outPointSamples < 0 ? null : info.outPointSamples,
    envelope: info.stop ? [] : info.envelope,
    frame,
    gain: 1,
    kind: TimelineAudioCueKind,
    // SWF counts the first play as a loop; a timeline cue counts repeats, so one means play once.
    loops: info.stop ? 1 : Math.max(1, info.loopCount),
    offset: info.stop ? 0 : info.inPointSamples,
    resource,
    // Do not start this sound if it is already playing — Flash's "Start" sync, as against "Event", which
    // stacks a fresh copy every time the frame is entered.
    skipIfPlaying: !info.stop && info.skipIfPlaying,
    stop: info.stop,
  });
}

// Pairs every class-named trigger with the character its class was bound to, now that the whole tag stream
// has been walked. A cue whose class nothing declared keeps the resource it was built with: the trigger is
// real and the document simply never carried the sound it names.
function resolveSwfSoundClassCues(state: SwfParseState): void {
  if (state.soundCuesAwaitingClass.length === 0) return;
  const characterIds = new Map<string, number>();
  for (const [characterId, name] of state.linkages) characterIds.set(name, characterId);
  for (const pending of state.soundCuesAwaitingClass) {
    const characterId = characterIds.get(pending.className);
    if (characterId === undefined) continue;
    const existing = state.soundResources.get(characterId);
    // First trigger to name the character donates its resource; later ones adopt it, so every cue over one
    // sound still shares the single resource the document's reference fills.
    if (existing === undefined) state.soundResources.set(characterId, pending.cue.resource);
    else pending.cue.resource = existing;
    state.soundCuesAwaitingRate.push({ characterId, cue: pending.cue });
  }
}

// Converts the in and out points held in sample counts into the seconds a cue carries, once every sound's
// rate is known. A cue naming a sound the file never defined keeps its samples rather than guessing a rate.
function convertSwfSoundCueTimes(state: SwfParseState): void {
  for (const pending of state.soundCuesAwaitingRate) {
    const sound = state.sounds.get(pending.characterId);
    if (sound === undefined) continue;
    const inPoint = pending.cue.offset / sound.sampleRate;
    // SWF's out point is the last sample to play, so the span is measured from the in point.
    pending.cue.duration = pending.cue.duration === null ? null : pending.cue.duration / sound.sampleRate - inPoint;
    pending.cue.offset = inPoint;
  }
}

// Returns the one AudioResource every cue naming this sound shares, creating it on first mention. A cue can
// name a sound the tag stream has not reached, so this cannot wait for the payload.
function acquireSwfSoundResource(state: SwfParseState, characterId: number): AudioResource {
  const existing = state.soundResources.get(characterId);
  if (existing !== undefined) return existing;
  const resource = createAudioResource();
  state.soundResources.set(characterId, resource);
  return resource;
}

// DefineSound carries a whole event sound in one tag: a four-bit format, the playback rate/width/channel
// fields, a sample count, and the encoded payload. Only the format decides whether anything downstream can
// decode it, so that is what this keeps alongside the bytes — the rate and channel fields describe what the
// payload already says, and every format Flash could emit is self-describing to a decoder that knows it.
//
// A sound whose format has no standard container is retained rather than dropped: the bytes are the only
// copy, and a reference with a null MIME type is a sound waiting for a decoder instead of a sound lost.
function readSwfSoundDefinition(body: SwfReader, state: SwfParseState): void {
  const characterId = body.readUint16();
  const flags = body.readUint8();
  body.readUint32();
  if (!body.valid || characterId === 0 || state.sounds.has(characterId)) return;
  const format = flags >> 4;
  // An MP3 payload leads with a signed 16-bit seek offset that is not part of the bitstream, so the frames
  // a decoder wants start after it. Every other format's payload begins immediately.
  if (format === SOUND_FORMAT_MP3) body.readUint16();
  if (!body.valid) return;
  state.sounds.set(characterId, {
    bytes: body.source.subarray(body.pos, body.end),
    mimeType: createSwfSoundMimeType(format, flags),
    sampleRate: resolveSwfSoundSampleRate(format, flags),
  });
}

// Names the format a sound is in, so a decoder can be registered against it before one exists. Only MP3 is
// a type the platform already knows; the rest take a vendor type carrying the sample rate, channel count,
// and sample width that their bitstreams do not encode and a decoder cannot work without. Tagging beats
// leaving them null, because a null type is indistinguishable from bytes nobody identified.
//
// Returns null only for a format code SWF never defined, which is a sound this cannot describe at all.
function createSwfSoundMimeType(format: number, flags: number): string | null {
  if (format === SOUND_FORMAT_MP3) return 'audio/mpeg';
  const essence = SWF_SOUND_MIME_ESSENCES[format];
  if (essence === undefined) return null;
  const channels = (flags & 0x01) === 0 ? 1 : 2;
  const bits = (flags & 0x02) === 0 ? 8 : 16;
  return `${essence}; rate=${resolveSwfSoundSampleRate(format, flags)}; channels=${channels}; bits=${bits}`;
}

// Nellymoser 8k and 16k encode their rate in the format code itself, and the header's rate field is not
// what those decode at, so the code wins where the two disagree.
function resolveSwfSoundSampleRate(format: number, flags: number): number {
  if (format === SOUND_FORMAT_NELLYMOSER_8K) return 8000;
  if (format === SOUND_FORMAT_NELLYMOSER_16K) return 16000;
  return SWF_SOUND_RATES[(flags >> 2) & 0x03];
}

function readSwfVideoDefinition(body: SwfReader, state: SwfParseState): boolean {
  const characterId = body.readUint16();
  const frameCount = body.readUint16();
  const width = body.readUint16();
  const height = body.readUint16();
  const flags = body.readUint8();
  const codecId = body.readUint8();
  if (!body.valid || characterId === 0 || width === 0 || height === 0 || state.definedCharacters.has(characterId)) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, { height, width, x: 0, y: 0 });
  state.videos.set(characterId, {
    codecId,
    deblocking: (flags >> 1) & 0x07,
    frameCount,
    height,
    smoothing: (flags & 0x01) !== 0,
    width,
  });
  return true;
}

const CWS_SIGNATURE = 0x43;
const ALPHA_CHANNEL = 3;
const EMPTY_ADJUSTMENTS: readonly Adjustment[] = [];
// A placement with no filter list shares one empty array, so an untouched effect list compares equal by
// reference across every frame and instance.
const EMPTY_EFFECTS: readonly RenderEffect[] = [];
// A colour transform's add terms are byte-domain, where 255 adds one whole channel; a ColorScaleBias
// carries the same quantity normalized.
const COLOR_CHANNEL_ONE = 0xff;
const FIXED_8_8_ONE = 0x100;
const FIXED_16_ONE = 0x10000;
const FWS_SIGNATURE = 0x46;
const GIF_MIME_TYPE = 'image/gif';
const IDENTITY_MATRIX: SwfMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const JPEG_DEFINE_ARITHMETIC_CODING = 0xcc;
const JPEG_DEFINE_HUFFMAN_TABLES = 0xc4;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_MIME_TYPE = 'image/jpeg';
const JPEG_EXTENSION = 0xc8;
const JPEG_START_OF_IMAGE = 0xd8;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_TEMPORARY = 0x01;
const LOSSLESS_BITMAP_FORMAT_15_BIT = 4;
const LOSSLESS_BITMAP_FORMAT_32_BIT = 5;
const LOSSLESS_BITMAP_FORMAT_COLORMAPPED = 3;
const BUTTON_HAS_BLEND_MODE = 0x20;
const BUTTON_HAS_FILTER_LIST = 0x10;
const BUTTON_STATE_UP = 0x01;
const MAX_BUTTON_RECORDS = 10_000;
const MAX_SPRITE_NESTING = 256;
const MAX_TIMELINE_FRAME_ENTRIES = 1_000_000;
const MIN_SWF_LENGTH = 12;
const FONT_INFO_FLAG_WIDE_CODES = 0x01;
const PNG_MIME_TYPE = 'image/png';
const S_SIGNATURE = 0x53;
// A placement ratio is 16-bit, so this is both its maximum and the divisor that makes it a 0..1 progress.
const MORPH_RATIO_ONE = 0xffff;
const SWF_INSTANCE_KEY_SCALE = 0x10000;
const SWF_LZMA_PREFIX_LENGTH = 17;
const SWF_MIME_TYPE = 'application/x-shockwave-flash';
const SWF_PREFIX_LENGTH = 8;
const SOUND_ENVELOPE_LEVEL_ONE = 32768;
// An envelope position is counted in 44.1kHz samples whatever the sound's own rate.
const SOUND_ENVELOPE_RATE = 44100;
const SOUND_INFO_HAS_ENVELOPE = 0x08;
const SOUND_INFO_HAS_IN_POINT = 0x01;
const SOUND_INFO_HAS_LOOPS = 0x04;
const SOUND_INFO_HAS_OUT_POINT = 0x02;
const SOUND_INFO_SYNC_NO_MULTIPLE = 0x10;
const SOUND_INFO_SYNC_STOP = 0x20;
const SOUND_FORMAT_MP3 = 2;
const SOUND_FORMAT_NELLYMOSER_16K = 4;
const SOUND_FORMAT_NELLYMOSER_8K = 5;
// SWF's own sound formats, none of which has a registered media type. The vendor names are stable keys a
// decoder registers against; the rate/channel/width parameters ride along on the MIME string.
const SWF_SOUND_MIME_ESSENCES: Readonly<Record<number, string>> = {
  0: 'audio/vnd.adobe.swf-pcm',
  1: 'audio/vnd.adobe.swf-adpcm',
  3: 'audio/vnd.adobe.swf-pcm',
  4: 'audio/vnd.adobe.swf-nellymoser',
  5: 'audio/vnd.adobe.swf-nellymoser',
  6: 'audio/vnd.adobe.swf-nellymoser',
  11: 'audio/vnd.adobe.swf-speex',
};
const SWF_SOUND_RATES: readonly number[] = [5512, 11025, 22050, 44100];
const TAG_END = 0;
const TAG_DEFINE_SOUND = 14;
const TAG_START_SOUND = 15;
const TAG_START_SOUND_2 = 89;
const TAG_SOUND_STREAM_BLOCK = 19;
const TAG_SOUND_STREAM_HEAD = 18;
const TAG_SOUND_STREAM_HEAD_2 = 45;
// Only tags whose absence loses something a caller could want. Metadata tags — `FileAttributes`,
// `Metadata`, `ProductInfo`, `ScriptLimits`, `DebugID`, `EnableDebugger2`, `EnableTelemetry`, `Protect`,
// `SetTabIndex`, `DefineButtonCxform`, and the font hinting/naming tables — are deliberately absent: they
// carry no scene content, so skipping one is not a loss to report.
// The declared capability a declined tag costs, where one exists. Deliberately partial: `DefineFont4`,
// `DefineBinaryData`, `ImportAssets` and `DefineButtonSound` name no declared capability, and inventing
// one so every crumb could carry a join key would put entries in the denominator that nothing measures.
const SWF_DECLINED_TAG_CAPABILITIES = new Map<number, string>([[61, 'swf.video.video-frame']]);

const SWF_DECLINED_TAG_KINDS = new Map<number, string>([
  [17, 'swf.define-button-sound'],
  [57, 'swf.import-assets'],
  [61, 'swf.video-frame-payload'],
  [71, 'swf.import-assets'],
  [87, 'swf.define-binary-data'],
  [91, 'swf.define-font-4'],
]);

const TAG_DEFINE_SCALING_GRID = 78;
const TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA = 86;
const TAG_DEFINE_BITS_JPEG_2 = 21;
const TAG_DEFINE_BITS_JPEG_3 = 35;
const TAG_DEFINE_BITS_JPEG_4 = 90;
const TAG_DEFINE_BITS_LOSSLESS = 20;
const TAG_DEFINE_BITS_LOSSLESS_2 = 36;
const TAG_DEFINE_EDIT_TEXT = 37;
const TAG_DEFINE_BITS = 6;
const TAG_DEFINE_BUTTON = 7;
const TAG_DEFINE_BUTTON_2 = 34;
const TAG_DEFINE_FONT = 10;
const TAG_DEFINE_FONT_2 = 48;
const TAG_DEFINE_FONT_3 = 75;
const TAG_DEFINE_FONT_INFO = 13;
const TAG_DEFINE_FONT_INFO_2 = 62;
const TAG_DEFINE_MORPH_SHAPE = 46;
const TAG_DEFINE_MORPH_SHAPE_2 = 84;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SHAPE_2 = 22;
const TAG_DEFINE_SHAPE_3 = 32;
const TAG_DEFINE_SHAPE_4 = 83;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_TEXT = 11;
const TAG_DEFINE_TEXT_2 = 33;
const TAG_DEFINE_VIDEO_STREAM = 60;
const TAG_DO_ABC = 82;
const TAG_DO_ABC_ANONYMOUS = 72;
const TAG_DO_ACTION = 12;
const TAG_DO_INIT_ACTION = 59;
const TAG_EXPORT_ASSETS = 56;
const TAG_FRAME_LABEL = 43;
const TAG_JPEG_TABLES = 8;
const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_REMOVE_OBJECT = 5;
const TAG_REMOVE_OBJECT_2 = 28;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SHOW_FRAME = 1;
const TAG_SYMBOL_CLASS = 76;
// PlaceObject3 blend-mode values. 0 and 1 are both normal, and `layer` (2) is a compositing hint rather
// than a blend, so none of the three is named here.
const SWF_BLEND_ADD = 8;
const SWF_BLEND_DARKEN = 6;
const SWF_BLEND_DIFFERENCE = 7;
const SWF_BLEND_HARD_LIGHT = 14;
const SWF_BLEND_LIGHTEN = 5;
const SWF_BLEND_MULTIPLY = 3;
const SWF_BLEND_OVERLAY = 13;
const SWF_BLEND_SCREEN = 4;
const TWIPS_PER_PIXEL = 20;
const _fontNameDecoder = new TextDecoder();
const _maskPoint = { x: 0, y: 0 };
const W_SIGNATURE = 0x57;
const ZWS_SIGNATURE = 0x5a;
