---
package: '@flighthq/notification'
updated: 2026-08-30
basedOn: ./review.md
---

# notification — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

- Run the interactive/device host-probe lanes when their required Electron/Tauri/Capacitor environments are
  available. These are environment proofs, not unfinished implementation work.

## Approved

- [2026-07-30 · completed] Remove the `// ----` structural divider comments (`83d3d4d52`) — deleted the sole remaining divider in `notification.ts`; the `notification.test.ts` half was already clean.
- [2026-08-30 · completed] Eleven exact Host traits and provider profiles.
- [2026-08-30 · completed] Stable Notification/ScheduledNotification Entity resources with provider-private
  native identity and origin-pinned close/cancel.
- [2026-08-30 · completed] Named outcomes, rejected-field validation, transactional event subscription
  acquisition/release, and terminal attempt-all/retry-only lifecycle teardown.
- [2026-08-30 · completed] Injected page/SW Web providers, exact native adapters, Electron runner migration,
  host-probe slot/profile assertions, dependency declarations, and current records.

## Backlog

- Provisional permission, progress, grouping, and ongoing request vocabulary — parked until a provider-backed
  direction derives exact fields and coverage.
- Rust `flighthq-notification` conformance crate — parked as cross-repository work.
