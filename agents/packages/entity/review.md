---
package: '@flighthq/entity'
status: partial
score: 62
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# Review: @flighthq/entity

**Verdict:** partial — 62/100. The entity/runtime construction path and the guard system are solid, well-tested, and heavily consumed across the SDK. But the binding seam is asymmetric — `attachEntityBinding` has no `detachEntityBinding`, no `hasEntityBinding`, and no `getEntityBindingAs<T>` — which directly contradicts the charter's North star #1 ("every `attach` has its `detach`"). The guard comments reference functions that do not exist as exports. The prior review (2026-06-24, score 92) described five functions that are absent from the current source.

## Prior review staleness

The prior review claimed 15 exported functions including `ensureEntityRuntime`, `detachEntityBinding`, `getEntityBindingAs<T>`, `getEntityRuntimeBinding`, and `hasEntityBinding`. None of these five exist as exported functions in `packages/entity/src/`. The status.md (2026-08-08) correctly identified this discrepancy. Since the status rewrite, two new functions (`getEntityUid`, `setEntityUid`) and one new file (`entityUid.ts`) were added, plus `createHost` and `host.ts`. The present review supersedes all prior claims.

## Present capabilities

The contract lane (`./contract`) exports 18 functions across 8 source files, each with a colocated test file. The public lane (`.`) exports 2 of those 18 (`getEntityUid`, `setEntityUid`).

### Construction (entity.ts — 1 export, 2 tests)

- `createEntity<Type>(obj?)` — stamps `EntityRuntimeKey` as `undefined` on the object, returning `Type & Entity`. Runtime allocation is lazy; the slot exists but is unset until a subsystem needs it.

### Runtime (runtime.ts — 3 exports, 5 tests)

- `createEntityRuntime()` — allocates `{ binding: null }`.
- `getEntityRuntime(source)` — returns `source[EntityRuntimeKey]!` (non-null assert). This is the documented asserting fast path (Decision [2026-07-02]); callers that cannot assume the runtime exists use `hasEntityRuntime` first.
- `hasEntityRuntime(source)` — presence check: `source[EntityRuntimeKey] !== undefined`.

### Binding (binding.ts — 2 exports, 6 tests)

- `attachEntityBinding(entity, binding)` — lazily creates the runtime if absent, then writes `runtime.binding`. Callers include geometry pool tests across `@flighthq/geometry` (vector2/3/4, matrix, matrix3, rectangle, quaternion pools).
- `getEntityBinding(source)` — returns `runtime?.binding ?? null`. See **Charter contradictions** for the `?.` inconsistency.

### Entity UID (entityUid.ts — 2 exports, 7 tests)

- `getEntityUid(source)` — lazily generates a monotonic `entity-N` string uid on first access, stored on the runtime. Creates the runtime if absent via a private `ensureEntityRuntime` helper.
- `setEntityUid(source, uid)` — overrides the uid. Same lazy runtime creation.

These are the only two functions on the public `.` lane.

### Clone and serialization (clone.ts — 2 exports, 10 tests)

- `cloneEntity<Type>(source)` — shallow copy with the runtime slot reset to `undefined`. Returns a fresh, unbound entity.
- `stripEntityRuntime<Type>(source)` — removes the `EntityRuntimeKey` slot entirely for serialization. Returns `EntityWithoutRuntime<Type>`.

Neither function has any caller outside `clone.test.ts`. The status.md correctly notes `stripEntityRuntime` is waiting on a serialization consumer.

### Host construction (host.ts — 1 export, 3 tests)

- `createHost<Capabilities>(capabilities?)` — creates a `Host` entity with 26 empty capability groups (`accessibility`, `app`, `clipboard`, ..., `window`), merging caller-supplied capabilities. Consumed by `@flighthq/host-web` (at least 8 call sites: `webGraphicsHost`, `webDialogHost`, `webInputHost`, `webPowerHost`, etc.).

### Dev guards (guards.ts — 5 exports; enableEntityRuntimeGuards.ts — 2 exports; 12 tests total)

