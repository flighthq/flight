---
id: entity
title: '@flighthq/entity'
type: depth
target: entity
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/entity.md
  - tools/agents/docs/reviews/depth/entity.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 78/100; a faithful, well-conformed core entity/runtime/binding primitive, missing only a few symmetric members (no teardown verb, no presence predicate, no exposed get-or-create) rather than any whole domain.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum to make the primitive symmetric and safe to build on. All small, all in-package except the two type additions, which land in `@flighthq/types` first.

- **`hasEntityRuntime(source: Readonly<Entity>): boolean`** — presence predicate, the canonical companion to a lazily-created slot. Lets callers test before the non-null-asserting `getEntityRuntime`. (`@flighthq/node` already needs this guard pattern internally.)
- **`ensureEntityRuntime(entity: Entity): EntityRuntime`** — expose the get-or-create that is currently trapped inside `attachEntityBinding`. Make `attachEntityBinding` call it so the allocation boundary is explicit and reusable by other subsystems. This matches the Rust crate's already-shipped `ensure_entity_runtime`.
- **`detachEntityBinding(entity: Entity): void`** — paired teardown for `attachEntityBinding`, per the `dispose*`/`detach*` rule (the binding is a reachability link to a GC-managed object, so detach-to-GC, not `destroy*`). Sets `runtime.binding = null`; no-op if no runtime. Closes the attach-without-detach asymmetry.
- **Fix the stale `getEntityRuntime` contract.** Today it does `source[EntityRuntimeKey]!` (non-null assertion) but the Rust mirror returns `Option`. Decide and document the TS contract: either keep the asserting accessor (caller-knows-runtime-exists, paired with `hasEntityRuntime`) or return `EntityRuntime | null` to match Rust. Surface this as the design decision below.
- **Fix `runtime.test.ts` wording** — "has a null api slot" → "has a null binding slot"; the field is `binding`, not `api`.
- **Tests** for each new function, including the aliased/lazy cases: `ensureEntityRuntime` called twice returns the same slot; `detachEntityBinding` on a runtime-less entity is a no-op; `hasEntityRuntime` before/after `ensureEntityRuntime`.

### Silver

Competitive completeness for a core entity substrate: the serialization-without-runtime story, runtime-binding accessors that match the Rust surface, and a clone primitive. The runtime is explicitly non-serializable, so a mature core layer owns the helpers that strip it.

- **`cloneEntity<Type extends Entity>(source: Readonly<Type>): Type`** — allocate a new entity copying the public data fields while resetting the runtime slot to `undefined` (clone is a fresh, unbound entity, not a shared-runtime alias). Explicit `create*`-style allocation; documents that runtime/binding are intentionally not carried over.
- **`stripEntityRuntime<Type extends Entity>(source: Readonly<Type>): EntityWithoutRuntime<Type>`** — the runtime helper the depth review flags as missing for the existing `EntityWithoutRuntime<Type>` type. Returns a plain object with the `EntityRuntimeKey` slot removed, ready to `JSON.stringify` / hand to a serializer. (The `*Like` / serialize-without-runtime boundary lives here, not in every consuming package.)
- **`getEntityRuntimeBinding(runtime: Readonly<EntityRuntime>): object | null`** — runtime-level binding accessor (vs. the entity-level `getEntityBinding`), mirroring the Rust crate's `get_entity_runtime_binding`. Lets subsystems that already hold a runtime read the binding without re-walking the slot.
- **`hasEntityBinding(source: Readonly<Entity>): boolean`** — `has*` companion to `getEntityBinding`, for the common "is this entity bound to a host object yet?" check without materializing the binding.
- **Serialization round-trip discipline** — document and test that `stripEntityRuntime` ∘ re-`createEntity` reconstructs a valid unbound entity, and that `cloneEntity` of a bound entity yields an unbound clone. This is the cross-cutting invariant scene-graph serialization (the versioned migration model in types-layout) leans on.
- **`@flighthq/types` header alignment** — ensure `EntityWithoutRuntime`, the binding type (`object | null`), and any new accessor return types are all declared in `Entity.ts` first, so the full primitive shape is navigable from the header layer alone.

### Gold

Authoritative, AAA: nothing a domain expert building a runtime on this seam would find missing. Exhaustive symmetry, full edge-case/error handling, and strict 1:1 TS↔Rust conformance.

