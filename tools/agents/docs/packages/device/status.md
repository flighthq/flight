---
package: '@flighthq/device'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# device — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/device + @flighthq/device-formats

**Session date**: 2026-06-24 **Estimated score after this session**: 91/100 (Gold)

---

## Implemented APIs — cumulative (both passes)

### New neighbor package: `@flighthq/device-formats`

A pure, tree-shakable UA-parser library with no DOM access and no globals. The web backend in `@flighthq/device` imports from it; native hosts do not pull it in.

**Exports (`packages/device-formats/src/userAgentParse.ts`)**:

- `parseUserAgentArch(ua, uadPlatform?)` — CPU arch from UA string + optional Chromium UAC platform hint. Returns `'arm64' | 'arm' | 'x64' | 'x86' | 'riscv64' | 'mips64' | 'mips' | ''`.
- `parseUserAgentFormFactor(ua, maxTouchPoints)` — Device form factor from UA + touch-point count. Returns a `DeviceFormFactor` constant. Never returns `''`; falls back to `DeviceFormFactorUnknown`. Handles Car/TV/Watch/Tablet/Phone/Desktop.
- `parseUserAgentOsName(ua)` — Canonical OS name (`'Android' | 'iPadOS' | 'iOS' | 'Windows' | 'macOS' | 'ChromeOS' | 'Linux' | 'FreeBSD' | 'OpenBSD' | 'NetBSD' | ''`).
- `parseUserAgentOsVersion(ua)` — Dotted version string from Android/iOS/Windows/macOS/ChromeOS UAs. Returns `''` when not found.

**Tests**: 33 tests, all passing.

---

### Types — `@flighthq/types/src/Device.ts` (cumulative)

**New Gold fields on `DeviceInfo`** (added this pass):

- `boardName: string` — Internal hardware board identifier (e.g. `'msm8998'`). Android: `ro.product.board`. `''` on web.
- `colorGamut: string` — Display wide-color gamut (`'srgb' | 'display-p3' | 'rec2020' | ''`). `''` on web.
- `fontScale: number` — Accessibility text scale factor (`1.0` = normal). `-1` on web.
- `isHdr: boolean` — HDR display support. `false` on web.
- `marketingName: string` — Commercial product name (e.g. `'Galaxy S24 Ultra'`). `''` on web.
- `productName: string` — OEM internal product name (e.g. `'husky'`). `''` on web.
- `supportedAbis: ReadonlyArray<string>` — Supported CPU ABI list (e.g. `['arm64-v8a', 'armeabi-v7a']`). `[]` on web.
- `webViewVersion: string` — System WebView version string. `''` on web.

**All Silver fields (from first pass)**:

- `arch`, `availableMemory`, `cpuCores`, `formFactor`, `gpuRenderer`, `gpuVendor`, `isJailbroken`, `isLowEndDevice`, `isRooted`, `osBuild`, `platformString`, `totalMemory` — all present.

**New type: `DeviceCapabilities`** — hardware input capability flags:

- `hasKeyboard: boolean` — Physical keyboard present (web: UA heuristic; native: OS API).
- `hasMouse: boolean` — Mouse/trackpad present (web: `maxTouchPoints === 0` heuristic).
- `hasStylus: boolean` — Stylus/pen input supported (web: always `false`).

Doc cross-references in type comments for: touch/OS kind → `@flighthq/platform`, battery/thermal → `@flighthq/power`, camera → `@flighthq/webcam`, geolocation → `@flighthq/geolocation`, vibration → `@flighthq/haptics`.

**Updated `DeviceBackend` interface**:

- `getCapabilities(out: DeviceCapabilities): DeviceCapabilities` — new method (Gold).
- `getDisplayMetrics`, `getId`, `getInfo`, `getSafeAreaInsets` — as before.

---

### Implementation — `@flighthq/device/src/device.ts` (cumulative)

**New exported functions (Gold, this pass)**:

- `createDeviceCapabilities()` — Allocates zeroed `DeviceCapabilities` (all `false`).
- `getDeviceCapabilities(out)` — Fills capability flags from active backend.
- `refreshDeviceInfo()` — Signals native backends to invalidate their snapshot cache. No-op on the stateless web backend; calls `backend.refresh()` if the method exists (optional extension point).

