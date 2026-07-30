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

## Do not `vi.mock` a sibling module

The suite runs **non-isolated** (`isolate: false` in the root `vitest.config.ts` — one module registry per worker, not one environment per file). So `vi.mock('./sibling')` is **order-dependent**: if any other test file in the same worker has already loaded that module unmocked, the mock does not apply and the real implementation runs. The test then passes or fails according to file execution order, which changes with parallelism and sharding.

The failure mode is silent and inverted — such a test typically passes in isolation and when run package-scoped, and fails only in the full suite, so it reads as flakiness rather than as a defect in the test.

Instead, **extract the pure kernel and test it directly**. A test that reaches for a module mock is usually telling you the unit under test is bundling a pure function it has not exported. `canvasColorMatrixPass.ts` is the worked example: the per-pixel matrix math was a closure inside the pass, so the test mocked the compositing module purely to capture that closure. Exporting `applyColorMatrixToImageDataBytes` made the math directly testable, and the pass itself is then verified with plain stub objects for the two canvas contexts — no module substitution, no order dependence, and a faster test.

Where a collaborator genuinely must be substituted, prefer a stub value passed in over a mocked module.

## Out-parameter testing

- When changing an `out`-parameter function, test both a distinct output object and the aliased case where `out` is also an input.

## What belongs in a unit test vs. elsewhere

- Put unit behavior in a colocated `*.test.ts` in the package that owns it, where `exports:check` binds it to an exported function and a developer changing that code will see it. A compiler-enforced property (e.g. the `Node<Traits>` invariance law) belongs in a colocated test too, asserted with `// @ts-expect-error` — `tsc -b` typechecks `src/*.test.ts`, so the failing-compile case is the assertion.
- There are no standing "API" or "integration" test categories. Cross-package wiring, the SDK barrel, and public import paths are already exercised far more thoroughly by the functional/example/reference visual suites — every scene builds and renders through `@flighthq/sdk` — and by `npm run packages:check` / `npm run api`, which police export shape directly. A barrel smoke test is a strictly weaker version of work CI already does on every PR.
- Reserve a root-level integration test only for a headless, logic-only flow that spans packages and produces no visual output (loader orchestration, resource lifecycle, serialization round-trips) — something the visual suites genuinely cannot reach. Do not recreate a generic api/integration bucket; if a test only proves "the surface compiles" or restates a single package's unit behavior, delete it.
