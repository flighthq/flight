---
package: '@flighthq/useragent'
updated: 2026-07-03
basedOn: ./review.md
---

# useragent — Assessment

Based on the 2026-07-03 review (partial, 42/100). The review directly challenges the charter's 2026-07-02 "at scope ceiling" decision: measured against ua-parser-js/bowser the package covers roughly half its domain, and some current answers are wrong on current hardware. Per the charter's authority, no new feature surface is Recommended; everything additive is parked below as candidate Open directions for a charter revisit. What remains Recommended is strictly correctness fixes, internal deduplication, and documentation — none of it adds feature surface.

## Recommended

Sweep-safe: within `@flighthq/useragent`, no public-surface growth, no open design decision.

1. **Desktop-mode iPad correctness fix.** iPadOS in desktop mode reports a `Macintosh` UA; `parseUserAgentFormFactor(ua, maxTouchPoints)` already receives the tiebreak hint but does not apply it — mac UA + `maxTouchPoints > 1` should classify as tablet. A silently wrong answer on current hardware, fixed with the existing signature.

2. **Fix the iOS third-party-browser version extractors.** Firefox-on-iOS (`FxiOS`) and Chrome-on-iOS (`CriOS`) are webkit-engine but their tokens defeat the existing version extraction, so `parseUserAgentEngineVersion` returns wrong values for them. Correctness fix inside existing functions.

3. **Deduplicate the OS version regexes.** The Windows/macOS/iOS/Android patterns appear in both `parseUserAgentVersion` and `parseUserAgentOsVersion` with slight drift (`/android\s+/` vs `/android /`). One internal implementation should serve both public vocabularies — no API change; removes the drift hazard. (The larger merge of the two families is a design fork, parked below.)

4. **Document the frozen-UA caveats.** Windows 11 reports `Windows NT 10.0` and macOS is frozen at `10_15_7`; without UA-CH input these functions cannot do better. Say so in the doc comments so callers are not silently misled. (Actually correcting them requires UA-CH inputs — parked below.)

## Backlog

All parked items conflict with the charter's scope-ceiling decision or need a design ruling; none may be swept.

- **Merge the two parser families.** `parseUserAgentName`/`parseUserAgentVersion` (platform family) vs `parseUserAgentOsName`/`parseUserAgentOsVersion` (device family) answer the same question with different vocabularies and coverage — unmerged extraction residue. Which vocabulary is canonical (machine `PlatformName` tokens with derived display names, per the review's lean) is a public-API reshape. _Parked — design decision; candidate Open direction for the charter._
- **Rename the three contract-breaking functions.** `parseUserAgentRuntime(win)`, `parseUserAgentPointerWidth(arch)`, and `parseUserAgentKind(name)` do not take UA strings, breaking the `parseUserAgent*` contract; the review offers renames (`detectPlatformRuntime`, `getArchPointerWidth`, `getPlatformKindForName`) or UA-string inputs — a fork, not a sweep. `detectEndianness`'s domain (it probes the CPU, not a UA) is part of the same question. _Parked — design decision; candidate Open direction for the charter._
- **Browser product axis.** `parseUserAgentBrowserName` — Chrome/Edge/Opera/Samsung/Brave/Firefox/Safari currently collapse into three engine tokens, while `parseUserAgentEngineVersion` already half-recognizes the product tokens. The review's biggest hole. _Parked — new feature surface; contradicts the scope-ceiling decision; candidate Open direction for the charter._
- **UA-CH as a first-class input.** Brand lists, `platformVersion` (the only correct Windows 11 signal), `model`, `bitness` — today only `parseUserAgentArch` takes a hint. Also carries the cross-package wiring so `platform`/`device` backends supply the hints. _Parked — design decision / cross-package; candidate Open direction for the charter._
- **Bot/crawler detection (`isUserAgentBot`).** Standard in every UA library, cheap — but new surface. _Parked — contradicts the scope-ceiling decision; candidate Open direction for the charter._
- **Version comparator.** Raw dotted version strings push every consumer into ad-hoc `parseInt`; the referenced `comparePlatformVersions` does not exist here. _Parked — new surface, and its home (here vs `platform`) is undecided; candidate Open direction for the charter._
- **Token-vocabulary expansion.** Windows Phone (currently misparsed as `windows`), watchOS/tvOS/visionOS OS names, Android WebView detection, device vendor/model extraction. _Parked — expands the `PlatformName`/token vocabularies in `@flighthq/types` (cross-package) and adds surface; candidate Open direction for the charter._

## Approved

_None._
