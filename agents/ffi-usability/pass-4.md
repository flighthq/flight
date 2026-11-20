# FFI usability: pass 4 — renderer parity and a complete surface (2026-11-20)

Adds to [pass 2](pass-2.md) and [pass 3](pass-3.md). Reporting and naming rules are in pass 3: the fleet commits code, reports in status, and keeps workflow codes out of commits, comments and names.

## What the owner has said

- **"Alpha" does not excuse leaving part of the SDK out.** TypeScript is not alpha quality; complete work already ships on it. What is new is the same program running on Rust and on TypeScript.
- **All four renderers are supported on TypeScript today: Canvas, DOM, GL, wgpu. Both are supported on Rust: GL and wgpu.** Not wgpu first and GL later.
- This replaces the earlier ruling in `agents/ffi-usability.md` that the first native path is wgpu-only.

## Order

Parts 1 and 2 rank with the remaining pass 2 work and ahead of pass 3: rendering is the largest gap downstream reports.

## Part 1 — registration takes the kind as an argument

The SDK's registration pattern is one function that takes the kind: `registerNodeRenderer(state, kind, renderer)` in TypeScript, `register_node_renderer(state, kind, renderer)` in Rust (named `registerRenderer` until 2026-09). The state's type selects the backend; the renderer is one of the backend's exported constants (`glSpriteRenderer`, `GL_SPRITE_RENDERER`); the kind may be any kind, including a caller's own. That is how a custom kind is bound to a renderer, and it must stay possible on every path.

This already works on all four TypeScript backends and both Rust backends. What is missing is the C ABI: `register_node_renderer` is generic over the render state, so nothing is generated, and a renderer static cannot cross the boundary.

Required:

1. **Do not add a function per renderer per backend.** An earlier draft of this pass asked for that; it is withdrawn. A per-kind function cannot bind a custom kind.
2. **Kind-taking registration through the C ABI, per backend.** Declared instantiations of `register_node_renderer` for the GL and wgpu render states, taking the state, a kind and a renderer handle.
3. **A borrowed handle for every exported renderer constant,** 2D and 3D, GL and wgpu, so C can name the renderer it wants to bind — including binding a built-in renderer to a custom kind.
4. **Presets through the C ABI on both backends,** 2D and 3D. wgpu has `register_wgpu_scene2d_render_preset`; GL builds its preset as render-state options (`gl_scene2d_render_preset`), which must be reachable too.
5. **The other kind-keyed registries follow the same rule** where they exist (quad material renderers, shape rasterisers, texture resolvers, effects): kind as an argument, reachable from C on both backends.
6. **Remove the fixed-kind `register_wgpu_*_renderer` functions.** The owner wants the backends aligned on the kind-taking form. Every function that takes only the state and binds one built-in renderer to one fixed kind goes, from Rust and therefore from TypeScript and the C surface; call sites and tests move to `register_node_renderer` / `registerNodeRenderer` with the renderer constant. Functions that take a kind, and the preset functions, stay. Do this only after items 2 and 3 are callable from C on wgpu, so the C surface never loses its only working registration path.
7. **Custom renderers written in C are not in this pass.** `NodeRenderer` holds plain function pointers with no context, and its functions receive the backend render state; a sound way to supply one from C needs design first. Note in status what would be required. Binding built-in renderers to custom kinds is in scope and must work.
8. The usual checkpoints apply for anything exported: colocated test, `exports:check`, `order`, `api:check`, `reachability:check`, `size`.

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

## Part 5 — Haxe externs for the TypeScript-only packages

openfl-flight on the JavaScript target links the ES modules, where the SDK is complete. The gap there is bindings, not the SDK: bindgen derives externs from the Rust crates, and these packages exist only in TypeScript, so no externs are generated for them — `scene2d-canvas`, `scene2d-dom`, `effects-canvas`, `textshaper-canvas`, `host-web`, `host-electron`, `host-tauri`, `host-capacitor`, `application`, `application-gl`, `storage`, `mesh`. flight-hx carries hand-written patches for the host seam today.

Required:

1. Confirm the list above against the package and crate directories and against what `haxe_js` emits.
2. Generate JavaScript-target externs for the public lane of each such package from the TypeScript side — default source: the same API data `npm run api` reads — in the same style and with the same type mapping as the Rust-derived externs, so one Haxe program can use both.
3. A Haxe JavaScript program can create a web host, register Canvas or DOM renderers through the kind-taking function, and render, with no hand-written externs. The fleet has the Haxe toolchain installed; compile and run this.
4. Note in status which flight-hx host-seam patches this makes unnecessary.

## Acceptance

- Part 1: from C, on GL and on wgpu, a built-in renderer is bound to a standard kind and to a custom kind through the kind-taking function, and the preset path works; a test shows a node of the custom kind drawn.
- Part 2: the GL render sequence is reachable through the C ABI with the SDL host feature on.
- Part 3: the six-path comparison runs and passes; paths that cannot run in the environment report skipped, not passed.
- Part 4: the four gaps are callable from C; the by-design skip list has been re-examined and the census enforces the rule.
- Part 5: the Haxe JavaScript program above compiles and runs against generated externs only.
- Independent review for the GL pass bracket, as for the wgpu one. One review for the rest.

## Defaults

Decide by the rules above and the design record, note the decision in status, and continue. Do not route questions to the principal.
