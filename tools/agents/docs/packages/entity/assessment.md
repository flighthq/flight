---
package: '@flighthq/entity'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/entity

The review verdict is **solid — 92/100**: the entity↔runtime↔binding primitive is symmetric and complete for its deliberately thin domain. The Bronze/Silver/Gold maturation roadmap landed in full and verifies 1:1 against the diff, so the roadmap is **absorbed and spent** — its members are all shipped, not pending work. What remains is not missing API surface but cross-seam residue: TS↔Rust conformance (cross-worktree), a serializer consumer that does not yet exist, and charter/doc revisions that are the user's gate, not a sweep.

Because the in-package surface is feature-complete, `Recommended` is intentionally short. The bulk of the residue is either parked (`Backlog`) or a direction the user must settle (routed to the charter's Open directions, listed at the bottom — not edited into the charter here).

## Recommended

Sweep-safe: within `@flighthq/entity` only, no cross-package coupling, no breaking change, no open design decision.

- **Drop "node" from the `package.json` description.** It reads `"Core entity/node/runtime data model and binding system"`; the **node** concept belongs to `@flighthq/node`, and this package owns no node type. Change to an entity/runtime/binding-scoped description. Purely within `packages/entity/package.json`, non-design, matches the actual scope. (review.md › Contract & docs fit)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction or a consumer.

- **TS↔Rust behavioral conformance pass.** _Parked: cross-worktree._ The intentional divergences (`get_entity_runtime` asserting-vs-`Option`; `get_entity_runtime_mut` Rust-only) are already recorded in the conformance map, but the assertion-ported Rust `#[cfg(test)]` mirror of the TS tests requires Rust-worktree coordination. This is a conformance-instrument gap, not a TS API gap — it does not change anything in `@flighthq/entity` and so cannot be a within-package sweep. (review.md › Gaps)

- **Find/wire a caller for `stripEntityRuntime`.** _Parked: waiting on a consumer._ The function is the canonical serialization-strip path, ready and tested, but no scene serializer exists to call it (the versioned-migration model in `types-layout.md` is unbuilt). Adding the consumer is work in the serializer package, not here. Revisit when scene serialization is built. (review.md › Gaps)

- **Audit `@flighthq/node` for inlined lazy-runtime logic.** _Parked: cross-package._ The roadmap noted that `ensureEntityRuntime`/`hasEntityRuntime`/`detachEntityBinding` are now the functions every runtime-attaching subsystem should build on instead of re-implementing the lazy/guard pattern. A quick audit of `@flighthq/node` to replace any inlined lazy-runtime logic with these is a change in `@flighthq/node`, so it is cross-package, not a sweep here. (reviews/maturation/depth/entity.md › Sequencing — primary-consumer note)

- **Enrich the Package Map line in `index.md`.** _Parked: shared doc + user's gate._ The one-liner ("entity/runtime primitives used by higher-level packages") now undersells a package that also owns the binding seam, the clone/strip serialization helpers, and the dev guard mode. The review flags this as a candidate doc revision ("the user's gate, not mine"), and it edits the shared codebase-map doc rather than a file under `packages/entity/` — so it is not a within-package sweep. (review.md › Contract & docs fit)

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

---

## Routed to the charter's Open directions (not edited into the charter)

The charter is a stub on three of its four sections (`North star`, `Boundaries`, `Decisions` are all `TODO`). Each silence is a question the review had to assume an answer to. These are **design / direction** items — they need a ruling, so they do **not** belong in `Recommended`. Surfaced here for the user to settle into `charter.md`:

1. **North star — bless "minimal, symmetric, complete-for-its-triad, never an ECS."** The maturation roadmap states the "do not grow into an ECS" boundary; promote it to a charter Decision so a future agent does not over-build.
2. **Ratify the `getEntityRuntime` asserting-vs-nullable ruling.** The shipped surface chose the **asserting** accessor paired with `hasEntityRuntime`, and recorded the Rust `Option` divergence in the conformance map. That is a _de facto_ worker ruling on the one decision that touches every consumer; it should be ratified into `charter.md › Decisions`, not left implicit in a conformance table.
3. **Confirm `getEntityBindingAs<T>` (unchecked cast) is the intended ergonomic.** It shipped as an unchecked cast mirroring Rust's `downcast_ref::<T>()` shape but without Rust's runtime check. The charter should confirm the unchecked-cast posture is deliberate (binding identity owned by the attaching layer), not an oversight.
4. **Guard-mode posture — warn-and-allow vs. enforce.** `createGuardedEntity` surfaces a console warning but permits the write (it cannot reliably distinguish a trusted writer from a raw poke). The charter's Boundaries should state whether best-effort warning is the intended ceiling or a future enforcing mode (e.g. a `defineProperty` lock) is in scope.
5. **Name the non-goals explicitly in Boundaries.** Component storage, entity-id registries, archetype/query APIs, and the kind registry all belong to `@flighthq/node` / the kind-registry layer. Recording them in `charter.md › Boundaries` makes the "is this a crossing?" test answerable from the charter alone.

## Structural-forks note

No SDK-wide structural fork bites this package. `@flighthq/entity` defines no `kind` switch (fork B registry-vs-union does not apply), is not a subject with a format/backend triad (the subject-triad and plurality guard do not apply), and proposes no new package (the bedrock test does not fire). It is a value/identity primitive in the dependency floor (`@flighthq/types` only), correctly kept off the fork surface. Its one fork-adjacent property — being a Wasm-mixable value-typed leaf candidate (fork D, axis 2) — is a property of the leaf, not in-package work, and needs no action here.
