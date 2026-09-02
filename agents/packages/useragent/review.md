---
package: '@flighthq/useragent'
status: solid
score: 75
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
---

# useragent — Review

**Verdict:** solid -- 75/100. A well-tested, pure-function parsing library that correctly implements its declared scope ceiling. The four correctness bugs identified in the prior review (desktop-mode iPad, iOS engine detection, version-regex drift, frozen-UA documentation) are all fixed with regression tests. What remains are internal design debt (two overlapping parser families, three naming violations, one semantic ambiguity) that do not affect correctness but prevent the package from reaching authoritative.

## Present capabilities

Two source files, two test files, 12 exports across the contract lane (11 on the public lane; `parseUserAgentRuntime` is contract-only), 106 tests all passing.

**Platform family** (`userAgent.ts` -- 9 exports):

- `parseUserAgentName(ua)` -- returns `PlatformName` tokens (`android|ios|windows|macos|linux|web`). Regex priority is correct: Android before iOS, iOS before Mac (since iOS UAs contain `Mac`).
- `parseUserAgentVersion(ua, name)` -- per-OS version extraction. Now delegates to `parseUserAgentOsVersion` (the drift that caused whitespace-sensitive failures is fixed). Returns `''` when the requested name does not match the UA's actual platform, preventing cross-platform misreads. Documents frozen UA ceilings in comments.
- `parseUserAgentKind(name)` -- derives `PlatformKind` (`mobile|web`) from a `PlatformName` token. Takes a `PlatformName`, not a UA string.
- `parseUserAgentEngine(ua)` -- returns `PlatformEngine` (`gecko|blink|webkit|unknown`). Tests iOS/iPadOS first (all browsers there run WebKit regardless of product token), which fixed the EdgiOS-reported-as-blink bug. Recognizes legacy EdgeHTML (`Edge/<digit>`) before the blink branch and reports `unknown` rather than a false `blink`.
- `parseUserAgentEngineVersion(ua, engine)` -- extracts version per engine. Prefers `Edg/`/`OPR/` over `Chrome/` for blink; uses `Version/` then `AppleWebKit/` fallback for webkit.
- `parseUserAgentArch(ua, uadPlatform?)` -- canonical arch tokens (`x64|arm64|x86|arm|riscv64|mips64|mips`). Prefers UA-CH platform hint when available. Tests arm64/aarch64 before arm to avoid false partial match.
- `parseUserAgentPointerWidth(arch)` -- maps arch token to pointer width (64/32/-1). Takes an arch string, not a UA string.
- `parseUserAgentRuntime(win)` -- probes a window-like object for Electron/Tauri/Capacitor/web. Takes a `Record<string, unknown>`, not a UA string. Contract-only export.
- `detectEndianness()` -- DataView probe for CPU byte order. Not UA parsing; probes the host environment directly.

**Device family** (`userAgentParse.ts` -- 3 exports):

- `parseUserAgentFormFactor(ua, maxTouchPoints)` -- returns `DeviceFormFactor` constants (Car/TV/Watch/Tablet/Phone/Desktop/Unknown). Priority ladder is well-ordered: automotive first, smart TV, wearable, then tablet/phone/desktop. Now correctly identifies desktop-mode iPads via `maxTouchPoints > 1` on Macintosh UAs. Touch Bar (0 points) and unavailable (-1) do not trigger false positives.
- `parseUserAgentOsName(ua)` -- display-cased OS name strings (Android, iOS, iPadOS, Windows, macOS, ChromeOS, FreeBSD, OpenBSD, NetBSD, Linux). Richer vocabulary than `parseUserAgentName`'s `PlatformName` tokens: distinguishes iPadOS from iOS, recognizes ChromeOS and the BSDs.
- `parseUserAgentOsVersion(ua)` -- the single OS-version extractor. Handles Android, iOS/iPadOS (underscore-to-dot), Windows NT, macOS (underscore-to-dot), ChromeOS. Frozen-UA ceilings documented in source comments.

**Structural qualities:**

- All types (`PlatformEngine`, `PlatformName`, `PlatformKind`, `PlatformRuntime`, `PlatformEndianness`, `DeviceFormFactor`) live in `@flighthq/types`. The package exports functions only.
- `"sideEffects": false`, no top-level side effects, no DOM access, no globals read.
- Sentinel returns throughout (`''`, `'unknown'`, `-1`, `DeviceFormFactorUnknown`). No throws.
- Pure free functions. Testable without browser globals (window-like object is a parameter).
- Two-lane exports (`.` and `./contract`) correctly configured in `package.json`.
- Single dependency: `@flighthq/types`.

## Gaps

These are measured against domain maturity for a user-agent parsing library, not against the charter (which declares scope ceiling). They are observed, not prescribed.

1. **Browser product identification.** No `parseUserAgentBrowserName`. Chrome, Edge, Opera, Samsung Internet, Brave, Firefox, and Safari all collapse into three engine tokens. `parseUserAgentEngineVersion` already sniffs `Edg/`/`OPR/` to pick the product version, proving the product token recognition exists but is not surfaced as a name.

2. **UA-CH as first-class input.** Only `parseUserAgentArch` accepts a UA-CH hint (`uadPlatform`). No parsing of `Sec-CH-UA` brand lists, `platformVersion` (the only correct Windows 11 signal), `model`, or `bitness`. Modern user-agent identification increasingly depends on client hints as the primary source.

