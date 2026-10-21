use flight_entity::Ref;

use crate::animation_track::sample_animation_track;
use crate::types::*;

pub fn create_animation_root_motion_extractor(
    clip: &Ref<AnimationClip>,
    channel_index: usize,
) -> AnimationRootMotionExtractor {
    let mut extractor = AnimationRootMotionExtractor::default();
    initialize_animation_root_motion_extractor(&mut extractor, clip, channel_index);
    return extractor;
}

pub fn extract_animation_root_motion(
    out: &mut [f32],
    extractor: &mut AnimationRootMotionExtractor,
    start_time: f32,
    end_time: f32,
) -> bool {
    if !start_time.is_finite() || !end_time.is_finite() {
        panic!("AnimationRootMotionExtractor time range must contain only finite numbers.");
    }
    let components = extractor.channel.track.components;
    if out.len() < components {
        return false;
    }
    compute_animation_root_motion_at_from(extractor, start_time);
    compute_animation_root_motion_at_to(extractor, end_time);
    let from_motion = extractor.from_motion.clone();
    let to_motion = extractor.to_motion.clone();
    write_animation_root_motion_delta(
        out,
        &from_motion,
        &to_motion,
        extractor.channel.track.quaternion,
    );
    return true;
}

pub fn initialize_animation_root_motion_extractor(
    extractor: &mut AnimationRootMotionExtractor,
    clip: &Ref<AnimationClip>,
    channel_index: usize,
) {
    let clip_data = clip.read().unwrap();
    if channel_index >= clip_data.channels.len() {
        panic!(
            "AnimationRootMotionExtractor channel index {} does not exist.",
            channel_index
        );
    }
    let channel = &clip_data.channels[channel_index];
    let width = channel.track.components;
    if channel.track.quaternion && width != 4 {
        panic!("AnimationRootMotionExtractor quaternion channel must have four components.");
    }
    extractor.channel = channel.clone();
    extractor.channel_index = channel_index;
    extractor.clip = clip.clone();
    extractor.cycle_delta = vec![0.0; width];
    extractor.from_motion = vec![0.0; width];
    extractor.from_sample = vec![0.0; width];
    extractor.power_scratch = vec![0.0; width];
    extractor.start_sample = vec![0.0; width];
    extractor.to_motion = vec![0.0; width];
    extractor.to_sample = vec![0.0; width];
    sample_animation_track(&mut extractor.start_sample, &channel.track, 0.0);
    let duration = clip_data.duration;
    sample_animation_track(&mut extractor.to_sample, &channel.track, duration);
    let start_copy = extractor.start_sample.clone();
    let end_copy = extractor.to_sample.clone();
    write_animation_root_motion_delta(
        &mut extractor.cycle_delta,
        &start_copy,
        &end_copy,
        channel.track.quaternion,
    );
}

fn multiply_animation_root_motion_quaternion(out: &mut [f32], a: &[f32], b: &[f32]) {
    let ax = a[0];
    let ay = a[1];
    let az = a[2];
    let aw = a[3];
    let bx = b[0];
    let by = b[1];
    let bz = b[2];
    let bw = b[3];
    write_normalized_animation_root_motion_quaternion(
        out,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    );
}

fn compute_animation_root_motion_at_from(extractor: &mut AnimationRootMotionExtractor, time: f32) {
    let duration = extractor.clip.read().unwrap().duration;
    let track = &extractor.channel.track.clone();
    if !(duration > 0.0) {
        write_animation_root_motion_identity(
            &mut extractor.from_motion,
            track.components,
            track.quaternion,
        );
        return;
    }
    let cycle = (time / duration).floor() as i32;
    let local_time = time - (cycle as f32) * duration;
    sample_animation_track(&mut extractor.from_sample, track, local_time);

    if track.quaternion {
        write_animation_root_motion_quaternion_power(
            &mut extractor.from_motion,
            &extractor.cycle_delta.clone(),
            cycle,
        );
        let start_copy = extractor.start_sample.clone();
        let sample_copy = extractor.from_sample.clone();
        let mut partial = vec![0.0f32; 4];
        write_animation_root_motion_delta(&mut partial, &start_copy, &sample_copy, true);
        let motion_copy = extractor.from_motion.clone();
        multiply_animation_root_motion_quaternion(
            &mut extractor.from_motion,
            &motion_copy,
            &partial,
        );
        return;
    }
    for component in 0..track.components {
        extractor.from_motion[component] = extractor.from_sample[component]
            - extractor.start_sample[component]
            + extractor.cycle_delta[component] * (cycle as f32);
    }
}

