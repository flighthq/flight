---
package: '@flighthq/useragent'
status: partial
score: 42
updated: 2026-07-03
ingested:
  - source
  - tests
---

# useragent — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/useragent.md)._

**Domain:** User-agent / client-environment identification — parsing UA strings (and UA-CH hints) into OS, browser/engine, version, architecture, device form-factor, and host-runtime identity tokens.

**Verdict:** partial — completeness 42/100

The package is a pure value leaf: twelve side-effect-free functions with no DOM access, consumed by the `device` and `platform` web backends and independently importable. What exists is careful — ordering hazards are documented and tested (arm64 before arm; Edg/OPR before Chrome; iPad before iPhone), UA-CH platform hints are consulted, versions are returned as raw strings never parsed for semantics, and every function returns a sentinel (`''`, `'unknown'`, `-1`, `DeviceFormFactorUnknown`) instead of throwing. Test coverage is broad (60+ cases). Against ua-parser-js or bowser, though, the surface is roughly half of the domain: there is no browser *product* identification (only engine), no device vendor/model, no bot detection, no frozen-UA mitigation (Windows 11, macOS >10.15.7, desktop-mode iPad), and the package visibly contains two overlapping parser families from its two source packages that were never merged.

## Present capabilities

- **Platform family** (`userAgent.ts`, feeding `@flighthq/platform`): `parseUserAgentName` (→ `PlatformName` tokens `android|ios|windows|macos|linux|web`), `parseUserAgentVersion(ua, name)` (per-OS version extraction with underscore→dot normalization), `parseUserAgentKind` (mobile/web from name), `parseUserAgentEngine` (gecko/blink/webkit with correct precedence), `parseUserAgentEngineVersion(ua, engine)` (Edg/OPR preferred over Chrome; Safari `Version/` with AppleWebKit fallback), `parseUserAgentArch(ua, uadPlatform?)` (x64/arm64/x86/arm/riscv64/mips64/mips, UA-CH hint first), `parseUserAgentPointerWidth(arch)` (64/32/-1), `parseUserAgentRuntime(win)` (electron/tauri/capacitor/web/unknown via injected window-like object — testable by design), `detectEndianness()` (DataView probe).
- **Device family** (`userAgentParse.ts`, feeding `@flighthq/device`): `parseUserAgentFormFactor(ua, maxTouchPoints)` (car/TV/watch/tablet/phone/desktop/unknown with a sensible precedence ladder and a touch-points tiebreak), `parseUserAgentOsName` (display-cased names incl. iPadOS, ChromeOS, the BSDs), `parseUserAgentOsVersion` (per-OS regexes incl. CrOS).
- All returns are canonical tokens or raw version strings; types (`PlatformEngine`, `PlatformName`, `DeviceFormFactor` constants, …) live in `@flighthq/types` — header-layer correct.

## Gaps vs an authoritative useragent library

Compare ua-parser-js (browser/engine/OS/device/CPU, each name+version+vendor+model) and bowser (plus satisfies/version-comparison):

