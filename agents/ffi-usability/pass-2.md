# FFI usability: pass 2 (2026-11-19)

The second and current instruction for work items A–I. Design: [`../ffi-usability.md`](../ffi-usability.md). Item specs: the `item-*.md` files beside this one. Where this file and an item spec disagree, this file wins.

## Goal of this pass

A C program can build a scene, open a window, receive input, render and present, using only this repository. That means scenarios G1–G5 executing through the C ABI. The work that only this repository can do — the node handle, the render path, the native host crates — comes first. Haxe-side verification is downstream work for flight-hx.

## State at the start of the pass

Landed: A, C, D, the first render-path instantiations (E1/E2), Task T, the Task S withdrawal, f64 through Task Q batch 12.

Not landed: B (held), E3 (in implementation), E4 (blocked), F, G, I (no crate exists), H2 and H3 (held).

## Order

1. **Item B** — next to integrate, ahead of any further H work. Every scenario except G5 depends on it, and flight-hx cannot regenerate until node handles are stable.
2. **Item E3, then E4.**
3. **Host crates, Rust half — start now, in parallel with 1 and 2.** See below.
4. **Host crates, FFI half** — as B and E land.
5. **Item H** — behind all of the above.
6. **Item I** — after G, unchanged.

## Hosts are split in two

The item specs made F and G wait on Item E. Only their FFI half needs it.

**Rust half — no dependency on B or E; startable now.**

- F: the `flight-host-headless` crate, its API, read-back, `explain_*`, workspace packaging (`default-members`), and the Rust test that renders a known scene offscreen and compares pixels.
- G: the `flight-host-winit` crate, the capabilities it fills, surface lifecycle, the verbs, input translation tests, and the Rust example.
- The carrier list each host must produce is read from the SDK's own render and surface functions (the reference call order is `crates/flight-scene2d-wgpu/tests/wgpu_node2d_test.rs`). Do not wait for Item E's list; reconcile against it when it exists.

**FFI half — needs B and E.**

- The `host-headless` and `host-winit` cargo features on `flight-ffi`, scanning, the header sections, the reachability report with the feature on, the strict-C scenarios G2 and G3, and the C example.

F and G may be built by different builders at the same time. F first is no longer required; whoever reaches the feature and header mechanics first settles them (default: one header, one guarded section per feature).

## Haxe is not a gate in this repository

- No item is held for lack of a Haxe, HashLink or hxcpp toolchain. Acceptance for Item H here is: generator unit tests, deterministic generation, and the generated output reviewed as text.
- Executing scenario G6 on HashLink, and the C++ compile check, move to flight-hx.
- H2 core, already reviewed, integrates on those terms. The missing sfnt producers are a separate later slice and do not hold it.
- H3 proceeds on the same terms when its turn comes.

## Environment

Agents are in sandboxes and may install what the work needs: a software Vulkan adapter (Mesa lavapipe) for the headless pixel tests, a virtual display for G3, CMake and a C toolchain for SDL, and anything similar. A missing tool is something to install, not a reason to hold or skip. Note what was installed in status so the same setup can be repeated.

## Default rulings for open blockers

- **E4, policy skips.** A named policy skip decided before emission is acceptable for anything outside the render sequence in section 4 of the design record (nested brackets, scoped closures, behaviour hooks, raw wgpu APIs). The test is that the sequence itself — create render state, register renderers, prepare, begin pass, render, end pass, submit, present — is reachable. Each skip carries its reason.
- **Item B, types produced both owned and inside a `Ref`.** Leave their lowering unchanged and note them in status.
- **Anything else undecided.** Decide by the design record's principle (every consumed carrier has a producer; no unsound handle reaches the header), note the decision and its reason in status, and continue.

## Review weight

Items B and E3 are the safety-sensitive pieces and keep an independent reviewer and mutation evidence. For the other items, one review against the spec's acceptance list is enough to integrate. Repairs found after integration are ordinary follow-up commits.

## The principal is not in the loop

This pass goes over the wall once. Do not send the principal requests, questions or resend asks. Everything needed is in this directory and in `agents/ffi-usability.md`, which land on the base with this file.

The fleet commits code, not reports. Outcomes go in agent status; a written breakdown is handed off only when the owner asks. See the reporting and naming section of [pass 3](pass-3.md), which also bars workflow codes from commits, comments and names.
