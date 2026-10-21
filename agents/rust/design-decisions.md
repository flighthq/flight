# Design Decisions (outside flight-geometry)

Each item is marked **APPROVED** (binding), **DIRECTION** (the goal is agreed, the mechanics are not yet), or **PROPOSED** (awaiting a ruling).

References: the TS source is `github.com/flighthq/flight` (`packages/<name>/src`), and the prior Rust port is `github.com/flighthq/flight-rs-native`. Both are cloned under `refs/`, beside `repo/`, in the principal workspace.

Baseline: 29 crates, `cargo test --workspace` 4525 pass / 0 fail, `cargo-flight-lint check` 3112 violations.

## D0 Translate, don't rewrite — APPROVED (user, 2026-10-20)

- The TS API is the contract being translated. Rust signatures match TS names, parameter names, parameter order and parameter shape (an options object stays one options struct).
- Any divergence, existing or proposed, is discussed with the user before it is applied. That includes divergences recommended in this document. An approved divergence is marked `allow(conform-params|conform-extra) <reason>` or `conform-skip`, so the lint keeps it visible.
- Existing drift is inventoried in `agents/api-drift.md` for review. Fleet agents must not "fix" drift, in either direction, without a ruling.
- The conform baseline only blocks *new* drift. An entry being in the baseline does not mean it is accepted.
- **Approved D0 exceptions:**
  - Numeric arrays (user, 2026-10-20). Rust types decide the TS array type: growable `Vec<N>` → `number[]`, fixed-length `&mut [N]`/`[N; LEN]` → the matching typed array. This changes TS signatures that use `number[]` for fixed-length data, about 50 params (fixed-slot and caller-sized outputs) plus types. `Box<[N]>` (owned, fixed length) → typed array; read-only `&[N]` → `ArrayLike<number>`. Which form an API uses is negotiated per API (see "Array negotiation items" in `agents/api-drift.md`).
  - Pixels (user, 2026-10-20): TS `Uint8ClampedArray` becomes `Uint8Array` (`Bitmap.data`, `DecodedImage.data`, `GlyphSource.pixels`, bitmap filter outputs). Clamping is explicit in code (`to_clamped_u8`) and verified by tests. The canvas boundary uses zero-copy views.

## D9 Signature conventions — APPROVED (user, 2026-10-21)

- **(a) Parameter names.** Name-only renames that make Rust match TS are pre-approved; builders apply them without a ruling. Changes to parameter count, order, or type still need a ruling.
- **(b) Out parameters.** `out` comes first, and the caller owns creation and disposal (reuse; FFI clarity). Out-first functions return `void` or a status such as `bool`, **never the `out` object**.
  - Survey: TS has 957 `void`, 79 status/other, 19 returning `out`.
  - The 19 outliers (velocity 9, color 4, and single cases in scene3d, render, scene2d-canvas, …) drop the return in both Rust and TS. This is an approved D0 exception.
  - TS tests asserting identity return ("returns out") are dropped, not ported.
  - **Generalized (user, 2026-10-21): no function returns an argument it was given only so calls can chain.** Flash-style returns such as `addNodeChild(target, child)` returning `child` become `void`, along with `removeNodeChild`, the physics `add*Body/Collider/Joint`, and `clearShapedRun`; a heuristic scan finds about 15 non-`out` cases, plus delegating ones like `addNodeChild` → `addNodeChildAt`. Approved D0 exception; the identity-return tests are dropped.
  - A return of something the caller did *not* pass in (e.g. `removeNodeChildAt(target, index)` returning the removed child) is a real result and stays. A computed value that may equal an input (e.g. `gcd`) is not chaining.
  - Builders flag unclear cases instead of guessing.
- **(c) Optional and default parameters.** `Option<T>` in the same position; the default is applied inside the function. The transpiler emits `x?: T` / `x = d`.
- **(d) Callbacks.**
  - Stored or returned closures: `Arc<dyn Fn(..) -> R + Send + Sync>`.
  - Borrowed parameters: `&dyn Fn(..) -> R`.
  - Stateless function values: `fn(..) -> R`.
  - All three map to a TS function type. The lint is to recognize these forms (follow-up work package, after WP1).
