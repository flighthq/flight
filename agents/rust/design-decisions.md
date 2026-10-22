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
  - Color matrices (user, 2026-10-21): the fixed 4×5 color matrices in adjustments (TS `number[]`, always 20 values) are buffers, so they become `[f32; 20]` in Rust and `Float32Array` in TS. TS construction stays easy through the existing `create*` helpers.
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
- **Rust representation:** every entity struct has a private field `runtime: EntityRuntimeSlot` (see the privacy rule below).
  - `EntityRuntimeSlot` (in flight-entity) holds the allocation-time `u64` entity id plus a lazy `Option<Box<…>>` pointer to the `EntityRuntime` record: 16 bytes on 64-bit targets, the pointer null until runtime data is needed.
  - `Clone` gives a fresh, empty runtime; this matches TS `cloneEntity`.
  - `PartialEq` and `Debug` ignore it; `Default` is empty.
  - Entity structs keep `#[derive(Clone, Debug, Default, PartialEq)]` and lose `Copy`.
- **Numeric entity id (user, 2026-10-21):** each entity also gets a `u64` id, assigned at allocation from one process-wide atomic counter (`fetch_add`), never reused, so there are no duplicates. It is for internal map keys (render caches, D15) and is not persisted or serialized; the string uid stays the public identity. Wrap is not reachable: in TS the counter is a `number`, exact to 2^53 (about 285 years at a million entities per second); declared range `0..2^53` per the integer rule.
- **The runtime is private (user, 2026-10-21).** It is hidden SDK state, the equivalent of TS's symbol-keyed `[EntityRuntimeKey]`: used for API/OOP binding and for subsystem state such as scene-node caches. Users never write it directly.
  - Entity structs declare `runtime: EntityRuntimeSlot` as a **private** field.
  - flight-entity defines `pub trait Entity { fn entity_runtime(&self) -> &EntityRuntimeSlot; fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot; }` and a declarative macro, `impl_entity!(Type)`, which each crate invokes for its own types.
  - Runtime-layer functions take `T: Entity`, e.g. `attach_entity_binding<T: Entity>(entity: &mut T, …)`, matching TS `entity: Entity`. This also settles the binding/uid API shape.
  - Struct literals of entity types are impossible outside their crate, which enforces TS's "constructors, not literals, for entity types".
  - Transpile: `impl Entity for X` → `interface X extends Entity`; the private `runtime` field → the symbol-keyed slot.
  - Open for the node port (Phase 4): TS node runtimes extend the base runtime (`NodeRuntime extends EntityRuntime`, `SpriteRuntime extends Node2DRuntime`) and carry caches. The slot must hold each entity's own runtime type while keeping binding and uid reachable. Design this with the first node work package.
- **Construction:** `create_*` = `let mut out: T = allocate_entity(); initialize_*(&mut out, …); return out;`.
  - `allocate_entity<T: Default>() -> T` is the single named allocation hook (TS: `allocateEntity`, which sets up the runtime slot and object shape).
  - `initialize_*` chains base to derived and supports reuse.
  - `finish_entity` is dropped: it is a type-only cast with no runtime effect. On the TS side, `allocateEntity` returns a mutable-under-construction type, so no cast is needed.
- **Which types are entities (principal, 2026-10-21; mechanical per D0):** a Rust struct is an Entity **iff its TS type extends `Entity`** (directly or transitively, through type aliases; see `agents/research/type-owners.md`) **or its TS factory returns `X & Entity` and X is a concrete object type** (e.g. spatial backends; a nullable `(X & Entity) | null` qualifies). A union whose members are all entities is an entity-union: a Rust enum of entity structs, with no runtime on the enum. Factory `& Entity` on a union of plain records does **not** make the members entities: the physics world-shape factories return plain collision shapes (recorded D0 exception). Everything else is plain data: no runtime slot, no `create_*`, and it is constructed with a struct literal, as TS uses an object literal. Example: `EasingSegment` (a plain TS interface) is plain data, so the Rust-only `create_easing_segment` is removed.
- **Names match TS (principal, 2026-10-21):**
  - Rust `EntityRuntime` is the TS `EntityRuntime` record (binding, uid).
  - The field type is `EntityRuntimeSlot`, the TS `[EntityRuntimeKey]: EntityRuntime | undefined`. Its implementation is the numeric id plus the lazy runtime pointer. `Default` / `Clone` get a fresh id and empty runtime data; `PartialEq` / `Debug` ignore the slot; the id is stable through initialize, binding, string-uid assignment and moves.
  - Entity-valued TS singletons (`export const VECTOR2_X_AXIS = createVector2(1, 0)`) become `pub static X: LazyLock<Vector2>`, per the vocabulary.
- **flight-entity is the runtime layer**, holding `EntityRuntime`, `allocate_entity`, binding/uid, the IR aliases, and the D10 throw helpers. The user prefers *not* to hand-write a TS version; the structure is meant to work in both languages, so try to keep it transpilable. A hand-written per-target runtime is the fallback, decided at transpile time.

## D14 Pilot follow-ups — APPROVED (user, 2026-10-21)

- **Easing:** `get_easing_derivative` default epsilon `1e-3` (f32-tuned) instead of TS `1e-6`. This is a precision exception to D0: in f32, `1e-6` gives errors up to 2.5e-2, while `1e-3` gives about 5e-5. TS will follow.
- **Identity singletons:** keep an easy, **immutable** identity. Restore `MATRIX_IDENTITY` as `pub static MATRIX_IDENTITY: LazyLock<Matrix>`, mirroring the vector axis singletons. It is a user-approved addition (TS gains `MATRIX_IDENTITY`); mark it `allow(conform-extra)` with that reason. The user has no preference on the other matrix and quaternion identities; add them only if the TS port wants them.

## D15 Async and object-keyed caches — APPROVED (user, 2026-10-21)

