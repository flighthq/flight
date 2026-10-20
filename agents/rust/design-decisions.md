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

## D4 Signals and type erasure — PROPOSED

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