- **(e) String unions.** A TS closed string union becomes a Rust enum plus the free functions `get_<enum>_string(value) -> &'static str` and `parse_<enum>(s) -> Option<Enum>`. These form the declared string table, and the strings match TS exactly.
- **(f) XML shared children.** `Ref<XmlElement>` in both `children` and `content`, matching TS shared identity (A2). This also fixes the exponential-memory test. Query helpers return `Ref<XmlElement>`.

## D10 Errors — APPROVED (user, 2026-10-21)

- **Translate as-is; no refactor now.** TS rule (flighthq/flight AGENTS.md): return sentinels (`null`, `false`, `-1`) for expected failures; throw only for programmer errors (precondition violations); no error-wrapping types.
- **Rust:** a TS `throw` becomes a typed panic through diverging free functions, e.g. `throw_range_error(msg) -> !`, `throw_type_error(msg) -> !`, `throw_error(msg) -> !` (a `panic_any` payload carrying the error kind). The transpiler maps them to TS `throw new RangeError(...)` etc. and to C++ `throw`.
  - Sentinel returns translate as `Option` / `bool` / `-1`.
  - No `Result` in the contract.
- **FFI layer (later):** each exported function catches the panic at the boundary and returns a status code, with a thread-local last-error message. A function's own return value becomes an out-parameter, placed **first** per the out-first convention, e.g. `flight_get_node_child_at(FlightNode** out, parent, index) -> FlightStatus` (chaining returns are already gone per D9b).
- **wasm:** only about 4 packages target it. Unwinding on wasm is revisited later.
- **Home for the throw helpers:** a low crate, flight-entity or a tiny dedicated crate; decided with the first work package that needs them.

## D11 Scope of the Rust SDK — APPROVED (user, 2026-10-21)

- **Not ported to Rust (TS-only platform layer):** host-web, host-electron, host-tauri, host-capacitor, the DOM and Canvas 2D renderers (scene2d-dom, scene2d-canvas, effects-canvas, textshaper-canvas), and dev tooling (tool-*).
- **Vital in Rust:** the GL and wgpu (Vulkan) render paths.
- **Cairo (2D software render path):** TODO. Not urgent while wgpu software adapters cover headless use; schedule after the other crates are ported.
- Feature packages (clipboard, dialog, …) are ported. They own their host-capability contracts (D8); a native Rust host is separate later work.
- **Transpilation is deferred until a full Rust SDK exists.** The vocabulary and the lint protect transpilability in the meantime.

## D12 Entity — APPROVED, trial (user, 2026-10-21)

- Rust is the IR for TS. In TS, anything whose identity matters (reference comparison, OOP wrapper binding through the hidden runtime) must be an Entity. So **every domain object is an Entity, including value types such as `Vector2`**. Dispatch infrastructure (renderers, registry tables, pipelines, host capabilities) is plain data with no runtime (flighthq/flight `agents/conventions/entity-boundary.md`).
- **Rust representation:** every entity struct has the field `pub runtime: EntityRuntimeSlot` (see the names rule below).
  - `EntityRuntime` (in flight-entity) wraps one thin pointer, 8 bytes, null when unused.
  - `Clone` gives a fresh, empty runtime; this matches TS `cloneEntity`.
  - `PartialEq` and `Debug` ignore it; `Default` is empty.
  - Entity structs keep `#[derive(Clone, Debug, Default, PartialEq)]` and lose `Copy`.
- **Construction:** `create_*` = `let mut out: T = allocate_entity(); initialize_*(&mut out, …); return out;`.
  - `allocate_entity<T: Default>() -> T` is the single named allocation hook (TS: `allocateEntity`, which sets up the runtime slot and object shape).
  - `initialize_*` chains base to derived and supports reuse.
  - `finish_entity` is dropped: it is a type-only cast with no runtime effect. On the TS side, `allocateEntity` returns a mutable-under-construction type, so no cast is needed.
