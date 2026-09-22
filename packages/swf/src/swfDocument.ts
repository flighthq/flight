import { createClipRegionFromContours, createClipRegionFromPath } from '@flighthq/clip/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix, inverseMatrix, matrixTransformPointXY, multiplyMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { addMovieClipFrameScript, setMovieClipSource } from '@flighthq/movieclip/contract';
import {
  addNodeChild,
  addNodeOrderListEntry,
  applyNodeOrderList,
  clearNodeOrderList,
  createNodeOrderList,
  invalidateNodeAppearance,
  removeNodeChild,
  setNodeColorAdjustments,
  setNodeLocalMatrix,
} from '@flighthq/node/contract';
import {
  createScene2DDocument,
  createScene2DSlotReference,
  registerScene2DDocumentImporter,
} from '@flighthq/scene2d-resources/contract';
import { setNode2DClip } from '@flighthq/scene2d/contract';
import { getShapeFillRegions, setMorphShapeProgress } from '@flighthq/shape/contract';
import type {
  ClipRegion,
  EntityConstruction,
  GlyphOutlineSource,
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  ImportDiagnostic,
  Adjustment,
  MorphShape,
  MovieClip,
  Node2D,
  Node2DTraits,
  Scene2DDocument,
  Scene2DDocumentImportContext,
  Scene2DDocumentImporterRegistry,
  Scene2DSlotReference,
  SwfDocumentImport,
  SwfJpegAlphaPayload,
  SwfNodeAppearance,
  SwfTagHandler,
  SwfParseOptions,
  SwfTagHandlerResources,
  SwfTagParseResult,
  SwfTagMatrix,
  SwfTagParseState,
  SwfTagPlacement,
  SwfTagRectangle,
  SwfTimeline,
  TimelineCue,
  TimelineLabel,
  TimelineSource,
} from '@flighthq/types/contract';
import { Compression, CompressionFraming, ImportDiagnosticSeverity, MorphShapeKind } from '@flighthq/types/contract';

import { expandSwfTagHandlerDispatch } from './expandSwfTagHandlerDispatch';
import { applySwfMorphBounds, createSwfDisplayObject, createSwfMovieClip } from './swfNode';
import { FIXED_8_8_ONE, readSwfRectangle, transformSwfRectangle, mergeSwfRectangles } from './swfPrimitive';
import { SwfReader } from './swfReader';
import { MAX_TIMELINE_FRAME_ENTRIES, readSwfTimeline } from './swfTimelineParse';

// Recovers every embedded DefineFont/2/3 as the generic, glyph-index-keyed outline seam. The map key
// is the SWF character id used by DefineText and DefineEditText. This is a separate parse entry from
// Scene2D construction so callers that only need embedded fonts do not have to retain a document.
export function createGlyphOutlineSourcesFromSwf(
  source: Uint8Array,
  options: Readonly<SwfParseOptions>,
  diagnostics?: ImportDiagnostic[],
): ReadonlyMap<number, GlyphOutlineSource> | null {
  const file = readSwfFile(source, options, diagnostics);
  return file === null ? null : new Map(file.parsed.fontOutlineSources);
}

// The document alone, for a caller that wants the graph and nothing else — the document importer among
// them. A file whose placements carry an advanced blend or a filter list still imports fully here; what
// it loses is the report of them, which is what createScene2DImportFromSwf returns.
export function createScene2DFromSwf(
  source: Uint8Array,
  options: Readonly<SwfParseOptions>,
  diagnostics?: ImportDiagnostic[],
): Scene2DDocument | null {
  return createScene2DImportFromSwf(source, options, diagnostics)?.document ?? null;
}

// The full import: the document, plus the placement appearance no node can carry. SWF puts a blend mode
// and a filter list on the same record as the matrix, and Flight expresses neither on a node — an
// advanced blend needs a BlendEffect and an effect is a descriptor a caller runs explicitly, since
// `displayObject.filters` is an anti-goal. Both therefore travel beside the document instead of being
// dropped at the seam or silently flattened onto a node.
export function createScene2DImportFromSwf(
  source: Uint8Array,
  options: Readonly<SwfParseOptions>,
  diagnostics?: ImportDiagnostic[],
): SwfDocumentImport | null {
  const file = readSwfFile(source, options, diagnostics);
  if (file === null) return null;
  return instantiateSwfFile(file, options, diagnostics);
}

