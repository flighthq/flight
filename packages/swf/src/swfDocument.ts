import { createClipRegionFromContours, createClipRegionFromPath } from '@flighthq/clip/contract';
import { getDecompressor } from '@flighthq/compression/contract';
import { createMatrix, inverseMatrix, matrixTransformPointXY, multiplyMatrix } from '@flighthq/geometry/contract';
import { createMovieClip, setMovieClipSource } from '@flighthq/movieclip/contract';
import { addNodeChild, getNodeRuntime, removeNodeChild, setNodeLocalMatrix } from '@flighthq/node/contract';
import {
  createScene2DAssetReference,
  createScene2DDocument,
  createScene2DSlotReference,
  registerScene2DDocumentImporter,
} from '@flighthq/scene2d-resources/contract';
import { createDisplayObject, setNode2DClip } from '@flighthq/scene2d/contract';
import { copyShapeCommands, createShape, getShapeFillRegions } from '@flighthq/shape/contract';
import type {
  BoundsNodeAny,
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
  Scene2DDocumentImporterRegistry,
  Shape,
  ShapeData,
  TimelineLabel,
  TimelineSource,
} from '@flighthq/types/contract';
import { Compression } from '@flighthq/types/contract';

import { SwfReader } from './swfReader';
import { createSwfShape } from './swfShape';

export function createScene2DFromSwf(source: Uint8Array): Scene2DDocument | null {
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
  if (parsed === null) return null;

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

  return createScene2DDocument(root, references, 'swf');
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
  characterBounds: Map<number, SwfRectangle>;
  images: Map<number, SwfImagePayload>;
  linkages: Map<number, string>;
  // One decoded Shape per shape character, drawn once and copied into each placement of it.
  shapes: Map<number, Shape>;
  sprites: Map<number, SwfTimeline>;
  timeline: SwfTimeline;
}

interface SwfParseState {
  characterBounds: Map<number, SwfRectangle>;
  definedCharacters: Set<number>;
  images: Map<number, SwfImagePayload>;
  linkages: Map<number, string>;
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
      // A masking placement is never drawn — it contributes its shape as a clip on what it covers, so it
      // earns no node of its own.
      if (placement.clipDepth > 0) continue;
      // A placement earns a node when it is named, when it carries a timeline, or now when it has content —
      // geometry to draw or pixels to load. An unnamed shape is most of what a still frame is made of.
      if (!placement.name && sprite === undefined && shape === undefined && image === undefined) continue;
      if (state.remainingNodes === 0) return false;
      state.remainingNodes--;

      // The node and its reference exist before the symbol behind it is populated, so a manifest lists a
      // container ahead of the named descendants it carries.
      const targetBounds = resolveSwfCharacterBounds(parsed, placement.characterId, state, 0);
      const target = createSwfPlacementNode(sprite, shape, targetBounds);
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
  if ((flags & 0x08) !== 0) readSwfColorTransform(body);
  if ((flags & 0x10) !== 0) body.readUint16();
  const name = (flags & 0x20) !== 0 ? body.readString() : (inherited?.name ?? null);
  const clipDepth = (flags & 0x40) !== 0 ? body.readUint16() : (inherited?.clipDepth ?? 0);

  if (!body.valid || (isMove && existing === undefined) || (characterId === 0 && directLinkage === null)) return;
  placements.set(depth, { characterId, clipDepth, depth, directLinkage, matrix, name });
}

function readLegacyPlaceObject(body: SwfReader, placements: Map<number, SwfPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  const matrix = readSwfMatrix(body);
  if (body.pos < body.end) readSwfColorTransform(body, 3);
  if (!body.valid || characterId === 0) return;
  placements.set(depth, { characterId, clipDepth: 0, depth, directLinkage: null, matrix, name: null });
}

function readLegacyRemoveObject(body: SwfReader, placements: Map<number, SwfPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  if (!body.valid) return;
  const existing = placements.get(depth);
  if (existing?.characterId === characterId) placements.delete(depth);
}

