use crate::{
    ForceFalloff, PARTICLE_VELOCITY_STRIDE, ParticleEmitterState, ParticleForce, ParticleObject,
    ParticleObjectsState,
};

fn accumulate_forces(
    forces: &[ParticleForce],
    px: f32,
    py: f32,
    pz: f32,
    vx: f32,
    vy: f32,
    vz: f32,
    out: &mut [f32; 3],
) {
    for force in forces {
        match force {
            ParticleForce::WindForce { x, y, z } => {
                out[0] += x;
                out[1] += y;
                out[2] += z;
            }
            ParticleForce::DragForce { strength } => {
                out[0] -= strength * vx;
                out[1] -= strength * vy;
                out[2] -= strength * vz;
            }
            ParticleForce::AttractorForce {
                x,
                y,
                z,
                strength,
                falloff,
                radius,
            } => {
                let dx = x - px;
                let dy = y - py;
                let dz = z - pz;
                let dist = (dx * dx + dy * dy + dz * dz).sqrt();
                if dist <= 1e-6 {
                    continue;
                }
                let mag = strength * falloff_factor(falloff, dist, radius);
                if mag == 0.0 {
                    continue;
                }
                out[0] += (dx / dist) * mag;
                out[1] += (dy / dist) * mag;
                out[2] += (dz / dist) * mag;
            }
            ParticleForce::VortexForce {
                x,
                y,
                z,
                strength,
                falloff,
                radius,
                axis_x,
                axis_y,
                axis_z,
            } => {
                let dx = px - x;
                let dy = py - y;
                let dz = pz - z;
                let dist = (dx * dx + dy * dy + dz * dz).sqrt();
                if dist <= 1e-6 {
                    continue;
                }
                let mag = strength * falloff_factor(falloff, dist, radius);
                if mag == 0.0 {
                    continue;
                }
                let ax = *axis_x;
                let ay = *axis_y;
                let az = *axis_z;
                let inv_dist = 1.0 / dist;
                let rx = dx * inv_dist;
                let ry = dy * inv_dist;
                let rz = dz * inv_dist;
                out[0] += (ay * rz - az * ry) * mag;
                out[1] += (az * rx - ax * rz) * mag;
                out[2] += (ax * ry - ay * rx) * mag;
            }
            ParticleForce::TurbulenceForce { strength, scale } => {
                let s = *scale;
                out[0] += (value_noise(px * s, py * s, 0.0) * 2.0 - 1.0) * strength;
                out[1] += (value_noise(px * s, py * s, 1.0) * 2.0 - 1.0) * strength;
                out[2] += (value_noise(px * s, pz * s, 2.0) * 2.0 - 1.0) * strength;
            }
        }
    }
}

// flight-lint: allow(conform-params) D24: TS takes ParticleEmitter2D (flight-particleemitter); Rust decomposes to raw buffers because flight-particles cannot depend on downstream crate
pub fn apply_particle_forces(
    transforms: &[f32],
    positions_z: &[f32],
    particle_count: usize,
    state: &mut ParticleEmitterState,
    forces: &[ParticleForce],
    delta_time: f32,
) {
    if delta_time <= 0.0 || forces.is_empty() {
        return;
    }
    for i in 0..particle_count {
        let tt = i * 4;
        let vt = i * PARTICLE_VELOCITY_STRIDE;
        let mut accel = [0.0f32; 3];
        let pz = if positions_z.len() > i {
            positions_z[i]
        } else {
            0.0
        };
        accumulate_forces(
            forces,
            transforms[tt],
            transforms[tt + 1],
            pz,
            state.velocities[vt],
            state.velocities[vt + 1],
            state.velocities[vt + 2],
            &mut accel,
        );
        state.velocities[vt] += accel[0] * delta_time;
        state.velocities[vt + 1] += accel[1] * delta_time;
        state.velocities[vt + 2] += accel[2] * delta_time;
    }
}

/// Force-field pass for the object-pool path.
pub fn apply_particle_object_forces(
    objects: &[ParticleObject],
    state: &mut ParticleObjectsState,
    forces: &[ParticleForce],
    delta_time: f32,
) {
    if delta_time <= 0.0 || forces.is_empty() {
        return;
    }
    for i in 0..objects.len() {
        if state.lifetimes[i * 2 + 1] <= 0.0 {
            continue; // dead slot
        }
        let vt = i * 2;
        let mut accel = [0.0f32; 3];
        accumulate_forces(
            forces,
            objects[i].x,
            objects[i].y,
            0.0,
            state.velocities[vt],
            state.velocities[vt + 1],
            0.0,
            &mut accel,
        );
        state.velocities[vt] += accel[0] * delta_time;
        state.velocities[vt + 1] += accel[1] * delta_time;
    }
}

fn falloff_factor(falloff: &Option<ForceFalloff>, dist: f32, radius: &Option<f32>) -> f32 {
    if let Some(r) = radius {
        if *r > 0.0 && dist > *r {
            return 0.0; // hard cutoff
        }
    }
    match falloff {
        Some(ForceFalloff::Linear) => {
            if let Some(r) = radius {
                if *r > 0.0 {
                    return (1.0 - dist / r).max(0.0);
                }
            }
            return 1.0;
        }
        Some(ForceFalloff::InverseSquare) => {
            let d = if dist < 1.0 { 1.0 } else { dist };
            return 1.0 / (d * d);
        }
        None => {
            return 1.0;
        }
    }
}

fn hash2(x: f32, y: f32, seed: f32) -> f32 {
    let xi = x as i32;
    let yi = y as i32;
    let si = seed as i32;
    let mut h: i32 = xi.wrapping_mul(0x27d4eb2du32 as i32)
        ^ yi.wrapping_mul(0x165667b1u32 as i32)
        ^ (si.wrapping_add(1)).wrapping_mul(0x9e3779b1u32 as i32);
    h = (h ^ ((h as u32 >> 15) as i32)).wrapping_mul(0x85ebca6bu32 as i32);
    h = (h ^ ((h as u32 >> 13) as i32)).wrapping_mul(0xc2b2ae35u32 as i32);
    return ((h as u32) ^ ((h as u32) >> 16)) as f32 / 4294967296.0;
}

fn value_noise(x: f32, y: f32, seed: f32) -> f32 {
    let x0 = x.floor();
    let y0 = y.floor();
    let fx = x - x0;
    let fy = y - y0;
    let ux = fx * fx * (3.0 - 2.0 * fx);
    let uy = fy * fy * (3.0 - 2.0 * fy);
    let n00 = hash2(x0, y0, seed);
    let n10 = hash2(x0 + 1.0, y0, seed);
    let n01 = hash2(x0, y0 + 1.0, seed);
    let n11 = hash2(x0 + 1.0, y0 + 1.0, seed);
    let nx0 = n00 + (n10 - n00) * ux;
    let nx1 = n01 + (n11 - n01) * ux;
    return nx0 + (nx1 - nx0) * uy;
}