- **Async:** TS `async`/`Promise` functions (about 124, all at the edges: resources, loader, audio, font, image, midi, video) become Rust `async fn`.
  - Transpile: TS `async function … : Promise<T>` (clean); C++ coroutines on a small hand-written task type.
  - **The SDK stays executor-neutral:** it never spawns tasks and never picks a runtime. It returns futures that the app or host drives, and IO comes through host capabilities.
  - Async callbacks (e.g. capabilities that return futures) use one vocabulary form: `Arc<dyn Fn(..) -> Pin<Box<dyn Future<Output = T> + Send>> + Send + Sync>`. The lint row is a follow-up.
  - Needed before wave L4.
- **WeakMap / WeakSet and object-identity Map / Set:**
  - Caches about one object live in that entity's **runtime slot** (TS's own preferred pattern).
  - Caches owned by another state (render backends) are maps **keyed by entity uid**, with explicit dispose. TS already pairs its WeakMaps with a strong Set for deterministic shutdown.
  - This is another payoff of the common Entity base (user).
  - Needed before render (L11).
- **Text positions — APPROVED (user, 2026-10-21):** strings are stored as Rust `String` (UTF-8). **Every public text position, length, and range in the text APIs is a UTF-16 code-unit offset (`usize`)**, identical to TS. User-visible units (cursor movement, selection, deletion of emoji and other multi-unit characters) go by grapheme cluster boundaries (textsegment), never by raw offsets. Conversions happen inside the implementation, as textbidi already does.

## D20 Shared promises and streams — APPROVED (user, 2026-10-21)

- **Shared promises:**
  - A TS `Promise` **stored in a field** (it settles once and may be awaited repeatedly, by multiple observers; e.g. `ShellProcess.exit`) becomes a shareable future, `futures::future::Shared<…>`: cloneable, every clone yields the same result, executor-neutral. The value type must be `Clone` (wrap it in `Ref` / `Arc` if needed).
  - Promises **returned** from async functions stay plain `async fn` (D15).
  - Vocabulary: `SharedFuture<T>` (alias) → TS `Promise<T>`.
- **Streams:**
  - TS `ReadableStream<Uint8Array>` / `WritableStream<Uint8Array>` become the named vocabulary types `ReadableStream` / `WritableStream`, built on `futures-io` `AsyncRead` / `AsyncWrite`. They live in a new low crate, **`flight-stream`**, shared by shell, filesystem, and net.
  - Web Streams semantics map as follows: reader locking → exclusive ownership (`&mut`); BYOB reads → `AsyncRead`'s caller buffer; backpressure → pull-based polling; cancel / abort → drop (plus explicit close / abort functions where TS exposes them).
  - `tee()` and other extras become small helpers in `flight-stream`, added when a package needs them. Each is reported, never silently omitted.

## D21 flight-sdk meta crate — APPROVED (user, 2026-10-21)

- `flight-sdk` mirrors `@flighthq/sdk`: it depends on every SDK crate and re-exports each crate's **public lane** (`pub use flight_x::*;`, one line per crate, as in `sdk/src/index.ts`). Contract modules stay out. Sugar travels with the types.
- **Host adapters (`host-*`) are excluded,** as in TS; apps add them alongside.
- Optional Cargo features for heavy subsystems (`gl`, `wgpu`, `skia`, …) save compile time.
- **Built at the end,** after the porting waves, to avoid merge conflicts. Not before.

## D26 Host vocabulary and host layering — APPROVED (user, 2026-10-22)

- **One home for "doesn't live here": `flight-host`, at the bottom.** Every type the SDK uses but does not define, because a host provides it, lives there: native window, drawable and view handles, Canvas 2D context, GL context, wgpu device / configured context, host image source, audio device and node ids, font face handle, frame-request id, media stream. It also holds the shared seam vocabulary that was `flight-hostcapability` (`ProviderRef`, timer and spawn contracts, explanation records); that crate folds into it. It depends on nothing else in the SDK, so these types thread through every layer, the way `int` and `bool` come from the language.
- **Representation follows TS:** a TS object type becomes an opaque handle, `{ provider: ProviderRef, handle: Arc<dyn Any + Send + Sync> }`, whose `Arc` identity is the platform object's identity; a provider-issued TS `number` id becomes a numeric newtype with its TS sentinel semantics. The SDK retains and passes them; the consuming backend narrows them (render-gl → `glow::Context`, render-wgpu → `wgpu::Device`; a thread-bound object is built on its own thread from the Send handle, D17). A meta API over several hosts (e.g. one 2D drawing API over Canvas and Cairo) is not planned now.
- **It is the other half of the transpiler vocabulary.** `ir-vocabulary.md` maps language constructs; `agents/host-vocabulary.md` maps platform objects: Rust ↔ TS (`WebGL2RenderingContext`, `GPUDevice`, …) ↔ C++ ↔ Haxe ↔ providing capability. Inventory and review: `agents/research/host-type-inventory*`.
- **Capability contracts stay with their feature** (D8): surface owns the Canvas / GL / wgpu drawable capabilities, filesystem and dialog own theirs, and so on. A contract is a record of operations a host realizes; SDK records it returns (file entries, dialog results) stay SDK-defined and carry a host-vocabulary handle where a native object is involved.
- **Principle (user):** there is no universal host. Hosts provide capabilities, different hosts provide different ones, and an app mixes and matches them (e.g. an SDL window and GL context with a separate audio or filesystem provider).
- **No generic aggregate host.** Each `host-*` provider defines its own host value holding the capability groups it supports (e.g. `WebHost`), and depends only on `flight-host` and the feature crates it implements. Apps take individual capabilities (explicit dependencies).
  - The former aggregate (`Host` entity with 48 groups, `explain_host`, `enable_host_guards`, `getHostWgpu` / `hasHostWgpu`) is redistributed: each feature owns the explain and guard functions for its own group; a provider composes them for its host; queries become field access on the provider's host.
  - TS mirrors this: `@flighthq/host` becomes the bottom vocabulary; host-web / host-electron / host-tauri / host-capacitor each define their own host type.
