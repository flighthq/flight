use flight_entity::allocate_entity;
use flight_geometry::Aabb;

use crate::types::{
    PARTICLE_COLOR_STRIDE, PARTICLE_EMITTER_DELETED_ID, PARTICLE_TRANSFORM_STRIDE,
    PARTICLE_VELOCITY_STRIDE_3D, ParticleEmitter3D,
};

// flight-lint: allow(conform-params) D16: Rust allocate_entity() pattern; no TS PartialNode overlay
pub fn create_particle_emitter_3d() -> ParticleEmitter3D {
    return allocate_entity();
}

pub fn append_particle_emitter_3d_particle(
    target: &mut ParticleEmitter3D,
    id: u16,
    x: f32,
    y: f32,
    z: f32,
    rotation: f32,
    scale: f32,
) -> usize {
    let index = target.data.particle_count;
    let needed = index + 1;
    if get_particle_emitter_3d_capacity(target) < needed {
        let new_capacity = needed.max(target.data.particle_count * 2).max(8);
        reserve_particle_emitter_3d(target, new_capacity);
    }
    target.data.particle_count = needed;
    target.data.ids[index] = id;
    let tt = index * PARTICLE_TRANSFORM_STRIDE;
    target.data.transforms[tt] = x;
    target.data.transforms[tt + 1] = y;
    target.data.transforms[tt + 2] = rotation;
    target.data.transforms[tt + 3] = scale;
    target.data.positions_z[index] = z;
    target.data.alphas[index] = 1.0;
    let ct = index * PARTICLE_COLOR_STRIDE;
    target.data.colors[ct] = 1.0;
    target.data.colors[ct + 1] = 1.0;
    target.data.colors[ct + 2] = 1.0;
    let vt = index * PARTICLE_VELOCITY_STRIDE_3D;
    target.data.velocities[vt] = 0.0;
    target.data.velocities[vt + 1] = 0.0;
    target.data.velocities[vt + 2] = 0.0;
    return index;
}

pub fn clear_particle_emitter_3d(target: &mut ParticleEmitter3D) {
    target.data.particle_count = 0;
}

pub fn clone_particle_emitter_3d(source: &ParticleEmitter3D) -> ParticleEmitter3D {
    return ParticleEmitter3D {
        blend_mode: source.blend_mode.clone(),
        data: flight_particles::ParticleEmitterData {
            alphas: source.data.alphas.clone(),
            colors: source.data.colors.clone(),
            ids: source.data.ids.clone(),
            particle_count: source.data.particle_count,
            positions_z: source.data.positions_z.clone(),
            transforms: source.data.transforms.clone(),
            velocities: source.data.velocities.clone(),
            world_space: source.data.world_space,
        },
        x: source.x,
        y: source.y,
        z: source.z,
    };
}

pub fn compact_particle_emitter_3d(target: &mut ParticleEmitter3D) {
    let data = &mut target.data;
    if data.particle_count == 0 {
        return;
    }
    let mut write = 0;
    for read in 0..data.particle_count {
        if data.ids[read] == PARTICLE_EMITTER_DELETED_ID {
            continue;
        }
        if write != read {
            data.ids[write] = data.ids[read];
            let tt = write * PARTICLE_TRANSFORM_STRIDE;
            let tts = read * PARTICLE_TRANSFORM_STRIDE;
            data.transforms[tt] = data.transforms[tts];
            data.transforms[tt + 1] = data.transforms[tts + 1];
            data.transforms[tt + 2] = data.transforms[tts + 2];
            data.transforms[tt + 3] = data.transforms[tts + 3];
            data.alphas[write] = data.alphas[read];
            let ct = write * PARTICLE_COLOR_STRIDE;
            let cts = read * PARTICLE_COLOR_STRIDE;
            data.colors[ct] = data.colors[cts];
            data.colors[ct + 1] = data.colors[cts + 1];
            data.colors[ct + 2] = data.colors[cts + 2];
            let vt = write * PARTICLE_VELOCITY_STRIDE_3D;
            let vts = read * PARTICLE_VELOCITY_STRIDE_3D;
            data.velocities[vt] = data.velocities[vts];
            data.velocities[vt + 1] = data.velocities[vts + 1];
            data.velocities[vt + 2] = data.velocities[vts + 2];
            data.positions_z[write] = data.positions_z[read];
        }
        write += 1;
    }
    data.particle_count = write;
}

