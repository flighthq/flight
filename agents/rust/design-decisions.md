# Design Decisions (outside flight-geometry)

Each item is marked **APPROVED** (binding), **DIRECTION** (the goal is agreed, the mechanics are not yet), or **PROPOSED** (awaiting a ruling).

References: the TS source is `github.com/flighthq/flight` (`packages/<name>/src`), and the prior Rust port is `github.com/flighthq/flight-rs-native`. Both are cloned under `refs/`, beside `repo/`, in the principal workspace.

Baseline: 29 crates, `cargo test --workspace` 4525 pass / 0 fail, `cargo-flight-lint check` 3112 violations.

## D1 Numerics — APPROVED

- f32 is the default for all value types.
- f64 is used only where precision is required, and every such use is declared. Each crate lists its f64 types and functions with a one-line reason in a `## Precision` section of its README. Lint enforces this (see D7).
- Likely f64 candidates, each needing confirmation per crate: path-boolean kernels (robust predicates), path signed area and tessellation, timestamps and durations (log, signals timers), and collision only where a test shows f32 fails.
- Indices are `usize`. `i32` is used only where TS uses a `-1` sentinel.

Current state, to be reconciled: collision uses 820 f64 and 0 f32, path 654 f64, path-boolean 222 f64, and bitmap is mixed.

## D2 Open enums and additions — PROPOSED

TS has three patterns (see `refs/flight/packages/types/src`):
1. **Closed unions** for hot paths, such as particle forces, colliders and emitter shapes. TS comments say that registry dispatch would be too slow there.
2. **Open unions** (`'circle' | 'aabb' | … | (string & {})`), extended through `register*` Map registries. Last write wins. Vendor-prefixed names are used (`acme.Flow`). Built-ins are opt-in through `registerBuiltIn*`. Examples: collision shapes 2D/3D, layout kinds, log serializers.
3. **Structural/open base**, as in adjustments: `AdjustmentKind = string`, and dispatch keys off the data present, such as `colorMatrix` or a LUT.

Proposal:
- Closed TS union → closed Rust enum. The payload of each variant is a single named struct (`Circle(CollisionCircle2D)`), never anonymous fields.
- Open TS union → Rust enum of the built-ins plus `Custom(Custom<Name>)`. `Custom<Name>` carries `kind: String` (vendor-prefixed) and a payload. Dispatch for `Custom` goes through a registry keyed by kind, which is explicit state per D5.
- **Open question: the Custom payload type.** Options are an opaque handle (`u64`, resolved by the registrant; FFI-clean), a `Box<dyn Any>` (Rust-idiomatic, not FFI-clean), or a generic parameter. The recommendation is an opaque handle.
- No `From` impls on enums in the contract. Those may live in the sugar layer (D6).
- Closed enums that came from TS string literals keep a canonical string table (`*_to_string` / `parse_*` free functions) where TS exposes the strings.

flight-rs-native used `KindId(u64)` (a hash of `TypeId`, or an atomic counter) plus trait objects with `downcast_ref`. That is a Rust-only approach, not FFI-portable.

## D3 Maps — PROPOSED (largely agrees with user)

A survey of the TS (no test asserts key order) shows that most maps are key/value lookups only: layout resolvers, animation and mesh indexes, log serializer and rate-limit maps, and xml attribute lookups. HashMap is fine for these.

There are exceptions where TS iteration order reaches callers:
- **tween**: `Object.keys(propertyMap)` becomes the public `tween.properties[]` and sets the order of property writes. `manager.tweens: Map<target, Tween[]>` sets the order in which `onUpdate`/`onComplete` callbacks fire and in which `stopAllTweens` completes. The Rust `HashMap<usize, Vec<Tween>>` fires callbacks in **random order across runs**.
- **log**: JSON/text formatter output follows key insertion order (context fields, then span fields, then data).

Proposal: HashMap is allowed for lookup. Anything whose iteration produces output, callback order or a public array must iterate deterministically. Use a `Vec` (or `Vec<(K, V)>`) for order, plus a HashMap index if lookup is hot. This matches flight-rs-native, which has no IndexMap and keeps order with Vecs. Lint: forbid iterating a HashMap (D7).

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

## D5 Hidden state — DIRECTION

Agreed: hidden semantic state is a problem. An internal cache that does not affect results is acceptable. Thread safety must be considered.

Inventory: thread_local/static exists in log (sinks, levels, spans, clock), signals (timer queue, `SystemTime::now`), entity (uid counter, write guards), statechart, flow, textbidi and textsegment (each with private log copies), tween (default manager), and easing (a `Mutex` guard).

Proposed mechanics:
- Semantic state (registries, timers, default managers, uid counters, log sinks/levels) moves into explicit state structs passed by the caller. Layout already does this (`LayoutState`). The clock is injected as a time parameter, never read inside the contract.
- Where TS has a module-global registry (collision `registerCollisionSupport2D`, log), the Rust contract takes an explicit state. TS/C++ transpile targets may add a module-level default instance as sugar. **Needs a ruling**, because the signatures will then differ from TS by one parameter.
- Caches with no semantic effect may stay internal. They must be marked `// flight-lint: allow cache`.
- Debug guard toggles: fold them into the state struct where one exists, otherwise allow them with a marker.
- Thread safety: contract value types stay plain data, so they are `Send + Sync` automatically. Shared mutable state uses no `Rc<RefCell>` in pub types. If sharing is needed, use `Arc<Mutex>` (as flight-rs-native does) or, preferably, handles into a state arena. **Needs a ruling: must contract state structs be `Send`?**
- All logging goes through flight-log. Crate-local log copies are removed.

## D6 Contract vs Rust sugar — APPROVED

- The **contract** is the free-function API. It is what crates use internally and what tests exercise. It is designed for FFI portability, so constructs that look redundant in Rust (`equals_rectangle`, `create_*`/`initialize_*`) are kept.
- **Rust sugar** (`impl` methods, operator traits, `From`, RAII guards) is optional and Rust-specific. It mirrors the *public* API only and delegates to the contract. Contract-only items (internal helpers, pools) get no sugar.
- Tests never call sugar. This is enforced today by `test-method-call`.

## D7 Lint direction — PROPOSED

The user is open to adding rules to enforce the direction mechanically. Candidate rules:

| Rule | Enforces |
| --- | --- |
| `f64-declared` | f64 appears only in items listed in the crate's Precision section (D1) |
| `enum-payload-named` | data variants hold exactly one named struct; no struct-variants (D2) |
| `no-dyn-any-in-contract` | no `dyn Any` in pub signatures or fields (D2/D4) |
| `no-rc-refcell-in-contract` | no `Rc<RefCell>` in pub types (D4/D5) |
| `no-hidden-state` | no `thread_local!`, `static` with interior mutability, or `SystemTime`/`Instant` without an allow marker (D5) |
| `no-hashmap-iteration` | no `.iter()`, `.keys()`, `.values()` or `for … in` on HashMap-typed bindings (D3; heuristic) |
| `sugar-delegates` | an impl method body calls the free function of the same name (D6) |
| `no-trait-impl-in-contract` | only `Default` and derives outside a `sugar` module (D6) |

The existing tooling must be fixed before it can gate:
- `conform`'s camel→snake conversion breaks digit acronyms (`Ray3D` → `ray3_d`). All 22 "missing" geometry functions are false positives.
- `conform` matches files by stem across all crates instead of only the target crate.
- `conform` compares names only. It should also compare parameter order (flight-rs-native requires this).
- The private-helper false positives in `test-coverage`/`fn-order`.

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
