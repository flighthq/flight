//! Particle curve utilities: baked LUT construction, keyframe conversion,
//! and linear sampling.
//!
//! A scalar curve is a uniform flat array of `f32` values sampled at equal
//! time steps over `[0, 1]`.  A color curve is an interleaved `[r, g, b]`
//! array of the same shape, with length `N × 3`.

use flighthq_types::{ColorKeyframe, CurveKeyframe};

/// Bake an RGB function `f: [0, 1] → (r, g, b)` into an interleaved color
/// LUT of length `samples × 3`.
pub fn build_particle_color_curve<F>(f: F, samples: usize) -> Vec<f32>
where
    F: Fn(f32) -> (f32, f32, f32),
{
    let n = samples.max(2);
    let mut lut = vec![0.0f32; n * 3];
    for i in 0..n {
        let (r, g, b) = f(i as f32 / (n - 1) as f32);
        lut[i * 3] = r;
        lut[i * 3 + 1] = g;
        lut[i * 3 + 2] = b;
    }
    lut
}

/// Bake a scalar function `f: [0, 1] → value` into a `samples`-entry LUT.
pub fn build_particle_curve<F>(f: F, samples: usize) -> Vec<f32>
where
    F: Fn(f32) -> f32,
{
    let n = samples.max(2);
    let mut lut = vec![0.0f32; n];
    for (i, slot) in lut.iter_mut().enumerate() {
        *slot = f(i as f32 / (n - 1) as f32);
    }
    lut
}