pub fn compute_particle_emitter_3d_local_bounds_aabb(
    out: &mut Aabb,
    source: &ParticleEmitter3D,
) {
    let data = &source.data;
    if data.particle_count == 0 {
        out.min.x = 0.0;
        out.min.y = 0.0;
        out.min.z = 0.0;
        out.max.x = 0.0;
        out.max.y = 0.0;
        out.max.z = 0.0;
        return;
    }
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;
    for i in 0..data.particle_count {
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        let px = data.transforms[tt];
        let py = data.transforms[tt + 1];
        let pz = data.positions_z[i];
        let scale = data.transforms[tt + 3];
        let r = std::f32::consts::FRAC_1_SQRT_2 * scale.abs();
        if px - r < min_x { min_x = px - r; }
        if py - r < min_y { min_y = py - r; }
        if pz - r < min_z { min_z = pz - r; }
        if px + r > max_x { max_x = px + r; }
        if py + r > max_y { max_y = py + r; }
        if pz + r > max_z { max_z = pz + r; }
    }
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

pub fn get_particle_emitter_3d_capacity(source: &ParticleEmitter3D) -> usize {
    let data = &source.data;
    let color_capacity = data.colors.len() / PARTICLE_COLOR_STRIDE;
    let transform_capacity = data.transforms.len() / PARTICLE_TRANSFORM_STRIDE;
    let velocity_capacity = data.velocities.len() / PARTICLE_VELOCITY_STRIDE_3D;
    return data
        .ids
        .len()
        .min(data.alphas.len())
        .min(data.positions_z.len())
        .min(color_capacity)
        .min(transform_capacity)
        .min(velocity_capacity);
}

pub fn get_particle_emitter_3d_particle_alpha(
    source: &ParticleEmitter3D,
    index: usize,
) -> f32 {
    if index >= source.data.particle_count {
        return -1.0;
    }
    return source.data.alphas[index];
}

pub fn get_particle_emitter_3d_particle_id(
    source: &ParticleEmitter3D,
    index: usize,
) -> i32 {
    if index >= source.data.particle_count {
        return -1;
    }
    return source.data.ids[index] as i32;
}

pub fn get_particle_emitter_3d_particle_velocity(
    out: &mut [f32; 3],
    source: &ParticleEmitter3D,
    index: usize,
) -> bool {
    if index >= source.data.particle_count {
        return false;
    }
    let vt = index * PARTICLE_VELOCITY_STRIDE_3D;
    out[0] = source.data.velocities[vt];
    out[1] = source.data.velocities[vt + 1];
    out[2] = source.data.velocities[vt + 2];
    return true;
}

// flight-lint: allow(f64) helper for f64 view-depth comparison
fn is_depth_greater(a: u32, b: u32, depths: &[f64]) -> bool {
    let ad = depths[a as usize];
    let bd = depths[b as usize];
    return ad > bd || (ad == bd && a > b);
}

pub fn remove_particle_emitter_3d_particle(target: &mut ParticleEmitter3D, index: usize) {
    let data = &mut target.data;
    if data.particle_count == 0 {
        return;
    }
    let last = data.particle_count - 1;
    if index > last {
        return;
    }
    if index < last {
        data.ids[index] = data.ids[last];
        let tt = index * PARTICLE_TRANSFORM_STRIDE;
        let tts = last * PARTICLE_TRANSFORM_STRIDE;
        data.transforms[tt] = data.transforms[tts];
        data.transforms[tt + 1] = data.transforms[tts + 1];
        data.transforms[tt + 2] = data.transforms[tts + 2];
        data.transforms[tt + 3] = data.transforms[tts + 3];
        data.alphas[index] = data.alphas[last];
        let ct = index * PARTICLE_COLOR_STRIDE;
        let cts = last * PARTICLE_COLOR_STRIDE;
        data.colors[ct] = data.colors[cts];
        data.colors[ct + 1] = data.colors[cts + 1];
        data.colors[ct + 2] = data.colors[cts + 2];
        let vt = index * PARTICLE_VELOCITY_STRIDE_3D;
        let vts = last * PARTICLE_VELOCITY_STRIDE_3D;
        data.velocities[vt] = data.velocities[vts];
        data.velocities[vt + 1] = data.velocities[vts + 1];
        data.velocities[vt + 2] = data.velocities[vts + 2];
        data.positions_z[index] = data.positions_z[last];
    }
    data.particle_count = last;
}

pub fn reserve_particle_emitter_3d(target: &mut ParticleEmitter3D, capacity: usize) {
    if get_particle_emitter_3d_capacity(target) >= capacity {
        return;
    }
    let data = &mut target.data;
    data.alphas.resize(capacity, 0.0);
    data.colors.resize(capacity * PARTICLE_COLOR_STRIDE, 0.0);
    data.ids.resize(capacity, 0);
    data.positions_z.resize(capacity, 0.0);
    data.transforms.resize(capacity * PARTICLE_TRANSFORM_STRIDE, 0.0);
    data.velocities.resize(capacity * PARTICLE_VELOCITY_STRIDE_3D, 0.0);
}

pub fn set_particle_emitter_3d_particle(
    target: &mut ParticleEmitter3D,
    index: usize,
    id: u16,
    x: f32,
    y: f32,
    z: f32,
    rotation: f32,
    scale: f32,
) {
    if index >= target.data.particle_count {
        return;
    }
    target.data.ids[index] = id;
    let tt = index * PARTICLE_TRANSFORM_STRIDE;
    target.data.transforms[tt] = x;
    target.data.transforms[tt + 1] = y;
    target.data.transforms[tt + 2] = rotation;
    target.data.transforms[tt + 3] = scale;
    target.data.positions_z[index] = z;
}

pub fn set_particle_emitter_3d_particle_alpha(
    target: &mut ParticleEmitter3D,
    index: usize,
    alpha: f32,
) {
    if index >= target.data.particle_count {
        return;
    }
    target.data.alphas[index] = alpha;
}

pub fn set_particle_emitter_3d_particle_color(
    target: &mut ParticleEmitter3D,
    index: usize,
    r: f32,
    g: f32,
    b: f32,
) {
    if index >= target.data.particle_count {
        return;
    }
    let ct = index * PARTICLE_COLOR_STRIDE;
    target.data.colors[ct] = r;
    target.data.colors[ct + 1] = g;
    target.data.colors[ct + 2] = b;
}

pub fn set_particle_emitter_3d_particle_velocity(
    target: &mut ParticleEmitter3D,
    index: usize,
    vx: f32,
    vy: f32,
    vz: f32,
) {
    if index >= target.data.particle_count {
        return;
    }
    let vt = index * PARTICLE_VELOCITY_STRIDE_3D;
    target.data.velocities[vt] = vx;
    target.data.velocities[vt + 1] = vy;
    target.data.velocities[vt + 2] = vz;
}

// flight-lint: allow(f64) helper for f64 view-depth heap sort
fn sift_max_heap(indices: &mut [u32], depths: &[f64], start: usize, count: usize) {
    let mut root = start;
    loop {
        let mut child = 2 * root + 1;
        if child >= count {
            break;
        }
        if child + 1 < count && is_depth_greater(indices[child + 1], indices[child], depths) {
            child += 1;
        }
        if is_depth_greater(indices[child], indices[root], depths) {
            indices.swap(root, child);
            root = child;
        } else {
            break;
        }
    }
}

// flight-lint: allow(conform-extra) D16: Rust convenience wrapper; TS only has indices-based sort
pub fn sort_particle_emitter_3d_by_view_depth(
    target: &mut ParticleEmitter3D,
    view_matrix: &[f32; 16],
) {
    let data = &mut target.data;
    let count = data.particle_count;
    if count <= 1 {
        return;
    }
    let m02 = view_matrix[2];
    let m12 = view_matrix[6];
    let m22 = view_matrix[10];

    let mut indices: Vec<usize> = (0..count).collect();
    indices.sort_by(|&a, &b| {
        let ta = a * PARTICLE_TRANSFORM_STRIDE;
        let tb = b * PARTICLE_TRANSFORM_STRIDE;
        let depth_a =
            data.transforms[ta] * m02 + data.transforms[ta + 1] * m12 + data.positions_z[a] * m22;
        let depth_b =
            data.transforms[tb] * m02 + data.transforms[tb + 1] * m12 + data.positions_z[b] * m22;
        depth_a.partial_cmp(&depth_b).unwrap_or(std::cmp::Ordering::Equal)
    });

    let old_ids = data.ids[..count].to_vec();
    let old_transforms = data.transforms[..count * PARTICLE_TRANSFORM_STRIDE].to_vec();
    let old_alphas = data.alphas[..count].to_vec();
    let old_colors = data.colors[..count * PARTICLE_COLOR_STRIDE].to_vec();
    let old_velocities = data.velocities[..count * PARTICLE_VELOCITY_STRIDE_3D].to_vec();
    let old_positions_z = data.positions_z[..count].to_vec();

    for (dst, &src) in indices.iter().enumerate() {
        data.ids[dst] = old_ids[src];
        let dtt = dst * PARTICLE_TRANSFORM_STRIDE;
        let stt = src * PARTICLE_TRANSFORM_STRIDE;
        data.transforms[dtt] = old_transforms[stt];
        data.transforms[dtt + 1] = old_transforms[stt + 1];
        data.transforms[dtt + 2] = old_transforms[stt + 2];
        data.transforms[dtt + 3] = old_transforms[stt + 3];
        data.alphas[dst] = old_alphas[src];
        let dct = dst * PARTICLE_COLOR_STRIDE;
        let sct = src * PARTICLE_COLOR_STRIDE;
        data.colors[dct] = old_colors[sct];
        data.colors[dct + 1] = old_colors[sct + 1];
        data.colors[dct + 2] = old_colors[sct + 2];
        let dvt = dst * PARTICLE_VELOCITY_STRIDE_3D;
        let svt = src * PARTICLE_VELOCITY_STRIDE_3D;
        data.velocities[dvt] = old_velocities[svt];
        data.velocities[dvt + 1] = old_velocities[svt + 1];
        data.velocities[dvt + 2] = old_velocities[svt + 2];
        data.positions_z[dst] = old_positions_z[src];
    }
}

// flight-lint: allow(f64) TS uses JS number (f64) for view-depth accumulation to avoid f32 precision loss
pub fn sort_particle_emitter_3d_indices_by_view_depth(
    out_indices: &mut [u32],
    out_view_depths: &mut [f64],
    source: &ParticleEmitter3D,
    position_to_view: &[f32; 16],
) -> bool {
    let count = source.data.particle_count;
    if get_particle_emitter_3d_capacity(source) < count
        || out_indices.len() < count
        || out_view_depths.len() < count
    {
        return false;
    }

    let transforms = &source.data.transforms;
    let positions_z = &source.data.positions_z;
    for index in 0..count {
        let tt = index * PARTICLE_TRANSFORM_STRIDE;
        let x = transforms[tt] as f64;
        let y = transforms[tt + 1] as f64;
        let z = positions_z[index] as f64;
        out_indices[index] = index as u32;
        out_view_depths[index] = position_to_view[2] as f64 * x
            + position_to_view[6] as f64 * y
            + position_to_view[10] as f64 * z
            + position_to_view[14] as f64;
    }

    let n = count;
    for start in (0..n / 2).rev() {
        sift_max_heap(out_indices, out_view_depths, start, n);
    }
    for end in (1..n).rev() {
        out_indices.swap(0, end);
        sift_max_heap(out_indices, out_view_depths, 0, end);
    }
    return true;
}
