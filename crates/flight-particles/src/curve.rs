use crate::{ColorKeyframe, CurveKeyframe};

// ---------------------------------------------------------------------------
// Keyframe-segment helper (internal)
// ---------------------------------------------------------------------------

struct KeyframeSegment {
    i: usize,
    f: f32,
}

fn locate_keyframe_curve(sorted: &[CurveKeyframe], t: f32) -> KeyframeSegment {
    let n = sorted.len();
    if t <= sorted[0].time {
        return KeyframeSegment { i: 0, f: 0.0 };
    }
    if t >= sorted[n - 1].time {
        return KeyframeSegment { i: n - 1, f: 0.0 };
    }
    for i in 0..n - 1 {
        let t0 = sorted[i].time;
        let t1 = sorted[i + 1].time;
        if t <= t1 {
            let span = t1 - t0;
            return KeyframeSegment {
                i,
                f: if span <= 0.0 { 0.0 } else { (t - t0) / span },
            };
        }
    }
    return KeyframeSegment { i: n - 1, f: 0.0 };
}

fn locate_keyframe_color(sorted: &[ColorKeyframe], t: f32) -> KeyframeSegment {
    let n = sorted.len();
    if t <= sorted[0].time {
        return KeyframeSegment { i: 0, f: 0.0 };
    }
    if t >= sorted[n - 1].time {
        return KeyframeSegment { i: n - 1, f: 0.0 };
    }
    for i in 0..n - 1 {
        let t0 = sorted[i].time;
        let t1 = sorted[i + 1].time;
        if t <= t1 {
            let span = t1 - t0;
            return KeyframeSegment {
                i,
                f: if span <= 0.0 { 0.0 } else { (t - t0) / span },
            };
        }
    }
    return KeyframeSegment { i: n - 1, f: 0.0 };
}

fn interp_keyframe(sorted: &[CurveKeyframe], t: f32) -> f32 {
    let seg = locate_keyframe_curve(sorted, t);
    if seg.f == 0.0 {
        return sorted[seg.i].value;
    }
    let a = sorted[seg.i].value;
    let b = sorted[seg.i + 1].value;
    return a + (b - a) * seg.f;
}

// ---------------------------------------------------------------------------
// HSV conversion helpers (internal)
// ---------------------------------------------------------------------------

