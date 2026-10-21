# flight-clock

The hierarchical, pausable, scalable time primitive (TS `@flighthq/clock`). Clocks form a tree; the frame-loop owner calls `advance_clock(&root, dt_ms)` with the caller-measured delta. There is no wall clock, timer or scheduler in this crate. Each clock's scaled delta (`paused ? 0 : delta * scale`) becomes its `delta_time`, accumulates into `elapsed`, emits the opt-in `on_tick`, then drives its children in attach order.

## Ownership

Clocks have shared identity (A2): `create_clock` returns `Ref<Clock>`, children are a `Vec<Ref<Clock>>` (ordered, D3), and parent links are strong, as in TS. `dispose_clock` detaches the clock, releases its children and clears `on_tick`, which breaks the parent/child cycle. Structural operations take `&Ref<Clock>`, and their D18 sugar is `ClockMethods` on the handle. Field operations take `&Clock` / `&mut Clock`. No lock is held while `on_tick` slots run or children advance, so slots may re-enter any clock operation.

## Precision

Clock times are `f64` milliseconds, for two source-specific reasons. `on_tick` carries flight-signals' `FrameTick` (`delta_time: f64`), so it plugs into `connect_signal_at_frame_rate` as TS's `onTick` does. And `elapsed` accumulates across a whole session, where `f32` stops resolving 1 ms steps after 2^24 ms (about 4.7 hours). `scale` multiplies that `f64` delta. The items are `Clock`, `ClockOptions`, `advance_clock`, `get_clock_effective_scale` and `set_clock_scale`, plus their sugar; each carries an `allow(f64)` reason.
