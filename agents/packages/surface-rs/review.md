---
package: '@flighthq/surface-rs'
status: solid
score: 72
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/surface-rs/src
  - head/packages/surface/src (the dependency this delta is judged against)
  - changes.patch (packages/surface-rs slice)
  - charter.md
---

> **Historical — package spun out to `flight-rs` (2026-07-10).** This merge-gate review predates the spin-out and refers to `packages/surface-rs/` code that no longer lives in this monorepo. Kept for design/history; not an actionable local gate. See charter for the spin-out note.

# Review: @flighthq/surface-rs (merge gate — integration-b2824e3d8 vs approved origin/main)

## Verdict

`solid — 72/100` **as a merge candidate** (the package itself is authoritative; the **delta** is not yet fit to merge). This review judges only the head-vs-base delta under `integration-b2824e3d8/`, as a gate into the approved baseline (`origin/main` eb73c3d74). The baseline is the blessed floor and is not under review.

The delta is overwhelmingly good test-hardening — a mechanical shadow-coverage gate, per-enum discriminant cardinality tests, palette-map all-null coverage, aliased-in-place version tests, wasm-memory-growth stability tests, sub-region and zero-area edge cases, and durable cross-language drift comments. If that were all, this would merge clean at ~94.

It does **not** merge clean because the delta also changed `floodFillSurface`'s public signature and rewrote two test call sites to a **`@flighthq/surface` signature that does not exist in this integration head**. The surface-rs change was authored against an intended upstream change (`floodFillSurface(..., visited)` / `scrollSurface(..., scratch)`) that **did not land** in `@flighthq/surface` within this same tree. The result is a binding that mismatches its own dependency and a test that cannot compile. This is a hard merge-gate failure (standards 6 and 7), not a style nit, and it is squarely in the delta — base was correct.

## What the delta gets right (approve-as-is)

- **`wasm shadow conformance` gate** — `b2824e3d8:packages/surface-rs/src/surfaceWasm.test.ts` adds `EXPECTED_WASM_SHADOWS` and asserts every name is exported from `surfaceWasm` and is a **distinct function object** from the `@flighthq/surface` reference (`expect(rsFn, ...).not.toBe(refFn)`). A future surface export that surface-rs forgets to shadow, or one that silently falls through to JS, turns this red mechanically. Correct shape for keeping a drop-in honest over time.
- **`wasm discriminant map cardinality`** — seven describe blocks, one per discriminant family, each iterating every variant and asserting byte-exact (or hit-count / `expectByteClose`) agreement with the reference: `BlendMode` (15), `SurfaceBevelType` (3), `SurfaceConvolutionEdge` (3), `SurfaceDisplacementMapMode` (4), `PixelOrder` (4), `SurfaceResizeMode` (3), `ThresholdOperation` (6). The type imports resolve correctly (`SurfaceBevelType` et al. are re-exported via `export * from './surfaceBevel'` in the surface barrel), so these typecheck.
- **Discriminant-drift comments** — `b2824e3d8:packages/surface-rs/src/surfaceWasm.ts` (the `878a883,896` hunk) names the exact Rust `*_from_u8` decode function each `repr(u8)` map must track, and the `BlendMode` Normal=10-via-`_`-wildcard note. This is a durable semantic comment that closes the prior "silent cross-language drift" hazard without a code generator. Good.
- **Palette-map all-null + alpha-only tests**, **aliased-in-place version tests** (`flipSurfaceHorizontal`/`Vertical`/`rotateSurface180` with `region===region` must not bump `version`; distinct surfaces must), **wasm memory-growth stability** (repeated large `gaussianBlurSurface`/`medianSurface`/`convolveSurface` calls do not throw — guards the `asUint8` detach-on-growth regression), **sub-region marshalling**, and **zero-area region** edge cases. All additive, all sharpen the conformance harness, none touch hot loops or bundle shape.

## What blocks the merge (must fix before merge)

### 1. `floodFillSurface` signature now diverges from `@flighthq/surface` — drop-in parity broken (standard 6, charter violation)

`b2824e3d8:packages/surface-rs/src/surfaceWasm.ts` (hunk `489c489,493`):

```ts
// `visited` matches the `@flighthq/surface` signature (a caller-provided scratch
// buffer the JS implementation uses to track filled pixels). ...
export function floodFillSurface(out: Surface, x: number, y: number, color: number, _visited: Uint8Array): void {
```

The comment's central claim is **false in this tree**. The actual reference, `b2824e3d8:head/packages/surface/src/surfaceFill.ts:35`, is unchanged from base:

```ts
export function floodFillSurface(out: Surface, x: number, y: number, color: number): void {
```

