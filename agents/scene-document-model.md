# Scene Document Model

_2026-08-27. Architecture record — the human-and-machine-readable scene description format for Flight. Covers the shipped text (YAML) encoding and document schema. Binary sidecar and packed encodings are future design sketches, not part of the current package scope._

**Status: ratified for the v1 logical model, constrained YAML text codec, and per-scene 2D/3D
materialization surfaces.** Binary sidecar and packed encodings remain unratified future work gated on
the planned `serialize` package. Read this before working on `scene-document`, `serialize`, or any scene
persistence feature.

## What it is

`scene-document` owns Flight's native scene description format. It defines the logical schema for a
multi-scene container, its resources, and its metadata. It currently provides one physical encoding:

1. **Text** (`.flight`) — constrained YAML. Human-readable, diffable, and mergeable. This is the
   shipped authoring and interchange encoding.

A text-plus-binary sidecar (`.flight` + `.flight.bin`) and a packed binary container (`.flightb`) are
possible future encodings over the same logical model. They are not ratified, implemented, or included
in the current `scene-document` contract. No present round-trip claim includes either binary form.

## Why a new package

The format is Flight-native, round-trips (read and write), and spans both Scene2D and Scene3D. None of the existing `*-formats` packages fit:

- `scene2d-formats` houses one-directional importers for external formats (SVG, Lottie, Rive). It is 2D-only and import-only.
- `scene3d-formats` houses one-directional importers for external 3D formats (glTF, OBJ, USD, AWD2). It is 3D-only and import-only.
- A future `serialize` package may provide a general-purpose binary codec (varint/float32, schema-driven). It does not exist today, and `scene-document` does not implement a private substitute. The package currently owns only the scene-specific schema and YAML text codec.

The shipped package uses Flight's scene graph/types packages and its own constrained YAML subset reader.
It does not depend on a renderer, host, Application, third-party YAML package, or the not-yet-built
`serialize` package.

## Future relationship to `serialize` (out of scope)

The [server-side architecture](server-side-architecture.md) identifies a planned `serialize` package as the single binary codec shared by `ipc`, `socket`, `snapshot`, and scene persistence. If binary scene encodings are separately ratified in a future arc, `scene-document` would consume `serialize`, not replace it:

- `serialize` owns the byte-level codec: varint encoding, float32/float64 policy, schema-driven field layout, buffer management.
- `scene-document` owns the scene-specific schema: which fields a Sprite carries, how a resource table is structured, what a node tree looks like. A future binary codec could encode/decode that schema to/from bytes.

The shipped YAML text encoding does not use `serialize` at all — it is a direct constrained-YAML read/write over the document model. Until `serialize` exists and a binary design is ratified, there is no sidecar or packed-binary API to document as current behavior.

## Document model

A Flight document is a **multi-scene container**, following the glTF precedent: a top-level `scenes` array holds one or more scene trees, each with its own kind (Scene2D or Scene3D). Resources are shared across all scenes. A `defaultScene` index names the initial scene.

This means a single `.flight` file can describe a 3D world and its 2D HUD overlay, a 2D game with an embedded 3D viewport, or a set of related scenes an editor works with as a project. Each scene materializes independently through its own pipeline (`prepareScene2DRender` / `prepareScene3DRender`); the document groups them, the application composes them.

The ratified logical shape is:

```typescript
interface FlightDocument {
  defaultScene: number;
  resources: FlightDocumentResourceDescriptor[];
  scenes: [FlightDocumentScene, ...FlightDocumentScene[]];
  version: 1;
}

type FlightDocumentScene = FlightDocumentScene2D | FlightDocumentScene3D;
```

The non-empty tuple states the logical invariant. Text parsing still validates an empty input before it
can become this type. `defaultScene` must be an in-range integer and is never clamped.

### Metadata

```yaml
flight: 1                       # document format version
defaultScene: 0                 # index into scenes array
```

### Resources

Resources are declared once on the container and referenced by key throughout every scene tree. A
resource key is a plain string — the document's local name for that asset.

```yaml
resources:
  - kind: Texture
    key: hero
    source: hero.png
  - kind: Mesh
    key: terrain
    source: models/terrain.glb
    mesh: TerrainMesh
```

Each descriptor is `{ kind, key, fields }` in the logical model; YAML flattens `fields` beside `kind`
and `key`. Resource kinds remain open through the schema and resolver registries.

Resource references in the tree use the key directly:

```yaml
- kind: Sprite
  texture: hero           # resolves to the resource keyed "hero"
```

### Scenes

The `scenes` array holds one or more scene entries. Each entry has a dimension `kind` (`Scene2D` or
`Scene3D`) and a nested `scene` node tree. A 2D entry also carries `backgroundColor`; a 3D entry carries
its `cameras` and `lights`. 2D and 3D entries can coexist in the same document.

```yaml
scenes:
  - kind: Scene2D
    scene:
      kind: DisplayObject
      children:
        - kind: Sprite
          name: health-bar
          texture: hero

  - kind: Scene3D
    scene:
      kind: Node3D
      children:
        - kind: Mesh
          name: terrain
          mesh: terrain
```

### Scene tree — 2D

Every node has a `kind` field matching Flight's `*Kind` string. Transform and appearance properties are flat on the node, matching the trait interfaces directly. Kind-specific data fields are also flat (the document flattens `node.data.*` onto the node for readability — no nested `data:` wrapper).

```yaml
scenes:
  - kind: Scene2D
    backgroundColor: 287454207
    scene:
      kind: DisplayObject
      children:
        - kind: Sprite
          name: hero
          texture: hero
          x: 200
          y: 150
          scaleX: 2
          scaleY: 2
```

#### Default elision

Properties at their default value are omitted. The defaults match the runtime:

| Property | Default |
|----------|---------|
| `x`, `y` | `0` |
| `scaleX`, `scaleY` | `1` |
| `rotation` | `0` |
| `skewX`, `skewY` | `0` |
| `pivotX`, `pivotY` | `0` |
| `alpha` | `1` |
| `visible` | `true` |
| `blendMode` | `null` (omitted) |

