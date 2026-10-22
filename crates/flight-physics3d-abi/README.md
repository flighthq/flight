# flight-physics3d-abi

The target-neutral Physics3D execution boundary (TS `@flighthq/physics3d-abi`). It has three parts:

- a little-endian command stream (`P3DA`, version 1) that authors worlds by caller-chosen object ids;
- structure-of-arrays readback buffers for bodies, contacts, joints and query hits;
- the executable reference backend, which runs a real `flight-physics3d` world behind persistent handles.

A drop-in backend replaces the one constructor `create_physics3d_abi` and returns the same `Physics3DAbi` seam. Every codec and wrapper above it stays shared, so the wire contract is upstream-first.

## Layout

- `physics3d_abi_layout`: the wire constants (magic, version, header and record offsets, command, shape and joint kinds, flag bits, value strides). Tests write them out literally so that a change is deliberate.
- `physics3d_abi_buffer`: fixed-capacity buffers. Nothing grows. A capacity above `2^53 - 1` is a `RangeError`, as in TS `Number.isSafeInteger`.
- `physics3d_abi_command`: the record writers. A writer appends a whole record or leaves the stream untouched. Collider records carry every `CollisionColliderShape3D` kind, including triangle meshes and heightfields with their integer payload and version, padded to eight bytes.
- `physics3d_abi` / `physics3d_abi_query`: thin free functions over the seam's callbacks. Following D9b, the result buffer comes first.
- `physics3d_abi_strings`: the D9e string tables for the four status and selection unions.
- `reference_physics3d_abi`: the reference backend. Its state (the collision registry, the world table, handle counter, per-world id tables and scratch results) lives in state the callbacks capture, never in module globals (D5). Each `create_physics3d_abi` is isolated.

## Reference backend behaviour

- World handles start at 1 and are never reused. `0` is the allocation-failure sentinel.
- Commands run in order and stop at the first failure. The execution result names its status, command index, byte offset and kind, and the records before it stay applied.
- Authored state the Physics3D step validator would reject is refused as `RejectedMutation` before it can make a world unsteppable. A triangle-mesh or heightfield collider on a non-static body is refused the same way.
- SetBody applies the authored mass block as mass data; adding a collider afterwards re-derives it from collider geometry and density, as Physics3D does.
- A SetJoint record names its bodies by caller id (the writer reads the joint's own `body_a` / `body_b` as ids) and carries anchors, break thresholds and both local frames for every kind (identity for kinds without frames). A broken joint stays listed on readback with the `Broken` flag until it is destroyed or replaced.
- Contact readback publishes a prefix: the first contact that does not fit stops publication, and the `required_*` counts report the whole answer.
- Contact hooks run synchronously inside the step through one caller-owned contact buffer. During the step, every entry point sees the world as busy (`Busy` / `BusyWorld` / `false`), so a reentrant call never blocks. If a hook panics, the previous world hooks are restored and the world released before the panic resumes. A hook that writes a non-finite or negative friction or restitution throws (`Error`).

## Precision

- Wire scalars are IEEE doubles (`f64`), matching the source's `DataView` / `Float64Array`. Command writers take `f64`. Readback widens Physics3D's `f32` values exactly.
- The reference backend narrows wire doubles to Physics3D's `f32` on write. The simulation precision is flight-physics3d's, and the ABI does not change it.
- The step `dt` and every query scalar are Physics3D's `f32`. Ray `max_fraction` defaults to unbounded and shape-cast `max_fraction` to 1, as in the source.
- Wire words (ids, flags, kinds, counts) are `u32`. Byte offsets, lengths, strides and capacities are `usize`. Solver counts, triangle indices, grid sizes and shape versions that do not fit a `u32` are refused by the writers.