- **Which types are entities (principal, 2026-10-21; mechanical per D0):** a Rust struct is an Entity **iff its TS type extends `Entity`**, directly or transitively; about 239 TS type files do. Everything else is plain data: no runtime slot, no `create_*`, and it is constructed with a struct literal, as TS uses an object literal. Example: `EasingSegment` (a plain TS interface) is plain data, so the Rust-only `create_easing_segment` is removed.
- **Names match TS (principal, 2026-10-21):**
  - Rust `EntityRuntime` is the TS `EntityRuntime` record (binding, uid).
  - The field type is `EntityRuntimeSlot`, the TS `[EntityRuntimeKey]: EntityRuntime | undefined`. Its implementation is a thin pointer with clone-resets and compare-ignores semantics.
  - Entity-valued TS singletons (`export const VECTOR2_X_AXIS = createVector2(1, 0)`) become `pub static X: LazyLock<Vector2>`, per the vocabulary.
- **flight-entity is the runtime layer**, holding `EntityRuntime`, `allocate_entity`, binding/uid, the IR aliases, and the D10 throw helpers. The user prefers *not* to hand-write a TS version; the structure is meant to work in both languages, so try to keep it transpilable. A hand-written per-target runtime is the fallback, decided at transpile time.

## D13 Export lanes — APPROVED (user, 2026-10-21)

- **Contract lane = the free functions** (TS `contract.ts`, the full surface other packages use). In Rust: `flight_x::contract::*`, mirroring `@flighthq/x/contract`.
- **Public lane = the curated surface** (TS `index.ts`). In Rust: the crate root re-exports, plus Rust sugar (impl methods) for public types.
- Contract-only items get no sugar (D6).

## D1 Numerics — APPROVED

- f32 is the default for all value types.
- f64 is used only where precision is required, and every such use is declared. Each crate lists its f64 types and functions with a one-line reason in a `## Precision` section of its README. Lint enforces this (see D7).
- Likely f64 candidates, each needing confirmation per crate: path-boolean kernels (robust predicates), path signed area and tessellation, timestamps and durations (log, signals timers), and collision only where a test shows f32 fails.
- Indices are `usize`. `i32` is used only where TS uses a `-1` sentinel.

Current state, to be reconciled: collision uses 820 f64 and 0 f32, path 654 f64, path-boolean 222 f64, and bitmap is mixed.

## D2 Open enums and additions — DIRECTION APPROVED (2026-10-20)

User ruling:
- An object says what it is (`kind`) and may carry type-specific data. In OOP terms, `kind` is the class identity.
- Handlers are loosely coupled to types through dispatch tables keyed by kind. **No large switch statements** over kinds; closed enums are not used for open sets.
- The `data` field is always present, even when it is null.

This matches pattern (A) below. A worked example, still open on mechanics, is in `agents/sketches/scene2d-sprite.md`.

TS has three patterns (see `refs/flight/packages/types/src`):
1. **Closed unions** for hot paths, such as particle forces, colliders and emitter shapes. TS comments say that registry dispatch would be too slow there.
2. **Open unions** (`'circle' | 'aabb' | … | (string & {})`), extended through `register*` Map registries. Last write wins. Vendor-prefixed names are used (`acme.Flow`). Built-ins are opt-in through `registerBuiltIn*`. Examples: collision shapes 2D/3D, layout kinds, log serializers.
3. **Structural/open base**, as in adjustments: `AdjustmentKind = string`, and dispatch keys off the data present, such as `colorMatrix` or a LUT.

