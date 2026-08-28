# Scene Document Model

_2026-08-27. Architecture record — the human-and-machine-readable scene description format for Flight. Covers the text (YAML) encoding, the binary sidecar and packed encodings, the document schema, and the relationship to the planned `serialize` package._

**Status: unratified.** Read before working on `scene-document`, `serialize`, or any scene persistence feature.

## What it is

`scene-document` is a new package (`@flighthq/scene-document`) that owns Flight's native scene description format. It defines a document model — the logical schema for describing a scene tree, its resources, and its metadata — and provides three physical encodings over that model:

1. **Text** (`.flight`) — YAML. Human-readable, diffable, mergeable. The authoring and interchange encoding.
2. **Text + binary sidecar** (`.flight` + `.flight.bin`) — YAML structure with dense data (path geometry, mesh vertices, tilemap grids, keyframe arrays) in a companion binary buffer file. The hybrid encoding for scenes with significant geometry.
3. **Packed binary** (`.flightb`) — a single binary container encoding both structure and data. The distribution and runtime encoding.

All three encodings express the same document model. A scene round-trips losslessly across them: `.flight` ↔ `.flightb` is a codec change, not a schema change.

## Why a new package

The format is Flight-native, round-trips (read and write), and spans both Scene2D and Scene3D. None of the existing `*-formats` packages fit:

- `scene2d-formats` houses one-directional importers for external formats (SVG, Lottie, Rive). It is 2D-only and import-only.
- `scene3d-formats` houses one-directional importers for external 3D formats (glTF, OBJ, USD, AWD2). It is 3D-only and import-only.
- The planned `serialize` package is a general-purpose binary codec (varint/float32, schema-driven). `scene-document` uses `serialize` for its binary encodings but owns the scene-specific schema and the YAML text codec.

`scene-document` depends on `serialize` (for binary), the scene graph packages (for type awareness), and a YAML parser (for text). It does not depend on any renderer or host package.

## Relationship to `serialize`

The [server-side architecture](server-side-architecture.md) identifies `serialize` as the single binary codec shared by `ipc`, `socket`, `snapshot`, and scene persistence. `scene-document` is a consumer of `serialize`, not a replacement:

- `serialize` owns the byte-level codec: varint encoding, float32/float64 policy, schema-driven field layout, buffer management.
- `scene-document` owns the scene-specific schema: which fields a Sprite carries, how a resource table is structured, what a node tree looks like. It calls `serialize` to encode/decode that schema to/from bytes.

The YAML text encoding does not use `serialize` at all — it is a direct YAML read/write over the document model.

## Document model

A Flight document is a **multi-scene container**, following the glTF precedent: a top-level `scenes` array holds one or more scene trees, each with its own kind (Scene2D or Scene3D). Resources are shared across all scenes. A `defaultScene` index names the initial scene.

This means a single `.flight` file can describe a 3D world and its 2D HUD overlay, a 2D game with an embedded 3D viewport, or a set of related scenes an editor works with as a project. Each scene materializes independently through its own pipeline (`prepareScene2DRender` / `prepareScene3DRender`); the document groups them, the application composes them.

### Metadata

```yaml
flight: 1                       # document format version
defaultScene: 0                 # index into scenes array
```

### Resources

Resources are declared once and referenced by key throughout the tree. A resource key is a plain string — the document's local name for that asset.

```yaml
resources:
  textures:
    hero: hero.png
    bg: backgrounds/sky.png
    atlas: { source: sprites.png, atlas: sprites.json }

  fonts:
    main: { family: Arial, size: 16 }
    heading: { source: fonts/heading.fnt }

  materials:
    ground:
      kind: PbrMaterial
      baseColor: 0x8b4513ff
      roughness: 0.8
      metallic: 0.0

  meshes:
    terrain:
      source: models/terrain.glb
      mesh: TerrainMesh
```

Texture entries are either a bare path string (shorthand for a single image source) or an object with `source` (the image path) and optional `atlas` (a texture atlas descriptor). Font entries follow the same pattern. Material entries are inline descriptors with a `kind` field matching Flight's material kind system. Mesh entries reference external geometry files.

Resource references in the tree use the key directly:

```yaml
- kind: Sprite
  texture: hero           # resolves to resources.textures.hero
```

### Scenes

The `scenes` array holds one or more scene trees. Each entry has a `kind` (Scene2D or Scene3D), an optional `name`, and its own node tree. 2D and 3D scenes can coexist in the same document.

