---
package: '@flighthq/device'
updated: 2026-07-13
basedOn: ./review.md
---

# device — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Evaluate `detectDesktopUa` refactor to use `@flighthq/useragent`** — still open (verified 2026-07-13): the private helper (`device.ts:289-291`) duplicates the desktop branch of `parseUserAgentFormFactor`, and the copies have diverged — device's regex includes `cros`, useragent's does not. Not forced DRY (the Rust port may distinguish the APIs); the builder should evaluate, reconcile the `cros` divergence either way, and report.
2. **Remove the `// ---- ... ----` structural divider comment** at `device.ts:285-287` — banned by the source-style rules; the private-helpers position after module state already carries the meaning.
3. **`matchMedia`-backed web fills for `colorGamut` / `isHdr`** — the web backend hardcodes sentinels for fields the platform can actually answer via `matchMedia('(color-gamut: p3)')` / `('(dynamic-range: high)')` (guarded, sentinel when `matchMedia` is absent). Within-package, no design fork — it deepens web-backend fidelity for existing fields.

## Approved

1. **Evaluate `detectDesktopUa` refactor** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

- **Declare `refresh?(): void` on `DeviceBackend`** and drop the `as unknown as` cast in `refreshDeviceInfo` — small and mechanical, but it edits the `@flighthq/types` header (cross-package by the letter of the sweep boundary).
- **Predicate conveniences** (`isDeviceTablet(info)` etc.) — charter Open direction 5; a policy call, not a sweep.
- **`device` vs `screen` boundary ruling** for `DeviceDisplayMetrics` vs live multi-display — charter Open direction 2.
- **`getId` durability seam** — inject `@flighthq/storage` vs direct `localStorage` — charter Open direction 3.
- **`installSource` / install provenance home** (likely `@flighthq/app`) — charter Open direction 4.
- **Native backends** (`host-electron`/`host-capacitor` `DeviceBackend`) and **Rust crate `flighthq-device`** — cross-package / cross-boundary.