Proposal:
- Closed TS union → closed Rust enum. The payload of each variant is a single named struct (`Circle(CollisionCircle2D)`), never anonymous fields.
- Open TS union → Rust enum of the built-ins plus `Custom(Custom<Name>)`. `Custom<Name>` carries `kind: String` (vendor-prefixed) and a payload. Dispatch for `Custom` goes through a registry keyed by kind, which is explicit state per D5.
- **Custom payload. Under discussion; reframed in scene2d terms (2026-10-20).**
  - TS pattern: the node has an open `kind: string`, plus a `data` slot that each kind narrows by extending the base interface (`Sprite extends Node2D { data: SpriteData }`). `RenderState.nodeRenderers: Map<Kind, NodeRenderer>` is filled by `registerNodeRenderer(state, kind, renderer)`, and the renderer receives the base node and casts it (`(proxy.source as Sprite).data.texture`). The registry key is what guarantees the cast is safe.
  - The open question is how the IR spells that cast:
    - **(A) Erased data slot + checked cast** (what flight-rs-native did): `data: Option<Box<dyn Any>>`, read with `downcast_ref::<SpriteData>()` wrapped in a free function, e.g. `get_sprite_data(node) -> Option<&SpriteData>`. Transpiles to TS `as Sprite` and C++ `static_cast`.
    - **(B) Closed enum of kinds**: `NodeData::Sprite(SpriteData) | Shape(..) | …`. This closes the set. flight-rs-native's GL path drifted into this (`GlRendererSlot`), and third-party node kinds can no longer plug in there.
  - Generics do not apply. A scene mixes kinds in one tree, so the data has to be erased (A) or enumerated (B).
  - Principal leans (A) as the 1:1 translation (D0). It would keep `Kind` a string (the user prefers no `u64` `KindId`), make `NodeRenderer` a struct of fn pointers like the TS object of functions (no traits), and restrict `dyn Any` to designated data slots.
- No `From` impls on enums in the contract. Those may live in the sugar layer (D6).
- Closed enums that came from TS string literals keep a canonical string table (`*_to_string` / `parse_*` free functions) where TS exposes the strings.

flight-rs-native used `KindId(u64)` (a hash of `TypeId`, or an atomic counter) plus trait objects with `downcast_ref`. That is a Rust-only approach, not FFI-portable.

## D3 Maps — APPROVED 2026-10-20

A survey of the TS (no test asserts key order) shows that most maps are key/value lookups only: layout resolvers, animation and mesh indexes, log serializer and rate-limit maps, and xml attribute lookups. HashMap is fine for these.

There are exceptions where TS iteration order reaches callers:
- **tween**: `Object.keys(propertyMap)` becomes the public `tween.properties[]` and sets the order of property writes. `manager.tweens: Map<target, Tween[]>` sets the order in which `onUpdate`/`onComplete` callbacks fire and in which `stopAllTweens` completes. The Rust `HashMap<usize, Vec<Tween>>` fires callbacks in **random order across runs**.
- **log**: JSON/text formatter output follows key insertion order (context fields, then span fields, then data).

Ruling (user, 2026-10-20):
- Maps are for lookup and are never iterated. When a collection is iterated, use a `Vec`. A crate that needs both keeps the objects in a `Vec`, plus a HashMap index into it.
- A map may be iterated only where neither order nor performance matters, and that use must be marked `allow(hashmap-iteration) <reason>`.
- This matches flight-rs-native, which uses no IndexMap and keeps order with Vecs. Enforced by `hashmap-iteration` (error).

## D4 Signals and type erasure — APPROVED (user, 2026-10-21)

flight-rs-native uses:
- `Signal<T>`, generic over the payload, with the payload a named event struct or `()`;
- slots `Arc<dyn Fn(&T) + Send + Sync>`, held in a `Vec` sorted by priority with insertion order kept for ties;
- `connect_signal` returns a `SlotId(u64)`, with a drop-guard as sugar;
- `emit_signal` snapshots the slots, releases the lock, then calls them, so re-entrant connect, disconnect and emit are safe;
- `cancel_signal` to stop propagation.

The current repo instead uses `SlotFn = Rc<dyn Fn(Rc<dyn Any>)>`, with args erased.

Proposal: adopt `Signal<T>` and `SlotId`-based disconnect in the contract. The RAII guard belongs to the sugar layer. Whether slots are `Rc` or `Arc + Send + Sync` follows the D5 thread-safety ruling.

Entity binding (`Box<dyn Any>`): use the same answer as the D2 Custom payload, i.e. an opaque handle or generic.

## D5 Hidden state — DIRECTION (registries APPROVED)

Agreed: hidden semantic state is a problem. An internal cache that does not affect results is acceptable. Thread safety must be considered.

Inventory: thread_local/static exists in log (sinks, levels, spans, clock), signals (timer queue, `SystemTime::now`), entity (uid counter, write guards), statechart, flow, textbidi and textsegment (each with private log copies), tween (default manager), and easing (a `Mutex` guard).

