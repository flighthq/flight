---
package: "@flighthq/host-tauri"
updated: 2026-08-30
by: builder3
---

# host-tauri — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

- **2026-08-30** — Notification is exactly delivery/lifecycle/permission. Plugin calls return named outcomes, rejected fields are reported, accepted means the injected send call completed, and destroy is terminal.

- **2026-08-30** — Shortcut registration moved from an optimistic ambient backend to explicit
  `Host.shortcut.query` and `.trigger` Entities. Native acquisition and release are awaited,
  origin/token ownership is exact, `Pressed` filtering remains, and failed teardown obligations are
  retained for retry.
