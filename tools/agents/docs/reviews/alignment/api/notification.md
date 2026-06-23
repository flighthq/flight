# API Alignment: @flighthq/notification

**Verdict:** Strongly conformant — a textbook command-style capability cell; the only findings are a missing `Readonly` on a nested array field (in `@flighthq/types`) and a verb-symmetry note (`showNotification` vs. the backend's `notify`).

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `NotificationRequest.actions` (in `@flighthq/types`) | The request type is passed as `Readonly<NotificationRequest>` everywhere, but the nested `actions?: NotificationAction[]` is a mutable array of mutable `NotificationAction` objects. `Readonly<T>` is shallow, so a callee can still mutate `request.actions` and each action. The convention says apply `Readonly<>` wherever mutation is not intended, including stored/nested references. | Make the field `actions?: readonly Readonly<NotificationAction>[]` (or `readonly NotificationAction[]` and mark `NotificationAction` fields `readonly`). This is an edit in `packages/types/src/Notification.ts`, surfaced as a suggestion since it crosses into `@flighthq/types`. |
| Low | `showNotification` vs. `NotificationBackend.notify` | The public free function is `showNotification`, but the backend method it delegates to is `notify`. The package otherwise mirrors method↔function names 1:1 (`isSupported`→`isNotificationSupported`, `requestPermission`→`requestNotificationPermission`, `subscribeClick`→`onNotificationClick`). `show*` is the right public verb (it matches `@flighthq/dialog`'s `showMessageDialog`/`showOpenFileDialog`), so the asymmetry is on the backend side: the seam method reads as a different operation than its only caller. | Optional: rename the backend method `notify`→`show` so the seam verb matches the public `show*` family, OR accept the divergence intentionally (notify is the platform term: `Notification`/`notify`). If kept, it is benign — flagged only for symmetry awareness. |
| Info | `NotificationRequest.tag` as the click/action correlation key | `onNotificationClick`/`onNotificationAction` deliver a `tag: string`, but `tag` is optional on `NotificationRequest`. A notification shown without a `tag` cannot be correlated back when its click fires. Not an API-naming violation, but a contract gap worth a doc note or making `tag` the documented requirement for click-routing. | Document that `tag` is required to receive click/action callbacks, or note it on the type. No rename needed. |

## Clean

- **Full, unabbreviated type word in every export.** `createWebNotificationBackend`, `getNotificationBackend`, `setNotificationBackend`, `isNotificationSupported`, `onNotificationClick`, `onNotificationAction`, `requestNotificationPermission`, `showNotification` — every name carries `Notification` in full; nothing abbreviated.
- **Globally unique root exports.** All eight names are `*Notification*`-qualified, so no collisions with sibling capability barrels or the SDK barrel.
- **Command-capability triad is exact.** `createWeb*Backend` / `get*Backend` / `set*Backend` match the documented shape and the `clipboard`/`dialog`/`shell` siblings verbatim.
- **`on*`-over-`subscribe*` event seam.** `onNotificationClick`/`onNotificationAction` are the exact names blessed in the codebase map (index.md L247) and correctly wrap the backend's `subscribeClick`/`subscribeAction`, returning an unsubscribe `() => void`.
- **Permission verb consistent across the suite.** `requestNotificationPermission` matches `requestGeolocationPermission` / `requestSensorsPermission` / `requestWebcamPermission`.
- **`is*` boolean accessor, `get*` non-boolean accessor.** `isNotificationSupported(): boolean` and `getNotificationBackend(): NotificationBackend` use the correct prefixes; no `get*` returns a boolean.
- **Sentinels for expected failure, never throws.** `showNotification`/`requestNotificationPermission` resolve to `false` on denial or missing host surface; the web backend guards every `Notification` touch and wraps in try/catch — denial is treated as an expected outcome, not an error. No thrown errors for expected-missing cases.
- **No allocating-verb misuse.** The only allocator is `createWebNotificationBackend` (correct `create*`); no `out`-param hot-path functions exist here, so alias-safety is N/A.
- **No teardown-verb drift.** The unsubscribe contract is an returned closure, not a mislabeled `dispose*`/`destroy*`; those verbs are correctly absent.
- **`Readonly<>` on the request parameter.** `showNotification(request: Readonly<NotificationRequest>)` (top-level) is correct; only the nested array (Findings) escapes it.
- **Types sourced from `@flighthq/types`.** `NotificationBackend`/`NotificationRequest` are imported via `import type {}` on its own line; nothing cross-package is defined inline. `package.json` declares only `@flighthq/types`, `sideEffects: false`, single `.` export — no top-level side effects (backend is lazily created in `getNotificationBackend`).
- **Exports alphabetized** in `notification.ts`; `index.ts` is a thin `export *` barrel.