Proposed mechanics:
- Semantic state (registries, timers, default managers, uid counters, log sinks/levels) moves into explicit state structs passed by the caller. Layout already does this (`LayoutState`). The clock is injected as a time parameter, never read inside the contract.
- **APPROVED (2026-10-20):** registries are arguments, never hidden globals, even where TS uses a module-global registry (collision `registerCollisionSupport2D`, log serializers). They may hang off a larger state object (e.g. a `RenderState`). The TS source is expected to move the same way. Until it does, the resulting signature differences are marked `allow(conform-params) registry passed explicitly (D5)`.
- Caches with no semantic effect may stay internal. They must be marked `// flight-lint: allow cache`.
- Debug guard toggles: fold them into the state struct where one exists, otherwise allow them with a marker.
- Thread safety (user: open to discussion; do it correctly if it does not hurt performance). Proposal:
  - Contract value types are plain data, so they are `Send + Sync` for free, at zero cost.
  - State structs own their data (Vec/arena + handles) instead of sharing it, so they are `Send` with no locks. The caller decides on locking.
  - Where shared ownership is genuinely needed (signal slots, custom payloads), use `Arc` rather than `Rc`. Uncontended `Arc` costs one atomic increment per clone and nothing per call; it never needs a `Mutex` inside the contract.
  - Net effect: no `Rc`/`RefCell` in the contract, and no locks on hot paths.
  - User: ok (2026-10-20).
- All logging goes through flight-log. Crate-local log copies are removed.

## D6 Contract vs Rust sugar — APPROVED

- The **contract** is the free-function API. It is what crates use internally and what tests exercise. It is designed for FFI portability, so constructs that look redundant in Rust (`equals_rectangle`, `create_*`/`initialize_*`) are kept.
- **Rust sugar** (`impl` methods, operator traits, `From`, RAII guards) is optional and Rust-specific. It mirrors the *public* API only and delegates to the contract. Contract-only items (internal helpers, pools) get no sugar.
- Tests never call sugar. This is enforced today by `test-method-call`.

## D7 Lint direction — APPROVED, implemented 2026-10-20

`cargo-flight-lint` now enforces the direction. `cargo run -p cargo-flight-lint -- rules` lists the rules, and AGENTS.md documents them.
- **error:** `f64` (D1; declare with `allow(f64) <reason>`), `hidden-state` (D5), `sugar-delegates` (D6), plus all the existing structure and test rules.
- **error (D3 approved 2026-10-20):** `hashmap-iteration`.
- **warn**, until rulings land: `contract-vocabulary` (replaces `contract-dyn-any`/`contract-shared-mutability`; see `agents/ir-vocabulary.md`), `enum-payload-named` (D2).
- **Ratchet:** `--baseline agents/baselines/{check,conform}.txt` fails only on new violations. Baseline at implementation: check 2380 (2270 errors, 110 warnings); conform 343 (75 missing, 112 extra, 156 params: 5 reordered, 57 count, 94 names only). See `agents/api-drift.md`.
- **conform fixes:** names now match ignoring case and underscores (fixing `Ray3D`); matching is scoped to the crate's own TS package (`flight-x` ↔ `packages/x/src`); parameter names and order are checked; `export const f = (...) =>` functions are recognized; missing functions are tagged `public` (`index.ts`) or `contract-only` (`contract.ts`). TS already has the D6 split: `index.ts` is the curated public API and `contract.ts` is the full contract.
- **Manifests:** `manifest --write|--check`. Only flight-geometry is frozen so far (`agents/manifests/flight-geometry.{api,tests}`). Other crates get frozen once their rulings are applied and the user approves them.
- **Findings in flight-geometry** (now visible because the false positives are gone):
  - 39 public TS pool and typed-array functions are not ported (`acquire_*`/`release_*`, `reserve_*_array`, `set_geometry_pool_release_guard`).
  - 7 `initialize_*` functions are untested.
  - 36 parameter divergences: names such as `rect` vs TS `target`/`source`, and shapes such as `initialize_ray3d(out, ox, oy, oz, dx, dy, dz)` vs TS `(out, origin, direction)`.

