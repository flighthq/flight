import { createClipRegionFromContours, createClipRegionFromPath } from '@flighthq/clip/contract';
import { getDecompressor } from '@flighthq/compression/contract';
import { createMatrix, inverseMatrix, matrixTransformPointXY, multiplyMatrix } from '@flighthq/geometry/contract';
import { addMovieClipFrameScript, createMovieClip, setMovieClipSource } from '@flighthq/movieclip/contract';
import {
  addNodeChild,
  getNodeRuntime,
  invalidateNodeAppearance,
  removeNodeChild,
  setNodeLocalMatrix,
} from '@flighthq/node/contract';
import {
  createScene2DAssetReference,
  createScene2DDocument,
  createScene2DSlotReference,
  registerScene2DDocumentImporter,
} from '@flighthq/scene2d-resources/contract';
import { createDisplayObject, setNode2DClip } from '@flighthq/scene2d/contract';
import { copyShapeCommands, createShape, getShapeFillRegions } from '@flighthq/shape/contract';
import type {
  Bitmap,
  BoundsNodeAny,
  RichText,
  Texture2D,
  ClipRegion,
  MovieClip,
  MovieClipData,
  Node2D,
  Node2DData,
  Node2DRuntime,
  Rectangle,
  Scene2DContentReference,
  Scene2DDocument,
  Scene2DDocumentImportContext,
  FrameScript,
  GlyphOutlineSource,
  Scene2DDocumentImporterRegistry,
  Shape,
  ShapeData,
  TimelineLabel,
  TimelineSource,
} from '@flighthq/types/contract';
import { Compression } from '@flighthq/types/contract';

import { createSwfLosslessBitmap } from './swfBitmap';
import { readSwfEditTextFactory } from './swfEditText';
import { readSwfAbcFrameScripts, readSwfFrameActions } from './swfFrameAction';
import { SwfReader } from './swfReader';
import { createSwfShape } from './swfShape';
import { createSwfTextShape, readSwfFontGlyphOutlineSource } from './swfText';

// Recovers every embedded DefineFont/2/3 as the generic, glyph-index-keyed outline seam. The map key
// is the SWF character id used by DefineText and DefineEditText. This is a separate parse entry from
// Scene2D construction so callers that only need embedded fonts do not have to retain a document.
export function createGlyphOutlineSourcesFromSwf(source: Uint8Array): ReadonlyMap<number, GlyphOutlineSource> | null {
  const file = readSwfFile(source);
  return file === null ? null : new Map(file.parsed.fontOutlineSources);
}

export function createScene2DFromSwf(source: Uint8Array): Scene2DDocument | null {
  const file = readSwfFile(source);
  if (file === null) return null;
  const { frameRate, parsed, stageBounds } = file;

  const references: Scene2DContentReference[] = [];
  const instantiation: SwfInstantiationState = {
    activeSymbols: new Set<number>(),
    frameRate: frameRate > 0 ? frameRate : null,
    resolvingBounds: new Set<number>(),
    resolvedBounds: new Map<number, SwfRectangle | null>(),
    remainingNodes: MAX_INSTANTIATED_NODES,
  };
  const root = createSwfTimelineNode(parsed.timeline, stageBounds, parsed, references, instantiation, 0);
  if (root === null) return null;
  fillSwfBitmapTextures(parsed);

  return createScene2DDocument(root, references, 'swf', parsed.backgroundColor);
}