- **guards.ts:** `areEntityRuntimeGuardsEnabled`, `createGuardedEntity`, `createGuardedEntityRuntime`, `setEntityRuntimeGuardMode`, `setEntityRuntimeWriteGuard`. Proxy-based interception of direct runtime-slot and binding-slot writes. The proxies warn-and-allow (Decision [2026-07-03]): the write is reported through the guard seam and then permitted.
- **enableEntityRuntimeGuards.ts:** `enableEntityRuntimeGuards`, `disableEntityRuntimeGuards`. The caller-facing entry point that installs both the proxy mode and the `logOnce`-based reporter (channel `'entity'`, `LogLevel.Warn`). This is the sanctioned `@flighthq/log` import in a core package — separately importable and tree-shakable so the dependency does not inflate the always-loaded graph.

The guard system is well-tested: Proxy-absence fallback, guard-disable silence, ordinary-property passthrough, and post-disable proxy silence are all covered. The `enableEntityRuntimeGuards.test.ts` correctly uses `createMemoryLogSink` to capture and assert log entries rather than console spies, matching the Decision [2026-07-03] requirement.

## Gaps

Ordered by how directly they violate the charter's stated goals:

1. **No `detachEntityBinding`.** The charter North star #1 requires "every `attach` has its `detach`." The charter "What it is" section names the binding hook scope as including "attach, detach, typed read, presence." Only attach and untyped read exist. The `enableEntityRuntimeGuards.ts` warning message at line 34 references `detachEntityBinding` by name ("Use attachEntityBinding or detachEntityBinding"), directing callers to a function that does not exist.

2. **No `hasEntityBinding`.** The charter "What it is" names "presence" as part of the binding hook scope. No binding presence check exists. Callers must call `getEntityBinding` and compare to `null` — which itself has a defensive coding issue (see charter contradictions).

3. **No `getEntityBindingAs<T>`.** The charter "What it is" section lists `getEntityBindingAs<T>` as part of this package's identity. Decision [2026-07-02] describes it as "an intentional unchecked cast" and resolves a former Open direction about it. The function does not exist.

4. **Guard comments reference non-existent exports.** `guards.ts:10` and `:18` reference `ensureEntityRuntime` as a public function callers should use. `ensureEntityRuntime` exists only as a private function inside `entityUid.ts:19` — it is not exported from any file or either lane. `enableEntityRuntimeGuards.ts:34` references `detachEntityBinding`, which does not exist anywhere.

5. **`cloneEntity` and `stripEntityRuntime` have no callers.** Both are tested and tree-shakable, which is fine. But the consumer they anticipate (a scene serializer, the versioned-migration model) does not exist. This is a downstream gap, not a defect in this package.

6. **`getEntityUid`/`setEntityUid` are not consumed.** They are the only functions on the public lane. No other package imports them. The feature is ready and tested, but unused outside tests.

## Charter contradictions

Three findings where the code contradicts stated charter content:

