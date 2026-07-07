---
package: '@flighthq/platform'
crate: flighthq-platform
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# platform — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

`@flighthq/platform` is the root identification seam of the platform-integration suite — it answers "what am I running on?" Its surface is a single value type, `PlatformInfo` (name, kind, version, arch, locale, isTouch, runtime, engine, engineVersion, endianness, pointerWidth, osBuild, distro, distroVersion), filled by a swappable `PlatformBackend`. A lazy web backend parses the value out of `navigator`/UA; native hosts replace it via `setPlatformBackend`. The package is a thin, side-effect-free command capability: 16 O(1) delegating functions over the backend, with `out`-param fills and sentinel returns. It reports static identity only — live concerns belong to siblings (`power`, `network`, `lifecycle`). Per-device hardware identity (model, manufacturer, memory) is `@flighthq/device`'s job.

## Decisions

- **[2026-07-02] Scope ceiling confirmed.** 16 exports, pure identification seam. The surface is complete for its domain. No expansion planned.

## Open directions

- Whether `@flighthq/platform-formats` collapses into the shared `useragent` primitive (structural fork E). Cross-package decision — surfaced, not actioned here.
- Async high-entropy resolve seam (`navigator.userAgentData.getHighEntropyValues`) — suite-wide async-shape decision pending.
- Whether `PlatformGraphics` (`hasWebgl2`/`hasWebgpu`) belongs here or in a render-capabilities seam.
