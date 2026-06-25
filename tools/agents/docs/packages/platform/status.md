---
package: '@flighthq/platform'
updated: 2026-06-25
by: ingest:builder-67dc46d64
---

# platform — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sole sweep-safe item in `assessment.md`'s Recommended section.

**Done:**

- Added `packages/platform/README.md` — the canonical environment-identification reference. Documents all 14 `PlatformInfo` fields (type, value space, sentinel, web source, native source) in a table, enumerates every exported function, and adds the cross-package delegation table (`@flighthq/device`, `@flighthq/power`, `@flighthq/screen`, `@flighthq/app`) plus the `@flighthq/useragent` value-leaf note. The native-reserved stub fields (`osBuild`/`distro`/`distroVersion`) are explicitly documented as always-`''`-on-web rather than silently empty. Pure documentation of the already-shipped surface — no code change, no new export, no design decision.

**Parked (all Backlog items — none sweep-safe):**

- `platform-formats` → `useragent` collapse — cross-boundary: removes a dependency package and pairs with the identical `device-formats` decision; needs the user's bless.
- Async high-entropy resolve seam (`getPlatformInfoAsync`/`refreshPlatformInfo`) — design decision: a suite-wide async-shape decision shared with `@flighthq/device`; would touch `@flighthq/types`.
- Native fillers for `osBuild`/`distro`/`distroVersion` — cross-tree: needs a native host that does not exist in this codebase yet.
- `PlatformGraphics` capability block — design decision: home (render-capabilities seam vs. here) is an Open direction.
- Rust mirror catch-up — cross-boundary: lives in `crates/` / the conformance track.
- Pin canonical `arch` token set shared with `@flighthq/device` — cross-boundary: spans `@flighthq/types` and two packages.

**Verification:** `npm run test --workspace=packages/platform` — 73/73 pass.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/platform + @flighthq/platform-formats

**Session date (pass 2):** 2026-06-24 **Starting score (pass 2):** 83/100 **Estimated new score:** 93/100

---

## Cumulative implemented APIs (across both passes)

### `@flighthq/types` — `Platform.ts`

All shared types and the backend seam. Fields are alphabetized within the interface.

**Types exported:**

- `PlatformName` — `'web' | 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown'`
- `PlatformKind` — `'desktop' | 'mobile' | 'web' | 'unknown'`
- `PlatformRuntime` — `'web' | 'electron' | 'tauri' | 'capacitor' | 'native' | 'unknown'`
- `PlatformEngine` — `'blink' | 'gecko' | 'webkit' | 'unknown'`
- `PlatformEndianness` — `'little' | 'big' | 'unknown'` (**new pass 2**)

**`PlatformInfo` fields (all documented with value space, sentinel, and source):**

| Field           | Type                 | Sentinel    | Web source                                |
| --------------- | -------------------- | ----------- | ----------------------------------------- |
| `name`          | `PlatformName`       | `'unknown'` | UA-string pattern                         |
| `kind`          | `PlatformKind`       | `'unknown'` | derived from `name`                       |
| `version`       | `string`             | `''`        | UA-string per-OS regex                    |
| `arch`          | `string`             | `''`        | UA-string heuristics                      |
| `locale`        | `string`             | `''`        | `navigator.language`                      |
| `isTouch`       | `boolean`            | `false`     | `navigator.maxTouchPoints`                |
| `runtime`       | `PlatformRuntime`    | `'unknown'` | global probes                             |
| `engine`        | `PlatformEngine`     | `'unknown'` | UA-string regex                           |
| `engineVersion` | `string`             | `''`        | UA-string regex (**new pass 2**)          |
| `endianness`    | `PlatformEndianness` | `'unknown'` | `ArrayBuffer` probe (**new pass 2**)      |
| `pointerWidth`  | `32 \| 64 \| -1`     | `-1`        | derived from `arch` (**new pass 2**)      |
| `osBuild`       | `string`             | `''`        | native-only (**new pass 2**)              |
| `distro`        | `string`             | `''`        | native-only / Linux only (**new pass 2**) |
| `distroVersion` | `string`             | `''`        | native-only / Linux only (**new pass 2**) |

**`PlatformBackend` interface:**

- `getInfo(out: PlatformInfo): PlatformInfo` — synchronous fill

---

### `@flighthq/platform-formats` — **new package (pass 2)**

Pure UA-string parser. No DOM dependencies. All functions are tree-shakable free functions with no side effects.

**Exported functions:**