fn rgb_to_hsv(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;
    let mut h = 0.0f32;
    if delta > 0.0 {
        if max == r {
            h = ((g - b) / delta) % 6.0;
        } else if max == g {
            h = (b - r) / delta + 2.0;
        } else {
            h = (r - g) / delta + 4.0;
        }
        h /= 6.0;
        if h < 0.0 {
            h += 1.0;
        }
    }
    return (h, if max == 0.0 { 0.0 } else { delta / max }, max);
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (f32, f32, f32) {
    let c = v * s;
    let x = c * (1.0 - ((h * 6.0) % 2.0 - 1.0).abs());
    let m = v - c;
    let hi = (h * 6.0).floor() as i32 % 6;
    let (r, g, b) = match hi {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    return (r + m, g + m, b + m);
}

// ---------------------------------------------------------------------------
// Public API -- create/initialize first, then alphabetical
// ---------------------------------------------------------------------------

/// Bake an RGB function f:[0,1] -> [r,g,b] into an interleaved curve LUT (length N*3).
pub fn build_particle_color_curve(f: &dyn Fn(f32) -> [f32; 3], samples: i32) -> Vec<f32> {
    let n = 2i32.max(samples) as usize;
    let mut lut = vec![0.0f32; n * 3];
    for i in 0..n {
        let [r, g, b] = f(i as f32 / (n - 1) as f32);
        lut[i * 3] = r;
        lut[i * 3 + 1] = g;
        lut[i * 3 + 2] = b;
    }
    return lut;
}

/// Bake a scalar function f:[0,1] -> value into a `samples`-entry curve LUT.
pub fn build_particle_curve(f: &dyn Fn(f32) -> f32, samples: i32) -> Vec<f32> {
    let n = 2i32.max(samples) as usize;
    let mut lut = vec![0.0f32; n];
    for i in 0..n {
        lut[i] = f(i as f32 / (n - 1) as f32);
    }
    return lut;
}

/// Linearly interpolate two sRGB colors through HSV space, writing into `out[offset..+3]`.
pub fn lerp_hsv_direct(
    out: &mut [f32],
    offset: usize,
    r0: f32,
    g0: f32,
    b0: f32,
    r1: f32,
    g1: f32,
    b1: f32,
    t: f32,
) {
    let (h0, s0, v0) = rgb_to_hsv(r0, g0, b0);
    let (h1, s1, v1) = rgb_to_hsv(r1, g1, b1);
    let mut dh = h1 - h0;
    if dh > 0.5 {
        dh -= 1.0;
    } else if dh < -0.5 {
        dh += 1.0;
    }
    let (r, g, b) = hsv_to_rgb(h0 + dh * t, s0 + (s1 - s0) * t, v0 + (v1 - v0) * t);
    out[offset] = r;
    out[offset + 1] = g;
    out[offset + 2] = b;
}

/// Interpolate through HSV space using per-particle birth/death color arrays.
pub fn lerp_hsv_in_place(
    colors_out: &mut [f32],
    offset: usize,
    birth: &[f32],
    death: &[f32],
    t: f32,
) {
    lerp_hsv_direct(
        colors_out,
        offset,
        birth[offset],
        birth[offset + 1],
        birth[offset + 2],
        death[offset],
        death[offset + 1],
        death[offset + 2],
        t,
    );
}

/// Bake a piecewise-linear RGB timeline into a uniform interleaved LUT (length N*3).
pub fn particle_color_curve_from_keyframes(keys: &[ColorKeyframe], samples: i32) -> Vec<f32> {
    if keys.is_empty() {
        return vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    }
    let mut sorted: Vec<ColorKeyframe> = keys.to_vec();
    sorted.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    return build_particle_color_curve(
        &|t: f32| -> [f32; 3] {
            let seg = locate_keyframe_color(&sorted, t);
            if seg.f == 0.0 {
                return [sorted[seg.i].r, sorted[seg.i].g, sorted[seg.i].b];
            }
            let a = &sorted[seg.i];
            let b = &sorted[seg.i + 1];
            return [
                a.r + (b.r - a.r) * seg.f,
                a.g + (b.g - a.g) * seg.f,
                a.b + (b.b - a.b) * seg.f,
            ];
        },
        samples,
    );
}

/// Convert a baked interleaved RGB curve LUT (length N*3) back into color keyframes.
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
    return keys;
}

/// Bake a piecewise-linear scalar timeline into a uniform LUT.
pub fn particle_curve_from_keyframes(keys: &[CurveKeyframe], samples: i32) -> Vec<f32> {
    if keys.is_empty() {
        return vec![0.0, 0.0];
    }
    let mut sorted: Vec<CurveKeyframe> = keys.to_vec();
    sorted.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    return build_particle_curve(&|t: f32| -> f32 { interp_keyframe(&sorted, t) }, samples);
}

/// Convert a baked scalar curve LUT back into keyframes.
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
    for i in 0..n {
        keys.push(CurveKeyframe {
            time: i as f32 / (n - 1) as f32,
            value: lut[i],
        });
    }
    return keys;
}

/// Sample an interleaved RGB curve (length N*3) at t in [0,1], writing
/// the three channels into `out` starting at `offset`.
pub fn sample_particle_color_curve(out: &mut [f32], offset: usize, lut: &[f32], t: f32) {
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
    let clamped = if t <= 0.0 { 0.0 } else if t >= 1.0 { 1.0 } else { t };
    let x = clamped * (n - 1) as f32;
    let i = x as usize;
    if i >= n - 1 {
        let base = (n - 1) * 3;
        out[offset] = lut[base];
        out[offset + 1] = lut[base + 1];
        out[offset + 2] = lut[base + 2];
        return;
    }
    let f = x - i as f32;
    let a = i * 3;
    let b = a + 3;
    out[offset] = lut[a] + (lut[b] - lut[a]) * f;
    out[offset + 1] = lut[a + 1] + (lut[b + 1] - lut[a + 1]) * f;
    out[offset + 2] = lut[a + 2] + (lut[b + 2] - lut[a + 2]) * f;
}

/// Sample a uniformly-spaced scalar curve at t in [0,1] with linear interpolation.
pub fn sample_particle_curve(lut: &[f32], t: f32) -> f32 {
    let n = lut.len();
    if n == 0 {
        return 0.0;
    }
    if n == 1 {
        return lut[0];
    }
    let clamped = if t <= 0.0 { 0.0 } else if t >= 1.0 { 1.0 } else { t };
    let x = clamped * (n - 1) as f32;
    let i = x as usize;
    if i >= n - 1 {
        return lut[n - 1];
    }
    return lut[i] + (lut[i + 1] - lut[i]) * (x - i as f32);
}
