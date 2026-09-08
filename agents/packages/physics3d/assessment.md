---
package: '@flighthq/physics3d'
updated: 2026-09-08
basedOn: ./review.md
---

# physics3d — Assessment

Sorted from the 2026-09-02 review (`review.md`). Verified 2026-09-08: all 3 review gaps remain open. 712 test cases across 35 test files. Score 96 — the highest in the SDK.

## Directed

_None._

## Recommended

Strictly sweep-safe: within `@flighthq/physics3d`, no unresolved design decision.

- **Add `applyPhysics3DAngularImpulse`.** The force/impulse API has `applyPhysics3DTorque`, `applyPhysics3DForceAtPoint`, `applyPhysics3DLinearImpulse`, and `applyPhysics3DLinearImpulseAtPoint` but no direct angular impulse. Small API addition.
- **Fix charter dependency list.** Charter says `geometry, math, types`; actual runtime deps are `collision`, `entity`, `log`, `math`, `node`, `spatial`, `types` (`geometry` is devDependency only). Editorial fix.
- **Fix charter North Star GJK/EPA text.** North Star says "not in `@flighthq/collision` (which is 2D)"; Decision [2026-08-20] says "3D narrow phase lives in `@flighthq/collision`." The stale North Star wording should be updated. Editorial fix.

## Depth gaps

1. **No Rust/WASM implementation.** The TypeScript solver is AAA-qualified; the native target (`physics3d-abi`) has no implementation. Paused by user direction. Do not label package-wide AAA until native either passes or is removed from charter.
2. **Active ragdoll.** Proposed `@flighthq/ragdoll3d` package does not exist. Deliberate deferral — no action needed in physics3d unless a target-orientation motor primitive proves necessary.

## Backlog

_None._

## Approved

_None._
