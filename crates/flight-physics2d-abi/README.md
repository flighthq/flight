# flight-physics2d-abi

The target-neutral Physics2D execution boundary (TS `@flighthq/physics2d-abi`). It has three parts:

- a little-endian command stream (`P2DA`, version 1) that authors worlds by caller-chosen object ids;
- structure-of-arrays readback buffers for bodies, contacts, joints and query hits;
- the executable reference backend, which runs a real `flight-physics2d` world behind persistent handles.

A drop-in backend replaces the one constructor `create_physics2d_abi` and returns the same `Physics2DAbi` seam. Every codec and wrapper above it stays shared, so the wire contract is upstream-first.

## Layout

- `physics2d_abi_layout`: the wire constants (magic, version, header and record offsets, command, shape and joint kinds, flag bits, value strides). Tests write them out literally so that a change is deliberate.
- `physics2d_abi_buffer`: fixed-capacity buffers. Nothing grows. A capacity above `2^53 - 1` is a `RangeError`, as in TS `Number.isSafeInteger`.
- `physics2d_abi_command`: the record writers. A writer appends a whole record or leaves the stream untouched.
- `physics2d_abi` / `physics2d_abi_query`: thin free functions over the seam's callbacks. Following D9b, the result buffer comes first.
- `reference_physics2d_abi`: the reference backend. Its state (the world table, handle counter, per-world id tables and scratch results) lives in state the callbacks capture, never in module globals (D5). Each `create_physics2d_abi` is isolated.

## Reference backend behaviour

- World handles start at 1 and are never reused. `0` is the allocation-failure sentinel.
- Commands run in order and stop at the first failure. The execution result names its status, command index, byte offset and kind, and the records before it stay applied.
- Authored state the Physics2D step validator would reject is refused as `RejectedMutation` before it can make a world unsteppable.
- Mass, inertia and centre of mass travel only on readback. Physics2D derives them from collider geometry and density.
- Breaking a 2D joint removes it from the world. The next joint readback reports the joint once with the `Broken` flag and the load that broke it, then retires its id.
- Contact readback publishes a prefix: the first contact that does not fit stops publication, and the `required_*` counts report the whole answer.
- Contact hooks run synchronously inside the step through one caller-owned contact buffer. During the step, every entry point sees the world as busy (`Busy` / `BusyWorld` / `false`), so a reentrant call never blocks. If a hook panics, the world is released and the hooks detached before the panic resumes. A hook that writes a non-finite friction or restitution is a `RangeError`.

## Precision

- Wire scalars are IEEE doubles (`f64`), matching the source's `DataView` / `Float64Array`. Command writers take `f64`. Readback widens Physics2D's `f32` values exactly.
- The reference backend narrows wire doubles to Physics2D's `f32` on write. The simulation precision is flight-physics2d's, and the ABI does not change it.
- `sleep_timer` and the step `dt` are `f64`, as in flight-physics2d.
- Circle and polygon shape scalars are flight-collision's `f64` shape fields. The other shape kinds are `f32`.
- Query entry points take Physics2D's `f32` query scalars. Ray `max_fraction` defaults to unbounded and shape-cast `max_fraction` to 1, as in the source.
- Wire words (ids, flags, kinds, counts) are `u32`. Byte offsets, lengths, strides and capacities are `usize`. Solver iteration counts above `i32::MAX` cannot be authored in Physics2D and are refused as `RejectedMutation`.
