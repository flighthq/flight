# Physics2D ABI wire contract

This is the language-neutral companion to the exported constants in `physics2DAbiLayout.ts`. The
TypeScript writers and reference backend are executable specification; this document makes the same
layout reviewable without reverse-engineering either implementation.

It is deliberately the same document, in the same order, as [the 3D one](../physics3d-abi/wire.md).
Where the two differ, that difference is a fact about the dimension and is called out — read the
**2D differs** notes rather than assuming a smaller copy.

## Framing and compatibility

All integers and `Float64` values are little-endian. Handles and caller object ids are non-zero unsigned
32-bit integers. World handles are issued by the backend and never reused by one ABI instance; body,
collider, and joint ids are chosen by the caller.

The 16-byte stream header is `magic`, `version`, published byte length, and command count as four `u32`
values. Magic is the bytes `P2DA`; version is currently 1. Every command begins with four more `u32`
values: command kind, record byte length, object id, and related id. Record lengths include that header,
are divisible by eight, and make unknown commands safely skippable by a newer caller. An older backend
does not silently skip meaning it does not understand: unknown command kinds, flag bits, non-zero reserved
fields, non-zero alignment padding, or changed fixed lengths are `InvalidCommand`.

Execution is command-atomic but not stream-transactional. Commands before the first failure remain
committed. The result names the failed command index, byte offset, and kind. A buffer header or framing
failure is `InvalidBuffer`.

**2D differs:** the magic is the only field that distinguishes the two streams, and it is checked first.
Handing a `P3DA` stream to a 2D backend fails at the header rather than at a field whose meaning moved.

## Buffer ownership

The exported TypeScript buffer constructors allocate ordinary JavaScript typed arrays for the reference
backend. They are conveniences, not an ownership requirement. Every public buffer accepts typed-array
views over any `ArrayBufferLike` backing, so a native shadow can publish the identical record shapes over
its linear memory and let the shared command writers encode there without a copy. A package-level
`physics2d-abi-rs` shadow may therefore replace both the backend factory and the buffer constructors while
preserving this contract; replacing only the backend factory is semantically correct but does not itself
promise a zero-copy crossing.

Typed-array views are valid only while their backing storage remains valid. In particular, an adapter
whose linear memory grows must refresh and republish every affected view before the next public call.
Callers do not retain hook-buffer contents past the callback, and a destroyed world handle is permanently
stale even if its implementation storage is later recycled.

## Command payloads

- `SetGravity`: two `f64`: X, Y. Both ids are zero.
- `SetSolverConfig`: `u32` flags (`allowSleeping`, `continuousCollision`, `warmStarting` at bits 0–2),
  then a zero reserved word, maximum linear CCD substeps, maximum rotational CCD substeps, velocity
  iterations, position iterations, and two more zero reserved words. Six `f64` follow: sleep linear
  threshold, sleep angular threshold, time to sleep, penetration slop, position correction, restitution
  threshold.
  **2D differs:** Physics2D has no `substeps`. The word 3D spends on it is held zero rather than
  repurposed, so the two configs stay positionally comparable when read side by side.
- `SetBody`: `u32` flags, one zero word, then 17 `f64` values indexed by `Physics2DAbiBodyValue`.
  Type occupies bits 0–1; fixed rotation, bullet, sleeping, and sleep-enabled occupy bits 2–5. The
  related id is zero. Reusing an id updates that body without changing its caller identity.
  **2D differs, and this is the one to read twice:** mass, inertia, and centre of mass are
  **readback-only**. Physics2D DERIVES them from collider geometry and density and re-derives them
  whenever a collider, body type, or fixed-rotation flag changes. `SetBody` therefore ignores those
  three slots. Accepting them would let a caller author a body whose mass contradicts its own shape,
  and the next collider command would overwrite it regardless. The 3D ABI accepts them because
  Physics3D exposes `setRigidBody3DMassData`; Physics2D exposes no equivalent, by design.
- `DestroyBody`, `DestroyCollider`, `DestroyJoint`, `WakeBody`: no payload; the object id selects the
  target and related id is zero. Destroying a body also destroys its colliders and joints.
- `SetCollider`: object id is the collider, related id is its body. The fixed payload is `u32` sensor
  flag, `u32` category bits, `u32` mask bits, `i32` group index, then `f64` density, friction, and
  restitution. Its shape block follows immediately. Reusing an id detaches the previous collider first,
  so an id names one live collider at a time.
