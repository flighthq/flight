---
package: '@flighthq/platform'
status: solid
score: 87
updated: 2026-09-02
ingested:
  - source
  - tests
  - charter.md
  - status.md
  - assessment.md
  - prior review (2026-07-13)
  - host-web webPlatform backend
  - host-electron electronPlatform backend
  - host-tauri tauriPlatform backend
  - types Platform.ts and Host.ts (HasSystemPlatform)
---

# platform — Review (live-tree survey, 2026-09-02)

> Supersedes the 2026-07-13 review. That review surveyed the post-merge-blocker state with 16 exports. Since then the package completed its R3 migration to the explicit dependency model, dropping ambient-state functions and reducing to 13 exports. This is a survey of `packages/platform/` as it stands.

## Verdict

**solid — 87/100.** The package is a clean, minimal identification seam that completed the R3 migration to the explicit dependency model (`HasSystemPlatform` host parameter). Every function now takes `host: HasSystemPlatform` and delegates to `host.system.platform.getInfo(out)` — no module-level mutable backend, no `setPlatformBackend`/`getPlatformBackend`, no `createWebPlatformBackend`. The web backend factory moved to `@flighthq/host-web`; native backends to their respective host packages. What remains is a pure query layer: 13 exports in the contract lane, 12 in the public lane, zero state management, zero side effects.

The prior review's three resolved blockers remain resolved. The R3 migration is the significant change since then, and it is clean: the test file includes an explicit "R3 boundary" `describe` block verifying that all seven removed symbols (`createWebPlatformBackend`, `explainPlatformBackend`, `getPlatformBackend`, `installPlatformHostBackend`, `observePlatformHostResult`, `resetPlatformBackendForTest`, `setPlatformBackend`) are absent from the contract.

## Present capabilities

**Contract lane** (13 exports from `contract.ts` via `platform.ts`):

- `comparePlatformVersions(a, b)` — pure numeric segment-by-segment version comparison; `''` sorts lowest; returns `-1 | 0 | 1`.
- `createPlatformInfo()` — allocates a zeroed `PlatformInfo` with all 14 fields at sentinel values. Contract-only; used by backends and tests building `out` objects.
- `getPlatformEngine(host)` — convenience scalar read for `engine`.
- `getPlatformInfo(host, out)` — fills and returns `out` via the host backend.
- `getPlatformKind(host)` — convenience scalar read for `kind`.
- `getPlatformName(host)` — convenience scalar read for `name`.
- `getPlatformRuntime(host)` — convenience scalar read for `runtime`.
- `isPlatformDesktop(host)` — `kind === 'desktop'`.
- `isPlatformMobile(host)` — `kind === 'mobile'`.
- `isPlatformNative(host)` — `runtime !== 'web' && runtime !== 'unknown'`.
- `isPlatformTouch(host)` — reads `isTouch` flag.
- `isPlatformVersionAtLeast(host, minimum)` — returns `false` for unknown version; numeric comparison otherwise.
- `isPlatformWeb(host)` — `kind === 'web'`.

**Public lane** (12 exports from `index.ts`): all of the above except `createPlatformInfo`, which is correctly contract-only since end users receive pre-filled info, while backends and tests need the allocator.

**Architecture and contract alignment:**

- Types-first: all types (`PlatformInfo`, `PlatformBackend`, `PlatformName`, `PlatformKind`, `PlatformRuntime`, `PlatformEngine`, `PlatformEndianness`, `HasSystemPlatform`) live in `@flighthq/types`. The package exports functions only.
- Two-lane exports: `.` and `./contract` configured in `package.json` with `types` + `default` conditions. No other subpaths.
- `sideEffects: false`: declared and true. No import-time registration, no top-level listeners, no mutable globals.
- Explicit dependency model: every function takes `host: HasSystemPlatform`. The module-level `_scratch` is a `const`-initialized pre-allocated `PlatformInfo` used for no-allocation convenience reads (scalar getters), with a C/C++ portability comment on the Rust mirror strategy. It is not ambient state — it is a performance scratch buffer with deterministic content determined by the `host` parameter on each call.
- Sentinel discipline: `'unknown'` for union-typed fields, `''` for strings, `-1` for `pointerWidth`, `false` for `isTouch`. No throws anywhere.
- Source style: module variable (`_scratch`) at file bottom after exports; functions alphabetized; `import type` on its own line.

**Test quality:** 36 test cases across 14 `describe` blocks in `platform.test.ts` (244 lines). Every exported function has a matching `describe`. Tests use a `fakeHost()` helper that constructs `HasSystemPlatform` from partial `PlatformInfo`, validating the explicit dependency model. The R3 boundary test explicitly asserts the absence of all deleted ambient-state symbols.

## Gaps

**Why not higher (87 vs 100):**