A node with no explicit transform renders at the origin, full scale, no rotation. This keeps authored documents concise — a Sprite that only needs `texture` and `name` is two lines.

#### Angles

`rotation`, `skewX`, and `skewY` are **degrees** in the document, matching the authoring-layer convention (`Transform2D.rotation` is degrees). The document is an authoring artifact.

#### Colors

All colors are packed sRGB RGBA integers (`0xRRGGBBAA`), matching the SDK-wide convention. No CSS color strings, no separate alpha.

### Shape commands

Shape commands are expressed as a list of named operations. Each entry is a single-key map whose key is the `ShapeCommandRegistry` key verbatim, and whose value is an object with named fields matching the registry's argument tuple.

```yaml
- kind: Shape
  name: button-bg
  commands:
    - beginFill: { color: 0x3366ccff, alpha: 1 }
    - drawRoundRectangle: { x: 0, y: 0, width: 120, height: 40, ellipseWidth: 8, ellipseHeight: 8 }
    - endFill: {}
    - lineStyle: { thickness: 1, color: 0x000000ff, alpha: 0.5 }
    - drawRoundRectangle: { x: 0, y: 0, width: 120, height: 40, ellipseWidth: 8, ellipseHeight: 8 }
```

Curve commands:

```yaml
    - moveTo: { x: 0, y: 0 }
    - curveTo: { controlX: 50, controlY: -30, x: 100, y: 0 }
    - cubicCurveTo:
        control1X: 10
        control1Y: 20
        control2X: 90
        control2Y: 80
        x: 100
        y: 100
```

Gradient fills:

```yaml
    - beginGradientFill:
        gradientType: linear
        colors: [0xff0000ff, 0x0000ffff]
        alphas: [1, 1]
        ratios: [0, 255]
        spreadMethod: pad
        interpolationMethod: rgb
        focalPointRatio: 0
```

Convenience shapes (`drawCircle`, `drawEllipse`, `drawRectangle`, `drawRoundRectangle`) use their existing named parameters.

#### Dense path data

The shipped text codec represents path data inside the constrained YAML value model. A `buffer`
reference into `.flight.bin` is not a current document feature: no sidecar loader, writer, key space, or
ownership contract ships. Dense typed-array storage may be designed with a future binary encoding, but
that work is out of scope for the text-only package and cannot be inferred from the sketches below.

### Scene tree — 3D

3D scenes use `Transform3D` properties on nodes. Position and scale are `Vector3` (inline objects); rotation is a `Quaternion` (also inline). Cameras and lights are **top-level sections on the scene entry**, not children in the node tree — cameras are entities owned by the `camera` package (not graph nodes), and lights extend `Light` (not `Node3D`).

```yaml
scenes:
  - kind: Scene3D
    scene:
      kind: Node3D
      children:
        - kind: Mesh
          name: ground
          mesh: terrain
```

#### 3D defaults

| Property | Default |
|----------|---------|
| `position` | `{ x: 0, y: 0, z: 0 }` |
| `rotation` | `{ x: 0, y: 0, z: 0, w: 1 }` (identity) |
| `scale` | `{ x: 1, y: 1, z: 1 }` |
| `alpha` | `1` |
| `visible` | `true` |

### Node kinds coverage

The document format covers every scene graph `*Kind` in the SDK. The kind string in the document is the same string as the runtime constant. Vendor-prefixed kinds (`'acme.Foo'`) are valid — the document reader uses the kind registry and does not hard-code a closed set.

**2D node kinds**: `DisplayObject`, `Sprite`, `Shape`, `MorphShape`, `Scale9Shape`, `NativeText`, `TextLabel`, `RichText`, `BitmapText`, `HtmlView`, `QuadBatch`, `Tilemap`, `MovieClip`, `ParticleEmitter2D`, `ClippingAttachment2D`, `MeshAttachment2D`.

**3D node kinds**: `Node3D`, `Mesh`, `LodMesh`, `InstancedMesh`, `Billboard`, `ParticleEmitter3D`.

**3D top-level sections** (not node kinds): cameras (`Camera3D`) and lights (`DirectionalLight`, `PointLight`, `SpotLight`). These are entities/descriptors, not graph nodes — the document places them alongside the node tree, not inside it.

The authoritative population is derived by a test from the kind registry, not maintained as a roster. Kind-specific data fields are schema-driven: the document reader/writer uses the `FlightDocumentSchemaRegistry` to know which fields each kind carries.

### Tilemap data

Tilemap tile grids are a dense-data case. The shipped text format can express them inline when their
schema is registered and the values fit the bounded YAML subset. A binary buffer reference for large
maps is future work and is not accepted as a current sidecar contract.

```yaml
# Inline (small map)
- kind: Tilemap
  name: room
  columns: 8
  rows: 6
  tileWidth: 16
  tileHeight: 16
  atlas: tileset
  tiles: [1,1,1,1,1,1,1,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1,
          1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1,1,1,1,1,1,1,1]

```

### QuadBatch data

QuadBatch transforms and IDs use typed arrays at runtime. The current text-only contract does not
define a binary buffer reference for them. A future binary encoding must specify their representation
and round-trip behavior before the format can claim this dense-data case.

### Mesh geometry

3D mesh vertex/index buffers likewise have no current sidecar or packed representation in this
package. Documents may refer to external mesh resources through the resource model; embedding geometry
bytes is future binary-format work.

## Future binary encodings (out of scope)

Earlier drafts sketched a `.flight.bin` table-of-contents sidecar and a packed `.flightb` container.
Those sketches are not file-format specifications: `serialize` does not exist, alignment and element
types were unresolved, and no reader, writer, or public type ships. They remain possible future work
only. Ratifying either encoding requires its own design and executable round-trip evidence; the
text-only `scene-document` contract must not imply that either is currently supported.

## API surface

The package exports functions following Flight's naming conventions. The function names include the full type name (`FlightDocument`) for global self-identification.

### Reading

A document materializes per scene. Omitting `sceneIndex` selects `document.defaultScene`; passing an
index selects that entry explicitly. Both paths validate the container before checking the requested
dimension and registered node kinds.

