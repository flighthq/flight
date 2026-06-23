---
id: scene-format
title: '@flighthq/scene-format'
type: new-package
target: scene-format
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/scene-format.md
  - tools/agents/docs/reviews/breadth/missing-domains.md
depends_on: []
updated: 2026-06-23
---

## Summary

Scene serialization — save/load the scene graph to a portable, versioned document, plus the opt-in migration step the string-kind model already promises.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that makes "save a scene, reload it" real for Flight's own scene graph.

**Types (in `@flighthq/types` first):**

- `SceneDocument` — the root document: `{ version: number; format: SceneFormatKind; root: SceneNodeRecord }`. Plain data, JSON-safe.
- `SceneNodeRecord` — the serialized node: `{ kind: Kind; name?: string; data: unknown; children: readonly SceneNodeRecord[] }`. The `kind` string is the reconstruction key.
- `SceneFormatKind` — string kind for the document dialect (`'flight.SceneDocument'`), reserving room for variants.
- `NodeSerializer<T>` / `NodeDeserializer<T>` — the per-kind reconstructor contract: `serializeNodeData(source) → unknown` and `createNodeFromRecord(record) → Node`. Registered per `Kind`, open-family style.
- `SceneSerializeOptions` / `SceneDeserializeOptions` — `{ includeDefaults?: boolean }`, `{ migrate?: boolean }`.
- `SceneSerializeRegistry` — the opaque `Map<Kind, …>` of registered (de)serializers (entity/runtime split: a registry value object, not globals).

**Functions (in `@flighthq/scene-format`):**

- `createSceneSerializeRegistry(): SceneSerializeRegistry` — explicit allocation; no module-top-level global registry.
- `registerNodeSerializer(registry, nodeKind, serializer): void` — last-write-wins, no throw on re-register (matches the kind-registration rule).
- `serializeSceneDocument(registry, root, options?): SceneDocument` — walks the hierarchy via `@flighthq/node`, emitting one `SceneNodeRecord` per node.
- `deserializeSceneDocument(registry, document, options?): Node | null` — rebuilds the graph with `createNode` + registered factories; returns `null` (sentinel) when a `kind` has no registered deserializer rather than throwing.
- `stringifySceneDocument(document): string` / `parseSceneDocument(text): SceneDocument | null` — the JSON text bracket; `parse*` returns `null` on malformed input.
- `registerDisplayObjectSerializers(registry): void` — the opt-in batch that registers the built-in display-object kinds (Bitmap, Shape, Container, Sprite, TextLabel, …). Tree-shakable: a user who only serializes sprites never pulls display-object reconstructors. Companion `registerSpriteSerializers`, `registerSceneSerializers`.

**Effort:** Moderate. The hierarchy walk is already a solved primitive in `@flighthq/node`; the work is the per-kind data (de)serializers and getting the registry shape right. This tier is the 80%-value core.

---

### Silver

Competitive with a well-regarded scene-serialization layer: versioned migration (the headline promise), robust partial loads, binary, and references.

**Types (`@flighthq/types`):**

- `SceneMigration` — `{ fromVersion: number; toVersion: number; migrate(document) → SceneDocument }`. The open, registerable migration step.
- `SceneMigrationRegistry` — ordered chain of migrations keyed by version.
- `SceneFormatError` — a sentinel-carrying result discriminant for `loadSceneDocument` (`{ ok: false; reason: 'unknown-kind' | 'bad-version' | 'malformed' | 'unsupported-version'; kind?: Kind }`), so callers branch on expected failure without exceptions.
- `SceneResourceRef` — `{ kind: 'resource'; id: string }`: a serialized handle to an external asset (image/font/atlas) so documents don't inline binary blobs. Paired with a `SceneResourceTable` on the document.
- `SceneSerializeContext` — threads an id-allocator and resource table through the walk for shared/duplicate references.
- `SceneBinaryFormatKind` (`'flight.SceneBinary'`) — kind for the binary dialect.

**Functions:**

