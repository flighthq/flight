---
package: '@flighthq/entity'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# entity — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/entity

**Session date:** 2026-06-24 **Starting score (first pass):** 78/100 **Estimated current score:** 95/100

## Implemented APIs (cumulative across both passes)

### Bronze (symmetric primitive surface)

- **`hasEntityRuntime(source: Readonly<Entity>): boolean`** — presence predicate for the lazily-created runtime slot. Lets callers guard `getEntityRuntime` before the non-null assertion.
- **`ensureEntityRuntime(entity: Entity): EntityRuntime`** — exposed get-or-create. The allocation logic previously trapped inside `attachEntityBinding` is now a first-class function. `attachEntityBinding` delegates to it.
- **`detachEntityBinding(entity: Entity): void`** — paired teardown for `attachEntityBinding`. Sets `runtime.binding = null`; no-op if no runtime exists. Closes the attach-without-detach asymmetry.
- **Fixed `runtime.test.ts` wording** — "has a null api slot" → "has a null binding slot".
- **Fixed `getEntityBinding`** — was calling `getEntityRuntime` (non-null asserting) and relying on `?.` to paper over `undefined`. Now reads `entity[EntityRuntimeKey]` directly, handling the no-runtime case correctly and safely.

### Silver (serialization, runtime-level accessors, typed binding)

- **`cloneEntity<Type extends Entity>(source: Readonly<Type>): Type`** — allocates a new entity copying the public data fields with the runtime slot reset to `undefined`. The clone is fresh and unbound; runtime and binding are not carried over.
- **`stripEntityRuntime<Type extends Entity>(source: Readonly<Type>): EntityWithoutRuntime<Type>`** — strips the `EntityRuntimeKey` slot from a copy, returning a plain serializable object. Uses the existing `EntityWithoutRuntime<Type>` type from `@flighthq/types`.
- **`getEntityRuntimeBinding(runtime: Readonly<EntityRuntime>): object | null`** — runtime-level binding accessor (vs entity-level `getEntityBinding`). Mirrors the Rust crate's `get_entity_runtime_binding`. Useful for subsystems that already hold a runtime.
- **`hasEntityBinding(source: Readonly<Entity>): boolean`** — `has*` companion to `getEntityBinding`. Answers "is this entity bound to a host object yet?" without materializing the binding.

### Gold (typed binding, dev guards)

- **`getEntityBindingAs<T extends object>(source: Readonly<Entity>): T | null`** — typed binding read path. No runtime type check; the caller is responsible for knowing T. Avoids unchecked casts in OOP/host wrappers. Keeps the untyped `getEntityBinding` as the base.
- **`areEntityRuntimeGuardsEnabled(): boolean`** — companion predicate for the guard mode.
- **`createGuardedEntity<Type extends object>(entity: Type & Entity): Type & Entity`** — returns a Proxy that warns when `EntityRuntimeKey` is written directly, bypassing `ensureEntityRuntime`/`attachEntityBinding`. No-op when guards are off or `Proxy` is unavailable.
- **`createGuardedEntityRuntime(runtime: EntityRuntime): EntityRuntime`** — returns a Proxy that warns when `runtime.binding` is written directly, bypassing `attachEntityBinding`/`detachEntityBinding`. No-op when guards are off.
- **`enableEntityRuntimeGuards(): void`** — opts the process into guard mode. Fully tree-shakable: never called at module top level, has no side effects on import, preserves `"sideEffects": false`.

### Second pass (conformance map)

- **Recorded `getEntityRuntime` asserting-vs-Option divergence in `tools/agents/docs/rust/conformance.md`** — intentional TS/Rust seam divergence documented under "Intentional value-type seam divergences". TS keeps the non-null asserting form (paired with `hasEntityRuntime`); Rust uses `Option<&EntityRuntime>`.
- **Recorded `get_entity_runtime_mut` intentional TS omission in `tools/agents/docs/rust/conformance.md`** — Rust exposes a mutable-borrow accessor for borrow-checker ergonomics; TS mutates the slot object directly and has no need for a separate mutable accessor. Recorded so the conformance checker does not report it as a coverage gap.
- **Audited `@flighthq/node` for inlined lazy-runtime patterns** — `createNode` eagerly assigns `runtimeFactory()` directly to `[EntityRuntimeKey]` (not lazy), which is correct. No inlined `if (entity[EntityRuntimeKey] === undefined)` patterns found outside `entity/src/runtime.ts`. The node package already uses `getEntityRuntime` from `@flighthq/entity` for runtime access after creation. No changes needed.

## Source files