```typescript
// Parse, explain, and format the constrained YAML text representation
parseFlightDocumentText(text: FlightDocumentText): FlightDocument | null
explainFlightDocumentText(text: FlightDocumentText): FlightDocumentRefusalExplanation | null
formatFlightDocumentText(document: Readonly<FlightDocument>): FlightDocumentText

// Materialize the default or an explicitly indexed scene from the parsed container
createFlightDocumentScene2DMaterialization(document, schemas, resolvers?, sceneIndex?):
  FlightDocumentScene2DMaterialization | null
createFlightDocumentScene3DMaterialization(document, schemas, resolvers?, sceneIndex?):
  FlightDocumentScene3DMaterialization | null

// Parse + materialize conveniences use the same selection rule
createFlightDocumentScene2DMaterializationFromText(text, schemas, resolvers?, sceneIndex?):
  FlightDocumentScene2DMaterialization | null
createFlightDocumentScene3DMaterializationFromText(text, schemas, resolvers?, sceneIndex?):
  FlightDocumentScene3DMaterialization | null

// Materialization explanations retain document and scene context
explainFlightDocumentRefusal(document, dimension, schemas, sceneIndex?):
  FlightDocumentRefusalExplanation | null
explainFlightDocumentRefusalFromText(text, dimension, schemas, sceneIndex?):
  FlightDocumentRefusalExplanation | null
explainFlightDocumentScene3DRefusal(document, schemas, sceneIndex?):
  FlightDocumentRefusalExplanation | null
explainFlightDocumentScene3DRefusalFromText(text, schemas, sceneIndex?):
  FlightDocumentRefusalExplanation | null
```

An empty `scenes` collection produces `ScenesEmpty`; an invalid `defaultScene` produces
`DefaultSceneOutOfRange`. Refusals inside an entry use `scenes[index]`-qualified paths, including
dimension mismatch, unregistered node kinds, and duplicate 3D lights.

### Writing

```typescript
// Write one logical scene entry; callers assemble entries into a FlightDocument container
createFlightDocumentFromScene2D(source, schemas): FlightDocumentScene2D
createFlightDocumentFromScene3D(source, cameras, lights, schemas): FlightDocumentScene3D
```

The materialization outputs are `FlightDocumentScene2DMaterialization { scene }` and
`FlightDocumentScene3DMaterialization { cameras, lights, scene }`. Application composition remains
external: a document groups entries but does not imply that they render together.

### Multi-scene documents

`FlightDocument` is the container. `FlightDocumentScene` is the union of
`FlightDocumentScene2D | FlightDocumentScene3D`, so mixed dimensions can coexist in one `scenes`
tuple. The caller materializes the default entry, an explicitly indexed entry, or iterates the tuple;
the application decides how independently materialized scenes are composed.

There is no `parseFlightDocumentBinary`, sidecar writer, or packed-binary formatter in the shipped API.
Those names and formats require a separately ratified binary arc.

### Resource resolution

Resource resolution uses a `FlightDocumentResourceResolverRegistry` — an open registry of resolvers
keyed by resource kind. Resources are declared once on the container, but runtime identity across
separate materializations is controlled by the caller's resolver: it may return one shared object or
distinct objects. The package does not cache across calls. This keeps `scene-document` decoupled from
`loader`/`assets` and follows the open-registry pattern.

## Scope boundaries

**In scope**: the document model, the constrained YAML text encoding, text round-trip fidelity for
representable registered fields, resource declarations, metadata, and per-scene materialization.

**Out of scope** (separate packages or future extensions):
- Binary sidecars and packed `.flightb` files — `serialize` does not exist, and neither encoding has a
  ratified format or shipped API.
- Animation/timeline data — `timeline`, `tween`, and `movieclip` have their own temporal models. The document captures the scene at rest; animation bindings are a layer above.
- Application state — `flow`, `statechart`, `snapshot` state is not scene structure.
- Renderer configuration — backend selection, render state, shader programs. The document describes what to draw, not how to draw it.
- Live resource loading — the document names resources; `loader`/`assets` fetches them. `scene-document` provides the schema, not the I/O.
- Network synchronization — future `serialize` + `sync` work may handle delta encoding and wire transport. `scene-document` is a persistence format, not a frame-by-frame protocol.

## YAML subset

The format uses a constrained YAML subset for predictability:

- Plain scalars (strings, numbers, booleans, null).
- Block sequences (children, command lists).
- Block and flow mappings (node properties, inline vectors).
- No anchors/aliases (`&`/`*`).
- No tags (`!!`).
- No multi-document streams (`---`/`...` separators).

This subset parses unambiguously and avoids YAML's implicit typing surprises (e.g. `no` becoming `false`). Strings that could be misinterpreted are always quoted.

## Rulings

The following questions were raised in the original record and ruled by the manager or user:

1. **Skeleton/bone data** — skeletons are external resources, loaded from their native formats (Spine/DragonBones/glTF). The document references them as resources, same as meshes.
2. **Effect/adjustment descriptors** — out of scope. The effect recipe model is unratified; the document does not build on it.
3. **Custom kind extensibility** — pre-registered open registry with a sentinel and `explain*` query. No inline schema in the document.
4. **YAML library** — Flight writes its own YAML subset reader. No third-party parser in the SDK. The constrained subset is small enough to parse directly. Out-of-subset input is a named refusal, not best-effort. Scalar rules are chosen and tested explicitly.
5. **Version migration** — no forward-compatible readers. Pre-release; the format version is `1` and there are no consumers to migrate.
6. **Multi-scene documents** — a document is a multi-scene container (glTF precedent). The `scenes` array holds one or more scene trees (2D, 3D, or mixed). Resources are shared. `defaultScene` names the initial scene. User-ruled 2026-08-28.
7. **Cameras and lights** — top-level sections on 3D scene entries, not children in the node tree. Cameras are entities (not graph nodes); lights extend Light (not Node3D).
8. **Input bounds** — enforced from the first commit, since the parser handles untrusted input.

---

# Manager rulings — PRESERVED VERBATIM after a records collision, 2026-08-28