```yaml
scenes:
  - kind: Scene2D
    name: hud
    children:
      - kind: Sprite
        name: health-bar
        texture: hero

  - kind: Scene3D
    name: world
    cameras:
      - name: main-camera
        projection: perspective
        near: 0.1
        far: 1000
    lights:
      - kind: DirectionalLight
        name: sun
        color: 0xfff5e6ff
        intensity: 1.2
    children:
      - kind: Mesh
        name: terrain
        mesh: terrain
        material: ground
```

### Scene tree — 2D

Every node has a `kind` field matching Flight's `*Kind` string. Transform and appearance properties are flat on the node, matching the trait interfaces directly. Kind-specific data fields are also flat (the document flattens `node.data.*` onto the node for readability — no nested `data:` wrapper).

```yaml
  - kind: Scene2D
    name: main
    children:
      - kind: Sprite
        name: background
        texture: bg

      - kind: DisplayObject
        name: player-group
        x: 200
        y: 150
        rotation: 15
        children:
          - kind: Sprite
            name: hero
            texture: hero
            pivotX: 32
            pivotY: 32
            scaleX: 2
            scaleY: 2
            alpha: 0.9
            blendMode: Normal

          - kind: NativeText
            name: label
            y: -40
            text: "Player 1"
            autoSize: left
            width: 200
            height: 30
            style:
              font: Arial
              size: 14
              color: 0xffffffff
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

#### Dense path data — the binary sidecar case

For complex vector art with hundreds or thousands of path segments, inline YAML commands become unwieldy. The document supports a `buffer` reference that points into the binary sidecar:

```yaml
- kind: Shape
  name: complex-illustration
  commands:
    - beginFill: { color: 0x333333ff, alpha: 1 }
    - drawPath:
        buffer: shapes/illustration     # key into .flight.bin
        winding: evenOdd
    - endFill: {}
```

The binary sidecar stores `Path` data (the `commands: number[]` + `data: number[]` arrays) as packed typed-array buffers, matching the runtime layout. Loading is a typed-array view with zero per-element parsing.

A buffer key is a `/`-separated path within the binary file's table of contents. The text document names the key; the sidecar stores the bytes.

### Scene tree — 3D

3D scenes use `Transform3D` properties on nodes. Position and scale are `Vector3` (inline objects); rotation is a `Quaternion` (also inline). Cameras and lights are **top-level sections on the scene entry**, not children in the node tree — cameras are entities owned by the `camera` package (not graph nodes), and lights extend `Light` (not `Node3D`).

```yaml
  - kind: Scene3D
    name: world
    cameras:
      - name: main-camera
        projection: perspective
        near: 0.1
        far: 1000
        position: { x: 0, y: 5, z: 10 }
        rotation: { x: -0.174, y: 0, z: 0, w: 0.985 }
    lights:
      - kind: DirectionalLight
        name: sun
        color: 0xfff5e6ff
        intensity: 1.2
        direction: { x: -0.5, y: -1, z: -0.3 }
        castsShadow: true
      - kind: PointLight
        name: lamp
        color: 0xffe0b0ff
        intensity: 0.8
        position: { x: 2, y: 3, z: 1 }
        range: 10
    children:
      - kind: Node3D
        name: environment
        children:
          - kind: Mesh
            name: ground
            mesh: terrain
            material: ground

          - kind: Mesh
            name: crate
            mesh: crate
            material: crate-wood
            position: { x: 5, y: 0.5, z: -3 }
            rotation: { x: 0, y: 0.383, z: 0, w: 0.924 }
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

Tilemap tile grids are a dense-data case. Small maps can be inline; large maps use the binary sidecar.

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

# Binary sidecar (large map)
- kind: Tilemap
  name: overworld
  columns: 256
  rows: 256
  tileWidth: 16
  tileHeight: 16
  atlas: overworld-tileset
  tiles:
    buffer: tilemaps/overworld       # Int16Array in .flight.bin
```

### QuadBatch data

QuadBatch transforms and IDs are always binary — they are typed arrays (`Float32Array`, `Uint16Array`) in the runtime and have no useful text representation:

```yaml
- kind: QuadBatch
  name: forest
  atlas: trees
  instanceCount: 200
  transformType: matrix
  transforms:
    buffer: quadbatches/forest-transforms    # Float32Array
  ids:
    buffer: quadbatches/forest-ids           # Uint16Array
```

### Mesh geometry

3D mesh vertex/index buffers are always binary:

```yaml
- kind: Mesh
  name: terrain
  geometry:
    buffer: meshes/terrain           # vertex + index buffers
  material: ground
