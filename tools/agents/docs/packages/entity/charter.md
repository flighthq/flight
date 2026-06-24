---
package: '@flighthq/entity'
crate: flighthq-entity
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# entity — Charter

## What it is

Core entity / runtime / binding data-model primitives — the foundational seam that pairs a plain public data object (the **entity**) with an opaque, package-private **runtime** object, plus the **binding** hook that lets higher layers (OOP wrappers, host adapters) attach to an entity. It is the bedrock the whole entity/runtime split in the SDK rests on: every higher package (`node`, `displayobject`, `sprite`, …) builds its own runtime tier on top of this primitive.

The package owns exactly the entity↔runtime↔binding triad — construction (`createEntity`), the lazy runtime slot (`createEntityRuntime` / `ensureEntityRuntime` / `getEntityRuntime` / `hasEntityRuntime`), the binding hook (`attach*` / `detach*` / `get*` / `has*`), clone/serialization helpers (`cloneEntity` / `stripEntityRuntime`), and an opt-in dev guard mode. It ends where `@flighthq/node` begins: this package knows nothing about scene-graph nodes, hierarchy, transforms, component storage, or kind registries — those are neighbors built _on_ the seam, not part of it.

## North star (proposed)

1. **Minimal, symmetric, complete-for-its-triad.** The bar is not breadth but completeness of a deliberately thin domain: the entity↔runtime↔binding seam, fully symmetric (every `create` has its `has`/`get`, every `attach` its `detach`), and nothing more. A function is missing only if the triad is asymmetric without it.
2. **Never an ECS.** This is bedrock, not a framework. No component storage, no entity-id registry, no archetype/query layer. Higher packages compose those _on top of_ the seam; the seam itself stays a pure data-model primitive. (From the maturation roadmap's explicit "do not grow into an ECS" boundary — proposed for blessing.)
3. **The runtime is lazy and opaque.** `createEntity` installs an unset runtime slot; the runtime is created only on first need. Application code treats runtime state as internal; subsystems attach their own state to the runtime object rather than adding fields to the entity.
4. **Header-first, side-effect-free, tree-shakable.** Types live in `@flighthq/types`; the package is a thin barrel of free functions with full unabbreviated names, `Readonly<>` on read paths, sentinels (never throws) for expected-missing cases, and no top-level side effects (`"sideEffects": false`).
5. **The Rust crate conforms name-for-name.** `flighthq-entity` mirrors this surface 1:1; intentional divergences (e.g. `get_entity_runtime` asserting-vs-`Option`, `get_entity_runtime_mut` Rust-only) are recorded in the conformance map, not invented per-port.

## Boundaries (proposed)

**In scope:**

- Entity construction with a lazy, opaque runtime slot.
- The runtime get-or-create / accessor / presence members.
- The binding hook: attach, detach, typed read, presence.
- Clone and serialization-strip helpers (`cloneEntity`, `stripEntityRuntime`).
- An opt-in, dev-only guard mode for catching raw slot writes.

**Explicit non-goals** (each belongs to a neighbor — proposed so the "is this a crossing?" test is answerable from the charter alone):

- **Scene-graph nodes, hierarchy, transforms, bounds, appearance** → `@flighthq/node`.
- **Component storage / SoA component arrays** → not in the SDK as an ECS at all.
- **Entity-id registries / identity tables** → not here.
- **Archetype / query APIs** → not here.
- **The kind registry** (`*Kind` string identity, renderer registration) → the kind-registry / `types` layer.

## Decisions

None blessed yet.

## Open directions

These are the questions the review surfaced; each needs your blessing before it becomes a Decision.

1. **Bless the North star — "minimal, symmetric, complete-for-its-triad, never an ECS."** The maturation roadmap states the ECS boundary, but the charter has not blessed it. Promote to a Decision so a future agent does not over-build the seam into a framework?
2. **`getEntityRuntime` asserting-vs-nullable — ratify the TS choice.** The work shipped the **asserting** form (paired with `hasEntityRuntime`) and recorded the Rust `Option` divergence in the conformance map. This is a _de facto_ worker ruling that touches every consumer; should it be ratified into Decisions rather than left implicit in a conformance table?
3. **Typed binding — is `getEntityBindingAs<T>` (unchecked cast) the intended ergonomic?** It shipped as an unchecked cast over `getEntityBinding`, mirroring Rust's `downcast_ref::<T>()` shape but without Rust's runtime check. Confirm the unchecked-cast posture is deliberate (binding identity owned by the attaching layer), or is a checked variant wanted?
4. **Guard-mode posture — warn-and-allow vs. enforce.** The dev guard surfaces a console warning but permits the write (it cannot reliably distinguish a trusted writer from a raw poke). Is best-effort warning the intended ceiling (a smoke alarm by design), or is a future enforcing mode (e.g. a `defineProperty` lock under guards) in scope? The Boundaries section should record the answer.
5. **TS↔Rust behavioral conformance pass.** The intentional divergences are recorded, but the assertion-ported Rust `#[cfg(test)]` mirror of the TS tests is pending Rust-worktree coordination. A conformance-instrument gap, not a TS API gap — but worth a direction on priority.
6. **`stripEntityRuntime` has no consumer.** It is the canonical serialization-strip path, but no scene serializer exists to call it (the versioned-migration model in `types-layout.md` is unbuilt). Is keeping the ready-and-tested-but-uncalled helper here the intended posture, or does it wait on a consumer elsewhere?

**Structural forks touching this package:**

- **Fork A (source-data vs. graph participation).** This package is the _bedrock_ of the entity/runtime split that fork A reasons about at higher layers — it holds neither a node's source data nor its graph participation, only the seam both build on. Confirm `entity` stays strictly below the source-data/graph line (no node concept ever enters here).
- **Fork D (Wasm `-rs` mixing seam).** `entity` carries runtime identity and a shared object graph, so it is **all-or-nothing**, not a value-typed mixable leaf — it only makes sense as part of a full Rust runtime, never as a standalone wasm drop-in. Worth recording so a future mixing pass does not target it.

**Candidate doc revisions (the user's gate):**

- **`package.json` description is stale** — it reads "Core entity/node/runtime data model and binding system"; the word **node** belongs to `@flighthq/node`. Drop "node" so the description matches the actual (entity/runtime/binding) scope.
- **Package Map line is thin** — `index.md`'s entry is just "entity/runtime primitives used by higher-level packages." It now also owns the binding hook, clone/strip serialization helpers, and the dev guard mode; the one-liner undersells it.