1. **Binding symmetry (North star #1).** The charter's primary principle is: "fully symmetric (every `create` has its `has`/`get`, every `attach` its `detach`)." The binding hook has `attachEntityBinding` and `getEntityBinding` but no `detachEntityBinding` and no `hasEntityBinding`. The triad is asymmetric, which is exactly what the North star says should not happen.

2. **Charter "What it is" names functions that do not exist.** The section says the package owns "the binding hook (`attachEntityBinding`/`getEntityBinding`/`getEntityBindingAs<T>`)." Only the first two exist. Three charter Decisions reference these absent functions as resolved: Decision [2026-07-02] on `getEntityRuntime` mentions pairing with `hasEntityRuntime` (which exists — fine); Decision [2026-07-02] resolves `getEntityBindingAs<T>` as an intentional unchecked cast (the function does not exist); Decision [2026-07-02] names `detachEntityBinding` as a resolved design point (the function does not exist).

3. **`getEntityBinding` defensive coding inconsistency.** `getEntityRuntime` (`runtime.ts:11`) returns `source[EntityRuntimeKey]!` — a non-null assertion, the documented asserting fast path. `getEntityBinding` (`binding.ts:14`) calls `getEntityRuntime(source)` and then applies `?.binding ?? null`. The `?.` guards against the case that the `!` assertion denies. Either the runtime is always present (in which case `?.` is unnecessary) or it may be absent (in which case the `!` is wrong). The status.md correctly identified this: "papers over `undefined` with `?.`." Reading the slot directly (`source[EntityRuntimeKey]?.binding ?? null`) would be the honest form — it avoids the asserting accessor for a path where the runtime genuinely may not exist.

## Contract and docs fit

**Lives up to the contract — largely:**

- **`@flighthq/types`-first:** `Entity`, `EntityRuntime`, `EntityWithoutRuntime`, `EntityRuntimeKey`, `EntityRuntimeWriteSlot`, `EntityRuntimeWriteGuard`, `Kind` all live in `packages/types/src/Entity.ts`. The package imports them and defines no cross-package types. `import type` is correctly isolated on its own line in every file.
- **Full unabbreviated names:** every export carries the full `Entity`/`EntityRuntime`/`EntityBinding` type word. `has*` for booleans, `get*` for accessors, `create*` for allocators, `set*` for mutators — all honored.
- **Sentinels not throws:** `getEntityBinding` returns `null` for the missing case. No function in the package throws. Guard functions no-op silently when guards are disabled or `Proxy` is unavailable.
- **`Readonly<>`:** `getEntityRuntime` and `hasEntityRuntime` take `Readonly<Entity>`; `cloneEntity` and `stripEntityRuntime` take `Readonly<Type>`. Mutators (`createEntity`, `attachEntityBinding`) take the mutable type. `getEntityBinding` takes `Entity` (mutable) rather than `Readonly<Entity>` — this is inconsistent with the read-path convention. It is a read-only accessor and should accept `Readonly<Entity>`.
- **`sideEffects: false`:** declared in `package.json`. Module-level mutables (`_guardsEnabled`, `_writeGuard`, `_nextEntityUidCounter`) are written only through explicit function calls, never at import time.
- **Two-lane exports:** `.` (`index.ts`) and `./contract` (`contract.ts`) exist. The `.` lane is deliberately narrow (2 functions). `package.json` `exports` field declares both lanes.
- **Test colocated:** 8 source files, 8 test files, all in `src/`. `describe` blocks mirror exported function names and are alphabetized.

**Candidate contract/doc revisions:**

- **`getEntityBinding` parameter should be `Readonly<Entity>`.** It is a read accessor; the mutable parameter type is an oversight, inconsistent with `getEntityRuntime` and `hasEntityRuntime` which both take `Readonly<Entity>`.
- **`createHost` return type.** The function returns `Host & Capabilities` but the `Host` type is defined in `@flighthq/types` with 26 capability-group fields. The intersection `Host & Capabilities` makes the return type always `Host` (since `Capabilities` is constrained to `Partial<EntityWithoutRuntime<Host>>`). This is correct but the generic signature is more complex than it needs to be for the current usage — all host-web callers pass a concrete object and immediately assign to a typed constant.
- **Package description is correct.** It reads "Core entity/runtime data model and binding system" — the prior review's finding that it still said "node" has been resolved (status.md 2026-06-25 logs the fix).

## Candidate open directions

Questions the charter does not answer that this review had to assume:

1. **Public lane curation policy.** The `.` lane exports only `getEntityUid` and `setEntityUid`. All other entity functions — including `createEntity`, `attachEntityBinding`, and `getEntityBinding` — are contract-only. Is this the intended final shape? End-user apps that create entities directly would need the contract lane. If entity construction is always mediated by higher packages (`node`, `scene2d`), the narrow public lane is correct. The charter does not say which.

2. **Host constructor ownership.** `createHost` lives in `@flighthq/entity` because it wraps `createEntity`, but the `Host` type with its 26 capability groups is a platform/application concept far from the entity/runtime/binding triad. The charter's "What it is" does not mention host construction. Is this function in the right package, or should it live in a host or platform package that depends on entity?

3. **UID generation model.** `getEntityUid`/`setEntityUid` use a module-scoped monotonic counter (`entity-1`, `entity-2`, ...) that resets on module reload. The counter is not serialization-stable and does not survive across sessions. The charter does not state whether entity identity should be durable or session-local, or whether the UID system is a stepping stone toward the serialization/migration model mentioned in the `types-layout.md` reference.
