# flight-importdiagnostics

Structured diagnostic collection and deterministic human-readable formatting for Flight importers.

## Precision

- Import diagnostic detail numbers use `f32`, the SDK default contract numeric type. No operation in this crate requires `f64` precision.