★ **Why this section exists.** A records rewrite built from a base that predated these rulings landed and
dropped every ruling section below. The code still implements them and tests pin several, but the
*reasoning* was lost while the conclusions survived — and the reasoning is the part that stops a future
agent re-deriving a decision that was already withdrawn.

**Current-state note:** the record is now ratified. References below to the whole record being
“unratified,” decisions being “owed,” or defects that “must be fixed before code” describe historical
review state and are superseded by the ratified model and API sections above plus the later rulings in
this preserved chronology.

Reproduced **verbatim** rather than re-summarised, because summarising a ruling is exactly how this was
lost the first time. Where a ruling is already pinned by a test, the test is the enforcement and this is
the explanation. Where anything here conflicts with the sections above, the *conclusions* above are
current wherever the user has since ruled; this is what those conclusions were built on.

## Manager rulings — 2026-08-27

Four of the five open questions are answerable from standing project policy and are ruled here. The
fifth needs the user. Rulings are recorded so a builder does not re-litigate them; the record stays
**unratified** as a whole until the user rules on the two items in "Owed by the user" below.

**Q1 skeletons — RULED: external resource, not inline.** `Skeleton2D`/`Skeleton3D` rest poses are
referenced by resource key exactly as meshes are. Bone hierarchies belong to `skeleton2d-formats` /
`skeleton3d`, which already own them; duplicating a rest pose into this schema creates a second source
of truth for the same data. Revisit only when someone has a scene that cannot be expressed by reference.

**Q2 effect/adjustment descriptors — RULED: out of scope for v1.** `agents/effect-recipe-model.md` is
**unratified**. Policy is that an unratified record may be read but not built on. Inline effect chains
would freeze a descriptor shape that is still being decided. Moved from an open question into the
Scope boundaries section, where it is a stated exclusion rather than an unanswered one.

**Q3 custom kind extensibility — RULED: pre-registration, no inline schema.** AGENTS.md requires an
open registry over a closed union for descriptor and handler families, so the reader resolves a field
schema by `kind` from a registry a caller populates, mirroring `registerRenderer`. Unused kinds then
tree-shake out. An inline per-document schema is rejected on the design posture: it makes the document
carry parsing instructions, which is data-driven hidden behavior. An unregistered kind returns a
sentinel (`null`), never a throw, with a shakeable `explain*` query naming the missing registration —
per the diagnostics inversion rule.

**Q5 version migration — RULED: no forward-compatible readers.** Flight is pre-release with no published
consumers and no backwards-compatibility obligations. A reader accepts exactly the version it knows and
refuses any other with a named, machine-readable reason. Do not build a migration layer for a format
that has never shipped.

**Q4 YAML library — NOT MINE TO RULE. See "Owed by the user".**

## Manager rulings, round 2 — 2026-08-27 (resource, shape-schema, registry backing, D2)

**R1. Normalized logical resources `{key, kind, fields}` — APPROVED.** The document model holds
resources normalized and kind-tagged; grouped YAML sections and bare-string shorthands are **codec
forms**, living in the text codec and never in the model. This is the same model-versus-encoding split
the whole record rests on, and it is what makes D4's open resolver registry expressible: a closed set of
four `resolve*` methods cannot describe a resource family a custom node introduces, but a kind-tagged
record can.

**R2. A runtime shape-command schema registry — APPROVED, with one condition.**
Verified: `ShapeCommandRegistry` is a type-level interface of labeled tuples, and TypeScript tuple
labels are erased at runtime, so there is genuinely no runtime source of argument names or types.

But sharpen the rationale before building on it. `packages/shape-formats/src/shapeJson.ts` does carry a
private per-command table — it records **arity and runtime types** (`required`, `types: ['number', …]`)
and is **positional, with no argument names**. So this is not purely deduplication: argument *names*
are new information that no existing runtime table holds. Both halves matter, because they set the
condition:

★ **End with ONE table, not two.** Migrate `shapeJson.ts` onto the new registry within the same arc, or
we will have converted one private duplicate into two tables that drift — and the one that drifts is
whichever a later change forgets. If the migration is genuinely out of scope, it is a filed ticket with
an owner, never an unspoken gap.

**R3. `@flighthq/registry`'s `KeyedTable` as the backing for the node, resource, and shape-schema
registries and for resource resolvers — APPROVED.** Verified `createKeyedTable` is exported on the
package's public lane. Keep two things apart that the question ran together:

- **Using a public, implemented API is fine**, and being its first production consumer is a reason for
  care, not a reason to invent a parallel `Map` vocabulary alongside it. Q3 already commissioned
  caller-owned pre-registration; this is the vocabulary that exists for it.
- **Adopting the unratified ownership doctrine is not fine.** `registry-table-model.md` is unratified —
  use the data structure, do not import its claims about which tier owns a registry. If the shape of
  `KeyedTable` turns out to force an ownership decision, that is an escalation, not an implication.

**R4. D2 — RULED: the scene family is stated in metadata ONLY, and the tree root is an ordinary node.**
This is settled by fact, not preference. Verified: **no `Scene2DKind` or `Scene3DKind` exists in the
repo**, and `Scene2D extends Entity` — a scene is a root-owning entity, not a graph node. So
`scene.kind: Scene2D` names a kind constant that does not exist, and builder3's `scene.kind`-only
proposal is unbuildable rather than merely less preferred. Foreman's metadata-kind-only recommendation
stands.

The tree root is a node with a real `*Kind` of its own (`DisplayObject`, `Node3D`). That resolves D2's
actual complaint as a side effect: with the family named once in metadata and the root carrying its own
node kind, there is exactly one statement of each fact and nothing left to disagree.

## Manager rulings, round 3 — 2026-08-27: D1 and D2 CLOSED

**D1 — RULED: cameras are top-level document sections, never tree nodes.** Foreman's recommendation is
approved, and it is approved on verified precedent rather than on taste — placing cameras outside the
tree is not a `scene-document` invention, it is consistency with how the SDK already models them:

