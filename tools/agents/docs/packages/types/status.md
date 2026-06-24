---
package: '@flighthq/types'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# types — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/types

**Session date:** 2026-06-24 **Starting score:** 82/100 (solid) **Estimated ending score:** 90/100

## Implemented APIs

### Bronze — completed in full

**1. Fixed DOM/Dom acronym-casing drift**

- Renamed `DOMRenderOptions.ts` → `DomRenderOptions.ts` (the exported type `DomRenderOptions` was already correctly named inside)
- Renamed `DOMStageRectangle.ts` → `DomStageRectangle.ts` (the exported type `DomStageRectangle` was already correctly named inside)
- Updated intra-package import in `DomRenderState.ts` to use the new filename
- Updated the barrel (`index.ts`) to reference the new filenames
- All downstream packages import by type name (not by file path), so no downstream changes were needed

**2. Settled ParticleForce / ParticleCollider as closed-by-design**

- Replaced provisional "NOTE: ... surfaced as a follow-up" comments in `ParticleForce.ts` and `ParticleCollider.ts` with settled "Closed by design" rationale citing the types-layout spec (hot per-frame families with fixed membership are legitimately closed)
- Contract surface now reads as intentional, not provisional

**3. Added type-level assertion tests — replaced `missing.test.ts`**

Deleted the `missing.test.ts` placeholder (which was a single `assert(true)`) and created eight colocated test files:

- **`Entity.test.ts`** — asserts `EntityRuntimeKey` is `Symbol.for('EntityRuntime')`, `EntityWithoutRuntime<T>` strips the runtime key, round-trips structurally, `Kind` is a plain string
- **`Material.test.ts`** — asserts `Material` is an open contract (foreign `acme.Shimmer` kind is assignable to base), narrows on `kind` discriminant, `MaterialLike` strips the runtime key and accepts plain objects, `DefaultMaterialKind` is the literal string `'DefaultMaterial'`, compile-time proof that `Material extends Entity` and `MaterialLike` has no runtime key
- **`RenderEffect.test.ts`** — asserts `RenderEffect` is an open contract (foreign `acme.Sparkle` kind accepted), narrows on `kind`, optional `enabled`/`intensity` fields are absent by default
- **`BitmapFilter.test.ts`** — asserts `BitmapFilter` is an open contract (foreign `acme.Scanlines` kind accepted), narrows on `kind`, accepts any string kind
- **`MethodsOf.test.ts`** — asserts only method keys are preserved (data properties excluded), empty result for data-only objects, method signatures are preserved accurately
- **`PartialNode.test.ts`** — asserts `data` inner fields become partial, top-level non-data fields become optional, full node round-trips, null-data case handled
- **`Node.test.ts`** — asserts `NodeKind` is `'Node'`, `NodeAny` accepts nodes from any graph family, `NodeRuntime` has required numeric id fields, compile-time checks that `Node extends Entity` and `NodeRuntime extends EntityRuntime`
- **`ParticleForce.test.ts`** — exhaustiveness check: a `switch` with `assertNever` in the default branch verifies all 5 members (AttractorForce, DragForce, TurbulenceForce, VortexForce, WindForce) are handled; compile-time union-membership equality check; runtime tests for each member's assignability to `ParticleForce`

All 40 tests pass. TypeScript (`tsc -b`) passes cleanly with no new errors.

### Silver — partial completion

**Entity quartet `*DataFactory` / `*RuntimeFactory` audit — completed**

Audited all display object entity files. Added `*DataFactory` and `*RuntimeFactory` type aliases (following the `DisplayObject.ts` pattern) to all entity files that were missing them:

- `Bitmap.ts` — added `BitmapDataFactory`, `BitmapRuntimeFactory<R>`
- `MovieClip.ts` — added `MovieClipDataFactory`, `MovieClipRuntimeFactory<R>`
- `NativeText.ts` — added `NativeTextDataFactory`, `NativeTextRuntimeFactory<R>`
- `QuadBatch.ts` — added `QuadBatchDataFactory`, `QuadBatchRuntimeFactory<R>`
- `RichText.ts` — added `RichTextDataFactory`, `RichTextRuntimeFactory<R>`
- `Shape.ts` — added `ShapeDataFactory`, `ShapeRuntimeFactory<R>`
- `Sprite.ts` — added `SpriteDataFactory`, `SpriteRuntimeFactory<R>`
- `Stage.ts` — added `StageDataFactory`, `StageRuntimeFactory<R>`
- `TextLabel.ts` — added `TextLabelDataFactory`, `TextLabelRuntimeFactory<R>`
- `Tilemap.ts` — added `TilemapDataFactory`, `TilemapRuntimeFactory<R>`
- `Video.ts` — added `VideoDataFactory`, `VideoRuntimeFactory<R>`

`DisplayContainer` was intentionally skipped: it has no distinct `*Data` type of its own (inherits `DisplayObjectData` directly) and no `*Kind`, so a factory would be structurally identical to `DisplayObjectDataFactory`.

## Deferred Items and Why

