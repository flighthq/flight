---
package: "@flighthq/host-capacitor"
updated: 2026-08-30
by: builder3
---

# host-capacitor — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

- **2026-08-30** — The returned Host now carries an exact empty `shortcut: {}` group. This is the
  structural declaration that Capacitor supplies neither global-shortcut query nor trigger
  registration; no web or sentinel provider is substituted.