- `Scene3DDocument` declares `cameras: Scene3DDocumentCamera[]` as a **top-level sibling** of `nodes`
  and `scenes`. The existing 3D document model already keeps cameras out of the node tree.
- `prepareScene3DRender(state, scene, camera, lights)` takes the camera as a **separate parameter**
  from the scene, not as something discovered by walking it.

So: drop `Camera3D` from node-kind coverage entirely. For v1, an optional single 2D camera and a
named/keyed 3D camera map, with **no `resolveCamera` resource seam** — a camera is document data, not
an external resource to resolve. ★ Nobody invents a `Camera3DKind`; the absence was the signal.

**Consequence that must not be discovered later:** materialization now returns a scene *and* camera
data, so a reader can no longer return a bare `Scene2D`/`Scene3D`. That changes the entry-point
signatures, which puts it directly against D5 (`FlightDocument` naming two things) and D6 (the
`Scene2D | Scene3D` union breaking symmetry). Settle the return shape once, for both dimensions
symmetrically, rather than letting 2D and 3D diverge because only one of them grew a camera.

**D2 — RULED, and now CLOSED: the scene dimension lives in metadata only.** `scene.kind` is removed
entirely. This restates R4 with the reader behavior foreman added, which is adopted:

- Split `createScene2D…` / `createScene3D…` readers **validate the metadata kind** and **refuse** a
  mixed or wrong-dimension node tree with a named, machine-readable reason.
- ★ **No silent precedence.** A document whose metadata and tree disagree is refused, never
  reconciled by preferring one side.

This is the same doctrine as the U1 out-of-subset ruling — a reader that quietly repairs malformed
input teaches the next writer to emit it — and the two should be recognisably one rule in the code, not
two ad-hoc refusals.

**On lights — MY ROUND-3 STATEMENT WAS WRONG AND IS WITHDRAWN.** I wrote that lights "genuinely are
nodes" because `DirectionalLight`, `PointLight` and `SpotLight` export `*Kind` constants. That inference
is invalid and foreman's census caught it: **`DirectionalLight extends Light`, not `Node3D`** — the
lights are entities, exactly as cameras are. Compare `Sprite extends Node2D`, a real node.

★ The error is worth keeping because it is the one this record already warns about in D3: I took the
presence of a `*Kind` constant as a proxy for the property "is a graph node" instead of deriving the
property. A kind constant is a registration key; it is not a claim about the hierarchy. Anyone reading
this record should assume the same mistake is latent anywhere a roster was written by eye.

Corrected ruling: **lights are a separate top-level document section, consistent with
`Scene3DDocument.lights` and the separate `lights` parameter of `prepareScene3DRender`** — the same
treatment cameras get, for the same reason. The record's 3D example, which places lights as children of
a node, is wrong and is logged as D10.

## Manager rulings, round 4 — 2026-08-27: the D1 class is broader than cameras

Foreman's runtime census established that the exclusion is not camera-shaped but kind-shaped: the
record's roster mixes real graph nodes with entities, importer data, and constants that construct
nothing. Approved as follows.

**R5. Lights, cameras and attachments all leave the node tree.** Cameras and lights become top-level
document sections (see the corrected light paragraph above). `ClippingAttachment2D` and
`MeshAttachment2D` stay skeleton resource data, which is consistent with the Q1 ruling that skeletons
are referenced, not inlined. `Billboard` is a real `Node3D` and joins node coverage — it was missing
from the record entirely.

**R6. A kind constant with no constructor is not covered.** `LodMesh` and `InstancedMesh` export kind
constants and extend `Node3D`, but nothing constructs them. They are excluded until a constructor
exists. Coverage tracks what can be built, not what has been named.

**R7. FIX THE PREDICATE BEFORE QUOTING THE NUMBER.** Two independent censuses disagree by one, and the
disagreement is not rounding — it is an unstated predicate:

- Foreman: 18 graph nodes (14 2D, 4 3D), via trait plus constructor chokepoints.
- Mine, by direct `extends Node2D`/`extends Node3D` in `types`: 11 2D and 6 3D. The 2D gap reconciles
  exactly — `MorphShape` and `Scale9Shape` extend `Shape`, `RichText` extends `TextLabel`, giving 14.
  The 3D side does not. Removing the two dead kinds leaves `Billboard`, `Mesh`, `ParticleEmitter3D` —
  **three**, not four. `Group` extends `Node3D` and exports `GroupKind`, but has no constructor and no
  package export, which places it in the same excluded class as the dead kinds.

The fourth is probably the generic container counted the way `DisplayObject` is counted in 2D, but
"probably" is not a population. ★ **Do not settle this by argument and do not let the two counts
corroborate each other into a number.** Settle the predicate in writing — does a kind with no
constructor count; does the generic container count as a covered kind or as the tree's root type — and
then let the D3 test derive and print the population. The test is the arbiter; whatever it prints is
the number, and no roster in this record may be quoted against it.

## Manager rulings, round 5 — 2026-08-27: materialization and naming, APPROVED

Foreman's signature proposal is approved substantially as written. It closes D5 and D6 and gives D1's
consequence a symmetric home. Verified the types it names: `Scene3DLights extends Entity` (owned, so the
`…Like` input shape is correctly not used for an output), `Camera3D extends Entity`, `Camera2D` plain
data.

**M1. `FlightDocument` is the nested logical model; the YAML value is `FlightDocumentText`.** That is
D5 closed. Full unabbreviated names throughout — `parseFlightDocumentText`, `formatFlightDocumentText` —
and **never** an abbreviated `FromFlight`.

**M2. Failure is a sentinel plus an `explain*`, and NOT a result union.** Expected malformed, version,
dimension and unregistered-kind failures return `null`; separate `explainFlightDocumentText` /
`explainFlightDocumentScene2D` return one `FlightDocumentRefusalExplanation` carrying the exact reason
with location or context. No `{ ok: true | false }`.

★ This is the right translation of my earlier "named machine-readable refusal" wording into Flight's
actual idiom, and I want the translation noted rather than the wording: sentinel-plus-`explain*` IS the
named refusal here. A result union would have been an error-wrapping type, which this SDK does not use.
One `FlightDocumentRefusalExplanation` shape across every refusal — out-of-subset YAML, wrong version,
wrong dimension, unregistered kind — is the single seam I asked for in round 3, delivered.

