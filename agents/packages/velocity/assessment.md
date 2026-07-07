---
package: '@flighthq/velocity'
updated: 2026-07-02
basedOn: ./review.md
---

# velocity — Assessment

Sorted from the depth review (70/100, REVISE — barrel blocker since fixed), verified against the live tree (21 exports, 51 tests, 4 source files), and the direction session (2026-07-02). Five charter decisions blessed. The package is small, focused, and architecturally clean. The main action item is removing the duplicate `contributeAffineVelocity`.

## Recommended

Sweep-safe: within `@flighthq/velocity`, no cross-package coupling, no open design decision.

1. **Remove `contributeAffineVelocity`.** It is behaviorally identical to `contributeTransformVelocity` — both store `tx/ty` delta as velocity and copy the full world matrix to `previousWorldTransform`. The unique value is `getVelocitySampleAt`, which works with either contributor. Remove `contributeAffineVelocity`, delete the duplicate walker, update the barrel. Move `getVelocitySampleAt` to its own file or into `velocityField.ts`. Update tests: any test using `contributeAffineVelocity` should switch to `contributeTransformVelocity`. Per charter Decision #1.

2. **Tighten `getVelocitySampleAt` matrix parameter to `Readonly<Matrix>`.** Replace the inline structural type `Readonly<{ a; b; c; d; tx; ty }>` with `Readonly<Matrix>` imported from `@flighthq/types`. Type-only, no runtime change. Per charter Decision #3.

3. **Add Package Map entry for velocity.** The codebase map's Package Map section is missing an entry for `@flighthq/velocity`. Add it in the appropriate section. Per charter Decision #4.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Buffer-write convention helper.** _Parked — cross-package._ Centralize the screen→buffer scale + Y-axis convention so GL/Wgpu writers agree. Only pays off with cross-package adoption.

- **Transform-trait hardening.** _Parked — cross-package._ Remove `child as unknown as Transform2DNode` cast. Fix lives in `@flighthq/node`.

- **GL/Wgpu velocity-writer adoption of `getVelocitySampleAt`.** _Parked — cross-package._ The payoff of the affine sample function (correct motion blur at rotating pivots). Touches `displayobject-gl`/`displayobject-wgpu`.

- **Rust `flighthq-velocity` crate.** _Parked — global posture._ TS leads, Rust follows.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: remove contributeAffineVelocity, tighten getVelocitySampleAt matrix param, add Package Map entry
