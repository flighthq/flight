---
package: '@flighthq/displayobject-gl'
status: solid
score: 84
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/displayobject-gl.md
  - reviews/maturation/depth/displayobject-gl.md
  - source
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta (head vs base + changes.patch slice)'
---

# Review: @flighthq/displayobject-gl

## Verdict

solid — **84/100**, and this is a **clean merge**. The integration delta is small, test-only, and surgically correct: it severs the cross-package test-helper coupling that the prior review (2026-06-24) named as its single highest-value finding. The package's production surface — every 2D leaf renderer, the GPU clipping/masking/material/cache/velocity subsystems — is **byte-identical** to the approved base; not one non-test `gl*.ts` file changed. The score nudges up two points from 80 precisely because the prior blocker (the unresolvable `makeGlState` import) is now fixed, and fixed the way the charter recommended.

This review judges **only the delta** (head vs `incoming/integration-b2824e3d8/base/`, plus the `packages/displayobject-gl/` hunks of `changes.patch`). The approved base is the blessed floor and is not re-litigated; the standing fidelity ceiling (Canvas2D raster fallbacks, borrowed shape commands, no eviction policy) is base-state and out of scope for this gate — it carries forward unchanged into Backlog/Open directions.

## What the delta changes (verified against changes.patch)

The entire incoming change is one new source file plus an import migration across the test suite. Nothing else.

- **New `glTestHelper.ts`** (`b2824e3d8:packages/displayobject-gl/src/glTestHelper.ts`, `new file mode`) — a package-local test helper exporting one function, `makeGlState`, that builds a render state through render-gl's **public** entry point:

  ```ts
  import { createGlRenderState } from '@flighthq/render-gl';
  ...
  const state = createGlRenderState(canvas, {
    backgroundColor: 0x00000000,
    imageSmoothingEnabled: options?.allowSmoothing ?? true,
  });
  return { state, gl: state.gl, canvas };
  ```

  It imports only `createGlRenderState` (public) and the `GlRenderState` type from `@flighthq/types` — no reach into render-gl internals. Confirmed it is **not** added to `src/index.ts`, so it never touches the published barrel.

- **Import migration in ~22 `*.test.ts` files** — every test file flips `import { makeGlState } from '@flighthq/render-gl'` to `import { makeGlState } from './glTestHelper'`. E.g. `b2824e3d8:packages/displayobject-gl/src/glBitmap.test.ts`:

  ```diff
  -import { makeGlState } from '@flighthq/render-gl';
   ...
  +import { makeGlState } from './glTestHelper';
  ```

  No remaining `makeGlState` import from `@flighthq/render-gl` survives anywhere in `src/` (verified). The suite no longer depends on render-gl re-exporting a test helper at all.

- **One assertion tightened in `glRichText.test.ts`** (`b2824e3d8:packages/displayobject-gl/src/glRichText.test.ts`):

  ```diff
  +    const bindSpy = vi.spyOn(getGlRenderStateRuntime(state).defaultBitmapShader, 'bind');
       drawGlRichText(state, renderProxy);
  -    expect(getGlRenderStateRuntime(state).defaultBitmapShader.bind).toHaveBeenCalledWith(state.gl, state, renderProxy);
  +    expect(bindSpy).toHaveBeenCalledWith(state.gl, state, renderProxy);
  ```

  This is a **consequence** of the migration, and a genuine improvement. The old render-gl `makeGlState` hand-built the runtime with `defaultBitmapShader: { …, bind: vi.fn() }` — a pre-spied fake. The new helper goes through `createGlRenderState`, which produces the **real** shader, so the test must install its own spy. The assertion now exercises the production construction path instead of asserting against a hand-maintained mirror of internal runtime fields.

## How the delta resolves the prior highest-value finding

The 2026-06-24 review's finding #1 and the charter's "Open directions" both flagged: in the prior bundle head, `render-gl`'s barrel had dropped `export { makeGlState } from './glTestHelper'`, while every `displayobject-gl/src/*.test.ts` imported it from `@flighthq/render-gl` — leaving the suite unresolvable at import time and contradicting the "193/193 passing" claim. That review added the explicit guidance: *"exporting a `*TestHelper` from a production barrel is itself a smell — prefer a dedicated test-only entry over the production root."\*

