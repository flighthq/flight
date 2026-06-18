# Functional-test harness

Test-scoped wiring shared by the functional tests. **This is not part of Flight's public API** and must never become a published package — it exists only so a functional test can focus on the one feature it exercises instead of re-deriving render plumbing.

Examples deliberately spell their wiring out (that verbosity is their content). Functional tests optimize for the opposite: signal-to-noise on the feature under test. So the incidental plumbing — canvas/context creation, device-pixel-ratio handling, renderer/command/material registration, the background + `prepare → draw` sequence — lives here, in one reviewed place, rather than being hand-copied into every test (where copies drift and bugs hide).

## What each target owns

`createCanvasTarget` / `createDOMTarget` / `createWebGLTarget` take a declaration and return `{ state, width, height, scale, render }`:

- **Device pixel ratio.** The canvas/WebGL backing store is sized `width × devicePixelRatio`, and the device transform (`state.renderTransform2D`) is set to `scale(devicePixelRatio)`. The scene is therefore authored in fixed logical coordinates (`width × height`), DPI-independent, and `scale` is always `1`. DOM needs no device transform — CSS handles DPI — so its `renderTransform2D` stays identity. This is why a test reads correctly on a 2× display; authoring at `width / scale` (the old pattern) cancelled the DPI scale and rendered half-size on canvas/WebGL.
- **Registration keyed off `kinds`.** Declare the node kinds the scene uses; the target registers the matching renderer (plus shape commands / the default WebGL material) for the backend. This is what kept the missing-`registerDefaultWebGLMaterial` / missing-`registerCanvasShapeCommands` class of bug from being writable.

## When NOT to use it

Tests that exercise the render plumbing itself — `blur` (offscreen render targets + filter passes), `particle-emitter` (custom sync policy + particle rendering) — keep their wiring explicit and local. The harness is for tests whose plumbing is incidental, not the subject.