fn compute_animation_root_motion_at_to(extractor: &mut AnimationRootMotionExtractor, time: f32) {
    let duration = extractor.clip.read().unwrap().duration;
    let track = &extractor.channel.track.clone();
    if !(duration > 0.0) {
        write_animation_root_motion_identity(
            &mut extractor.to_motion,
            track.components,
            track.quaternion,
        );
        return;
    }
    let cycle = (time / duration).floor() as i32;
    let local_time = time - (cycle as f32) * duration;
    sample_animation_track(&mut extractor.to_sample, track, local_time);

    if track.quaternion {
        write_animation_root_motion_quaternion_power(
            &mut extractor.to_motion,
            &extractor.cycle_delta.clone(),
            cycle,
        );
        let start_copy = extractor.start_sample.clone();
        let sample_copy = extractor.to_sample.clone();
        let mut partial = vec![0.0f32; 4];
        write_animation_root_motion_delta(&mut partial, &start_copy, &sample_copy, true);
        let motion_copy = extractor.to_motion.clone();
        multiply_animation_root_motion_quaternion(
            &mut extractor.to_motion,
            &motion_copy,
            &partial,
        );
        return;
    }
    for component in 0..track.components {
        extractor.to_motion[component] = extractor.to_sample[component]
            - extractor.start_sample[component]
            + extractor.cycle_delta[component] * (cycle as f32);
    }
}

fn write_animation_root_motion_delta(
    out: &mut [f32],
    from: &[f32],
    to: &[f32],
    quaternion: bool,
) {
    if !quaternion {
        let width = out.len().min(from.len()).min(to.len());
        for component in 0..width {
            out[component] = to[component] - from[component];
        }
        return;
    }
    write_normalized_animation_root_motion_quaternion(
        out,
        from[3] * to[0] - from[0] * to[3] - from[1] * to[2] + from[2] * to[1],
        from[3] * to[1] + from[0] * to[2] - from[1] * to[3] - from[2] * to[0],
        from[3] * to[2] - from[0] * to[1] + from[1] * to[0] - from[2] * to[3],
        from[3] * to[3] + from[0] * to[0] + from[1] * to[1] + from[2] * to[2],
    );
}

fn write_animation_root_motion_identity(out: &mut [f32], components: usize, quaternion: bool) {
    let width = out.len().min(components);
    for component in 0..width {
        out[component] = 0.0;
    }
    if quaternion && width >= 4 {
        out[3] = 1.0;
    }
}

fn write_animation_root_motion_quaternion_power(
    out: &mut [f32],
    cycle_delta: &[f32],
    exponent: i32,
) {
    write_animation_root_motion_identity(out, 4, true);
    if exponent == 0 {
        return;
    }
    let mut base = vec![0.0f32; 4];
    if exponent > 0 {
        base[..4].copy_from_slice(&cycle_delta[..4]);
    } else {
        base[0] = -cycle_delta[0];
        base[1] = -cycle_delta[1];
        base[2] = -cycle_delta[2];
        base[3] = cycle_delta[3];
    }
    let mut remaining = exponent.unsigned_abs();
    while remaining > 0 {
        if remaining % 2 == 1 {
            let out_copy = out[..4].to_vec();
            multiply_animation_root_motion_quaternion(out, &out_copy, &base);
        }
        remaining /= 2;
        if remaining > 0 {
            let base_copy = base.clone();
            multiply_animation_root_motion_quaternion(&mut base, &base_copy, &base_copy);
        }
    }
}

fn write_normalized_animation_root_motion_quaternion(
    out: &mut [f32],
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) {
    let length = (x * x + y * y + z * z + w * w).sqrt();
    if !(length > 0.0) {
        write_animation_root_motion_identity(out, 4, true);
        return;
    }
    let inverse_length = 1.0 / length;
    out[0] = x * inverse_length;
    out[1] = y * inverse_length;
    out[2] = z * inverse_length;
    out[3] = w * inverse_length;
}
