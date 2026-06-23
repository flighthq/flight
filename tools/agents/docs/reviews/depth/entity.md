# Depth Review: @flighthq/entity

**Domain:** Core entity / runtime data-model primitives — the foundational seam that pairs a plain public data object ("entity") with an opaque, package-private runtime object, plus the binding hook that lets higher layers (OOP wrappers, host adapters) attach to an entity.

**Verdict:** solid — 78/100

This is deliberately a thin, foundational primitive, not a feature-rich sub-library. Judged against what a _core entity/runtime substrate_ in this architecture is supposed to provide (rather than against a general-purpose ECS), it is essentially complete: it owns exactly the entity↔runtime↔binding triad and nothing else. The score reflects a couple of small but real omissions (no teardown/disposal verb, no runtime-presence predicate) rather than a missing domain.

## Present capabilities

The exported surface is five free functions across three files, all backed by colocated tests:

- `createEntity<Type extends object>(obj?)` — wraps/initializes any object as an `Entity`, installing the `EntityRuntimeKey` slot set to `undefined` (lazy runtime). Generic-preserving (`Type & Entity`), so callers keep their concrete shape.
- `createEntityRuntime()` — allocates the runtime value (currently `{ binding: null }`). The single allocation boundary for runtime state.
- `getEntityRuntime(source)` — `Readonly<EntityRuntime>` accessor (non-null assertion: caller must know a runtime exists).
- `attachEntityBinding(entity, binding)` — lazily creates the runtime if absent, then stores the binding. This is the OOP/host attachment hook described in the codebase map's "Entity and Runtime" pattern.
- `getEntityBinding(source)` — returns the binding or `null` sentinel.

Design conformance is good: `sideEffects: false`, single `.` export, only depends on `@flighthq/types`, `out`/sentinel/`Readonly<>` conventions are honored, allocation is explicit (`create*`), and the public data object stays free of subsystem fields (runtime carries the binding). The entity/runtime split, lazy-runtime model, and `Symbol.for('EntityRuntime')` slot key are exactly the substrate the wider SDK builds `Node`/`NodeRuntime` on top of (those richer types live in `@flighthq/types` + `@flighthq/node`, correctly _not_ here).

## Gaps vs an authoritative core-entity library

Scoping the bar to this package's actual domain (the entity/runtime/binding primitive), not to a general ECS:

- **No teardown verb.** There is no `disposeEntity` / `disposeEntityBinding` (or `detachEntityBinding`). Per the project's `dispose*` vs `destroy*` rule, the binding hook is exactly the kind of reachability link that should have a paired detach-to-GC. Attach without a documented detach is an asymmetry — present-by-omission. (Notably `EntityRuntime.binding` can be set but there is no first-class way to clear it except re-attaching.)
- **No presence predicate.** `getEntityRuntime` asserts non-null, but there is no `hasEntityRuntime(entity): boolean` to safely test before access. Callers must reach into the slot or call `getEntityBinding` (which only works because it tolerates the lazy case). A `has*` guard is the canonical companion to a lazily-created slot.
- **No `ensureEntityRuntime` accessor.** `attachEntityBinding` lazily creates the runtime, but there is no general get-or-create exposed for other subsystems that need the runtime to exist; the lazy-create logic is currently private to the binding path.
- **`EntityWithoutRuntime<Type>` type exists in `@flighthq/types` but no runtime helper to strip/serialize.** A core entity layer would plausibly own a `cloneEntity` / serialize-without-runtime helper, since the runtime is explicitly non-serializable. Arguably out of scope, but it is the natural next primitive.

None of these is a missing _domain_ — they are missing _members_ of an otherwise-correct primitive. There is no evidence of a missing larger feature area (graph, identity registries, component storage), and that absence is by-design: those belong to `@flighthq/node` and the kind-registry layer, not here.

## Naming / API-shape notes

- Names are clean and self-identifying: `createEntity`, `createEntityRuntime`, `getEntityRuntime`, `attachEntityBinding`, `getEntityBinding`. All carry the full type word; no abbreviations.
- `getEntityBinding` returns `object | null` — appropriately untyped, since binding identity is owned by the attaching layer.
- One test description drift: `runtime.test.ts` says "has a null api slot" while the field is `binding`; the stale word `api` should be `binding`. Cosmetic, but worth fixing.
- `attachEntityBinding` doubling as the lazy runtime-creator is slightly surprising — a reader expects binding attachment, not runtime allocation, as the side effect. Extracting an `ensureEntityRuntime` and having `attachEntityBinding` call it would make the allocation boundary explicit and reusable.

## Recommendation

Keep the package thin — its scope is correct and it should not grow into an ECS. To reach authoritative completeness _for its own domain_, add the small symmetric members: a `disposeEntityBinding`/`detachEntityBinding` teardown (paired with `attachEntityBinding`), a `hasEntityRuntime` predicate, and an exposed `ensureEntityRuntime` get-or-create so the lazy logic isn't trapped inside the binding path. Fix the stale `api` wording in `runtime.test.ts`. These are minor; the package is a faithful, well-conformed core primitive today.