— four parameters, using a module-level `_floodFillVisited` buffer (`surfaceFill.ts:4`). `changes.patch` does **not** touch `packages/surface/src/surfaceFill.ts` at all. So the delta took a 4-arg, signature-identical override and made it a **5-arg override of a 4-arg function**. The charter is explicit that surface-rs provides "byte-for-byte-compatible, **identical-signature** implementations ... while re-exporting the rest of the surface API unchanged." A 5-vs-4 parameter mismatch is the exact failure mode the package exists to avoid: a consumer that swaps `@flighthq/surface` for `@flighthq/surface-rs` now sees a _different_ `floodFillSurface` arity. **Revert this signature to `(out, x, y, color)`** unless and until the matching `@flighthq/surface` change actually lands in the same merge.

### 2. The test will not compile — excess args to the reference (standard 7: "compiles")

`tsconfig.base.json` sets `strict: true` and `surface-rs/tsconfig.json` includes `src` (so `tsc -b` typechecks `src/*.test.ts`, per the codebase-map testing rules). Two new/edited call sites pass **excess arguments** to reference functions that have no such parameter:

- `b2824e3d8:packages/surface-rs/src/surfaceWasm.test.ts` (floodFill hunk):
  ```ts
  reference.floodFillSurface(refSurface, 4, 4, 0xff8800ff, refVisited);
  ```
  but `@flighthq/surface`'s `floodFillSurface` takes 4 args → `TS2554: Expected 4 arguments, but got 5`.
- `b2824e3d8:packages/surface-rs/src/surfaceWasm.test.ts` (scroll hunk `755c865,866`):
  ```ts
  const scratch = new Uint8ClampedArray(refSurface.width * refSurface.height * 4);
  reference.scrollSurface(refSurface, 2, -1, scratch);
  ```
  but `b2824e3d8:head/packages/surface/src/surfaceTransform.ts:145` is `scrollSurface(out, dx, dy)` (3 args, unchanged from base; not touched by `changes.patch`) → `TS2554: Expected 3 arguments, but got 4`.

Both are excess-argument errors against `strict` TS, so the package fails `tsc -b` / `npm run check`. Note the surface-rs `scrollSurface` _export_ is unchanged (still 3-arg, correct) — only the **test's reference call** was wrongly given a 4th arg, so this is a test-only fix for scroll, and a signature-revert + test fix for flood-fill.

### 3. Durable comment asserts a falsehood (standard 6 hygiene)

Even setting aside arity, the `_visited` comment ("matches the `@flighthq/surface` signature") is a durable semantic comment that is wrong against the code in the same tree. Durable comments must explain what the code _is_; this one mis-states the dependency. If the upstream change is intended, the correct sequence is to land it in `@flighthq/surface` first (or in the same commit), not to assert it from the binding side.

## Standards scorecard (delta only)

1. **Composition / bedrock** — PASS. No new fused subject, no config-gated branch; the additions are tests + comments.
2. **Naming clarity** — PASS. `_visited` underscore-prefixed unused param is idiomatic; `EXPECTED_WASM_SHADOWS` is self-identifying.
3. **Tree-shaking / bundle invariant** — PASS. `sideEffects: false`, single `.` export, no eager registration; no new shared-hot-loop branch. Test-only growth does not ship.
4. **Registry vs closed union** — N/A to the delta (the discriminant maps mirror closed Rust enums by design; no new closed switch over a _growing_ family was introduced).
5. **Subject triad + plurality** — N/A; no format/backend code moved or split.
6. **Contract hygiene** — **FAIL** (defects 1 + 3). Signature parity with `@flighthq/surface` is the package's contract, and the delta breaks it for `floodFillSurface`; the explanatory comment is false against the tree.
7. **Tests & honesty** — **FAIL** (defect 2). The new tests are excellent in intent but two call sites do not compile against the reference in this head; `tsc -b` would reject them. Once defects 1–2 are fixed, this axis flips to a strong PASS — the harness additions are the best part of the delta.

## Self-check (objections re-audited, ungrounded ones dropped)

- _Kept:_ defects 1–3 are grounded in cited head hunks and verified against the **unchanged** `@flighthq/surface` source in the same tree (`surfaceFill.ts:35`, `surfaceTransform.ts:145`, both absent from `changes.patch`). They critique the delta, not the approved base — base's `floodFillSurface` was the correct 4-arg override.
- _Dropped:_ a first pass flagged the `_visited` param as a `noUnusedParameters` violation. Dropped — `tsconfig.base.json` does not set `noUnusedParameters`, and the param is underscore-prefixed regardless. The compile failure is the excess-arg `TS2554` on the **reference** calls, not the unused param.
- _Dropped:_ a concern that the new discriminant-cardinality `type` imports (`SurfaceBevelType` etc.) might not resolve from `@flighthq/surface`. Verified they are re-exported via the surface barrel's `export *`; the imports are fine.
- _Pre-release latitude applied:_ there is no back-compat duty here, so the fix is a clean revert/realign, not a shim. The objection survives latitude because a non-compiling, dependency-mismatched binding is a defect regardless of compat obligations.
