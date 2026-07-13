---
package: '@flighthq/platform'
status: solid
score: 82
updated: 2026-07-13
ingested:
  - source
  - tests
  - charter.md
  - status.md
  - prior review (2026-06-25)
---

# platform — Review (live-tree survey, 2026-07-13)

> Supersedes the 2026-06-25 merge-gate review of `integration-b2824e3d8`. Every blocker that review named is resolved in the current tree, so its `partial — 45` verdict no longer describes this package. This is a survey of `packages/platform/` as it stands.

## Verdict

**solid — 82/100.** The seam is complete, compiles, and matches its charter's confirmed scope ceiling exactly: 16 exports (`comparePlatformVersions`, `createPlatformInfo`, `createWebPlatformBackend`, `getPlatformBackend`, `getPlatformEngine`, `getPlatformInfo`, `getPlatformKind`, `getPlatformName`, `getPlatformRuntime`, `isPlatformDesktop`, `isPlatformMobile`, `isPlatformNative`, `isPlatformTouch`, `isPlatformVersionAtLeast`, `isPlatformWeb`, `setPlatformBackend` — `packages/platform/src/platform.ts`). The prior review's three merge blockers are all gone:

1. **Types-first violation — resolved.** `packages/types/src/Platform.ts` now carries the full 14-field `PlatformInfo` (name, kind, version, arch, locale, isTouch, runtime, engine, engineVersion, endianness, pointerWidth, osBuild, distro, distroVersion) plus the `PlatformName`/`PlatformKind`/`PlatformRuntime`/`PlatformEngine`/`PlatformEndianness` unions and `PlatformBackend`. Every field has a sentinel/unit doc comment. The header layer leads the implementation, as the contract requires.
2. **Rejected `platform-formats` neighbor — resolved per fork E.** The UA parsing now lives in `@flighthq/useragent` (`platform.ts:9-19` imports `parseUserAgent*`/`detectEndianness` from `@flighthq/useragent`; `package.json` depends on it). `packages/platform-formats/` no longer exists. The charter's open direction on this fork is settled in source and can be retired.
3. **Non-compiling tests — resolved.** `platform.test.ts` (581 lines) compiles against the 14-field type and mirrors the exports.

## Spot-verified capabilities

- The web backend (`getWebPlatformInfo`, module-private) fills all 14 fields: UA-derived name/kind/version/arch/engine/engineVersion via `@flighthq/useragent`, `navigator.language` locale, `maxTouchPoints` touch, `parseUserAgentRuntime(window)` host-shell detection, probed endianness, arch-inferred pointerWidth, and honest `''` for the native-only `osBuild`/`distro`/`distroVersion` (commented as such at `platform.ts:164`).
- Sentinel discipline is uniform (`'unknown'`, `''`, `-1`, `false`); no throws anywhere.
- `comparePlatformVersions` is a self-contained, alias-irrelevant pure function with documented `''`-sorts-lowest semantics; `isPlatformVersionAtLeast` returns `false` on unknown version rather than guessing.
- Module state is the lazy `_backend` + a documented single-threaded `_scratch` (with a C/C++-portability note on the Rust mirror using a per-call local) at file bottom, per source style.
- `sideEffects: false`, single root barrel, nothing registers at import.

## Gaps (why not higher)

- **No async high-entropy resolve path.** `version`/`arch`/`engineVersion`/`pointerWidth` remain UA-string best-effort; the accurate `navigator.userAgentData.getHighEntropyValues(...)` source is Promise-based and there is no `getPlatformInfoAsync`-shaped seam. This is the single largest fidelity gap on modern Chromium, where the UA string is frozen/reduced (macOS is pinned at `10_15_7`, so `isPlatformVersionAtLeast` on macOS is systematically stale). Correctly parked as a suite-wide async-shape decision (charter Open direction), but it caps web fidelity.
- **Native-only fields are seam-only.** `osBuild`/`distro`/`distroVersion` (and accurate thermal-free identity generally) await a native backend that does not exist in this repo beyond `host-electron`'s coverage of other capabilities. The seam shape (one `getInfo(out)` method) is trivially fillable by Electron/Tauri/Capacitor hosts — full native fidelity is reachable, just unproven.
- **Rust mirror drift.** Cross-tree fact carried from the prior review: the `flighthq-platform` crate surface is unverified against the 14-field/16-function TS shape; conformance-map entry not written. Not a TS-package defect; noted for the register.

## Charter fit

Clean. The charter's confirmed scope ceiling (16 exports, pure identification) is exactly what source ships. One charter maintenance note: Open direction 1 ("whether platform-formats collapses into useragent") is now **decided in source** — the collapse happened — and should move to a dated Decision at the next direction session. `PlatformGraphics` and the async seam remain genuinely open.

## Candidate open directions

- Async high-entropy resolve (`getHighEntropyValues`) — the one item that would move web fidelity meaningfully; suite-wide shape decision.
- `PlatformGraphics` (`hasWebgl2`/`hasWebgpu`) homing — here vs a render-capabilities seam (carried from charter).
