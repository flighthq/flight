# Dependency Alignment: @flighthq/tray

**Verdict:** Clean — a single, type-only dependency on `@flighthq/types`; declared deps match used deps exactly, with no boundary, phantom, or hygiene issues.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (only dep) | Imported `import type` only (`tray.ts:1`), pinned `"*"`, `sideEffects: false`. No `@flighthq/sdk` import, no inline cross-package types, no cross-boundary or "up-layer" edges. `MenuItemTemplate`, `TrayBackend`, `TrayEventType`, `TrayIcon`, `TrayIconOptions` all resolve to `@flighthq/types` (`Tray.ts` / `Menu.ts`), not redefined locally. | None. |

Notes that judgment adds beyond `npm run packages:check` (which passed clean):

- **Dependency mapping reads exactly as predicted.** A platform-suite command capability over a swappable `*Backend` should depend on nothing but the header layer (`@flighthq/types`) — and it depends on exactly that and nothing else. No surprising edges.
- **No runtime weight pulled in.** The sole import is `import type`, so the backend trait and entity types contribute zero bytes; the package is genuinely value/seam-only and tree-shakable.
- **Backend-seam discipline is correct.** `MenuItemTemplate` is consumed from `@flighthq/types` (shared with `@flighthq/menu` / `@flighthq/app`) rather than re-declared, keeping the menu contract single-sourced. Aligns with the map's note that the app/dock badge lives in `@flighthq/app`, not here — and indeed tray declares no edge to `@flighthq/app`.

## Declared vs used

- **Declared:** `@flighthq/types` (dep), `typescript` (devDep).
- **Used:** `@flighthq/types` (type-only, in `tray.ts` and `tray.test.ts`).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none.
- **Pinning:** workspace dep `@flighthq/types` pinned `"*"` per convention.