- `createSceneMigrationRegistry()` / `registerSceneMigration(registry, migration)` — register a step.
- `migrateSceneDocument(registry, document): SceneDocument` — runs the version chain from `document.version` to current; the concrete realization of "translate what it means now, keep the runtime registry current-only." Unknown intermediate versions return via the error discriminant.
- `getSceneDocumentVersion(document): number` / `isSceneDocumentSupported(registry, document): boolean`.
- `serializeSceneToBinary(registry, root, options?): Uint8Array` / `deserializeSceneFromBinary(registry, bytes, options?): Node | SceneFormatError` — a compact binary encoding (length-prefixed, kind-string-interned) for large scenes; text JSON stays the debuggable default.
- `loadSceneDocument(registry, migrationRegistry, text|bytes): Node | SceneFormatError` — the one-call front door: parse → version-check → migrate → deserialize, with structured failure.
- `cloneSceneNode(registry, source): Node` — round-trip-based deep clone (serialize→deserialize) as a free byproduct of the seam; a commonly wanted operation that this package can offer cheaply.
- Resource handling: `collectSceneResourceRefs(document): readonly SceneResourceRef[]` so a loader (`@flighthq/loader`) can preload referenced assets before reconstruction.
- **Backend seam:** `SceneStoreBackend` + `getSceneStoreBackend()` / `setSceneStoreBackend(backend)` / `createWebSceneStoreBackend()`, plus `saveSceneDocument(name, document)` / `readSceneDocument(name)` convenience over it (returns sentinels when storage is unavailable).
- **Signals (`enable*`):** `enableSceneSerializeSignals(registry)` exposing `onSceneNodeSerialized` / `onSceneNodeDeserialized` for progress on large graphs (opt-in cost, owned here).

**Effort:** Substantial. Migration chain + binary codec + reference table are each real subsystems. Migration is the single most important Silver item — it is the doc-promised capability and the reason the package exists at all beyond "JSON.stringify the graph."

---

### Gold

The authoritative scene-persistence layer — exhaustive, performant, fully tested, with Rust parity.

**Types (`@flighthq/types`):**

- `SceneDiff` / `SceneNodePatch` — a structural diff format (`add`/`remove`/`reorder`/`set-data` ops keyed by stable node id) for incremental saves and editor undo/redo.
- `SceneSchemaDescriptor` — a machine-readable description of a kind's serializable fields (name, type, default), enabling validation, editor inspectors, and forward-compat field-skipping.
- `ScenePartialLoadPolicy` — `'strict' | 'skip-unknown' | 'placeholder'`: how `loadSceneDocument` treats unknown kinds (fail, drop, or substitute a `PlaceholderNode` that preserves raw data for re-save round-trips).
- `SceneFormatVersion` constant + a documented version history.

**Functions:**