function instantiateSwfFile(
  file: SwfFile,
  options: Readonly<SwfParseOptions>,
  diagnostics: ImportDiagnostic[] | undefined,
): SwfDocumentImport | null {
  const { frameRate, parsed, stageBounds } = file;
  const slots: Scene2DSlotReference[] = [];
  const instantiation: SwfInstantiationState = {
    activeSymbols: new Set<number>(),
    appearances: [],
    diagnostics,
    handlers: options.tags,
    frameRate: frameRate > 0 ? frameRate : null,
    resolvingBounds: new Set<number>(),
    resolvedBounds: new Map<number, SwfTagRectangle | null>(),
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
  // Resources are built after the root, because a Texture a placement acquired during instantiation is
  // the one its payload has to be paired with. A family the build left out contributes nothing here and
  // is not reachable from it.
  const resources: SwfTagHandlerResources = { audio: [], images: [], jpegAlphaPayloads: [] };
  for (const handler of instantiation.handlers) handler.instantiate?.createResources?.(parsed, resources);
  const out = allocateEntity<SwfDocumentImport>();
  initializeSwfDocumentImport(
    out,
    instantiation.appearances,
    createScene2DDocument(root, slots, 'swf', parsed.backgroundColor, resources.images, resources.audio),
    resources.jpegAlphaPayloads,
  );
  return finishEntity(out);
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
  options: Readonly<SwfParseOptions>,
  diagnostics?: ImportDiagnostic[],
): Scene2DDocument | null {
  const file = readSwfFile(source, options, diagnostics);
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
    handlers: options.tags,
    frameRate: frameRate > 0 ? frameRate : null,
    resolvingBounds: new Set<number>(),
    resolvedBounds: new Map<number, SwfTagRectangle | null>(),
  };
  const root = createSwfSymbolNode(parsed, characterId, slots, instantiation);
  if (root === null) return null;

  const resources: SwfTagHandlerResources = { audio: [], images: [], jpegAlphaPayloads: [] };
  for (const handler of instantiation.handlers) handler.instantiate?.createResources?.(parsed, resources);
  return createScene2DDocument(root, slots, 'swf', null, resources.images, resources.audio);
}

function assignTimelineSourceFields(
  out: EntityConstruction<TimelineSource>,
  constructFrame: (target: Node2D, frame: number) => void,
  cues: readonly TimelineCue[],
  frameRate: number | null,
  labels: readonly TimelineLabel[],
  totalFrames: number,
): void {
  out.constructFrame = constructFrame;
  out.cues = cues;
  out.frameRate = frameRate;
  out.labels = labels;
  out.totalFrames = totalFrames;
}

// One drawn placement of a frame, with the clip its mask imposes on it, or null when nothing masks it.
interface SwfFrameEntry {
  clip: ClipRegion | null;
  placement: Readonly<SwfTagPlacement>;
}

interface SwfInstantiationState {
  activeSymbols: Set<number>;
  // Every placement appearance no node can carry, filled as the timelines instantiate. It rides here
  // rather than through each call because it is per-import state exactly as the rest of this is.
  appearances: SwfNodeAppearance[];
  // The same sink the parse carried, so instantiation-time losses report through one channel.
  diagnostics: ImportDiagnostic[] | undefined;
  // The named handlers, in the order a placed character is offered to them. Held here rather than
  // rebuilt per node, because instantiation walks every placement of every frame of every symbol.
  handlers: readonly Readonly<SwfTagHandler>[];
  frameRate: number | null;
  resolvedBounds: Map<number, SwfTagRectangle | null>;
  resolvingBounds: Set<number>;
}

// Walks the whole tag stream, then lets each named handler finish the work it could not do at a tag.
// The five resolution steps that used to run unconditionally here are now the handlers' own `resolve`
// callbacks, so a build that did not name a handler never reaches the code behind it: the AVM2 reader,
// the sound cue conversions, the text composer and the font table join all leave with their handlers.
function readSwfTags(
  reader: SwfReader,
  options: Readonly<SwfParseOptions>,
  diagnostics: ImportDiagnostic[] | undefined,
): SwfTagParseResult | null {
  const state: SwfTagParseState = createSwfTagParseState(expandSwfTagHandlerDispatch(options.tags), diagnostics);
  const timeline = readSwfTimeline(reader, state);
  if (timeline === null) return null;
  for (const handler of options.tags) handler.resolve?.(state, timeline);
  return { ...state, timeline };
}

