use flight_geometry::Rectangle;
use flight_textureatlas::TextureAtlasRotation;

use crate::types::{
    PARTICLE_COLOR_STRIDE, PARTICLE_EMITTER_DELETED_ID, PARTICLE_TRANSFORM_STRIDE,
    PARTICLE_VELOCITY_STRIDE_2D, ParticleEmitterData,
};

// flight-lint: allow(conform-params) D16: Rust Default; no TS Partial overlay
pub fn create_particle_emitter_data() -> ParticleEmitterData {
    return ParticleEmitterData::default();
}

// flight-lint: allow(conform-params) D23: Rust &mut out + Option<&source>; TS EntityConstruction<T> + Partial<T>
pub fn initialize_particle_emitter_data(
    out: &mut ParticleEmitterData,
    data: Option<&ParticleEmitterData>,
) {
    match data {
        Some(source) => {
            out.alphas = source.alphas.clone();
            out.atlas = source.atlas.clone();
            out.colors = source.colors.clone();
            out.ids = source.ids.clone();
            out.particle_count = source.particle_count;
            out.positions_z = source.positions_z.clone();
            out.transforms = source.transforms.clone();
            out.velocities = source.velocities.clone();
            out.world_space = source.world_space;
        }
        None => {
            out.alphas = Vec::new();
            out.atlas = None;
            out.colors = Vec::new();
            out.ids = Vec::new();
            out.particle_count = 0;
            out.positions_z = Vec::new();
            out.transforms = Vec::new();
            out.velocities = Vec::new();
            out.world_space = false;
        }
    }
}

pub(crate) fn append_particle_emitter_2d_particle_impl(
    data: &mut ParticleEmitterData,
    id: u16,
    x: f32,
    y: f32,
    rotation: f32,
    scale: f32,
) -> usize {
    let index = data.particle_count;
    let needed = index + 1;
    if get_particle_emitter_2d_capacity_impl(data) < needed {
        let new_capacity = needed.max(data.particle_count * 2).max(8);
        reserve_particle_emitter_2d_impl(data, new_capacity);
    }
    data.particle_count = needed;
    data.ids[index] = id;
    let tt = index * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] = x;
    data.transforms[tt + 1] = y;
    data.transforms[tt + 2] = rotation;
    data.transforms[tt + 3] = scale;
    data.alphas[index] = 1.0;
    let ct = index * PARTICLE_COLOR_STRIDE;
    data.colors[ct] = 1.0;
    data.colors[ct + 1] = 1.0;
    data.colors[ct + 2] = 1.0;
    let vt = index * PARTICLE_VELOCITY_STRIDE_2D;
    data.velocities[vt] = 0.0;
    data.velocities[vt + 1] = 0.0;
    data.positions_z[index] = 0.0;
    return index;
}

pub(crate) fn clear_particle_emitter_2d_impl(data: &mut ParticleEmitterData) {
    data.particle_count = 0;
}

pub(crate) fn compact_particle_emitter_2d_impl(data: &mut ParticleEmitterData) {
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
            let vt = write * PARTICLE_VELOCITY_STRIDE_2D;
            let vts = read * PARTICLE_VELOCITY_STRIDE_2D;
            data.velocities[vt] = data.velocities[vts];
            data.velocities[vt + 1] = data.velocities[vts + 1];
            data.positions_z[write] = data.positions_z[read];
        }
        write += 1;
    }
    data.particle_count = write;
}

pub fn compute_particle_emitter_2d_local_bounds_rectangle(
    out: &mut Rectangle,
    source: &crate::types::ParticleEmitter2D,
) {
    let data = &source.data;
    let atlas = match &data.atlas {
        Some(a) if data.particle_count > 0 => a.read().unwrap(),
        _ => {
            out.x = 0.0;
            out.y = 0.0;
            out.width = 0.0;
            out.height = 0.0;
            return;
        }
    };
    let atlas = &*atlas;
    let regions = &atlas.regions;
    let num_regions = regions.len();
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for i in 0..data.particle_count {
        let id = data.ids[i] as usize;
        if id >= num_regions {
            continue;
        }
        let region = regions[id].read().unwrap();
        if region.width <= 0.0 || region.height <= 0.0 {
            continue;
        }
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        let px = data.transforms[tt];
        let py = data.transforms[tt + 1];
        let rot = data.transforms[tt + 2];
        let sc = data.transforms[tt + 3];
        let cos_r = rot.cos() * sc;
        let sin_r = rot.sin() * sc;
        let rotated = region.rotation != TextureAtlasRotation::None;
        let w = if rotated { region.height } else { region.width };
        let h = if rotated { region.width } else { region.height };
        let x0 = px;
        let y0 = py;
        let x1 = cos_r * w + px;
        let y1 = sin_r * w + py;
        let x2 = cos_r * w - sin_r * h + px;
        let y2 = sin_r * w + cos_r * h + py;
        let x3 = -sin_r * h + px;
        let y3 = cos_r * h + py;
        let q_min_x = x0.min(x1).min(x2).min(x3);
        let q_min_y = y0.min(y1).min(y2).min(y3);
        let q_max_x = x0.max(x1).max(x2).max(x3);
        let q_max_y = y0.max(y1).max(y2).max(y3);
        if q_min_x < min_x {
            min_x = q_min_x;
        }
        if q_min_y < min_y {
            min_y = q_min_y;
        }
        if q_max_x > max_x {
            max_x = q_max_x;
        }
        if q_max_y > max_y {
            max_y = q_max_y;
        }
    }
    if min_x == f32::INFINITY {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
    } else {
        out.x = min_x;
        out.y = min_y;
        out.width = max_x - min_x;
        out.height = max_y - min_y;
    }
}

