---
package: '@flighthq/notification'
updated: 2026-07-13
basedOn: ./review.md
---

# notification — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

- Extract the shared listener-registry + best-effort `setTimeout` scheduler primitive from the two ~95%-duplicated backend factories, leaving `createWebNotificationBackend`/`createServiceWorkerNotificationBackend` as thin wrappers. Charter-blessed (Decision 2026-07-02), within-package, behavior-preserving; the June "too large for sweep" call was made while the head didn't compile — with the build healed this is a mechanical refactor covered by the existing 66 tests.
- Remove the `// ----` structural divider comments in `notification.ts` and `notification.test.ts` (codebase-map style rule); the test-file dividers have drifted out of sync with the blocks beneath them.

## Approved

None.

## Backlog

- Promote channel management (`createNotificationChannel`/`delete`/`get`) from structural casts onto the `NotificationBackend` header, and enrich `NotificationChannel` beyond `{id, name}` (importance, sound, description) — parked: header/seam change, needs a direction decision (extends charter Open directions).
- `priority`/`importance` and progress/ongoing fields on `NotificationRequest` — parked: charter Open direction 3 (progress) is an explicit in-or-out question.
- Replace the lossy `getActiveNotifications` cast with an explicit `ActiveNotification` summary type or a narrowed return — parked: charter Open direction 2 awaits a ruling.
- Replace the `SwBackendInternal` monkey-patch dispatch casts with a designed forwarding seam — parked: seam-shape decision, entangled with the inert-infrastructure ruling (Open direction 1).
- Align event delivery with the suite-wide signal-entity vs `on*`-unsubscribe convention — parked: cross-suite consistency decision.
- Rust `flighthq-notification` crate — parked: cross-repo conformance work.