- `parseUserAgentArch(ua): string` — `'x64' | 'arm64' | 'x86' | 'arm' | ''`
- `parseUserAgentEngine(ua): PlatformEngine` — regex-ordered (Firefox first, then blink, then webkit)
- `parseUserAgentEngineVersion(ua, engine): string` — browser/engine version; Edge `Edg/` takes priority over `Chrome/`
- `parseUserAgentKind(name): PlatformKind` — derived from name (`ios`/`android` → `'mobile'`, else `'web'`)
- `parseUserAgentName(ua): PlatformName` — android first (before linux check), then ios, windows, macos, linux
- `parseUserAgentPointerWidth(arch): 32 | 64 | -1` — derived from canonical arch token
- `parseUserAgentRuntime(win): PlatformRuntime` — accepts explicit window-like for testability; `null`/`undefined` → `'unknown'`
- `parseUserAgentVersion(ua, name): string` — per-platform regex; `_` → `.` normalization for iOS/macOS
- `probeEndianness(): PlatformEndianness` — `ArrayBuffer`/`Uint16Array` probe; `'unknown'` on failure

Test coverage: 54 tests in `userAgent.test.ts`, covering all exported functions, all canonical return values, edge cases (empty UA, null window, partial tokens, etc.).

---

### `@flighthq/platform`

Seam layer over a swappable `PlatformBackend`. Web backend now delegates all UA parsing to `@flighthq/platform-formats`.

**Exported functions:**

- `comparePlatformVersions(a, b): -1 | 0 | 1` — numeric segment-wise comparison; `''` sorts lowest (**new pass 2**)
- `createPlatformInfo(): PlatformInfo` — zeroed struct including all new fields
- `createWebPlatformBackend(): PlatformBackend` — delegates to `@flighthq/platform-formats` parsers
- `getPlatformBackend(): PlatformBackend` — lazy web fallback
- `getPlatformEngine(): PlatformEngine` — convenience scalar
- `getPlatformInfo(out): PlatformInfo` — out-param fill
- `getPlatformKind(): PlatformKind` — convenience scalar
- `getPlatformName(): PlatformName` — convenience scalar
- `getPlatformRuntime(): PlatformRuntime` — convenience scalar
- `isPlatformDesktop(): boolean`
- `isPlatformMobile(): boolean`
- `isPlatformNative(): boolean` — `runtime !== 'web' && runtime !== 'unknown'`
- `isPlatformTouch(): boolean`
- `isPlatformVersionAtLeast(minimum): boolean` — reads live version; `false` when `version === ''` (**new pass 2**)
- `isPlatformWeb(): boolean`
- `setPlatformBackend(backend | null): void`

Test coverage: 73 tests in `platform.test.ts`, including:

- All exported functions, all `PlatformRuntime` / `PlatformEngine` tokens via fakeBackend
- `comparePlatformVersions`: empty string ordering, numeric vs lexicographic, trailing segment normalization
- `isPlatformVersionAtLeast`: equal/greater/less/empty/patch cases
- Web backend UA detection: arch, engine, engineVersion, endianness, pointerWidth, version
- Canonical token normalization: all 5 representative UAs assert only known union values for every field
- `createPlatformInfo` zero-state includes all new fields

---

## Design choices made (pass 2)

### `@flighthq/platform-formats` as a `-formats` neighbor

Moved all UA-string parsing into a separate pure package following the established `-formats` sibling pattern (`particles-formats`, `spritesheet-formats`). Design rationale:

- The UA-string table is the most churny part of platform detection — new browser versions, new OS patterns, UA-reduction trends. Keeping it in a separate package means it can be updated independently without touching the seam package.
- `@flighthq/platform` stays a thin seam (16 exported functions, all O(1) delegation). The web backend is now ~20 lines instead of ~70.
- Users who want to do their own UA parsing (e.g., for a custom backend or a server-side context where `navigator` is unavailable) can import `@flighthq/platform-formats` directly without pulling in the seam/backend machinery.
- The package has no DOM dependency (`parseUserAgentRuntime` takes an explicit `win` parameter rather than reading `window` globally), making all functions testable in `node` environment.

### `parseUserAgentRuntime` takes explicit `win` parameter

Instead of reading `window` globally (which prevents testing in node), the function accepts `Record<string, unknown> | null | undefined`. The web backend in `@flighthq/platform` passes `typeof window !== 'undefined' ? window : null`. This makes the parser portable across all environments.

### `PlatformEndianness` type and `probeEndianness()` placement

`PlatformEndianness` is defined in `@flighthq/types/Platform.ts` (the header). The `probeEndianness()` function is in `@flighthq/platform-formats` rather than `@flighthq/platform` because it is a pure detection utility with no seam/backend dependency — exactly the kind of thing platform-formats contains. The web backend calls it.

### `endianness` on web is runtime-probed, not arch-inferred

A `DataView`/`Uint16Array` byte-order probe is used rather than inferring from `arch` (which could be `''`). This is more reliable and works in any context including wasm. The probe is cheap (one `ArrayBuffer` allocation at detection time, not in steady state). Falls back to `'unknown'` if `ArrayBuffer` is unavailable.

