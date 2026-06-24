---
package: '@flighthq/types'
updated: 2026-06-24
basedOn: ./review.md
---

# types — Assessment

Sorted from `review.md` (score `solid — 88`). The prior `reviews/depth/types.md` and `reviews/maturation/depth/types.md` roadmaps are absorbed and superseded by the review. The charter is a **stub** (North star / Boundaries / Decisions all `TODO`), so almost everything the review surfaces is either a charter decision or crosses a package boundary, which keeps `Recommended` deliberately small. The header layer's Bronze tier already landed in this diff (the eight assertion tests, the `DOM`→`Dom` rename, the `ParticleForce` closed-by-design rationale) and is _verified_ in the review — so it is not re-recommended; the remaining within-package, non-design-decision work is thin. The big-ticket items (`Signal<T>` payload reshape, scene serialization, branded primitives, `KindOf`/`KnownKinds`, opening `ParticleForce`, the Rust conformance lock, header-closure enforcement) are SDK-wide reshapes, cross-package coordination, or another doc's owner — all routed to the charter's Open directions, none into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/types`, no cross-package coupling, no breaking change, no open design decision.

- **Add a `Signal.test.ts` for the current (function-typed) `Signal` shape.** `Signal.ts` is one of the most load-bearing seams and has no colocated test (the eight new tests skipped it, deferred behind the payload reshape). A test asserting the _present_ contract — `emit: T` matches the parameterized slot type, `SignalData<T>` carries the slot/priority/enabled/connection arrays — is sweep-safe: it documents and pins today's shape without prejudging the reshape, and gives the later payload change a before/after assertion. Within-package, no signature change. — review.md (Gaps: "`Signal<T>` is function-typed"; Contract & docs fit).

- **Add invariant-bearing assertion tests for the remaining quartet/contract concepts not yet covered.** The eight tests cover the highest-value invariants; the _same pattern_ extends sweep-safely to more entity `*Like` strips and open-contract narrowing (e.g. a `DisplayObject` / `Sprite` / `Stage` `*Like` strip test, the `RenderEffect`/`BitmapFilter` `*Like` cases) without any design decision — it is more of the work already blessed and landed. Keep it to invariant-bearing concepts (skip pure declaration/variant files), consistent with the test-policy the review asks the charter to bless. Within-package, additive. — review.md (Gaps: "Assertion coverage is invariant-bearing only, not exhaustive").

- **Add a one-line module doc to any base-contract / capability-seam file still lacking one.** The "navigable from the header alone" promise wants every open contract and `*Backend` seam to carry its ownership/semantics in a header comment (the math/value-type and pure-variant files may stay bare). This is the residual of the prior roadmap's Bronze doc-sweep item; it is pure in-source comments, no signature or type change. — review.md (Present capabilities: "Doc comments as contract"; the prior maturation Bronze doc-sweep).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **`Signal<T>` payload-parameterized reshape** (converge TS `Signal<T extends (...args) => void>` onto the Rust `Signal<T>`-by-payload shape; removes the file-level `no-explicit-any`). **Parked:** SDK-wide signal-seam change touching every `*Signals` group and every `enable*` callsite, and must converge with `@flighthq/signals` and the Rust conformance map. The single clearest cross-package design fork. Routed to Open directions.

- **`KindOf<TEntity>` + `KnownKinds` union + `VendorKind` brand.** Make the built-in kind vocabulary navigable/checkable from the header (keeping `Kind = string` open). **Parked:** feasible in isolation but a significant mechanical sweep that must touch every entity's `*Kind` export and the barrel, and the `VendorKind` brand is a convention decision — larger than a within-package sweep and benefits from a deliberate go-ahead. Routed to Open directions.

- **Header self-containment enforcement** (`headerClosure.test.ts` _or_ a `packages:check` graph rule: no `types` file transitively imports a `@flighthq/<impl>` package; every cross-package type is declared here). **Parked:** the review flags this as the largest gap, but the mechanism likely belongs to `packages:check` tooling, not this package's source — another doc's/tooling owner. And the test-vs-rule choice is itself an Open direction. Routed to Open directions.

- **Test policy + `exports:check` reconciliation for a type-only package.** Record the rule that invariant-bearing concepts carry a colocated type-level test while pure declaration/variant files do not. **Parked:** a contract/tooling decision (the carve-out lives in `CONTRACT.md` / `exports:check`, not in `types` source). Candidate contract revision. Routed to Open directions.

- **Scene serialization / versioning contract** (`SceneDocument` / `SceneVersion` / `SceneMigration`). **Parked:** a foundational design decision about scene format and migration ownership; must be coordinated with whatever package owns scene load/save. Cross-package + charter-level. Routed to Open directions.

- **Branded primitive types** (`PackedRgba`, `Radians`/`Degrees`). **Parked:** high value, high blast radius — every callsite that produces/consumes packed colors or angle values SDK-wide. Needs a deliberate project-owner go-ahead before any sweep. Routed to Open directions.

- **1:1 conformance lock with `flighthq-types` (Rust)** (a conformance manifest the Rust checker reads; folds in the `Signal` divergence). **Parked:** depends on the conformance-checker tooling and Rust-side counterparts being in place; cross-repo. Routed to Open directions.

- **Open `ParticleForce` / `ParticleCollider`** to the `kind: Kind` base-contract form. **Parked:** the closed-by-design decision is settled and correct _today_; reversing it is gated on `@flighthq/particles` moving from `switch` to registry dispatch — a joint decision with particles (structural fork B). Do not do it here. Routed to Open directions.

- **Codebase-map "kind symbols" Map-line wording fix.** The Package Map describes `types` as holding "kind symbols"; kinds are strings post-decision. **Parked:** a one-word edit to the codebase map, owned by that doc, not by `types`. Candidate revision for the map owner.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is a stub, so the foundational questions below are _why_ most of the backlog stays parked — the header layer has no captured North star to judge them against.

1. **North star** — confirm the durable bar: the full SDK API shape is navigable and pinnable from `@flighthq/types` alone, with no impl import, and _mechanically enforced_.
2. **Self-containment: test or `packages:check` rule** — which mechanism enforces "header imports no impl, and every cross-package type is declared here," both directions.
3. **Test policy for a type-only package** — bless "invariant-bearing concepts carry a type-level test; pure declarations do not," and reconcile it with `exports:check`.
4. **`Signal<T>` shape & Rust conformance** — payload-reshape to match Rust (cross-package), or formally record the divergence in the conformance map.
5. **Kind vocabulary as first-class** — adopt `KindOf` / `KnownKinds` / `VendorKind`.
6. **Scene serialization / versioning contract ownership** — declare `SceneDocument` / `SceneVersion` / `SceneMigration` here and decide who owns load/save/migration.
7. **Branded primitives** — adopt `PackedRgba` (and `Radians`/`Degrees`) brands declared once here.
8. **1:1 conformance lock with `flighthq-types` (Rust)** — make a conformance manifest a CI gate.
9. **Opening `ParticleForce`/`ParticleCollider`** (fork B) — only once particles needs user-extensible forces and moves to registry dispatch; a joint decision with particles.