## D8 Where types live — APPROVED: dissolve `types` (user, 2026-10-21)

Ruling:
- No central types crate. Every type lives in the crate that owns it, in both Rust and TS, so imports are identical.
- The discipline of naming each type's owning crate is intended. A `-types` crate would pull implementations toward it over time.
- **Ownership rule:** a type lives in the lowest crate that must name it. Where that lands somewhere surprising, the fix is usually a missing crate, not an exception.
- Accepted placements: `BlendMode` → materials (a property of materials).
- Proposed (research in `agents/research/text-host-ownership.md`; with all fixes applied there are zero cycles and the maximum depth is 17):
  - **APPROVED (user, 2026-10-21): new crate `textformat`** (L1, depends on entity): `TextFormat`, `TextFormatAlign`, `TextFormatListMarker`, `TextFormatRange`, `FontVariation` and their functions, moved out of textlayout and text. Also split `GlyphSource` so the rasterizer contract moves to font. `text` stays the display-node package.
  - **Host:** no contract crate. That would recreate `types`, because capabilities reference 310 types from 48 packages. Instead:
    - each feature owns its capability contract and its `Host<Group>Capabilities` record, and `host` aggregates at the top;
    - the 25 platform-specific types (`Electron*`, `Tauri*`, `Capacitor*`, `Web*`) move into their host-* adapter;
    - `HostInput` moves to input.
  - **Ambiguous types:** 84 resolved. 11 owner changes remove 11 accidental dependencies between sibling backends (e.g. scene2d-gl → scene2d-canvas). `EffectStateOptions` → effects.
  - **Possible small crates:**
    - `resource` (`ResourceResolutionState`, shared by audio and image);
    - `capability` (`BackendOperationExplanation`), which removes logic duplicated in lifecycle and textshaper that has diverged (`'sentinel'` vs `'none'`).
  - **APPROVED: `resource` crate.**
  - **DECIDED (principal, delegated by the user):** the `mesh` package becomes **`meshgeometry`**. It is a geometry-data library also used by importers and formats, so merging it into scene3d would pull scene3d into every consumer. The `Mesh` node and `updateMeshMorph` move to scene3d, matching `Sprite` in scene2d.
  - **APPROVED: `flight-unhomed`**, a holding crate for types without a home yet (rules in `agents/plan.md`).
  - Naming: "backend" is reserved for render backends. The rest of the SDK says "host capabilities" or "host seams". The explanation-vocabulary crate gets a host-capability name, not `backend`. It is part of the host seam API (user, 2026-10-21).
    - Proposed name **`hostcapability`**, following the naming convention: a hyphen suffix marks an adapter or variant of a base package (host-web, scene2d-gl, *-formats), and a joined compound marks a distinct subdomain (textformat, textlayout).
    - Possible type rename `Backend*Explanation` → `HostCapability*Explanation`: deferred, not needed now.
  - Under discussion (2026-10-21):
    - **`capability` → proposed name `backend`.** Its types are `BackendExplanation` and `BackendOperationExplanation`, and it would host one shared `explain_backend_operation`, replacing the diverged copies in lifecycle and textshaper. It is conceptually part of the host contract, but it must sit below the features, because `host` aggregates at the top.
    - **Mesh.** The 2D convention: core nodes (`DisplayObject`, `Sprite`, `Scale9Sprite`, `HtmlView`) live in scene2d, and each extra node kind has its own package named after the node (shape, tilemap, text, bitmaptext, movieclip). By analogy `Mesh` is 3D's core drawable, so it belongs in scene3d, like `Sprite` in scene2d. `updateMeshMorph` moves with it, which also removes today's mesh ↔ scene3d source tangle. The geometry-data package would be renamed `meshgeometry`, following the compound naming of textlayout, textshaper, glyphatlas and textformat.

Background analysis follows.

### Analysis (2026-10-20/21)

TS keeps all 1,073 type files in `@flighthq/types`, which has no dependencies. The Rust port so far defines types per crate. A prior agent preferred per-crate types, but no rationale is recorded.