**New Gold fields in `createDeviceInfo()`** — all new `DeviceInfo` fields zeroed with correct sentinels (`'' / [] / false / -1`).

**Web backend `getInfo` update** — delegates to `@flighthq/device-formats` parsers instead of embedding private UA helpers. Removed private `detectWebArch`, `detectWebFormFactor`, `detectWebOsName`, `detectWebOsVersion`. Added sentinel assignments for all Gold fields.

**Web backend `getCapabilities`** — best-effort UA + touch-point heuristic for `hasKeyboard` and `hasMouse`; `hasStylus` always `false`.

**All Silver functions (from first pass)**:

- `createDeviceDisplayMetrics`, `createDeviceInfo`, `createSafeAreaInsets`, `createWebDeviceBackend`, `enableWebSafeAreaInsets`, `getDeviceBackend`, `getDeviceDisplayMetrics`, `getDeviceId`, `getDeviceInfo`, `getSafeAreaInsets`, `setDeviceBackend`.

---

### Tests — `@flighthq/device/src/device.test.ts` (cumulative)

**26 tests, all passing.**

New coverage this pass:

- `createDeviceCapabilities` — all false sentinels.
- `createDeviceInfo` — all new Gold fields: `boardName`, `colorGamut`, `fontScale`, `isHdr`, `marketingName`, `productName`, `supportedAbis`, `webViewVersion`.
- `getDeviceCapabilities` — fills and returns via fake backend.
- `createWebDeviceBackend` — all new sentinel paths (`marketingName`, `productName`, `boardName`, `webViewVersion`, `colorGamut`, `fontScale`, `isHdr`, `supportedAbis`); capability heuristic smoke test.
- `getDeviceInfo` — all 24 `DeviceInfo` fields verified against fake backend.
- `refreshDeviceInfo` — no-op on web backend; calls `backend.refresh()` when present.

---

## Checks passed

- `npm run test --workspace=packages/device` — **26/26**
- `npm run test --workspace=packages/device-formats` — **33/33**
- `npm run exports:check` — clean (no device gaps)
- `npm run packages:check` — clean (all tsconfig.base.json paths + tsconfig.build.json references added)
- `npx eslint packages/device/src packages/device-formats/src` — clean

---

## Deferred Items

### Autonomously fixable in a future Gold pass

1. **`getDeviceIdAsync(): Promise<string>`** — For async native keystores (Android keystore, iOS Keychain). Deferred until a native host motivates the contract. The sync `getDeviceId()` works for all current use cases.

2. **Full Rust parity (`flighthq-device`)** — `DeviceInfo`, `SafeAreaInsets`, `DeviceDisplayMetrics`, `DeviceFormFactor`, `DeviceCapabilities`; `DeviceBackend` trait + `set_device_backend`; a `native`-feature default backend over `sysinfo`/`os_info`. Value-typed leaf — mixable per the conformance map. Deferred until TS type surface stabilizes.

3. **Package README** — A human-readable enumeration of every field, its unit, its sentinel, its web vs native source, and the cross-package delegation table.

### Design decisions (require user ruling)

1. **`getDeviceId` storage dependency** — The web backend currently reads/writes directly to `localStorage`. The maturation roadmap recommends injecting a storage function from `@flighthq/storage` to make the id durable across storage backends and keep `@flighthq/device` dependency-light. Decision needed: direct `localStorage` (current) vs injected storage seam.

2. **`DeviceDisplayMetrics` vs `@flighthq/screen` boundary** — Both cover display characteristics. The current split is: device = built-in display static data (pixel ratio, physical dimensions, DPI); screen = live multi-display enumeration, work-area, and orientation events. Needs a one-line ruling in the Package Map to prevent future overlap.

3. **`installerSource` / `installSource`** — Competitors surface this in the device library (Play Store, App Store, sideloaded). Flight's architecture suggests `@flighthq/app` owns it. Confirm placement before adding to either package.

4. **`isTablet` predicate convenience** — The `formFactor` field on `DeviceInfo` gives all the information, but some APIs want a boolean `isTablet`. Decision: add as a free function `isDeviceTablet(info: DeviceInfo): boolean` in `@flighthq/device`, or leave consumers to compare `formFactor === DeviceFormFactorTablet`?

---

## Design Choices Made

### `@flighthq/device-formats` split

