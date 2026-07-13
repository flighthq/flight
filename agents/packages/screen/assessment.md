---
package: '@flighthq/screen'
updated: 2026-07-13
basedOn: ./review.md
---

# screen — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

No open sweep-safe items — both previously-Approved items are verified implemented in the live tree (`getScreenNearestRect` distinct contains-else-nearest-center semantics at `screen.ts:604`; test divider comments removed from `screen.test.ts`).

## Approved

1. **Implement `getScreenNearestRect` with actual nearest-screen logic** [2026-07-02 · blanket "platform integration suite sweep"]
2. **Remove structural divider comments in test file** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

- Late-subscribe + upgrade ordering (subscribers before `requestScreenDetails` miss `screenschange`) — behavior-contract decision, charter Open direction; not sweep-safe.
- Optional `ScreenBackend.refresh?()` seam so `refreshScreens` delegates instead of being a no-op hook — touches the `@flighthq/types` backend interface; small, but a seam-shape call for direction.
- Web derivation of `monochrome`/`dpi`/`depthPerComponent` vs leave-sentinel — charter Open direction.
- Stable-id contract for `ScreenInfo.id` across hot-plug — charter Open direction.
- Explicit scope ruling on display-mode *setting* (`setScreenMode`) — absent today; decide absent-on-purpose vs chartered-native.
- Rust `flighthq-screen` conformance verification — cross-tree.