// The empty state one import fills. Every handler writes into the same object, so a definition one
// handler reads can have been declared by another — which is what the format itself does.
function createSwfTagParseState(
  dispatch: SwfTagParseState['dispatch'],
  diagnostics: ImportDiagnostic[] | undefined,
): SwfTagParseState {
  return {
    abcBlobs: [],
    backgroundColor: null,
    characterBounds: new Map(),
    definedCharacters: new Set(),
    diagnostics,
    dispatch,
    editTexts: new Map(),
    fontCodePoints: new Map(),
    fontNames: new Map(),
    fontOutlineSources: new Map(),
    images: new Map(),
    imageTextures: new Map(),
    jpegAlphaPayloads: new Map(),
    jpegTables: null,
    linkages: new Map(),
    morphBounds: new Map(),
    morphShapes: new Map(),
    pendingInitActions: [],
    pendingTexts: [],
    remainingFrameEntries: MAX_TIMELINE_FRAME_ENTRIES,
    scalingGrids: new Map(),
    shapes: new Map(),
    soundCuesAwaitingClass: [],
    soundCuesAwaitingRate: [],
    soundResources: new Map(),
    sounds: new Map(),
    sprites: new Map(),
    streamSounds: [],
    videoTextures: new Map(),
    videos: new Map(),
  };
}

interface SwfFile {
  frameRate: number;
  parsed: SwfTagParseResult;
  stageBounds: SwfTagRectangle;
}

