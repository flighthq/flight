---
package: '@flighthq/entity'
status: solid
score: 92
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/entity.md
  - reviews/maturation/depth/entity.md
  - source
---

# Review: @flighthq/entity

**Verdict:** solid — 92/100. The entity↔runtime↔binding primitive is now symmetric and complete for its (deliberately thin) domain. The Bronze/Silver/Gold maturation roadmap landed in full and verifies 1:1 against the diff; the remaining points are TS↔Rust conformance work and one cross-package convenience, neither of which is a TS gap in this package.

## What changed this pass (verified against the diff)

The `builder-67dc46d64` bundle takes the package from 5 exported functions across 3 files to 15 functions across 5 files. Every claim in `status.md` was checked against `changes.patch` and the source — **all claims hold**:

- `ensureEntityRuntime` extracted from `attachEntityBinding` (`67dc46d64:packages/entity/src/runtime.ts`); `attachEntityBinding` now delegates to it (`binding.ts:6-9`). The lazy-create boundary is now a first-class, reusable function.
- `getEntityBinding` rewritten to read `source[EntityRuntimeKey]` directly with `?.` instead of the non-null-asserting `getEntityRuntime` (`binding.ts:21-24`). This was a real bug fix — the old form asserted a runtime existed and only worked by accident; the new form correctly handles the no-runtime case. Confirmed in the diff hunk.
- `detachEntityBinding`, `getEntityBindingAs<T>`, `getEntityRuntimeBinding`, `hasEntityBinding`, `hasEntityRuntime` added with paired tests.
- `cloneEntity` / `stripEntityRuntime` added (`clone.ts`), each against the existing `EntityWithoutRuntime<Type>` header type, with round-trip tests.
- The guard suite (`guards.ts`): `enableEntityRuntimeGuards`, `areEntityRuntimeGuardsEnabled`, `createGuardedEntity`, `createGuardedEntityRuntime` — Proxy-based, `Proxy`-absence-guarded, guards-off-by-default, no top-level side effect.
- `runtime.test.ts` wording "null api slot" → "null binding slot" applied (`runtime.test.ts:8`).
- Conformance map (`agents/rust/conformance.md:66-67`) records both intentional divergences: `get_entity_runtime` asserting-vs-`Option`, and `get_entity_runtime_mut` as Rust-only. Both present exactly as the status claims.

## Present capabilities

The surface is 15 free functions across five files, all backed by colocated tests (5 test files, 45 tests per the status doc):

- **Construction:** `createEntity<Type>(obj?)` installs the `EntityRuntimeKey` slot set to `undefined` (lazy runtime), preserving the caller's concrete type as `Type & Entity`.
- **Runtime:** `createEntityRuntime`, `ensureEntityRuntime` (get-or-create), `getEntityRuntime` (non-null-asserting accessor), `hasEntityRuntime` (presence predicate).
- **Binding:** `attachEntityBinding`, `detachEntityBinding`, `getEntityBinding`, `getEntityBindingAs<T>` (typed read, no runtime check), `getEntityRuntimeBinding` (runtime-tier accessor), `hasEntityBinding`.
- **Serialization/clone:** `cloneEntity` (fresh, unbound copy with the runtime slot reset), `stripEntityRuntime` (removes the slot for a serializer / `JSON.stringify`).
- **Dev guards:** `enableEntityRuntimeGuards`, `areEntityRuntimeGuardsEnabled`, `createGuardedEntity`, `createGuardedEntityRuntime` — opt-in Proxy traps that warn on raw slot writes that bypass the attach/ensure path.

The four prior depth-review omissions (no teardown verb, no presence predicate, no exposed get-or-create, no strip/serialize helper) are all now closed. The package owns exactly the entity↔runtime↔binding triad and nothing else — no ECS, no identity registry, no component storage — which is correct per the maturation roadmap's explicit "do not grow into an ECS" boundary.

## Gaps

The package is feature-complete for its domain. The residue is not missing members but cross-seam work:

- **TS↔Rust behavioral conformance pass.** The intentional divergences are recorded in the conformance map, but the assertion-ported Rust `#[cfg(test)]` mirror of the TS tests is pending Rust-worktree coordination. This is a conformance-instrument gap, not a TS API gap.
- **`stripEntityRuntime` has no caller yet.** It is the canonical serialization strip path, but no scene serializer exists to call it (the versioned-migration model in `types-layout.md` is unbuilt). The function is ready and tested; it is waiting on a consumer. Not a gap in this package.
- **Guard mode is necessarily best-effort.** `createGuardedEntity` warns-and-allows rather than trapping the write, because it cannot reliably inspect the call stack to distinguish a trusted writer (`ensureEntityRuntime`/`attachEntityBinding`) from a raw poke (`guards.ts:16-26`). The comment is honest about this. It catches the "raw slot poke" class by surfacing a console warning, not by enforcement — acceptable for a dev-only guard, but worth noting it is a smoke alarm, not a lock.

