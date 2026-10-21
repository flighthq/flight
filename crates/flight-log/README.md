# flight-log

Structured logging (D5 explicit state): sinks, levels, once-keys, spans, redaction, serializers and log signals live in a caller-owned `LogState`; callers inject `now_ms` instead of the crate reading a clock.

## Precision

- `LogEntry.timestamp_ms`, `LogTimer.started_at`, `LogState`-driven timer elapsed values, and the buffered/rate-limited sink intervals are `f64`: they are millisecond durations, where `f32` loses precision over a session (D1).
