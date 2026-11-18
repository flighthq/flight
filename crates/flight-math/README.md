# flight-math

Scalar math, interpolation, hashing, seeded random sampling, and statistics.

`RandomSource` is a callable `Arc<dyn Fn() -> f64 + Send + Sync>`. Cloning it
shares its stream; creating another source with the same seed repeats the stream.
Sampling functions borrow `&dyn Fn() -> f64`, so callers can also provide their
own deterministic or captured source.

Seeded samples divide a 32-bit integer by `2^32` in `f64`, preserving the
half-open `[0, 1)` range without an endpoint clamp. Seed `52078625` covers a
sample close to that endpoint and its use in pick and shuffle indices.

## Precision

Spatial and scalar authoring values use `f64` throughout this crate. This keeps
constants, interpolation, random sampling, and statistics in the same precision
domain and avoids implicit narrowing between math and geometry.

The statistics tests cover `f64::MAX`, values near `f64::MIN_POSITIVE`, and a
residual of `f64::EPSILON / 6` after cancellation. Trigonometric sampling and
circle constants are also checked against native-f64 precision expectations.
