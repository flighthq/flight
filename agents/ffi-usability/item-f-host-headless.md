# Item F: flight-host-headless

Design: `agents/ffi-usability.md` section 5.

## Goal

A windowless native host: a real wgpu device, an offscreen target, and pixel read-back. It makes scenario G2 runnable in CI through the C ABI, and it is the smallest proof of the host model — a Rust crate produces capabilities and carriers, C borrows them.

## Why a crate

There is no code in the repository, outside per-crate test support, that creates a wgpu device. `crates/flight-scene2d-wgpu/tests/support.rs:100-112,193` (and its copies in sibling crates) do `wgpu::Instance::new` → `request_adapter` → `request_device` and wrap the result with `create_test_wgpu_device`. That bootstrap is a host. Making it one crate removes the copies and gives the FFI something to link.

## What to build

1. **Crate** `crates/flight-host-headless`. It owns the external `wgpu` and `pollster` dependencies. It is outside `flight-sdk`, like the other host backends. Copy the package shape from a nearby crate.
2. **API**, free functions over a plain host value, following Flight's verbs:
   - `create_headless_host(options) -> Option<HeadlessHost>` — `None` when no adapter is available. Options: power preference, backend selection, whether a software adapter is acceptable.
   - Producers for exactly the carriers Item E's completeness check lists as host-side: the `WgpuDevice`, and whatever the offscreen path needs. Use the SDK's own offscreen render state (`create_wgpu_offscreen_render_state`) rather than inventing a target type.
   - Read-back to a `Bitmap` through the SDK's existing read-back path. If the SDK has none that works offscreen, report that gap; do not build a private one here.
   - `destroy_headless_host` — frees GPU resources now (`destroy*`, not `dispose*`).
   - `explain_*` for the `None` case (no adapter, device request failed), per the diagnostics convention.
   - If the SDK's wgpu path takes a `HostWgpuCapability` for acquisition, this crate provides one whose `acquire` resolves immediately.
3. **Use it in tests.** Replace the duplicated device bootstrap in the wgpu crates' `tests/support.rs` with this crate as a dev-dependency, where that does not create a dependency cycle. If it does, say which crates and leave them.
4. **Workspace packaging.** Member of the workspace but not of `default-members`, so plain `cargo build` at the root does not build it. Set `default-members` explicitly; today the root manifest has only `exclude`. Confirm `cargo build` and `cargo test` at the root behave as before for everything else.
5. **FFI feature.** `flight-ffi` gains a `host-headless` cargo feature. With it enabled the crate is linked and added to the scan, and its functions are generated with the same rules as any other crate. With it disabled the default surface, header and census are byte-identical to before. The reachability gate (Item A) runs in both configurations; with the feature on, the wgpu device carrier is producible.
6. **Header.** Decide with Item G's owner how feature-gated symbols appear: one header with `#ifdef FLIGHT_HOST_HEADLESS` sections, or a header per feature. One decision for all host features; record it in `agents/ffi-usability.md`.

## Tests

- Rust: create host, render a known scene offscreen, read back, compare to expected pixels. Skip with a clear message when there is no adapter.
- Strict-C scenario **G2**, built only with the feature: build the G1 scene, create the headless host, run the Item E sequence, read back, compare against the same scene rendered through the Rust API in the same test binary. Tolerance stated explicitly.
- CI: say which adapter the CI environment provides (software or none). If none, G2 is reported as skipped, not passed.

## Not in scope

- Windows, input, app loop (Item G).
- GL.
- Capability construction from C.

## Acceptance

- G2 passes locally with a real or software adapter; skip behaviour is correct without one.
- Default `flight-ffi` build is byte-identical in header and census.
- Root `cargo build` does not compile this crate.
- `npm run packages:check` (if the crate has a manifest the check covers), `cargo fmt`, lint.

## Dependencies

The Rust half (crate, API, read-back, packaging, Rust test) depends on nothing and can start now. The FFI half (feature, header, scenario G2) needs Items B and E. See [pass 2](pass-2.md).
