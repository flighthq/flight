use flight_particles::contract::{
    ensure_particle_emitter_state_capacity, write_particle_spawn_offset,
};
use flight_particles::{
    EmitterShape, PARTICLE_VELOCITY_STRIDE, ParticleEmitterConfig, ParticleEmitterState,
    sample_particle_color_curve, sample_particle_curve,
};

use crate::particle_emitter_3d::reserve_particle_emitter_3d_impl as reserve_particle_emitter_3d;
use crate::types::{PARTICLE_TRANSFORM_STRIDE, ParticleEmitterData};

const TWO_PI: f32 = std::f32::consts::PI * 2.0;

fn clamp01(v: f32) -> f32 {
    if v < 0.0 {
        return 0.0;
    }
    if v > 1.0 {
        return 1.0;
    }
    return v;
}

pub(crate) fn emit_particle_burst_3d_impl(
    data: &mut ParticleEmitterData,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    count: f32,
    x: f32,
    y: f32,
    z: f32,
    tint: Option<u32>,
) -> usize {
    let live_count = data.particle_count;
    let mut to_spawn = count.floor() as i32;
    let max_new = config.max_particles as i32 - live_count as i32;
    if to_spawn > max_new {
        to_spawn = max_new;
    }
    if to_spawn <= 0 {
        return 0;
    }
    let to_spawn = to_spawn as usize;

    let has_color_variance = config.color_start_variance_r != 0.0
        || config.color_start_variance_g != 0.0
        || config.color_start_variance_b != 0.0
        || config.color_end_variance_r != 0.0
        || config.color_end_variance_g != 0.0
        || config.color_end_variance_b != 0.0;

    let new_count = live_count + to_spawn;
    reserve_particle_emitter_3d(data, new_count);
    ensure_particle_emitter_state_capacity(state, new_count, has_color_variance);

    let alpha_curve = config.alpha_curve.as_deref();
    let color_curve = config.color_curve.as_deref();
    let scale_curve = config.scale_curve.as_deref();
    let has_alpha_curve = alpha_curve.map_or(false, |c| !c.is_empty());
    let has_color_curve = color_curve.map_or(false, |c| c.len() >= 3);
    let has_scale_curve = scale_curve.map_or(false, |c| !c.is_empty());
    let region_range = config.region_id_max - config.region_id_min;
    let region_id_min = config.region_id_min;
    let rot_speed_range = config.rotation_speed_max - config.rotation_speed_min;
    let has_rot_speed = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;
    let random = &state.random;

    let has_tint = tint.is_some();
    let tint_val = tint.unwrap_or(0);
    let tint_r = if has_tint {
        ((tint_val >> 24) & 0xff) as f32 / 255.0
    } else {
        1.0
    };
    let tint_g = if has_tint {
        ((tint_val >> 16) & 0xff) as f32 / 255.0
    } else {
        1.0
    };
    let tint_b = if has_tint {
        ((tint_val >> 8) & 0xff) as f32 / 255.0
    } else {
        1.0
    };
    let tint_a = if has_tint {
        (tint_val & 0xff) as f32 / 255.0
    } else {
        1.0
    };

    let dir_len = (config.direction_x * config.direction_x
        + config.direction_y * config.direction_y
        + config.direction_z * config.direction_z)
        .sqrt();
    let dir_nx = if dir_len > 1e-6 {
        config.direction_x / dir_len
    } else {
        0.0
    };
    let dir_ny = if dir_len > 1e-6 {
        config.direction_y / dir_len
    } else {
        -1.0
    };
    let dir_nz = if dir_len > 1e-6 {
        config.direction_z / dir_len
    } else {
        0.0
    };

    let mut spawn_offset = [0.0f32, 0.0f32];

    for s_idx in 0..to_spawn {
        let idx = live_count + s_idx;

        let lifetime = config.lifetime_min + random() * (config.lifetime_max - config.lifetime_min);
        let lt = idx * 2;
        state.lifetimes[lt] = 0.0;
        state.lifetimes[lt + 1] = lifetime;

        let speed = config.speed_min + random() * (config.speed_max - config.speed_min);
        let vx: f32;
        let vy: f32;
        let vz: f32;

        let mut spawn_x = x;
        let mut spawn_y = y;
        let mut spawn_z = z;

        let shape = config.emitter_shape;
        if shape == EmitterShape::Sphere || shape == EmitterShape::Cone3D {
            let sx: f32;
            let sy: f32;
            let sz: f32;
            if shape == EmitterShape::Cone3D && config.emitter_cone_angle > 0.0 {
                let cone_half = config.emitter_cone_angle / 2.0;
                let cos_theta = 1.0 - random() * (1.0 - cone_half.cos());
                let sin_theta = (1.0 - cos_theta * cos_theta).sqrt();
                let phi = random() * TWO_PI;
                let lx = sin_theta * phi.cos();
                let ly = sin_theta * phi.sin();
                let lz = cos_theta;
                let r_dir = rotate_to_direction(lx, ly, lz, dir_nx, dir_ny, dir_nz);
                sx = r_dir[0];
                sy = r_dir[1];
                sz = r_dir[2];
            } else {
                let (u, v, s2) = loop {
                    let u = random() * 2.0 - 1.0;
                    let v = random() * 2.0 - 1.0;
                    let s2 = u * u + v * v;
                    if s2 < 1.0 && s2 != 0.0 {
                        break (u, v, s2);
                    }
                };
                let f = 2.0 * (1.0 - s2).sqrt();
                sx = u * f;
                sy = v * f;
                sz = 1.0 - 2.0 * s2;
            }
            vx = sx * speed;
            vy = sy * speed;
            vz = sz * speed;

            if config.emitter_radius > 0.0 {
                let r = random().cbrt() * config.emitter_radius;
                let (pu, pv, ps2) = loop {
                    let pu = random() * 2.0 - 1.0;
                    let pv = random() * 2.0 - 1.0;
                    let ps2 = pu * pu + pv * pv;
                    if ps2 < 1.0 && ps2 != 0.0 {
                        break (pu, pv, ps2);
                    }
                };
                let pf = 2.0 * (1.0 - ps2).sqrt();
                spawn_x += pu * pf * r;
                spawn_y += pv * pf * r;
                spawn_z += (1.0 - 2.0 * ps2) * r;
            }
        } else {
            let base_angle = config.direction_y.atan2(config.direction_x);
            let angle = base_angle + (random() - 0.5) * 2.0 * config.spread;
            vx = angle.cos() * speed;
            vy = angle.sin() * speed;
            vz = (config.direction_z * speed) / if dir_len > 1e-6 { dir_len } else { 1.0 };

            if shape == EmitterShape::Box {
                spawn_x += (random() - 0.5) * config.emitter_width;
                spawn_y += (random() - 0.5) * config.emitter_height;
                spawn_z += (random() - 0.5) * config.emitter_depth;
            } else {
                write_particle_spawn_offset(&mut spawn_offset, 0, config, &**random);
                spawn_x += spawn_offset[0];
                spawn_y += spawn_offset[1];
            }
        }

        let vt = idx * PARTICLE_VELOCITY_STRIDE;
        state.velocities[vt] = vx;
        state.velocities[vt + 1] = vy;
        state.velocities[vt + 2] = vz;

        let spawn_scale = config.scale_min + random() * (config.scale_max - config.scale_min);
        state.scales[idx] = spawn_scale;

        let tt = idx * PARTICLE_TRANSFORM_STRIDE;
        data.transforms[tt] = spawn_x;
        data.transforms[tt + 1] = spawn_y;
        data.transforms[tt + 2] = vy.atan2(vx);
        data.transforms[tt + 3] = if has_scale_curve {
            spawn_scale * sample_particle_curve(scale_curve.unwrap(), 0.0)
        } else {
            spawn_scale
        };
        data.positions_z[idx] = spawn_z;
        data.alphas[idx] = if has_alpha_curve {
            sample_particle_curve(alpha_curve.unwrap(), 0.0)
        } else {
            config.alpha_start
        };

        let ct = idx * 3;
        if has_color_curve {
            sample_particle_color_curve(&mut data.colors, ct, color_curve.unwrap(), 0.0);
        } else if has_color_variance {
            let r0 = clamp01(
                config.color_start_r + (random() - 0.5) * 2.0 * config.color_start_variance_r,
            );
            let g0 = clamp01(
                config.color_start_g + (random() - 0.5) * 2.0 * config.color_start_variance_g,
            );
            let b0 = clamp01(
                config.color_start_b + (random() - 0.5) * 2.0 * config.color_start_variance_b,
            );
            let r1 =
                clamp01(config.color_end_r + (random() - 0.5) * 2.0 * config.color_end_variance_r);
            let g1 =
                clamp01(config.color_end_g + (random() - 0.5) * 2.0 * config.color_end_variance_g);
            let b1 =
                clamp01(config.color_end_b + (random() - 0.5) * 2.0 * config.color_end_variance_b);
            state.color_birth[ct] = r0;
            state.color_birth[ct + 1] = g0;
            state.color_birth[ct + 2] = b0;
            state.color_death[ct] = r1;
            state.color_death[ct + 1] = g1;
            state.color_death[ct + 2] = b1;
            data.colors[ct] = r0;
            data.colors[ct + 1] = g0;
            data.colors[ct + 2] = b0;
        } else {
            data.colors[ct] = config.color_start_r;
            data.colors[ct + 1] = config.color_start_g;
            data.colors[ct + 2] = config.color_start_b;
        }

        if has_tint {
            data.colors[ct] *= tint_r;
            data.colors[ct + 1] *= tint_g;
            data.colors[ct + 2] *= tint_b;
            data.alphas[idx] *= tint_a;
            if has_color_variance {
                state.color_birth[ct] *= tint_r;
                state.color_birth[ct + 1] *= tint_g;
                state.color_birth[ct + 2] *= tint_b;
                state.color_death[ct] *= tint_r;
                state.color_death[ct + 1] *= tint_g;
                state.color_death[ct + 2] *= tint_b;
            }
        }

        data.ids[idx] = (region_id_min
            + if config.frame_count > 1.0 {
                0.0
            } else if region_range > 0.0 {
                (random() * region_range).floor()
            } else {
                0.0
            }) as u16;
        state.rotation_speeds[idx] = if has_rot_speed {
            config.rotation_speed_min + random() * rot_speed_range
        } else {
            0.0
        };
    }

    data.particle_count = new_count;
    return to_spawn;
}

fn rotate_to_direction(lx: f32, ly: f32, lz: f32, dx: f32, dy: f32, dz: f32) -> [f32; 3] {
    let kx = -dy;
    let ky = dx;
    let sin_angle = (kx * kx + ky * ky).sqrt();
    let cos_angle = dz;

    if sin_angle < 1e-6 {
        if cos_angle > 0.0 {
            return [lx, ly, lz];
        } else {
            return [lx, -ly, -lz];
        }
    }

    let inv_sin = 1.0 / sin_angle;
    let ax = kx * inv_sin;
    let ay = ky * inv_sin;
    let kdotv = ax * lx + ay * ly;
    let cross_x = ay * lz;
    let cross_y = -ax * lz;
    let cross_z = ax * ly - ay * lx;

    return [
        lx * cos_angle + cross_x * sin_angle + ax * kdotv * (1.0 - cos_angle),
        ly * cos_angle + cross_y * sin_angle + ay * kdotv * (1.0 - cos_angle),
        lz * cos_angle + cross_z * sin_angle,
    ];
}
