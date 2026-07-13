---
package: '@flighthq/menu'
updated: 2026-07-13
basedOn: ./review.md
---

# menu — Assessment

See [charter](./charter.md) for blessed direction.

> 2026-07-13: rebuilt against the live tree. The prior "No sweep-safe items" verdict was reasoned from the unlanded builder bundle (see review.md provenance correction); the live tree does have sweep-safe work.

## Recommended

- jsdom unit tests for the web context-menu renderer paths that exist today — DOM build (separators, checkmark/radio, accelerator column, disabled items), keyboard nav (ArrowUp/Down wrap, Enter/Space select, Escape dismiss), submenu hover expansion, viewport clamping. The renderer is live source (~180 lines in `menu.ts`) with almost no direct coverage.
- Fix the stale header comment in `packages/types/src/Menu.ts` claiming "a real web context-menu renderer is out of scope for the MVP" — the renderer exists in `menu.ts`.
- Extend `validateMenuItemTemplate` with radio/checkbox consistency checks (e.g. flag multiple checked radios among contiguous siblings) — additive sentinel-message coverage, no API change.
- Add optional descriptor fields `visible`, `sublabel`, `toolTip` to `MenuItemTemplate` and honor `visible` in the web renderer — additive optional fields mirroring the canonical native menu vocabulary (touches `@flighthq/types` `Menu.ts`, the package's own header file).

## Approved

None.

## Backlog

- Re-land the live-mutation layer: `MenuHandle`/`MenuItemHandle`, `setMenuItem*` mutators, structural edits, `destroyMenuHandle` — parked: changes the `setApplicationMenu` return type and the `MenuBackend` seam; needs a direction decision (the lost bundle's design is recorded in status.md).
- `showContextMenuAt(items, options)` with `MenuContextMenuOptions` (`positioningItemId`, `anchorElementId`, `onClose`) — parked: new seam method; bundle with the mutation-layer decision.
- `MenuItemSelectEvent` payload (id + checked + type) instead of bare `id` — parked: changes the `subscribeSelect` seam signature.
- `icon` field + web icon rendering — parked: needs image-pipeline integration and the web-fidelity-scope decision (charter Open direction 2).
- Accelerator string dispatch to `@flighthq/shortcut` and the `menu-formats` neighbor — parked: cross-package boundary decision (charter Open direction 1).
- Functional/visual test for the web context-menu renderer — parked: cross-boundary (`tests/functional/`), named a larger task by the charter.
- Rust `flighthq-menu` catch-up — parked: cross-repo/crate; hold until the TS seam settles the mutation-layer question.
