use crate::types::*;
use flight_entity::Ref;

#[derive(Clone)]
struct AnimationTrackSamplePoint {
    alpha: f32,
    dt: f32,
    easing: Option<EasingFn>,
    index: usize,
}

enum AnimationTrackSamplePosition {
    Empty,
    Keyframe(usize),
    Segment(AnimationTrackSamplePoint),
}

/// Creates an empty linear track (TS `createAnimationTrack`); times, values and the keyframe
/// layout are assigned after creation (D23 B).
// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign the track fields after create
pub fn create_animation_track() -> AnimationTrack {
    let mut out = AnimationTrack::default();
    initialize_animation_track(&mut out);
    return out;
}

/// Constructs a track's fields in place (TS `initializeAnimationTrack`): one component per
/// keyframe, linear interpolation, no quaternion, no easing, and no keyframes.
// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f)
pub fn initialize_animation_track(out: &mut AnimationTrack) {
    out.components = 1;
    out.easing = None;
    out.interpolation = AnimationInterpolation::Linear;
    out.quaternion = false;
    out.segment_easings = None;
    out.times = Vec::new();
    out.values = Vec::new();
}

pub fn clone_animation_track(track: &AnimationTrack) -> AnimationTrack {
    let mut out = AnimationTrack::default();
    out.components = track.components;
    out.easing = track.easing.clone();
    out.interpolation = track.interpolation;
    out.quaternion = track.quaternion;
    out.segment_easings = track.segment_easings.clone();
    out.times = track.times.clone();
    out.values = track.values.clone();
    return out;
}

fn copy_keyframe_value(out: &mut [f32], track: &AnimationTrack, k: usize) {
    let off = keyframe_value_offset(track, k);
    for c in 0..track.components {
        out[c] = track.values[off + c];
    }
}

