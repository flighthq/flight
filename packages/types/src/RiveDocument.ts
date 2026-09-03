import type { AdvancedBlendMode } from './AdvancedBlendMode';
import type { AnimationClip } from './AnimationClip';
import type { DisplayObject } from './DisplayObject';
import type { Entity } from './Entity';
import type { ImageResourceReference } from './ImageResourceReference';
import type { LayoutTree } from './Layout';
import type { Scene2DSlotReference } from './Scene2DDocument';
import type { PathWinding } from './ShapeCommand';
import type { Skeleton2D } from './Skeleton2D';

/**
 * Rive `.riv` container types used by `@flighthq/scene2d-formats`.
 *
 * A `.riv` file is not a document tree on the wire — it is a flat stream of **core objects**, each a
 * numeric type key followed by numeric property keys and their values. Hierarchy, artboards,
 * animations, and state machines are all reconstructed *from* that stream by later stages. These
 * types model the container faithfully and nothing more, so the decode step stays separable from
 * every interpretation built on it.
 */

/**
 * Wire field codes. The file's table of contents stores one of these per property key using two
 * bits, which is what lets a reader skip a property whose meaning it does not know — the code says
 * how many bytes to consume even when the key is meaningless to the reader.
 *
 * A boolean is carried as a single byte valued 0 or 1. That is byte-identical to a one-byte varuint
 * for those two values, which is why booleans need no code of their own and travel as `Uint`.
 */
export const RiveFieldType = {
  /** Unsigned LEB128, variable width. */
  Uint: 0,
  /** Varuint byte length followed by that many raw bytes; UTF-8 when read as text. */
  String: 1,
  /** IEEE-754 binary32, little-endian, always four bytes. */
  Double: 2,
  /** Unsigned 32-bit, little-endian, always four bytes. Carries a packed color. */
  Color: 3,
} as const;

export type RiveFieldType = (typeof RiveFieldType)[keyof typeof RiveFieldType];

/**
 * A decoded property value. Text surfaces as a string, raw blobs as bytes, and everything else as a
 * number.
 *
 * Text and blobs share one wire code, because the table of contents has only two bits per property
 * and its job is to say how many bytes to skip — not what they mean. Which of the two a property
 * actually is comes from the object model, and it matters: decoding an image's bytes as UTF-8 would
 * corrupt them.
 */
export type RiveValue = number | string | Uint8Array;

/**
 * One property of one core object. The field type is retained alongside the value because it is what
 * made the value readable, and because a later mapping stage needs it to tell a color from a plain
 * unsigned integer — both of which arrive as numbers.
 */
export interface RiveProperty {
  key: number;
  type: RiveFieldType;
  value: RiveValue;
}

/**
 * One object in the file's flat stream. `typeKey` identifies which Rive core type this is; the
 * container assigns it no meaning. Properties appear in the order the file stated them.
 */
export interface RiveCoreObject {
  properties: RiveProperty[];
  typeKey: number;
}

/** A single table-of-contents entry: the field type the file declares for one property key. */
export interface RivePropertyFieldType {
  key: number;
  type: RiveFieldType;
}

/**
 * The file header. `fileId` may legitimately be zero. The table of contents is the file's own
 * forward-compatibility mechanism: it declares the wire width of property keys so a reader that
 * predates a property can still traverse past it.
 */
export interface RiveDocumentHeader {
  fileId: number;
  majorVersion: number;
  minorVersion: number;
  tableOfContents: RivePropertyFieldType[];
}

/** A decoded `.riv` container: its header, and the core-object stream in file order. */
export interface RiveDocument {
  header: RiveDocumentHeader;
  objects: RiveCoreObject[];
}

/**
 * One artboard's component tree, recovered from the flat stream.
 *
 * `objects` is the artboard's own numbering space: **the artboard itself is index 0**, followed by
 * its components in stream order. That numbering is what `parentId` indexes into, so it is the
 * artboard rather than the file that gives a component its address.
 */
export interface RiveArtboardGraph {
  objects: RiveCoreObject[];
  /**
   * Where this artboard's objects begin and end in the file's own stream. Animations and their
   * keyframes follow their artboard but are not components, so they fall outside `objects` and can
   * only be found through this span.
   */
  streamEnd: number;
  streamStart: number;
  /**
   * The parent of each entry in `objects`, as an index into that same array. The artboard at index 0
   * has no parent and carries -1, as does any component whose stated parent could not be resolved.
   */
  parentIndices: number[];
}