Cycle analysis (2026-10-20). Simulate "each crate owns its types" over the TS package graph:
- **The function-level package dependencies alone have no cycles.**
- **Adding type references creates real cycles in the render, scene and effects layers.** Verified examples:
  - `RenderState` (render) references `NodeRenderer`, `Scene2DClipHooks`, `CanvasShapeCommand`, `EffectPaddingResolver`, `Path`, `PathMesh`, while scene2d-gl, effects and canvas all depend on render.
  - `GlRenderState` (render-gl) references `GlEffectState` (effects-gl), `ShapeRasterizer` (scene2d-gl), `GlContext` (scene3d-gl), each of which depends on render-gl.
  - `Path` references `ShapeCommand` (`PathWinding`), while shape depends on path.
- About 71 of 562 cross-package type references point against the dependency direction. The ownership heuristic is approximate, but the examples above are confirmed by reading the source.
- Leaf libraries (geometry, easing, color, math, …) have no back-references, so per-crate types work there. That is probably what the earlier advice was based on.

Direction (user, 2026-10-20):
- Keep a `flight-types` crate at the **bottom**. Anything that settles downward and is a pure type rather than an implementation can live there: enums, data and option structs, shared vocabulary.
- Implementation crates own the types that carry Rust impl sugar, plus all free functions.
- Renderer internals are contract-lane and not user-facing, so they may be restructured to break cycles:
  - backend-specific fields of the generic `RenderState` move to `CanvasRenderState` / `GlRenderState` / `WgpuRenderState`;
  - plug-in state uses the existing slot and registry pattern.
- Research in progress: classify every cross-layer type reference under this layout.

Update (2026-10-21):
- **Hybrid layout** (research in `agents/research/crate-layout-hybrid.md`, zero violations):
  - foundation tier `math → geometry → path` and `color`, holding 19 sugar-bearing value types;
  - below a `flight-types` that keeps the shared vocabulary.
- **User goal:** "simple without surprises". `Node` not living in the `node` crate would be a surprise, so dissolving `flight-types` entirely (every type in its owning package, in both Rust and TS) is under serious evaluation.
- **Dissolve research** (`agents/research/dissolve-types.md`, fixes in `dissolve-types-fixes.json`): **feasible.**
  - 90 fixes bring the package graph to zero cycles:
    - 61 relocations (import path only);
    - 7 slots and 2 backend moves, which change about 17 public fields, nearly all runtime or registry fields;
    - 4 inversions;
    - 16 module moves.
  - The ownership rule that makes placement predictable: **a type lives in the lowest package that must name it.**
  - Surprises that remain: `Mesh` → scene3d (because `Mesh extends Node3D`; renaming the mesh package to mesh-geometry would avoid it), `TextFormat` → textshaper, `BlendMode` → materials, and small markers such as `RendererData`/`Viewport` in node.
  - 84 types need a deliberate owner (`Host*` capabilities, `TextureSource*`, `ShapeCommand`, input payloads). 21 types are unused.
  - Maximum dependency depth grows from 10 to 21.

Earlier proposal (superseded by the direction above): a `flight-types` crate mirroring `@flighthq/types`. It has no dependencies, holds the IR aliases (`Ref`, `Kind`, `AnySlot`, typed-array aliases), and holds type definitions at least for every layer where cycles occur. Whether leaf types such as geometry move there too, for exact parity with TS import paths, is a separate decision.

---

# Fleet workflow — PROPOSED

1. **Frozen manifests (user-owned).** `agents/manifests/<crate>.api` (generated pub signatures and types) and `<crate>.tests` (test names). A parcel that changes a manifest is rejected unless the user approved the change.
2. **Protected tests.** Tests for approved crates (geometry first) are read-only for builders. A wrong test is escalated, not edited.
3. **One crate per builder.** No cross-crate edits. Shared-type changes go through principal.
4. **Gates per parcel:** workspace tests pass; zero new lint violations in touched crates (ratcheted from the baseline); empty manifest diff; `conform` clean for the crate.
5. **Roles:** builders implement, auditor checks against APPROVED rulings and manifests, integration lands the work.
6. **Sequencing:**
   - (a) tooling first: fix conform, add D7 rules, and add the manifest generator;
   - (b) pilot one small crate end-to-end (color or easing);
   - (c) scale out by dependency order.
