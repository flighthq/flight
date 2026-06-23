# Maturation Roadmap: @flighthq/types

**Current verdict:** solid (completeness 82/100) — a broad, internally consistent, near-exhaustive header layer whose only real shortfalls are a near-total absence of self-verifying tests and a few acknowledged closed-union / generic-shape design debts.

This package is unusual: it is the SDK's header layer, not a feature leaf. "Maturity" here is not more features (the breadth is already exhaustive across ~320 one-concept files) — it is **self-verification, contract consistency, and 1:1 conformance with the Rust header**. The tiers below are weighted accordingly: Bronze/Silver are largely about proving the contract and settling provisional decisions; Gold is the genuine frontier of making the header machine-checkable, self-closing, and lock-stepped with `flighthq-types`.

## Bronze

The minimum that converts "the types happen to compile" into "the contract is guaranteed," and closes the two debts the depth review names.

- **Replace `missing.test.ts` with colocated type-level assertion tests** using `expectTypeOf`/`assertType` (Vitest's `expectTypeOf` runs at typecheck time; the package already runs Vitest in the `node` env). One `*.test.ts` per concept that carries an invariant — not per file, since pure variant declarations (`BloomEffect`, `PointLight`) have no behavior to assert. Cover the load-bearing invariants:
  - `Entity.test.ts` — `EntityWithoutRuntime<Bitmap>` strips `[EntityRuntimeKey]`; the result has no symbol key; round-trips structurally.
  - `Material.test.ts` / `RenderEffect.test.ts` / `BitmapFilter.test.ts` — open base contract: a foreign `{ kind: 'acme.Foo' }` is assignable to the base, and the base narrows on `kind`.
  - `MethodsOf.test.ts`, `PartialNode.test.ts` — utility generics produce the expected mapped shapes (method-only projection; `data` made partial-of-inner).
  - `Node.test.ts` — `NodeOf`/`NodeAny` assignability and the documented invariance behavior.
  - `ParticleForce.test.ts` — the closed union stays exhaustive (a `switch` with no `default` type-errors if a member is added).
- **Settle `ParticleForce` / `ParticleCollider` open-vs-closed.** Per the types-layout spec, closed-by-design is legitimate for hot, finite, per-frame families. Decision for Bronze: **keep them closed** and upgrade the inline `NOTE` from "deferred work, see report" to a settled "closed by design (hot per-particle dispatch, fixed membership)" rationale that cites the spec — so the contract surface reads as intentional, not provisional. (Opening them is a Gold item gated on a particles refactor; do not do it here.)
- **Fix the `DOM`/`Dom` acronym-casing drift.** Rename `DOMRenderOptions.ts` → `DomRenderOptions.ts` and `DOMStageRectangle.ts` → `DomStageRectangle.ts` (and the exported type names) to match `DomRenderState` and the PascalCase-acronym rule. Update the barrel and downstream `render-dom` imports.
- **Add a one-line module doc to every base-contract and capability-seam file that lacks one**, so the "navigable from the header alone" promise holds uniformly (the math/value-type files and many variant files are already bare; prioritize the `*Backend` seams and open contracts).

## Silver

What a well-regarded, professionally-maintained header/contract layer offers: consistent generic shapes, the kind vocabulary made first-class, and the self-containment promise actually enforced.

- **Reconcile `Signal<T>` with the Rust port's payload-parameterized shape.** Today `Signal<T extends (...args: any[]) => void>` is function-typed and leans on `any`; the locked Rust decision is `Signal<T>` by _payload_. Converge the TS header on a payload-parameterized form (`Signal<TPayload>` with `emit: (payload: Readonly<TPayload>) => void`, `slots: ((payload: Readonly<TPayload>) => void)[]`), with `void`/`never` payload for bare notifications. This is a cross-package reshape (every `*Signals` group and every `enable*` site changes) — surface it as a design decision (see Sequencing). Add `Signal.test.ts` asserting payload narrowing and the `void`-payload bare case.
- **Introduce a `Kind`-vocabulary registry type and a `KindOf<T>` helper.** A `KindOf<TEntity>` mapped type that resolves an entity type to its `*Kind` literal, and a `KnownKinds` union assembled from the built-in `*Kind` constants, so the header itself documents the built-in kind vocabulary in one navigable place (without closing extension — `Kind = string` stays the open type). Vendor-prefix convention (`'acme.Foo'`) expressed as a branded `VendorKind` helper type for third-party authors.
- **Add type-level closure assertions for the header's self-containment promise.** A `headerClosure.test.ts` (or a `packages:check` rule, decided per Sequencing) that asserts no type in `@flighthq/types` transitively imports from any `@flighthq/<impl>` package — turning the "navigable from the header alone, no impl imports" promise from prose into a checked invariant.
- **Fill the entity-quartet `*Factory` / `*TraitsKey` gaps consistently.** The depth review notes `*Factory` and `*TraitsKey` are part of the quartet convention; audit every entity file (`Bitmap`, `Shape`, `Sprite`, `Stage`, `Video`, `MovieClip`, `Tilemap`, text entities) and add the missing factory/traits-key declarations so the quartet is uniform rather than present-on-some.
- **Promote shared cross-package generics that currently live inline elsewhere.** Sweep impl packages for type aliases/interfaces that cross a package boundary but are still declared locally (the spec says these belong here); pull each into a standalone `types` file. This is the "header is complete" half of the self-containment promise (Silver's closure test is the "header has nothing extra" half).
- **`SignalConnectOptions` / `SignalData` parity tests** plus tests for the per-subsystem signal groups (`NodeSignals`, `StageSignals`, `InteractionSignals`, `MovieClipSignals`, `InputSignals`, `RenderCacheAdapterSignals`) asserting each group's payload types match the entity it belongs to.

## Gold

Authoritative: the header is machine-checked end-to-end, lock-stepped 1:1 with the Rust crate, and carries the serialization/versioning contract the whole SDK round-trips through.

- **Exhaustive type-level test coverage** — a colocated assertion test for every concept that carries a structural invariant (every entity quartet's `*Like` strip, every open contract's narrowing, every utility generic, every closed union's exhaustiveness, every `*Backend` seam's option/return shapes, every math `*Like` runtime-strip). Wire `exports:check` (or a header-specific check) to require a test for each invariant-bearing concept, so the coverage can't silently regress as types are added.
- **The scene serialization & versioning contract, declared in the header.** The types-layout spec describes "scenes are versioned intent; migrate at load," but no `SceneFormat` / `SceneVersion` / `SceneMigration` types exist in the package yet. Add them as the canonical contract: a `SceneDocument` shape (versioned, kind-string-keyed), a `SceneVersion` identifier, and a `SceneMigration` function-type seam that an opt-in, tree-shakable migration step implements. This is the header for round-tripping every entity — currently a documented intent with no type.
- **Open `ParticleForce` / `ParticleCollider`** to the `kind: Kind` base-contract form, _coordinated with_ the `@flighthq/particles` move from `switch` dispatch to registry dispatch (the Bronze decision keeps them closed; this reverses it only once the impl is ready and the extensibility need is real). Cross-package; surface as a joint decision with particles.
- **1:1 conformance lock with `flighthq-types`.** Every concept in this package has a named counterpart in the Rust crate (or an explicit, committed entry in the conformance divergence map). Add a conformance manifest the Rust conformance checker reads, so a TS type added without a Rust counterpart (or a divergence-map entry) fails the gate. This makes "the two header layers describe the same seam" enforceable, not aspirational — and folds in the `Signal` shape (now reconciled in Silver) and the entity/runtime split.
- **Branded primitive types for the value conventions the SDK relies on**, declared once here: `PackedRgba` (the `0xRRGGBBAA` color convention), `KindId`/`VendorKind` branding, `Radians`/`Degrees` if the math packages need the distinction — so misuse (passing an unpacked color, mixing angle units) is a type error at every callsite SDK-wide. Each with assertion tests proving the brand blocks raw `number` where intended.
- **Build-time header-closure enforcement in `packages:check`** (graduating Silver's test-level closure check): the header may not import any impl package, and every cross-package type must be declared here — both directions enforced in CI, with a clear error pointing at the leaking import or the missing declaration.
- **Documentation generation from the header.** Since the header _is_ the design surface, generate the navigable API map (the `npm run api` output and the Package Map's per-package type list) directly from `@flighthq/types`, so the docs cannot drift from the contract.

## Sequencing & effort

**Recommended order**

1. **Bronze first, in this order:** assertion-test scaffold (`expectTypeOf` wiring + the highest-value invariant tests) → settle `ParticleForce`/`ParticleCollider` as closed-by-design (doc-only, ~minutes) → `DOM`→`Dom` rename (mechanical, but touches `render-dom` imports) → fill missing module docs. The test scaffold is the single highest-value change and unblocks every later tier's coverage requirement. Effort: low–medium; almost all self-contained to this package, the only spill is the `Dom` rename's downstream imports.
2. **Silver:** do the `*Factory`/`*TraitsKey` audit and the inline-generic sweep (self-contained, mechanical) before the `Signal` reshape and the closure test, since those are larger. The **`Signal<T>` payload reshape is the one genuinely cross-package item in Silver** — it changes every `*Signals` group and every `enable*` callsite across the SDK and must converge with `@flighthq/signals` and the Rust `Signal<T>` decision. Effort: medium overall; the `Signal` reshape alone is medium–high and should be its own coordinated change.
3. **Gold:** exhaustive coverage and the conformance manifest are incremental once the Bronze scaffold exists. The **scene serialization/versioning contract** and **opening `ParticleForce`** are the two design-decision-heavy items and should be scheduled with their dependent packages.

**Dependencies on other packages / types**

- `Dom` rename → `@flighthq/render-dom` imports.
- `Signal<T>` payload reshape → `@flighthq/signals` and every `enable*Signals` owner package; must match the Rust `Signal<T>` shape (conformance map).
- Opening `ParticleForce`/`ParticleCollider` → blocked on `@flighthq/particles` moving to registry dispatch.
- Scene serialization types → coordinate with whatever package owns scene load/save (resources/loader and the scene migration step) so the header matches the impl seam.
- Header-closure enforcement → owned by `npm run packages:check` tooling, not this package's source.
- 1:1 conformance lock → the Rust `flighthq-types` crate and the conformance checker/divergence map.

**Cross-package / design-decision items to surface (do not act on autonomously)**

- **`Signal<T>` function-shape → payload-shape reshape** — SDK-wide signal seam change; needs sign-off and a coordinated rollout with `@flighthq/signals` and the Rust port.
- **Opening `ParticleForce`/`ParticleCollider`** — reverses the Bronze closed-by-design decision; only once particles needs user-extensible forces and moves to registry dispatch.
- **Scene serialization/versioning contract** — defines the round-trip seam for the entire SDK; a foundational design decision about scene format and migration ownership, not a local type addition.
- **Branded primitives (`PackedRgba`, angle units)** — touches every callsite that produces/consumes these values across the SDK; high value, high blast radius, needs a deliberate go-ahead.
