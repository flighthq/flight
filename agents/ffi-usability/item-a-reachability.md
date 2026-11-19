# Item A: FFI reachability census and gate

Design: `agents/ffi-usability.md`, "Principle" and section 1. Read it first.

## Goal

Make "can a C consumer actually call this" a generated, checked fact. Today the FFI is measured by how many wrappers are emitted. This item adds the measure every later item is tracked against, and re-confirms the defects the design record lists.

## Background

The record's opening table was read from `crates/flight-ffi/build.rs` (current) and from a generated `ffi_generated.rs` built before the final K/L/M landing. Examples of what it found:

- `flight_create_sprite` returns `Box<Ref<Sprite>>`; `flight_add_node_child` casts its arguments to `*const Ref<dyn Node>`. No conversion is generated.
- 22 accessors take `*mut` / `*const Node2DFields`; nothing produces that pointer.
- About 390 functions take `*const Host*Capability`; two functions produce one.
- `flight_disconnect_signal_connection` exists; no connect does.

## What to build

1. **Carrier graph.** In the generator, record for every emitted wrapper the carriers it consumes and produces. A carrier is the exact ABI-level type the wrapper casts to or from: `Box<Ref<Sprite>>`, `Box<Ref<dyn Node>>`, `*mut Node2DFields`, `*const HostTimerCapability`, a `Vec` handle, a disposer, and so on. Two carriers are the same only if the Rust type behind the pointer is identical. A thin `Ref<T>` handle does not satisfy a `Ref<dyn Trait>` parameter. Scalars, plain `repr(C)` value structs the caller can declare itself, strings and scalar slices are always producible.
2. **Fixed point.** A carrier is producible if some reachable function returns it or writes it through an out parameter. A function is reachable if every carrier it consumes is producible. Iterate to a fixed point starting from functions that consume nothing.
3. **Report.** Emit a deterministic, committed baseline next to the existing census outputs: one row per unreachable function with the first unproducible carrier, plus a summary by carrier (count of functions blocked by each). Sort stably.
4. **Check.** A test or script that fails when a function not in the baseline becomes unreachable, and fails when the baseline lists a function that is now reachable (so the baseline can only shrink deliberately). Wire it wherever the existing census pins run.
5. **Policies.** Allow a named policy to exempt a carrier with a one-line reason, in the same style as the existing skip policies. Expect at least one: host capability carriers are produced only by host crates behind features (items F, G, I), so in the default build they are exempt under a policy that names that.
6. **Confirmation report.** On a fresh build, state for each row of the design record's opening table whether it holds, with the generated function and line as evidence. Write this report to `agents/ffi-usability-reports.md`; if any row is wrong, say so plainly, because later items are scoped on it.

## Not in scope

- Fixing any unreachable function. Items B, C, E, F, G do that.
- Changing which functions are generated.

## Acceptance

- Baseline and summary are committed and regenerate byte-identically.
- The check fails on a deliberately introduced unreachable wrapper and on a stale baseline entry (show both in the review).
- The confirmation report covers all eight rows of the opening table.
- Existing census pins, unit tests and the strict-C consumer test still pass.
- `cargo fmt`; `cargo check --all-targets` for `flight-ffi` (the workspace may still have f64 migration failures in unrelated crates; say so if it does rather than treating it as this item's failure).

## Dependencies

None. This item should land before B, C and E are reviewed, since their acceptance is "the baseline shrank by these carriers".
