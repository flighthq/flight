# TS↔Rust Alignment: @flighthq/entity

**Verdict:** Tightly aligned — all 5 TS exports map 1:1 to `flighthq-entity` with correct snake_case and full type words, filenames track exactly; the only gap is four Rust-only additions (a borrow-checker/ownership accommodation) that are not recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `attachEntityBinding` (`binding.ts`) | `attach_entity_binding` (`binding.rs`) | None — 1:1, full type word preserved. |
| `getEntityBinding` (`binding.ts`) | `get_entity_binding` (`binding.rs`) | None. TS returns `object \| null`; Rust returns `Option<&dyn Any>` — sentinel→`Option` carried correctly. |
| `createEntity` (`entity.ts`) | `create_entity` (`entity.rs`) | None. TS is generic `<Type extends object>(obj?)` wrapping an arbitrary object; Rust returns a concrete `EntityData`. Mechanical (Rust has no structural-intersection generic), behavior-equivalent. |
| `createEntityRuntime` (`runtime.ts`) | `create_entity_runtime` (`runtime.rs`) | None — 1:1. |
| `getEntityRuntime` (`runtime.ts`) | `get_entity_runtime` (`runtime.rs`) | Minor behavioral nuance: TS returns `Readonly<EntityRuntime>` via a non-null assertion (`source[EntityRuntimeKey]!`) — caller-asserts-present; Rust returns `Option<&BaseRuntime>` (true sentinel). Rust is the safer shape and arguably the one TS should adopt; not a naming drift. |
| — (no TS export) | `ensure_entity_runtime` (`entity.rs`) | **Rust-only.** Lazy-init helper that exposes the TS inline `if (entity[EntityRuntimeKey] === undefined) { … }` block (private inside `attachEntityBinding`) as a public function. Justified — Rust callers need an owned `&mut` lazy-init entry point — but **not in the divergence map.** |
| — (no TS export) | `get_entity_runtime_mut` (`runtime.rs`) | **Rust-only.** The `&mut` counterpart of `get_entity_runtime`; TS has no mutable/immutable accessor split (JS references are mutable). Borrow-checker accommodation, **not recorded.** |
| — (no TS export) | `get_entity_runtime_binding` (`runtime.rs`) | **Rust-only.** Free-function wrapper over the `EntityRuntime::binding()` trait accessor. Redundant with `get_entity_binding` for most callers; **not recorded.** |
| — (no TS type export) | `EntityData` struct (`entity.rs`) | **Rust-only.** The concrete entity carrier. In TS, `Entity` is a structural interface (`@flighthq/types`) mixed onto any object via `EntityRuntimeKey`; Rust needs a nominal struct to own the `Option<BaseRuntime>` slot. Expected port shape, but the TS↔Rust modeling difference (symbol-keyed mixin → owned struct field) is **undocumented.** |

## In sync

- **Package→crate name** is identity (`@flighthq/entity` → `flighthq-entity`); no rename, correctly absent from `RENAMES`/`TS_ONLY`/`RUST_ONLY` in `scripts/rust-conformance.ts`. `entity` is a `FOLDABLE_DEPS` mechanical-translation target, so its outbound dependency edges are intentionally not gated.
- **Filenames track exactly:** `binding.ts↔binding.rs`, `entity.ts↔entity.rs`, `runtime.ts↔runtime.rs`, `index.ts↔lib.rs` (the conventional barrel rename). No basename drift.
- **All 5 TS exports are ported** with correct camelCase→snake_case and full unabbreviated type words (`Entity`, `EntityRuntime`, `Binding` never shortened).
- **Convention carry-over is clean:** sentinels → `Option` (`get_entity_binding`, `get_entity_runtime`); `Readonly`/const-by-default → `&` borrows, with `&mut` used only where mutation is deliberate (`attach_entity_binding`, `ensure_entity_runtime`, `get_entity_runtime_mut`). No teardown verbs apply (no `dispose_*`/`destroy_*`/`acquire_*`/`release_*` in this leaf), correctly mirroring TS.
- The runtime type layer is in the header crate as required: `Entity`/`EntityRuntime`/`BaseRuntime` live in `flighthq-types`, mirroring `@flighthq/types` `Entity`/`EntityRuntime`/`EntityRuntimeKey`.

## Suggested divergence-map additions

The four Rust-only symbols are legitimate ownership/borrow accommodations, but the map currently records nothing for `entity`. A short note would prevent a future audit from flagging them as silent drift:

> **`flighthq-entity` Rust-only additions.** `EntityData` (nominal struct replacing the TS `EntityRuntimeKey`-symbol structural mixin), `ensure_entity_runtime` (public lazy-init, inline-private in TS `attachEntityBinding`), `get_entity_runtime_mut` (the `&mut` accessor; TS has no mut/immut split), and `get_entity_runtime_binding` (free-fn wrapper over the `EntityRuntime::binding()` trait method). All are borrow-checker/ownership accommodations of the same data model; no new behavior.

This belongs alongside the existing per-crate notes in `tools/agents/docs/rust/conformance.md`. No map entry currently looks stale for this crate.