fn find_animation_track_sample_position(
    track: &AnimationTrack,
    time: f32,
) -> AnimationTrackSamplePosition {
    let times = &track.times;
    let count = times.len();
    if count == 0 {
        return AnimationTrackSamplePosition::Empty;
    }
    if count == 1 || time <= times[0] {
        return AnimationTrackSamplePosition::Keyframe(0);
    }
    if time >= times[count - 1] {
        return AnimationTrackSamplePosition::Keyframe(count - 1);
    }

    let mut lo: usize = 0;
    let mut hi: usize = count - 1;
    while lo < hi {
        let mid = (lo + hi + 1) >> 1;
        if times[mid] <= time {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    let index = lo;
    let t0 = times[index];
    let dt = times[index + 1] - t0;
    let alpha = if dt > 0.0 { (time - t0) / dt } else { 0.0 };
    let easing = track
        .segment_easings
        .as_ref()
        .and_then(|segment_easings| segment_easings.get(index).cloned().flatten())
        .or_else(|| track.easing.clone());
    return AnimationTrackSamplePosition::Segment(AnimationTrackSamplePoint {
        alpha,
        dt,
        easing,
        index,
    });
}

fn keyframe_stride(track: &AnimationTrack) -> usize {
    if track.interpolation == AnimationInterpolation::Cubic {
        return track.components * 3;
    }
    return track.components;
}

fn keyframe_value_offset(track: &AnimationTrack, k: usize) -> usize {
    let stride = keyframe_stride(track);
    if track.interpolation == AnimationInterpolation::Cubic {
        return k * stride + track.components;
    }
    return k * stride;
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

fn same_animation_track_sample_point(
    a: &AnimationTrackSamplePoint,
    b: &AnimationTrackSamplePoint,
) -> bool {
    let same_easing = match (&a.easing, &b.easing) {
        (None, None) => true,
        (Some(a), Some(b)) => std::sync::Arc::ptr_eq(a, b),
        _ => false,
    };
    return a.alpha.to_bits() == b.alpha.to_bits()
        && a.dt.to_bits() == b.dt.to_bits()
        && a.index == b.index
        && same_easing;
}

pub fn sample_animation_track(out: &mut [f32], track: &AnimationTrack, t: f32) {
    sample_animation_track_value(out, track, t);
}

fn sample_animation_track_at_position(
    out: &mut [f32],
    track: &AnimationTrack,
    position: AnimationTrackSamplePosition,
) {
    let components = track.components;
    let values = &track.values;
    let AnimationTrackSamplePosition::Segment(point) = position else {
        match position {
            AnimationTrackSamplePosition::Empty => {
                for c in 0..components {
                    out[c] = 0.0;
                }
            }
            AnimationTrackSamplePosition::Keyframe(keyframe) => {
                copy_keyframe_value(out, track, keyframe);
            }
            AnimationTrackSamplePosition::Segment(_) => unreachable!(),
        }
        return;
    };
    let index = point.index;
    let alpha = point.alpha;

    if track.interpolation == AnimationInterpolation::Step {
        copy_keyframe_value(out, track, index);
        return;
    }
    if track.interpolation == AnimationInterpolation::Cubic {
        sample_cubic_segment(out, track, index, alpha, point.dt);
        return;
    }

    // Linear.
    let oi = keyframe_value_offset(track, index);
    let oj = keyframe_value_offset(track, index + 1);
    if track.quaternion && components == 4 {
        slerp_flat_quaternion(out, values, oi, oj, alpha);
        return;
    }
    for c in 0..components {
        let a = values[oi + c];
        out[c] = a + (values[oj + c] - a) * alpha;
    }
}

/// Samples an owning track handle without retaining its read guard across easing callbacks. The
/// position is revalidated after easing, so a callback may safely mutate the original track (Rust
/// contract-only counterpart to the TS value sampler used by Ref-owning D16 consumers).
// flight-lint: allow(conform-extra) D16 Ref-owning consumers need a guard-safe sampler; TS object reads do not hold a lock
pub fn sample_animation_track_ref(out: &mut [f32], track_ref: &Ref<AnimationTrack>, t: f32) {
    loop {
        let track = track_ref.read().unwrap();
        let position = find_animation_track_sample_position(&track, t);
        let AnimationTrackSamplePosition::Segment(ref point) = position else {
            sample_animation_track_at_position(out, &track, position);
            return;
        };
        let Some(ref easing) = point.easing else {
            sample_animation_track_at_position(out, &track, position);
            return;
        };
        drop(track);

        let eased_alpha = easing(point.alpha);

        let track = track_ref.read().unwrap();
        let AnimationTrackSamplePosition::Segment(current_point) =
            find_animation_track_sample_position(&track, t)
        else {
            drop(track);
            continue;
        };
        if !same_animation_track_sample_point(point, &current_point) {
            drop(track);
            continue;
        }
        sample_animation_track_at_position(
            out,
            &track,
            AnimationTrackSamplePosition::Segment(AnimationTrackSamplePoint {
                alpha: eased_alpha,
                ..current_point
            }),
        );
        return;
    }
}

pub(crate) fn sample_animation_track_value(out: &mut [f32], track: &AnimationTrack, t: f32) {
    let mut position = find_animation_track_sample_position(track, t);
    if let AnimationTrackSamplePosition::Segment(ref mut point) = position {
        if let Some(ref easing) = point.easing {
            point.alpha = easing(point.alpha);
        }
    }
    sample_animation_track_at_position(out, track, position);
}

fn sample_cubic_segment(out: &mut [f32], track: &AnimationTrack, i: usize, alpha: f32, dt: f32) {
    let components = track.components;
    let values = &track.values;
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
        let p0 = values[base0 + components + c]; // value at i
        let m0 = values[base0 + components * 2 + c]; // out-tangent at i
        let p1 = values[base1 + components + c]; // value at i+1
        let m1 = values[base1 + c]; // in-tangent at i+1
        out[c] = h00 * p0 + h10 * dt * m0 + h01 * p1 + h11 * dt * m1;
    }
    if track.quaternion && components == 4 {
        normalize_flat_quaternion(out);
    }
}

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
    let scale0: f32;
    let scale1: f32;
    if 1.0 - cosom > 1e-6 {
        let omega = cosom.min(1.0).acos();
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

pub fn trim_animation_track(
    track: &AnimationTrack,
    start_time: f32,
    end_time: f32,
) -> AnimationTrack {
    let components = track.components;
    let times = &track.times;
    let count = times.len();
    let stride = keyframe_stride(track);
    let mut out_times: Vec<f32> = Vec::new();
    let mut out_values: Vec<f32> = Vec::new();
    let mut source_keyframes: Vec<usize> = Vec::new();

    for k in 0..count {
        let time = times[k];
        if time < start_time || time > end_time {
            continue;
        }
        out_times.push(time - start_time);
        source_keyframes.push(k);
        let off = k * stride;
        for c in 0..stride {
            out_values.push(track.values[off + c]);
        }
    }

    let segment_easings = if track.segment_easings.is_none() || source_keyframes.len() < 2 {
        if track.segment_easings.is_none() {
            None
        } else {
            Some(Vec::new())
        }
    } else {
        let se = track.segment_easings.as_ref().unwrap();
        let start = source_keyframes[0];
        let end = source_keyframes[source_keyframes.len() - 1];
        Some(se[start..end].to_vec())
    };

    let mut out = AnimationTrack::default();
    out.components = components;
    out.easing = track.easing.clone();
    out.interpolation = track.interpolation;
    out.quaternion = track.quaternion;
    out.segment_easings = segment_easings;
    out.times = out_times;
    out.values = out_values;
    return out;
}

/// Writes the track's validation diagnostics into `out`, cleared first, in the source's order (TS
/// `validateAnimationTrack`). Returns whether any were found: the source returns the diagnostics,
/// or `null` for a valid track.
// flight-lint: allow(conform-params) D24 (Principal 3139d09f): required first caller-owned diagnostics out, cleared then filled; the bool keeps the source's null-for-valid meaning
pub fn validate_animation_track(
    out: &mut Vec<AnimationTrackValidationDiagnostic>,
    track: &AnimationTrack,
) -> bool {
    out.clear();
    let diagnostics = out;
    let times = &track.times;
    let values = &track.values;
    let count = times.len();

    for k in 1..count {
        if times[k] <= times[k - 1] {
            diagnostics.push(AnimationTrackValidationDiagnostic {
                code: "nonAscendingTimes".to_string(),
                index: Some(k),
                message: format!(
                    "times[{}] ({}) is not greater than times[{}] ({}); times must be strictly ascending.",
                    k, times[k], k - 1, times[k - 1]
                ),
            });
        }
    }

    let expected = count * keyframe_stride(track);
    if values.len() != expected {
        diagnostics.push(AnimationTrackValidationDiagnostic {
            code: "valuesLengthMismatch".to_string(),
            index: None,
            message: format!(
                "values.length ({}) must equal keyCount * componentsPerKeyframe ({}).",
                values.len(),
                expected
            ),
        });
    }

    let expected_easings = if count > 1 { count - 1 } else { 0 };
    if let Some(ref se) = track.segment_easings {
        if se.len() != expected_easings {
            diagnostics.push(AnimationTrackValidationDiagnostic {
                code: "segmentEasingsLengthMismatch".to_string(),
                index: None,
                message: format!(
                    "segmentEasings.length ({}) must equal keyCount - 1 ({}).",
                    se.len(),
                    expected_easings
                ),
            });
        }
    }

    return !diagnostics.is_empty();
}