- `diffSceneDocuments(out, base, next): void` — out-param diff (no allocation in the hot path), and `applySceneDiff(registry, root, diff): void` for incremental load.
- `validateSceneDocument(registry, document): readonly SceneFormatError[]` — full structural + schema validation against registered `SceneSchemaDescriptor`s; returns an array (empty = valid), never throws.
- `registerNodeSchema(registry, nodeKind, descriptor)` + `getNodeSchema(registry, nodeKind)` — drive validation, editor tooling, and forward-compatible unknown-field preservation.
- **Forward-compatibility:** unknown record fields are preserved through a load→save round-trip (never silently dropped), so a newer document opened by an older build re-saves losslessly. `PlaceholderNode` (in `@flighthq/displayobject` or here) carries opaque retained data for the `'placeholder'` policy.
- **Streaming:** `createSceneDocumentReader(bytes)` / `readNextSceneNodeRecord(reader, out)` — incremental, allocation-bounded parsing of very large binary scenes without materializing the whole document.
- **Deterministic output:** stable key ordering + canonical number formatting so the same scene serializes byte-identically across machines and across the TS/Rust ports (the conformance reference posture, matching `displayobject-skia`'s "bit-deterministic" role).
- **Exhaustive built-in coverage:** serializers for every Flight node kind — display objects (incl. masks, stages, video), sprite/tilemap/quad-batch, 3D `scene`/mesh/camera/light descriptors, text (label + rich + native), filters/effects descriptors attached to nodes, timeline/spritesheet animation state. Each colocated-tested with a distinct-output and round-trip (`serialize → deserialize → re-serialize` equality) assertion.
- **`-formats` neighbor at AAA:** glTF, Flash/OpenFL display-list, and Spine bridges in `@flighthq/scene-format-formats`, each `xxxParse`/`xxxSerialize`/`xxxSchema`.
- **Rust port (`flighthq-scene-format`):** 1:1 crate with serde-backed JSON + binary, the same migration chain, byte-identical canonical output verified against TS in the parity matrix, and full conformance-map entry. Mixable as a wasm leaf (`scene-format-rs`) since the seam is plain data.

**Effort:** Large and ongoing — diff/patch, schema validation, streaming, forward-compat round-tripping, and per-kind exhaustiveness each add up, and Rust parity doubles the surface. This is the "nothing a domain expert would find missing" bar.

---

## Boundaries

- **No rendering, no render state.** Serialization writes scene-graph data only; render nodes, caches, invalidation revisions, and renderer-specific runtime are explicitly _not_ serialized — they are rebuilt by the normal `prepare*Render` update pass after load. The package depends on no `render*` package.
- **No asset bytes.** Images, fonts, audio, and atlases are referenced by id (`SceneResourceRef`), never inlined. Actually fetching/decoding referenced resources belongs to `@flighthq/resources` + `@flighthq/loader`; this package only emits and collects the refs.
- **Foreign formats live in the neighbor.** Flash/OpenFL/Starling/Spine/glTF importers go in `@flighthq/scene-format-formats`, not the core, keeping the canonical document tree-shakable and free of foreign-schema weight.
- **Storage transport is a thin seam, not the core.** `SceneStoreBackend` is convenience; the (de)serializer is pure and string/bytes-in-bytes-out. Where the bytes ultimately live is `@flighthq/filesystem` / `@flighthq/storage` territory.
- **Kind registration stays in the owning packages.** This package registers _serializers_ against existing kinds; it never defines node kinds or owns the renderer registry.
- **Not a state/data-binding layer.** Live reactive app state is a separate (also-missing) concern; this package is point-in-time document persistence, not observation.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Where do the built-in serializer registrations live — here or in each entity package?** Co-locating `serializeBitmapData` with `Bitmap` keeps data shape and codec together and avoids `scene-format` importing every entity package; centralizing here keeps the persistence concern in one cell. The `register*Serializers` batch suggests centralized, but per-kind co-location better honors cellular boundaries. Likely answer: the _contract_ and registry live here; the _built-in implementations_ live beside their entities and are registered via the batch functions.
- **Is migration keyed by a single document `version` integer, or per-kind versions?** A single document version is simpler and matches the doc language ("version the scene format"); per-kind versions localize churn but complicate the chain. A single monotonically-increasing format version with kind-aware migration steps is the likely compromise.
- **Binary format ownership** — should the binary codec be its own `scene-format-binary` sub-package (so the JSON-only path stays tiny) or a tree-shaken module inside the root barrel? Given `"sideEffects": false`, a single root with the binary path tree-shaking out is preferred unless size measurement says otherwise.
- **Stable node ids** — diff/patch and reference sharing need stable identity, but nodes carry no persistent id today (only runtime identity + optional `name`). Introducing a serialized `id` field touches `@flighthq/types` `Node` and is a cross-package decision to surface, not decide here.
- **How much does the canonical document commit to JSON-shape stability** as a public contract? If third parties write Flight documents by hand, the JSON schema becomes API surface with its own compat obligations — worth an explicit "the document IS public API" vs. "only the functions are" call.
- **Round-trip fidelity vs. defaults** — should `includeDefaults: false` (omit fields equal to a kind's default) be the default for compactness, accepting that it couples documents to default values across versions? The schema descriptor (Gold) resolves this cleanly, but Bronze/Silver need an interim policy.

## Agent brief

> Create `@flighthq/scene-format` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
