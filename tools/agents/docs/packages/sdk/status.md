---
package: '@flighthq/sdk'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# sdk — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` § Recommended.

Done:

- **Alphabetized the `package.json` dependency block.** Moved `easing`, `loader`, `scene`/`scene-gl`/`scene-wgpu`, `useragent`, `velocity`, and `webcam` into their correct alphabetical slots so the manifest matches the sorted `src/index.ts` barrel. No version or set change — pure ordering.
- **De-duplicated `SENTINEL_NAMES` in `src/collision.test.ts`.** Dropped the trailing "types (re-exported kind identifiers)" block whose `DisplayObjectKind` / `BitmapKind` entries duplicated the display-object entries, removing two redundant `it()` registrations.

Parked:

- **"Fix the stale `83 packages` count comment"** — not applicable. `collision.test.ts` was rebaselined earlier on 2026-06-25; the offending "across all 83 packages" comment and the 46-unique-name count assertion the item referenced no longer exist in the file. Nothing to fix.

Verification: `npm run test --workspace=packages/sdk` → 2 files, 69 tests, all pass. Did not run repo-wide checks/fix/order per dispatch constraints.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Session Status: @flighthq/sdk

**Date:** 2026-06-24 (second pass) **Starting score:** 99/100 (first pass) **Estimated new score:** 100/100

## Implemented (cumulative — both passes)

### Bronze: Reachability spot-check test (`src/index.test.ts`)

Replaced the bare `loads successfully` assertion with a structured `describe('package exports')` block covering 11 major domains. Each domain asserts one or more representative named exports resolve through the barrel as functions, plus asserts that canonical `*Kind` string identifiers carry their expected values:

- **application**: `createApplication`, `createApplicationWindow`
- **display object**: `BitmapKind = 'Bitmap'`, `createBitmap`, `createDisplayObject`, `DisplayObjectKind = 'DisplayObject'`
- **effects**: `createBloomEffect`
- **filters**: `createBlurFilter`
- **geometry**: `createMatrix`, `createRectangle`
- **loader**: `createResourceLoader`
- **particles**: `createParticleEmitterConfig`, `ParticleEmitterKind = 'ParticleEmitter'`
- **platform**: `getPlatformName`
- **render**: `createRenderState`, `registerRenderer`
- **sprite**: `createSprite`, `SpriteKind = 'Sprite'`
- **text**: `createTextLabel`, `TextLabelKind = 'TextLabel'`
- **timeline/tween**: `createTween`, `createTweenManager`

### Bronze: `*Kind` reachability assertions

Folded into the domain spot-checks above: `BitmapKind`, `DisplayObjectKind`, `SpriteKind`, `TextLabelKind`, and `ParticleEmitterKind` are all asserted with `toBe(expectedString)` so a silent kind regression in a sub-package surfaces at the barrel.

### Bronze: Local completeness guard (`src/completeness.test.ts`)

Colocated test that reads the monorepo filesystem at test time to assert the barrel's completeness invariant. Three groups:

1. **barrel covers all app-facing packages** — reads every `packages/*/package.json`, filters to `@flighthq/*` names not in the excluded set (`@flighthq/sdk`, `host-*`, `*-rs`), and asserts each appears in both `src/index.ts` (as `export *`) and `package.json` (as a `"*"` dependency).
2. **excluded packages are absent** — asserts `host-electron`, any `host-*` adapter, and any `*-rs` Rust wasm package are absent from both barrel and deps.
3. **dependency manifest stays in sync** — asserts every export has a dep entry and every dep entry has an export, and that all `@flighthq/*` dependencies use workspace wildcard version `"*"`.

### Silver: Centralized inclusion policy (`scripts/sdk-policy.ts`)

Created `scripts/sdk-policy.ts` exporting a single function `isSdkBarrelExcludedPackage(name: string): boolean` — the canonical definition of which packages must NOT appear in the SDK barrel:

- `@flighthq/sdk` itself
- `@flighthq/host-*` adapter packages
- `@flighthq/*-rs` Rust wasm drop-ins