- **Stale `@flighthq/useragent` dependency.** `package.json` lists `@flighthq/useragent` as a runtime dependency, but no source file in `packages/platform/src/` imports from it. The dependency is left over from when the web backend (`getWebPlatformInfo`) lived inside this package; it now lives in `@flighthq/host-web`, which correctly declares its own `useragent` dependency. The stale entry is harmless but violates dependency hygiene.
- **Charter export count is stale.** The charter states "16 exports, pure identification seam" (decision 2026-07-02). The R3 migration reduced the export count to 13 (contract) / 12 (public). The charter should record the migration and update the count.
- **Electron backend does not set `runtime`.** `host-electron/src/electronPlatform.ts` fills only 6 of 14 `PlatformInfo` fields (`name`, `kind`, `version`, `arch`, `locale`, `isTouch`). Critically, it omits `runtime`, leaving it at the sentinel `'unknown'` when the caller passes a `createPlatformInfo()` output. This means `isPlatformNative(host)` returns `false` for an Electron host — a cross-package correctness issue. The Tauri backend correctly sets `runtime: 'tauri'`.
- **Native backends leave 7-8 fields unfilled.** Neither the Electron nor Tauri backend sets `engine`, `engineVersion`, `endianness`, `pointerWidth`, `osBuild`, `distro`, or `distroVersion`. These remain at whatever the `out` parameter held. For `endianness` and `pointerWidth`, values are trivially computable from `process.arch` and an `ArrayBuffer` probe (the web backend already does both via `@flighthq/useragent`). This is a cross-package gap (the backends live in `host-electron` and `host-tauri`, not here), but it means the `platform` seam's 14-field contract is only 6-7 fields deep on native hosts.
- **No async high-entropy resolve path.** Parked on the suite-wide async-shape decision. The UA string is frozen/reduced on modern Chromium (macOS pinned at `10_15_7`), so `version`/`arch`/`pointerWidth` are systematically stale via the web backend. This caps web fidelity.
- **`arch` is an unconstrained `string`.** The canonical token set (`'x64'`, `'arm64'`, `'x86'`, `'arm'`, `'wasm'`) is not enforced by a union type, so nothing prevents two backends from spelling the same CPU differently. Noted in status.md; a types-level decision.

## Charter contradictions

- The charter's scope ceiling states "16 exports." The actual count is 13 (contract) / 12 (public) after the R3 migration. The charter should record the migration as a dated decision and update the number.
- The charter's first open direction ("whether `@flighthq/platform-formats` collapses into `useragent`") was settled in source before the prior review and has still not been moved to a dated decision. The prior review noted this; it remains true.
- The charter describes `enableHostWebPlatform()` from `@flighthq/host-web` and `setPlatformBackend` as the backend installation mechanism. Both are gone; the host passes the backend as a structural slot in `HasSystemPlatform`. The charter's backend-installation description is stale.

## Contract & docs fit

- **`@flighthq/types`**: `PlatformInfo` (14 fields), `PlatformBackend` (single `getInfo` method), `HasSystemPlatform`, and all union types are present and correctly structured. The package's imports resolve cleanly to `@flighthq/types/contract`.
- **SDK barrel**: `packages/sdk/src/index.ts` and `packages/sdk/src/contract.ts` re-export `@flighthq/platform`. `packages/sdk/src/platform.ts` also re-exports the full surface.
- **`HostSystemCapabilities`**: `platform?: PlatformBackend` is declared as an optional slot in the host system capabilities interface (`packages/types/src/Host.ts:401`).
- **Consumers**: `host-web` tests import `createPlatformInfo` from `@flighthq/platform/contract`. `host-tauri` tests import `getPlatformName` from `@flighthq/platform/contract`. Both are valid contract-lane usage.

## Candidate open directions

- **Remove stale `@flighthq/useragent` dependency** from `package.json`. Sweep-safe, no code change.
- **Update charter** to record the R3 migration as a dated decision, update the export count to 13/12, retire the `platform-formats` open direction, and revise the backend-installation description.
- **Electron `runtime` omission** — cross-package fix in `host-electron` to set `out.runtime = 'electron'` (and ideally `endianness`, `pointerWidth` from `process.arch`). Correctness issue: `isPlatformNative` returns wrong answer.
- **Async high-entropy resolve** (`navigator.userAgentData.getHighEntropyValues`) — suite-wide async-shape decision, carried forward.
- **`PlatformGraphics` homing** (`hasWebgl2`/`hasWebgpu`/`prefersReducedMotion`) — here vs render-capabilities seam, carried forward.
- **`arch` union type** — constrain the string to a union of known tokens in `@flighthq/types`, shared with `@flighthq/device`.
- **Capacitor platform backend** — `host-capacitor` has no `PlatformBackend` implementation. Lower priority than the Electron/Tauri field-coverage gaps.
