use flight_entity::allocate_entity;
use flight_geometry::Rectangle;
use flight_particles::{ParticleEmitter2D, ParticleEmitterData};
use flight_textureatlas::TextureAtlasRotation;

use crate::types::{
    PARTICLE_COLOR_STRIDE, PARTICLE_EMITTER_DELETED_ID, PARTICLE_TRANSFORM_STRIDE,
    PARTICLE_VELOCITY_STRIDE_2D,
};

// flight-lint: allow(conform-params) D16: Rust allocate_entity() pattern; no TS PartialNode overlay
pub fn create_particle_emitter_2d() -> ParticleEmitter2D {
    return allocate_entity();
}

// flight-lint: allow(conform-params) D16: Rust Default; no TS Partial overlay
pub fn create_particle_emitter_data() -> ParticleEmitterData {
    return ParticleEmitterData::default();
}

// flight-lint: allow(conform-params) D16: Rust out-param reinit; TS merges optional Partial data
pub fn initialize_particle_emitter_data(out: &mut ParticleEmitterData) {
    out.alphas = Vec::new();
    out.colors = Vec::new();
    out.ids = Vec::new();
    out.particle_count = 0;
    out.positions_z = Vec::new();
    out.transforms = Vec::new();
    out.velocities = Vec::new();
    out.world_space = false;
}

pub fn append_particle_emitter_2d_particle(
    target: &mut ParticleEmitter2D,
    id: u16,
    x: f32,
    y: f32,
    rotation: f32,
    scale: f32,
) -> usize {
    let index = target.data.particle_count;
    let needed = index + 1;
    if get_particle_emitter_2d_capacity(target) < needed {
        let new_capacity = needed.max(target.data.particle_count * 2).max(8);
        reserve_particle_emitter_2d(target, new_capacity);
    }
    target.data.particle_count = needed;
    target.data.ids[index] = id;
    let tt = index * PARTICLE_TRANSFORM_STRIDE;
    target.data.transforms[tt] = x;
    target.data.transforms[tt + 1] = y;
    target.data.transforms[tt + 2] = rotation;
    target.data.transforms[tt + 3] = scale;
    target.data.alphas[index] = 1.0;
    let ct = index * PARTICLE_COLOR_STRIDE;
    target.data.colors[ct] = 1.0;
    target.data.colors[ct + 1] = 1.0;
    target.data.colors[ct + 2] = 1.0;
    let vt = index * PARTICLE_VELOCITY_STRIDE_2D;
    target.data.velocities[vt] = 0.0;
    target.data.velocities[vt + 1] = 0.0;
    target.data.positions_z[index] = 0.0;
    return index;
}

pub fn clear_particle_emitter_2d(target: &mut ParticleEmitter2D) {
    target.data.particle_count = 0;
}

pub fn clone_particle_emitter_2d(source: &ParticleEmitter2D) -> ParticleEmitter2D {
    return ParticleEmitter2D {
        data: ParticleEmitterData {
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
    };
}

pub fn compact_particle_emitter_2d(target: &mut ParticleEmitter2D) {
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

// flight-lint: allow(conform-params) D5: out parameter first per D9
pub fn compute_particle_emitter_2d_local_bounds_rectangle(
    out: &mut Rectangle,
    source: &ParticleEmitter2D,
    atlas: Option<&flight_textureatlas::TextureAtlas>,
) {
    let data = &source.data;
    let atlas = match atlas {
        Some(a) if data.particle_count > 0 => a,
        _ => {
            out.x = 0.0;
            out.y = 0.0;
            out.width = 0.0;
            out.height = 0.0;
            return;
        }
    };
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

pub fn get_particle_emitter_2d_capacity(source: &ParticleEmitter2D) -> usize {
    let data = &source.data;
    let transform_capacity = data.transforms.len() / PARTICLE_TRANSFORM_STRIDE;
    return data.ids.len().min(data.alphas.len()).min(transform_capacity);
}

pub fn get_particle_emitter_2d_particle_alpha(source: &ParticleEmitter2D, index: usize) -> f32 {
    if index >= source.data.particle_count {
        return -1.0;
    }
    return source.data.alphas[index];
}

pub fn get_particle_emitter_2d_particle_id(source: &ParticleEmitter2D, index: usize) -> i32 {
    if index >= source.data.particle_count {
        return -1;
    }
    return source.data.ids[index] as i32;
}

pub fn get_particle_emitter_2d_particle_velocity(
    out: &mut flight_geometry::Vector2,
    source: &ParticleEmitter2D,
    index: usize,
) -> bool {
    if index >= source.data.particle_count {
        return false;
    }
    let vt = index * PARTICLE_VELOCITY_STRIDE_2D;
    out.x = source.data.velocities[vt];
    out.y = source.data.velocities[vt + 1];
    return true;
}

pub fn remove_particle_emitter_2d_particle(target: &mut ParticleEmitter2D, index: usize) {
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
        let vt = index * PARTICLE_VELOCITY_STRIDE_2D;
        let vts = last * PARTICLE_VELOCITY_STRIDE_2D;
        data.velocities[vt] = data.velocities[vts];
        data.velocities[vt + 1] = data.velocities[vts + 1];
        data.positions_z[index] = data.positions_z[last];
    }
    data.particle_count = last;
}

pub fn reserve_particle_emitter_2d(target: &mut ParticleEmitter2D, capacity: usize) {
    if get_particle_emitter_2d_capacity(target) >= capacity {
        return;
    }
    let data = &mut target.data;
    data.alphas.resize(capacity, 0.0);
    data.colors.resize(capacity * PARTICLE_COLOR_STRIDE, 0.0);
    data.ids.resize(capacity, 0);
    data.positions_z.resize(capacity, 0.0);
    data.transforms.resize(capacity * PARTICLE_TRANSFORM_STRIDE, 0.0);
    data.velocities.resize(capacity * PARTICLE_VELOCITY_STRIDE_2D, 0.0);
}

pub fn set_particle_emitter_2d_particle(
    target: &mut ParticleEmitter2D,
    index: usize,
    id: u16,
    x: f32,
    y: f32,
    rotation: f32,
    scale: f32,
) {
    let data = &mut target.data;
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

pub fn set_particle_emitter_2d_particle_alpha(
    target: &mut ParticleEmitter2D,
    index: usize,
    alpha: f32,
) {
    if index >= target.data.particle_count {
        return;
    }
    target.data.alphas[index] = alpha;
}

pub fn set_particle_emitter_2d_particle_color(
    target: &mut ParticleEmitter2D,
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

pub fn set_particle_emitter_2d_particle_velocity(
    target: &mut ParticleEmitter2D,
    index: usize,
    vx: f32,
    vy: f32,
) {
    if index >= target.data.particle_count {
        return;
    }
    let vt = index * PARTICLE_VELOCITY_STRIDE_2D;
    target.data.velocities[vt] = vx;
    target.data.velocities[vt + 1] = vy;
}
