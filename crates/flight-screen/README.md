# flight-screen

Host-explicit display enumeration, geometry, work area, scale factor and display events (TS `@flighthq/screen`). It routes only through the supplied query, change, details and permission-change capabilities, with no native enumeration, OS dialogs or display settings.

- **Queries** fill caller-owned `out` values (out-first). The derived queries take a caller-owned `ScreenQueryScratch` (D5), which replaces the source's module `_scratchScreens` array: the same buffer goes to the provider every time, as in TS.
- **Copying** a screen into `out` copies its data fields and keeps `out`'s own entity runtime (`stripEntityRuntime` + `Object.assign`).
- **Selection** follows the source: half-open point containment, then the nearest center (first on ties); largest overlap for containing-rect; inclusive full containment for nearest-rect.
- **Coordinates:** `Vector2Like`/`RectangleLike` are flight-geometry's `Vector2`/`Rectangle`, as the vocabulary rules for `*Like` inputs.

## Precision

`ScreenInfo.id` is `f64`: it is an arbitrary TS `number` matched exactly, and real display ids (e.g. Electron's 2528732444) exceed f32's exact-integer range. All geometry and metrics are `f32` reported values.