- `SetJoint`: object id is the joint and related id is zero. The fixed prefix is `u32` kind, body-A id,
  body-B id, and flags. Six common `f64` values follow: local anchor A XY, local anchor B XY, break
  force, break torque. Nine kind values follow, unused slots zeroed.
  **2D differs:** there are no orientation frames. A reference *angle* is one scalar and belongs to the
  kinds that have one, so it lives among the kind values rather than in the common block.
  Common flag bits are collide-connected (0) and broken (1); bits 2–4 are read against the record's own
  kind. Kind layouts are:
  - distance: length, frequency, damping ratio;
  - revolute: lower/upper angle, reference angle, motor speed, maximum motor torque, limit
    frequency/damping; motor, limit, and compliant-limit flags at bits 2–4;
  - prismatic: local axis A XY, reference angle, lower/upper translation, motor speed, maximum motor
    force, limit frequency/damping; the same three flags at bits 2–4;
  - weld: reference angle;
  - wheel: local axis A XY, rest translation, frequency, damping ratio, motor speed, maximum motor
    torque; motor flag at bit 2;
  - rope: maximum length;
  - mouse: target XY, maximum force, frequency, damping ratio;
  - pulley: ground anchor A XY, ground anchor B XY, ratio, constant;
  - gear: axis A XY, axis B XY, ratio, constant; linear-coordinate flags for A and B at bits 2–3.

  The gear's two coordinate bits deliberately alias the motor and limit bits. A record carries exactly
  one kind, so the two meanings can never be read from the same record.

  **The mouse joint is the exception to two-body addressing.** It drags ONE body toward a world point,
  so the record must name that body in *both* id slots and carries its anchor in the B slot. Naming two
  different bodies is `UnsupportedJoint`, not a preference.
- Force, impulse, and torque records carry four `f64`: vector XY then world point XY. Commands without
  a point keep the final two values zero.
  **2D differs:** a plane's torque is one scalar. `ApplyTorque` carries it in the first slot and
  requires the other three to be zero — accepting a vector there would let a 3D-shaped caller believe
  its other components had been applied.

## Shape blocks

A shape starts with `u32` kind, scalar count, integer count, and payload version. Scalars are `f64`,
integers are `u32`, and zero padding aligns the end to eight bytes. Scalar order is:

- circle: centre XY, radius;
- AABB: minimum XY, maximum XY;
- OBB: centre XY, half width, half height, rotation;
- capsule: endpoint 0 XY, endpoint 1 XY, radius;
- polygon: flat XY point list;
- segment: endpoint 0 XY, endpoint 1 XY;
- point: XY.

**2D differs in two ways.** Every built-in is a fixed field list or a flat point list, so no 2D shape
carries an integer payload or a payload version, and none needs end padding — a `Float64` block is
already eight-aligned. Both header fields must still be zero, and a non-zero value is refused rather
than ignored, so a future kind that does carry them cannot be silently half-read by an older backend.
Second, **segment and point colliders are encoded rather than rejected.** They are area-less and
generate no manifold, but Physics2D validates and steps them, so a world the standard API accepts is a
world this ABI can carry.

## Readback and hooks

Every output is caller-allocated structure-of-arrays storage. `requiredCount` describes the whole answer;
`count` describes the deterministic prefix that fit. Unfiltered bodies and joints sort by caller id.
Selective body readback preserves the requested order and omits missing ids. Contacts and queries preserve
standard Physics2D order.

Body, contact identity/value, contact-point, joint-reaction, and query rows are indexed by the exported
`Physics2DAbi*Value` constants. A query geometric row is fraction, point XY, normal XY; point and region
queries zero that row. A contact hook receives one reused contact row plus up to **two** point rows.
Only the enabled flag, friction, and restitution are read back from the callback; invalid values throw
through the standard hook transaction.

**2D differs:** two point slots is the exact planar bound, not a smaller default. A 2D manifold is a
segment, so it cannot have more than two points; the 3D boundary reserves four because a face-face
region needs them.

**2D differs, and a native implementer must handle it:** a joint that breaks is REMOVED from the world
by Physics2D and recorded in `world.jointEvents.broke`. It has no `broken` field to report. The joint
readback therefore appends, after the live joints, every joint that broke during the most recent step —
carrying the `Broken` flag and the load that broke it — and retires its id. That list is the only
channel by which a caller holding an id learns its joint no longer exists, and it survives exactly one
readback. Reading joints consumes the list even when the supplied capacity fits only a prefix; the
required count tells the caller that it undersized the read. Reusing a retired id with `SetJoint`
discards an unread event for that id before publishing the new live joint, so a readback can never carry
two rows with the same identity. A `SetJoint` record with the `Broken` bit set is `InvalidCommand`.

`step` returns `Declined` when the same validation predicates that guard `stepPhysics2D` fail,
`InsufficientHookBuffer` before stepping when a live hook lacks one contact/two point slots, and
`StaleWorld` after destruction. Hooks remain synchronous because they participate inside the solver.
The same world is non-reentrant while a hook runs: command execution and nested stepping report
`BusyWorld`, while destruction, readback, and queries return false. Other worlds owned by the ABI remain
available. `getPhysics2DAbiWorldStatus` distinguishes `Ready`, `Busy`, and `Stale` after any boolean
operation declines.