**M3. Symmetric owned outputs — approved, and this is what makes D6 go away.**
`FlightDocumentScene2DMaterialization { scene, camera: Camera2D | null }` and
`FlightDocumentScene3DMaterialization { scene, cameras: Readonly<Record<string, Camera3D>>, lights:
Scene3DLights }`. Both dimensions return an owned record; neither returns a bare scene; no union
parameter survives.

**M4. The model keeps nested children.** Do not flatten to child indices before the binary design
exists — flattening is an encoding concern, and doing it in the model would couple the model to an
encoding that is still closed.

**M5. Descriptors are explicit per dimension.** Resources stay `{ key, kind, fields }` per R1; camera
and light descriptors are explicit by dimension rather than one vague polymorphic record.

**M6. One naming inconsistency to pin before code, because names are the deliverable.** The proposal
writes both `createFlightDocumentScene2DFromText` and a rule that text conveniences append `FromText`
to the materialization name, which would give `createFlightDocumentScene2DMaterializationFromText`.
Those are different names for one function. Pick one and apply it mechanically in both dimensions;
whichever is chosen, the 2D and 3D spellings must be derivable from each other without exception.

## Manager rulings, round 6 — 2026-08-27: camera and light descriptor shapes

Builder3 found a real gap: M3 settled the materialization records but never specified the descriptors
inside them. Correctly refused rather than inferred. Ruled here as **derivation rules plus four verified
hazards** — not as a field list. A hand-written field list is what produced D9, and I am not going to
reproduce that defect one level down. Derive the fields from the runtime types, and test the derivation.

**N1. A descriptor is authoring intent, never derived state.** This is why the descriptor must be its
own type and cannot be `Camera3DLike`: `Camera3D` carries `view`, `inverseViewProjection` and `jitter`,
all of them computed by the runtime. A document that authored a view matrix would be authoring an
output. Author position, orientation, projection parameters, and clip distances; compute the rest.

**N2. Renderer tuning is out of scope by this record's own boundary.** The scope section already
excludes "how to draw." `SpotLight.pcfRadius` and `normalBias` are shadow-filter tuning and do not
belong in a document. `castsShadow` is intent and does. Apply that line per field rather than copying a
runtime interface wholesale.

**N3. ★ UNITS CONVERT AT THIS SEAM, AND THE RUNTIME TYPES DO NOT USE AUTHORING UNITS.** Verified, and
every one of these is a silent-corruption hazard:
- `Camera2D.rotation` is **radians** at runtime. The document authors **degrees**.
- `Camera3D`'s perspective `fovY` is **radians**. The document authors **degrees**.
- `SpotLight` stores **`innerConeCos` / `outerConeCos` — cosines, not angles.** The document authors
  **degrees**. `innerConeCos: 0.9659` is not a thing a human writes.

★ **Name the document field differently from the runtime field wherever the unit or representation
differs.** A document `rotation` that means degrees, sitting beside a runtime `rotation` that means
radians, is a defect waiting for the first person who assigns one to the other. No document field is
ever named `innerConeCos`.

**N4. Viewport size is environment, not document.** `Camera2D.viewportWidth` / `viewportHeight` are the
drawable surface in device pixels. A document authored on one screen must not pin another user's
window. Omit them from the descriptor; materialization takes them from the caller.

**N5. The runtime light arity is not what a document would naively allow.** `Scene3DLights` holds
`ambient` and `directional` as **single nullable slots**, with only `hemisphere`, `point` and `spot` as
arrays. A document can trivially express two directional lights; the runtime cannot hold them.
★ Refuse the second with a named reason through the `explain*` seam — **do not let the reader silently
drop it.** Silent truncation of authored content is the worst available outcome: the file says one
thing, the render shows another, and nothing reports the difference.

**N6. Follow the neighbouring representation rather than forcing uniformity.** 3D nodes in this record
author rotation as a quaternion, so a 3D camera does too. Directional and spot lights carry a
`direction` vector at runtime, so they author a direction — do not convert them into quaternions for
symmetry's sake. Match what the thing actually is.

**N7. Test the derivation, do not trust it.** Every descriptor field must have a test tying it to the
runtime field it maps to, including the unit conversion. D9 exists because names were transcribed by
eye from a document; these rulings are only worth anything if the mapping is executable.

## Manager rulings, round 7 — 2026-08-27: THE FORMAT FOLLOWS THE EXISTING DOCUMENT TYPES

**User direction, 2026-08-27, two statements that together govern this section:**
1. *"generally the format follows the field names and types of the kinds they express."*
2. *"the types and behaviors follow the existing `Scene2DDocument`/`Scene3DDocument`; if they express
   cameras, cameras are supported."*

This replaces two earlier drafts of mine that reasoned about cameras from first principles instead of
reading the types. **Both are withdrawn.** The rule is not "decide whether a camera is content or
metadata" — it is "read what the existing document types do, and follow." What follows is what they do,
verified in `packages/types/src/`.

**V1. The document format is not a new vocabulary.** A kind's fields, spellings and types carry into the
document unchanged. The type header **is** the schema, and no parallel document vocabulary is invented
or kept in sync. `Scene2DDocument` and `Scene3DDocument` are the precedent for document *shape*; the
kinds are the precedent for *fields*.

★ **D9 dissolves under this.** The record's shape-command examples were wrong precisely because someone
invented `x`/`y` where the tuple says `anchorX`/`anchorY`. There is now nothing to translate.

**V2. Cameras — 2D has none; 3D has an array. Verified, not reasoned.**
- `Scene2DDocument` is `{ audioResources, backgroundColor, imageResources, root, slots, sourceKind }`.
  **It expresses no camera.** So the 2D document has none, and M3's
  `FlightDocumentScene2DMaterialization { scene, camera }` loses its camera field.
- `Scene3DDocument` expresses `cameras: Scene3DDocumentCamera[]`, where a camera is
  `{ far, near, projection, transform, name?, node? }`.

