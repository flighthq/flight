---
package: '@flighthq/physics2d-abi'
role: package
crate: flighthq-physics2d-abi
lastDirection: 2026-08-21
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# physics2d-abi — Charter

## What it is

The target-neutral persistent-world execution boundary for `@flighthq/physics2d`: caller-owned numeric
object ids, packed mutation commands, explicit stepping, selective structure-of-arrays readback, contact
events and hooks, and world queries. The TypeScript implementation is executable specification and a
usable reference target; `physics2d-abi-rs` may shadow it in `flight-rs` without inventing a second API.

## North star

- **One semantic model.** Bodies, colliders, joints, filtering, CCD, hooks, events, ordering, validation,
  and queries mean what they mean in `physics2d`; only ownership and exchange shape differ.
- **Persistent ownership.** The implementation owns worlds across calls. Commands describe mutations and
  readback is selective, so a native target never needs to serialize an entire world per step.
- **TypeScript is the specification.** Layouts, statuses, failure boundaries, and parity evidence originate
  here. A Rust implementation shadows this public package rather than leading it.
- **Explicit capacity and lifetime.** Buffers allocate only through named constructors, report required
  capacity separately from written prefixes, and state exactly when views and handles expire.
- **Portable ABI floor.** Numeric ids, little-endian records, `Float64` solver values, fixed discriminants,
  and no object identity crossing the boundary.
- **A sibling, not a copy.** Where the dimension changes the model the wire says so and the difference is
  tested, rather than being inherited silently from the 3D layout.

## Boundaries

**In scope:** built-in Physics2D bodies, all seven collider descriptors, all nine built-in joints,
incremental mutation commands, contact and joint outputs, synchronous contact hooks, point/ray/region/
shape-cast queries, persistent handle lifecycle, and differential tests against the standard solver.

**Not in scope:** a Rust or Wasm implementation (owned by `flight-rs`), vendor collider serialization,
arbitrary JavaScript joint solvers inside a native solve loop, a second physics model, or implicit backend
selection inside `stepPhysics2D`.

## Decisions

- **[2026-08-21] Public package, not a `physics2d/contract` module.** The ownership boundary is independently
  reusable and must add no dependency or bundle edge to a standard TypeScript consumer. Mirrors the
  `physics3d-abi` decision. User-directed.
- **[2026-08-21] Paired shadow topology.** `physics2d-rs` shadows the standard object API;
  `physics2d-abi-rs` shadows this direct ABI. Both native-facing packages may share one engine and wire
  protocol, but neither changes its TypeScript counterpart's contract. User-directed.
- **[2026-08-21] Built ahead of its consumer, deliberately.** The ABI exists for future Wasm use, so
  "no native backend exists yet" is the intended state rather than a gap. User-directed, overriding a
  recommendation to defer until the 3D ABI met a real native target.
- **[2026-08-21] Mass is readback-only.** Physics2D derives mass, inertia, and centre of mass from
  collider geometry and density and re-derives them on every collider, type, or fixed-rotation change.
  `SetBody` therefore ignores those slots rather than accepting values the next collider command would
  overwrite. This is the sharpest divergence from `physics3d-abi`, which accepts them because Physics3D
  exposes `setRigidBody3DMassData`.
- **[2026-08-21] A broken joint is reported through readback, not a field.** Breaking REMOVES a 2D joint
  from the world, so the joint buffer appends the joints that broke during the most recent step with the
  `Broken` flag and the load that broke them, then retires their ids. Without it a caller holding an id
  has no way to learn its joint is gone.
- **[2026-08-21] Area-less colliders are carried, not rejected.** Segment and point colliders generate no
  manifold but Physics2D validates and steps them, so a world the standard API accepts is one this ABI
  can carry.
- **[2026-08-21] `physics2d/contract` exports its step-validation predicates.** An ABI that owns the step
  seam must answer the same "can this world step" question the standard step answers, and the predicates
  were previously reachable from neither lane.

The exact language-neutral record layout is recorded in [wire.md](./wire.md) and locked by the package's
codec and behavior tests.

## Open directions

None. Native implementation and measured shadow-adapter overhead are downstream qualification work after
the TypeScript ABI is established.
