import type { Adjustment } from './Adjustment';
import type { AdvancedBlendMode } from './AdvancedBlendMode';
import type { AudioResource } from './AudioResource';
import type { BlendMode } from './BlendMode';
import type { FrameScript } from './FrameScript';
import type { GlyphOutlineSource } from './GlyphOutlineSource';
import type { ImportDiagnostic } from './ImportDiagnostic';
import type { MorphShape } from './MorphShape';
import type { RenderEffect } from './RenderEffect';
import type { RichText } from './RichText';
import type { Shape } from './Shape';
import type { Texture2D } from './Texture';
import type { TimelineAudioCue } from './TimelineCue';
import type { TimelineCue } from './TimelineCue';
import type { TimelineLabel } from './TimelineLabel';

/**
 * The bounded reader a SWF tag handler receives. Reads are little-endian for bytes, big-endian
 * for bits within a byte, and a read past `end` sets `valid` to false and returns zero.
 */
export interface SwfTagReader {
  readonly end: number;
  pos: number;
  readonly source: Uint8Array;
  valid: boolean;
  alignToByte(): void;
  readEncodedUint32(): number;
  readFixed8(): number;
  readSignedBits(count: number): number;
  readString(): string;
  readUint8(): number;
  readUint16(): number;
  readUint32(): number;
  readUnsignedBits(count: number): number;
}

/**
 * One SWF tag handler, registered by numeric tag code. A handler reads its tag body from the
 * bounded reader and writes results into the shared parse and timeline state. Returns false
 * to abort the entire timeline (a hard structural failure), true otherwise.
 */
export type SwfTagHandler = (
  body: SwfTagReader,
  tag: number,
  state: SwfTagParseState,
  timeline: SwfTagTimelineState,
  diagnostics: ImportDiagnostic[] | undefined,
) => boolean;

/** The registry of tag handlers, keyed by numeric SWF tag code. */
export type SwfTagHandlerRegistry = Map<number, SwfTagHandler>;

/** A rectangle as the SWF reader produces it — in pixels, origin at top-left. */
export interface SwfTagRectangle {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** A SWF affine transform matrix. */
export interface SwfTagMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/** One display-list placement accumulated by PlaceObject records. */
export interface SwfTagPlacement {
  advancedBlendMode: AdvancedBlendMode | null;
  alpha: number;
  blendMode: BlendMode;
  characterId: number;
  clipDepth: number;
  colorAdjustments: readonly Adjustment[] | null;
  colorTransformAdjustments: readonly Adjustment[] | null;
  depth: number;
  directLinkage: string | null;
  effects: readonly RenderEffect[];
  filterAdjustments: readonly Adjustment[];
  matrix: SwfTagMatrix;
  name: string | null;
  ratio: number;
}

/**
 * One parsed SWF timeline: frames, labels, actions, and cues. Used both for the root timeline
 * and for DefineSprite bodies.
 */
export interface SwfTimeline {
  readonly actions: Map<number, FrameScript>;
  readonly cues: TimelineCue[];
  readonly frames: ReadonlyMap<number, SwfTagPlacement>[];
  readonly labels: TimelineLabel[];
}

/**
 * The file-wide parse state every tag handler can read and write. Definition tags populate
 * these maps; timeline tags read from them. Shared across the root timeline and every
 * DefineSprite nested inside it.
 */
export interface SwfTagParseState {
  readonly abcBlobs: { bytes: Uint8Array; named: boolean }[];
  backgroundColor: number | null;
  readonly characterBounds: Map<number, SwfTagRectangle>;
  readonly definedCharacters: Set<number>;
  readonly diagnostics: ImportDiagnostic[] | undefined;
  readonly editTexts: Map<number, (resolveFontName: (fontId: number) => string) => RichText>;
  readonly fontCodePoints: Map<number, number[]>;
  readonly fontNames: Map<number, string>;
  readonly fontOutlineSources: Map<number, GlyphOutlineSource>;
  readonly images: Map<number, { bytes: Uint8Array; mimeType: string }>;
  readonly imageTextures: Map<number, Map<string, Texture2D>>;
  readonly jpegAlphaPayloads: Map<
    number,
    {
      characterId: number;
      compressedAlphaBytes: Uint8Array;
      deblockingParameterRaw: number | null;
      height: number;
      width: number;
    }
  >;
  jpegTables: Uint8Array | null;
  readonly linkages: Map<number, string>;
  readonly morphBounds: Map<number, { end: SwfTagRectangle; start: SwfTagRectangle }>;
  readonly morphShapes: Map<number, () => MorphShape | null>;
  readonly pendingInitActions: { characterId: number; script: FrameScript }[];
  readonly pendingTexts: { characterId: number; end: number; start: number; version: number }[];
  remainingFrameEntries: number;
  readonly scalingGrids: Map<number, SwfTagRectangle>;
  readonly shapes: Map<number, Shape>;
  readonly soundCuesAwaitingClass: { className: string; cue: TimelineAudioCue }[];
  readonly soundCuesAwaitingRate: { characterId: number; cue: TimelineAudioCue }[];
  readonly soundResources: Map<number, AudioResource>;
  readonly sounds: Map<number, { bytes: Uint8Array; mimeType: string | null; sampleRate: number }>;
  readonly sprites: Map<number, SwfTimeline>;
  readonly streamSounds: { bytes: Uint8Array; mimeType: string; resource: AudioResource }[];
  readonly videoTextures: Map<number, Texture2D>;
  readonly videos: Map<
    number,
    { codecId: number; deblocking: number; frameCount: number; height: number; smoothing: boolean; width: number }
  >;
}

/**
 * The per-timeline state: display-list placements, frames, labels, cues, and stream audio
 * chunks being assembled. Each DefineSprite has its own instance; the root timeline has one
 * too.
 */
export interface SwfTagTimelineState {
  readonly actions: Map<number, FrameScript>;
  readonly cues: TimelineCue[];
  readonly frames: Map<number, SwfTagPlacement>[];
  readonly labels: TimelineLabel[];
  readonly placements: Map<number, SwfTagPlacement>;
  readonly streamChunks: Uint8Array[];
  streamFormat: number;
  streamStartFrame: number;
}

/** One entry in the manifest `explainSwfContent` returns. */
export interface SwfContentEntry {
  code: number;
  count: number;
  handled: boolean;
  name: string;
}

/**
 * Plain-data manifest describing what a SWF file contains, without interpreting any tag
 * bodies. The diagnostic companion to `createScene2DFromSwf`.
 */
export interface SwfContentManifest {
  entries: SwfContentEntry[];
  frameRate: number;
  stageBounds: SwfTagRectangle | null;
  totalTags: number;
}
