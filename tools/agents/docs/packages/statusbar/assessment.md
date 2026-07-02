# statusbar — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. **Make `enableStatusBarSignals` actually gate signal cost** — currently a pure no-op marker. Either wire it to lazily allocate signals, or remove if signals are always needed.

## Approved

1. **Make `enableStatusBarSignals` actually gate signal cost** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

None.
