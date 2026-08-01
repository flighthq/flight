import type { AnimationTrack } from './AnimationTrack';
import type { Projection } from './Camera3D';
import type { Kind } from './Entity';
import type { ImageResourceReference } from './ImageResourceReference';
import type { Light } from './Light';
import type { MaterialLike } from './Material';
import type { Matrix4Like } from './Matrix4';
import type { MeshGeometry } from './MeshGeometry';
import type { MeshMorph } from './MorphTarget';
import type { Scene3DAnimationPath } from './Scene3DAnimationPath';
import type { Scene3DMetadata } from './Scene3DMetadata';
import type { Transform3D } from './Transform3D';

// A Scene3DDocument is Flight's format-neutral, plain-data intermediate representation of a 3D scene: the
// decomposed set of top-level tables (`nodes`, `meshes`, `materials`, `skins`, `animations`, `cameras`,
// `lights`, `resources`) that every scene-format parser fills, and that `createScene3DFromDocument` assembles
// into a live `Scene3D`. It is the hub of the import/serialization stack:
//
//   foreign bytes  --parse<Format>-->  Scene3DDocument  --createScene3DFromDocument-->  Scene3D
//   Scene3D  --createScene3DDocumentFromScene-->  Scene3DDocument  --format/parse--> native bytes
//
// The document is exactly the decomposition an importer already builds internally (a node pool, per-primitive
// geometries, resolved materials, skins, animations) — parsing STOPS at this decomposition and returns it,
// rather than assembling a Scene3D inline. Foreign formats fill the subset they carry; the document is the
// canonical superset.
//
// Cross-table references are integer indices into the sibling tables (the glTF/USD idiom): a node names its
// mesh by index into `meshes`, a mesh names its materials and its skin by index, a skin's joints are node
// indices, an animation channel binds to a node index, and a camera/light optionally rides a node by index.
// Index refs keep instancing free — many nodes can share one mesh by pointing at the same `meshes` slot, and
// the assembler shares that geometry by reference.
//
// Geometry is INLINE (`Scene3DDocumentMesh.geometry` is a live `MeshGeometry`), not de-referenced through a
// binary buffer/accessor table. glTF's accessors are resolved into inline geometry at parse time; a
// buffer/accessor layer would force the buffer-less formats (OBJ, AWD, MD5) to encode-then-decode for no gain.
// That binary layer is deliberately deferred to a future ON-DISK native serialization format, not the
// in-memory document. Read geometry through the document accessors so a lazy backing can be added later
// without breaking callers.
export interface Scene3DDocument {
  animations: Scene3DDocumentAnimation[];
  cameras: Scene3DDocumentCamera[];
  lights: Scene3DDocumentLight[];
  materials: MaterialLike[];
  meshes: Scene3DDocumentMesh[];
  metadata: Scene3DMetadata | null;
  nodes: Scene3DDocumentNode[];
  // The image references materials' textures point at, resolved by an explicit
  // `loadScene3DResources` or `updateScene3DResourceStreaming` pass — never eagerly during parse.
  resources: ImageResourceReference[];
  scenes: Scene3DDocumentScene[];
  skins: Scene3DDocumentSkin[];
}

// One entry in a document's animation table. A Scene3DDocument animation carries its channels' node-target
// bindings explicitly (`Scene3DDocumentAnimationChannel`) because the animation core's `AnimationClip` is
// target-free — the document must record which node index and which transform/weights sink each channel
// drives so the assembler can rebuild a live, node-bound clip.
export interface Scene3DDocumentAnimation {
  channels: Scene3DDocumentAnimationChannel[];
  duration: number;
  name?: string;
}

// One channel of a document animation: a sampled track plus the node index and animation path (Translation /
// Rotation / Scale / Weights) it drives. The assembler resolves `node` against the built node array and binds
// the track to that node's transform component (or the mesh's morph weights) as a `Scene3DAnimationTarget`.
export interface Scene3DDocumentAnimationChannel {
  node: number;
  path: Scene3DAnimationPath;
  track: AnimationTrack;
}

// One standalone, placed camera. A camera is NOT a scene node — it is a pure entity carrying its own
// `transform` (world placement) and `projection` descriptor. `node` optionally binds the camera to a node
// index for the "rides an animated node" case; the assembler drives the camera's view from that node's world
// matrix (e.g. `setCamera3DViewMatrix4FromMatrix4`) rather than parenting it into the graph.
export interface Scene3DDocumentCamera {
  far: number;
  name?: string;
  near: number;
  node?: number;
  projection: Projection;
  transform: Transform3D;
}

// One standalone, placed light. Like a camera, a light is not a scene node: it carries a `descriptor` (an
// ambient/directional/point/spot/etc. `Light`) plus a `transform`, and an optional `node` index for the
// animated-placement case.
//
// PLACEMENT CONVENTION (glTF `KHR_lights_punctual`, adopted SDK-wide so every importer agrees): the
// descriptor holds the light in its OWN LOCAL SPACE and `transform` places and orients it. A directional
// or spot light therefore aims down the canonical local -Z axis, and its real-world aim is the transform's
// rotation applied to that axis; a point light sits at the local origin and is placed by the transform's
// translation. A format that states a world-space aim (AWD does) converts it INTO the transform at import,
// rather than writing it onto the descriptor.
//
// This is the one place the document stage differs from the draw stage. `DirectionalLight.direction` is a
// WORLD-space vector everywhere a renderer consumes it — `Scene3DLights` and `packScene3DLightBlock` take
// lights already resolved. A document light is pre-composition, so a consumer building a draw argument out
// of this table composes `transform` into the descriptor first (rotate the local axis by
// `transform.rotation`; offset the local position by `transform.position`).
export interface Scene3DDocumentLight {
  descriptor: Light;
  name?: string;
  node?: number;
  transform: Transform3D;
}

// One entry in a document's mesh table. Geometry is inline (see the file header). `materials` are indices
// into `Scene3DDocument.materials`, one per geometry subset (positional, matching `Mesh.materials`); `skin` is
// an index into `Scene3DDocument.skins` (absent for a rigid mesh); `morph` is inline blend-shape data. Many
// nodes may reference one mesh entry — the assembler shares its geometry by reference (instancing).
export interface Scene3DDocumentMesh {
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
export interface Scene3DDocumentNode {
  children: number[];
  kind: Kind;
  mesh?: number;
  name?: string;
  transform: Transform3D;
}

// One entry in a document's scene table: a named set of root node indices. A document may carry several
// scenes (glTF's multi-scene model); the assembler builds the requested scene (default = the first).
export interface Scene3DDocumentScene {
  name?: string;
  rootNodes: number[];
}

// One entry in a document's skin table: the node indices that are the skin's joints, plus the flat
// inverse-bind matrix array (one `Matrix4` per joint, index-aligned with `joints`). The assembler resolves
// the joint indices against the built node array to construct a live `Skin`/`Skeleton3D`.
export interface Scene3DDocumentSkin {
  inverseBind: Matrix4Like[];
  joints: number[];
}
