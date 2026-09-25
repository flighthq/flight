import type { Entity } from './Entity.ts';
import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { MeshGeometry } from './MeshGeometry.ts';
import type { Scene3DDocument } from './Scene3DDocument.ts';

/**
 * One AWD2 block, located but not interpreted.
 *
 * AWD2 blocks are length-prefixed, which is the whole reason a handler registry works here: a block no
 * registered handler claims costs its header read and nothing else, because the walk already knows where
 * the next one starts.
 *
 * `matrixWide` and `geometryWide` come from the block's own flags byte and say whether its transform and
 * vertex streams are written as 64-bit rather than 32-bit. They are read once by the walk rather than by
 * each handler, because every block carries them in the same place whatever its type.
 */
export interface Awd2Block {
  readonly blockId: number;
  readonly blockType: number;
  readonly dataEnd: number;
  readonly dataStart: number;
  readonly geometryWide: boolean;
  readonly matrixWide: boolean;
  readonly source: Uint8Array;
  readonly view: DataView;
}

/**
 * One AWD2 block-type handler — the unit of opt-in.
 *
 * Naming a handler in `Awd2ParseOptions.blocks` is what pulls its parsing, its build phase, and the
 * packages behind them into a build; leaving it out is what keeps them out. A file containing blocks nobody claimed still imports:
 * the unclaimed blocks are skipped by their length prefix and reported once per distinct type.
 */
export interface Awd2BlockHandler {
  /** Every AWD2 block type id this handler claims. Expanded once into the walk's flat dispatch table. */
  readonly blockTypes: readonly number[];
  /**
   * True when this handler's blocks cannot be read on the first pass because they reference data an
   * earlier block type carries — a skeleton pose names the skeleton whose joint count it is written
   * against. Deferred blocks are located on the first pass and parsed on the second.
   */
  readonly deferred?: boolean;
  /** Reads one block of a claimed type into the shared parse state. */
  parse(state: Awd2ParseState, block: Readonly<Awd2Block>): void;
  /**
   * Turns what this handler parsed into document content, once, after every block has been read.
   * Handlers run in a fixed order so one can consume what another produced; see the build order the
   * importer declares.
   */
  build?(state: Awd2ParseState): void;
}

/** The flat block-type table the walk dispatches through, expanded once per import. */
export type Awd2BlockDispatch = ReadonlyMap<number, Readonly<Awd2BlockHandler>>;

/**
 * Everything one AWD2 import accumulates, shared by every named handler.
 *
 * One state rather than per-handler state, because the format's cross-references are between families: a
 * mesh instance names a geometry and a material block, a light picker names lights, a pose names a
 * skeleton. Every lookup goes through a block id, so a handler that was not named leaves its map
 * empty and its references resolve to nothing — the same graceful degradation a missing block gets.
 */
export interface Awd2ParseState extends Entity {
  readonly cameras: Map<number, Awd2ParsedCamera>;
  readonly containers: Map<number, Awd2ParsedContainer>;
  readonly diagnostics: ImportDiagnostic[] | undefined;
  /** The document being built. Handlers append to it during their build phase. */
  readonly document: Scene3DDocument;
  readonly geometries: Map<number, Awd2ParsedGeometry[]>;
  readonly lightPickers: Map<number, Awd2ParsedLightPicker>;
  readonly lights: Map<number, Awd2ParsedLight>;
  readonly materials: Map<number, Awd2ParsedMaterial>;
  readonly meshInstances: Map<number, Awd2ParsedMeshInstance>;
  /**
   * The document node index each block produced, keyed by block id, so a later family can parent to a
   * node an earlier one created without holding a reference to it.
   */
  readonly nodeIndexForBlock: Map<number, number>;
  /**
   * Resolves an AWD material block id to a document material index, or -1. Installed by the materials
   * handler's build and read by the scene-structure handler's; null when materials were not registered,
   * which is what lets a geometry-only build carry no shading code at all.
   */
  resolveMaterial: ((materialId: number) => number) | null;
  readonly skeletonAnimations: Map<number, Awd2ParsedSkeletonAnimation>;
  /** The document node indices of the file's skeleton joints, in AWD skeleton order. Empty when none. */
  skeletonJointNodeIndices: number[];
  readonly skeletonPoses: Map<number, Awd2ParsedSkeletonPose>;
  readonly skeletons: Map<number, Awd2ParsedSkeleton>;
  /** The document skin index the file's skeleton produced, or undefined when it built none. */
  skinIndex: number | undefined;
  /** The rehydrated file body — already inflated, so a compressed file walks like an uncompressed one. */
  readonly source: Uint8Array;
  readonly textures: Map<number, Awd2ParsedTexture>;
  readonly view: DataView;
}

export interface Awd2ParsedCamera {
  bottom: number;
  fov: number;
  left: number;
  name: string;
  parentId: number;
  projectionType: number;
  right: number;
  top: number;
  transform: Float64Array;
}

export interface Awd2ParsedContainer {
  name: string;
  parentId: number;
  transform: Float64Array;
}

export interface Awd2ParsedGeometry {
  geometry: MeshGeometry;
  /**
   * True when the sub-mesh carried joint-index/weight streams and emitted the skinned layout, so the
   * mesh-instance build knows to bind the file's skeleton to the produced Mesh via `mesh.skin`.
   */
  skinned: boolean;
}

export interface Awd2ParsedJoint {
  name: string;
  parentIndex: number;
  transform: Float64Array;
}

export interface Awd2ParsedLight {
  ambient: number;
  ambientRgb: number;
  castsShadow: boolean;
  diffuse: number;
  directionX: number;
  directionY: number;
  directionZ: number;
  fallOff: number;
  /**
   * Whether the file actually wrote the falloff-start distance, which Flight's single-cutoff `range`
   * cannot hold — the flag is what separates a real drop from a default.
   */
  hasRadius: boolean;
  lightType: number;
  name: string;
  parentId: number;
  radius: number;
  rgb: number;
  specular: number;
  transform: Float64Array;
}

/**
 * The set of light block ids one picker selects. Away3D binds a picker to a MATERIAL, so a file can
 * light different materials with different subsets. Flight's light set is per-draw and scene-wide, so
 * pickers are read to detect and report that scoping, never to build with.
 */
export interface Awd2ParsedLightPicker {
  lightIds: number[];
  name: string;
}

export interface Awd2ParsedMaterial {
  alpha: number | null;
  color: number | null;
  diffuseTextureId: number;
  gloss: number | null;
  name: string;
  normalTextureId: number;
  /** The declared shading-method count. The method bodies are not walked yet. */
  numMethods: number;
  specularColor: number | null;
  specularStrength: number | null;
  specularTextureId: number;
}

export interface Awd2ParsedMeshInstance {
  geometryId: number;
  materialIds: number[];
  name: string;
  parentId: number;
  transform: Float64Array;
}

export interface Awd2ParsedSkeleton {
  joints: Awd2ParsedJoint[];
  name: string;
}

export interface Awd2ParsedSkeletonAnimation {
  name: string;
  poses: { duration: number; poseBlockId: number }[];
}

export interface Awd2ParsedSkeletonPose {
  jointTransforms: (Float64Array | null)[];
  name: string;
}

/**
 * Exactly one source form is populated: `bytes` (plus the detected `mimeType`) for an embedded,
 * self-describing image payload, or `url` for an external reference. Both null when an embedded payload
 * was not a recognized image format. The parser emits these as an ImageResourceReference; it neither
 * fetches nor decodes.
 */
export interface Awd2ParsedTexture {
  bytes: Uint8Array | null;
  mimeType: string | null;
  name: string;
  url: string | null;
}
