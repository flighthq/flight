---
package: '@flighthq/velocity'
updated: 2026-07-13
basedOn: ./review.md
---

# velocity — Assessment

Sorted from the 2026-07-13 re-review (solid, 82/100). The three previously Approved items have all landed and are consumed from the ledger; nothing below repeats them. The package is clean against its charter — the remaining work is small hygiene plus test/diagnostic depth in-package, with the real payoff (affine-sample adoption) parked cross-package.

## Recommended

Sweep-safe: within `@flighthq/velocity` (and its own header lines in `@flighthq/types/Velocity.ts`), no cross-package coupling, no breaking change, no open design decision.

1. **Fix the stale `VelocityContributor` doc comment** in `@flighthq/types/Velocity.ts:36` — it names `contributeNodeVelocity / suppressNodeVelocity`, which do not exist; the real names are `contributeVelocity` / `suppressVelocity`. Comment-only, header layer, velocity's own type. — review.md#contract--docs-fit

2. **Add `explainVelocity` (shakeable query).** `getVelocity`'s silent zero has three distinct causes — no sample, stale sample (not touched this frame), explicit zero (`suppressVelocity`) — and the diagnostics convention gives every silent sentinel an `explain*` returning plain data. Separately importable, costs non-importers nothing. — review.md#gaps

3. **Add a subtree-walk test for `contributeTransformVelocity`.** The walker's recursion and the child trait-cast path are untested: add a parent+child case (both gain velocity from a parent move; an explicit override on the child is honored while its `previousWorldTransform` still commits). — review.md#gaps

4. **Pin the reprojection-vs-override semantics with a test.** Assert the current behavior: `getVelocitySampleAt` reprojects transforms and is unaffected by `contributeVelocity`/`suppressVelocity`. This documents the seam by test without deciding whether it should change (that ruling stays an Open direction; if it lands the other way, the test is the one-line flip). — review.md#gaps

5. **Rename the mislabeled `velocitySample.test.ts` case.** The test called "is alias-safe when out references a different object" is a plain correctness check — `out` cannot alias a `Matrix` input. Rename to what it verifies. — review.md#gaps

## Backlog

Parked — each with the reason it is not sweep-safe.

- **GL/Wgpu velocity-writer adoption of `getVelocitySampleAt`.** _Parked — cross-package._ The payoff of the affine sample (correct per-pixel velocity on rotating/scaling nodes); today the writers read only coarse per-node `getVelocity`. Touches `displayobject-gl`/`displayobject-wgpu`; sequencing is a candidate Open direction.

- **Velocity-pass row in `render-backend-support.md` (+ architecture mention).** _Parked — admin-doc revision, user's gate._ The shipped gl/wgpu velocity pass appears in neither render doc; the backend gap matrix should carry it (gl+wgpu yes, canvas/dom no).

- **`dt` / per-second normalization.** _Parked — design decision._ The charter is silent on the time base; reintroducing the removed lineage's `beginVelocityFrame(field, dt?)` shape needs a ruling (candidate Open direction), not a sweep.

- **Angular velocity.** _Parked — design decision._ Removed with the builder lineage; whether it returns as a first-class field or stays recoverable via `getVelocitySampleAt` is a charter call.

- **Unconsumed `VelocityContributor` type.** _Parked — mild design call + header-layer surface._ Zero consumers anywhere; fork B's "don't build the seam before the consumer" says remove, but it also documents the intended contributor contract. Remove-or-keep is a one-line ruling for a direction session.

- **Multi-frame history / TAA reprojection.** _Parked — larger scope._ An N-deep previous-transform ring changes the sample shape and allocation model; wait for a real TAA/trails consumer.

- **Buffer-write convention helper (`VelocityWriteParams`).** _Parked — cross-package._ Centralizing the screen→buffer scale + Y-axis convention only pays off with gl/wgpu adoption.

- **Transform-trait hardening.** _Parked — cross-package._ The `child as unknown as Transform2DNode` cast; the fix lives in `@flighthq/node` (charter Open direction 3).

- **Rust `flighthq-velocity` parity.** _Parked — global posture._ TS is the spec; Rust conforms in parity passes (charter Decision 5).

## Approved

- [2026-07-02 · picked] Sweep items 1–3: remove contributeAffineVelocity, tighten getVelocitySampleAt matrix param, add Package Map entry
