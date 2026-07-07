---
package: '@flighthq/application'
updated: 2026-07-02
basedOn: ./review.md
---

# application — Assessment

Verified against the live tree (2 source files, 2 test files, 133 tests, 70 exports), the prior review (reject — 38/100), and the direction session (2026-07-02). Four charter decisions blessed. The package cannot compile due to missing types.

## Recommended

Sweep-safe: prerequisites to make the package compile.

1. **Rebuild missing types in `@flighthq/types`.** Per charter Decision #1. Write `LoopBackend`, `ApplicationLoopOptions`, expanded `Application` interface fields, and 3 missing `WindowBackend` methods. One concept per file.

2. **Remove dead `LoopState.accumulated`.** Per charter Decision #2.

3. **Package Map description update.** Per charter Open direction #4.

## Backlog

- **Evaluate decomposition.** _Parked — needs compiled package first._ Charter Decision #3 / Open directions #1-2.
- **Rust `flighthq-application` crate.** _Parked — global posture._

## Approved

- [2026-07-02 · picked] Sweep items 1–3: rebuild missing types, remove dead accumulated, Package Map description
