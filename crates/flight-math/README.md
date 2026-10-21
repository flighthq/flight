# flight-math

Scalar math, interpolation, hashing, seeded random sampling, and statistics.

## Precision

Scalar utilities and random samples use `f32` by default. The following existing
functions retain `f64`; each declaration has an item-specific `allow(f64)` reason.

| Functions | Reason |
| --- | --- |
| `factorial` | Finite factorials through 170 require double range; `f32` overflows at 35!. |
| `mean`, `median`, `variance`, `standard_deviation`, `weighted_average` | Preserve double inputs and the existing extreme-range and cancellation regressions; narrowing inputs to `f32` loses finite values and small residuals before accumulation. |
| `finite_absolute_scale` | Find a finite normalization scale across the full double input range. |
| `midpoint` | Average double middle values without premature overflow or underflow. |
| `scaled_sum`, `scaled_variance` | Preserve double precision in compensated normalized accumulation. |
| `unscaled_mean`, `unscaled_variance`, `unscaled_weighted_average` | Preserve double NaN/infinity propagation in the non-finite fallback paths. |

The statistics tests cover `f64::MAX`, double subnormal values, and a residual of
`f64::EPSILON / 6` after cancellation. These inputs and results cannot be
represented by `f32`. The declarations preserve the existing algorithms and
signatures; differences from the TypeScript reference still require review.
