# Design Decisions (outside flight-geometry)

Status: **PROPOSED — awaiting user rulings.** Nothing here is binding until marked APPROVED.

Survey basis: 29 crates, `cargo test --workspace` 4525 pass / 0 fail, `cargo-flight-lint check` 3112 violations.

## D1 Numerics

| Crate | f32 | f64 | Notes |
| --- | --- | --- | --- |
| geometry | 811 | 1 | precedent: f32 |
| collision | 0 | 820 | own f64 shape types; no geometry Vector use |
| path | 34 | 654 | uses geometry Vector2 with 34 `as f32` casts |
| path-boolean | 0 | 222 | f64 |
| bitmap | 243 | 222 | mixed |
| mesh | 321 | 35 | 66 `as f32` |

Proposal: f32 is the default for value types (geometry, color, easing, tween, particles, layout). f64 is allowed only where the algorithm needs it (boolean ops, robust predicates, signed area, time/timestamps), and each crate's README must say so. Indices are `usize`; `i32` only where TS uses a `-1` sentinel.

Open: should collision be on f32 to share geometry types?

## D2 Enums

Patterns found:
1. Closed C-like enums (`EulerOrder`, `BitmapEdgeMode`, `FlexLayoutAlign`). These are fine.
2. Data-carrying tagged unions (`CollisionShape2D`, `ContainerStyle`, `ItemStyle`, `IndexBuffer`, `ParticleForce`). Payloads are sometimes named structs (`Circle(CollisionCircle2D)`), sometimes anonymous (`GridLayoutTrack::Fixed { size }`, `FlexBasis::Fixed(f32)`).
3. `number | string` unions with `From` impls (`RectangleId`, `StateRef`).
4. `Invalid` sentinel variants that model TS runtime validation (`ContainerStyle::Invalid`).
5. De-facto open enums: string-keyed registries (`LayoutState.resolvers: HashMap<String, LayoutResolver>`, `LayoutNode.kind: String`).

Proposal: allow tagged unions, but every payload must be a named struct (maps to C++ `std::variant<Structs…>`, TS discriminated union, Haxe enum). Do not use `From`/trait impls; use explicit `create_*` free functions. Each closed enum mapped from a TS string-literal union gets a canonical string table for round-tripping. Open enums use string-keyed registries; this needs a ruling.

## D3 Maps

Uses: tween property bags (`HashMap<String, f32>`), xml attributes (`HashMap<String, String>`), log records, layout resolver registry, internal lookup indexes in animation/mesh.

Problem: TS `Map` and object iteration preserve insertion order, and Rust `HashMap` does not. XML attribute order and log record key order are observable.

Proposal: use `HashMap` only for lookup indexes whose order is never observed. Where order is observable, use an insertion-ordered type (decision needed: `Vec<(K, V)>` for the most portable transpile, or an `IndexMap` dependency).

## D4 Type erasure and shared ownership

- signals: `SlotFn = Rc<dyn Fn(Rc<dyn Any>)>`, and emitted args are `Rc<dyn Any>`.
- entity: `binding: Option<Box<dyn Any>>` plus the generic `get_entity_binding_as<T>`.
- log: serializers are `Rc<dyn Fn(...)>`.
- `Rc<RefCell<…>>` graphs in signals (39), log (28), tween (11), animation.

Proposal: make signals generic (`Signal<T>`, which maps to TS generics and C++ templates) instead of `dyn Any`. Make entity binding generic or an opaque handle. Allow `Rc<RefCell>` only where TS semantics need shared mutable identity, and prefer index/handle-based ownership.

## D5 Globals

`thread_local!`/`static` state appears in log (sinks, levels, spans, `Instant`), signals (timer state, `SystemTime::now`), entity (uid counter, write guards), statechart, flow, textbidi, textsegment, tween (default manager), and easing (`Mutex` static guard).

Duplication: textbidi and textsegment each define their own `LogLevel`/`LogEntry`/sinks. statechart keeps its own `LOG_SINKS` even though it depends on flight-log.

Proposal: debug guard toggles may stay global. Stateful globals (timers, default managers, uid counters, clocks) become explicit context structs passed by the caller, with the clock injected. All logging goes through flight-log.

## D6 Methods / impls

Found `impl CollisionShape2D { fn kind }` and `From` impls. Proposal: no inherent or trait methods beyond `Default`/derives and the stub `new`, per the free-function rule.

## Lint baseline

The 3112 violations break down as test-module-coverage 1130, test-coverage 777, test-default-call 446, file-structure 397, fn-order 332, other 30. geometry has 39, mostly false positives on private helpers. The false positives have to be fixed before the lint can serve as a fleet gate.

---

# Fleet workflow proposal

1. **Frozen manifests (user-owned).** `agents/manifests/<crate>.api` (generated pub signatures and types) and `<crate>.tests` (test names). A parcel that changes a manifest is rejected unless the user approved that change.
2. **Protected tests.** Tests for approved crates (geometry first) are read-only for builders. A wrong test is escalated, not edited.
3. **One crate per builder.** No cross-crate edits. Shared-type changes go through principal.
4. **Gates per parcel:** workspace tests pass; zero new lint violations in touched crates (ratchet from the baseline); empty manifest diff; TS conformance for the crate.
5. **Roles:** builders implement, auditor checks against approved rulings and manifests, and integration lands the work.
6. **Pilot** one small crate (color or easing) end-to-end before scaling out.

Blocker: the TS reference (`C:\Development\flight\packages\…`) is not reachable from this sandbox, so conformance cannot run here.