- **Not decided:** whether contracts should later take only host handles (e.g. `acquire(native_surface_handle)` instead of `acquire(surface)`). Post-port backlog.

## D25 Geometry pools — APPROVED (user, 2026-10-21)

**Pools are an explicit scratch bank, not hidden behavior.** Every use is an `acquire_*` / `release_*` bracket at the call site, which documents intent better than per-function scratch statics would. Rust gains little from them, since `create_*` is stack-only, but the transpiled TS gets real GC wins. So the API stays in the IR.

- **Full TS pool API kept** for Vector2/3/4, Rectangle, Quaternion, Matrix, Matrix3, Matrix4: `acquire_*`, `acquire_empty_*` / `acquire_identity_*`, `release_*`, `clear_*_pool`, plus the guard functions (`enable` / `disable` / `are_geometry_pool_guards_enabled`, `set_geometry_pool_release_guard`). No TS API change.
- **Sanctioned D5 exception:** each pool is a **thread-local** `Vec` (no locks; threads never share a pool), marked `allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)`. The guard state is thread-local too.
- **Ownership:** `acquire_vector2() -> Vector2` moves an object out of the pool; `release_vector2(v: Vector2)` moves it back and clears its runtime, as TS does. **Correction (principal):** object identity across release / acquire is *not* observable in safe Rust. The value moves (no stable address), and clearing the runtime also clears the uid. Double release is statically impossible because `release` consumes the value. So:
  - Rust tests assert what is observable: LIFO order (by component values written before release), `clear_*_pool` emptying, the runtime being cleared, `acquire_empty_*` / `acquire_identity_*` values, and thread isolation.
  - TS identity tests (reuse of the same object, double release triggering the guard) are kept in TS for the transpiled target and listed as statically prevented / unrepresentable in Rust. Add compile-fail doctests for use-after-release and double release.
  - The guard API (`enable` / `disable` / `are_…_enabled` / `set_geometry_pool_release_guard`) is kept and tested for its state and callback lifecycle. In Rust, the duplicate-detection branch is unreachable and is not simulated: no hidden stable ids.
- **Internal SDK code** ports TS acquire / release pairs as written (D0), so transpiled TS keeps its allocation profile.
- **`reserve_*_array` is not pooling:** it is grow-if-needed (TS returns the same array when large enough, otherwise a larger copy). Translate it exactly as an ownership round trip: `reserve_float32_array(array: Box<Float32Array>, capacity: usize) -> Box<Float32Array>`, which returns the same allocation when large enough. Likewise for Int16 / Uint16.

## D24 Out parameters and allocation — APPROVED (user, 2026-10-21)

- **`out` is always first and always required.** No optional `out?`, and no "allocate if omitted".
- **Alias safety:** every out-writing function reads its inputs before writing, so the transpiled TS / C++ is correct when a caller aliases. Safe Rust cannot pass one owned value as both `&mut out` and `&source`, so Rust tests use the geometry form: clone the source, pass the original as `out` and the clone as the source, and assert the result the TS alias test expects. Where the TS source has a same-object fast path (e.g. `copyPath` no-op), it is listed as unrepresentable in Rust and kept in TS.
- **No hidden allocation.** A function that returns a newly allocated object is named for it: `create_*` (constructs a type) or `clone_*`. Everything else, including functions that only fill a plain array or buffer (`write_*`), writes into a caller-provided `out`.
- **TS changes to match:** about 15 TS functions with `out?` (copyPath; path-boolean booleanPaths / union / intersect / difference / xor / unionAll / offset / simplify / resolvePathRegions / writePathBooleanContours; multiplyColorMatrix; createEasingSamples; computeEffectPadding) become out-required. Where TS also wants the allocating form, it is a named `clone_*` / `create_*` (e.g. the existing `clonePath`). `createEasingSamples` is not a type constructor: it becomes `write_easing_samples(out, ease)` / `writeEasingSamples(out, ease)`, with the count taken from `out.len()` (empty `out` throws; one sample is the midpoint `ease(0.5)`) and no allocating form.
- **Return vs out (user, 2026-10-21; applied via `agents/research/construction-table.*`).** A function **returns** its result only in these cases:
  - **Primitives:** number, string, bool, enum. Strings are returned; no out-`String`.
  - **Constructors:** `create_*`, `clone_*`.
  - **Content constructors:** a new object whose content is wholly determined by the input, from a specifically named parse / decode / decompress / encode / compress / format / read / `load_*_from_*` operation (the caller cannot size or pre-create it). TS names are kept; no rename. This includes any function that constructs a fresh object (or null) from its inputs, e.g. `create_scene3d_from_md2`, `build_binary_stl`, texture-ref helpers, even if it also registers that same allocation elsewhere (principal clarification). D23 field-argument removal applies only to an entity's canonical `create_x` / `initialize_x`. Open-family callback protocols keep their source signatures.
  - **Existing handles:** returning an existing shared handle (an `Arc` clone of a held `Ref`) is not an allocation.
  - **Everything else that produces a structured value takes an `out`** (first, required). Collections become `out: &mut Vec<T>` (TS `out: T[]`): the function clears it, then fills it, so the caller keeps capacity across calls. Computed values go into a caller-owned object, as geometry does.
  - Growable byte-buffer outs for decoders are a post-port item (`plan.md`), only if a hot path needs them.
  - Rows that fit none of these go back to the user as a grouped exception list; builders do not decide them.