```

## Binary sidecar format (`.flight.bin`)

The sidecar is a flat buffer with a table of contents. Structure:

```
[TOC length: u32]
[TOC entries...]
[buffer data...]
```

Each TOC entry:

```
[key length: u16] [key: utf8] [offset: u32] [byte length: u32] [element type: u8]
```

Element types: `0` = raw bytes, `1` = Int16, `2` = Uint16, `3` = Float32, `4` = Float64, `5` = Int32, `6` = Uint32, `7` = Uint8.

The key is the `/`-separated path referenced from the YAML document. The offset is relative to the start of the buffer-data region. Buffers are aligned to their element size.

## Packed binary format (`.flightb`)

The packed format encodes both the tree structure and all data in a single binary container. It uses the `serialize` package's schema-driven codec:

```
[magic: "FLTB"] [version: u16] [flags: u16]
[resource table]
[node tree]
[buffer pool]
```

The node tree is a depth-first traversal. Each node:

```
[kind id: varint] [field count: varint] [fields...] [child count: varint] [children...]
```

Fields are schema-driven: the kind determines the field set, and each field is a `[field id: varint] [value]` pair. Numeric values use `serialize`'s varint/float32 policy. String values are length-prefixed UTF-8. Resource references are indices into the resource table.

Dense data (path commands, tile arrays, mesh buffers) are stored in the buffer pool at the end of the file and referenced by offset from field values, matching the sidecar model but self-contained.

## API surface

The package exports functions following Flight's naming conventions. The function names include the full type name (`FlightDocument`) for global self-identification.

### Reading

A document materializes per-scene. The caller parses the document, then materializes individual scenes by index or iterates all of them.

```typescript
// Parse (text or binary) into the logical model
parseFlightDocument(yaml: string): FlightDocument
parseFlightDocumentBinary(data: ArrayBuffer): FlightDocument

// Materialize a single scene from the parsed model
createFlightDocumentScene2DMaterialization(document, schemas, resolvers?): FlightDocumentScene2DMaterialization | null
createFlightDocumentScene3DMaterialization(document, schemas, resolvers?): FlightDocumentScene3DMaterialization | null

// Convenience: parse + materialize in one step (for single-scene documents)
createFlightDocumentScene2DMaterializationFromText(yaml, schemas, resolvers?): FlightDocumentScene2DMaterialization | null
createFlightDocumentScene3DMaterializationFromText(yaml, schemas, resolvers?): FlightDocumentScene3DMaterialization | null

// Refusal explanation (why a document failed to materialize)
explainFlightDocumentRefusal(document): FlightDocumentRefusalExplanation | null
explainFlightDocumentRefusalFromText(yaml): FlightDocumentRefusalExplanation | null
```

### Writing

```typescript
// Serialize a scene into a FlightDocument model
createFlightDocumentFromScene2D(source, schemas): FlightDocumentScene2D
createFlightDocumentFromScene3D(source, schemas): FlightDocumentScene3D

// Emit YAML text from a FlightDocument model
serializeFlightDocument(document): string
```

### Multi-scene documents

A `FlightDocument` is a union of `FlightDocumentScene2D | FlightDocumentScene3D`. A multi-scene document is composed by the caller: parse multiple scene entries from the `scenes` array, materialize each one through its dimension-appropriate function. The document model's `scenes` array and `defaultScene` index handle the grouping; materialization is per-scene.

### Resource resolution

Resource resolution uses a `FlightDocumentResourceResolverRegistry` — an open registry of resolvers keyed by resource kind. The caller registers resolvers for the resource types they support. This keeps `scene-document` decoupled from `loader`/`assets` and follows the open-registry pattern.

## Scope boundaries

**In scope**: the document model, the three encodings, round-trip fidelity for all scene graph node kinds and their data, resource declarations, metadata.

**Out of scope** (separate packages or future extensions):
- Animation/timeline data — `timeline`, `tween`, and `movieclip` have their own temporal models. The document captures the scene at rest; animation bindings are a layer above.
- Application state — `flow`, `statechart`, `snapshot` state is not scene structure.
- Renderer configuration — backend selection, render state, shader programs. The document describes what to draw, not how to draw it.
- Live resource loading — the document names resources; `loader`/`assets` fetches them. `scene-document` provides the schema, not the I/O.
- Network synchronization — `serialize` + `sync` handle delta encoding and wire transport. `scene-document` is a persistence format, not a frame-by-frame protocol.

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