function readSwfColorTransform(reader: SwfReader, channelCount = 4): void {
  const hasAdd = reader.readUnsignedBits(1) !== 0;
  const hasMultiply = reader.readUnsignedBits(1) !== 0;
  const bits = reader.readUnsignedBits(4);
  if (hasMultiply) {
    for (let i = 0; i < channelCount; i++) reader.readSignedBits(bits);
  }
  if (hasAdd) {
    for (let i = 0; i < channelCount; i++) reader.readSignedBits(bits);
  }
  reader.alignToByte();
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
    characterBounds: new Map<number, SwfRectangle>(),
    definedCharacters: new Set<number>(),
    images: new Map<number, SwfImagePayload>(),
    linkages: new Map<number, string>(),
    remainingFrameEntries: MAX_TIMELINE_FRAME_ENTRIES,
    shapes: new Map<number, Shape>(),
    sprites: new Map<number, SwfTimeline>(),
  };
  const timeline = readSwfTimeline(reader, state);
  if (timeline === null) return null;
  return {
    characterBounds: state.characterBounds,
    images: state.images,
    linkages: state.linkages,
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
function readSwfTimeline(reader: SwfReader, state: SwfParseState): SwfTimeline | null {
  const placements = new Map<number, SwfPlacement>();
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
    } else if (code === TAG_EXPORT_ASSETS || code === TAG_SYMBOL_CLASS) {
      readSwfLinkages(body, state.linkages);
    } else if (code === TAG_DEFINE_BITS_JPEG_2 || code === TAG_DEFINE_BITS_JPEG_3 || code === TAG_DEFINE_BITS_JPEG_4) {
      if (!readSwfEmbeddedImageDefinition(body, state, code)) return null;
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
    frames,
    // A label declared after the last ShowFrame names a frame the timeline never reaches.
    labels: labels.filter((label) => label.frame <= frames.length).sort(compareSwfTimelineLabelFrame),
  };
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
  const shape = createSwfShape(reader, version);
  if (shape !== null) state.shapes.set(characterId, shape);
}

function resolveSwfShapeVersion(code: number): number {
  if (code === TAG_DEFINE_SHAPE) return 1;
  if (code === TAG_DEFINE_SHAPE_2) return 2;
  if (code === TAG_DEFINE_SHAPE_3) return 3;
  return code === TAG_DEFINE_SHAPE_4 ? 4 : 0;
}

function readSwfEmbeddedImageDefinition(body: SwfReader, state: SwfParseState, code: number): boolean {
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
    return false;
  }
  const image = readSwfEmbeddedImage(body.source, imageStart, imageEnd);
  if (image === null) return false;
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, image.bounds);
  state.images.set(characterId, {
    bytes: body.source.subarray(imageStart, imageEnd),
    mimeType: image.mimeType,
  });
  return true;
}

// Identifies an embedded payload by its magic bytes and reads the dimensions out of its header, without
// decoding a pixel. The media type travels with the bytes so a resolver can dispatch on format.
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
    if (marker === JPEG_END_OF_IMAGE || marker === JPEG_START_OF_SCAN) return null;
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
const MAX_INSTANTIATED_NODES = 100_000;
const MAX_SPRITE_NESTING = 256;
const MAX_TIMELINE_FRAME_ENTRIES = 1_000_000;
const MIN_SWF_LENGTH = 12;
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
const TAG_EXPORT_ASSETS = 56;
const TAG_FRAME_LABEL = 43;
const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_REMOVE_OBJECT = 5;
const TAG_REMOVE_OBJECT_2 = 28;
const TAG_SHOW_FRAME = 1;
const TAG_SYMBOL_CLASS = 76;
const TWIPS_PER_PIXEL = 20;
const _maskPoint = { x: 0, y: 0 };
const W_SIGNATURE = 0x57;
const ZWS_SIGNATURE = 0x5a;
