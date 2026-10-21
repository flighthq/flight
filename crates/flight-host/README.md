# flight-host

The portable host interface (TS `@flighthq/host`): the capability-group aggregate, typed capability queries, and host diagnostics.

## Contract

- `Host` aggregates every capability group (D8). Each group is the owning feature's `Host<Group>Capabilities` struct of optional slots, and an omitted slot is capability absence.
- `create_host()` / `initialize_host(out)` (contract lane only) build a host with every group empty. A host adapter assigns the groups it provides after create (D23 B). The public lane does not export them: an app imports a built host rather than constructing one.
- `get_host_*` / `has_host_*` read one group's slot for each capability a Flight package takes as a parameter. The returned reference is the host's own capability record.
- `explain_host` reports every group the host carries with its filled slots, plus the covered-slot census. `explain_host_*` explain one commonly needed slot, with the source's remedy prose and backend records verbatim (D0).
- `enable_host_guards(state, now_ms, host)` warns once per missing guarded capability through the caller-owned log state (D5). It calls the same explainers, so a warning cannot contradict a query.

## Rust mapping

- The source walks `Object.entries(host)`. Rust has no reflection, so the group and slot enumeration is written out, in the source property order.
- The app group's `loop` slot is the field `loop_`; the slot name reported is `loop`.
- The IPC group uses its default target (`IpcTargetNever`).

## Tracked pending delta (Principal 6f61648b)

- flight-host lands without the `gl` and `wgpu` capability groups, `get_host_wgpu` / `has_host_wgpu` and the `wgpu.context` coverage row. This is a tracked pending delta, not a waiver. Those exact surfaces and their source cases are added when render-gl / render-wgpu land, as part of those packages' acceptance. Ownership of `HostGlCapability` / `HostWgpuCapability` is decided then (D8).