## Charter contradictions

The charter's `North star`, `Boundaries`, and `Decisions` are all still `TODO` stubs — only `What it is` is seeded. There is therefore little stated direction to contradict. Measured against the one seeded sentence (the entity↔runtime↔binding seam plus the binding hook for higher layers), the code is a faithful, complete realization. **No contradictions found.** The stub sections are flagged as candidate Open directions below.

## Contract & docs fit

**Lives up to the contract — strongly:**

- **`@flighthq/types`-first:** `Entity`, `EntityRuntime`, `EntityWithoutRuntime`, and `EntityRuntimeKey` all live in `packages/types/src/Entity.ts`; the package imports them and defines no cross-package types inline. `import type` is correctly isolated on its own line in every file.
- **Full unabbreviated names:** every function carries the full `Entity`/`EntityRuntime`/`EntityBinding` type word. `has*`/`is*` for booleans, `get*` for accessors, `create*` for allocators — all honored.
- **Teardown verb:** `detachEntityBinding` is correctly `detach*` (release-a-GC-reachable-link), not `destroy*` — the binding is a GC-managed reference, so detach-to-GC is the right verb per the design constraint. The doc comment states this rationale.
- **Sentinels not throws:** `getEntityBinding`/`getEntityBindingAs`/`getEntityRuntimeBinding` return `null` for the missing case; no throws anywhere. `detachEntityBinding` and the guards no-op rather than throw on the absent-runtime / Proxy-unavailable cases.
- **`Readonly<>`:** read paths take `Readonly<Entity>` / `Readonly<EntityRuntime>`; mutators (`createEntity`, `ensureEntityRuntime`, `attachEntityBinding`, `detachEntityBinding`) take the mutable type deliberately.
- **Single root export, `sideEffects: false`:** `index.ts` is a thin five-line barrel; `package.json` has the single `.` export and `"sideEffects": false`. The guard mutable (`_guardsEnabled`) is a module-bottom `let` set only via `enableEntityRuntimeGuards()` — no top-level side effect, tree-shakable.
- **Rust mirror:** `crate: flighthq-entity` exists; the two surfaces are reconciled name-for-name with the divergences recorded in the conformance map.

**Candidate doc revisions (the user's gate, not mine):**

- **`package.json` description is stale.** It reads `"Core entity/node/runtime data model and binding system"` — the word **node** belongs to `@flighthq/node`, not here. The package owns no node concept. Suggest dropping "node" so the description matches the actual (entity/runtime/binding) scope.
- **Package Map line is thin.** `index.md`'s entry is just "entity/runtime primitives used by higher-level packages." Now that the package also owns the **binding hook**, **clone/strip serialization helpers**, and the **dev guard mode**, the one-liner undersells it. Candidate: mention the binding seam and the serialization-strip path, which is what a reader looking for "how do I serialize an entity" would grep for.

## Candidate open directions

The charter is a stub on three of four sections; each silence is a question the review had to assume an answer to. These feed the charter's Open directions for the user to settle:

1. **North star — what is "good" here?** The review assumed: _minimal, symmetric, complete-for-its-triad, and never an ECS._ The maturation roadmap states this ("do not grow into an ECS") but the charter does not yet bless it. Worth promoting to a Decision so a future agent does not over-build.
2. **`getEntityRuntime` asserting-vs-nullable — bless the TS choice.** The roadmap flagged this as the one design decision that touches every consumer. The work shipped the **asserting** form (paired with `hasEntityRuntime`) and recorded the Rust `Option` divergence in the conformance map. That is a _de facto_ ruling made by a worker; it should be ratified into `charter.md › Decisions` rather than left implicit in a conformance table.
3. **Typed binding — is `getEntityBindingAs<T>` (unchecked cast) the intended ergonomic?** It shipped as an unchecked cast over `getEntityBinding`, mirroring Rust's `downcast_ref::<T>()` shape but without the runtime check Rust gets. The roadmap called this a public-API-shape call to surface, not decide silently. It is now in the surface; the charter should confirm the unchecked-cast posture is deliberate (binding identity is owned by the attaching layer) rather than an oversight.
4. **Guard mode posture — warn-and-allow vs. enforce.** The dev guard surfaces a console warning but permits the write. Is best-effort warning the intended ceiling, or is a future enforcing mode (e.g. a `defineProperty` lock under guards) in scope? The charter's Boundaries should say whether the guard is a smoke alarm by design.
5. **Boundaries — name the non-goals explicitly.** Component storage, entity-id registries, archetype/query APIs, and the kind registry all belong to `@flighthq/node` / the kind-registry layer. The roadmap lists these as out-of-scope; the charter's `Boundaries` section should record them so the "is this a crossing?" test is answerable from the charter alone.