pub(crate) fn get_particle_emitter_2d_capacity_impl(data: &ParticleEmitterData) -> usize {
    let transform_capacity = data.transforms.len() / PARTICLE_TRANSFORM_STRIDE;
    return data.ids.len().min(data.alphas.len()).min(transform_capacity);
}

pub(crate) fn get_particle_emitter_2d_particle_alpha_impl(data: &ParticleEmitterData, index: usize) -> f32 {
    if index >= data.particle_count {
        return -1.0;
    }
    return data.alphas[index];
}

pub(crate) fn get_particle_emitter_2d_particle_id_impl(data: &ParticleEmitterData, index: usize) -> i32 {
    if index >= data.particle_count {
        return -1;
    }
    return data.ids[index] as i32;
}

pub(crate) fn get_particle_emitter_2d_particle_velocity_impl(
    out: &mut flight_geometry::Vector2,
    data: &ParticleEmitterData,
    index: usize,
) -> bool {
    if index >= data.particle_count {
        return false;
    }
    let vt = index * PARTICLE_VELOCITY_STRIDE_2D;
    out.x = data.velocities[vt];
    out.y = data.velocities[vt + 1];
    return true;
}

pub(crate) fn remove_particle_emitter_2d_particle_impl(data: &mut ParticleEmitterData, index: usize) {
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
        let vt = index * PARTICLE_VELOCITY_STRIDE_2D;
        let vts = last * PARTICLE_VELOCITY_STRIDE_2D;
        data.velocities[vt] = data.velocities[vts];
        data.velocities[vt + 1] = data.velocities[vts + 1];
        data.positions_z[index] = data.positions_z[last];
    }
    data.particle_count = last;
}

pub(crate) fn reserve_particle_emitter_2d_impl(data: &mut ParticleEmitterData, capacity: usize) {
    if get_particle_emitter_2d_capacity_impl(data) >= capacity {
        return;
    }
    data.alphas.resize(capacity, 0.0);
    data.colors.resize(capacity * PARTICLE_COLOR_STRIDE, 0.0);
    data.ids.resize(capacity, 0);
    data.positions_z.resize(capacity, 0.0);
    data.transforms.resize(capacity * PARTICLE_TRANSFORM_STRIDE, 0.0);
    data.velocities.resize(capacity * PARTICLE_VELOCITY_STRIDE_2D, 0.0);
}

pub(crate) fn set_particle_emitter_2d_particle_alpha_impl(
    data: &mut ParticleEmitterData,
    index: usize,
    alpha: f32,
) {
    if index >= data.particle_count {
        return;
    }
    data.alphas[index] = alpha;
}

pub(crate) fn set_particle_emitter_2d_particle_color_impl(
    data: &mut ParticleEmitterData,
    index: usize,
    r: f32,
    g: f32,
    b: f32,
) {
    if index >= data.particle_count {
        return;
    }
    let ct = index * PARTICLE_COLOR_STRIDE;
    data.colors[ct] = r;
    data.colors[ct + 1] = g;
    data.colors[ct + 2] = b;
}

pub(crate) fn set_particle_emitter_2d_particle_impl(
    data: &mut ParticleEmitterData,
    index: usize,
    id: u16,
    x: f32,
    y: f32,
    rotation: f32,
    scale: f32,
) {
    if index >= data.particle_count {
        return;
    }
    data.ids[index] = id;
    let tt = index * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] = x;
    data.transforms[tt + 1] = y;
    data.transforms[tt + 2] = rotation;
    data.transforms[tt + 3] = scale;
}

pub(crate) fn set_particle_emitter_2d_particle_velocity_impl(
    data: &mut ParticleEmitterData,
    index: usize,
    vx: f32,
    vy: f32,
) {
    if index >= data.particle_count {
        return;
    }
    let vt = index * PARTICLE_VELOCITY_STRIDE_2D;
    data.velocities[vt] = vx;
    data.velocities[vt + 1] = vy;
}
