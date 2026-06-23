---
id: testing
title: '@flighthq/testing'
type: new-package
target: testing
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/testing.md
  - tools/agents/docs/reviews/breadth/missing-domains.md
depends_on: []
updated: 2026-06-23
---

## Summary

Consumer-facing testing utilities — fake/recording backends for every `*Backend` platform seam, scene fixtures and builders, a headless capture/render harness, and golden-image (fingerprint + screenshot) assertion helpers, exported so SDK _users_ can unit- and integration-test their own apps.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable test kit: install/uninstall fakes for the seams an app most commonly touches, record their calls, build a trivial scene, render it headlessly, and assert it is not blank / matches a committed fingerprint. The 20% that lets a consumer write a real test today.

Types in `@flighthq/types` first (`TestBackends.ts`, `TestHarness.ts`, `TestFixture.ts`):

- `FakeBackendRecorder` — plain entity capturing calls: `{ calls: readonly FakeBackendCall[] }`; `FakeBackendCall` = `{ method: string; args: readonly unknown[]; at: number }`. The shared shape every fake records into.
- `FakeStorageState`, `FakeClipboardState`, `FakeDialogState`, `FakeFileSystemState` — plain seed/inspect state objects for the four highest-traffic seams (key/value map, clipboard contents, queued dialog results, in-memory file tree).
- `HeadlessRenderHarness` — opaque-ish plain entity bundling a render state + target surface + size, returned by `createHeadlessRenderHarness`.
- `HeadlessRenderBackendKind` string ids: `SoftwareRenderBackendKind` (default), with `GlRenderBackendKind`/`WgpuRenderBackendKind` reserved for Silver.
- `SceneFixtureOptions` — plain options for the common fixtures (size, background, child count).

Functions in `@flighthq/testing`:

- Fakes (one `create*` + paired install/uninstall per Bronze seam):
  - `createFakeStorageBackend(state?): StorageBackend`, `createFakeClipboardBackend(state?): ClipboardBackend`, `createFakeDialogBackend(state?): DialogBackend`, `createFakeFileSystemBackend(state?): FileSystemBackend`.
  - `installFakeBackends(fakes): () => void` — installs a bundle via the owning `set*Backend` and returns a single restore function that reinstalls the prior backends (the `acquire`/`release` bracket shape). Plus per-seam `installFakeStorageBackend(state?)` etc. for one-seam tests.
  - `getFakeBackendCalls(recorder): readonly FakeBackendCall[]`, `clearFakeBackendCalls(recorder)`.
- Scene fixtures/builders:
  - `createTestDisplayContainer(options?): DisplayContainer` — a ready stage/container fixture using constructors (not literals), per house rules.
  - `createTestBitmap(width, height, color): Bitmap`, `createTestShapeRectangle(...)` — minimal renderable leaves with known pixels.
  - `buildTestScene(spec): DisplayContainer` — a tiny declarative builder taking a plain nested spec (kind + children + transform) and returning a wired graph, so fixtures read as data.
- Headless render + capture:
  - `createHeadlessRenderHarness(options): HeadlessRenderHarness` — allocates a software render state targeting an offscreen `Surface` of the given size; no GPU, no DOM canvas.
  - `renderHeadlessFrame(harness, scene): void` — runs the required `prepareDisplayObjectRender` update pass then the draw walk into the harness surface (encapsulating the easy-to-forget prepare step the docs warn about).
  - `getHeadlessSurface(harness): Readonly<Surface>`, `destroyHeadlessRenderHarness(harness)` (frees the offscreen target — `destroy*`, it owns a resource).
- Golden-image asserts (thin layer over `@flighthq/surface` primitives, framework-free — return a result, do not throw):
  - `isSurfaceBlank(surface): boolean` — the not-blank smoke check.
  - `assertSurfaceFingerprint(surface, baseline, toleranceCells?): SurfaceFingerprintMatch` where `SurfaceFingerprintMatch = { matched: boolean; distance: number; expected; actual }` (built on `createSurfaceFingerprint` + `compareSurfaceFingerprints`). Returns the result; the caller (or a framework matcher) decides to fail.
  - `captureSurfaceFingerprint(surface, gridSize?): string` — convenience returning the committable text form.

