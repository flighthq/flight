---
package: '@flighthq/device'
status: solid
score: 78
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
  - structural-forks.md
  - register.md
---

# device — Review

> Survey layer. Observation only — no roadmap, no approval. Evidence is the incoming bundle `builder-67dc46d64` (`packages/device/`, `packages/device-formats/`, `packages/types/src/Device.ts`, `changes.patch`). The prior depth review (`reviews/depth/device.md`) does not exist, so this is the first survey of the cell. Findings reference `67dc46d64:<path>`.

## Verdict

**solid — 78/100.** The `@flighthq/device` package itself is genuinely well-built: a clean backend seam, complete sentinel discipline, full `out`-param + `create*` quartet hygiene, a thorough `DeviceInfo`/`DeviceCapabilities`/`DeviceDisplayMetrics` field set, and 26 colocated tests against a fake backend. On its own merits it reads near-Gold.

The score is held down not by `device` but by the neighbor the session spawned. The worker's headline design choice — extracting UA parsing into a new `@flighthq/device-formats` package — is the **exact package the SDK-wide register has already rejected** (`register.md:38`: blood-from-a-stone, no plurality, misnamed `-formats` on a UA string, duplicate `parseUserAgentArch` export → collapse into `useragent`). The status doc claims 91/100 "Gold" and presents the split as a virtue; measured against the structural forks it is a structural regression that now ships a literal duplicate export across two packages. The `device` runtime is solid; its dependency edge points at a package that should not exist.

## Present capabilities

Grounded in `67dc46d64:packages/device/src/device.ts` and `Device.ts`.

**Backend seam.** `DeviceBackend` (`getCapabilities`/`getDisplayMetrics`/`getId`/`getInfo`/ `getSafeAreaInsets`) with `getDeviceBackend` (lazy web default), `setDeviceBackend(backend | null)` (null → web fallback). Matches the platform-suite command-capability pattern: flat free functions delegating to a swappable backend, web default always available. No top-level side effects; `sideEffects: false` is declared and honored (the web backend is lazily constructed in `getDeviceBackend`, not at module load).

**Value quartet + out-params.** `createDeviceCapabilities`, `createDeviceDisplayMetrics`, `createDeviceInfo`, `createSafeAreaInsets` all allocate zeroed snapshots with correct sentinels (`'' / [] / false / -1`; insets `0`). Every read function (`getDeviceInfo`, `getDeviceCapabilities`, `getDeviceDisplayMetrics`, `getSafeAreaInsets`) is `out`-param and returns `out`. Allocation boundaries are explicit and C/C++-portable.

**Web backend coverage.** `getInfo` resolves `arch` (UA + `userAgentData.platform` hint), `cpuCores` (`hardwareConcurrency`), `totalMemory` (`deviceMemory` GiB→bytes), `isLowEndDevice` (memory/core heuristic), `formFactor` (UA + `maxTouchPoints`), `osName`/`osVersion` (UA), `gpuRenderer`/`gpuVendor` (`WEBGL_debug_renderer_info` via a transient context, try/caught), `platformString` (raw UA). All genuinely-unknowable-on-web fields are honestly sentinelled (model, manufacturer, board, ABIs, HDR, color gamut, font scale, jailbreak/root, available memory, webview version).

**Safe-area insets.** `getSafeAreaInsets` reads zeros by default; `enableWebSafeAreaInsets()` mounts a hidden `env(safe-area-inset-*)` CSS probe with a `ResizeObserver` and returns a dispose function (correctly verbed — it detaches the observer and removes the element, no native resource freed). Graceful degradation when `document`/`ResizeObserver` are absent.

**Install id.** `getId` persists a `crypto.randomUUID()` to `localStorage`, try/caught, `''` on failure. Comment is honest that this is a resettable install id, not a hardware serial.

**Refresh seam.** `refreshDeviceInfo()` duck-types an optional `backend.refresh()` so the interface need not carry a method every backend must implement; no-op on the stateless web default.

**device-formats (the neighbor).** `parseUserAgentArch`, `parseUserAgentFormFactor`, `parseUserAgentOsName`, `parseUserAgentOsVersion` — pure, DOM-free, `node`-env-tested (33 tests). As _code_ these parsers are fine; the problem is the package they live in, not their internals.

**Type home.** All five types (`DeviceInfo`, `DeviceCapabilities`, `DeviceDisplayMetrics`, `SafeAreaInsets`, `DeviceBackend`, plus the `DeviceFormFactor*` string-kind constants) are correctly defined in `@flighthq/types/src/Device.ts` with the deliberate cross-package split documented inline (locale/touch→platform, battery→power, screen→screen, etc.). Exemplary header-layer discipline.

## Gaps

Measured against the AAA device-library target (the charter is a stub — see candidate directions).

- **Async id seam.** `getDeviceIdAsync(): Promise<string>` for native keystores (Android Keystore, iOS Keychain) is absent. The status doc defers it; the sync path covers web. A real gap once a native host lands, not before.
- **Rust crate.** No `flighthq-device` crate exists. `crate: flighthq-device` is asserted in the charter front matter but unbuilt. As a value-typed leaf it is mixable per the conformance map; this is expected unbuilt work, flagged for completeness.
- **README.** No human-readable field/unit/sentinel/web-vs-native table. Minor.
- **No `isDeviceTablet`-style predicate convenience.** Consumers must compare `formFactor === DeviceFormFactorTablet`. The status doc surfaces this as a design question — correctly, since it is a taste call, not an omission.
- **`getId` storage coupling.** The web backend writes `localStorage` directly rather than through a `@flighthq/storage` seam. A dependency-direction question (status doc flags it); not a defect.

