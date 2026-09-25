import type { Adjustment } from './Adjustment.ts';
import type { AdvancedBlendMode } from './AdvancedBlendMode.ts';
import type { AudioResource } from './AudioResource.ts';
import type { BlendMode } from './BlendMode.ts';
import type { Effect } from './Effect.ts';
import type { FrameScript } from './FrameScript.ts';
import type { GlyphOutlineSource } from './GlyphOutlineSource.ts';
import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { MorphShape } from './MorphShape.ts';
import type { RichText } from './RichText.ts';
import type { Shape } from './Shape.ts';
import type { SwfTagHandlerDispatch } from './SwfTagHandler.ts';
import type { Texture2D } from './Texture.ts';
import type { TimelineAudioCue } from './TimelineCue.ts';
import type { TimelineCue } from './TimelineCue.ts';
import type { TimelineLabel } from './TimelineLabel.ts';

/**
 * The bounded reader a SWF tag handler receives. Reads are little-endian for bytes, big-endian
 * for bits within a byte, and a read past `end` sets `valid` to false and returns zero.
 */
export interface SwfTagReader {
  /** The bit cursor within the byte at `pos`, 0..7. Byte reads align to the next byte boundary first. */
  bitPosition: number;
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
  effects: readonly Effect[];
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
  /**
   * The flat tag-code table this document is being walked with, so a DefineSprite body reads its nested
   * tag stream through exactly the registry the root was given.
   */
  readonly dispatch: SwfTagHandlerDispatch;
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
  readonly pendingTexts: {
    characterId: number;
    end: number;
    /** The decompressed file body the offsets index into, so composition needs no reader of its own. */
    source: Uint8Array;
    start: number;
    version: number;
  }[];
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

/**
 * The finished parse of one SWF file: every definition the tag walk collected, joined to the root
 * timeline it produced. It is the same object the handlers wrote into rather than a copy, so a Texture a
 * shape fill acquired during parsing is the one a placement of that bitmap samples.
 */
export interface SwfTagParseResult extends SwfTagParseState {
  readonly timeline: SwfTimeline;
}
