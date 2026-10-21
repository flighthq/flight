use crate::types::*;

pub fn create_animation_sample_accumulator(
    components: usize,
    quaternion: bool,
) -> AnimationSampleAccumulator {
    let mut out = AnimationSampleAccumulator::default();
    initialize_animation_sample_accumulator(&mut out, components, quaternion);
    return out;
}

pub fn initialize_animation_sample_accumulator(
    out: &mut AnimationSampleAccumulator,
    width: usize,
    quaternion: bool,
) {
    out.components = width;
    out.quaternion = quaternion;
    out.values = vec![0.0; width];
    out.weight = 0.0;
}

pub fn accumulate_animation_sample(
    accumulator: &mut AnimationSampleAccumulator,
    sample: &[f32],
    weight: f32,
) {
    if !(weight > 0.0) {
        return;
    }
    let components = accumulator
        .components
        .min(accumulator.values.len())
        .min(sample.len());
    let mut sign: f32 = 1.0;
    if accumulator.quaternion && components >= 4 && accumulator.weight > 0.0 {
        let values = &accumulator.values;
        let dot =
            values[0] * sample[0] + values[1] * sample[1] + values[2] * sample[2] + values[3] * sample[3];
        if dot < 0.0 {
            sign = -1.0;
        }
    }
    for component in 0..components {
        accumulator.values[component] += sample[component] * weight * sign;
    }
    accumulator.weight += weight;
}

pub fn add_animation_sample(
    out: &mut [f32],
    base: &[f32],
    delta: &[f32],
    weight: f32,
    quaternion: bool,
) {
    if quaternion && out.len() >= 4 && base.len() >= 4 && delta.len() >= 4 {
        let mut q = [0.0f32; 4];
        write_weighted_quaternion(&mut q, delta, weight);
        let ax = base[0];
        let ay = base[1];
        let az = base[2];
        let aw = base[3];
        let bx = q[0];
        let by = q[1];
        let bz = q[2];
        let bw = q[3];
        write_normalized_quaternion(
            out,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        );
        return;
    }

    let components = out.len().min(base.len()).min(delta.len());
    for component in 0..components {
        out[component] = base[component] + delta[component] * weight;
    }
}

pub fn blend_animation_samples(
    out: &mut [f32],
    a: &[f32],
    b: &[f32],
    alpha: f32,
    quaternion: bool,
) {
    let t = if alpha < 0.0 {
        0.0
    } else if alpha > 1.0 {
        1.0
    } else {
        alpha
    };
    if quaternion && out.len() >= 4 && a.len() >= 4 && b.len() >= 4 {
        slerp_quaternion(out, a, b, t);
        return;
    }
    let components = out.len().min(a.len()).min(b.len());
    for component in 0..components {
        out[component] = a[component] + (b[component] - a[component]) * t;
    }
}

pub fn finish_animation_sample(
    out: &mut [f32],
    accumulator: &AnimationSampleAccumulator,
) -> bool {
    if !(accumulator.weight > 0.0) {
        return false;
    }
    let components = out
        .len()
        .min(accumulator.components)
        .min(accumulator.values.len());
    if accumulator.quaternion && components >= 4 {
        let values = &accumulator.values;
        write_normalized_quaternion(out, values[0], values[1], values[2], values[3]);
        return true;
    }
    let inverse_weight = 1.0 / accumulator.weight;
    for component in 0..components {
        out[component] = accumulator.values[component] * inverse_weight;
    }
    return true;
}

pub fn reset_animation_sample_accumulator(accumulator: &mut AnimationSampleAccumulator) {
    for v in accumulator.values.iter_mut() {
        *v = 0.0;
    }
    accumulator.weight = 0.0;
}

fn slerp_quaternion(out: &mut [f32], a: &[f32], b: &[f32], alpha: f32) {
    let ax = a[0];
    let ay = a[1];
    let az = a[2];
    let aw = a[3];
    let mut bx = b[0];
    let mut by = b[1];
    let mut bz = b[2];
    let mut bw = b[3];
    let mut dot = ax * bx + ay * by + az * bz + aw * bw;
    if dot < 0.0 {
        dot = -dot;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }
    let scale_a: f32;
    let scale_b: f32;
    if 1.0 - dot > 1e-6 {
        let angle = dot.min(1.0).acos();
        let inverse_sin = 1.0 / angle.sin();
        scale_a = ((1.0 - alpha) * angle).sin() * inverse_sin;
        scale_b = (alpha * angle).sin() * inverse_sin;
    } else {
        scale_a = 1.0 - alpha;
        scale_b = alpha;
    }
    write_normalized_quaternion(
        out,
        scale_a * ax + scale_b * bx,
        scale_a * ay + scale_b * by,
        scale_a * az + scale_b * bz,
        scale_a * aw + scale_b * bw,
    );
}

fn write_normalized_quaternion(out: &mut [f32], x: f32, y: f32, z: f32, w: f32) {
    let length = (x * x + y * y + z * z + w * w).sqrt();
    if length == 0.0 {
        out[0] = 0.0;
        out[1] = 0.0;
        out[2] = 0.0;
        out[3] = 1.0;
        return;
    }
    let inverse_length = 1.0 / length;
    out[0] = x * inverse_length;
    out[1] = y * inverse_length;
    out[2] = z * inverse_length;
    out[3] = w * inverse_length;
}

fn write_weighted_quaternion(out: &mut [f32], delta: &[f32], weight: f32) {
    let identity: [f32; 4] = [0.0, 0.0, 0.0, 1.0];
    slerp_quaternion(out, &identity, delta, weight);
}
