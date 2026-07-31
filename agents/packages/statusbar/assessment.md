---
package: '@flighthq/statusbar'
updated: 2026-07-31
basedOn: ./review.md
---

# statusbar — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Make native state reads and changes honest.** Replace Capacitor's construction-time cached
   synchronous projection with an async query/readiness model or a backend event path that refreshes
   snapshots after host and setter changes.
2. **Expose or realize animation capability.** Either honor visibility/color animation hints in
   native adapters or add capability truth so callers can distinguish supported transitions from
   silently dropped requests.
3. **Define style-stack arbitration.** Specify what happens when the active backend is replaced or a
   direct `setStatusBar*` call occurs while stack entries are active, then preserve or deliberately
   invalidate the captured baseline with behavioral coverage.

## Recommended

1. **Decide whether `StatusBarInfo.height` should be reported by the web backend at all** — it is
   hardcoded to `-1` (unknown), which is honest, but `visualViewport` / `env(safe-area-inset-top)`
   can approximate it on mobile web. This overlaps the `@flighthq/device` boundary the charter draws,
   so it is a boundary question rather than a missing feature.

## Approved

1. **Make `enableStatusBarSignals` actually gate signal cost** [2026-07-02 · blanket "platform
   integration suite sweep"] — done, by the charter's second branch: the function is gone and the
   package uses the suite's event-capability shape (`createStatusBar` / `attachStatusBar` /
   `detachStatusBar` / `disposeStatusBar`), where cost is assumed at attach.
2. **Restore style-stack baselines and own event payloads** [2026-07-30] — done in `c56576fa1`:
   pop/clear restore the pre-push backend baseline instead of leaving released values applied, and
   every change event receives an owned `StatusBarInfo` rather than a shared mutable scratch.
3. **Parse the short `#rgb` theme-color form** [2026-07-30] — done in `c4e693f4e`: `_webReadThemeColor`
   now expands 3-digit hex and rejects malformed content instead of reading it as `0`.

## Backlog

- Rust parity after native snapshot/change semantics settle.
- Additional host adapters where a platform exposes a real controllable status bar.