/** Every artboard in a `.riv`, each with its component tree resolved. */
export interface RiveObjectGraph extends Entity {
  artboards: RiveArtboardGraph[];
}

/**
 * One asset the file declares. `bytes` carries an embedded payload when the file ships one, handed
 * over untouched — decoding it into an image or font is a resource-layer concern, not this codec's.
 * `kind` is the asset's own type name, so a caller can tell an image from a font without a second
 * lookup.
 */
export interface RiveFileAsset {
  bytes: Uint8Array | null;
  cdnBaseUrl: string;
  height: number;
  kind: string;
  name: string;
  width: number;
}

/**
 * A state machine as plain data. Rive's state-machine *runtime* — inputs driving transitions — is a
 * separate concern from parsing, so this describes the machine and interprets none of it.
 *
 * References keep the values the file states rather than being resolved into positions, because Rive
 * uses several distinct id spaces and a descriptor that guessed at one would be worse than a faithful
 * report of what is written.
 */
export interface RiveStateMachineTransition {
  duration: number;
  exitTime: number;
  flags: number;
  toStateId: number;
}

/** One state in a layer. `animationId` is -1 for states that play no animation. */
export interface RiveStateMachineState {
  animationId: number;
  kind: string;
  transitions: RiveStateMachineTransition[];
}

export interface RiveStateMachineLayer {
  name: string;
  states: RiveStateMachineState[];
}

/** A named input. `value` is a boolean, a number, or null for a trigger, which carries none. */
export interface RiveStateMachineInput {
  kind: string;
  name: string;
  value: boolean | number | null;
}

export interface RiveStateMachineDescriptor {
  inputs: RiveStateMachineInput[];
  layers: RiveStateMachineLayer[];
  name: string;
}

/**
 * A node whose blend mode cannot be fixed-function blend state, paired with the advanced mode it
 * asks for. Applying it means building a `BlendEffect`, which bounces through an offscreen and
 * samples the backdrop — an explicit step the caller takes, never something import performs.
 */
export interface RiveAdvancedBlend {
  mode: AdvancedBlendMode;
  node: DisplayObject;
}

/**
 * How an animation repeats once it reaches its end. Rive states this per animation; Flight's
 * `AnimationClip` carries channels and a duration and takes no position on repetition, so the mode is
 * reported here for the caller that drives playback rather than being folded into the clip.
 */
export const RiveAnimationLoop = {
  /** Plays once and holds on the last frame. */
  OneShot: 'OneShot',
  /** Restarts from the beginning each time it reaches the end. */
  Loop: 'Loop',
  /** Alternates direction, playing forward then backward. */
  PingPong: 'PingPong',
} as const;

export type RiveAnimationLoop = (typeof RiveAnimationLoop)[keyof typeof RiveAnimationLoop];

/**
 * One artboard's bone rig, flattened out of the artboard's component tree into the flat,
 * parent-before-child array a `Skeleton2D` requires.
 *
 * Rive's bones are `TransformComponent`s living in the artboard's own tree, siblings of `Node` rather
 * than nodes themselves, while `Skeleton2D` owns a decoupled bone array and propagates its own world
 * transforms. Bridging the two is a **topological sort**, not a graph problem: the artboard tree
 * resolves every stated parent with no cycle, so ordering by depth is well-founded.
 *
 * `boneIndices` maps an artboard **component index** to a bone index, or −1 where that component is
 * not a bone. Animation keys its objects by component index, so a channel needs this to reach the
 * bone it drives.
 */
export interface RiveSkeleton2DImport extends Entity {
  boneIndices: number[];
  skeleton: Skeleton2D;
}

/**
 * A named clip. A Rive artboard carries several animations and the name is how a caller picks one.
 *
 * `loop`, `speed` and the work area are **stated by the file and reported rather than applied**. An
 * `AnimationClip` is a bundle of channels sampled at a time, with no notion of repetition, rate, or a
 * trimmed play range, so applying them here would mean baking a playback policy into sampled data.
 * The caller that drives the playhead is the one that can honor them.
 */
export interface RiveAnimationClip {
  clip: AnimationClip;
  loop: RiveAnimationLoop;
  name: string;
  /**
   * Playback rate the animation states, where 1 is authored speed. Rive permits a negative rate,
   * which plays the animation backward.
   */
  speed: number;
  /**
   * The end of the animation's work area in seconds, or `null` when it enables none. A work area
   * trims playback to a span of the timeline without discarding the keyframes outside it, which is
   * why import reports the span instead of dropping them.
   */
  workAreaEnd: number | null;
  /** The start of the animation's work area in seconds, or `null` when it enables none. */
  workAreaStart: number | null;
}

