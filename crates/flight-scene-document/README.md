# flight-scene-document

Flight scene documents (TS `@flighthq/scene-document`): the closed YAML subset and its text codec,
logical validation with scene-qualified refusals, the document's resource dependencies, and 2D/3D
scene materialization with inert interactive-state and layout bindings. No loading, rendering or
host work lives here; resource resolution, node construction and field writing are caller-supplied
schema and resolver callbacks.

## Identity model

- Live nodes are the original `NodeRef` handles the node schemas return; nothing is copied or
  rebuilt. Bindings retain those handles.
- A 2D authored root replaces the Scene2D default root through `as_node2d_ref`, which recovers the
  node's own published family handle (Principal 68e645eb C1). The new root is attached to its scene
  runtime and the previous root detached; a registered kind of the other dimension is refused
  structurally (`RootKindMismatch`).
- The source's object-identity maps and sets key live nodes by entity uid and authored document
  nodes by the borrowed record's address (D15 object-keyed maps). Layout bindings share the authored
  tree as an `Arc<FlightDocumentLayoutTree>`; the writer emits a fresh copy.
- Every light is read as a `FlightDocumentLightDescriptor` that keeps its kind and all of its
  fields (Principal 68e645eb C2). The formatter writes the built-in lighting kinds through their
  source field names; materialization decodes the recognized built-in kinds into canonical lighting
  entities from the lighting defaults, leaves the raw descriptor intact, and passes custom kinds
  through as the descriptor handle.
- A 3D authored root replaces the Scene3D default root through `as_node3d_ref` (its own published
  `Node3DRef`), refused structurally like the 2D half.

## Caller-owned state (D5, D25)

The 3D materializers take the camera guard state (`&CameraGuardStateRef`) that setting a camera
view consults, in place of the source's module state. Camera placement brackets its two working matrices with the
canonical geometry pool (`acquire_matrix4`/`release_matrix4`) exactly as the source does.

## Precision (D1)

Per-item `f64`, each with an `allow(f64)` reason:

- `FlightDocumentValue::Number`, `FlightDocumentScalar::Number` and the YAML subset's
  `SceneDocumentYamlSubsetValue::Number`: document values are JavaScript Numbers. The source's own
  fixtures round-trip `439812095` and `4294967295` exactly through text, which f32 cannot hold, and
  the scalar grammar refuses integers outside `Number.isSafeInteger`.
- `FlightDocumentInteractiveState` properties, `FlightDocument.version`,
  `FlightDocumentScene2D.background_color` (the raw authored number; the canonical `Scene2D.color`
  is its JS ToUint32 projection, Principal 68e645eb C3) and
  `FlightDocumentRefusalExplanation.version`: authored document numbers.
- Indices and counters (`default_scene`, scene indices, refusal `actual`/`limit`, layout
  `parent_index`) are `i64` projections of JavaScript safe integers; positions
  (`line`/`column`/`offset`) are UTF-16 code-unit `usize` values (D15 text positions).

Canonical engine records keep their own types: cameras, projections, transforms and lights stay
f32. The formatter writes an f32 field from its shortest round-trip f32 decimal (`0.4f32` is `0.4`),
laid out by the JavaScript Number formatter; reading narrows the document number with `as f32`.
Document numbers are formatted by the canonical `unknown_to_js_string` (JS `Number.prototype.toString`).

## Drift and non-representables

- Nested mapping keys sort by UTF-16 code unit, which is canonical (Principal d1eaec43); the
  source's host-collation `localeCompare` changes to code units. Top-level field keys use the
  source's own `Object.keys(…).sort()` code-unit order.
- A lone surrogate written as a `\u` escape has no UTF-8 form and decodes to U+FFFD at the native
  boundary (Principal d1eaec43); counts and positions still use the source's code units.
- Typed records cannot hold the shapes some source tests cast in (extra keys on a typed
  interactive state, a `null` layout descriptor). Where the same authored shape is representable as
  raw text, the test exercises the raw path instead and records the source assertion it replaces.
