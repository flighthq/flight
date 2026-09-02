---
package: '@flighthq/device'
status: solid
score: 88
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source (packages/device/src)
  - packages/types/src/{Device,DeviceCapabilities,DeviceDisplayMetrics,DeviceFormFactor}.ts
  - packages/host-web/src/webDevice.ts (web backend, post-R3)
  - packages/useragent/src/userAgentParse.ts (dependency spot-check)
  - prior review (2026-07-13)
---

# device — Review

## Verdict

**solid -- 88/100.** Three of the four gaps from the 2026-07-13 review are resolved. (1) `refresh?(): void` is now declared on `DeviceBackend` in `packages/types/src/Device.ts:55`; the duck-typed cast is gone and `device.ts:85` uses a clean optional chain (`host.system.device.refresh?.()`). (2) The `matchMedia`-backed `colorGamut` and `isHdr` detection landed in the web backend (`host-web/src/webDevice.ts:160-175`). (3) The R3 migration replaced the ambient `get/setDeviceBackend` pattern with explicit `HasSystemDevice` host threading -- every function now takes `host: HasSystemDevice` as its first argument, the web backend lives entirely in `host-web`, and a regression-guard test (`R3 boundary`) asserts the eight deleted ambient-state symbols are absent. The package is now a thin, 87-line delegation layer with no web-specific code, no module-level mutable state, and identical public/contract lanes. What keeps it from the 90s: a stale `@flighthq/useragent` dependency in `package.json`, and the remaining charter open directions (predicates, boundary rulings).

## Present capabilities

Verified against `packages/device/src/device.ts` (87 lines, 10 exports) and `device.test.ts` (11 `describe` blocks, 13 `it` cases):

- **Allocators** -- `createDeviceInfo()`, `createDeviceCapabilities()`, `createDeviceDisplayMetrics()`, `createSafeAreaInsets()`. Each returns a zeroed/sentinel-filled value matching its type. Tests verify every field.
- **Readers** -- `getDeviceInfo(host, out)`, `getDeviceCapabilities(host, out)`, `getDeviceDisplayMetrics(host, out)`, `getSafeAreaInsets(host, out)`. Each delegates to `host.system.device.<method>(out)` and returns the `out` value. Tests use a `fakeBackend()` / `fakeHost()` fixture to verify delegation and identity of the returned `out`.
- **Install id** -- `getDeviceId(host)` returns `host.system.device.getId()`. A string; `''` sentinel when unavailable. Test verifies delegation.
- **Refresh** -- `refreshDeviceInfo(host)` calls `host.system.device.refresh?.()`. Two test cases: (a) no-throw on a backend without `refresh`, (b) correct invocation when present.
- **R3 boundary guard** -- test asserts that `createWebDeviceBackend`, `enableWebSafeAreaInsets`, `explainDeviceBackend`, `getDeviceBackend`, `installDeviceHostBackend`, `observeDeviceHostResult`, `resetDeviceBackendForTest`, and `setDeviceBackend` are absent from the contract.

The web backend implementation now lives in `host-web/src/webDevice.ts` (203 lines): `createWebDeviceBackend()` (returns a `DeviceBackend`), `enableWebSafeAreaInsets()` (CSS env probe with `ResizeObserver`, returns a dispose function), plus five private helpers (`detectColorGamut`, `detectDesktopUa`, `detectHdr`, `detectLowEndDevice`, `readWebGpuInfo`). A module-level `webDeviceBackend` singleton is also exported.

Types are fully in `@flighthq/types`: `DeviceInfo` (25 fields), `DeviceBackend` (5 methods + optional `refresh`), `DeviceCapabilities` (3 booleans), `DeviceDisplayMetrics` (7 numeric fields), `SafeAreaInsets` (4 edges), `DeviceFormFactor` (string alias with 7 built-in constants), `HasSystemDevice`. Battery and thermal are correctly out of scope (type comment in `Device.ts:34` records the `@flighthq/power` boundary).

## Gaps

