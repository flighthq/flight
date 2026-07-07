---
package: '@flighthq/useragent'
crate: null
draft: false
lastDirection: 2026-07-02
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

## Open directions

None. The package is at its scope ceiling.
