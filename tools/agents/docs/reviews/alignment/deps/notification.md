# Dependency Alignment: @flighthq/notification

**Verdict:** Clean — a single `import type` from `@flighthq/types` exactly matching the one declared dependency; no SDK import, no inline cross-package types, no phantom or unused deps. Exemplary platform-suite hygiene.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (dep) | Only runtime/type dependency; imported as `import type { NotificationBackend, NotificationRequest }` in `src/notification.ts`. Pinned `"*"`. Correct. | — |
| None | `typescript` (devDep) | Standard build-only devDep. | — |
| Info | `@flighthq/sdk` | Not imported. Correctly absent. | — |
| Info | layering | Pure platform-suite command capability: flat free functions over a swappable `NotificationBackend` defined in `@flighthq/types`, with `getNotificationBackend`/`setNotificationBackend`/`createWebNotificationBackend`. Does not reach across to any sibling platform package or concrete host. Depends only on the header layer. | — |
| Info | tree-shaking | `"sideEffects": false`; the web backend is a lazily-created `_backend` slot, not eager top-level state — no import-time side effects. Type usage is `import type`, pulling no runtime weight. | — |

## Declared vs used

- **Unused declared:** none. `@flighthq/types` is used; `typescript` is the build toolchain.
- **Phantom (used-but-undeclared):** none. The only import (`@flighthq/types`) is declared.
- **Mapping legibility:** A reader predicting this package's deps from its purpose ("system notifications over a swappable web/native backend") would expect exactly `@flighthq/types` for the `NotificationBackend`/`NotificationRequest` contracts and nothing else. The actual dependency set matches that prediction with no surprising edges. `host-electron` and `haptics` reference the type/concept but the dependency arrows correctly point _into_ `@flighthq/types`, not at this package.

`npm run packages:check` passes (86 packages valid); this audit adds the judgment that the single edge is minimal, correctly type-only, and reads cleanly against the package's role.