- **Nullable collector outs** (`explain*Coverage(out: X[] | null)`, where null means "do not collect") stay as `Option<&mut Vec<…>>`. That is not an allocation choice.
- **D23 (A) refinement: value types with one obvious constructor** take their components as required positional arguments: `create_vector2(x, y)`, `create_matrix(a, b, c, d, tx, ty)`. **Matrix3 / Matrix4 have no single obvious constructor:** `create_matrix3()` / `create_matrix4()` take no arguments and return identity, and `initialize_matrix3(out)` / `initialize_matrix4(out)` take only the receiver, because initialize mirrors create's arguments (D23; user, 2026-10-21). Values go through the existing `set_matrix3(out, m00…)`, `set_*_from_*`, named creators (`create_matrix4_from`, perspective, orthographic), or direct field writes. TS `createMatrix3` / `createMatrix4` drop their optional components to match.

## D23 Construction, copy, and clone — APPROVED (user, 2026-10-21)

This changes the TS API as well as Rust. It is applied via a reviewed classification table, not ad hoc.

- **(A) Value types** (vectors, matrices, rectangles, colors, quaternions) take all their components positionally when they have one obvious constructor: `create_vector2(x, y)`, `create_matrix(a, b, c, d, tx, ty)`. Matrix3 / Matrix4 are the exception (D24): a zero-argument identity create.
  - **No overloads:** one signature per function, for transpilation and performance.
  - Common shapes get either a named constant to copy from (`MATRIX_IDENTITY`, D14) or a distinctly named creator, only where TS exports one.
- **(B) Entities take no field arguments by default:** create, then assign fields (D16).
  - **Exception, opt-in per type and approved by the user:** a field that is the object's *defining content*, obvious from the function name without a label, may be a positional argument (e.g. `create_bitmap(bitmap_data)`; but `create_sprite()`). At most one or two such arguments; `Option` if TS allows null.
  - The `createX(obj?: Partial…)` blobs go away in TS too.
  - **Approved defining-content arguments (user, 2026-10-21):** `AudioResource(buffer)`, `ImageResource(image)`, `BitmapFont(data)`, `ExternalImageResourceReference(uri)`, `BufferedLogSink(target)`, `RateLimitedLogSink(target)`, and the generic `Material` / `Material3D` / `Node3D` creators taking `kind`. **Rejected:** every `*Data(data: Partial<…>)` row (Sprite, Shape, Tilemap, QuadBatch, MovieClip, HtmlView, NativeText, RichText, TextLabel, BitmapText, ParticleEmitter), `BitmapText(glyphSource)`, and `basePath` (nullable, assigned after create).
- **Constructor arguments are principal judgment (user, 2026-10-22: "I'm okay with some constructors having arguments. Use good judgment").** Principal approves defining-content and configuration arguments per type without escalating. The test: keep an argument when construction derives state from it (validation, buffers, probes, merging), or when it is a required reference the object is defined by; plain authored fields still follow B (create, then assign). Requiredness follows TS. Each decision is recorded below.
- **Per-type construction dispositions (principal, 2026-10-21/22; applying D23/D24 during the sweep):**
  - **Existing source seams kept as the construction pair (no new create / dispose):** lazily attached signal groups (`enable_*` on the owner); `create_global_shortcut(accelerator)` (accelerator is defining content; fallible outcome); surface `allocate_surface` / acquisition; tray per-arm `initialize_tray_create_*`; `FileDialogHandle` provider construction; `ShellProcess` and `HostIpcTargetedSendCapability` provider seams.
  - **Additional defining content:** `create_memory_log_sink(capacity)`; `StatechartInstance(chart)`; `VideoImageResource(source, version)`; Physics2D ABI buffers `(capacity)` / `(byte_capacity)`; the generic `Node(kind)` (options removed); spatial index `create_/initialize_spatial_index(_3d)(backend: Option<…>)` (provider seam).
  - **Defining content / provider seams (2026-10-22):** `create_render_proxy(state, source)` / `RenderProxy2D` (the bound source node is defining content; `state` is D5 context; the renderer binding and `createData` stay in construction); `create_socket(options)` is a provider construction seam (it opens the host socket; `url` stays required), like `ShellProcess`.
  - **GlyphAtlas (user, 2026-10-22, "for now"):** keeps `create_/initialize_glyph_atlas(options: &GlyphAtlasOptions)`, its own configuration type, with TS requiredness (font family / size, width, height, rasterizer required; style, weight, padding and cache limits optional with TS defaults). A per-type decision, not a general "configured entity" category; other such cases still go to the user.
  - **Animation (principal, 2026-10-22):** derived-construction types keep their source arguments with TS requiredness: `AnimationClip(channels, duration?, events)`, `AnimationCrossfade(from, to, duration, options)`, `SampleAccumulator(components, quaternion)`, `AnimationBlendTree(inputs)`, `AnimationStateMachine(states, initial_state)`, `AnimationLayerStack(layers)`, `RootMotionExtractor(clip, index)`. Required-reference records keep only the reference: `AnimationChannel(track, target)`, `AnimationPlayer(clip)`, `BlendTreeInput(player)`, `StateMachineState(blend_tree)`; their plain fields (player options, `weight`, `additive`, `name`) are assigned after create, with TS defaults.
  - **Adjustments (principal, 2026-10-22):** the whole adjustment family is (C), as the D23 (C) text already names it: each `create_*_adjustment(options)` / `initialize_*_adjustment(out, options)` keeps its source options and derives its state (color matrix, transform, LUT capture) at construction, exactly as TS. Not converted to B; the source pixel-output tests are the contract.
  - **InputKeyRepeatTimer (principal, 2026-10-22):** keeps `create_/initialize_input_key_repeat_timer(options: &InputKeyRepeatOptions)` with `delay` and `interval` required (TS has no defaults); the start/stop closures are derived at construction; no public delay/interval fields are added.
  - **Standing reading of the test:** a type that derives private state or closures from its arguments at construction and exposes no public fields for them keeps its source constructor arguments and their requiredness. Converting it to B would invent public fields, defaults or recomputation, which is out of scope. Builders apply this without asking.
  - **ParticleEmitterConfig (principal, 2026-10-22):** plain configuration record, (C). TS `createParticleEmitterConfig(obj?: Partial<…>)` merges independently omitted fields with defaults, so Rust takes `options: Option<&ParticleEmitterConfigOptions>` where every field is `Option` (the D23 (C) form) and returns the full `ParticleEmitterConfig`; accepting a whole `ParticleEmitterConfig` is not equivalent. No initializer (not an Entity).
  - **(C) exception:** `BufferedLogSink` / `RateLimitedLogSink` take `target` plus their source options; fields TS requires without a default stay required.
  - **(B), zero fields:** `LogContext`, `LogSpan`, `FlightDocumentRefusalExplanation`, `Host` before its D26 removal.
  - **Content constructors (return, D24):** `create_mesh_geometry(options)` with its full-field `initialize_mesh_geometry(out, fields)` seam; `RequirementSet` (normalizing) and `RequirementCodegenPlan`; `create_tween_stagger` (fresh tweens); scene3d-formats `create*TextureRef`, `createScene3DFrom*`, `externalObjTexture`, `buildBinaryStl`; `create_array_buffer` / `create_array_buffer_view`.
  - **Shared identity kept:** node color adjustments `Option<Ref<Vec<AdjustmentRef>>>` (TS identity test), Skeleton joints.
  - **I/O results return:** async `get_permission_states`, `move_shell_items_to_trash`, `find_files`.
