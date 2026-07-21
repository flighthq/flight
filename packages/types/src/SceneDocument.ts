import type { AnimationTrack } from './AnimationTrack';
import type { Projection } from './Camera3D';
import type { Kind } from './Entity';
import type { ImageResourceReference } from './ImageResourceReference';
import type { Light } from './Light';
import type { MaterialLike } from './Material';
import type { Matrix4Like } from './Matrix4';
import type { MeshGeometry } from './MeshGeometry';
import type { MeshMorph } from './MorphTarget';
import type { SceneAnimationPath } from './SceneAnimationPath';
import type { SceneMetadata } from './SceneMetadata';
import type { Transform3D } from './Transform3D';

// A SceneDocument is Flight's format-neutral, plain-data intermediate representation of a 3D scene: the
// decomposed set of top-level tables (`nodes`, `meshes`, `materials`, `skins`, `animations`, `cameras`,
// `lights`, `resources`) that every scene-format parser fills, and that `createSceneFromDocument` assembles
// into a live `Scene`. It is the hub of the import/serialization stack:
//
//   foreign bytes  --parse<Format>-->  SceneDocument  --createSceneFromDocument-->  Scene
//   Scene  --createSceneDocumentFromScene-->  SceneDocument  --format/parse--> native bytes
//
// The document is exactly the decomposition an importer already builds internally (a node pool, per-primitive
// geometries, resolved materials, skins, animations) — parsing STOPS at this decomposition and returns it,
// rather than assembling a Scene inline. Foreign formats fill the subset they carry; the document is the
// canonical superset.
//
// Cross-table references are integer indices into the sibling tables (the glTF/USD idiom): a node names its
// mesh by index into `meshes`, a mesh names its materials and its skin by index, a skin's joints are node
// indices, an animation channel binds to a node index, and a camera/light optionally rides a node by index.
// Index refs keep instancing free — many nodes can share one mesh by pointing at the same `meshes` slot, and
// the assembler shares that geometry by reference.
//
// Geometry is INLINE (`SceneDocumentMesh.geometry` is a live `MeshGeometry`), not de-referenced through a
// binary buffer/accessor table. glTF's accessors are resolved into inline geometry at parse time; a
// buffer/accessor layer would force the buffer-less formats (OBJ, AWD, MD5) to encode-then-decode for no gain.
// That binary layer is deliberately deferred to a future ON-DISK native serialization format, not the
// in-memory document. Read geometry through the document accessors so a lazy backing can be added later
// without breaking callers.
export interface SceneDocument {
  animations: SceneDocumentAnimation[];
  cameras: SceneDocumentCamera[];
  lights: SceneDocumentLight[];
  materials: MaterialLike[];
  meshes: SceneDocumentMesh[];
  metadata: SceneMetadata | null;
  nodes: SceneDocumentNode[];
  // The image references materials' textures point at, resolved by an explicit
  // `resolveSceneResources` pass — never eagerly during parse.
  resources: ImageResourceReference[];
  scenes: SceneDocumentScene[];
  skins: SceneDocumentSkin[];
}

// One entry in a document's animation table. A SceneDocument animation carries its channels' node-target
// bindings explicitly (`SceneDocumentAnimationChannel`) because the animation core's `AnimationClip` is
// target-free — the document must record which node index and which transform/weights sink each channel
// drives so the assembler can rebuild a live, node-bound clip.
export interface SceneDocumentAnimation {
  channels: SceneDocumentAnimationChannel[];
  duration: number;
  name?: string;
}

// One channel of a document animation: a sampled track plus the node index and animation path (Translation /
// Rotation / Scale / Weights) it drives. The assembler resolves `node` against the built node array and binds
// the track to that node's transform component (or the mesh's morph weights) as a `SceneAnimationTarget`.
export interface SceneDocumentAnimationChannel {
  node: number;
  path: SceneAnimationPath;
  track: AnimationTrack;
}

// One standalone, placed camera. A camera is NOT a scene node — it is a pure entity carrying its own
// `transform` (world placement) and `projection` descriptor. `node` optionally binds the camera to a node
// index for the "rides an animated node" case; the assembler drives the camera's view from that node's world
// matrix (e.g. `setCamera3DViewMatrix4FromMatrix4`) rather than parenting it into the graph.
export interface SceneDocumentCamera {
  name?: string;
  node?: number;
  projection: Projection;
  transform: Transform3D;
}

// One standalone, placed light. Like a camera, a light is not a scene node: it carries a `descriptor` (an
// ambient/directional/point/spot/etc. `Light`) with its placement baked into `transform`, plus an optional
// `node` index for the animated-placement case.
export interface SceneDocumentLight {
  descriptor: Light;
  node?: number;
  transform: Transform3D;
}

// One entry in a document's mesh table. Geometry is inline (see the file header). `materials` are indices
// into `SceneDocument.materials`, one per geometry subset (positional, matching `Mesh.materials`); `skin` is
// an index into `SceneDocument.skins` (absent for a rigid mesh); `morph` is inline blend-shape data. Many
// nodes may reference one mesh entry — the assembler shares its geometry by reference (instancing).
export interface SceneDocumentMesh {
  geometry: MeshGeometry;
  materials: number[];
  morph?: MeshMorph | null;
  name?: string;
  skin?: number;
}

// One entry in a document's node table: an authored `transform`, child node indices, an optional `mesh`
// index, and the node `kind`. Nodes carry NO camera or light — those are standalone tables that optionally
// point back at a node. The node array is flat; hierarchy is expressed through `children` index lists, with a
// scene's `rootNodes` naming the entry points.
export interface SceneDocumentNode {
  children: number[];
  kind: Kind;
  mesh?: number;
  name?: string;
  transform: Transform3D;
}

// One entry in a document's scene table: a named set of root node indices. A document may carry several
// scenes (glTF's multi-scene model); the assembler builds the requested scene (default = the first).
export interface SceneDocumentScene {
  name?: string;
  rootNodes: number[];
}

// One entry in a document's skin table: the node indices that are the skin's joints, plus the flat
// inverse-bind matrix array (one `Matrix4` per joint, index-aligned with `joints`). The assembler resolves
// the joint indices against the built node array to construct a live `Skin`/`Skeleton3D`.
export interface SceneDocumentSkin {
  inverseBind: Matrix4Like[];
  joints: number[];
}