| File | Role |
| --- | --- |
| `packages/entity/src/binding.ts` | `attachEntityBinding`, `detachEntityBinding`, `getEntityBinding`, `getEntityBindingAs`, `getEntityRuntimeBinding`, `hasEntityBinding` |
| `packages/entity/src/binding.test.ts` | Tests for all binding functions |
| `packages/entity/src/clone.ts` | `cloneEntity`, `stripEntityRuntime` |
| `packages/entity/src/clone.test.ts` | Tests for clone and strip |
| `packages/entity/src/entity.ts` | `createEntity` |
| `packages/entity/src/entity.test.ts` | Tests for createEntity |
| `packages/entity/src/guards.ts` | `areEntityRuntimeGuardsEnabled`, `createGuardedEntity`, `createGuardedEntityRuntime`, `enableEntityRuntimeGuards` |
| `packages/entity/src/guards.test.ts` | Tests for guard functions |
| `packages/entity/src/index.ts` | Root barrel export |
| `packages/entity/src/runtime.ts` | `createEntityRuntime`, `ensureEntityRuntime`, `getEntityRuntime`, `hasEntityRuntime` |
| `packages/entity/src/runtime.test.ts` | Tests for runtime functions |

## Test results

5 test files, 45 tests — all passing. Entity package typechecks clean.

## Design choices made

### `getEntityRuntime` stays asserting in TS

The TS contract is `Readonly<EntityRuntime>` with a non-null assertion (`!`). The Rust crate returns `Option<&EntityRuntime>`. This is an intentional divergence:

- TS stays asserting because callers that reach `getEntityRuntime` always know a runtime exists (they either called `ensureEntityRuntime` or `attachEntityBinding` first, or they are node-level code that knows nodes always have runtimes). The `hasEntityRuntime` predicate is the guard for any caller who is unsure.
- Rust uses `Option` because borrow-checker ergonomics make it more natural than a separate `has_entity_runtime` check.
- The divergence is documented in `tools/agents/docs/rust/conformance.md` and does not affect behavior.

### `get_entity_runtime_mut` intentionally omitted in TS

Rust exposes this for borrow-checker ergonomics. TS mutates the slot object directly (via `entity[EntityRuntimeKey]!.field = value`). Adding a TS counterpart would be surface without purpose. Documented in conformance map.

### Guard mode is module-level mutable

`_guardsEnabled` is a `let` at module level in `guards.ts`. This is intentional: `enableEntityRuntimeGuards()` is meant to be called once per process at startup, not toggled. In Vitest, module isolation means each test file starts with guards disabled, which is the correct default for test isolation.

### `createGuardedEntityRuntime` cast

The Proxy set trap uses `(target as unknown as Record<string, unknown>)` to avoid a TS error since `EntityRuntime` is a closed interface. This is expected and documented in the source.

### `isSameEntity` not added

No consumer needs it — `===` is the documented identity contract. The depth review's "only add if a real consumer surfaces it" recommendation was followed.

## Deferred items

### `enableEntityGuards()` convenience in `@flighthq/node` (cross-package, deferred)

The first-pass roadmap suggested a convenience `enableEntityGuards()` in `@flighthq/node` that calls `enableEntityRuntimeGuards()` and any node-tier guard functions. This is a cross-package change (out of scope for this entity session). Node-level guard wiring would belong in a `guards.ts` in `@flighthq/node`. Deferring to a node session.

### Serialization integration (blocked on future layer)

`stripEntityRuntime` is the canonical strip path for serialization, but no scene serializer exists yet. When the versioned migration serializer (described in `types-layout.md`) is built, it should call `stripEntityRuntime` on every entity before serializing. This is not an entity-layer gap — the function is ready; it needs a caller.

### TS↔Rust conformance behavioral pass (out of scope for entity session)

The Rust crate `flighthq-entity` exports `ensure_entity_runtime`, `get_entity_runtime` (as `Option`), `get_entity_runtime_mut`, and `get_entity_runtime_binding`. The TS surface now matches the Rust surface for the named functions except for the documented intentional divergences. Porting the TS test assertions into the Rust `#[cfg(test)]` modules is pending Rust-worktree coordination.

## Score estimate

**95/100** — the entity primitive is now complete and authoritative for its domain. The package covers the full Bronze/Silver/Gold roadmap from the maturation review. The remaining 5 points are:

- 2 points: TS↔Rust conformance behavioral pass (assertion-ported Rust tests) — pending Rust-worktree work, not a TS gap.
- 2 points: `enableEntityGuards()` convenience integration in `@flighthq/node` — deferred cross-package.
- 1 point: Serialization layer integration — blocked on a future session building the scene serializer.

None of the deferred items are TS implementation gaps in the entity package itself. The package is feature-complete for its domain.
