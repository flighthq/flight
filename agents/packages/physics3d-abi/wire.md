# Physics3D ABI wire contract

This is the language-neutral companion to the exported constants in `physics3DAbiLayout.ts`. The
TypeScript writers and reference backend are executable specification; this document makes the same
layout reviewable without reverse-engineering either implementation.

## Framing and compatibility

All integers and `Float64` values are little-endian. Handles and caller object ids are non-zero unsigned
32-bit integers. World handles are issued by the backend and never reused by one ABI instance; body,
collider, and joint ids are chosen by the caller.

The 16-byte stream header is `magic`, `version`, published byte length, and command count as four `u32`
values. Magic is the bytes `P3DA`; version is currently 1. Every command begins with four more `u32`
values: command kind, record byte length, object id, and related id. Record lengths include that header,
are divisible by eight, and make unknown commands safely skippable by a newer caller. An older backend
does not silently skip meaning it does not understand: unknown command kinds, flag bits, non-zero reserved
fields, non-zero alignment padding, or changed fixed lengths are `InvalidCommand`.

Execution is command-atomic but not stream-transactional. Commands before the first failure remain
committed. The result names the failed command index, byte offset, and kind. A buffer header or framing
failure is `InvalidBuffer`.

## Buffer ownership

The exported TypeScript buffer constructors allocate ordinary JavaScript typed arrays for the reference
backend. They are conveniences, not an ownership requirement. Every public buffer accepts typed-array
views over any `ArrayBufferLike` backing, so a native shadow can publish the identical record shapes over
its linear memory and let the shared command writers encode there without a copy. A package-level
`physics3d-abi-rs` shadow may therefore replace both the backend factory and the buffer constructors while
preserving this contract; replacing only the backend factory is semantically correct but does not itself
promise a zero-copy crossing.

Typed-array views are valid only while their backing storage remains valid. In particular, an adapter
whose linear memory grows must refresh and republish every affected view before the next public call.
Callers do not retain hook-buffer contents past the callback, and a destroyed world handle is permanently
stale even if its implementation storage is later recycled.

## Command payloads

- `SetGravity`: three `f64`: X, Y, Z. Both ids are zero.
- `SetSolverConfig`: `u32` flags (`allowSleeping`, `continuousCollision`, `warmStarting` at bits 0–2),
  then `u32` substeps, maximum linear CCD substeps, maximum rotational CCD substeps, velocity iterations,
  position iterations, and two zero reserved words. Six `f64` follow: sleep linear threshold, sleep
  angular threshold, time to sleep, penetration slop, position correction, restitution threshold.
- `SetBody`: `u32` flags, one zero word, then 33 `f64` values indexed by `Physics3DAbiBodyValue`.
  Type occupies bits 0–1; fixed rotation, bullet, sleeping, and sleep-enabled occupy bits 2–5. The
  related id is zero. Reusing an id updates that body without changing its caller identity.
- `DestroyBody`, `DestroyCollider`, `DestroyJoint`, `WakeBody`: no payload; the object id selects the
  target and related id is zero. Destroying a body also destroys its colliders and joints.
- `SetCollider`: object id is the collider, related id is its body. The fixed payload is `u32` sensor
  flag, `u32` category bits, `u32` mask bits, `i32` group index, then `f64` density, friction, and
  restitution. Its shape block follows immediately.
- `SetJoint`: object id is the joint and related id is zero. The fixed prefix is `u32` kind, body-A id,
  body-B id, and flags. Sixteen common `f64` values follow: local anchor A XYZ, local anchor B XYZ,
  break force, break torque, local rotation A XYZW, local rotation B XYZW. Fourteen kind values follow,
  unused slots zeroed. Common flag bits are collide-connected and broken. Kind layouts are:
  - distance: length, frequency, damping ratio, minimum length, maximum length; spring and limit flags at
    bits 2–3;
  - hinge: lower/upper angle, motor speed, maximum motor torque, limit frequency/damping; limit, motor,
    and compliant-limit flags at bits 2–4;
  - slider: lower/upper translation, motor speed, maximum motor force, limit frequency/damping; the same
    three flags at bits 2–4;
  - cone-twist: swing Y/Z, lower/upper twist, limit frequency/damping; swing, twist, and compliant-limit
    flags at bits 2–4;
  - generic 6-DOF: lower linear XYZ, upper linear XYZ, lower angular XYZ, upper angular XYZ, limit
    frequency, limit damping; compliant-limit flag at bit 2;
  - ball-and-socket and fixed use only the common values.
- Force, impulse, and torque records carry six `f64`: vector XYZ then world point XYZ. Commands without a
  point keep the final three values zero. The object id is the body and related id is zero.

## Shape blocks

A shape starts with `u32` kind, scalar count, integer count, and payload version. Scalars are `f64`,
integers are `u32`, and zero padding aligns the end to eight bytes. Scalar order is:

- sphere: center XYZ, radius;
- AABB: minimum XYZ, maximum XYZ;
- box: center XYZ, half extents XYZ, rotation XYZW;
- capsule/cylinder: endpoint 0 XYZ, endpoint 1 XYZ, radius;
- cone: apex XYZ, base-center XYZ, radius;
- convex: flat XYZ point list;
- triangle mesh: translation XYZ, rotation XYZW, flat XYZ point list; its integer list is triangle
  indices and the header carries the mesh version;
- heightfield: cell size X/Z, translation XYZ, rotation XYZW, heights; its two integers are columns and
  rows and the header carries the heightfield version.

Primitive shape versions are zero. Triangle meshes and heightfields are accepted only on static bodies,
matching the standard Physics3D contract.

## Readback and hooks

Every output is caller-allocated structure-of-arrays storage. `requiredCount` describes the whole answer;
`count` describes the deterministic prefix that fit. Unfiltered bodies and joints sort by caller id.
Selective body readback preserves the requested order and omits missing ids. Contacts and queries preserve
standard Physics3D order.

Body, contact identity/value, contact-point, joint-reaction, and query rows are indexed by the exported
`Physics3DAbi*Value` constants. A query geometric row is fraction, point XYZ, normal XYZ; point and region
queries zero that row. A contact identity row is body A/B and collider A/B. A contact hook receives one
reused contact row plus up to four point rows. Only the enabled flag, friction, and restitution are read
back from the callback; invalid values throw through the standard hook transaction and are rolled back.

`step` returns `Declined` when the same validation predicates that guard `stepPhysics3D` fail,
`InsufficientHookBuffer` before stepping when a live hook lacks one contact/four point slots, and
`StaleWorld` after destruction. Hooks remain synchronous because they participate inside the solver.
The same world is non-reentrant while a hook runs: command execution and nested stepping report
`BusyWorld`, while destruction, readback, and queries return false. Other worlds owned by the ABI remain
available. `getPhysics3DAbiWorldStatus` distinguishes `Ready`, `Busy`, and `Stale` after any boolean
operation declines.
