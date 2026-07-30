---
package: '@flighthq/input'
updated: 2026-07-30
basedOn: ./review.md
---

# input — Assessment

## Depth gaps

1. **Introduce the portable `InputBackend` seam.** Generalize browser-bound attachment, gamepad
   polling, animation-frame scheduling, and pointer-lock/capture capabilities so native hosts can feed
   the same normalized `InputManager` without emulating DOM objects. The backend's push-vs-attach shape
   remains charter Open direction 1.
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
- Gamepad vibration and native capability routing after the backend seam exists.
- TS/Rust conformance after the TypeScript contract stabilizes.

## Approved

- [2026-07-02 · completed] Mapping parameter types and the named key-repeat handle landed in
  `210c559d2`; strict package checks cover the formerly reported implicit-any callbacks, and the live
  Package Map/catalog entries cover the full shipped surface.
