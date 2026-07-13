---
package: '@flighthq/platform'
updated: 2026-07-13
basedOn: ./review.md
---

# platform — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

No sweep-safe items. Scope ceiling confirmed (16 exports); the 2026-06-25 review's blockers (types header, `platform-formats` fork E, non-compiling tests) are all resolved in the live tree.

## Approved

None.

## Backlog

- Async high-entropy resolve seam (`navigator.userAgentData.getHighEntropyValues`) — parked on the suite-wide async-shape decision; the largest remaining web-fidelity gap (frozen UA strings make `version`/`arch` best-effort on Chromium).
- `PlatformGraphics` capability block — parked on the here-vs-render-capabilities homing decision (charter Open direction).
- Rust `flighthq-platform` conformance-map entry for the 14-field surface — cross-tree, not actionable in this package.
- Charter maintenance: retire Open direction 1 (`platform-formats` → `useragent` collapse) as a dated Decision — it is settled in source. User-gated charter edit, not a builder item.