`completeness.test.ts` retains a local copy (packages cannot import from `scripts/` without adding a dev dependency and tsconfig path mapping) with a comment pointing to `scripts/sdk-policy.ts` as the canonical source and noting both copies must stay in sync. `scripts/packages.ts` imports and uses the canonical version.

### Silver: Generated-and-diffed barrel sync check (integrated into `scripts/packages.ts`)

Extended `scripts/packages.ts` (which runs as `npm run packages:check`) with a `checkSdkBarrelSync()` function that:

1. Collects all app-facing package names from the discovered `packageDirs` using `isSdkBarrelExcludedPackage`
2. Parses the `export *` lines from `packages/sdk/src/index.ts`
3. Parses the `@flighthq/*` dependency entries from `packages/sdk/package.json`
4. Reports three classes of errors with actionable messages:
   - App-facing packages missing from the barrel export (tells exactly what line to add to `index.ts`)
   - App-facing packages missing from the barrel deps (tells exactly what to add to `package.json`)
   - Barrel entries pointing to excluded or non-existent packages (tells what to remove)

This check runs every time `npm run packages:check` is invoked — no separate script needed. The JSON output mode (`--json`) includes a `barrelSync` section.

**Immediate impact:** On first run, the check found three app-facing packages that were missing from the barrel:

- `@flighthq/device-formats` — missing from barrel and dependencies
- `@flighthq/platform-formats` — missing from barrel and dependencies
- `@flighthq/resource-formats` — missing from barrel, dependencies, and tsconfig files

All three were added:

- `packages/sdk/src/index.ts` — three new `export *` lines in alphabetical order
- `packages/sdk/package.json` — three new `"*"` dependency entries
- `packages/sdk/tsconfig.json` — three new `references` entries
- `tsconfig.base.json` — path entries for `@flighthq/resource-formats` (device-formats and platform-formats were already present)
- `tsconfig.build.json` — reference entry for `resource-formats`

### Silver: Collision regression gate (`src/collision.test.ts`)

New colocated test implementing the runtime complement to TypeScript's compile-time uniqueness enforcement. TypeScript's `export *` is a compile error for ambiguous re-exports, so `tsc -b` is already the primary collision enforcer; this test adds the runtime guard.

Two assertions:

