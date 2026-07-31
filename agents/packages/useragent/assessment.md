---
package: '@flighthq/useragent'
updated: 2026-07-30
basedOn: ./review.md
---

# useragent — Assessment

Based on the 2026-07-03 review (partial, 42/100). The review directly challenges the charter's 2026-07-02 "at scope ceiling" decision: measured against ua-parser-js/bowser the package covers roughly half its domain, and some current answers are wrong on current hardware. Per the charter's authority, no new feature surface is Recommended; everything additive is parked below as candidate Open directions for a charter revisit. What remains Recommended is strictly correctness fixes, internal deduplication, and documentation — none of it adds feature surface.

## Recommended

The 2026-07-03 sweep list (desktop-mode iPad, iOS third-party version extractors, deduplicate the OS
version regexes, document frozen-UA caveats) was **all four genuinely live** and is now done — the
first cell in this run where the listed items had not already been fixed. Re-derived below against
live source 2026-07-30.

1. **Decide what `parseUserAgentEngineVersion` means on webkit.** It returns two incomparable kinds of
   number depending on the browser: Safari has a `Version/` token, so Safari gets its *product*
   version (`17.0`), while Chrome/Firefox/Edge on iOS have none and fall through to the AppleWebKit
   build (`605.1.15`). Both are defensible readings of "engine version" — but not in the same
   function, and a caller comparing the two is comparing a browser release to a WebKit build. Either
   webkit should always report the AppleWebKit build (consistent with the name, but changes Safari's
   long-standing answer), or the function should be honest that it reports a product version where one
   is available. **A semantics decision, not a sweep** — surfaced rather than taken.
2. ~~**`parseUserAgentEngineVersion` returns `''` for a legacy EdgeHTML UA.**~~ **Fixed 2026-07-31** — and the report understated it. `Edge/18` matched the blink branch, so the ENGINE was misreported as blink, and on a realistic legacy-Edge UA (which carries a `Chrome/64…` token) the version came back as **Chrome's version**, not empty — a wrong answer rather than a missing one. Empty only occurred on the bare form. `parseUserAgentEngine` now recognizes `Edge/<digit>` before the blink branch and reports `'unknown'`: EdgeHTML has no `PlatformEngine` member, adding one is a public type change every exhaustive consumer would handle, and `'unknown'` is the documented answer for an engine this SDK does not model. Saying blink would have a caller apply Chromium workarounds to a browser that never ran Chromium. Modern `Edg/` and `EdgiOS/` are unaffected, pinned by tests.

  _If a first-class EdgeHTML engine value is ever wanted, that is the `PlatformEngine` type change — routed, not taken._

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

- [2026-07-03] Sweep items 1–4 (desktop-mode iPad, iOS third-party browser engine/version,
  deduplicate the OS version regexes, document the frozen-UA caveats) — **all four done 2026-07-30**,
  with regression tests verified against the unfixed code.
