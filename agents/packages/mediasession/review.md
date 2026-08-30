---
package: '@flighthq/mediasession'
status: solid
score: 94
updated: 2026-08-29
ingested:
  - status.md
  - source
---

# mediasession — Review

## Verdict

`solid` — **94/100**. R3 replaced the ambient resolver stack with two explicit Web Host slots and
closed the known command-publication and action-handler lifetime hazards. The remaining directions are
product choices rather than correctness gaps in the commissioned slice.

## Present capabilities

- `MediaSessionBackend` is an Entity command capability with five method-tight reason-only operations
  plus `destroy()`.
- `MediaSessionActionBackend` is an Entity event capability whose `subscribe(action, listener)` returns
  an exact unsubscribe or `null`.
- `MediaSessionActionSignal` is a per-action Entity. Core owns its signal; the provider emits actions.
- `webHost.media.session` and `.sessionAction` are stable Web slots. Native hosts expose `{}`.
- Web command publications are pinned by provider/session/lane token and, where readable, exact value.
  Explicit clears relinquish ownership; teardown preserves foreign and successor state and retries
  failed release.
- Action subscribers fan out through one native handler per session/action. No blanket registration is
  performed, and subscription and provider lifetimes remain separate.

## Outcome surface

- metadata set: `ok`, session/metadata unavailable, invalid artwork source, operation failed
- metadata clear and playback set: `ok`, session unavailable, operation failed
- position set: `ok`, session/position API unavailable, three local validation reasons, operation failed
- position clear: `ok`, session/position API unavailable, operation failed

The API carries no generic success flag or reasons an exact method cannot produce.

## Evidence

- Core tests cover explicit routing, local validation, programmer misuse, Entity identity, attach/null,
  origin pinning, retry, reattach ordering, disposal and distinct/aliased provider destruction.
- Host-web tests cover the exact outcome matrix, publication ownership, foreign/successor preservation,
  session identity, per-action fanout, unsubscribe/destroy retry, and independent command/action lifetime.
- Structural operation, lifecycle, teardown-rejection and capability-arrival guards recognize the
  explicit Host completion without restoring any ambient alias.

## Remaining directions

1. Decide separately whether to expand the action vocabulary as browser standards grow.
2. Decide whether metadata fields should remain required as a complete-card contract.
3. Consider a player-side convenience bridge outside this package.