1. **Stale `@flighthq/useragent` dependency.** `package.json` and `tsconfig.json` both declare `@flighthq/useragent` as a dependency, but no source file imports from it. The R3 migration moved all UA parsing into `host-web/src/webDevice.ts`. The dependency is dead weight and inflates the install graph.
2. **`detectDesktopUa` duplication remains in `host-web`.** The private helper at `host-web/src/webDevice.ts:168-170` re-implements the desktop-UA regex branch of `parseUserAgentFormFactor` (`useragent/src/userAgentParse.ts:47`), and the copies still diverge: `detectDesktopUa` includes `cros` (ChromeOS) while `parseUserAgentFormFactor` does not. This is not a `device` package gap any more (the code moved to `host-web`), but the charter Decision from 2026-07-02 ("evaluate the refactor") is still undischarged -- the same divergence, in a new location.
3. **Predicate conveniences undecided** -- `isDeviceTablet(info)` etc. vs raw `formFactor` comparison (charter Open direction 5). No implementation exists.
4. **`DeviceCapabilities` remains thin** (3 boolean flags). The type comment scopes it intentionally (touch to `input`, camera to `webcam`), but the boundary is not ruled in the charter.
5. **No native backend in-box, no Rust crate** -- expected at this stage; cross-package/cross-boundary.

## Charter contradictions

None found. The charter's "What it is" describes the exact six-function shape (`getDeviceInfo`, `getDeviceCapabilities`, `getDeviceDisplayMetrics`, `getSafeAreaInsets`, `getDeviceId`, `refreshDeviceInfo`) plus the swappable `DeviceBackend` and host-threading pattern. The snapshot-vs-event boundary (battery to `power`) is honored. The single charter Decision (evaluate `detectDesktopUa` refactor) is undischarged but not contradicted.

One nuance: the charter still names `setDeviceBackend` and `getDeviceBackend` in its "What it is" paragraph and describes the precedence as "custom > host > sentinel." The R3 migration removed both of these functions from `device`; backend installation is now the host's responsibility (`HasSystemDevice`), and there is no `set*Backend` / `get*Backend` pair. The charter text is factually stale on this point -- the description of the seam was accurate pre-R3 but no longer matches the code.

## Contract & docs fit

- **Types-first: PASS.** All types in `@flighthq/types`; `device` exports functions only.
- **Two-lane structure: PASS.** `index.ts` re-exports 10 named symbols from `./contract`; `contract.ts` does `export * from './device'`. Lanes are currently identical, which is valid (`.` is a strict subset of `./contract`).
- **`sideEffects: false`: PASS.** No module-level mutable state, no top-level side effects.
- **Naming: PASS.** Full unabbreviated type names in function names (`getDeviceInfo`, `createDeviceCapabilities`, etc.).
- **Out-params: PASS.** `create*` allocators paired with `get*(host, out)` readers.
- **Sentinels-not-throws: PASS.** Allocators use `'' / -1 / false / []` sentinels.
- **Explicit dependency: PASS (R3).** Every function takes `host: HasSystemDevice`; no ambient state, no singletons, no `set*Backend`.
- **Test shape: PASS.** 11 `describe` blocks alphabetized by export name; fake-backend pattern; `refreshDeviceInfo` covers both the no-op and exposing-backend paths.
- **Stale dependency: FAIL.** `@flighthq/useragent` is declared in `package.json` and `tsconfig.json` but not imported. Mechanical removal.

### Candidate revisions to contract/admin docs

- **Charter "What it is"** still names `setDeviceBackend` and the `custom > host > sentinel` precedence model. Post-R3, neither function exists; the seam is the host's `DeviceBackend` slot. The paragraph should be rewritten to reflect the explicit-host model.
- **Package Map** (AGENTS.md) lists `device` under "Platform" without noting the R3 host-threading pattern. No factual error, but the prior "command capability" framing is gone.

## Candidate open directions

- Remove the stale `@flighthq/useragent` dependency from `package.json` and `tsconfig.json`.
- Whether the `detectDesktopUa` duplication in `host-web` should be reconciled with `@flighthq/useragent` (charter Decision, now a cross-package question between `host-web` and `useragent`).
- Predicate-convenience policy (charter Open direction 5).
- `device` vs `screen` boundary ruling for `DeviceDisplayMetrics` (charter Open direction 2).
- `getId` durability seam -- `@flighthq/storage` vs direct `localStorage` (charter Open direction 3, now relevant in `host-web`'s `webDevice.ts:46-60`).
- `installSource` / install provenance home (charter Open direction 4).