### Silver

Competitive and solid: fakes for the _whole_ seam set, signal/clock control, backend-parity rendering, screenshot baselines, and an ergonomic framework matcher — matching what a well-regarded test toolkit (testing-library / msw / fake-timers tier) offers.

Types (`@flighthq/types`):

- `FakeBackendBundle` — `Readonly<Partial<Record<BackendSeamKind, …>>>` mapping each seam to its fake, with `BackendSeamKind` string ids (`ClipboardSeamKind`, `StorageSeamKind`, …) so a test can install/restore by seam id.
- Per-remaining-seam fake-state types where seed/inspect is meaningful: `FakeNotificationState`, `FakeShellState`, `FakeShareState`, `FakeNetworkState` (online/offline toggle), `FakePowerState`, `FakeScreenState`, `FakeDeviceState`/`FakePlatformState` (identity overrides), `FakeGeolocationState`, `FakeSensorsState`, `FakeWindowState`, `FakeTextShaperState` (deterministic metrics for layout tests), etc.
- `FakeClock` — controllable time source: `{ now: number }` with advance semantics, for deterministic tween/timeline/animation tests.
- `SignalCapture<T>` — recorded signal emissions: `{ payloads: readonly T[] }`.
- `RenderBackendParityResult` — `{ backends: readonly HeadlessRenderBackendKind[]; agree: boolean; maxDistance: number }`.
- `ScreenshotComparison` — `{ matched: boolean; changedPixels: number; diff: Surface | null }`.

Functions:

- Full fake coverage: a `createFake*Backend(state?)` for **every** remaining `*Backend` seam listed in Fits, each guarding/returning sentinels like its real web backend, each recording into a `FakeBackendRecorder`. Programmable results: `queueFakeDialogResult`, `setFakeNetworkOnline`, `setFakeGeolocationPosition`, `emitFakeSensorsReading`, `setFakeScreenLayout`, `setFakeDeviceIdentity`, etc.
- Event-seam fakes can _drive_ inbound events: `emitFakeLifecycleEvent`, `emitFakePowerEvent`, `emitFakeNetworkChange`, `emitFakeWindowResize` — so a consumer can test their `on*` handlers without the OS.
- Clock control: `createFakeClock(start?)`, `advanceFakeClock(clock, ms)`, `installFakeClock(clock): () => void` (drives the tween/timeline/animation time source through its injection seam — see Open questions on how time is injected).
- Signal capture: `captureSignal(signal): SignalCapture<T>` + `getCapturedSignalPayloads(capture)` / `clearSignalCapture(capture)` / `disposeSignalCapture(capture)` (detaches the listener — `dispose*`). Built on `@flighthq/signals`; inert unless the consumer enabled the relevant `enable*` group.
- Backend-parity render: `createHeadlessRenderHarness` accepts `backend: HeadlessRenderBackendKind`; `assertRenderBackendParity(scene, backends): RenderBackendParityResult` renders the same scene across the named backends and reports agreement via fingerprint distance — the consumer-facing version of the internal `:parity` gate.
- Screenshot baselines (RGBA-exact, complementing the tolerant fingerprint): `captureSurfaceScreenshot(surface): SurfaceImageData`, `compareSurfaceScreenshots(actual, baseline, tolerance?): ScreenshotComparison` (with diff-image emission, delegated to `@flighthq/testing-formats` for PNG encode/decode and baseline file IO).
- Richer fixtures/builders: `buildTestSceneFromJson(json)`, `createTestSpriteSheet`, `createTestTextLabel`, `createTestParticleEmitter` — known-output fixtures for the common content packages; `withTestScene(spec, body)` scoped helper that builds, runs, and tears down.
- Framework glue (optional, framework-free core unchanged): `createSurfaceFingerprintMatcher()` / `createScreenshotMatcher()` returning a plain matcher descriptor a consumer registers with Vitest/Jest `expect.extend`, so `expect(surface).toMatchFingerprint(baseline)` reads naturally without `testing` importing the runner.
- Bracketed install for all seams: `installFakeBackends(bundle)`/restore generalized over `FakeBackendBundle`; `resetAllBackends()` convenience restoring every seam to its default.

