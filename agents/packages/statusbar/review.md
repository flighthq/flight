---
package: '@flighthq/statusbar'
status: solid
score: 84
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - public API
  - host-capacitor
---

# statusbar — Review

## Verdict

**Solid — 84/100.** The live package is a complete mobile status-bar control cell, not the
unbuildable intermediate delta described by the old merge-gate review. Fourteen public functions plus
four contract-only constructors/backend functions cover snapshots, height, attached change events,
style/visibility/color/overlay commands, and a component-friendly style stack. Shared types are
present, the web theme-color behavior is guarded, Capacitor supplies a native mobile adapter, and all
42 package tests plus two focused host tests pass. The approved no-op signal marker is gone, and this
audit repaired baseline restoration and event-payload ownership. Remaining depth is at the async native
boundary and in explicit arbitration between the process-global stack, direct setters, and backend
replacement.

## What is solid

- `StatusBarInfo`, `StatusBarStyleEntry`, animation/style values, handles, the backend, and the event
  entity live in `@flighthq/types`; implementation code consumes the contract lane and keeps backend
  construction/installation outside the ordinary public lane.
- Snapshot reads use caller-owned out parameters and honest sentinels (`height = -1`, `color = 0`).
  Change delivery allocates an owned snapshot per rare host event, so a later event or unrelated
  scratch read cannot mutate data a listener retained.
- Signal cost is explicit without a no-op marker: `createStatusBar` allocates the inert signal entity,
  `attachStatusBar` starts the host subscription, and detach/dispose tear it down idempotently.
- The style stack captures the backend baseline at the first push, merges last-pushed entries
  per-field, restores released fields on pop/clear, supports out-of-order removal, exposes membership,
  and captures a fresh baseline for the next stack lifetime.
- The web backend mutates only on an explicit color call, upserts one theme-color meta element, safely
  reads it back, and uses no-op/sentinel behavior for unsupported status-bar capabilities.
- The Capacitor adapter maps style, visibility, background color, and overlay setters, converts packed
  color values, and provides a cached status snapshot without importing Capacitor into this package.
- Package import has no host side effect, `sideEffects` is false, every exported function has a
  colocated test, and the focused structural gate is green.

## Remaining depth

- **Native snapshot and change truth.** Capacitor's `getInfo()` is asynchronous while
  `StatusBarBackend.getInfo` is synchronous. The adapter prefetches once, returns defaults until the
  promise settles, never refreshes its cache after setters, and has no native change event to drive
  `subscribe`.
- **Animation capability fidelity.** The public API accepts visibility animations and an animated
  color flag, but the Capacitor adapter drops both hints. Capability truth or an explicit per-host
  support query would prevent callers from assuming those requests are honored.
- **Stack/backend arbitration.** The stack is correctly process-global for one OS bar, but replacing
  the backend or calling direct setters while entries are active has no declared ownership rule.
  Baseline migration, rejection, or stack precedence should be chosen and covered.
- **Height versus safe area.** Intrinsic status-bar height remains distinct from
  `@flighthq/device`'s top safe-area inset, but native availability and the consumer guidance for
  notched/island devices still need a settled cross-package contract.

## Boundary conclusion

The local control/event/stack surface is mature and the approved signal-marker cleanup is complete.
Further value lies in an honest asynchronous native-state contract and explicit stack arbitration, not
more local setters or speculative event markers.
