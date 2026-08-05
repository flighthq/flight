---
package: '@flighthq/useragent'
role: package
crate: null
draft: false
lastDirection: 2026-07-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# useragent — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Pure user-agent string parsing library -- 12 exports, 95 tests, no backend seam. Parses `navigator.userAgent` (and equivalent strings) into structured data: browser name/version, OS name/version, engine, device type. This is a utility package, not a platform-integration capability: it has no `*Backend`, no signals, no event entity. It is TS-only (`crate: null`) because it is a parsing library with no native equivalent needed.

## Decisions

- **[2026-07-02] At scope ceiling.** 12 exports and 95 tests is the complete scope for a user-agent parsing library. No additional feature surface is planned.
- **[2026-07-02] No Rust crate.** Pure TS parsing library; a Rust crate would serve no purpose (native code does not parse browser user-agent strings).

- **[2026-07-30] The platform decides the engine before any product token does.** `parseUserAgentEngine` matched product tokens in order, so `EdgiOS` — Edge on iOS — matched the blink-family `edg` and was reported as blink, then returned an empty version because no `Edg/` token follows. Every browser on iOS and iPadOS is required to run on the system WebKit, so testing `iphone|ipad|ipod` first is both correct and the rule that stops this being whack-a-mole: any future `<Product>iOS` token would have failed the same way. User-directed.

- **[2026-07-30] One OS-version extractor, two vocabularies.** `parseUserAgentVersion` (the `PlatformName` family) and `parseUserAgentOsVersion` (the device family) each carried a copy of the same four patterns, and the copies had drifted — the first required exactly one space where the second accepts any whitespace, so it returned `''` for UAs the second parsed correctly (measured on `Android  14`, `Windows NT  10.0`, `Mac OS X  10_15_7`). `parseUserAgentVersion` now delegates, and gains a second property worth stating: it returns `''` when the requested name is not the platform the UA describes, because asking a Windows UA for its iOS version has no answer and a wrong one is worse than none. This settles the drift without touching the larger merge-the-two-families question, which stays parked. User-directed.

- **[2026-07-30] Touch is the only signal that separates a desktop-mode iPad from a Mac.** iPadOS in desktop mode — the default for iPad Safari since iPadOS 13 — sends a `Macintosh` UA with no iPad token, so `parseUserAgentFormFactor` answered "desktop" for every one of them. Apple ships no touchscreen Mac (the Touch Bar reports zero touch points), so `maxTouchPoints > 1` on a Macintosh UA means iPad. The hint was already threaded into the signature for exactly this and was simply never consulted. It must be tested *before* the desktop branch, which would otherwise claim the UA on the `macintosh` token alone. User-directed.

- **[2026-07-30] Frozen UA values are documented as ceilings, not readings.** Windows 11 reports `Windows NT 10.0` and macOS has been frozen at `10_15_7` since Big Sur; a desktop-mode iPad reports the macOS version rather than its own. No UA-string parser can do better without UA-CH hints, so both version functions now say so in their doc comments. Callers should read a version from this package as "at least this", never as exact. User-directed.

## Open directions

None. The package is at its scope ceiling.
