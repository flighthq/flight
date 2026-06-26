use flighthq_types::{AnimationInterpolation, AnimationTrack, EasingFunction};

// Options for creating an AnimationTrack. `times` must be ascending; `values` is the flat keyframe
// buffer (`components` numbers per keyframe for step/linear, 3 * `components` for cubic). Defaults:
// linear interpolation, 1 component, non-quaternion, no easing.
pub struct AnimationTrackOpts {
    pub components: Option<u32>,
    pub easing: Option<EasingFunction>,
    pub interpolation: Option<AnimationInterpolation>,
    pub quaternion: Option<bool>,
    pub times: Vec<f32>,
    pub values: Vec<f32>,
}

// Allocates an AnimationTrack from the given options.
pub fn create_animation_track(opts: AnimationTrackOpts) -> AnimationTrack {
    AnimationTrack {
        components: opts.components.unwrap_or(1),
        easing: opts.easing,
        interpolation: opts.interpolation.unwrap_or(AnimationInterpolation::Linear),
        quaternion: opts.quaternion.unwrap_or(false),
        times: opts.times,
        values: opts.values,
    }
}

// Samples `track` at time `t`, writing `track.components` numbers into `out`. `t` is clamped to the
// track's time range (before the first keyframe yields the first value; after the last yields the
// last). Step holds the previous keyframe; Linear interpolates component-wise (or slerps a quaternion
// track); Cubic is a glTF-style Hermite spline over the per-keyframe in/out tangents. A non-null
// `track.easing` reshapes the per-segment alpha first. Alloc-free; safe for hot loops.
pub fn sample_animation_track(out: &mut [f32], track: &AnimationTrack, t: f32) {
    let components = track.components as usize;
    let count = track.times.len();
    if count == 0 {
        for c in 0..components {
            out[c] = 0.0;
        }
        return;
    }
    if count == 1 || t <= track.times[0] {
        copy_keyframe_value(out, track, 0);
        return;
    }
    if t >= track.times[count - 1] {
        copy_keyframe_value(out, track, count - 1);
        return;
    }

    // Locate the segment [i, i+1] containing t (times are ascending; t is strictly inside the range).
    let mut i = 0;
    while i < count - 1 && track.times[i + 1] <= t {
        i += 1;
    }
    let t0 = track.times[i];
    let dt = track.times[i + 1] - t0;
    let mut alpha = if dt > 0.0 { (t - t0) / dt } else { 0.0 };
    if let Some(easing) = &track.easing {
        alpha = easing(alpha);
    }

    if matches!(track.interpolation, AnimationInterpolation::Step) {
        copy_keyframe_value(out, track, i);
        return;
    }
    if matches!(track.interpolation, AnimationInterpolation::Cubic) {
        sample_cubic_segment(out, track, i, alpha, dt);
        return;
    }

    // Linear.
    let oi = keyframe_value_offset(track, i);
    let oj = keyframe_value_offset(track, i + 1);
    if track.quaternion && components == 4 {
        slerp_flat_quaternion(out, &track.values, oi, oj, alpha);
        return;
    }
    for c in 0..components {
        let a = track.values[oi + c];
        out[c] = a + (track.values[oj + c] - a) * alpha;
    }
}

// Byte width of one keyframe block in the flat value buffer (cubic stores in/out tangents alongside
// the value, so 3x).
fn keyframe_stride(track: &AnimationTrack) -> usize {
    let components = track.components as usize;
    if matches!(track.interpolation, AnimationInterpolation::Cubic) {
        components * 3
    } else {
        components
    }
}

// Offset of keyframe `k`'s VALUE within the flat buffer (the middle slot for cubic, where the layout
// is [inTangent, value, outTangent]).
fn keyframe_value_offset(track: &AnimationTrack, k: usize) -> usize {
    let components = track.components as usize;
    let stride = keyframe_stride(track);
    if matches!(track.interpolation, AnimationInterpolation::Cubic) {
        k * stride + components
    } else {
        k * stride
    }
}