★ **This corrects R5, which was mine.** R5 approved "an optional single 2D camera and a named/keyed 3D
camera map." Both halves are wrong: 2D gets none, and 3D is an **array with an optional `name`**, not a
keyed map.

**V3. ★ A LIGHT IS NOT A SCENE NODE EITHER — my content-versus-viewpoint distinction is WITHDRAWN.**
`Scene3DDocumentLight` is `{ descriptor: Light, transform, name?, node? }`, and its own comment states:
*"Like a camera, a light is not a scene node."* Cameras and lights are the same shape here — a
descriptor plus a transform, with an optional node index for animated placement. I ruled that lights
stay scene content while cameras are viewpoint metadata. That is not the distinction this codebase
makes, and it does not survive.

**V4. ★ PLACEMENT IS BY TRANSFORM, WHICH WITHDRAWS N6.** There is an SDK-wide convention, adopted from
glTF `KHR_lights_punctual` so every importer agrees: **the descriptor holds the light in its OWN LOCAL
SPACE, and `transform` places and orients it.** A directional or spot light aims down the canonical
local −Z axis; its real-world aim is the transform's rotation applied to that axis. A point light sits
at the local origin and is placed by the transform.

N6 told builders that directional and spot lights should author a `direction` vector "like the runtime."
**Withdrawn.** They author a transform, under the convention above. Authoring a direction here would put
this format alone against every importer in the SDK.

**V5. The metadata concept already exists, and it is `backgroundColor`.** `Scene2DDocument.backgroundColor`
carries the comment: *"document metadata rather than content — a colour the viewport clears to, not a
node in the graph — so an application decides whether to honour it and nothing in `root` depends on
it."* That is the established pattern for optional data a consumer may honour or ignore. Anything of
that character follows this precedent rather than a new framing.

**V6. What survives from round 6.** N1 (author intent, never `view` or `inverseViewProjection` — note
`Scene3DDocumentCamera` carries `projection` and `transform`, not matrices, which confirms it), N2
(renderer tuning stays out), N5 (light arity refusals are named, never silent), and N7 (test the
derivation). **N3's rename-where-units-differ is superseded**: follow the existing types, including
`projection` as the same `Projection` union the runtime uses.

★ **Standing correction to how I ruled here.** Twice in this section I reasoned from principle about
things the repository had already settled in a type. The rule for this record from now on: **read the
existing document type first, and only reason where it is silent.**

## Manager rulings, round 8 — 2026-08-28: MULTI-SCENE CONTAINER. User-ruled; this is a types change.

**User ruling, relayed 2026-08-28:** a Flight document is a **multi-scene container**, on the glTF
precedent. A top-level `scenes` array holds one or more scene trees, each with its own kind (`Scene2D`
or `Scene3D`) and its own node tree. **Resources are shared across all scenes.** A `defaultScene` index
names the initial scene. 2D and 3D scenes may coexist in one file — a 3D world with its 2D HUD, a 2D
game with an embedded 3D viewport, or a set of related scenes an editor treats as a project.

Materialization stays **per-scene**: each entry goes through its dimension-appropriate function and its
own pipeline (`prepareScene2DRender` / `prepareScene3DRender`). **The document groups; the application
composes.** Nothing about a document implies the scenes are drawn together.

Cameras and lights remain top-level sections **on the 3D scene entry**, unchanged from round 7 — cameras
are entities owned by `camera`, lights extend `Light`, and neither is a graph node.

**X1. The shape of the types change.** `FlightDocument` is currently the union
`FlightDocumentScene2D | FlightDocumentScene3D`. That union becomes the **scene entry** type;
`FlightDocument` becomes the container holding `scenes`, `defaultScene`, shared resources and version.
Everything already built keeps its shape — the per-scene materialization records, the refusal seam and
the schema registry are unaffected in structure. What changes is what sits above them.

**X2. ★ REFUSAL PATHS MUST NAME THE SCENE, and this is the consequence most likely to be missed.** The
N5 duplicate-light refusal currently reports `path: 'lights'`. With one scene that is unambiguous; with
several it is useless — a user is told a document has two directional lights and not which scene. Every
refusal path that can occur inside a scene must be qualified by scene index or name. This is the same
defect this record has hit repeatedly: **a value whose scope is narrower than its reader believes.**
Fix it with the types, not afterwards, because every existing refusal test pins the unqualified path.

**X3. `defaultScene` must be validated, never clamped.** An index outside the `scenes` array is a named
refusal through the existing `explain*` seam. Silently falling back to `0` would open a document that
names a scene the author did not choose, and nothing would report it.

**X4. An empty `scenes` array is a named refusal.** A document describing nothing is a malformed
document, not an empty success. Decide it explicitly rather than letting it fall out of a loop that
never runs.

**X5. Shared resources across scenes are a CALLER concern, and must be stated as one.** Resources are
declared once for the whole document, but materialization is per-scene and the resolver is
caller-provided. So whether materializing two scenes that reference one texture yields one texture or
two is decided by the caller's resolver, not by this package. Say that in the package status — a reader
will otherwise assume the document guarantees sharing, and be wrong in the direction that costs memory.

**X6. What does NOT change.** Round 7 still governs field shapes: read the existing document type and
reason only where it is silent. `Scene3DDocumentCamera[]`, `Scene3DDocumentLight` with placement by
transform, no authored `direction` field, and the `keyof` constraints that pin all of it.

### Round 8 closure audit method

Closure is falsifiable, not a list of green command names. Each X2–X5 invariant, diagnostic-taxonomy
claim, text round-trip claim, export claim, documentation claim, and typecheck claim must be paired with
a negative fixture or a temporarily reverted mutation that demonstrates the named gate actually turns
red. A claim whose failure cannot be made detectable is an audit finding, not evidence of completion.

The first run of this method found root, camera, light, and documentation defects even though the named
negative-sensitive gates passed. That result proved Round 8 was not complete at that boundary: green
gates were necessary evidence, but they had not exercised those four defect classes.

## Owed by the user — two blocking decisions