This delta implements exactly that guidance. The fix is **in-package** (no render-gl change required) and uses the recommended seam: a dedicated, barrel-excluded `glTestHelper.ts` consumed only by tests. Whether or not render-gl still exports its own `makeGlState` (it does, at `render-gl/src/index.ts:11` — out of this package's scope), displayobject-gl's suite is now independent of that decision. The cross-package fragility is gone.

## Judged against the seven standards (delta only)

1. **Composition / bedrock — PASS.** The delta adds no production composition. `glTestHelper.ts` is a single-purpose test fixture (one `makeGlState`), not a feature; it bundles nothing and gates nothing. No config-branch creep, no subject fusion.
2. **Naming clarity — PASS (one minor comment-accuracy nit).** `makeGlState` and `glTestHelper.ts` follow the established `gl`-prefixed, full-word convention used by every sibling helper (`render-gl`, `filters-gl`, `scene-gl`). The one blemish is in the docstring (`b2824e3d8:.../glTestHelper.ts`): it claims to mirror _"render-gl's own **private** glTestHelper pattern,"_ but render-gl's `makeGlState` is in fact publicly re-exported from its barrel. Cosmetic, non-blocking — flag, don't gate.
3. **Tree-shaking / bundle invariant — PASS.** `glTestHelper.ts` is absent from `src/index.ts`, so it adds zero published surface and cannot leak into any consumer bundle. `package.json` is unchanged (`"sideEffects": false`, single `.` export). No top-level side effect, no eager registration, no new hot-loop branch — the helper only runs under Vitest. This is strictly _better_ than the base state, which leaned on render-gl publishing a test helper.
4. **Registry vs closed union (fork B) — N/A (PASS).** The delta introduces no dispatch, no `switch(kind)`, no handler family. Untouched.
5. **Subject triad + plurality guard — PASS.** No format/backend code, no new package, no split. A within-package test fixture; the triad is not engaged.
6. **Contract hygiene — PASS.** Types-first is respected (the helper imports `GlRenderState` from `@flighthq/types`, defines no cross-package type inline). It calls the public `createGlRenderState` rather than reconstructing private runtime, so it cannot drift from production semantics. No `out`-param, sentinel, `dispose`/`destroy`, or `Readonly<>` concern is in play for a test fixture. The Rust mirror is unaffected (test infra, no crate surface).
7. **Tests & honesty — PASS.** `glTestHelper.ts` ends in `testhelper.ts`, the exact pattern `scripts/completeness.ts` (line ~121) excludes from `exports:check`, matching the documented convention used by `filters-canvas`, `filters-gl`, `render-wgpu`, `scene-gl`, and others — so it carries no colocated-test obligation and creates no `exports:check` gap. Every leaf source file retains its colocated `*.test.ts`. The delta's own claim (decouple the suite from render-gl's barrel) matches the code exactly. Crucially, this delta makes the prior "193/193 passing" honesty gap _moot_: the suite no longer hinges on a cross-package export that may or may not be present.

## Adversarial self-check (objections dropped)

- _"A non-test `.ts` in `src/` with an untested export fails `exports:check`."_ — Dropped. The `endsWith('testhelper.ts')` exclusion is an established, documented convention; singular `glTestHelper.ts` lands inside it.
- *"A `*TestHelper.ts` source file is a smell."* — Dropped. The charter's own Open directions named the dedicated test-only entry as the *preferred\* seam over a production-barrel export. This is the recommended shape.
- _"The spy rewrite weakens the rich-text assertion."_ — Dropped. It strengthens it by exercising the real `createGlRenderState` shader instead of a hand-built `vi.fn()`.
- _"The local helper omits `backgroundColorRgba`/`shaderLoc` that render-gl's version exposes."_ — Dropped. Appropriate minimization: the local helper exposes only what these tests consume and builds through the public API; divergence from render-gl's richer internal fixture is correct, not a defect.

The only surviving objection is the cosmetic "private" wording in the docstring — too minor to block a merge.

## Contract & docs fit

The delta conforms on every axis: single root barrel (unchanged), `"sideEffects": false`, no per-file subpaths, types-first, no new side effects. It also _retires_ the prior review's contract-fit concern #1 (the broken cross-package test-helper export) by construction. Concern #2 from the prior review (`remapGlScale9Commands(unknown[])`) is base-state, untouched by this delta, and remains a codebase-wide command-buffer-type decision — carried forward to Open directions, not a merge blocker.

No admin-doc line is made stale by this delta.