## Charter contradictions

The charter is a seed stub (North star / Boundaries / Decisions all `TODO`), so there is no _blessed_ principle for the code to contradict. **But the SDK-wide structural forks are charter-equivalent here**, and the work contradicts them squarely — this is the highest-value finding in this review:

- **`device-formats` is a rejected package.** `structural-forks.md` (the plurality guard, line 34) and `register.md:38` both name `device-formats` explicitly as **rejected**: "blood-from-a-stone: split a subject with no plurality, misnamed (`-formats` on a UA string), duplicate `parseUserAgentArch` export." The mandated resolution is **collapse into a new `useragent` primitive** (`register.md:44`) shared by the web backends of both `device` and `platform`. The session created the package the register exists to prevent, and the status doc (line 140) frames it as a positive design choice "consistent with `particles-formats`/`spritesheet-formats`" — but those are _real_ `-formats` subjects with format plurality; a UA string is not a format, and there is exactly one.

- **The duplicate export is now real, not theoretical.** Verified: `parseUserAgentArch` is exported from **both** `@flighthq/device-formats` (`userAgentParse.ts:22`) and `@flighthq/platform-formats` (consumed at `platform.ts:2`/`:153`). Two packages ship a same-named UA-arch parser. This is the precise duplication the register cites, now concrete in the bundle. A `useragent` package would dedupe it to one home.

- **Internal duplication too.** `detectDesktopUa` in `device.ts:289` re-implements the desktop-UA regex that `parseUserAgentFormFactor` already owns (`userAgentParse.ts:71`) — the same `win(?:dows)?nt| macintosh|mac os x|linux(?!.*android)|...` pattern, split across the package boundary. A unified `useragent` home would collapse this too.

None of this faults the `device` _runtime_. The contradiction lives entirely on the packaging edge: a correct package importing from a package the register says should not exist.

## Contract & docs fit

**Where the package lives up to the contract (device proper):**

- Types-first in `@flighthq/types` ✓ — all shapes in `Device.ts`, nothing inlined.
- Full unabbreviated names ✓ — `getDeviceDisplayMetrics`, `createDeviceCapabilities`, etc.
- `out`-params + `create*` allocation discipline ✓.
- Sentinels-not-throws ✓ — every unknowable field returns `'' / -1 / false / []`; `getId`/`readWebGpuInfo` try/catch to a sentinel rather than throwing.
- Single root `.` export ✓ (`index.ts` is `export * from './device'`); `sideEffects: false` ✓.
- `dispose`/teardown verb ✓ — `enableWebSafeAreaInsets` returns a dispose (detach-to-GC, not destroy).
- Exports alphabetized; tests mirror source order and use the constructors. `getDeviceId` correctly _omits_ the `out`-param shape (returns a primitive `string`).

**Where the contract / admin docs are out of sync with reality (candidate revisions — user-gated):**

- **Package Map omits `device-formats`.** `tools/agents/docs/index.md` lists `@flighthq/device` but not `@flighthq/device-formats`, even though the bundle ships it as a real workspace package with a charter cell. This is _correct by intent_ (the register rejected it) but means the live tree and the Map disagree. Resolution is not "add it to the Map" — it is to execute the register's `useragent` collapse so the package stops existing.
- **No `device-formats` status cell, but a `charter.md` exists.** `packages/device-formats/charter.md` was scaffolded; pairing a charter with a rejected package risks blessing-by-inertia. Flag for the user: the `device-formats` cell should be resolved (collapsed/removed), not charter-authored.
- **Charter front matter asserts `crate: flighthq-device`** while the crate is unbuilt — accurate as an intent stamp, but worth noting the conformance map has no `flighthq-device` yet.

**Rust mirror:** none built. Expected for a leaf this early; recorded, not faulted.

## Candidate open directions

The charter's North star / Boundaries / Decisions are all `TODO`. Each assumption this review had to make is a question for the user to settle into the charter:

1. **Resolve the `device-formats` / `useragent` fork — the load-bearing one.** The register's verdict (collapse `device-formats` + `platform-formats` → a shared `useragent` value-leaf) is a _recommended_ resolution, not yet blessed and not yet executed. Does the user bless the collapse? Until then the bundle ships a rejected package and a duplicate export. This is a cross-package design decision — surfaced here, not actioned.
2. **`device` ↔ `screen` boundary.** `DeviceDisplayMetrics` (static built-in display) vs `@flighthq/screen` (live multi-display, work-area, orientation). The split is sensibly documented in `Device.ts` but never blessed in the Package Map. Needs a one-line ruling to prevent future overlap.
3. **`getId` durability seam.** Inject `@flighthq/storage` vs direct `localStorage`. Affects the dependency-weight North star (device should stay dependency-light) and id durability across backends.
4. **`installSource` / `installerSource` home.** Play Store / App Store / sideloaded provenance is a common device-library field; Flight's layering suggests `@flighthq/app`. Confirm placement.
5. **Predicate-convenience policy.** `isDeviceTablet(info)` etc. as free functions, or leave consumers to compare the `formFactor` string-kind? A taste call the charter should record once.
6. **What "Gold" means for a host-identity leaf.** The status doc's 91/100 self-score counts only within-`device` completeness and ignores the packaging verdict. The charter should state the bar so a future session does not re-spawn a rejected neighbor and call it Gold.
