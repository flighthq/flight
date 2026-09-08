---
package: '@flighthq/entity'
status: partial
score: 62
updated: 2026-09-08
ingested:
  - charter.md
  - status.md
  - source
---

# Review: @flighthq/entity

**Verdict:** partial — 62/100. _(Score retained from prior review; stale items retired 2026-09-08 — binding symmetry, guard references, and charter contradictions 1–3 are all resolved. A re-score is warranted.)_ The entity/runtime construction path, binding seam, and guard system are solid, well-tested, and heavily consumed across the SDK. Construction uses the ratified `allocateEntity`/`finishEntity` model (1,808 usages). Binding is now symmetric: `attach`/`detach`/`get`/`getAs`/`has`.

## Prior review staleness

The prior review claimed 15 exported functions including `ensureEntityRuntime`, `detachEntityBinding`, `getEntityBindingAs<T>`, `getEntityRuntimeBinding`, and `hasEntityBinding`. None of these five exist as exported functions in `packages/entity/src/`. The status.md (2026-08-08) correctly identified this discrepancy. Since the status rewrite, two new functions (`getEntityUid`, `setEntityUid`) and one new file (`entityUid.ts`) were added, plus `createHost` and `host.ts`. The present review supersedes all prior claims.

## Present capabilities

The contract lane (`./contract`) exports 24 functions across 9 source files, each with a colocated test file. The public lane (`.`) exports 2 of those (`getEntityUid`, `setEntityUid`). _(Counts refreshed 2026-09-08.)_

### Construction (entity.ts — 2 exports)

- `allocateEntity<Type>()` — stamps `EntityRuntimeKey` as `undefined`, returning `EntityConstruction<Type>` (the writable variant). _(Refreshed 2026-09-08: `createEntity` replaced by the ratified allocate-initialize-finish model.)_
- `finishEntity<Type>(out)` — restores the readonly contract, returning the finished `Type & Entity`.

### Runtime (runtime.ts — 3 exports, 5 tests)

- `createEntityRuntime()` — allocates `{ binding: null }`.
- `getEntityRuntime(source)` — returns `source[EntityRuntimeKey]!` (non-null assert). This is the documented asserting fast path (Decision [2026-07-02]); callers that cannot assume the runtime exists use `hasEntityRuntime` first.
- `hasEntityRuntime(source)` — presence check: `source[EntityRuntimeKey] !== undefined`.

### Binding (binding.ts — 5 exports)

- `attachEntityBinding(entity, binding)` — lazily creates the runtime if absent, then writes `runtime.binding`.
- `detachEntityBinding(entity)` — clears the binding slot. _(Added since prior review.)_
- `getEntityBinding(source)` — returns `source[EntityRuntimeKey]?.binding ?? null`. _(Defensive coding resolved: reads the slot directly.)_
- `getEntityBindingAs<T>(source)` — unchecked cast accessor. _(Added since prior review.)_
- `hasEntityBinding(source)` — presence check. _(Added since prior review.)_

### Entity UID (entityUid.ts — 2 exports, 7 tests)

- `getEntityUid(source)` — lazily generates a monotonic `entity-N` string uid on first access, stored on the runtime. Creates the runtime if absent via a private `ensureEntityRuntime` helper.
- `setEntityUid(source, uid)` — overrides the uid. Same lazy runtime creation.

These are the only two functions on the public `.` lane.

### Clone and serialization (clone.ts — 2 exports, 10 tests)

- `cloneEntity<Type>(source)` — shallow copy with the runtime slot reset to `undefined`. Returns a fresh, unbound entity.
- `stripEntityRuntime<Type>(source)` — removes the `EntityRuntimeKey` slot entirely for serialization. Returns `EntityWithoutRuntime<Type>`.

`cloneEntity` has no caller outside `clone.test.ts`. `stripEntityRuntime` is called by `packages/screen/src/screen.ts`.

### Host construction (host.ts — 2 exports)

- `createHost<Capabilities>(capabilities?)` — creates a `Host` entity via `allocateEntity`/`finishEntity`, merging caller-supplied capabilities.
- `initializeHost(out, capabilities?)` — the initializer half for composition. _(Added since prior review.)_

### Dev guards (guards.ts — 5 exports; enableEntityRuntimeGuards.ts — 2 exports; 12 tests total)

- **guards.ts:** `areEntityRuntimeGuardsEnabled`, `createGuardedEntity`, `createGuardedEntityRuntime`, `setEntityRuntimeGuardMode`, `setEntityRuntimeWriteGuard`. Proxy-based interception of direct runtime-slot and binding-slot writes. The proxies warn-and-allow (Decision [2026-07-03]): the write is reported through the guard seam and then permitted.
- **enableEntityRuntimeGuards.ts:** `enableEntityRuntimeGuards`, `disableEntityRuntimeGuards`. The caller-facing entry point that installs both the proxy mode and the `logOnce`-based reporter (channel `'entity'`, `LogLevel.Warn`). This is the sanctioned `@flighthq/log` import in a core package — separately importable and tree-shakable so the dependency does not inflate the always-loaded graph.

The guard system is well-tested: Proxy-absence fallback, guard-disable silence, ordinary-property passthrough, and post-disable proxy silence are all covered. The `enableEntityRuntimeGuards.test.ts` correctly uses `createMemoryLogSink` to capture and assert log entries rather than console spies, matching the Decision [2026-07-03] requirement.

## Gaps

Ordered by how directly they violate the charter's stated goals:

1. **~~No `detachEntityBinding`.~~** — resolved 2026-09-08. `detachEntityBinding` exists at `binding.ts`.

2. **~~No `hasEntityBinding`.~~** — resolved 2026-09-08. `hasEntityBinding` exists at `binding.ts`.

3. **~~No `getEntityBindingAs<T>`.~~** — resolved 2026-09-08. `getEntityBindingAs` exists at `binding.ts`.

4. **~~Guard comments reference non-existent exports.~~** — resolved 2026-09-08. Guard references now name functions that exist.

5. **`cloneEntity` has no callers.** ~~`stripEntityRuntime` has no callers~~ — partially resolved: `stripEntityRuntime` is now called by `packages/screen/src/screen.ts`. `cloneEntity` remains uncalled outside tests.

6. **`getEntityUid`/`setEntityUid` are not consumed.** They are the only functions on the public lane. No other package imports them. The feature is ready and tested, but unused outside tests.

## Charter contradictions

~~Three findings where the code contradicts stated charter content — all resolved 2026-09-08:~~

1. **~~Binding symmetry (North star #1).~~** — resolved. `detachEntityBinding` and `hasEntityBinding` now exist; the binding hook is fully symmetric (`attach`/`detach`/`get`/`getAs`/`has`).

2. **~~Charter "What it is" names functions that do not exist.~~** — resolved. `getEntityBindingAs<T>` exists at `binding.ts`. All charter Decision references now name real exports.

3. **~~`getEntityBinding` defensive coding inconsistency.~~** — resolved. `getEntityBinding` now reads the slot directly (`source[EntityRuntimeKey]?.binding ?? null`) instead of routing through the asserting `getEntityRuntime`.

## Contract and docs fit

**Lives up to the contract — largely:**

- **`@flighthq/types`-first:** `Entity`, `EntityRuntime`, `EntityWithoutRuntime`, `EntityRuntimeKey`, `EntityRuntimeWriteSlot`, `EntityRuntimeWriteGuard`, `Kind` all live in `packages/types/src/Entity.ts`. The package imports them and defines no cross-package types. `import type` is correctly isolated on its own line in every file.
- **Full unabbreviated names:** every export carries the full `Entity`/`EntityRuntime`/`EntityBinding` type word. `has*` for booleans, `get*` for accessors, `create*` for allocators, `set*` for mutators — all honored.
- **Sentinels not throws:** `getEntityBinding` returns `null` for the missing case. No function in the package throws. Guard functions no-op silently when guards are disabled or `Proxy` is unavailable.
- **`Readonly<>`:** `getEntityRuntime` and `hasEntityRuntime` take `Readonly<Entity>`; `cloneEntity` and `stripEntityRuntime` take `Readonly<Type>`. Mutators (`attachEntityBinding`) take the mutable type. ~~`getEntityBinding` takes `Entity` (mutable)~~ — resolved 2026-09-08: `getEntityBinding`, `getEntityBindingAs`, and `hasEntityBinding` all take `Readonly<Entity>`.
- **`sideEffects: false`:** declared in `package.json`. Module-level mutables (`_guardsEnabled`, `_writeGuard`, `_nextEntityUidCounter`) are written only through explicit function calls, never at import time.
- **Two-lane exports:** `.` (`index.ts`) and `./contract` (`contract.ts`) exist. The `.` lane is deliberately narrow (2 functions). `package.json` `exports` field declares both lanes.
- **Test colocated:** 8 source files, 8 test files, all in `src/`. `describe` blocks mirror exported function names and are alphabetized.

**Candidate contract/doc revisions:**

- **~~`getEntityBinding` parameter should be `Readonly<Entity>`.~~** — resolved 2026-09-08. All binding read accessors now take `Readonly<Entity>`.
- **`createHost` return type.** The function returns `Host & Capabilities` but the `Host` type is defined in `@flighthq/types` with 26 capability-group fields. The intersection `Host & Capabilities` makes the return type always `Host` (since `Capabilities` is constrained to `Partial<EntityWithoutRuntime<Host>>`). This is correct but the generic signature is more complex than it needs to be for the current usage — all host-web callers pass a concrete object and immediately assign to a typed constant.
- **Package description is correct.** It reads "Core entity/runtime data model and binding system" — the prior review's finding that it still said "node" has been resolved (status.md 2026-06-25 logs the fix).

## Candidate open directions

Questions the charter does not answer that this review had to assume:

1. **Public lane curation policy.** The `.` lane exports only `getEntityUid` and `setEntityUid`. All other entity functions — including `createEntity`, `attachEntityBinding`, and `getEntityBinding` — are contract-only. Is this the intended final shape? End-user apps that create entities directly would need the contract lane. If entity construction is always mediated by higher packages (`node`, `scene2d`), the narrow public lane is correct. The charter does not say which.

2. **Host constructor ownership.** `createHost` lives in `@flighthq/entity` because it wraps `createEntity`, but the `Host` type with its 26 capability groups is a platform/application concept far from the entity/runtime/binding triad. The charter's "What it is" does not mention host construction. Is this function in the right package, or should it live in a host or platform package that depends on entity?

3. **UID generation model.** `getEntityUid`/`setEntityUid` use a module-scoped monotonic counter (`entity-1`, `entity-2`, ...) that resets on module reload. The counter is not serialization-stable and does not survive across sessions. The charter does not state whether entity identity should be durable or session-local, or whether the UID system is a stepping stone toward the serialization/migration model mentioned in the `types-layout.md` reference.