3. **Bot/crawler detection.** No `isUserAgentBot`. Googlebot, HeadlessChrome, curl, and similar all parse as ordinary browsers. Standard in every UA library.

4. **Version comparison helper.** `parseUserAgentVersion` returns raw dotted strings. The source comments reference `comparePlatformVersions` for numeric comparison, but no such function exists in this package. Every consumer must do ad-hoc version comparison.

5. **Token vocabulary gaps.** Windows Phone parses as `windows` via `parseUserAgentName` (the `/win/i` regex catches it). No watchOS/tvOS/visionOS OS names despite form-factor parser recognizing watches and TVs. No Android WebView (`; wv)`) detection.

6. **Device vendor/model extraction.** No extraction of device model hints (`SM-G998B`, `Pixel 8`, iPhone model). This is the long-tail feature that separates a complete library from a focused one.

## Charter contradictions

None. The implementation faithfully matches the charter's declared scope:

- The charter says "12 exports, 95 tests" -- the package now has 12 contract exports (11 public) and 106 tests (the increase from 95 is due to the regression tests added with the 2026-07-30 fixes). The export count matches; the test increase is a positive development.
- The "at scope ceiling" decision is reflected in no new feature surface being added.
- The "no Rust crate" decision is correctly implemented (`crate: null` in front matter, `tsconfig.json` references only `types`).
- All four decisions from 2026-07-30 are implemented in the source with matching regression tests.

## Contract and docs fit

**Package conformance to SDK contract:**

- Types in `@flighthq/types` -- correct.
- Full unabbreviated names -- correct. Every function includes `UserAgent` in its name.
- Sentinel returns, no throws -- correct throughout.
- `sideEffects: false` -- correct.
- Two-lane export (`./` and `./contract`) -- correct, with `parseUserAgentRuntime` contract-only.
- Free functions, no classes -- correct.
- `Readonly<T>` usage -- not applicable (all parameters are primitives or a single `Record` type).

**Internal design debt (not contract violations, but consistency concerns):**

- Three functions break the `parseUserAgent*` prefix contract by not taking a UA string: `parseUserAgentRuntime(win)` takes a window-like object, `parseUserAgentPointerWidth(arch)` takes an arch token, `parseUserAgentKind(name)` takes a `PlatformName`. The `parseUserAgent*` prefix implies a UA string input. The prior assessment suggests renames (`detectPlatformRuntime`, `getArchPointerWidth`, `getPlatformKindForName`) but this is a design decision, not a sweep.
- `detectEndianness` probes the CPU, not a UA string. It sits here because `host-web`'s platform backend needs it. Either the package domain is "web environment identity probes" (broader than its name) or endianness belongs elsewhere.
- The file split (`userAgent.ts` / `userAgentParse.ts`) is by consumer (platform vs device), not by concept. The names do not convey the distinction.
- `parseUserAgentEngineVersion` has a semantic ambiguity on webkit: for Safari it returns the product version (`Version/17.0`), for Chrome/Firefox/Edge on iOS it returns the AppleWebKit build number (`605.1.15`). Both are defensible readings, but not in the same function -- a caller comparing the two is comparing incomparable values.

**Two-family overlap remains on the name axis.** `parseUserAgentName` returns lowercase `PlatformName` tokens (`ios` for both iPhone and iPad, no ChromeOS/BSDs); `parseUserAgentOsName` returns display-cased strings (`iOS`, `iPadOS`, `ChromeOS`, `FreeBSD`, `OpenBSD`, `NetBSD`). The version axis was unified (both now delegate to one extractor), but the name axis still carries two vocabularies with different coverage. This is extraction residue from the two source packages, not a designed distinction.

**Candidate contract/docs revisions:**

- The Package Map in `AGENTS.md` lists `useragent` under "Application" alongside `log`, `debug`, `xml`, `media`, `mediasession`. The platform-integration shared principles classify it as "Utility: useragent (pure parsing, no backend)" under the platform-integration suite. These are consistent -- no revision needed.
- The charter says "12 exports" but the public lane has 11 (`parseUserAgentRuntime` is contract-only). The charter might mean the contract lane count, which is 12. Minor discrepancy, not load-bearing.

## Candidate open directions

The charter declares "None. The package is at its scope ceiling." The following questions surfaced during review but are not answered by the charter. They would need explicit direction to become work:

1. **Should the two name families be merged?** `parseUserAgentName` and `parseUserAgentOsName` answer the same question with different vocabularies and coverage. Which is canonical? The version axis was already unified; the name axis is the remaining residue.
2. **Should the three non-UA-input functions be renamed?** `parseUserAgentRuntime`, `parseUserAgentPointerWidth`, and `parseUserAgentKind` do not parse UA strings. Should they be renamed to match their actual inputs, or is the `parseUserAgent*` family name understood as "environment identity" rather than literally "UA string parsing"?
3. **What does `parseUserAgentEngineVersion` mean on webkit?** It returns a product version for Safari and a build number for other iOS browsers. Should it always return the AppleWebKit build (consistent with "engine version") or is the current behavior intentional?
4. **Does `detectEndianness` belong here?** It is a CPU probe, not UA parsing. If the package domain is strictly "UA string parsing," endianness belongs in another package (perhaps `platform` itself).
5. **Is the scope ceiling permanent?** The four highest-value missing features (browser product name, UA-CH input, bot detection, version comparison) are standard in every UA library. The charter explicitly rules them out. If the ceiling is reconsidered, the assessment's Backlog has them ranked.