fn copy_keyframe_value(out: &mut [f32], track: &AnimationTrack, k: usize) {
    let components = track.components as usize;
    let off = keyframe_value_offset(track, k);
    for c in 0..components {
        out[c] = track.values[off + c];
    }
}

// glTF cubic-spline (Hermite) interpolation of segment [i, i+1] at `alpha`, with `dt` the segment
// duration (tangents are derivatives, scaled by dt). Quaternion tracks are interpolated component-wise
// then renormalized.
fn sample_cubic_segment(out: &mut [f32], track: &AnimationTrack, i: usize, alpha: f32, dt: f32) {
    let components = track.components as usize;
    let stride = components * 3;
    let a2 = alpha * alpha;
    let a3 = a2 * alpha;
    let h00 = 2.0 * a3 - 3.0 * a2 + 1.0;
    let h10 = a3 - 2.0 * a2 + alpha;
    let h01 = -2.0 * a3 + 3.0 * a2;
    let h11 = a3 - a2;
    let base0 = i * stride;
    let base1 = (i + 1) * stride;
    for c in 0..components {
        // Per-keyframe layout: [inTangent(0..components), value(components..2*components), outTangent(2*components..3*components)].
        let p0 = track.values[base0 + components + c]; // value at i
        let m0 = track.values[base0 + components * 2 + c]; // out-tangent at i
        let p1 = track.values[base1 + components + c]; // value at i+1
        let m1 = track.values[base1 + c]; // in-tangent at i+1
        out[c] = h00 * p0 + h10 * dt * m0 + h01 * p1 + h11 * dt * m1;
    }
    if track.quaternion && components == 4 {
        normalize_flat_quaternion(out);
    }
}

// Spherical-linear interpolation of two unit quaternions stored flat at `oa`/`ob` in `values`, written
// to `out[0..3]`. Picks the shorter arc; falls back to normalized-lerp for nearly-parallel quaternions.
fn slerp_flat_quaternion(out: &mut [f32], values: &[f32], oa: usize, ob: usize, alpha: f32) {
    let ax = values[oa];
    let ay = values[oa + 1];
    let az = values[oa + 2];
    let aw = values[oa + 3];
    let mut bx = values[ob];
    let mut by = values[ob + 1];
    let mut bz = values[ob + 2];
    let mut bw = values[ob + 3];
    let mut cosom = ax * bx + ay * by + az * bz + aw * bw;
    if cosom < 0.0 {
        cosom = -cosom;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }
    let scale0;
    let scale1;
    if 1.0 - cosom > 1e-6 {
        let omega = cosom.acos();
        let sinom = omega.sin();
        scale0 = ((1.0 - alpha) * omega).sin() / sinom;
        scale1 = (alpha * omega).sin() / sinom;
    } else {
        scale0 = 1.0 - alpha;
        scale1 = alpha;
    }
    out[0] = scale0 * ax + scale1 * bx;
    out[1] = scale0 * ay + scale1 * by;
    out[2] = scale0 * az + scale1 * bz;
    out[3] = scale0 * aw + scale1 * bw;
}

