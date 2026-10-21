# flight-statechart

Hierarchical state machine: concurrent regions, data-only conditions, exit-time gates, blend reporting, optional signals and explicit diagnostics.

## Precision

- Authored numeric inputs/conditions, transition `duration_ms`, `exit_time_ratio`, region duration/elapsed and operation `now_ms` are `f64` milliseconds/values from TS `number`; `region_blend` stays `f32` as the normalized blend weight (D1).
