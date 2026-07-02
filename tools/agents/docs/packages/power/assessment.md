# power — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Add `enablePowerSignals` opt-in gate** — `createPower` currently eagerly allocates 10 signals unconditionally. Add the standard `enablePowerSignals` function so signal allocation is deferred until the caller opts in, matching the SDK's documented signal-group gate pattern (`enable*` functions gate when signal cost is assumed).

## Approved

1. **Add `enablePowerSignals` opt-in gate** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

None.
