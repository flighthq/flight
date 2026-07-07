# tray — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Fix `getTrayIconBounds` return type to use `RectangleLike`** — currently returns an inline `{ height; width; x; y }` literal type instead of the shared `RectangleLike` from `@flighthq/types`. The geometry query should reuse the existing type, not re-spell its fields.

## Approved

1. **Fix `getTrayIconBounds` return type to use `RectangleLike`** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

None.
