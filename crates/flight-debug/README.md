# flight-debug

The debug umbrella (TS `@flighthq/debug`).

- **Subsystem registry.** `register_debug_subsystem` / `unregister_debug_subsystem` record each
  subsystem's log channels and guard enabler and disabler (`DebugSubsystemHooks`). Last write wins,
  and the registry keeps its registration order.
- **Debug session.** `enable_debug` installs the dev sink, raises the global level (default
  `Debug`) and the channels of the selected subsystems plus any extra channels, then runs each
  selected subsystem's guard enabler. A panicking enabler unwinds the whole transaction, newest
  first, and the original panic resumes. `disable_debug` reverses exactly what the session changed,
  keeping channel overrides the caller set earlier. Both are idempotent.
  `enable_flight_diagnostics` also enables the generic render guards for one render state.
- **Timing.** `begin_debug_span` / `end_debug_span` / `measure_debug_span` and `mark_debug_frame`
  do nothing while no session is active. `end_debug_span` returns -1 for an unmeasured span.

State is caller-owned (D5). A `DebugState` holds the registry, the session and the frame counter,
and every function also takes the flight-log `LogStateRef` it reports through. Timestamps are
injected: `now_ms`, or a clock for `measure_debug_span`. No lock is held while a guard binding or
measured function runs.

When no sink is given, the session installs flight-log's console sink (`create_console_log_sink`,
level-prefixed text), as the source does, and `disable_debug` or a failed enable removes exactly
that sink.
