# FFI usability: pass 4 — renderer parity and a complete surface (2026-11-20)

Adds to [pass 2](pass-2.md) and [pass 3](pass-3.md). Reporting and naming rules are in pass 3: the fleet commits code, reports in status, and keeps workflow codes out of commits, comments and names.

## What the owner has said

- **"Alpha" does not excuse leaving part of the SDK out.** TypeScript is not alpha quality; complete work already ships on it. What is new is the same program running on Rust and on TypeScript.
- **All four renderers are supported on TypeScript today: Canvas, DOM, GL, wgpu. Both are supported on Rust: GL and wgpu.** Not wgpu first and GL later.
- This replaces the earlier ruling in `agents/ffi-usability.md` that the first native path is wgpu-only.

## Order

Parts 1 and 2 rank with the remaining pass 2 work and ahead of pass 3: rendering is the largest gap downstream reports.

## Part 1 — every backend registers renderers the same way

Today (2D): wgpu has a `register_wgpu_*_renderer(state)` function for each of its renderers in Rust, emitted to TypeScript as `registerWgpu*Renderer`. GL has the renderer statics and no register functions. Canvas and DOM have the renderer constants and no register functions. 3D has one register function on each of GL and wgpu against fifteen or sixteen renderers.

Required:

1. **One register function per renderer, on every backend, 2D and 3D.** `register_gl_sprite_renderer(state)`, `registerCanvasSpriteRenderer(state)`, `registerDomSpriteRenderer(state)`, and so on, for every renderer constant the backend exports. Each binds the backend's renderer to its kind, as the wgpu ones do.
2. **One preset register function per backend and dimension,** matching `register_wgpu_scene2d_render_preset`: GL 2D and 3D, wgpu 3D if missing, Canvas 2D, DOM 2D.
3. **The renderer constants and presets stay.** `registerRenderer(state, Kind, renderer)` with a constant remains valid; the function is the second, symmetric form and the only one that crosses the C ABI.
4. **Rust is the source for GL and wgpu;** TypeScript for those is emitted. Canvas and DOM are written in TypeScript directly, to the same names and shape.
5. The usual checkpoints apply: colocated test per export, `exports:check`, `order`, `api:check`, `backend-prefix:check`, `reachability:check`, `size`. A register function must not pull in a renderer the caller did not name.

## Part 2 — GL through the C ABI

Zero GL functions are generated today; the GL backend crates are not scanned.

1. Scan `flight-render-gl`, `flight-scene2d-gl`, `flight-effects-gl` and `flight-scene3d-gl`, on the same terms the wgpu crates were brought in: render state, registration, prepare, the pass bracket, submit, present. The same-thread contract for GL is stated in the header.
2. The GL context comes from a native host. `flight-host-sdl` already has a GL path; its FFI half supplies the carriers. This no longer waits behind everything else.
3. Every new GL wrapper is reachable or carries a named reason. No wrapper lands that nothing can call.

## Part 3 — the same program on six paths

One small reference program — a few shapes, a sprite, a line of text, one pointer interaction — exists once in Rust and once in TypeScript, and runs on:

- TypeScript: Canvas, DOM, GL, wgpu;
- Rust: GL and wgpu, on a native host;
- and through the C ABI on GL and wgpu once the host seam exists.

Acceptance is a captured frame from each path, compared within a stated tolerance against one reference, using the existing functional capture machinery on the TypeScript side and the headless or SDL host on the Rust side. DOM is compared by the means the functional suite already uses for DOM.

## Part 4 — close the surface gaps downstream found

flight-hx compared this surface against the one it used before and found functions with no counterpart. Verified on the base of 2026-11-20:

| Missing | State | Required |
| --- | --- | --- |
| `TextFormat` fields | struct has public optional fields; no accessors and no constructor are generated | a constructor and get/set for every field, with a defined way to read and write "absent" |
| `ColorScaleBias` math | `create`, `clone`, `copy`, `concat`, `invert`, `set_*` exist in `flight-materials`; none is generated | generated and reachable |
| Hit-test registration | `register_hit_test`, `register_hit_test_precise`, `register_default_hit_tests` and the per-kind `register_*_hit_test` exist in `flight-interaction`; none is generated | per-kind and default registration generated; the two that take a caller function follow the existing callback contract |
| HTTP send | `send_net_request` is not generated | generated on the existing async completion path; reachable once `flight-host-net` exists |
| File system and dialogs | generated; no native host supplies the capability | pass 3 |

Then the general rule, since these four were found by a consumer and not by the census, which reports zero actionable skips:

- **A skip is by design only when the function has no meaning across a C ABI.** "Hard to lower", "optional fields", "takes a callback", "async" and "not re-exported at the crate root" are not by-design reasons.
- Re-examine every skip currently classed by design against that rule. Each one ends as generated, or keeps a reason that meets it.
- A public function in the TypeScript root lane with no generated counterpart and no such reason fails the census.

## Acceptance

- Part 1: the register and preset functions exist on all four TypeScript backends and both Rust backends, with tests; the API reports show the symmetry.
- Part 2: the GL render sequence is reachable through the C ABI with the SDL host feature on.
- Part 3: the six-path comparison runs and passes; paths that cannot run in the environment report skipped, not passed.
- Part 4: the four gaps are callable from C; the by-design skip list has been re-examined and the census enforces the rule.
- Independent review for the GL pass bracket, as for the wgpu one. One review for the rest.

## Defaults

Decide by the rules above and the design record, note the decision in status, and continue. Do not route questions to the principal.