// Instantiates a symbol the file exported by linkage name but never placed on a timeline. A library
// symbol is content the authoring tool published for code to create — OpenFL's `new Layout()` — so a
// document built only from placements has nothing to show for it, which is why this is a separate entry
// rather than something the root carries. Each call builds a fresh instance, because a symbol is a
// template rather than a shared node.
export function createScene2DSymbolFromSwf(source: Uint8Array, linkageName: string): Node2D | null {
  const file = readSwfFile(source);
  if (file === null) return null;
  const { frameRate, parsed } = file;

  let characterId = -1;
  for (const [id, name] of parsed.linkages) {
    if (name === linkageName) characterId = id;
  }
  if (characterId < 0) return null;

  const instantiation: SwfInstantiationState = {
    activeSymbols: new Set<number>(),
    frameRate: frameRate > 0 ? frameRate : null,
    resolvingBounds: new Set<number>(),
    resolvedBounds: new Map<number, SwfRectangle | null>(),
    remainingNodes: MAX_INSTANTIATED_NODES,
  };
  const bounds = resolveSwfCharacterBounds(parsed, characterId, instantiation, 0);
  const sprite = parsed.sprites.get(characterId);
  if (sprite !== undefined) {
    return createSwfTimelineNode(sprite, bounds, parsed, [], instantiation, 0);
  }
  const shape = parsed.shapes.get(characterId);
  const editText = parsed.editTexts.get(characterId);
  if (editText !== undefined) return createSwfEditTextTarget(editText, parsed, bounds);
  return shape === undefined ? null : createSwfPlacementNode(undefined, shape, bounds);
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

interface SwfAuthoredBoundsData {
  authoredBounds: SwfRectangle;
}

interface SwfDisplayObjectData extends Node2DData, SwfAuthoredBoundsData {}

interface SwfMovieClipData extends MovieClipData, SwfAuthoredBoundsData {}

interface SwfShapeNodeData extends ShapeData, SwfAuthoredBoundsData {}

interface SwfPlacement {
  // The colour transform's alpha multiplier, which is what a fade animates.
  alpha: number;
  characterId: number;
  // The depth this placement masks up to, inclusive, or 0 when it is ordinary content. A masking
  // placement is never drawn itself: it contributes its shape as the clip on everything it covers.
  clipDepth: number;
  depth: number;
  directLinkage: string | null;
  matrix: SwfMatrix;
  name: string | null;
}

// One SWF timeline: the full display list of every frame it shows, in ShowFrame order, plus the frame
// labels declared against those frames. Frames are complete snapshots rather than the authored deltas, so
// a seek to any frame is a plain lookup and never has to replay the frames before it.
interface SwfTimeline {
  // Recognized timeline commands, keyed by the frame that carries them. Only blocks made entirely of
  // playback commands appear here; see readSwfFrameActions.
  actions: Map<number, FrameScript>;
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

interface SwfTagResult {
  backgroundColor: number | null;
  editTexts: Map<number, (resolveFontName: (fontId: number) => string) => RichText>;
  fontNames: Map<number, string>;
  characterBounds: Map<number, SwfRectangle>;
  fontOutlineSources: Map<number, GlyphOutlineSource>;
  images: Map<number, SwfImagePayload>;
  linkages: Map<number, string>;
  // One decoded Shape per shape character, drawn once and copied into each placement of it.
  shapeBitmapFills: Map<number, { characterId: number; texture: Texture2D }[]>;
  shapes: Map<number, Shape>;
  sprites: Map<number, SwfTimeline>;
  timeline: SwfTimeline;
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
  fontCodePoints: Map<number, number[]>;
  fontOutlineSources: Map<number, GlyphOutlineSource>;
  images: Map<number, SwfImagePayload>;
  // The shared JPEG encoding tables a legacy DefineBits image is missing, held until one needs them.
  jpegTables: Uint8Array | null;
  linkages: Map<number, string>;
  pendingTexts: SwfPendingText[];
  // Init actions name the sprite they belong to, which may be defined after them.
  pendingInitActions: { characterId: number; script: FrameScript }[];
  // Every DoABC payload in the file, held until the whole thing is walked: a class binds to a character
  // through SymbolClass, which may be read after the script that declares its frame scripts.
  abcBlobs: Uint8Array[];
  // A field's node factory per DefineEditText character, and the family name of each embedded font, so a
  // field declared before its font tag still resolves the family.
  editTexts: Map<number, (resolveFontName: (fontId: number) => string) => RichText>;
  fontNames: Map<number, string>;
  // Which bitmap character each shape's texture fills are waiting on, so a caller can supply the pixels.
  shapeBitmapFills: Map<number, { characterId: number; texture: Texture2D }[]>;
  // Frames are retained as whole display lists, so a file can multiply a display list it placed once by
  // every ShowFrame that follows. This budget is what the whole document has left to spend on those
  // snapshots, shared across the root timeline and every sprite in it.
  remainingFrameEntries: number;
  shapes: Map<number, Shape>;
  sprites: Map<number, SwfTimeline>;
}

interface SwfInstantiationState {
  activeSymbols: Set<number>;
  frameRate: number | null;
  remainingNodes: number;
  resolvedBounds: Map<number, SwfRectangle | null>;
  resolvingBounds: Set<number>;
}

interface SwfFile {
  frameRate: number;
  parsed: SwfTagResult;
  stageBounds: SwfRectangle;
}

function readSwfFile(source: Uint8Array): SwfFile | null {
  const uncompressed = uncompressSwfSource(source);
  if (uncompressed === null) return null;

  const header = new SwfReader(uncompressed, 0, uncompressed.length);
  const signature = header.readUint8();
  if (signature !== FWS_SIGNATURE || header.readUint8() !== W_SIGNATURE || header.readUint8() !== S_SIGNATURE) {
    return null;
  }

  const version = header.readUint8();
  const fileLength = header.readUint32();
  if (!header.valid || version === 0 || fileLength < MIN_SWF_LENGTH || fileLength > uncompressed.length) return null;

  const body = new SwfReader(uncompressed, SWF_PREFIX_LENGTH, fileLength);
  const stageBounds = readSwfRectangle(body);
  if (stageBounds === null) return null;
  // Header FrameRate is 8.8 fixed and governs every timeline in the file; the authored FrameCount that
  // follows it is advisory, so the real root frame count comes from the ShowFrame tags themselves.
  const frameRate = body.readUint16() / FIXED_8_8_ONE;
  body.readUint16();
  if (!body.valid) return null;

  const parsed = readSwfTags(body);
  return parsed === null ? null : { frameRate, parsed, stageBounds };
}

// Gives every texture a bitmap fill is waiting on its pixels, for the images this package can unpack on
// its own. A lossless definition is a raw raster plus zlib, and both halves are already here — the shared
// decompressor the caller registered, and the layout knowledge above — so its pixels resolve at import
// with no further step. The encoded formats still need a decoder this package does not have, and their
// textures stay sourceless until one supplies them.
function fillSwfBitmapTextures(parsed: Readonly<SwfTagResult>): void {
  if (parsed.shapeBitmapFills.size === 0) return;
  const bitmaps = new Map<number, Bitmap | null>();
  for (const fills of parsed.shapeBitmapFills.values()) {
    for (const fill of fills) {
      if (!bitmaps.has(fill.characterId)) {
        const image = parsed.images.get(fill.characterId);
        const lossless =
          image !== undefined &&
          (image.mimeType === SWF_LOSSLESS_MIME_TYPE || image.mimeType === SWF_LOSSLESS_ALPHA_MIME_TYPE);
        bitmaps.set(
          fill.characterId,
          lossless ? createSwfLosslessBitmap(image.bytes, image.mimeType === SWF_LOSSLESS_ALPHA_MIME_TYPE) : null,
        );
      }
      const bitmap = bitmaps.get(fill.characterId) ?? null;
      if (bitmap !== null) fill.texture.source = bitmap;
    }
  }
}

// Presents any container form as the uncompressed bytes the rest of the importer reads. `FWS` is already
// that and is returned as-is, with no copy. `CWS` and `ZWS` compress everything after the 8-byte header,
// so the body is inflated through the registered decompressor and spliced back behind a header rewritten
// to `FWS` — the declared length already counts uncompressed bytes, so it carries over untouched.
// Compression the caller has not registered a decompressor for is reported as the document's null
// sentinel, exactly like a malformed file: the bytes are unreadable either way.
function uncompressSwfSource(source: Uint8Array): Uint8Array | null {
  if (source.length < SWF_PREFIX_LENGTH || source[1] !== W_SIGNATURE || source[2] !== S_SIGNATURE) return null;
  const signature = source[0];
  if (signature === FWS_SIGNATURE) return source;

  const compression =
    signature === CWS_SIGNATURE ? Compression.Deflate : signature === ZWS_SIGNATURE ? Compression.Lzma : null;
  if (compression === null) return null;
  const decompress = getDecompressor(compression);
  if (decompress === null) return null;

  const header = new SwfReader(source, 0, SWF_PREFIX_LENGTH);
  header.readUint32();
  const fileLength = header.readUint32();
  if (fileLength < MIN_SWF_LENGTH) return null;

  // LZMA puts a compressed length and the 5 property bytes between the header and its stream; zlib starts
  // its stream immediately. Either way the decompressor receives the stream itself.
  const bodyLength = fileLength - SWF_PREFIX_LENGTH;
  const streamStart = compression === Compression.Lzma ? SWF_LZMA_PREFIX_LENGTH : SWF_PREFIX_LENGTH;
  if (streamStart > source.length) return null;
  const body = decompress(source.subarray(streamStart), bodyLength);
  if (body === null || body.length < bodyLength) return null;

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
  references: Scene2DContentReference[],
  state: SwfInstantiationState,
  depth: number,
): MovieClip | null {
  const clip = createSwfMovieClip(bounds);
  return populateSwfTimelineNode(clip, timeline, parsed, references, state, depth) ? clip : null;
}

function populateSwfTimelineNode(
  clip: MovieClip,
  timeline: Readonly<SwfTimeline>,
  parsed: Readonly<SwfTagResult>,
  references: Scene2DContentReference[],
  state: SwfInstantiationState,
  depth: number,
): boolean {
  if (depth > MAX_SPRITE_NESTING) return false;

  const nodes = new Map<number, Node2D>();
  const frames: SwfFrameEntry[][] = [];
  const clips = new Map<Readonly<SwfPlacement>, Map<Readonly<SwfPlacement>, ClipRegion | null>>();

  for (const frame of timeline.frames) {
    const ordered = [...frame.values()].sort(compareSwfPlacementDepth);
    frames.push(buildSwfFrameEntries(ordered, parsed, clips));
    for (const placement of ordered) {
      const key = createSwfInstanceKey(placement);
      if (nodes.has(key)) continue;
      const sprite = parsed.sprites.get(placement.characterId);
      const shape = parsed.shapes.get(placement.characterId);
      const image = parsed.images.get(placement.characterId);
      const editText = parsed.editTexts.get(placement.characterId);
      // A masking placement is never drawn — it contributes its shape as a clip on what it covers, so it
      // earns no node of its own.
      if (placement.clipDepth > 0) continue;
      // A placement earns a node when it is named, when it carries a timeline, or now when it has content —
      // geometry to draw or pixels to load. An unnamed shape is most of what a still frame is made of.
      if (
        !placement.name &&
        sprite === undefined &&
        shape === undefined &&
        image === undefined &&
        editText === undefined
      ) {
        continue;
      }
      if (state.remainingNodes === 0) return false;
      state.remainingNodes--;

      // The node and its reference exist before the symbol behind it is populated, so a manifest lists a
      // container ahead of the named descendants it carries.
      const targetBounds = resolveSwfCharacterBounds(parsed, placement.characterId, state, 0);
      const target =
        editText === undefined
          ? createSwfPlacementNode(sprite, shape, targetBounds)
          : createSwfEditTextTarget(editText, parsed, targetBounds);
      nodes.set(key, target);
      if (image !== undefined) {
        // An embedded image is an asset rather than a slot: it has content of its own to load, and the
        // document carries that content instead of an address to fetch it from.
        references.push(
          createScene2DAssetReference(
            placement.name ?? createSwfImageAssetName(placement.characterId),
            createSwfImageAssetUri(placement.characterId),
            target,
            true,
            image.bytes,
            image.mimeType,
          ),
        );
      } else if (placement.name) {
        references.push(
          createScene2DSlotReference(
            placement.name,
            target,
            placement.directLinkage ?? parsed.linkages.get(placement.characterId) ?? null,
          ),
        );
      }

      if (sprite !== undefined) {
        if (state.activeSymbols.has(placement.characterId)) return false;
        state.activeSymbols.add(placement.characterId);
        const populated = populateSwfTimelineNode(target as MovieClip, sprite, parsed, references, state, depth + 1);
        state.activeSymbols.delete(placement.characterId);
        if (!populated) return false;
      }
    }
  }

  setMovieClipSource(clip, createSwfTimelineSource(frames, nodes, timeline.labels, state.frameRate));
  // Frame scripts attach after the source, so the clip already knows how many frames it has when a
  // recognized command addresses one.
  for (const [frame, script] of timeline.actions) {
    if (frame <= frames.length) addMovieClipFrameScript(clip, frame, script);
  }
  return true;
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
  frameRate: number | null,
): TimelineSource {
  const attached: Node2D[] = [];
  const appliedMatrices = new Map<Node2D, Readonly<SwfMatrix>>();
  const appliedClips = new Map<Node2D, ClipRegion | null>();
  const appliedAlphas = new Map<Node2D, number>();
  return {
    totalFrames: frames.length,
    labels,
    frameRate,
    constructFrame(target: Node2D, frame: number): void {
      const entries = frames[frame - 1];
      if (entries === undefined) return;

      let count = 0;
      let ordered = true;
      for (const entry of entries) {
        const node = nodes.get(createSwfInstanceKey(entry.placement));
        if (node === undefined) continue;
        if (attached[count] !== node) ordered = false;
        count++;
      }

      if (!ordered || count !== attached.length) {
        for (const node of attached) removeNodeChild(target, node);
        attached.length = 0;
        for (const entry of entries) {
          const node = nodes.get(createSwfInstanceKey(entry.placement));
          if (node === undefined) continue;
          addNodeChild(target, node);
          attached.push(node);
        }
      }

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
        // What masks an instance can change from frame to frame, so the clip is per-frame data applied the
        // same way: written only when this frame's region differs from the one already on the node.
        if (appliedClips.get(node) !== entry.clip) {
          setNode2DClip(node, entry.clip);
          appliedClips.set(node, entry.clip);
        }
      }
    },
  };
}

// Pairs each drawn placement of a frame with the clip its mask imposes. SWF masks by depth range — a
// placement with a clip depth covers every depth above its own through that clip depth — while Flight
// clips a node and its subtree. Applying one region to each covered sibling is equivalent to grouping
// them under a clipped container, and it leaves the attach/detach/reorder path untouched.
function buildSwfFrameEntries(
  ordered: readonly Readonly<SwfPlacement>[],
  parsed: Readonly<SwfTagResult>,
  clips: Map<Readonly<SwfPlacement>, Map<Readonly<SwfPlacement>, ClipRegion | null>>,
): SwfFrameEntry[] {
  const entries: SwfFrameEntry[] = [];
  for (const placement of ordered) {
    if (placement.clipDepth > 0) continue;
    const mask = resolveSwfPlacementMask(ordered, placement);
    entries.push({ clip: mask === null ? null : resolveSwfMaskClip(mask, placement, parsed, clips), placement });
  }
  return entries;
}

// The innermost mask covering a depth. Flight carries one clip per node, so where masks nest, the
// deepest one wins rather than intersecting them.
function resolveSwfPlacementMask(
  ordered: readonly Readonly<SwfPlacement>[],
  placement: Readonly<SwfPlacement>,
): Readonly<SwfPlacement> | null {
  let mask: Readonly<SwfPlacement> | null = null;
  for (const candidate of ordered) {
    if (candidate.clipDepth <= 0 || candidate.depth >= placement.depth) continue;
    if (placement.depth > candidate.clipDepth) continue;
    if (mask === null || candidate.depth > mask.depth) mask = candidate;
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

// An embedded image has no address to fetch from, so its reference is addressed by the character it came
// from. The name falls back to the same identity when the placement carried no instance name.
function createSwfImageAssetName(characterId: number): string {
  return `bitmap${characterId}`;
}

function createSwfImageAssetUri(characterId: number): string {
  return `swf:bitmap/${characterId}`;
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
): Node2D {
  const node = create((fontId) => parsed.fontNames.get(fontId) ?? '');
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

// Each placement of a shape character gets its own copy of the decoded commands, so a document that places
// one symbol many times still holds independently editable geometry per instance.
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
  for (const frame of sprite.frames) {
    for (const placement of frame.values()) {
      const childBounds = resolveSwfCharacterBounds(parsed, placement.characterId, state, depth + 1);
      if (childBounds === null) continue;
      const transformed = transformSwfRectangle(childBounds, placement.matrix);
      bounds = bounds === null ? transformed : mergeSwfRectangles(bounds, transformed);
    }
  }
  state.resolvingBounds.delete(characterId);
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

function readPlaceObject(body: SwfReader, placements: Map<number, SwfPlacement>, hasExtendedFlags: boolean): void {
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
  const alpha = (flags & 0x08) !== 0 ? readSwfColorTransform(body) : (inherited?.alpha ?? 1);
  if ((flags & 0x10) !== 0) body.readUint16();
  const name = (flags & 0x20) !== 0 ? body.readString() : (inherited?.name ?? null);
  const clipDepth = (flags & 0x40) !== 0 ? body.readUint16() : (inherited?.clipDepth ?? 0);

  if (!body.valid || (isMove && existing === undefined) || (characterId === 0 && directLinkage === null)) return;
  placements.set(depth, { alpha, characterId, clipDepth, depth, directLinkage, matrix, name });
}

function readLegacyPlaceObject(body: SwfReader, placements: Map<number, SwfPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  const matrix = readSwfMatrix(body);
  // The legacy record's colour transform has no alpha channel at all.
  if (body.pos < body.end) readSwfColorTransform(body, 3);
  if (!body.valid || characterId === 0) return;
  placements.set(depth, { alpha: 1, characterId, clipDepth: 0, depth, directLinkage: null, matrix, name: null });
}

function readLegacyRemoveObject(body: SwfReader, placements: Map<number, SwfPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  if (!body.valid) return;
  const existing = placements.get(depth);
  if (existing?.characterId === characterId) placements.delete(depth);
}

// Reads a colour transform, returning only its alpha multiplier — the one channel Flight's node model
// carries directly. The colour channels are read past: tinting a node is a material feature rather than a
// node property, so importing it would need a decision this codec should not make on its own.
// A record with no multiply terms leaves alpha fully opaque.
function readSwfColorTransform(reader: SwfReader, channelCount = 4): number {
  const hasAdd = reader.readUnsignedBits(1) !== 0;
  const hasMultiply = reader.readUnsignedBits(1) !== 0;
  const bits = reader.readUnsignedBits(4);
  let alpha = 1;
  if (hasMultiply) {
    for (let i = 0; i < channelCount; i++) {
      const value = reader.readSignedBits(bits) / FIXED_8_8_ONE;
      if (i === ALPHA_CHANNEL && channelCount > ALPHA_CHANNEL) alpha = Math.max(0, Math.min(1, value));
    }
  }
  if (hasAdd) {
    for (let i = 0; i < channelCount; i++) reader.readSignedBits(bits);
  }
  reader.alignToByte();
  return alpha;
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

function readSwfRectangle(reader: SwfReader): SwfRectangle | null {
  const bits = reader.readUnsignedBits(5);
  const xMin = reader.readSignedBits(bits);
  const xMax = reader.readSignedBits(bits);
  const yMin = reader.readSignedBits(bits);
  const yMax = reader.readSignedBits(bits);
  reader.alignToByte();
  if (!reader.valid || xMax < xMin || yMax < yMin) return null;
  return {
    height: (yMax - yMin) / TWIPS_PER_PIXEL,
    width: (xMax - xMin) / TWIPS_PER_PIXEL,
    x: xMin / TWIPS_PER_PIXEL,
    y: yMin / TWIPS_PER_PIXEL,
  };
}

function readSwfTags(reader: SwfReader): SwfTagResult | null {
  const state: SwfParseState = {
    abcBlobs: [],
    backgroundColor: null,
    pendingInitActions: [],
    shapeBitmapFills: new Map<number, { characterId: number; texture: Texture2D }[]>(),
    editTexts: new Map<number, (resolveFontName: (fontId: number) => string) => RichText>(),
    fontNames: new Map<number, string>(),
    characterBounds: new Map<number, SwfRectangle>(),
    definedCharacters: new Set<number>(),
    fontCodePoints: new Map<number, number[]>(),
    fontOutlineSources: new Map<number, GlyphOutlineSource>(),
    images: new Map<number, SwfImagePayload>(),
    jpegTables: null,
    pendingTexts: [],
    linkages: new Map<number, string>(),
    remainingFrameEntries: MAX_TIMELINE_FRAME_ENTRIES,
    shapes: new Map<number, Shape>(),
    sprites: new Map<number, SwfTimeline>(),
  };
  const timeline = readSwfTimeline(reader, state);
  if (timeline === null) return null;
  composeSwfFontCodePoints(state);
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
    linkages: state.linkages,
    shapeBitmapFills: state.shapeBitmapFills,
    shapes: state.shapes,
    sprites: state.sprites,
    timeline,
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
    const byClass = readSwfAbcFrameScripts(blob);
    if (byClass === null) continue;
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
    if (shape !== null) state.shapes.set(pending.characterId, shape);
  }
}

function readSwfTimeline(reader: SwfReader, state: SwfParseState): SwfTimeline | null {
  const placements = new Map<number, SwfPlacement>();
  const actions = new Map<number, FrameScript>();
  const frames: Map<number, SwfPlacement>[] = [];
  const labels: TimelineLabel[] = [];

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
      state.abcBlobs.push(readSwfAbcPayload(body, code === TAG_DO_ABC));
    } else if (code === TAG_DO_INIT_ACTION) {
      // An init action runs once for the sprite it names, before that sprite's own first frame, so a
      // recognized block belongs to frame 1 of that sprite rather than to the timeline reading the tag.
      const spriteId = body.readUint16();
      const script = readSwfFrameActions(new SwfReader(body.source, body.pos, body.end));
      if (script !== null) state.pendingInitActions.push({ characterId: spriteId, script });
    } else if (code === TAG_DO_ACTION) {
      // A DoAction belongs to the frame being assembled — the one the next ShowFrame closes.
      const script = readSwfFrameActions(new SwfReader(body.source, body.pos, body.end));
      if (script !== null) actions.set(frames.length + 1, script);
    } else if (code === TAG_FRAME_LABEL) {
      addSwfTimelineLabel(labels, frames.length + 1, body.readString());
    } else if (code === TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA) {
      readSwfSceneAndFrameLabelData(body, labels);
    } else if (code === TAG_PLACE_OBJECT) {
      readLegacyPlaceObject(body, placements);
    } else if (code === TAG_PLACE_OBJECT_2) {
      readPlaceObject(body, placements, false);
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
      readPlaceObject(body, placements, true);
    }
    if (!body.valid) return null;
  }

  if (!reader.valid) return null;
  // A timeline that never shows a frame still has the one display list its tags built.
  if (frames.length === 0) frames.push(placements);
  return {
    actions,
    frames,
    // A label declared after the last ShowFrame names a frame the timeline never reaches.
    labels: labels.filter((label) => label.frame <= frames.length).sort(compareSwfTimelineLabelFrame),
  };
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
    if (version === 2) readSwfColorTransform(reader);
    if (!reader.valid) return;
    if ((flags & BUTTON_STATE_UP) !== 0 && characterId !== 0) {
      placements.set(depth, { alpha: 1, characterId, clipDepth: 0, depth, directLinkage: null, matrix, name: null });
    }
    // A filter list has no fixed width, so a record carrying one would desynchronize every record after
    // it. Stopping keeps what was read rather than misreading the rest.
    if ((flags & BUTTON_HAS_FILTER_LIST) !== 0) break;
    if ((flags & BUTTON_HAS_BLEND_MODE) !== 0) reader.readUint8();
  }

  state.definedCharacters.add(buttonId);
  state.sprites.set(buttonId, { actions: new Map<number, FrameScript>(), frames: [placements], labels: [] });
}

// Font glyphs decode on a reader of their own, so a font this decoder cannot read costs its glyphs and
// nothing else. A font declares no placeable bounds and is never itself placed — it is a table the text
// definitions draw from.
function readSwfFontDefinition(body: Readonly<SwfReader>, state: SwfParseState, code: number): void {
  const version = code === TAG_DEFINE_FONT ? 1 : code === TAG_DEFINE_FONT_2 ? 2 : 3;
  const reader = new SwfReader(body.source, body.pos, body.end);
  const fontId = reader.source[body.pos] + reader.source[body.pos + 1] * 0x100;
  const source = readSwfFontGlyphOutlineSource(reader, version);
  if (source === null || fontId === 0) return;
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
function readSwfSceneAndFrameLabelData(body: SwfReader, labels: TimelineLabel[]): void {
  const sceneCount = body.readEncodedUint32();
  for (let i = 0; i < sceneCount && body.valid; i++) {
    body.readEncodedUint32();
    body.readString();
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

  const version = resolveSwfShapeVersion(code);
  if (version > 0) readSwfShapeBody(body, state, characterId, version);
  // A static text definition is queued rather than composed: its records address glyphs by index into a
  // font that may not have been read yet. Everything after the bounds and the definition matrix is its
  // record stream.
  if (code === TAG_DEFINE_EDIT_TEXT) {
    const reader = new SwfReader(body.source, body.pos, body.end);
    const bounds = state.characterBounds.get(characterId);
    const factory = readSwfEditTextFactory(reader, bounds?.width ?? 0, bounds?.height ?? 0);
    if (factory !== null) state.editTexts.set(characterId, factory);
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
  const bitmapFills: { characterId: number; texture: Texture2D }[] = [];
  const shape = createSwfShape(reader, version, bitmapFills);
  if (shape === null) return;
  state.shapes.set(characterId, shape);
  if (bitmapFills.length > 0) state.shapeBitmapFills.set(characterId, bitmapFills);
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
  if (tables === null) return;

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
  if (image === null) return;
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, image.bounds);
  state.images.set(characterId, { bytes: spliced, mimeType: image.mimeType });
}

// An image this decoder cannot read contributes no image and leaves the document alone, the same way an
// unreadable shape body, font glyph, or legacy image pair does. Failing a whole document over one picture
// costs far more than the picture is worth.
function readSwfEmbeddedImageDefinition(body: SwfReader, state: SwfParseState, code: number): void {
  const characterId = body.readUint16();
  let imageStart = body.pos;
  let imageEnd = body.end;
  if (code === TAG_DEFINE_BITS_JPEG_3 || code === TAG_DEFINE_BITS_JPEG_4) {
    const alphaDataOffset = body.readUint32();
    const alphaOffsetBase = body.pos;
    if (code === TAG_DEFINE_BITS_JPEG_4) body.readUint16();
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

function readSwfVideoDefinition(body: SwfReader, state: SwfParseState): boolean {
  const characterId = body.readUint16();
  body.readUint16();
  const width = body.readUint16();
  const height = body.readUint16();
  body.readUint8();
  body.readUint8();
  if (!body.valid || characterId === 0 || width === 0 || height === 0 || state.definedCharacters.has(characterId)) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, { height, width, x: 0, y: 0 });
  return true;
}

const CWS_SIGNATURE = 0x43;
const ALPHA_CHANNEL = 3;
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
const MAX_INSTANTIATED_NODES = 100_000;
const MAX_SPRITE_NESTING = 256;
const MAX_TIMELINE_FRAME_ENTRIES = 1_000_000;
const MIN_SWF_LENGTH = 12;
const FONT_INFO_FLAG_WIDE_CODES = 0x01;
const PNG_MIME_TYPE = 'image/png';
const S_SIGNATURE = 0x53;
const SWF_INSTANCE_KEY_SCALE = 0x10000;
const SWF_LZMA_PREFIX_LENGTH = 17;
const SWF_LOSSLESS_ALPHA_MIME_TYPE = 'image/x-swf-lossless-alpha';
const SWF_LOSSLESS_MIME_TYPE = 'image/x-swf-lossless';
const SWF_MIME_TYPE = 'application/x-shockwave-flash';
const SWF_PREFIX_LENGTH = 8;
const TAG_END = 0;
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
const TWIPS_PER_PIXEL = 20;
const _fontNameDecoder = new TextDecoder();
const _maskPoint = { x: 0, y: 0 };
const W_SIGNATURE = 0x57;
const ZWS_SIGNATURE = 0x5a;
