---
package: '@flighthq/device'
status: solid
score: 82
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - source (packages/device/src)
  - packages/types/src/{Device,DeviceCapabilities,DeviceDisplayMetrics,DeviceFormFactor}.ts
  - packages/useragent/src (dependency spot-check)
  - prior review (2026-06-25 merge gate, integration-b2824e3d8)
---

# device — Review

## Verdict

**solid — 82/100.** Both blockers from the 2026-06-25 merge-gate REJECT are resolved and that review is superseded. (1) The `@flighthq/types` header is fully landed: `Device.ts` carries the 25-field `DeviceInfo` and the 5-method `DeviceBackend` (`getCapabilities`/`getDisplayMetrics`/`getId`/`getInfo`/`getSafeAreaInsets`), with `DeviceCapabilities`, `DeviceDisplayMetrics`, and the `DeviceFormFactor*` constants each in their own types file — the implementation compiles against it. (2) The rejected `device-formats`/`platform-formats` packages **no longer exist**; UA parsing collapsed into the blessed `@flighthq/useragent` value-leaf exactly as structural fork E prescribed, and `device`'s only dependencies are `@flighthq/types` + `@flighthq/useragent`. The runtime the June review called "the right target" is now correctly merged. What keeps it out of the 90s: the duck-typed `refresh?` seam, a residual UA-regex duplication, the deliberately-thin `DeviceCapabilities`, and the undecided predicate/boundary open directions.

## Present capabilities

Verified against source (14 exports, each with a mirrored `describe` in `device.test.ts`):

- **Identity snapshot** — `getDeviceInfo(out)` over a 25-field `DeviceInfo`: arch, availableMemory, boardName, colorGamut, cpuCores, fontScale, formFactor, gpuRenderer/gpuVendor (via a transient `WEBGL_debug_renderer_info` read, try/caught to sentinels), isHdr, isJailbroken/isRooted, isLowEndDevice (≤1 GiB or ≤2 cores heuristic), isVirtual, manufacturer, marketingName, model, osBuild, osName/osVersion (via `@flighthq/useragent`), platformString, productName, supportedAbis, totalMemory (GiB→bytes from `navigator.deviceMemory`), webViewVersion. Every web-unknowable field resolves to `'' / -1 / false / []`, honestly commented.
- **Capabilities** — `getDeviceCapabilities(out)`: hasKeyboard/hasMouse/hasStylus with documented web heuristics (desktop-UA, `maxTouchPoints === 0`, always-false stylus). Scoped by the type comment to capabilities with no dedicated package owner.
- **Display metrics** — `getDeviceDisplayMetrics(out)`: colorDepth, densityDpi (web sentinel), logical/physical dimensions, pixelRatio; `@flighthq/screen` cross-referenced for live multi-display.
- **Safe area** — `getSafeAreaInsets(out)` plus `enableWebSafeAreaInsets()`: a live CSS `env(safe-area-inset-*)` probe element with a `ResizeObserver`, returning a dispose function (correct `dispose` semantics — detaches and releases to GC).
- **Install id** — `getDeviceId()`: `crypto.randomUUID()` persisted to `localStorage`, `''` sentinel when storage is blocked; explicitly documented as an install id, not a hardware serial.
- **Refresh + seam** — `refreshDeviceInfo()`, `getDeviceBackend`/`setDeviceBackend`/`createWebDeviceBackend` (lazy web default), and the four `create*` out-constructors.

Battery/thermal correctly live in `@flighthq/power` — the `DeviceInfo` type comment records the boundary.

## Gaps

1. **`refresh?` is not on the `DeviceBackend` header.** `refreshDeviceInfo` duck-types it via `backend as unknown as { refresh?: () => void }` (`device.ts:271`). The June review already noted the fix: declare `refresh?(): void` on `DeviceBackend` once the header landed — the header has landed and the cast remains. Small types-header edit; removes the only cast-past-the-seam in the package.
2. **`detectDesktopUa` residually duplicates `@flighthq/useragent`.** The private helper (`device.ts:289-291`) re-implements the desktop-UA branch of `parseUserAgentFormFactor` (`useragent/src/userAgentParse.ts:40`) — and the copies have **diverged**: device's regex includes `cros` (ChromeOS), useragent's does not. The charter's 2026-07-02 Decision ("evaluate the refactor, not forced DRY") is still open; the divergence is the concrete evidence the evaluation should weigh.
3. **`DeviceCapabilities` is thin** (3 flags). Partly by design (touch → `input`, camera → `webcam`, etc. per the type comment), but a mature device library also answers e.g. HDR/gamut (currently sentinel-only fields on `DeviceInfo`) and hover capability; the web `matchMedia('(color-gamut)' / 'dynamic-range' / 'hover')` queries could fill `colorGamut`/`isHdr`/`hasMouse` more honestly than sentinels/heuristics. Sweep-safe deepening of the web backend.
4. **Predicate conveniences undecided** — `isDeviceTablet(info)` etc. vs raw `formFactor` comparison (charter Open direction 5).
5. **No native backend in-box, no Rust crate** — expected at this stage; cross-package/cross-boundary.

## Charter contradictions

None. The charter's "What it is" names exactly the shipped six read functions plus the seam; the snapshot-vs-event boundary (battery to `power`) is honored in both type comments and source. The single charter Decision (evaluate `detectDesktopUa`) remains open — not contradicted, just not yet discharged.

## Contract & docs fit

- **Types-first: PASS** (the June blocker is gone; full shape navigable from the header layer).
- **Plurality guard: PASS** — the mis-split `-formats` packages are deleted; `useragent` is the shared value-leaf.
- Naming, out-param + `create*` quartet hygiene, sentinels-not-throws, lazy backend, `sideEffects: false`, single `.` barrel: all PASS.
- Minor style drift: `device.ts:285-287` uses a `// ---- ... ----` structural divider comment ("Web-backend detection helpers"), which the source-style rules ban. One-line cleanup.
- Tests: 14 describes, alphabetized, mirror exports; fake-backend pattern; `refreshDeviceInfo` covers both the no-op web path and the `refresh()`-exposing backend.

## Candidate open directions

- Declare `refresh?(): void` on `DeviceBackend` and drop the cast (types-header edit).
- `matchMedia`-backed web fills for `colorGamut` / `isHdr` / pointer-hover capability.
- Predicate-convenience policy (charter Open direction 5).
- `device` vs `screen` boundary ruling for `DeviceDisplayMetrics` (Open direction 2); `getId` durability via `@flighthq/storage` (Open direction 3); `installSource` home (Open direction 4).
