---
package: '@flighthq/physics2d-abi'
updated: 2026-08-21
by: principal
---

# physics2d-abi — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

The public TypeScript contract and executable reference backend are complete. A Rust/Wasm shadow and its
native differential/performance qualification remain deliberately downstream and were not started — the
package is built ahead of its consumer on purpose.

- **The differential test against the standard solver is the load-bearing one.** A four-body settling
  stack is run through both `stepPhysics2D` and the ABI for 120 steps and must agree to the bit on
  position, angle, and both velocities. Verified non-vacuous by mutation: swapping the x and y arguments
  of the transform setter fails it. Everything else in the suite checks self-consistency; only this one
  checks that the ABI means what Physics2D means.
- **Three divergences from `physics3d-abi` are deliberate and tested**, not omissions: mass/inertia/centre
  are readback-only because Physics2D derives them; a broken joint is reported through the joint buffer
  because breaking removes it from the world; and two contact-point slots is the exact planar bound
  rather than a halved default. Each is called out in [wire.md](./wire.md) under a "2D differs" note.
- **Contact readback publishes a PREFIX, not a subsequence.** Once one contact does not fit, publishing
  stops. Skipping it and taking a narrower one behind it would make `count` claim a prefix while holding
  the second contact, so a caller that grew its buffer would get a different set rather than a superset.
  Found by reviewing `physics3d-abi`, which had it right; pinned by a box-then-circle scene, since the
  distinction is invisible unless a narrower manifold follows a wider one.
- **`physics2d/contract` gained its step-validation predicates.** They were exported from neither lane,
  so an ABI owning the step seam could not ask the question the standard step asks. The remaining
  asymmetry is unaddressed: `physics2d/contract` still does not export `broadphase`, and
  `buildPhysics2DContacts` is private inside `step.ts`, where the 3D package exports both. A split-step
  ABI would need those seams.

## Log

- **2026-08-21** — Package established: little-endian wire layout with stable discriminants, packed
  commands and readback, all seven shapes and nine joints, queries, synchronous hooks, persistent handle
  lifecycle, and standard-solver parity, across 71 focused tests.