### Gold

Authoritative / AAA: the canonical consumer test toolkit. Exhaustive seam coverage with realistic simulators, deterministic async/frame control, interaction simulation, baseline lifecycle management, performance assertions, full docs, and 1:1 Rust-port parity.

Types (`@flighthq/types`):

- `FakeFileSystemTree` with permission/quota/error injection; `FakeNetworkProfile` (latency, offline windows, failure-rate) for resilience tests.
- `PointerSimulationStep` / `KeyboardSimulationStep` plain-data interaction scripts (the OpenFL-equivalent of synthesizing `MouseEvent`/`KeyboardEvent`) feeding `@flighthq/input`/`@flighthq/interaction` deterministically.
- `FrameTimeline` — a deterministic frame-stepping driver type (fixed-dt accumulator) pairing with `FakeClock` for animation/physics determinism.
- `GoldenBaselineManifest` — the committed-baseline index (path, kind, gridSize/tolerance, capture provenance) — lives in `@flighthq/testing-formats` as the on-disk format, surfaced here as the in-memory type.
- `RenderConformanceResult` — Rust↔TS cell result for the port's conformance instrument.
- `TestReport` — structured pass/fail/diff result aggregate for CI consumption (framework-agnostic).

Functions:

- Exhaustive, _behavioral_ fakes: every seam fake supports error injection, permission-denied simulation, and latency, not just static returns — `setFakeBackendError(recorder, method, error)`, `setFakeBackendLatency(...)` — so consumers can test failure paths (the SDK's whole sentinel/`null`/`false` contract is testable end-to-end).
- Interaction simulation: `simulatePointerSequence(harness, steps)`, `simulateKeyboardSequence(harness, steps)`, `simulateTap(harness, x, y)` — drive hit-testing/pointer dispatch and `textinput` editing without a DOM, asserting on captured signals.
- Deterministic frame loop: `createFrameTimeline(dt)`, `stepFrameTimeline(timeline, harness, scene, frames)` — run N fixed-step frames and capture a fingerprint per frame for animation regression (timeline/tween/particles/spritesheet).
- Baseline lifecycle: `writeGoldenBaseline(name, fingerprintOrScreenshot)`, `readGoldenBaseline(name): … | null`, `blessGoldenBaseline(name, actual)` (the `:baseline` write-mode verb), `assertGoldenImage(name, surface, options): TestReport` — the full committed-baseline loop a consumer points at their own `__baselines__` dir, with `diff.png` emission via `testing-formats`.
- Performance/allocation asserts: `measureRenderTime(harness, scene, iterations): number`, `assertNoUnexpectedAllocation(...)` where the platform permits, `assertDrawCallBudget(...)` (hooks the render queue counters) — consumer-facing perf gates.
- Resource/loader test doubles: `createFakeNetBackend`/`createFakeLoaderQueue` returning canned bytes/resources, so app code that loads assets is testable offline and deterministically (pairs with the `net`/`loader` maturation items).
- Snapshot of scene graph as plain data: `captureSceneSnapshot(node): SceneSnapshot` + `compareSceneSnapshots(a, b)` — a _structural_ (non-pixel) regression check on the graph, complementing image asserts; reuses the scene-serialization format if/when that package lands.
- Full Rust parity: `flighthq-testing` exposes the same harness/fixture/fingerprint/snapshot API over `displayobject-skia` (deterministic reference), and `RenderConformanceResult` helpers that compare a Rust render to a committed TS fingerprint — formalizing the conformance instrument so the same assertions run in both languages.
- Exhaustive colocated tests (the test package's _own_ tests, one `*.test.ts` per source, alias-safe `out` cases), public-import-path integration coverage, and consumer-facing docs/recipes for each framework.

## Boundaries

- **Not re-exported from `@flighthq/sdk`** and never imported by production code — it is a `devDependency` test adapter, the inverse of a runtime cell. It may know about many packages; none may depend on it.
- **No test runner inside.** It never imports `vitest`/`jest`/`mocha`, defines no global matchers, registers nothing at module top level. Framework integration is opt-in glue built on framework-free primitives.
- **Fingerprint _primitives_ stay in `@flighthq/surface`.** `SurfaceFingerprint`, `createSurfaceFingerprint`, `compare/format/parseSurfaceFingerprint` already exist there and remain there; `testing` consumes them and adds the _assert_ layer, it does not duplicate the math.
- **Real backends stay in their owning packages.** `createWeb*Backend` and `host-electron` adapters are production code; `testing` only adds the _fake_ alternative installed through the same `set*Backend` seam. The fake never lives in the capability package.
- **Baseline file formats / PNG / diff IO live in `@flighthq/testing-formats`**, re-exported as convenience but importable in isolation, per the `-formats` neighbor pattern — keeping the core package free of codec weight.
- **The internal CI harnesses (`tools/functional`, capture/parity gates, `createFunctionalTarget`) are not this package.** They are repo-private tooling; `testing` is the public extraction. Migrating those onto `testing` is a possible follow-up, not a requirement of the spec.
- **Scene _serialization_/migration is not owned here.** If/when a `scene-format` package exists, `captureSceneSnapshot` reuses its format; `testing` does not become the home for the persistence seam.
- **No mocking of arbitrary user functions / no general spy library.** Recording is scoped to SDK `*Backend` seams and signals. A generic mock framework is the consumer's runner's job.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **One package or split fakes vs harness?** Fakes (value-ish, no GPU) and the headless render harness (pulls `render` + a renderer) have very different weight. Even though nobody ships `testing` to prod, a `testing` (fakes + fixtures + fingerprint asserts) and `testing-render` (harness + parity + screenshots) split could keep "I just want fake backends" tests from pulling the renderer. Decide whether the single-root rule plus tree-shaking makes the split unnecessary, or whether the harness deserves its own cell.
- **How does the harness select a software renderer without a real backend?** Bronze assumes a pure-`surface` software rasterizer exists to render display objects headlessly. On the web, `displayobject-canvas` needs a real canvas; the deterministic path is `displayobject-skia` (Rust/wasm). Confirm whether the TS harness renders via a jsdom-canvas double, a wasm-skia path, or a minimal CPU rasterizer purpose-built for tests — this gates Bronze feasibility.
- **Clock injection seam.** `installFakeClock` presumes tween/timeline/animation read time through an injectable source. Today many may read `performance.now()` directly. This likely requires a small upstream change (a settable time provider) in `tween`/`timeline` — a cross-package dependency to surface, not solve here.
- **Framework matcher delivery.** Ship matcher descriptors that consumers register (`expect.extend`), or a tiny optional `@flighthq/testing-vitest` glue cell? Leaning descriptors-only to stay runner-agnostic; confirm.
- **Where do fakes record provenance for event-seam capabilities?** Event seams (`network`/`power`/`lifecycle`/`sensors`/`window`) deliver via signals, not return values. Confirm the fake-drives-events API (`emitFake*`) is the right shape versus exposing the fake's internal signal directly.
- **Baseline directory convention for consumers.** Do we prescribe a `__baselines__` layout + `bless` CLI verb (consumer-facing), or leave path management entirely to the consumer and only provide read/write/compare primitives? Affects how much of the internal capture loop is externalized.
- **Is `testing` the right name** given it could read as internal CI? Alternatives: `test-kit`, `testkit`, `test-utils`. `testing` is the shortest globally-understood word for "utilities to test with"; confirm it does not collide with the internal-tooling mental model.
- **Rust harness vs `flighthq-capture` overlap.** The Rust port already has `flighthq-capture` (headless wgpu → PNG/fingerprint) and conformance scenes. Decide whether `flighthq-testing` _is_ the consumer-facing wrapper over `capture`, or whether `capture` folds into `testing` — avoid two crates owning the headless-render-and-fingerprint job.

## Agent brief

> Create `@flighthq/testing` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