fn normalize_flat_quaternion(out: &mut [f32]) {
    let x = out[0];
    let y = out[1];
    let z = out[2];
    let w = out[3];
    let len = (x * x + y * y + z * z + w * w).sqrt();
    if len > 0.0 {
        let inv = 1.0 / len;
        out[0] = x * inv;
        out[1] = y * inv;
        out[2] = z * inv;
        out[3] = w * inv;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;
    use std::sync::Arc;

    const EPSILON: f32 = 1e-5;

    fn assert_approx(a: f32, b: f32) {
        assert!((a - b).abs() < EPSILON, "expected {b} but got {a}");
    }

    #[test]
    fn create_animation_track_fills_defaults() {
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 1.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
        });
        assert!(matches!(
            track.interpolation,
            AnimationInterpolation::Linear
        ));
        assert_eq!(track.components, 1);
        assert!(!track.quaternion);
        assert!(track.easing.is_none());
    }

    #[test]
    fn sample_animation_track_applies_easing_to_alpha() {
        // Easing that always returns 0 forces the first keyframe value regardless of t.
        let easing: EasingFunction = Arc::new(|_: f32| 0.0_f32);
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 10.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: Some(easing),
        });
        let mut out = vec![0.0f32; 1];
        sample_animation_track(&mut out, &track, 0.75);
        assert_approx(out[0], 0.0);
    }

    #[test]
    fn sample_animation_track_clamps_before_first_and_after_last() {
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![1.0, 2.0],
            values: vec![3.0, 9.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
        });
        let mut out = vec![0.0f32; 1];
        sample_animation_track(&mut out, &track, -5.0);
        assert_approx(out[0], 3.0);
        sample_animation_track(&mut out, &track, 99.0);
        assert_approx(out[0], 9.0);
    }

    #[test]
    fn sample_animation_track_cubic_splines_to_midpoint_with_zero_tangents() {
        // Per-keyframe layout [inTangent, value, outTangent]; zero tangents -> smoothstep, 0.5 -> midpoint.
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 0.0, 0.0, 0.0, 10.0, 0.0],
            components: None,
            interpolation: Some(AnimationInterpolation::Cubic),
            quaternion: None,
            easing: None,
        });
        let mut out = vec![0.0f32; 1];
        sample_animation_track(&mut out, &track, 0.5);
        assert_approx(out[0], 5.0);
    }

    #[test]
    fn sample_animation_track_empty_track_writes_zeros() {
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![],
            values: vec![],
            components: Some(2),
            interpolation: None,
            quaternion: None,
            easing: None,
        });
        let mut out = vec![99.0f32; 2];
        sample_animation_track(&mut out, &track, 0.5);
        assert_approx(out[0], 0.0);
        assert_approx(out[1], 0.0);
    }

    #[test]
    fn sample_animation_track_holds_previous_keyframe_for_step() {
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 10.0],
            components: None,
            interpolation: Some(AnimationInterpolation::Step),
            quaternion: None,
            easing: None,
        });
        let mut out = vec![0.0f32; 1];
        sample_animation_track(&mut out, &track, 0.9);
        assert_approx(out[0], 0.0);
    }

    #[test]
    fn sample_animation_track_interpolates_vector3_component_wise() {
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 0.0, 0.0, 2.0, 4.0, 6.0],
            components: Some(3),
            interpolation: None,
            quaternion: None,
            easing: None,
        });
        let mut out = vec![0.0f32; 3];
        sample_animation_track(&mut out, &track, 0.5);
        assert_approx(out[0], 1.0);
        assert_approx(out[1], 2.0);
        assert_approx(out[2], 3.0);
    }

    #[test]
    fn sample_animation_track_linearly_interpolates_scalar_mid_segment() {
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 10.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
        });
        let mut out = vec![0.0f32; 1];
        sample_animation_track(&mut out, &track, 0.5);
        assert_approx(out[0], 5.0);
    }

    #[test]
    fn sample_animation_track_slerps_quaternion_to_half_angle() {
        // identity -> 90deg about +Z; midpoint is 45deg about +Z.
        let s = (PI / 4.0).sin();
        let c = (PI / 4.0).cos();
        let track = create_animation_track(AnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, s, c],
            components: Some(4),
            interpolation: None,
            quaternion: Some(true),
            easing: None,
        });
        let mut out = vec![0.0f32; 4];
        sample_animation_track(&mut out, &track, 0.5);
        assert_approx(out[2], (PI / 8.0).sin());
        assert_approx(out[3], (PI / 8.0).cos());
        let len = (out[0] * out[0] + out[1] * out[1] + out[2] * out[2] + out[3] * out[3]).sqrt();
        assert_approx(len, 1.0);
    }
}