/**
 * One independent authored-layout root inside an artboard.
 *
 * `tree.nodes[index]` describes `targets[index]`. The importer deliberately supplies neither an
 * intrinsic-size buffer nor resolved rectangles: the caller measures each target's natural width and
 * height, fills the two-number-per-target buffer accepted by `@flighthq/layout`, and owns the output
 * buffer and the later rectangle-to-node binding. Several roots are possible when ordinary Rive nodes
 * separate otherwise independent LayoutComponents.
 */
export interface RiveLayoutImport {
  targets: DisplayObject[];
  tree: LayoutTree;
}

/**
 * One imported artboard. A `.riv` holds several, so import returns them side by side rather than
 * choosing one; the artboard's own size travels with its subtree because nothing in the display tree
 * records it.
 */
export interface RiveArtboardImport {
  /** Nodes needing a `BlendEffect`, because their mode is destination-reading or non-separable. */
  advancedBlends: RiveAdvancedBlend[];
  animations: RiveAnimationClip[];
  /** The artboard's state machines, described as data. Nothing here is interpreted or driven. */
  stateMachines: RiveStateMachineDescriptor[];
  height: number;
  /** Authored layout roots, each paired index-for-index with the display nodes it arranges. */
  layouts: RiveLayoutImport[];
  name: string;
  root: DisplayObject;
  /**
   * The artboard's bone rig, flattened for `Skeleton2D`, or `null` when it has no bones — which is
   * most artboards. Bones are not display objects, so they sit alongside the tree rather than in it.
   */
  skeleton: RiveSkeleton2DImport | null;
  width: number;
}

/**
 * Which of a path vertex's positions a Rive weight drives.
 *
 * A straight vertex has only its anchor. A **cubic vertex carries three independently weighted
 * positions** — the anchor and each of its two handles — because `CubicWeight` extends `Weight` and
 * adds its own `inValues`/`inIndices` and `outValues`/`outIndices` alongside the inherited pair. A
 * handle is therefore neither skipped nor bound to its anchor's influences: it states its own. Any
 * addressing that names only vertices loses authored data on every cubic vertex in a rigged file.
 */
export const RiveWeightedPointKind = {
  /** The vertex's own anchor, weighted by the inherited `values`/`indices` pair. */
  Point: 'Point',
  /** The incoming cubic handle, weighted by `inValues`/`inIndices`. */
  In: 'In',
  /** The outgoing cubic handle, weighted by `outValues`/`outIndices`. */
  Out: 'Out',
} as const;

export type RiveWeightedPointKind = (typeof RiveWeightedPointKind)[keyof typeof RiveWeightedPointKind];

/**
 * One authored position to be skinned, named by the vertex that owns it.
 *
 * The coordinates come from the path reader rather than from the skin reader: a cubic handle's
 * position is stated in polar form and the three cubic kinds disagree on sign, so deriving it a
 * second time here would be a second place to get that wrong. The skin reader takes the resolved
 * coordinates and contributes only the weighting.
 */
export interface RiveWeightedPoint {
  kind: RiveWeightedPointKind;
  /** The vertex component's index in the artboard's numbering — where its `Weight` child hangs. */
  vertex: number;
  x: number;
  y: number;
}

/**
 * One path already resolved into its owning shape's space. Paint is applied per shape rather than
 * per path, so the shape holds its paths until the whole paint list is known.
 */
export interface RivePathRecord {
  commands: number[];
  data: number[];
  /** The path component this came from, so an animated vertex can regenerate it from source. */
  pathIndex: number;
  winding: PathWinding;
}

/**
 * A `.riv` prepared as a named-graph document: the pieces `Scene2DDocument` wants, plus the import
 * they came from. The artboards travel alongside because their clips, state machines and advanced
 * blends have no place in a static document — a caller that wants to play or blend needs the import.
 */
export interface RiveScene2DDocumentResult extends Entity {
  imageResources: ImageResourceReference[];
  imported: RiveDocumentImportResult;
  root: DisplayObject;
  slots: Scene2DSlotReference[];
}

/** The result of importing a `.riv`: every artboard it declares, in file order. */
export interface RiveDocumentImportResult extends Entity {
  artboards: RiveArtboardImport[];
  /** Every asset the file declares, in the order it declares them — which is how they are addressed. */
  assets: RiveFileAsset[];
}