- **Classification rules (user, 2026-10-21; the construction table's digest):**
  - An Entity is a type whose Rust source carries the entity runtime (directly, through an embedded `*Fields`, or through an `impl_*` family macro). A TS union is not an Entity because one member is.
  - An options-shaped Entity stays (B); it moves to (C) only by user decision.
  - Non-Entity status alone does not make a type (A); `*Ref` / `*State` / `*Runtime` / `*Fields` records need independent evidence of value semantics.
  - `dispose_x` is required only where detach work is evidenced (hierarchy, signals, subscriptions, native handles), not from field names alone.
  - Entity copy/clone defaults to **no**; it is kept where TS already exports it (D0) or where the user approves a family.
- **(C) Configuration objects** (context attributes, loader / codec / sink settings, descriptors whose construction derives state, e.g. adjustments) take `options: Option<&XOptions>`, where **every field is `Option`** and "not given" means the documented default.
- **Copy and clone:**
  - `copy_x(out, source)` copies all public fields into an existing object (out first, D9). It is the primitive and doubles as field assignment from another object.
  - `clone_x(source) -> X` = allocate + copy.
  - Both are always provided for value types. For entities, only for user-approved candidates (plain descriptors without hidden runtime state). **Never** for scene nodes or anything with hierarchy, runtime caches, or signals.
  - `copy_*` never copies the private runtime.
- **Lint:** tests may use `..Default::default()` inside options literals.

**initialize_* (approved): the `super()` call of the hierarchy.**
- `initialize_x` remains the **public per-layer construction seam**: the D12 single allocation at the most-derived `create_*`, and custom kinds chaining their base layer (D2 open families).
- Its arguments mirror its `create_*` minus allocation: none for (B), options for (C).
- It is **construction-only, not a reset**. Resetting is a separate verb, where a real need exists.
- **Kept for value types too** (user): `initialize_x` and `set_x` both exist and one delegates to the other, as `new()` delegates to `create_*`. Uniformity beats removing the redundancy.
- **Construction is mechanical:** every entity type has `create_x` / `initialize_x` in the contract lane, uniform and boring.
- **`dispose_x` is a stock verb where it applies,** like `clone` / `copy` / `set`: only for types that hold something to detach (listeners, subscriptions, signals, hierarchy, render state), as TS does today. There are no no-op disposes. `destroy_x` likewise only frees native resources.
- Rust users may use the sugar instead (`X::new(…)` → `create_x`, D18); free functions remain the contract and the transpile source.

## D22 Tween targets — APPROVED (user, 2026-10-21)

**Tweens are strictly typed, checked at compile time, and statically dispatched.** A tween works on any object (SDK or user types) with no pre-registration.

- **`Tween<T>` targets a `Ref<T>`** for any `T`. TS `createTween<T extends object>(target, duration, propertyMap: NumericProps<T>, options)` keeps its shape and order.
- **Property map → a typed list of accessors:** `&[TweenProp<T>]`, where `TweenProp<T> { get: fn(&mut T) -> &mut f32, to: f32 }`.
  - `tween_prop!(x, 100.0)` expands to `TweenProp { get: |t| &mut t.x, to: 100.0 }`, with `T` inferred from the target. A misspelled or inaccessible field, or a non-numeric one, is a **compile error**.
  - `tween_with(|t: &mut T| &mut t.a.b, 10.0)` is the escape hatch for nested or computed paths.
  - Accessors are **plain `fn` pointers** (non-capturing): no string lookup, no hashing, no boxed dynamic dispatch, no reflection at runtime.
- **TS lowering:** the list transpiles to the plain property map `{ x: 100 }`. The TS API is unchanged.
- **Out of scope:** naming a property by a runtime string (e.g. loaded from data). Rust has no reflection; add a user-registered accessor table later only if a real use appears.
- The restricted map-target exception (option b) is withdrawn. Color tweens follow the same pattern.

## D16 Scene nodes — APPROVED (user, 2026-10-21)

**API philosophy (user):** a node behaves like a raw struct. You read and write bare fields, then optionally call `invalidate*` explicitly. There are no getters or setters that auto-invalidate. TS's split between `sprite.*` and `sprite.data.*` exists only to keep object shapes stable; conceptually it is one object.

- **One struct per kind, composed with the family's base fields.** `pub struct Sprite { node: Node2DFields, pub data: SpriteData }`, with `Deref`/`DerefMut<Target = Node2DFields>`. So Rust reads `sprite.x` and `sprite.data.texture`, exactly like TS (and C++ `class Sprite : public Node2D`).
- **A trait for "any node of the family":** `trait Node2D` (TS `Node2D`, C++ base-class pointer).
  - Mixed children: `Vec<Ref<dyn Node2D>>`.
  - Parameters: `&dyn Node2D` or `T: Node2D`.
  - Upcasting `Ref<Sprite>` → `Ref<dyn Node2D>` is free and keeps the same identity.
  - Base fields work on `dyn Node2D` through `Deref`. Kind fields need the concrete type (as in TS, where you cast first).
  - Renderers, looked up by kind (D2), view the concrete struct inside the borrow.
- **Rename `*Traits` → `*Fields`** (`NodeFields`, `Node2DFields`, `Node3DFields`; generic `Node<Fields>`), in Rust **and TS**. This is an approved D0 rename, about 45 TS files. "Traits" means behavior in Rust and type traits in C++. The `Has*` field groups (`HasTransform2D`, `HasAppearance`, …) keep their names and become structs composed into `*Fields`.
- **Feature traits:** `Node` (any node, 2D or 3D: hierarchy), `Transform2DNode`, `BoundsNode`, etc. are Rust traits used as bounds, mirroring the TS feature types.
- **Access pattern:** borrow once, then use raw fields, then invalidate explicitly:
  ```rust
  let mut s = sprite.write();
  s.x = 10.0; s.y = 20.0;
  s.data.texture = Some(texture);
  invalidate_node_local_content(&mut s);
  ```
  The `.write()` / `.read()` borrow is the only Rust-specific step; it is required by safe shared mutation (`Ref<T>` = `Arc<RwLock<T>>`).
- **Construction:** `create_sprite(Some(&PartialSprite { … }))` mirrors TS `createSprite(PartialNode<Sprite>)`. Sugar may add a `Sprite::new(..)` that delegates to it. **No property getters or setters in sugar.**
- **Runtime:** private. `Node2DFields` holds the private `Node2DRuntime` tier (containing the `NodeRuntime` tier and the entity binding/uid). Kind runtime extras (e.g. `SpriteRuntime`'s texture-cache fields) are private fields of the kind struct, reached by `get_sprite_runtime`-style internal functions.
- **Custom kinds:** a user either reuses a kind and changes `kind`, or declares their own struct (`node: Node2DFields` plus data) and implements `Node2D` / `Entity`, through helper macros such as `impl_node2d!`.
- **General family pattern (principal, 2026-10-21):** the same shape applies to every open family with heterogeneous collections, not only nodes. Examples: adjustments (`AdjustmentFields` + per-kind structs + `trait Adjustment`, stacks of `Ref<dyn Adjustment>`, structural dispatch through the trait, cache key from a deterministic serialization of public fields, mirroring TS `JSON.stringify`) and effects.
- **Supersedes, for nodes, the "erased data slot" mechanics of D2** (`AnySlot` + `get_*_data`). D2's principles stand: open kinds, dispatch tables, no switch. `agents/sketches/scene2d-sprite.md` is superseded.
- **Vocabulary rows to add:** `Ref<dyn Node2D>` (and the other family / feature traits) → TS base type → C++ base-class `shared_ptr`. Kind struct with `Deref` to `*Fields` → TS `interface X extends Node2D`.

## D17 Native render paths — APPROVED (user, 2026-10-21)

- **Bindings:** the `wgpu` crate (WebGPU-shaped; native Vulkan, Metal, DX12) and the `glow` crate (WebGL2/GLES-shaped; native desktop GL and GLES), as flight-rs-native used. The TS renderers are built on WebGPU and WebGL2, so the Rust render code tracks them nearly line for line.
- **Transpile:** a small vocabulary of external types and calls.
  - wgpu: `wgpu::X` ↔ TS `GPUX` ↔ C++ Dawn / wgpu-native `wgpu::X` (webgpu.h).
  - glow: `glow::Context` methods ↔ TS `WebGL2RenderingContext` methods ↔ C++ raw GL calls.
- **GPU objects come from the host and are passed in.** The SDK never creates windows, devices, or contexts; `create_wgpu_render_state(device, queue, …)` and its GL equivalent take them. In Rust a native host provides them (future work).
- **The GL path is single-threaded:** a GL context is thread-bound (`glow::Context` is not Send). This is a forced exception to the thread-safe default. The wgpu path stays Send + Sync.
- **Shaders are shared verbatim:** WGSL works unchanged with the wgpu crate. GLSL ES 3.0 needs only a version-header swap on desktop GL. Shaders remain string constants.
- **Render API shape (user, 2026-10-21; checkpoint before L11):**
  - **The render walk is generic over the backend state:** `prepare_scene2d_render<S: RenderState>(state: &mut S, …)`. Each backend has its own typed renderer table, so a GL renderer receives `&mut GlRenderState` with no downcast. TS mirrors it as `NodeRenderer<S extends RenderState>`.
  - **Render proxies live beside the state, not inside it:** the walk passes `&mut state` and `&proxy` separately; the `proxy.next` linked list becomes an ordered `Vec` (D3). Internal machinery only.
  - **Registries are shared copy-on-write:** derived pipelines hold the parent's tables behind `Arc` and copy a table only when they register into it.
  - **Backend-specific fields** (e.g. Canvas `canvasHost`, `canvasShapeCommands`) leave the shared `RenderState` (cycle-breaking ruling).
- **GPU resource cleanup (user, 2026-10-21):** explicit `destroy_*` / `destroyData` stays the contract on both backends (TS parity; frees now). In Rust and C++, a destructor is also a safety net, following the user's native pattern:
  - **GL:** dropping a GL resource without destroying it pushes its raw handle onto the owning render state's deferred-delete queue (`Arc<Mutex<Vec<…>>>`, Send). The GL render state drains the queue at the start of each frame, and in `destroy_*_render_state`, on the GL thread. On context loss the queue is cleared (the handles are already invalid).
  - **wgpu:** `Drop` already defers destruction until the GPU has finished with the resource; explicit `destroy()` remains available for immediate release.
  - **TS:** no destructors; explicit destroy plus browser GC of WebGL/WebGPU wrappers, as today.
  - **Draining is its own free function** (bedrock): `flush_gl_delete_queue(state)`. The GL render-pass entry points call it at their start (the earliest point known to be on the GL thread with the context current; with several passes per frame the end of the frame is not knowable to the SDK). An app that knows its frame end may also call it there.
- **Render proxies are passed explicitly (user, 2026-10-21):** the proxy store lives beside the state and is an argument to `prepare_scene2d_render`, the `render_*_scene2d` entry points and `dispose_scene2d_render`. TS is a mechanical transpile of the Rust, so TS gets the same signatures.
- **wgpu native narrowing (principal, 2026-10-22):** render-wgpu owns the native payloads behind the D26 handles; TS signatures and failure protocols are unchanged.
  - `WgpuDevice` narrows to `WgpuNativeDevice { device: wgpu::Device, queue: wgpu::Queue }`. A foreign payload is a programmer error (TS types forbid it), so `create_wgpu_render_state` stays non-null and panics with a named message (D10), not `Option`.
  - `WgpuSurfaceContext` narrows to `Arc<dyn WgpuCanvasContext>`, a Send + Sync trait mirroring the three `GPUCanvasContext` members the source uses (`configure`, `get_current_texture`, `unconfigure`) plus the native-only `present`. Implemented for `wgpu::Surface<'static>` and by test fakes. The acquired frame (`SurfaceTexture`) is held by the screen target from acquisition until it is presented, exactly once, after submit, at the end of the screen frame; in TS `present` lowers to nothing. Native acquisition errors: `Timeout` / `Outdated` skip the frame (`Outdated` also reconfigures before the next acquire); `Lost` follows the device-lost path; `OutOfMemory` panics. These are native-only additions, logged in api-drift.
  - Device loss: `GPUDevice.lost` is a promise stored on the device, so it maps to a D20 `SharedFuture<WgpuDeviceLostInfo>` owned by `WgpuNativeDevice`. Whoever constructs the `WgpuNativeDevice` (the host provider, or a test) registers wgpu's lost callback at that moment, before any loss can occur, and the callback resolves the shared future once. An observer that subscribes after the loss still gets exactly one notification with the recorded reason, as in TS (PROBE6). No process-global registry.
  - Loss observers (`lost.then(handler)` in TS) run through the host's `HostSpawnCapability` (the D15 / D20 fire-and-forget mapping): observing spawns `async { lost.await; handler }`. The host drives it promptly, like a microtask, with no render-frame coupling; an observer of an already-resolved loss is still notified once, after the current synchronous code, never synchronously inside `observe`. Tests use a spawn capability that queues tasks and drains them where TS would run microtasks.
  - Pass-through slots for unported backend types (effects, passes, mesh-material, modifiers, skinning, velocity, shape, color feature): `UnknownValue` is allowed temporarily only where render-wgpu stores, copies or returns the value by identity and never invokes it. Each becomes its typed contract when the owning crate (effects-wgpu, scene2d-wgpu, scene3d-wgpu) ports, as part of that crate's acceptance. A slot render-wgpu invokes needs its type now.
  - External image upload: native wgpu has no `copyExternalImageToTexture`, so `HostImageSource` narrows to `Arc<dyn WgpuExternalImageSource>` (Send + Sync): width / height, readiness, and `copy_to_texture(queue, texture, premultiplied_alpha) -> Result<(), WgpuExternalCopyError>`. `NotReady` and `CopyFailed` map to the source's `false` (retry later); every other error panics, as the source rethrows. Host implementations come with the native hosts (D19); test fakes now.
- **Tests:** wgpu tests may render for real on a headless software adapter (lavapipe in CI). GL tests use a headless context (EGL + Mesa llvmpipe), or keep mock-style tests where the TS test is a pure call-sequence check.

## D18 Sugar layer and review flow — APPROVED (user, 2026-10-21)

**Sugar** is Rust-only convenience over the contract. It is never transpiled and never contains logic.
- **What it is:**
  - methods that delegate to the free functions (`v.add(&o)` → `add_vector2`; `m.invert()` → `inverse_matrix`);
  - convenience constructors (`Sprite::new(…)` → `create_sprite`, `Vector2::new(x, y)` → `create_vector2`);
  - the D16 `Deref` access to `*Fields`;
  - operator traits (`Add`, `Mul`, …) only where a TS function has exactly that meaning, and they also delegate.
- **What it is not:** property getters or setters (D16 raw-struct API), auto-invalidation, logic, or new behavior.
- **Coverage:** every **public-lane** type (TS `index.ts`) gets sugar mirroring its public functions that take that type as the primary (out or first) argument. Contract-only items get none (D6, D13).
- **Naming:** method names drop the type name from the free function (`add_vector2` → `add`, `get_rectangle_width` → `width`). Constructors use `new` / `from_*`. Collisions are resolved by keeping the fuller name.
- **Tests:** small inline `#[cfg(test)] mod sugar_tests` in each sugar module. Each method gets one test that calls it and compares the result with the free function on the same inputs. These are separate from the TS-mirrored `tests/` directory.
- **Lint:** the existing `sugar-delegates` rule (impl methods must call a free function, no loops) enforces delegation.

**Review flow:** do not block on user approval of API manifests. Builders follow the rulings and the checklist, and the user reviews afterwards.
- Manifests are written by integration when a crate passes the gates (`manifest --write`).
- Principal summarizes exceptions per wave for after-the-fact user review.
- Frozen-manifest protection applies once the user has reviewed a crate. Until then, manifest changes need no approval.

## D19 Native hosts, software 2D, text — APPROVED (user, 2026-10-21)

- **`host-*` crates are capability providers:** one library each. Each provides only the capability records its library covers. The app assembles its `Host` per capability (mix and match: SDL windows + OpenAL audio, …). No adapter assumes it is the whole host. Host adapters are Rust-only implementations and are never transpiled.
- **Naming rule (Rust is the IR):** name a crate for the API or library it represents across targets, not for the Rust port that implements it. E.g. `host-harfbuzz` is implemented in Rust with HarfRust and skrifa, and in C++ with HarfBuzz.
- **Windows, input, and event loop:** `host-winit` (Rust-only by nature) and `host-sdl` (SDL3; also C++). The older flight-rs-native host code predates the capability seams and is reference only.
- **Audio and other native capabilities:** `host-openal`, `host-fmod`, `host-cpal`, …, as needed. **`host-icu`** (ICU4X, pure Rust) provides HostIntlCapability.
- **Software 2D:**
  - **tiny-skia now:** `scene2d-tinyskia` plus `host-tinyskia`, which provides the 2D context and surfaces, including the ShapeRasterizer used by gl and wgpu. tiny-skia-cpp is a lead for the C++ port (unverified).
  - **Skia if it works out:** `scene2d-skia`, `effects-skia`, `host-skia` (`skia-safe` mirrors C++ Skia).
  - **cairo:** deferred. `cairo-rs` links the system library, and cairo is in maintenance mode.
  - `scene2d-canvas` stays TS-only.
- **Text:** `host-harfbuzz` implements HostTextShaperCapability (shaping, glyph index, metrics, extents) and the font glyph outline source. HarfBuzz ≥ 4 draws outlines natively (`hb_font_draw_glyph`) and needs no FreeType. Rasterization is done by tiny-skia / Skia / the glyph atlas. An optional `host-freetype` comes later, only if hinting or bitmap / color-bitmap fonts are wanted.
- **Native provider plan** (user's prior native stack mapped to Flight seams, 2026-10-21):
  - **Name by library** where the library's API is the point: `host-sdl`, `host-openal`, `host-curl`, `host-harfbuzz`.
  - **Name by format** for codecs: `host-png`, `host-jpeg`, `host-vorbis`, `host-webm`. These implement the per-format decode/encode capabilities; Rust uses pure-Rust crates (png, zune-jpeg, lewton) and C++ uses libpng / libjpeg-turbo / libvorbis / libvpx.
  - **Prefer pure-Rust implementations;** bind C only where the library *is* the feature (SDL, OpenAL, curl).
  - `host-sdl` uses Cargo features: windows, event loop, input, and gamepad by default; `audio` (the SDL audio device capability) is opt-in; `sound` (sdl_sound decode) is opt-in. Mojoal is a variant of `host-openal` over SDL audio. C++ exposes the same split as CMake options.
  - zlib and lzma are not needed: Flight's `compression` package implements deflate and LZMA.
  - **File dialogs:** `host-rfd` (Rust-only, like `host-winit`; native on Windows and macOS; XDG portal or GTK on Linux; its async API maps to the D15 async dialog capabilities). The C++ port uses tinyfiledialogs or native APIs. Low priority; schedule after the core waves.
  - Not now: file watching (efsw), cairo / pixman. HashLink and Neko are only relevant if Haxe output is targeted.
- **Scheduling:** after the core waves. Commission tiny-skia first.

## D13 Export lanes — APPROVED (user, 2026-10-21)

- **Contract lane = the free functions** (TS `contract.ts`, the full surface other packages use). In Rust: `flight_x::contract::*`, mirroring `@flighthq/x/contract`.
- **Public lane = the curated surface** (TS `index.ts`). In Rust: the crate root re-exports, plus Rust sugar (impl methods) for public types.
- Contract-only items get no sugar (D6).

## D1 Numerics — APPROVED

- f32 is the default for all value types.
- f64 is used only where precision is required, and every such use is declared. Each crate lists its f64 types and functions with a one-line reason in a `## Precision` section of its README. Lint enforces this (see D7).
- Likely f64 candidates, each needing confirmation per crate: path-boolean kernels (robust predicates), path signed area and tessellation, timestamps and durations (log, signals timers), and collision only where a test shows f32 fails.
- Indices are `usize`. `i32` is used only where TS uses a `-1` sentinel.
- **Test bounds at public f32 (principal, 2026-10-21; standing rule, applied by builders without escalation).** TS asserts against f64 results; a Rust test of a public f32 value uses, with `ε = f32::EPSILON` (≈1.19e-7):
  - **Single evaluation:** `|actual − expected| ≤ max(TS bound, 4·ε·max(1, |expected|))`. The TS bound is `0.5·10^-d` for `toBeCloseTo(x, d)` (default `d = 2`) and 0 for `toBe` / `toEqual` on floats. This admits only f32 rounding (a few ULP), never a formula defect.
  - **Accumulation over N steps** (integrators, recurrences, repeated round trips): `max(TS bound, N·ε·max(1, |expected|))`, with N the step count in the test.
  - Each such assertion carries the comment `// D1 f32 bound (TS: <original bound>)`. No drift entry per case; this rule is the record.
  - **Exact integer outputs** (packed colors, bytes, ids, counts, rounding results) are never bounded: they must match TS exactly. Where an early f32 intermediate changes an exact integer result that TS computes in `Number`, a **private f64 intermediate is pre-approved** (lossless promotion of the f32 inputs, same operation order, cast at the final write, per-item `allow(f64)` + README line).
  - Anything outside these (an error beyond the bound, or a public f64 need) still goes to principal with the measured value.

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