- **Browser product identification** — the biggest hole. There is no `parseUserAgentBrowserName`: Chrome, Edge, Opera, Samsung Internet, Brave, Firefox, and Safari all collapse into three engine tokens. `parseUserAgentEngineVersion` already sniffs `Edg/`/`OPR/` to pick the *product* version, so it returns Edge's version while the package cannot say "Edge" — an asymmetry that proves the product axis is needed.
- **Engine version vs product version conflation** — the same function returns Firefox's product version for gecko and AppleWebKit's build for Safari-without-`Version/`; an authoritative library separates browser.version from engine.version.
- **Device vendor/model** — no extraction of `SM-G998B`, `Pixel 8`, `iPhone` model hints; ua-parser-js's device.vendor/device.model axis is absent entirely.
- **Frozen-UA realities** — no mitigation or documentation for the three big lies: Windows 11 reports `Windows NT 10.0` (needs UA-CH `platformVersion >= 13`), macOS is frozen at `10_15_7`, and desktop-mode iPadOS reports `Macintosh` (detectable via `maxTouchPoints > 1` + mac UA — the form-factor parser has the hint available but does not use it for tablet detection). Callers get silently wrong answers on ~current hardware.
- **UA-CH as a first-class input** — only `parseUserAgentArch` takes a `uadPlatform` hint. No parsing of `Sec-CH-UA` brand lists, `platformVersion`, `model`, or `bitness`; a modern identity library treats client hints as the primary source with UA-string fallback.
- **Bot/crawler detection** — no `isUserAgentBot`; Googlebot/HeadlessChrome/curl all parse as ordinary browsers. Standard in every UA library and cheap to add.
- **Version comparison** — `userAgent.ts` mentions `comparePlatformVersions` for numeric comparison, but no such helper is exported here or discoverable from this package; raw dotted strings without a comparator push every consumer into ad-hoc `parseInt`.
- **Missing platforms/engines** — no `windows phone` in `parseUserAgentName` (`/win/i` matches it as `windows`), no Firefox-on-iOS (`FxiOS`) / Chrome-on-iOS (`CriOS`) awareness (both are webkit-engine but their tokens defeat the version extractors), no Android WebView (`; wv)`) detection, no watchOS/tvOS/visionOS as OS names despite the form-factor parser knowing watches and TVs.
- **The two-family overlap** — `parseUserAgentName`/`parseUserAgentVersion` vs `parseUserAgentOsName`/`parseUserAgentOsVersion` answer the same question with different vocabularies (lowercase `PlatformName` tokens vs display-cased strings) and different coverage (only the latter knows iPadOS/ChromeOS/BSDs; only the former takes the name as a narrowing parameter). This is unmerged extraction residue, not a design.

## Naming / API-shape notes

- The `parseUserAgent*` prefix is a good, greppable family name — but three members break the contract the name states. `parseUserAgentRuntime(win)` takes a window object, not a UA string; `parseUserAgentPointerWidth(arch)` takes an arch token; `parseUserAgentKind(name)` takes a `PlatformName`. Per the self-identifying-name rule these want to be `detectPlatformRuntime` (pairing with `detectEndianness`), `getArchPointerWidth` (or fold into types-level data), and `getPlatformKindForName` — or the inputs should become UA strings.
- `detectEndianness` is not user-agent parsing at all (it probes the host CPU); it sits here only because `platform`'s web backend needs it. Either the package's true domain is "web environment identity probes" (then say so) or endianness belongs beside the other capability probes.
- Duplicated version parsing: the Windows/macOS/iOS/Android regexes appear in both `parseUserAgentVersion` and `parseUserAgentOsVersion` with slight drift (`/android\s+/` vs `/android /`). One implementation should serve both vocabularies.
- File naming: `userAgent.ts` + `userAgentParse.ts` is extraction residue — the split is by consumer (platform vs device), not by concept; merging or renaming by concept (e.g. `userAgentPlatform.ts` / `userAgentDevice.ts`) would make the boundary legible.
- Sentinel discipline is exemplary (`''`, `'unknown'`, `-1`, `DeviceFormFactorUnknown`, never throws) and everything is a pure free function — fully aligned with the SDK constraints.

## Recommendation

Merge before growing: unify the two OS name/version families into one implementation with one canonical vocabulary (keep `PlatformName` tokens as the machine axis; derive display names from them), and rename the three functions whose inputs contradict the `parseUserAgent*` contract. Then close the accuracy gaps that make today's answers wrong on current hardware — desktop-mode iPad (mac UA + `maxTouchPoints > 1` → tablet/iPadOS), Windows 11 via UA-CH `platformVersion`, and a documented macOS-frozen-at-10.15.7 caveat — followed by the two highest-value additions: `parseUserAgentBrowserName` (product axis, reusing the Edg/OPR/FxiOS/CriOS/samsung tokens already half-recognized) and `isUserAgentBot`. UA-CH brand-list parsing and a version comparator round it out to solid; device vendor/model extraction is the long tail that separates solid from authoritative and can wait for a real consumer.