/// Bake a piecewise-linear RGB timeline (e.g. an imported color gradient)
/// into a uniform interleaved LUT of length `samples × 3`.
/// Keyframes need not be sorted.
pub fn particle_color_curve_from_keyframes(keys: &[ColorKeyframe], samples: usize) -> Vec<f32> {
    if keys.is_empty() {
        return vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    }
    let mut sorted: Vec<ColorKeyframe> = keys.to_vec();
    sorted.sort_by(|a, b| {
        a.time
            .partial_cmp(&b.time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    build_particle_color_curve(
        |t| {
            let (i, frac) = locate_keyframe(&sorted_times_color(&sorted), t);
            if frac == 0.0 {
                let k = &sorted[i];
                (k.r, k.g, k.b)
            } else {
                let a = &sorted[i];
                let b = &sorted[i + 1];
                (
                    a.r + (b.r - a.r) * frac,
                    a.g + (b.g - a.g) * frac,
                    a.b + (b.b - a.b) * frac,
                )
            }
        },
        samples,
    )
}

/// Convert a baked interleaved RGB LUT (length `N × 3`) back into color
/// keyframes — one per sample at uniform times.
pub fn particle_color_curve_to_keyframes(lut: &[f32]) -> Vec<ColorKeyframe> {
    let n = lut.len() / 3;
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![ColorKeyframe {
            time: 0.0,
            r: lut[0],
            g: lut[1],
            b: lut[2],
        }];
    }
    let mut keys = Vec::with_capacity(n);
    for i in 0..n {
        keys.push(ColorKeyframe {
            time: i as f32 / (n - 1) as f32,
            r: lut[i * 3],
            g: lut[i * 3 + 1],
            b: lut[i * 3 + 2],
        });
    }
    keys
}

/// Bake a piecewise-linear scalar timeline into a uniform LUT.
/// Keyframes need not be sorted; times outside the covered range are clamped.
pub fn particle_curve_from_keyframes(keys: &[CurveKeyframe], samples: usize) -> Vec<f32> {
    if keys.is_empty() {
        return vec![0.0, 0.0];
    }
    let mut sorted: Vec<CurveKeyframe> = keys.to_vec();
    sorted.sort_by(|a, b| {
        a.time
            .partial_cmp(&b.time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    build_particle_curve(|t| interp_keyframe(&sorted, t), samples)
}

/// Convert a baked scalar LUT back into keyframes — one per sample at
/// uniform times.  Inverse of [`particle_curve_from_keyframes`].
pub fn particle_curve_to_keyframes(lut: &[f32]) -> Vec<CurveKeyframe> {
    let n = lut.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![CurveKeyframe {
            time: 0.0,
            value: lut[0],
        }];
    }
    let mut keys = Vec::with_capacity(n);
    for (i, &value) in lut.iter().enumerate() {
        keys.push(CurveKeyframe {
            time: i as f32 / (n - 1) as f32,
            value,
        });
    }
    keys
}

/// Sample an interleaved RGB curve (`length N × 3`) at `t ∈ [0, 1]`,
/// writing the three channel values into `out[offset..offset+3]`.
/// Out-of-range `t` is clamped.
pub fn sample_particle_color_curve(lut: &[f32], t: f32, out: &mut [f32], offset: usize) {
    let n = lut.len() / 3;
    if n == 0 {
        out[offset] = 0.0;
        out[offset + 1] = 0.0;
        out[offset + 2] = 0.0;
        return;
    }
    if n == 1 {
        out[offset] = lut[0];
        out[offset + 1] = lut[1];
        out[offset + 2] = lut[2];
        return;
    }
    let clamped = clamp01(t);
    let x = clamped * (n - 1) as f32;
    let i = x as usize;
    if i >= n - 1 {
        let base = (n - 1) * 3;
        out[offset] = lut[base];
        out[offset + 1] = lut[base + 1];
        out[offset + 2] = lut[base + 2];
        return;
    }
    let frac = x - i as f32;
    let a = i * 3;
    let b = a + 3;
    out[offset] = lut[a] + (lut[b] - lut[a]) * frac;
    out[offset + 1] = lut[a + 1] + (lut[b + 1] - lut[a + 1]) * frac;
    out[offset + 2] = lut[a + 2] + (lut[b + 2] - lut[a + 2]) * frac;
}

/// Sample a uniformly-spaced scalar curve at `t ∈ [0, 1]` with linear
/// interpolation.  Out-of-range `t` is clamped.  Returns `0.0` for an empty
/// curve and the single value for a one-element curve.
pub fn sample_particle_curve(lut: &[f32], t: f32) -> f32 {
    let n = lut.len();
    if n == 0 {
        return 0.0;
    }
    if n == 1 {
        return lut[0];
    }
    let x = clamp01(t) * (n - 1) as f32;
    let i = x as usize;
    if i >= n - 1 {
        return lut[n - 1];
    }
    lut[i] + (lut[i + 1] - lut[i]) * (x - i as f32)
}

fn clamp01(t: f32) -> f32 {
    if t <= 0.0 {
        0.0
    } else if t >= 1.0 {
        1.0
    } else {
        t
    }
}

fn interp_keyframe(sorted: &[CurveKeyframe], t: f32) -> f32 {
    let times: Vec<f32> = sorted.iter().map(|k| k.time).collect();
    let (i, frac) = locate_keyframe(&times, t);
    if frac == 0.0 {
        sorted[i].value
    } else {
        let a = sorted[i].value;
        let b = sorted[i + 1].value;
        a + (b - a) * frac
    }
}

fn sorted_times_color(sorted: &[ColorKeyframe]) -> Vec<f32> {
    sorted.iter().map(|k| k.time).collect()
}

// Find the keyframe segment containing `t`: returns the lower index `i` and the
// fractional position `frac` into segment [i, i+1] (frac == 0 means "use times[i]
// exactly").
fn locate_keyframe(times: &[f32], t: f32) -> (usize, f32) {
    let n = times.len();
    if t <= times[0] {
        return (0, 0.0);
    }
    if t >= times[n - 1] {
        return (n - 1, 0.0);
    }
    for i in 0..n - 1 {
        let t0 = times[i];
        let t1 = times[i + 1];
        if t <= t1 {
            let span = t1 - t0;
            return (i, if span <= 0.0 { 0.0 } else { (t - t0) / span });
        }
    }
    (n - 1, 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_particle_color_curve_smoke() {
        let lut = build_particle_color_curve(|t| (t, 0.0, 1.0 - t), 3);
        assert_eq!(lut.len(), 9);
        assert_eq!(lut[0], 0.0);
        assert_eq!(lut[2], 1.0);
    }

    #[test]
    fn build_particle_curve_smoke() {
        let lut = build_particle_curve(|t| t * t, 5);
        assert_eq!(lut.len(), 5);
        assert_eq!(lut[0], 0.0);
        assert_eq!(lut[4], 1.0);
        assert!((sample_particle_curve(&lut, 0.5) - 0.25).abs() < 0.1);
    }

    #[test]
    fn particle_color_curve_from_keyframes_empty() {
        let lut = particle_color_curve_from_keyframes(&[], 33);
        let mut out = [9.0, 9.0, 9.0];
        sample_particle_color_curve(&lut, 0.5, &mut out, 0);
        assert_eq!(out, [0.0, 0.0, 0.0]);
    }

    #[test]
    fn particle_color_curve_from_keyframes_middle_stop() {
        let lut = particle_color_curve_from_keyframes(
            &[
                ColorKeyframe {
                    time: 0.0,
                    r: 1.0,
                    g: 0.0,
                    b: 0.0,
                },
                ColorKeyframe {
                    time: 0.5,
                    r: 0.0,
                    g: 1.0,
                    b: 0.0,
                },
                ColorKeyframe {
                    time: 1.0,
                    r: 0.0,
                    g: 0.0,
                    b: 1.0,
                },
            ],
            33,
        );
        let mut out = [0.0, 0.0, 0.0];
        sample_particle_color_curve(&lut, 0.5, &mut out, 0);
        assert!(out[1] > 0.8);
    }

    #[test]
    fn particle_color_curve_to_keyframes_smoke() {
        let keys = particle_color_curve_to_keyframes(&[1.0, 0.0, 0.0, 0.0, 0.0, 1.0]);
        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].time, 0.0);
        assert_eq!(keys[0].r, 1.0);
        assert_eq!(keys[1].time, 1.0);
        assert_eq!(keys[1].b, 1.0);
    }

    #[test]
    fn particle_color_curve_to_keyframes_edge_cases() {
        assert!(particle_color_curve_to_keyframes(&[]).is_empty());
        let single = particle_color_curve_to_keyframes(&[0.2, 0.4, 0.6]);
        assert_eq!(single.len(), 1);
        assert_eq!(single[0].r, 0.2);
        assert_eq!(single[0].g, 0.4);
        assert_eq!(single[0].b, 0.6);
    }

    #[test]
    fn particle_curve_from_keyframes_empty() {
        let lut = particle_curve_from_keyframes(&[], 33);
        assert_eq!(sample_particle_curve(&lut, 0.0), 0.0);
        assert_eq!(sample_particle_curve(&lut, 1.0), 0.0);
    }

    #[test]
    fn particle_curve_from_keyframes_unsorted_and_clamped() {
        let lut = particle_curve_from_keyframes(
            &[
                CurveKeyframe {
                    time: 1.0,
                    value: 10.0,
                },
                CurveKeyframe {
                    time: 0.0,
                    value: 0.0,
                },
            ],
            33,
        );
        assert!((sample_particle_curve(&lut, 0.0) - 0.0).abs() < 0.2);
        assert!((sample_particle_curve(&lut, 1.0) - 10.0).abs() < 0.2);

        let lut2 = particle_curve_from_keyframes(
            &[
                CurveKeyframe {
                    time: 0.25,
                    value: 2.0,
                },
                CurveKeyframe {
                    time: 0.75,
                    value: 6.0,
                },
            ],
            33,
        );
        assert!((sample_particle_curve(&lut2, 0.0) - 2.0).abs() < 0.2);
        assert!((sample_particle_curve(&lut2, 1.0) - 6.0).abs() < 0.2);
        assert!((sample_particle_curve(&lut2, 0.5) - 4.0).abs() < 0.2);
    }

    #[test]
    fn particle_curve_from_keyframes_single_constant() {
        let lut = particle_curve_from_keyframes(
            &[CurveKeyframe {
                time: 0.5,
                value: 3.0,
            }],
            33,
        );
        assert!((sample_particle_curve(&lut, 0.0) - 3.0).abs() < 1e-5);
        assert!((sample_particle_curve(&lut, 1.0) - 3.0).abs() < 1e-5);
    }

    #[test]
    fn particle_curve_to_keyframes_smoke() {
        let keys = particle_curve_to_keyframes(&[0.0, 0.5, 1.0]);
        assert_eq!(keys.len(), 3);
        assert_eq!(keys[0].time, 0.0);
        assert_eq!(keys[1].time, 0.5);
        assert_eq!(keys[1].value, 0.5);
        assert_eq!(keys[2].time, 1.0);
    }

    #[test]
    fn particle_curve_to_keyframes_edge_cases() {
        assert!(particle_curve_to_keyframes(&[]).is_empty());
        let single = particle_curve_to_keyframes(&[7.0]);
        assert_eq!(single.len(), 1);
        assert_eq!(single[0].value, 7.0);
    }

    #[test]
    fn sample_particle_color_curve_clamps() {
        let lut = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
        let mut out = [0.0, 0.0, 0.0];
        sample_particle_color_curve(&lut, 0.5, &mut out, 0);
        assert!((out[0] - 0.5).abs() < 1e-5);
        assert!((out[1] - 0.0).abs() < 1e-5);
        assert!((out[2] - 0.5).abs() < 1e-5);
        sample_particle_color_curve(&lut, -1.0, &mut out, 0);
        assert_eq!(out[0], 1.0);
        sample_particle_color_curve(&lut, 5.0, &mut out, 0);
        assert_eq!(out[2], 1.0);
    }

    #[test]
    fn sample_particle_color_curve_writes_at_offset() {
        let lut = [0.2, 0.4, 0.6];
        let mut out = [9.0, 9.0, 9.0, 9.0, 9.0];
        sample_particle_color_curve(&lut, 0.0, &mut out, 2);
        assert!((out[2] - 0.2).abs() < 1e-5);
        assert!((out[3] - 0.4).abs() < 1e-5);
        assert!((out[4] - 0.6).abs() < 1e-5);
    }

    #[test]
    fn sample_particle_curve_clamps() {
        let lut = [2.0, 4.0];
        assert_eq!(sample_particle_curve(&lut, -1.0), 2.0);
        assert_eq!(sample_particle_curve(&lut, 5.0), 4.0);
        assert!((sample_particle_curve(&lut, 0.5) - 3.0).abs() < 1e-5);
    }

    #[test]
    fn sample_particle_curve_edge_cases() {
        assert_eq!(sample_particle_curve(&[], 0.5), 0.0);
        assert_eq!(sample_particle_curve(&[7.0], 0.5), 7.0);
    }
}