function readSwfFile(
  source: Uint8Array,
  options: Readonly<SwfParseOptions>,
  diagnostics: ImportDiagnostic[] | undefined,
): SwfFile | null {
  const uncompressed = uncompressSwfSource(source, options.deflate ?? null, options.lzma ?? null, diagnostics);
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

  const parsed = readSwfTags(body, options, diagnostics);
  return parsed === null ? null : { frameRate, parsed, stageBounds };
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
  bounds: SwfTagRectangle | null,
  parsed: Readonly<SwfTagParseResult>,
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
  parsed: Readonly<SwfTagParseResult>,
  slots: Scene2DSlotReference[],
  state: SwfInstantiationState,
  depth: number,
): boolean {
  if (depth > MAX_SPRITE_NESTING) return false;

  const nodes = new Map<number, Node2D>();
  const frames: SwfFrameEntry[][] = [];
  const clips = new Map<Readonly<SwfTagPlacement>, Map<Readonly<SwfTagPlacement>, ClipRegion | null>>();

  for (const frame of timeline.frames) {
    const ordered = [...frame.values()].sort(compareSwfPlacementDepth);
    frames.push(buildSwfFrameEntries(ordered, parsed, clips, state.diagnostics));
    for (const placement of ordered) {
      const key = createSwfInstanceKey(placement);
      if (nodes.has(key)) continue;
      // A masking placement is never drawn — it contributes its shape as a clip on what it covers, so it
      // earns no node of its own.
      if (placement.clipDepth > 0) continue;
      const sprite = parsed.sprites.get(placement.characterId);
      // A placement earns a node when it is named, or when a registered family defined visual content for
      // its character. A character whose family this build left out is content the document does not
      // carry, and a placement of it is as empty as a placement of a character nothing defined.
      if (!placement.name && !hasSwfHandlerPlacementContent(state.handlers, parsed, placement.characterId)) continue;
      // The node and its reference exist before the symbol behind it is populated, so a manifest lists a
      // container ahead of the named descendants it carries.
      const targetBounds = resolveSwfCharacterBounds(parsed, placement.characterId, state, 0);
      const claimed = createSwfHandlerPlacementNode(
        state.handlers,
        parsed,
        placement.characterId,
        targetBounds,
        state.diagnostics,
      );
      const target =
        claimed ?? (sprite === undefined ? createSwfDisplayObject(targetBounds) : createSwfMovieClip(targetBounds));
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

      if (sprite !== undefined && claimed === null) {
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
  const appliedMatrices = new Map<Node2D, Readonly<SwfTagMatrix>>();
  const appliedClips = new Map<Node2D, ClipRegion | null>();
  const appliedAlphas = new Map<Node2D, number>();
  const appliedColorAdjustments = new Map<Node2D, readonly Adjustment[] | null>();
  const appliedRatios = new Map<Node2D, number>();
  const constructFrame = (target: Node2D, frame: number): void => {
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
  };
  const out = allocateEntity<TimelineSource>();
  assignTimelineSourceFields(out, constructFrame, cues, frameRate, labels, frames.length);
  return finishEntity(out);
}

// Pairs each drawn placement of a frame with the clip its mask imposes. SWF masks by depth range — a
// placement with a clip depth covers every depth above its own through that clip depth — while Flight
// clips a node and its subtree. Applying one region to each covered sibling is equivalent to grouping
// them under a clipped container, and it leaves the attach/detach/reorder path untouched.
function buildSwfFrameEntries(
  ordered: readonly Readonly<SwfTagPlacement>[],
  parsed: Readonly<SwfTagParseResult>,
  clips: Map<Readonly<SwfTagPlacement>, Map<Readonly<SwfTagPlacement>, ClipRegion | null>>,
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
  ordered: readonly Readonly<SwfTagPlacement>[],
  placement: Readonly<SwfTagPlacement>,
  diagnostics: ImportDiagnostic[] | undefined,
): Readonly<SwfTagPlacement> | null {
  let mask: Readonly<SwfTagPlacement> | null = null;
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
  mask: Readonly<SwfTagPlacement>,
  placement: Readonly<SwfTagPlacement>,
  parsed: Readonly<SwfTagParseResult>,
  clips: Map<Readonly<SwfTagPlacement>, Map<Readonly<SwfTagPlacement>, ClipRegion | null>>,
): ClipRegion | null {
  let byMasked = clips.get(mask);
  if (byMasked === undefined) {
    byMasked = new Map<Readonly<SwfTagPlacement>, ClipRegion | null>();
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
  mask: Readonly<SwfTagPlacement>,
  placement: Readonly<SwfTagPlacement>,
  parsed: Readonly<SwfTagParseResult>,
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

function compareSwfPlacementDepth(a: Readonly<SwfTagPlacement>, b: Readonly<SwfTagPlacement>): number {
  return a.depth - b.depth;
}

// Instance identity within one timeline. A move keeps its depth and character so it keeps its node across
// frames, while a replacement at the same depth is a different instance and gets a node of its own.
function createSwfInstanceKey(placement: Readonly<SwfTagPlacement>): number {
  return placement.depth * SWF_INSTANCE_KEY_SCALE + placement.characterId;
}

// Builds the node one exported character becomes, resolving the same character kinds in the same order a
// placement does — an exported bitmap or edit text is as ordinary a library symbol as an exported sprite,
// and dispatching differently here would make a symbol import unlike the identical character placed on a
// timeline.
function createSwfSymbolNode(
  parsed: Readonly<SwfTagParseResult>,
  characterId: number,
  slots: Scene2DSlotReference[],
  state: SwfInstantiationState,
): Node2D | null {
  const bounds = resolveSwfCharacterBounds(parsed, characterId, state, 0);
  const claimed = createSwfHandlerPlacementNode(state.handlers, parsed, characterId, bounds, state.diagnostics);
  if (claimed !== null) return claimed;
  const sprite = parsed.sprites.get(characterId);
  return sprite === undefined ? null : createSwfTimelineNode(sprite, bounds, parsed, slots, state, 0);
}

// Asks each named handler, in the caller's own array order, what a placed character becomes. A character
// id is defined exactly once — a second definition under the same id is refused at the tag — so at most
// one handler ever answers, and the order only decides which is asked first. Null means nothing this
// build named defined the character, which is the caller's cue to fall back to a bare container.
function createSwfHandlerPlacementNode(
  handlers: readonly Readonly<SwfTagHandler>[],
  parsed: Readonly<SwfTagParseResult>,
  characterId: number,
  bounds: SwfTagRectangle | null,
  diagnostics: ImportDiagnostic[] | undefined,
): Node2D | null {
  for (const handler of handlers) {
    const node = handler.instantiate?.createPlacementNode?.(parsed, characterId, bounds, diagnostics);
    if (node !== undefined && node !== null) return node;
  }
  return null;
}

// Whether any named handler defined visual content for the character. Asked before a node is built,
// so a placement that earns none allocates nothing.
function hasSwfHandlerPlacementContent(
  handlers: readonly Readonly<SwfTagHandler>[],
  parsed: Readonly<SwfTagParseResult>,
  characterId: number,
): boolean {
  for (const handler of handlers) {
    if (handler.instantiate?.hasPlacementContent?.(parsed, characterId) === true) return true;
  }
  return false;
}

function resolveSwfCharacterBounds(
  parsed: Readonly<SwfTagParseResult>,
  characterId: number,
  state: SwfInstantiationState,
  depth: number,
): SwfTagRectangle | null {
  const direct = parsed.characterBounds.get(characterId);
  if (direct !== undefined) return direct;
  if (state.resolvedBounds.has(characterId)) return state.resolvedBounds.get(characterId) ?? null;
  const sprite = parsed.sprites.get(characterId);
  if (sprite === undefined || depth > MAX_SPRITE_NESTING || state.resolvingBounds.has(characterId)) return null;

  state.resolvingBounds.add(characterId);
  // A symbol's authored extent covers everything it can show, so this unions every frame's placements
  // rather than only the first frame's: the node's local bounds do not change as its playhead moves.
  let bounds: SwfTagRectangle | null = null;
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

// ── Tag handlers ──────────────────────────────────────────────────────────────
// Each handler matches the SwfTagHandler signature and delegates to the internal helpers above.
// Exported through the contract lane so callers can assemble custom registries.

export function initializeSwfDocumentImport(
  out: EntityConstruction<SwfDocumentImport>,
  appearances: SwfNodeAppearance[],
  document: Scene2DDocument,
  jpegAlphaPayloads: SwfJpegAlphaPayload[],
): void {
  out.appearances = appearances;
  out.document = document;
  out.jpegAlphaPayloads = jpegAlphaPayloads;
}

// Every linkage name the file exported, whether or not the symbol was ever placed. Pair with
// `createScene2DSymbolFromSwf` to instantiate one.
export function readSwfExportedSymbolNames(source: Uint8Array, options: Readonly<SwfParseOptions>): string[] {
  const file = readSwfFile(source, options, undefined);
  return file === null ? [] : [...file.parsed.linkages.values()];
}

// Registers SWF with a document importer registry. The tag handlers are the caller's choice here as
// everywhere else: an application that imports SWF for its artwork alone names shape, placement and
// control and never links the script, audio or image-decoding chains.
export function registerSwfScene2DDocumentImporter(
  importers: Scene2DDocumentImporterRegistry,
  options: Readonly<SwfParseOptions>,
): void {
  registerScene2DDocumentImporter(importers, 'swf', matchesSwfDocument, (source) =>
    createScene2DFromSwf(source, options),
  );
}

// Presents any container form as the uncompressed bytes the rest of the importer reads. `FWS` is already
// that and is returned as-is, with no copy. `CWS` and `ZWS` compress everything after the 8-byte header,
// so the body is inflated through the registered decompressor and spliced back behind a header rewritten
// to `FWS` — the declared length already counts uncompressed bytes, so it carries over untouched.
// Compression the caller has not registered a decompressor for is reported as the document's null
// sentinel, exactly like a malformed file: the bytes are unreadable either way.
export function uncompressSwfSource(
  source: Uint8Array,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
  diagnostics?: ImportDiagnostic[],
): Uint8Array | null {
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
  // A slot the file selects but the host does not fill is simply absent. Absent stays explicit — null,
  // not a stub that fails later — and needs no diagnostic of its own: the host's own group is the
  // caller-visible record of what it can decompress.
  // The container's own signature chose the algorithm; the caller supplied each provider directly, so
  // this only picks between them. A provider the caller did not supply stays null, and null is the
  // honest answer rather than a stub that fails later.
  const slot = compression === Compression.Deflate ? deflate : lzma;
  if (slot === null) return null;

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
  const body = slot.decompress(source.subarray(streamStart), bodyLength, framing);
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

const CWS_SIGNATURE = 0x43;
const FWS_SIGNATURE = 0x46;
const MAX_SPRITE_NESTING = 256;
const MIN_SWF_LENGTH = 12;
const S_SIGNATURE = 0x53;
const SWF_INSTANCE_KEY_SCALE = 0x10000;
const SWF_LZMA_PREFIX_LENGTH = 17;
const SWF_MIME_TYPE = 'application/x-shockwave-flash';
const SWF_PREFIX_LENGTH = 8;

const _maskPoint = { x: 0, y: 0 };
const W_SIGNATURE = 0x57;
const ZWS_SIGNATURE = 0x5a;