**`Signal<T>` payload-parameterized reshape** — DEFERRED (cross-package design decision) This is an SDK-wide signal seam change: every `*Signals` group, every `enable*` callsite, and the Rust port's `flighthq-types` crate all need to converge. The TS `Signal<T extends (...args) => void>` vs Rust `Signal<T>` (by payload) divergence is real and worth resolving, but it requires sign-off and a coordinated rollout across `@flighthq/signals` and every signal owner package. Surface for next architectural session.

**`KindOf<T>` helper / `KnownKinds` union** — DEFERRED (Silver, not blocking) A `KindOf<TEntity>` mapped type resolving an entity to its `*Kind` literal, plus a `KnownKinds` union assembled from built-in constants, would make the built-in kind vocabulary navigable from the header. Feasible in isolation but a significant mechanical sweep (must touch every entity's `*Kind` export and the barrel). Recommended for a dedicated session.

**Header-closure test (`headerClosure.test.ts`)** — DEFERRED (Silver) A test that asserts no type in `@flighthq/types` imports from any `@flighthq/<impl>` package. Would convert the "navigable from the header alone" prose promise into a checked invariant. Requires scanning the tsconfig project graph; better implemented as a `packages:check` rule than a Vitest test. Tagged for the tooling session.

**Open `ParticleForce` / `ParticleCollider`** — DEFERRED (Gold, requires particles refactor) Correctly deferred at Bronze (closed-by-design is now settled). Reopening requires `@flighthq/particles` to move from `switch` dispatch to registry dispatch. This is a joint decision with the particles package; do not do it here.

**Scene serialization / versioning contract** — DEFERRED (Gold) `SceneDocument`, `SceneVersion`, `SceneMigration` types are not yet defined. This is a foundational design decision about scene format and migration ownership. It requires coordination with whatever package owns scene load/save. Surface for a dedicated design session.

**Branded primitives (`PackedRgba`, angle units)** — DEFERRED (Gold) High value, high blast radius (every callsite that produces/consumes packed colors or angle values). Needs deliberate go-ahead from the project owner before proceeding.

**1:1 conformance lock with `flighthq-types` (Rust)** — DEFERRED (Gold) Requires a conformance manifest and Rust-side counterpart additions. Depends on the conformance checker tooling being in place. Tagged for the Rust conformance session.

**Signal group payload tests** — not implemented Testing `NodeSignals`, `StageSignals`, etc. payload types at the assertion level was planned for Silver. Skipped because the `Signal<T>` generic shape is deferred — testing the payload shapes against a function-typed generic is less useful than testing them against a payload-parameterized generic. Once `Signal<T>` is reshaped, revisit these tests.

## Concerns and Surprises

**The `DOMRenderOptions`/`DOMStageRectangle` filenames were inconsistent with their own exported type names.** Both files already had the correct `Dom`-prefixed type names inside them — the mismatch was purely at the filename level. This suggests the rename had been partially applied at some prior point and the file rename was missed. Fixed.

**`missing.test.ts` used `assert` (bare Node assert) not Vitest's `expect`.** The placeholder was written for a different test environment. The new tests use `expect` and `expectTypeOf` consistently with the rest of the codebase.

**`expectTypeOf(...).toEqualTypeOf<'DefaultMaterial'>()` fails TypeScript at `tsc` level** even though it passes at runtime (Vitest). The Vitest `expectTypeOf` generic shape does not always infer const-string literals correctly when the source is a module-level `const`. Replaced with a direct compile-time assignment assertion (`const kindLiteral: 'DefaultMaterial' = DefaultMaterialKind`) which is cleaner and equally expressive.

**No `*TraitsKey` gaps were found.** The depth review mentioned `*TraitsKey` alongside `*Factory` as potentially missing. Only `DisplayObject.ts` needed `DisplayObjectTraitsKey`, and it already exports it. Child entities (`Sprite`, `Shape`, etc.) do not need their own `*TraitsKey` because they share the parent's traits shape.

**Pre-existing type errors in other packages** — several unrelated packages (`statusbar`, `surface`, `velocity`, `webcam`) have pre-existing type errors that appeared in `npm run check` output. These are not introduced by this session's changes and were present before.

## Suggestions for Future Sessions

1. **`Signal<T>` payload-shape coordination** — schedule a dedicated cross-package session with `@flighthq/signals`, all signal-owner packages, and the Rust conformance map. The `Signal<T>` shape is load-bearing for Rust↔TS conformance and worth a focused pass.

2. **`KindOf<T>` / `KnownKinds` utility** — straightforward Silver work once the factory audit is done. Adds the kind vocabulary as a navigable, machine-checkable part of the header.

3. **Header-closure enforcement in `packages:check`** — add a graph walk that verifies no `@flighthq/types` source transitively imports from an impl package. This makes the "navigable without impl imports" promise CI-enforced.

4. **Scene serialization contract** — requires a design session. The types-layout spec documents the intent; it just needs to be shaped into `SceneDocument`/`SceneVersion`/`SceneMigration` types with buy-in from the scene-owning packages.

5. **Branded primitives** — `PackedRgba` as a branded `number` is a high-leverage change for catching color-convention bugs across the SDK. Worth a deliberate design go-ahead discussion.