- **Strict TS↔Rust conformance pass.** The Rust crate (`flighthq-entity`) already exports `ensure_entity_runtime`, `get_entity_runtime` (as `Option`), `get_entity_runtime_mut`, and `get_entity_runtime_binding` — a superset of TS. Reconcile the two surfaces name-for-name and record any intentional divergence (e.g. Rust's `&mut`/`Option` borrow shape vs. TS's slot-mutation + non-null accessor) in the [conformance map](../../rust/conformance.md). Add the conformance-checker pairing so the surfaces cannot drift again.
- **`getEntityRuntimeMut` decision (TS side).** Rust exposes a mutable-borrow accessor because of borrow-checker ergonomics; TS mutates the slot object directly. Either intentionally omit it in TS (recording the divergence) or add a thin accessor for symmetry — decide deliberately rather than by omission.
- **Typed-binding generics.** Today `binding` is `object | null` and `getEntityBinding` returns `object | null`. Offer a typed read path — `getEntityBindingAs<T>(source): T | null` or a generic `getEntityBinding<T>` — so OOP/host wrappers recover their concrete binding type without an unchecked cast, mirroring Rust's `downcast_ref::<T>()`. Keep the untyped function as the base; the typed one is a convenience over it.
- **Entity equality / identity helper** — `isSameEntity(a, b): boolean` (reference identity over the public object) if any consumer needs structural-vs-identity disambiguation; only add if a real consumer surfaces it, otherwise document that `===` is the contract.
- **Frozen / debug-guard mode (dev-only, tree-shakable).** An opt-in `enableEntityRuntimeGuards()` that, in development, traps writes to runtime slots that bypass the `attach`/`ensure` functions (catches the canonical "writes landed on the wrong tree / raw slot poke" class of bug). Must compile out of production bundles entirely — guarded behind a flag, never a top-level side effect, preserving `"sideEffects": false`.
- **Exhaustive aliasing/edge tests** — every function tested with: no-runtime entity, runtime-but-no-binding, re-attach replacing a binding, detach then re-attach, clone of bound vs. unbound, strip of bound vs. unbound. Mirror the test names 1:1 across TS and the Rust `#[cfg(test)]` modules.
- **Doc surface** — a short package-level doc comment / README section stating the entity↔runtime↔binding contract, the lazy-runtime model, the non-serializable runtime rule, and the "do not grow into an ECS" scope boundary, so future agents do not over-build the package. (Per project rules, only add docs if a doc file already exists or is requested — otherwise carry this as doc comments in `index.ts`/`Entity.ts`.)

## Sequencing & effort

Recommended order, smallest-blast-radius first:

1. **Bronze, in one pass (low effort, ~half a day).** Add `hasEntityRuntime`, `ensureEntityRuntime`, `detachEntityBinding`; refactor `attachEntityBinding` to call `ensureEntityRuntime`; fix the `api`→`binding` test wording. No new types needed except confirming `EntityRuntime`/binding shapes in `@flighthq/types`. Run `npm run exports:check` (every new export needs a colocated test), `npm run order:fix`, `npm run api entity`, then `npm run check`.
2. **Silver type-first (low–medium effort).** Land `stripEntityRuntime` against the existing `EntityWithoutRuntime<Type>` type, then `cloneEntity`, `getEntityRuntimeBinding`, `hasEntityBinding`. Add the round-trip serialization tests. Header types go into `@flighthq/types/Entity.ts` before implementing.
3. **Gold conformance + ergonomics (medium effort, mostly cross-worktree coordination).** The TS↔Rust reconciliation is the bulk of the work and spans both worktrees; do it after the TS surface is stable so you reconcile against a settled API. Typed-binding generics and the dev guard mode are independent and can land any time after Bronze.

**Dependencies and cross-package / design-decision items to surface:**

- **`@flighthq/types` is the gate for Silver.** `stripEntityRuntime`'s return type, any typed-binding generic, and the runtime accessor return types must be declared in the header layer first. No cross-package _implementation_ dependency otherwise — `@flighthq/entity` depends only on `@flighthq/types`, and that must stay true.
- **`@flighthq/node` is the primary consumer.** `NodeRuntime extends EntityRuntime` and `Node extends Entity`; the new `ensureEntityRuntime`/`hasEntityRuntime`/`detachEntityBinding` should be the functions `@flighthq/node` (and every other runtime-attaching subsystem) builds on instead of re-implementing the lazy/guard pattern. Worth a quick audit of `@flighthq/node` for inlined lazy-runtime logic to replace once Bronze lands.
- **DESIGN DECISION — `getEntityRuntime` contract (asserting vs. nullable).** TS asserts non-null; Rust returns `Option`. Pick one before Gold: keep TS asserting + lean on `hasEntityRuntime` (smaller, faster, matches current callers) **or** make it `EntityRuntime | null` to match Rust (safer, one fewer footgun, but a breaking change to current call sites). This is the one choice that affects every consumer — raise it to the user rather than deciding silently.
- **DESIGN DECISION — typed binding (`object` vs. generic).** Whether to add `getEntityBindingAs<T>` / generic binding is a public-API-shape call that touches the OOP-wrapper and host-adapter layers; surface it rather than acting autonomously, since binding identity is owned by the attaching layer per the depth review.
- **Out of scope on purpose — do not add:** component storage, entity-id registries, archetype/query APIs, or a kind registry. Those are `@flighthq/node` / the kind-registry layer. If a task seems to want them here, that is a signal the boundary is being crossed — raise it.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/entity` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
