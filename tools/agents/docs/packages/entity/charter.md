---
package: '@flighthq/entity'
crate: flighthq-entity
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# entity — Charter

## What it is

Core entity/runtime/binding data-model primitives — the foundational seam that pairs a plain public data object (the **entity**) with an opaque, package-private **runtime** object, plus the **binding** hook that lets higher layers (OOP wrappers, host adapters) attach to an entity. It is the bedrock the whole entity/runtime split in the SDK rests on: every higher package (`node`, `displayobject`, `sprite`, …) builds its own runtime tier on top of this primitive.

The package owns exactly the entity↔runtime↔binding triad — construction (`createEntity`), the lazy runtime slot (`createEntityRuntime`/`getEntityRuntime`/`hasEntityRuntime`), the binding hook (`attachEntityBinding`/`getEntityBinding`/`getEntityBindingAs<T>`), clone/serialization helpers (`cloneEntity`/`stripEntityRuntime`), and an opt-in dev guard mode. It ends where `@flighthq/node` begins: this package knows nothing about scene-graph nodes, hierarchy, transforms, component storage, or kind registries.

## North star

1. **Minimal, symmetric, complete-for-its-triad.** The bar is not breadth but completeness of a deliberately thin domain: the entity↔runtime↔binding seam, fully symmetric (every `create` has its `has`/`get`, every `attach` its `detach`), and nothing more. A function is missing only if the triad is asymmetric without it.
2. **Never an ECS.** This is bedrock, not a framework. No component storage, no entity-id registry, no archetype/query layer. Higher packages compose those on top of the seam; the seam itself stays a pure data-model primitive (Decision #1).
3. **The runtime is lazy and opaque.** `createEntity` installs an unset runtime slot; the runtime is created only on first need. Application code treats runtime state as internal; subsystems attach their own state to the runtime object rather than adding fields to the entity.
4. **Header-first, side-effect-free, tree-shakable.** Types live in `@flighthq/types`; the package is a thin barrel of free functions with full unabbreviated names, `Readonly<>` on read paths, sentinels (never throws) for expected-missing cases, and no top-level side effects.

## Boundaries

**In scope:**

- Entity construction with a lazy, opaque runtime slot.
- The runtime get-or-create / accessor / presence members.
- The binding hook: attach, detach, typed read, presence.
- Clone and serialization-strip helpers (`cloneEntity`, `stripEntityRuntime`).
- An opt-in dev guard mode (placement under review — see Open directions #1).

**Explicit non-goals:**

- **Scene-graph nodes, hierarchy, transforms, bounds, appearance** → `@flighthq/node`.
- **Component storage / SoA component arrays** → not in the SDK; this is not an ECS.
- **Entity-id registries / identity tables** → not here.
- **Archetype / query APIs** → not here.
- **The kind registry** (`*Kind` string identity, renderer registration) → `@flighthq/types` / the kind-registry layer.

## Decisions

- **[2026-07-02] Never an ECS — blessed as a North star boundary.** This package is bedrock, not a framework. No component storage, entity-id registry, or archetype/query layer will be added. Higher packages compose on top. **Resolves Open direction #1.**

  **Why:** The entity/runtime seam is deliberately thin. Its value is in being a minimal, stable primitive that every higher package can depend on without pulling in framework concerns. Growing it into an ECS would violate the cellular architecture — each concern belongs in its own package.

- **[2026-07-02] `getEntityRuntime` is the asserting fast path; `hasEntityRuntime` is the presence check.** `getEntityRuntime` returns `source[EntityRuntimeKey]!` — non-null assertion, no guard. It is designed as a fast path for the common case where the runtime is always defined (which it essentially always is after entity initialization). Callers that cannot assume the runtime exists use `hasEntityRuntime` first. The Rust port diverges (`get_entity_runtime` returns `Option`); this is a recorded intentional conformance divergence. **Resolves Open direction #2.**

  **Why:** The runtime is allocated on first binding or first subsystem attachment, and once allocated it is never removed (only the entity itself is disposed). For the vast majority of call sites, the runtime is guaranteed to exist. An `Option`/nullable return would force every consumer into a null-check for a case that doesn't arise in correct code — exactly the pattern the SDK's "sentinels for expected failure, not for programmer error" rule avoids.

- **[2026-07-02] `getEntityBindingAs<T>` is an intentional unchecked cast.** The binding hook is for OOP wrappers (e.g. `class Matrix` wrapping an entity `Matrix` so they behave as one object) and host adapters. The attaching layer owns the type identity — it knows what it attached. The cast `getEntityBinding(source) as T | null` is safe by construction; there is no need for a runtime type check (unlike Rust's `downcast_ref::<T>()` which has `TypeId` available). **Resolves Open direction #3.**

  **Why:** The binding is always attached and read by the same layer (the OOP wrapper or host adapter). Adding a runtime type check would require a type tag or registry that adds weight to a hot path for no safety gain — the caller already knows the type because it's the same code that attached it.

- **[2026-07-02] Drop "node" from `package.json` description.** The description reads "Core entity/node/runtime data model and binding system" — the word "node" belongs to `@flighthq/node`. Change to "Core entity/runtime data model and binding system." **Resolves Open direction candidate (docs).**

  **Why:** This package owns no node concept. The description should match the actual scope.

- **[2026-07-03] Guard mode stays; warn-and-allow is the ceiling; emission migrates to `@flighthq/log`.** The opt-in `Proxy`-based guards are affirmed as the intended smoke alarm — warn on misuse, never alter behavior, no strict/throw mode (throwing would change control flow between dev and prod and violate the sentinel rule). `guards.ts` predates the logger; its ad-hoc `[entity]` `console.warn` prefix becomes channel `'entity'`, each warn becomes `logOnce` with structured data (the entity in the data record, not interpolated), and messages follow the diagnostics message convention. The `enableEntityRuntimeGuards`/`areEntityRuntimeGuardsEnabled` surface is unchanged. Pre-release, no consumers — no compatibility concern. Full convention: [diagnostics](../../conventions/diagnostics.md). **User-blessed 2026-07-03. Resolves Open direction #1.**

  **Why:** log-routed warnings are deduped by construction (`logOnce`), silenceable per channel, assertable in tests via `createMemoryLogSink` instead of console spies, and land in the capture tooling's `logs.jsonl` — turning warnings into an agent sensor. This makes `entity` the first load-bearing consumer of `@flighthq/log`, which is currently imported by zero packages. The guard shape proven here (`enable*Guards`, sibling module, tree-shakable) is now the SDK-wide convention.

## Open directions

1. **Guard mode posture.** `createGuardedEntity`/`createGuardedEntityRuntime` use `Proxy` to warn on raw slot writes via `console.warn`. The implementation is opt-in (`enableEntityRuntimeGuards()`) and tree-shakable. However, the `Proxy`-based approach and its alignment with the SDK's plain-data / free-function / C-portable tenets needs review. Is warn-and-allow the intended ceiling (a smoke alarm by design), or should a different mechanism be considered? Should guard mode exist at all, or does it add complexity to a package whose identity is "minimal bedrock"? _(Was Open direction #4.)_ **Resolved — see Decision [2026-07-03]:** guard mode stays, warn-and-allow is the ceiling, emission migrates to `@flighthq/log`.

2. **`stripEntityRuntime` has no consumer.** It is the canonical serialization-strip path, ready and tested, but no scene serializer exists to call it. The versioned-migration model in `types-layout.md` is unbuilt. Keeping the function is fine (it's tested and tree-shakable), but the consumer lives in a future serialization package. _(Was Open direction #6.)_

3. **Rust crate conformance.** The intentional divergences are recorded, but the assertion-ported Rust test mirror is pending. Downstream conformance debt, not a TS-side gap. _(Was Open direction #5.)_
