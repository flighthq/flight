---
package: '@flighthq/input'
updated: 2026-08-27
basedOn: ./review.md
---

# input — Assessment

## Depth gaps

1. **Complete the adjacent input host capabilities.** Listener ingress now routes all six families
   through one process-global `InputIngressBackend` with host-neutral source identities. Generalize
   gamepad polling, animation-frame scheduling, pointer capture, and coalesced-event access so a
   native host can use the full library without browser globals.
2. **Open gamepad mapping registration.** Replace the closed `GamepadMappingKind` union and hardcoded
   standard-only lookup with the chartered registry plus separately importable W3C/raw presets. Keep the
   fixed index tables as one registered mapping rather than taxing raw input users.
3. **Model multi-device identity.** Add a portable identity and connection lifecycle for keyboard and
   pointer devices when a concrete native-host consumer establishes the required semantics.
4. **Resolve the signal cost model.** Either bless the eager 15-signal `InputManager` as intrinsic to
   the package or design an `enableInputSignals` path that leaves a signal-less manager useful.

## Recommended

_None. The July 2 sweep is already present in the live tree: gamepad-name queries take
`GamepadMappingKind`, key-repeat creation returns `InputKeyRepeatTimer`, the tests typecheck, and the
package maps describe gamepad/state/edge capabilities._

## Backlog

- `@flighthq/input-bindings`, `@flighthq/gestures`, and `@flighthq/gamepad-mappings` package designs.
- Gamepad vibration and native capability routing beyond the landed listener-ingress seam.
- TS/Rust conformance after the TypeScript contract stabilizes.

## Approved

- [2026-07-02 · completed] Mapping parameter types and the named key-repeat handle landed in
  `210c559d2`; strict package checks cover the formerly reported implicit-any callbacks, and the live
  Package Map/catalog entries cover the full shipped surface.
- [2026-07-30 · completed] Record per-frame key and button edges as transitions (`960553676`) — the
  edge machine's own doc comment promised "transitioned from up->down since the last
  `endInputStateFrame` call", but a held key re-fired `keydown` every frame and was forwarded
  uncritically (autofiring anything bound to press), while a same-frame tap (keydown+keyup between two
  `endInputStateFrame` calls) was silently swallowed rather than delayed, because each handler deleted
  the key from the opposite tracking set. Same shape confirmed and fixed on the gamepad button pair.
