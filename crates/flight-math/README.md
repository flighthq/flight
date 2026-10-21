# flight-math

Scalar math, interpolation, hashing, seeded random sampling, and statistics.

`RandomSource` is a callable `Arc<dyn Fn() -> f32 + Send + Sync>`. Cloning it
shares its stream; creating another source with the same seed repeats the stream.
Sampling functions borrow `&dyn Fn() -> f32`, so callers can also provide their
own deterministic or captured source.

Seeded samples are narrowed to `f32` and capped at `1.0 - f32::EPSILON / 2.0`
to preserve the half-open `[0, 1)` range when a TypeScript sample rounds up.
Seed `52078625` covers that endpoint and its use in pick and shuffle indices.

## Precision

Scalar utilities and random samples use `f32` by default. The following
functions use `f64`; each declaration has an item-specific `allow(f64)` reason.

| Functions | Reason |
| --- | --- |
| `random_gaussian`, `random_gaussian_pair`, `random_on_unit_circle` | Compute angles and trigonometric values in double precision before narrowing to `f32`; the source quarter-turn tests require errors below `5e-11` and `5e-13`. |
| `factorial` | Finite factorials through 170 require double range; `f32` overflows at 35!. |
| `mean`, `median`, `variance`, `standard_deviation`, `weighted_average` | Preserve double inputs and the existing extreme-range and cancellation regressions; narrowing inputs to `f32` loses finite values and small residuals before accumulation. |
| `finite_absolute_scale` | Find a finite normalization scale across the full double input range. |
| `midpoint` | Average double middle values without premature overflow or underflow. |
| `scaled_sum`, `scaled_variance` | Preserve double precision in compensated normalized accumulation. |
| `unscaled_mean`, `unscaled_variance`, `unscaled_weighted_average` | Preserve double NaN/infinity propagation in the non-finite fallback paths. |

The statistics tests cover `f64::MAX`, values near `f64::MIN_POSITIVE`, and a
residual of `f64::EPSILON / 6` after cancellation. Narrowing the large and small
inputs overflows or underflows; `f32` accumulation loses the cancellation
residual. The declarations preserve the existing algorithms and signatures. Sampling
angles retain the source precision needed by the deterministic quarter-turn tests;
other differences from the TypeScript reference still require review.