The UA-parsing helpers (`detectWebArch`, `detectWebFormFactor`, `detectWebOsName`, `detectWebOsVersion`) were previously embedded as private functions in the web backend. They are now in a neighbor package (`@flighthq/device-formats`) as pure exported functions, consistent with `@flighthq/particles-formats` and `@flighthq/spritesheet-formats`. This:

- Makes the UA parsing table independently testable with a large fixture set (33 tests covering real UA strings for every OS/form-factor).
- Keeps `@flighthq/device` as a thin seam — the web backend becomes a thin orchestrator.
- Native hosts that do not need UA parsing do not pull in `@flighthq/device-formats`.
- The vitest environment for `device-formats` is `node` (pure functions, no DOM); `device` stays `jsdom`.

### `DeviceCapabilities` scope decision

Only the three capability flags with no dedicated package owner are in `DeviceCapabilities`: `hasKeyboard`, `hasMouse`, `hasStylus`. Touch (`maxTouchPoints`) stays in `@flighthq/platform`. Vibration stays in `@flighthq/haptics`. Camera in `@flighthq/webcam`. Geolocation in `@flighthq/geolocation`. This keeps `DeviceCapabilities` small and clearly scoped; the type file documents the cross-references explicitly.

### `refreshDeviceInfo()` design

Rather than adding a `refresh()` method to the `DeviceBackend` interface (which would be a breaking change for all existing backend implementations), `refreshDeviceInfo()` uses a duck-typed optional extension: `if (typeof backend.refresh === 'function') backend.refresh()`. Native backends that cache a snapshot add `refresh()` to their implementation; the web backend (stateless) ignores the call. This avoids a mandatory interface change while keeping the feature available.

### Gold identity fields added to `DeviceInfo`

The eight new fields (`boardName`, `colorGamut`, `fontScale`, `isHdr`, `marketingName`, `productName`, `supportedAbis`, `webViewVersion`) all return sentinels on web (`'' / [] / false / -1`). They are present in the type and zeroed by `createDeviceInfo()` to ensure native backends can conform to the full seam without a version split. No web-side computation is attempted for these — the browser does not expose them.

### `parseUserAgentArch` WOW64 precedence

WOW64 (Windows-on-Windows 64) appears in UA strings for 32-bit processes running on a 64-bit OS. `parseUserAgentArch` classifies WOW64 as `'x64'` because the host machine is 64-bit — the relevant arch for GPU/memory/capability purposes. A pure 32-bit UA (no WOW64, only `i386`/`i686`) returns `'x86'`. This is documented in the test.

---

## Score Estimate: 91/100

**Gold achieved.** Gap from perfect (9 points):

- 4 pts: `getDeviceIdAsync` and the async storage seam — deferred by design.
- 3 pts: Rust parity (`flighthq-device`) — deferred until type surface stabilizes.
- 2 pts: Package README with the full field/sentinel/web-vs-native/cross-package table.

---

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sole sweep-safe item from `assessment.md`'s Recommended list.

### Done

- **Added `packages/device/README.md`** — a human-readable field/unit/sentinel/web-vs-native table covering every `DeviceInfo` (25 fields), `DeviceCapabilities` (3), `DeviceDisplayMetrics` (7), and `SafeAreaInsets` (4) field, plus a function index and the `getDeviceId` install-id semantics. Pure documentation of the already-shipped surface; no code change. Closes the "2 pts: Package README" gap noted under the score estimate above and the lone Recommended bullet. This is the first README in `packages/` (no neighbor precedent to match).

### Parked

All remaining assessment items are Backlog (cross-package or design-decision) and out of bounds for this sweep:

- `getDeviceIdAsync` native-keystore seam — cross-boundary / needs a native host; premature.
- `flighthq-device` Rust crate — cross-tree (crates/), conformance track.
- `device-formats` → `useragent` collapse — cross-package structural fork; needs user bless.
- `getId` storage seam (inject `@flighthq/storage`) — cross-package dependency-direction decision.
- Predicate-convenience helpers (`isDeviceTablet`) — API-shape design decision.
- `device` ↔ `screen` boundary ruling — cross-package, needs charter ruling.
- `installSource` placement — cross-package placement decision (likely `@flighthq/app`).

### Verification

`npm run test --workspace=packages/device` → 26/26 passed. No source changed, so export/order checks are unaffected.