**U1. The YAML parser — RULED BY THE USER, 2026-08-27: Flight writes its own subset reader.** No
third-party YAML parser enters the SDK. The reader implements exactly the constrained subset this
record specifies — plain scalars, block sequences, block and flow mappings, no anchors, no tags, no
multi-document streams — and nothing beyond it.

Consequences that are now binding, not advisory:

- **Out-of-subset input is a named refusal, never a best-effort parse.** An anchor, a tag, or a
  document separator is rejected with a machine-readable reason naming the construct. A reader that
  silently tolerates what the subset excludes turns the subset into a fiction, and the next writer
  will emit it.
- **We control scalar typing, so the implicit-typing hazard is designed out rather than worked
  around.** YAML 1.1's `no`/`off`/`yes` booleans, sexagesimals, and leading-zero octals do not exist
  here unless we choose them. Choose the scalar rules explicitly and test them; do not inherit a
  spec's surprises by accident.
- **The reader is subject to the same bundle-size discipline as every other package**, and being
  ours is not an excuse for it to be large. It is a parser for a closed subset, not a YAML engine.
- **This is a parser for untrusted input.** Depth, length, and collection-size bounds belong in it
  from the first commit, not after someone files a defect.

**U2. Two of the three encodings are blocked on a package that does not exist.** `packages/serialize`
is not in the repo (nor is `sync`). The record correctly states that the YAML text encoding does not
use `serialize` at all, so the text encoding is buildable today and the binary sidecar and packed
`.flightb` are not. *Recommendation:* build the text encoding first, end to end and round-tripping, and
treat the binary encodings as a later arc gated on `serialize`. This is not merely sequencing — the
text encoding is what forces the document model to be right, and the model is what both binary
encodings then encode. Building a private binary codec inside `scene-document` to avoid the wait would
create the coupling `serialize` exists to prevent, and would have to be torn out.

## Defects in this record that must be fixed before the code is written

These are not open questions; they are errors or gaps that would cost a builder real time.

**D1. `Camera3D` is not a node kind, and no camera kind exists in this repo.** The 3D example places
`kind: Camera3D` in the scene tree as a child. Census: of the 25 kinds this record enumerates, 24
resolve to an exported `*Kind` constant; `Camera3D` resolves to nothing, and no `Camera*Kind` is
exported by any package. `camera` owns 3D projection/frustum and the 2D `Camera2D` as camera entities,
not as graph nodes. So the tree cannot carry a camera as written. Resolve deliberately — either cameras
become a document section outside the tree, or a camera node kind is a runtime change with its own
justification. Do not let a builder quietly invent the kind to make the example parse.

**D2. The root scene kind is stated twice and the two can disagree.** Metadata carries `kind: Scene2D`
while the tree carries `scene.kind: Scene2D`. Two sources of truth for one fact, with no stated
precedence. Pick one. If the metadata copy is kept for cheap sniffing without parsing the tree, then a
mismatch must be a named refusal, not a silent preference for either.

**D3. The kind roster is enumerated, not derived.** The record says the format "covers every scene
graph `*Kind` in the SDK" and then lists 25. The repo exports 150 `*Kind` constants — most are not
graph nodes, but the gap is not explained, and an enumerated list reads as complete whether or not it
was derived completely. Derive the covered set from the registry at build/test time and let a test fail
when a graph-node kind exists with no document coverage. Do not hand a builder the list from this
record as if it were the population.

**D4. `FlightDocumentResources` is a method bag and a closed set.** Four `resolve*` methods on an
interface conflicts with two standing rules: prefer free functions over classes for C/C++ portability,
and prefer an open registry over a closed family. It also cannot express a resource kind a custom node
needs. Restate as a kind-keyed resolver registry consistent with Q3's ruling. Separately and
non-negotiably: **every exported type here belongs in `@flighthq/types`**, not inline in
`scene-document`. This record shows them inline, which is the shape of the mistake.

**D5. `FlightDocument` names two different things.** `parseFlightDocument` returns a parsed model, while
`createFlightDocumentFromScene2D` returns a YAML *string*. One name for both the model and its text
serialization will not survive contact with the binary encodings, where the distinction is load-bearing.
Give the text form its own word in the function names and reserve `FlightDocument` for the model.

**D6. `createFlightDocumentWithSidecar(root: Scene2D | Scene3D)` breaks the symmetry every other writer
keeps.** Every other entry point is explicitly `...Scene2D` / `...Scene3D`; this one takes a union, and
has no reading counterpart. Make it symmetric in both directions, or state why the sidecar bundle is
the one case that cannot be.

**D7. Sidecar alignment is underspecified.** TOC entries are variable length (`u16` key length plus a
UTF-8 key), while buffers are said to be "aligned to their element size". The entry format has no
padding field and the record does not say where padding lives or how a reader distinguishes it.
A reader and a writer will disagree here. Specify it exactly, including the empty-TOC case.

**D8. The element-type enum has gaps worth a decision.** `Int8` and `Float16` are absent, and the
tilemap example annotates `tiles` as `Int16Array` where tile ids are conventionally unsigned. Decide the
set deliberately rather than growing it later, since these ids are written into files.

**D9. The shape-command examples use field names that do not match the actual tuple labels.** The record
says each command's value is "an object with named fields matching the registry's argument tuple", and
then does not match them. `curveTo` is shown as `{ controlX, controlY, x, y }` while the real tuple is
`[controlX, controlY, anchorX, anchorY]`; `cubicCurveTo` is shown as
`{ control1X, control1Y, control2X, control2Y, x, y }` while the real tuple is
`[controlX1, controlY1, controlX2, controlY2, anchorX, anchorY]` — every name differs.
★ These names are written into authored documents by users. Getting them wrong is expensive to correct
later and cheap to correct now. Derive the names from the schema registry R2 establishes rather than
transcribing them from this record, and let a test compare the two so the record cannot drift again.

**D10. The 3D example places lights as children of a node.** Given R5 they are a top-level section, so
the example contradicts the model. It is the same defect as D1's camera placement and was hidden by the
same assumption — that anything with a kind constant belongs in the tree.
