---
package: '@flighthq/input'
updated: 2026-08-27
by: builder5
---

# input — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/input/src/` on 2026-08-27. A file:line here is a claim
about this tree, not about a session.

- **Listener ingress is portable; adjacent browser capabilities are not.** One process-global
  `InputIngressBackend` now serves many exact `InputIngressSource` identities, and all six listener
  families route through it. `navigator.getGamepads`, animation-frame scheduling, pointer lock,
  pointer capture, and coalesced Web events still need separately measured host capabilities.
  Gamepad rumble also remains absent.
- **`onKeyUp` records a release for a key the state never saw pressed** (`inputManager.ts:298-301`),
  asymmetric with the up→down press guard immediately above it (`:294-297`). Making it symmetric
  would drop a real release when the state is connected while a key is already held, so this is a
  behavioural ruling rather than a bug fix.
- **No action/binding layer, gesture recognizers, or controller-mapping database.** None of
  `input-bindings`, `gestures`, or `gamepad-mappings` exist under `packages/`. Timestamps and
  coalesced pointer events are both in place, so gestures are unblocked technically; the names and
  boundaries are the open question.
- **No multi-device identity.** `InputDeviceId` appears nowhere; connect/disconnect signals exist for
  gamepads only (`inputManager.ts:75`). The boundary with `@flighthq/sensors` is unsettled.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-27** — All 13 listener registrations and 13 removals moved behind the explicit Web
  `InputIngressBackend`; existing callers use the broadened host-neutral attach/detach surface, the P5
  input-ingress budget is zero, and lifecycle ownership points to the shared backend ledger.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped the standing claim that the
  `void options` pattern survives in `attachGamepadInput` and `attachRelativePointerInput` — the
  relative pointer attach honours `preventDefault` at `inputManager.ts:212`; the second offender is
  `attachTextInput`.
- **2026-07-30** — Per-frame edge sets record up→down transitions rather than the last event
  (`inputManager.ts:283`); held keys no longer autofire and a same-frame tap keeps both edges.
- **2026-07-30** — Live-tree audit closed four stale Recommended items with no source change.
- **2026-06-25** — Relative pointer routed through the shared pointer writer, `preventDefault`
  honoured there, key-code tables filled to the W3C `code`/`key` sets, package description updated.
- **2026-06-24** — Dead zones (axial + radial), key-repeat timer, pointer lock/capture, coalesced
  pointer events, semantic gamepad axis/button names, and the frame-edge query family landed.