### `osBuild`, `distro`, `distroVersion` are web-stub-only in this pass

These three fields are `''` on the web backend. They exist to support native host backends (Electron/Tauri/Capacitor/native) that have access to OS-level details. The field definitions are in `PlatformInfo` now so native backends can fill them immediately without a breaking type change. No web heuristic exists for these (the browser UA string does not contain kernel builds or distro info on modern browsers).

### `engineVersion` uses product version, not engine version

For Edge (Chromium-based), `Edg/120.0.2210.133` is extracted rather than the underlying `Chrome/120.0.0.0` token. This surfaces the product identity the user knows (`Edge 120`) rather than the shared Blink version. Same pattern for Opera (`OPR/`). For Safari, `Version/16.0` is used rather than `AppleWebKit/605.1.15`. This matches the convention of major browser platforms.

### `comparePlatformVersions` treats `''` as lowest

An empty version string (unknown/unpopulated) compares as lower than any real version. This means `isPlatformVersionAtLeast` correctly returns `false` when the version is unknown — the safe conservative behavior.

### `pointerWidth` derived from `arch` rather than `navigator.userAgentData.bitness`

`userAgentData.bitness` is a high-entropy value requiring an async resolve (same as `architecture`). The synchronous path derives pointer width from the arch token: `'x64'/'arm64'` → 64, `'x86'/'arm'` → 32, `'wasm'/''` → -1. This is consistent with the arch token and avoids introducing an async seam in the sync detection path.

---

## Deferred items and why

### Silver tier — async identity resolve path

`getPlatformInfoAsync(out): Promise<PlatformInfo>` over a new optional `PlatformBackend.getInfoAsync?` method. Would upgrade `arch`, `version`, `pointerWidth`, and `engineVersion` from "UA-string best-effort" to "high-entropy accurate" (`navigator.userAgentData.getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'fullVersionList'])`). **Still deferred** because:

- Requires a new optional method on `PlatformBackend` — a shared-types seam decision.
- Should be coordinated with `@flighthq/device` (same `userAgentData` problem) to share one async-resolve shape across the suite.
- Bronze+Gold sync detection is genuinely useful on its own; async is an enhancement.

### Rust parity — `flighthq-platform` crate

1:1 Rust mirror as a value-typed leaf (`PlatformInfo`, `PlatformBackend` trait, `native`-feature default over `os_info`/`std::env::consts`, `compare_platform_versions`, `is_platform_version_at_least`). **Still deferred** — the instruction says defer until TS surface stabilizes post-Silver. The TS type surface is now stable enough for Rust to mirror, but the async-resolve Silver gap means the surface may gain `getInfoAsync` before it's truly "done."

### `PlatformGraphics` capability block

`hasWebgl2`, `hasWebgpu`, `prefersReducedMotion`. **Not added** — this is a cross-package design decision about whether renderer capability detection belongs in `@flighthq/platform` or in a renderer-capabilities seam alongside `@flighthq/render`. Default is not to add it here until that decision is made.

---

## Cross-package design decisions still needing user input

1. **Async-seam shape across the suite** — `getPlatformInfoAsync`/`refreshPlatformInfo` should use the same async-resolve shape as `@flighthq/device`. Coordinate before building either package's async path.

2. **`PlatformGraphics` home** — `hasWebgl2`/`hasWebgpu`/`prefersReducedMotion` may belong in a renderer-capabilities seam rather than `platform`. Do not add to `platform` unless no better home exists.

3. **Canonical `arch` token set** — `'x64'`, `'arm64'`, `'x86'`, `'arm'`, `'wasm'` are documented in `Platform.ts`. Confirm these match `@flighthq/device`'s `arch` field so the two packages agree.

---

## Score estimate

**93/100** — Gold tier.

All Gold items from the roadmap are now implemented:

- `@flighthq/platform-formats` neighbor package — UA parsing split ✓
- `endianness` and `pointerWidth` fields ✓
- `osBuild`, `distro`, `distroVersion` fields (stubs, native-fillable) ✓
- Canonical token normalization test (5 representative UAs) ✓
- `comparePlatformVersions` and `isPlatformVersionAtLeast` ✓
- `engineVersion` field with web detection ✓

Remaining gaps from a theoretical 100:

- Async high-entropy resolve path (Silver; cross-package seam decision) — `-3`
- Rust parity (Gold; deferred by instruction) — `-2`
- `PlatformGraphics` capability block (Gold; cross-package design decision) — `-2` (not added pending decision)

The package is now a canonical environment-identification reference: exhaustive field coverage, correct sentinel discipline, all canonical token values documented and normalization-tested, pure UA parser in its own independently-testable sibling package, `endianness`/`pointerWidth` for C/C++ port needs, `distro`/`osBuild` for Linux native backends.
