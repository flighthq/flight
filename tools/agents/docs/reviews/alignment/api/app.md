# API Alignment: @flighthq/app

**Verdict:** Strong conformance — the package follows the event-entity + backend-seam patterns cleanly; the only real findings are a duplicated/ambiguous badge surface and a couple of doc-comment nits, with no naming-abbreviation, allocation, teardown, or sentinel violations.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Medium | `setAppBadgeCount` vs `setAppDockBadge` | Two near-identical "badge" setters with different value types (`number` count vs `string` text) and different return contracts (`boolean` vs `void`). `setAppBadgeCount` is documented as the canonical app badge, yet `setAppDockBadge` also sets a "dock/taskbar badge" — the distinction (numeric overlay badge vs free-text dock badge) is real but not discoverable from the names alone, and a user will not know which to reach for. | Keep both if the platform distinction is intentional, but make the names carry it: e.g. `setAppBadgeCount` (numeric, canonical) and `setAppDockBadgeText` to signal it is the text variant. At minimum, cross-reference each in the other's doc comment so the split is navigable. |
| Low | `setAppDockBadge` | Returns `void` while its sibling `setAppBadgeCount` returns `boolean` for the unsupported case. A web backend with no dock silently no-ops with no signal to the caller, breaking the package's own "return false when unsupported" convention used right next to it. | Return `boolean` from `setAppDockBadge` (and `setDockBadge` on `AppBackend`) so unsupported is observable, matching `setBadgeCount`/`setAppBadgeCount`. |
| Low | `setAppDockMenu` / `setAppDockBadge` doc comments | Comment says "macOs" (lowercase s) for `setAppDockMenu`; the dock-menu/dock-badge comments imply macOS-only but the function names say generic "Dock". Minor casing/precision nit. | Use "macOS" and let the doc state the platform scope explicitly. |
| Info | `requestAppSingleInstanceLock` | Returns `boolean` but uses `request*`, not `has*`/`is*`. This is correct (it is an action that attempts acquisition and reports the outcome, not an accessor), noted only to confirm it is not a `get*`-returns-boolean violation. | No change. |
| Info | `App` backend method names (`setBadgeCount`, `setDockBadge`, `bounceDock`, `subscribe*`) | The `AppBackend` interface methods drop the `App` type word that the package-root exports carry. This is the established backend-seam convention across siblings (tray/notification) — backend methods are namespaced by the interface — so it is consistent, not a violation. | No change. |

## Clean

- **Full, unabbreviated type word.** Every export spells out `App` (`createApp`, `quitApp`, `getAppName`, `hasAppSingleInstanceLock`, `setAppBadgeCount`). No `Obj`/`DO`-style abbreviation. "Dock" is a domain concept, not an abbreviation.
- **Globally unique root names.** All exports are `App`-suffixed or `App`-infixed and will not collide in the SDK barrel.
- **Event-entity pattern matches the map.** `createApp` / `attachApp` / `detachApp` / `disposeApp` mirror `@flighthq/application`'s window wiring exactly, which the codebase map prescribes for app events (`onActivate`, `onOpenFile`, `onSecondInstance`). `attachApp` is idempotent (tears down a prior subscription first) — correct for the seam.
- **Allocation discipline.** `createApp` is the only allocator and is verbed `create*`. No hidden allocation in getters or setters; no out-params, so no aliasing concerns to test.
- **Teardown verbs.** `disposeApp` correctly detaches the backend subscription and releases to GC (no non-GC resource to free), and is explicitly distinct from a `destroy*`. `detachApp` is separable and safe to call when not attached.
- **Sentinels over throws.** `bounceAppDock` returns `-1` when unsupported; `setAppBadgeCount` returns `false`; `getApp*` accessors return `''` when unknown. No thrown errors for expected-missing cases; the web backend guards every API and swallows host-restricted calls (`window.close`, `location.reload`, `window.focus`) rather than throwing.
- **Accessor/boolean conventions.** `get*` used for value reads (`getAppName`, `getAppVersion`, `getAppLocale`, `getAppBackend`); `has*` used for the boolean `hasAppSingleInstanceLock`. No `get*`-returns-boolean cases.
- **Backend-seam symmetry.** `getAppBackend` / `setAppBackend` / `createWebAppBackend` follow the exact command-capability triad used by `tray`, `notification`, and `clipboard`. Lazy web default via `getAppBackend`, `setAppBackend(null)` to fall back — consistent across the platform suite.
- **Readonly inputs.** `setAppDockMenu(items: readonly MenuItemTemplate[])` marks its array input readonly; `App` signal payloads (`readonly string[]` argv) are readonly.
- **Type imports.** `import type { App, AppBackend, MenuItemTemplate }` is on its own `import type {}` line, separate from the value import of `@flighthq/signals`. Cross-package types (`App`, `AppBackend`, `MenuItemTemplate`) come from `@flighthq/types`, not defined inline.
- **Alphabetized + side-effect-free.** Exports are alphabetized; module state (`_backend`, `_subscriptions`) sits at the bottom after the exports; `"sideEffects": false` with no top-level registration.
