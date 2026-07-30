# Testing Conventions

## File and structure rules

- One test file per source file, colocated in `src/`, named `*.test.ts`.
- `describe` blocks are alphabetized and mirror each file's exported function or object names.
- Test fixtures should use constructors and public helpers instead of object literals for SDK entity types unless the test is intentionally about structural compatibility with a `*Like` input.
- Vitest is configured with `globals: true`. `vi`, `describe`, `it`, and `expect` are available in test files without importing.
- Browser-facing packages (`render-canvas`, `render-webgl`, `render-dom`, etc.) use the `jsdom` test environment.

## Running tests

- Run `npm run test --workspace=packages/<name>` for a single package.
- While iterating, prefer the narrowest meaningful Vitest run: a touched test file, a package workspace, or a Vitest project filter. Broaden only after the local change is understood. Broad runs are confidence gates; focused tests are the normal editing loop. Do not use broad test runs as a substitute for reading the nearby source and tests.

## WebGL specifics

- `vitest-webgl-canvas-mock` mocks `'webgl'` and `'experimental-webgl'` contexts only, not `'webgl2'`. Tests in `render-webgl` that need a WebGL2 render state must mock `canvas.getContext` to return a fake `WebGL2RenderingContext`.

## Module mocks under the non-isolated suite

The suite runs **non-isolated** (`isolate: false` in the root `vitest.config.ts` — one module registry per worker, not one environment per file). Module mocks still work, but only if the file is written so the mock is in place *before* the module graph is instantiated. Two rules, both required:

1. **Declare every `vi.mock` before the first `import` of the module under test.** An ESM binding that has already been instantiated cannot be retroactively rebound.
2. **`vi.resetModules()` in a `vi.hoisted` block**, and unmock plus reset again in `afterAll`, so a registry primed by an earlier file in the same worker does not leak in — or leak out.

The effects backends are the reference pattern: `canvasDropShadowEffect.test.ts`, `glOuterGlowEffect.test.ts`, `wgpuEffectTintShader.test.ts` and their siblings all mock relative modules and are stable, because they follow both rules.

Get either rule wrong and the failure is silent and inverted: the test passes in isolation *and* package-scoped, and fails only in the full suite, so it reads as flakiness rather than as a defect in the test. `canvasColorMatrixPass.test.ts` was the worked example — it imported the module under test on line 1, before declaring the mock, and never reset modules, so a sibling that had already loaded the real compositing module won the registry and the real implementation ran against the test's placeholder arguments.

**Prefer extracting the pure kernel over mocking at all.** A test that reaches for a module mock to capture a callback is usually telling you the unit bundles a pure function it has not exported. That was the actual defect in `canvasColorMatrixPass.ts`: the per-pixel matrix math was a closure inside the pass, and the mock existed only to get at it. Exporting `applyColorMatrixToImageDataBytes` made the math directly testable, and the pass itself is now verified with plain stub objects for the two canvas contexts — no module substitution, no order dependence, faster, and it gained multi-pixel coverage that the mock shape made awkward.

Mocking remains the right tool for genuine **interaction** assertions — which collaborator a dispatch routed to, and with what arguments — where there is no pure kernel to extract. Follow both rules above when you do.

## Out-parameter testing

- When changing an `out`-parameter function, test both a distinct output object and the aliased case where `out` is also an input.

## Verifying a fix by reverting or mutating it

- A revert-and-check or mutation-testing result is only trustworthy after confirming the mutation actually changed the file. The formatter runs between edits in this repo, so a scripted find-and-replace can silently become a no-op once prettier has reflowed the target expression across lines — the probe then reruns against unchanged code and a real fix reads as "not caught." Print or otherwise check a replacement count (or diff the file) before drawing any conclusion from the result.

## What belongs in a unit test vs. elsewhere

- Put unit behavior in a colocated `*.test.ts` in the package that owns it, where `exports:check` binds it to an exported function and a developer changing that code will see it. A compiler-enforced property (e.g. the `Node<Traits>` invariance law) belongs in a colocated test too, asserted with `// @ts-expect-error` — `tsc -b` typechecks `src/*.test.ts`, so the failing-compile case is the assertion.
- There are no standing "API" or "integration" test categories. Cross-package wiring, the SDK barrel, and public import paths are already exercised far more thoroughly by the functional/example/reference visual suites — every scene builds and renders through `@flighthq/sdk` — and by `npm run packages:check` / `npm run api`, which police export shape directly. A barrel smoke test is a strictly weaker version of work CI already does on every PR.
- Reserve a root-level integration test only for a headless, logic-only flow that spans packages and produces no visual output (loader orchestration, resource lifecycle, serialization round-trips) — something the visual suites genuinely cannot reach. Do not recreate a generic api/integration bucket; if a test only proves "the surface compiles" or restates a single package's unit behavior, delete it.