1. **Namespace size lower bound** — imports `* as sdk` and asserts `Object.keys(sdk).length >= 4000`. Baseline as of 2026-06-24 is 4196 runtime keys across 86 packages. The bound protects against net namespace loss from collisions (where one package's value silently overwrites another's, which TypeScript doesn't catch). Raise `MIN_KEY_COUNT` when new packages are added; never lower it.

2. **Sentinel names present** — 47 canonical exported names drawn from every major domain, each asserted to exist in the namespace. Covers: application, camera, display object, easing, effects, entity, filters, geometry, interaction, lighting, loader, materials, mesh, node, particles, path, platform, render, resources, scene, scene-gl, scene-wgpu, signals, sprite, spritesheet, surface, text, textlayout, textshaper, texture, timeline, tween, and types. Guards against silent name removal or shadowing in any of those domains.

## Test results (second pass)

```
Test Files  3 passed (3)
     Tests  80 passed (80)
```

All checks pass: `packages:check` (89 packages + 17 examples + 0 barrel sync errors), `exports:check`, `order`, `prettier`.

## Remaining deferred items

### Gold: Tree-shake conformance test

Deferred. Requires wiring into `npm run size` and asserting that `import { X } from '@flighthq/sdk'` tree-shakes to the same bytes as `import { X } from '@flighthq/<owning-pkg>'`. The `size-runner.ts` script operates on example bundles that use the barrel by default; adding a tree-shake comparison would require building two versions of an example (one from the barrel, one from the direct package) and comparing gzip sizes. This is a tooling-integration item with meaningful complexity and a dependency on how `size-runner.ts` is extended.

### Gold: Side-effect-free enforcement at the boundary

Deferred. The existing `checkNoTopLevelSideEffects` in `scripts/packages.ts` already checks all individual package files. Extending it to assert that importing the full barrel registers no renderers, patches no globals, and starts no timers would require either: (a) running the barrel through Node.js in a clean environment and inspecting global state before and after, or (b) extending the static AST checker to follow `export *` chains and detect if any re-exported module has top-level side effects. Both require meaningful tooling work. For now, `sideEffects: false` on each package plus the per-package static check is the practical enforcement.

### Gold: Consumer import-path integration test

Deferred (lower priority). A root-level integration test that imports a complete end-to-end user flow through `@flighthq/sdk` (create display object → register renderer → prepare → draw via a mocked render state). The codebase guide says to reserve root-level integration tests only for logic-only flows that visual suites cannot reach; the visual suites already exercise the full barrel on every PR. This remains a lower-priority add.

### Gold: Full export-surface snapshot

Not implemented. A committed snapshot of the entire flattened namespace key set (sorted names) would turn any added/renamed export into a visible diff at the barrel boundary. The collision test's sentinel list partially addresses this for known-important names, but a full snapshot would cover every name. High value for API review; the snapshot format (file location, line format) is a design decision. The collision test's `MIN_KEY_COUNT` guard is the pragmatic approximation.

## Design choices made (second pass)

### Barrel sync check placement

The barrel sync check was placed directly in `scripts/packages.ts` rather than as a standalone script. Rationale: `packages:check` is already the canonical repo-health gate that every developer and CI pipeline runs; adding a new `npm run barrel:check` would create a separate gate that might be missed. The JSON output mode properly forwards the `barrelSync` errors section for tooling consumers.

### Centralized policy as a separate file, not inline

`scripts/sdk-policy.ts` is a single-export utility file rather than a comment in `packages.ts`. This makes it easy to import from future scripts, keeps the policy definition findable by name, and separates "what the policy is" from "how it's enforced."

### Collision test uses Object.keys, not TypeScript reflect

The collision test uses `Object.keys(sdk as Record<string, unknown>)` to enumerate runtime keys. This is intentionally the runtime view — TypeScript's structural type system already guarantees compile-time uniqueness; the test is specifically about the JS runtime namespace, where `export *` ordering can cause one value to shadow another without TypeScript flagging it.

### MIN_KEY_COUNT as a lower bound, not an exact match

The test asserts `>= 4000` rather than `=== 4196`. An exact match would require updating the constant for every added export across 86 packages, creating constant friction. A lower bound catches the important case (net namespace shrinkage from collision/removal) without false positives from additions.

## Concerns and surprises

- The barrel sync check found **real drift on first run**: three app-facing packages (`device-formats`, `platform-formats`, `resource-formats`) were missing from the barrel. This validates that the check was worth implementing and that the Bronze completeness test alone was insufficient — it only ran as part of the sdk test suite, not as part of `packages:check`. The repo-level check catches drift even when the sdk tests are not being run.
- `resource-formats` was also missing from `tsconfig.base.json` and `tsconfig.build.json`, which would have caused a type error when building the barrel after adding the `export *`. Both were added as part of fixing the drift.
- The collision test with `MIN_KEY_COUNT = 4000` is conservative — the actual baseline is 4196. This leaves 196 names of headroom before a regression fires. This is intentional: the bound should protect against large-scale collapse, not catch single-name changes (which the sentinel list handles).

## Suggestions for future sessions

1. Consider implementing the Gold export-surface snapshot as a committed `tests/sdk/namespace-snapshot.txt` (sorted names, one per line). The diff on any API change at the barrel level would be immediately visible in PR review.
2. The tree-shake conformance test would require extending `size-runner.ts` with a "direct vs barrel" comparison mode. This is the highest-value remaining Gold item for proving the `sideEffects: false` guarantee.
3. The collision test's sentinel list should be extended as new major domains are added. Current coverage: 47 sentinel names across 25+ domains.
