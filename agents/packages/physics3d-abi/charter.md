---
package: '@flighthq/physics3d-abi'
role: package
crate: flighthq-physics3d-abi
lastDirection: 2026-08-21
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# physics3d-abi — Charter

## What it is

The target-neutral persistent-world execution boundary for `@flighthq/physics3d`: caller-owned numeric
object ids, packed mutation commands, explicit stepping, selective structure-of-arrays readback, contact
events and hooks, and world queries. The TypeScript implementation is executable specification and a
usable reference target; `physics3d-abi-rs` may shadow it in `flight-rs` without inventing a second API.

## North star

- **One semantic model.** Bodies, colliders, joints, filtering, CCD, hooks, events, ordering, validation,
  and queries mean what they mean in `physics3d`; only ownership and exchange shape differ.
- **Persistent ownership.** The implementation owns worlds across calls. Commands describe mutations and
  readback is selective, so a native target never needs to serialize an entire world per step.
- **TypeScript is the specification.** Layouts, statuses, failure boundaries, and parity evidence originate
  here. A Rust implementation shadows this public package rather than leading it.
- **Explicit capacity and lifetime.** Buffers allocate only through named constructors, report required
  capacity separately from written prefixes, and state exactly when views and handles expire.
- **Portable ABI floor.** Numeric ids, little-endian records, `Float64` solver values, fixed discriminants,
  and no object identity crossing the boundary.

## Boundaries

**In scope:** built-in Physics3D bodies, all nine collider descriptors, all seven built-in joints,
incremental mutation commands, contact and joint outputs, synchronous contact hooks, point/ray/region/
shape-cast queries, persistent handle lifecycle, and differential tests against the standard solver.

**Not in scope:** a Rust or Wasm implementation (owned by `flight-rs`), vendor collider serialization,
arbitrary JavaScript joint solvers inside a native solve loop, a second physics model, or implicit backend
selection inside `stepPhysics3D`.

## Decisions

- **[2026-08-21] Public package, not a `physics3d/contract` module.** The ownership boundary is independently
  reusable and must add no dependency or bundle edge to a standard TypeScript consumer. User-directed.
- **[2026-08-21] Paired shadow topology.** `physics3d-rs` shadows the standard object API;
  `physics3d-abi-rs` shadows this direct ABI. Both native-facing packages may share one engine and wire
  protocol, but neither changes its TypeScript counterpart's contract. User-directed.
- **[2026-08-21] No Rust/Wasm in this build.** Stabilize and verify the public TypeScript ABI first;
  downstream implementation begins only after this contract lands. User-directed.

The exact language-neutral record layout is recorded in [wire.md](./wire.md) and locked by the package's
codec and behavior tests.

## Open directions

None. Native implementation and measured shadow-adapter overhead are downstream qualification work after
the TypeScript ABI is established.
