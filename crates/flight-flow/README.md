# flight-flow

Application-state stack: push/pop/replace transitions with lifecycle callbacks, transparent `updateBelow`/`renderBelow` behavior, and an explicit opt-in guard seam.

## Precision

- Transition log timestamps (`now_ms` on push/replace and guard reporting) are `f64` millisecond values injected by the caller (D1/D5); frame deltas stay `f32` as 2D/3D value data.
