use flight_entity::Ref;
use flight_node::NodeRef;
use flight_node::contract::{NodeRevisionState, get_node_local_matrix4, get_node_world_matrix4, invalidate_node_local_bounds};
use flight_particles::{
    EmitterShape, PARTICLE_VELOCITY_STRIDE, ParticleEmitterConfig,
    ParticleEmitterState, sample_particle_color_curve, sample_particle_curve,
};
use flight_particles::contract::{
    ensure_particle_emitter_state_capacity, write_particle_spawn_offset,
};

use crate::particle_emitter_3d::reserve_particle_emitter_3d_impl as reserve_particle_emitter_3d;
use crate::types::{
    PARTICLE_TRANSFORM_STRIDE, ParticleEmitter3D, ParticleEmitterCallbacks, ParticleEmitterData,
};

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

fn is_emitting(config: &ParticleEmitterConfig, emitter_age: f32) -> bool {
    return config.duration <= 0.0 || config.looping || emitter_age < config.duration;
}

pub fn is_particle_emitter_3d_complete(
    emitter: &ParticleEmitter3D,
    state: &ParticleEmitterState,
    config: &ParticleEmitterConfig,
) -> bool {
    if config.duration <= 0.0 || config.looping {
        return false;
    }
    return state.emitter_age >= config.duration && emitter.data.particle_count == 0;
}

fn rotate_to_direction(
    lx: f32,
    ly: f32,
    lz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
) -> [f32; 3] {
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

pub fn update_particle_emitter_3d(
    emitter: &Ref<ParticleEmitter3D>,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    callbacks: Option<&ParticleEmitterCallbacks>,
) {
    let node_ref: NodeRef = emitter.clone();
    let (world_matrix, origin_m) = if config.world_space {
        let mut revisions = NodeRevisionState::default();
        let m4 = get_node_world_matrix4(&node_ref, &mut revisions);
        let m = m4.m;
        (Some(m), m)
    } else {
        let m4 = get_node_local_matrix4(&node_ref);
        (None, m4.m)
    };

    let on_death = callbacks.and_then(|c| c.on_death.as_ref());
    let on_spawn = callbacks.and_then(|c| c.on_spawn.as_ref());
    let (death_events, spawn_events) = {
        let mut guard = emitter.write().unwrap();
        update_particle_emitter_3d_impl(
            &mut guard.data,
            state,
            config,
            delta_time,
            on_death.is_some(),
            on_spawn.is_some(),
            world_matrix.as_ref(),
            &origin_m,
        )
    };
    if let Some(cb) = on_death {
        for (x, y, z) in &death_events {
            cb(*x, *y, *z);
        }
    }
    if let Some(cb) = on_spawn {
        for (x, y, z) in &spawn_events {
            cb(*x, *y, *z);
        }
    }
    invalidate_node_local_bounds(&node_ref);
}

fn update_particle_emitter_3d_impl(
    data: &mut ParticleEmitterData,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    collect_deaths: bool,
    collect_spawns: bool,
    world_matrix: Option<&[f32; 16]>,
    origin_matrix: &[f32; 16],
) -> (Vec<(f32, f32, f32)>, Vec<(f32, f32, f32)>) {
    data.world_space = world_matrix.is_some();

    let mut death_events: Vec<(f32, f32, f32)> = Vec::new();
    let mut spawn_events: Vec<(f32, f32, f32)> = Vec::new();

    if delta_time <= 0.0 {
        return (death_events, spawn_events);
    }

    let track_x = origin_matrix[12];
    let track_y = origin_matrix[13];
    let track_z = origin_matrix[14];

    let has_vel_inherit = config.velocity_inheritance != 0.0;
    let mut emitter_vel_x = 0.0f32;
    let mut emitter_vel_y = 0.0f32;
    let mut emitter_vel_z = 0.0f32;
    if !state.prev_x.is_nan() {
        emitter_vel_x = (track_x - state.prev_x) / delta_time;
        emitter_vel_y = (track_y - state.prev_y) / delta_time;
        emitter_vel_z = (track_z - state.prev_z) / delta_time;
    }

    // Phase 1: age + compact
    let gx = config.gravity_x * delta_time;
    let gy = config.gravity_y * delta_time;
    let gz = config.gravity_z * delta_time;
    let color_start_r = config.color_start_r;
    let color_start_g = config.color_start_g;
    let color_start_b = config.color_start_b;
    let color_end_r = config.color_end_r;
    let color_end_g = config.color_end_g;
    let color_end_b = config.color_end_b;
    let has_color_variance = config.color_start_variance_r != 0.0
        || config.color_start_variance_g != 0.0
        || config.color_start_variance_b != 0.0
        || config.color_end_variance_r != 0.0
        || config.color_end_variance_g != 0.0
        || config.color_end_variance_b != 0.0;
    let has_color_gradient = has_color_variance
        || color_start_r != color_end_r
        || color_start_g != color_end_g
        || color_start_b != color_end_b;
    let alpha_curve = config.alpha_curve.as_deref();
    let color_curve = config.color_curve.as_deref();
    let scale_curve = config.scale_curve.as_deref();
    let has_alpha_curve = alpha_curve.is_some_and(|c| !c.is_empty());
    let has_color_curve = color_curve.is_some_and(|c| c.len() >= 3);
    let has_scale_curve = scale_curve.is_some_and(|c| !c.is_empty());
    let has_scale_anim = config.scale_end != 1.0 || has_scale_curve;
    let has_color_work = has_color_curve || has_color_gradient;
    let has_rotation_speed = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;
    let has_flipbook = config.frame_count > 1.0;
    let mut live_count = data.particle_count;
    let mut i = 0usize;
    while i < live_count {
        let lt = i * 2;
        state.lifetimes[lt] += delta_time;
        if state.lifetimes[lt] >= state.lifetimes[lt + 1] {
            if collect_deaths {
                let tt = i * PARTICLE_TRANSFORM_STRIDE;
                let dx = data.transforms[tt];
                let dy = data.transforms[tt + 1];
                let dz = data.positions_z[i];
                death_events.push((dx, dy, dz));
            }
            live_count -= 1;
            if i < live_count {
                let lt2 = live_count * 2;
                state.lifetimes[lt] = state.lifetimes[lt2];
                state.lifetimes[lt + 1] = state.lifetimes[lt2 + 1];
                let vt = i * PARTICLE_VELOCITY_STRIDE;
                let vt2 = live_count * PARTICLE_VELOCITY_STRIDE;
                state.velocities[vt] = state.velocities[vt2];
                state.velocities[vt + 1] = state.velocities[vt2 + 1];
                state.velocities[vt + 2] = state.velocities[vt2 + 2];
                let tt = i * PARTICLE_TRANSFORM_STRIDE;
                let tt2 = live_count * PARTICLE_TRANSFORM_STRIDE;
                data.transforms[tt] = data.transforms[tt2];
                data.transforms[tt + 1] = data.transforms[tt2 + 1];
                data.transforms[tt + 2] = data.transforms[tt2 + 2];
                data.transforms[tt + 3] = data.transforms[tt2 + 3];
                data.positions_z[i] = data.positions_z[live_count];
                data.alphas[i] = data.alphas[live_count];
                data.ids[i] = data.ids[live_count];
                let ct = i * 3;
                let ct2 = live_count * 3;
                data.colors[ct] = data.colors[ct2];
                data.colors[ct + 1] = data.colors[ct2 + 1];
                data.colors[ct + 2] = data.colors[ct2 + 2];
                state.scales[i] = state.scales[live_count];
                state.rotation_speeds[i] = state.rotation_speeds[live_count];
                if has_color_variance {
                    state.color_birth[ct] = state.color_birth[ct2];
                    state.color_birth[ct + 1] = state.color_birth[ct2 + 1];
                    state.color_birth[ct + 2] = state.color_birth[ct2 + 2];
                    state.color_death[ct] = state.color_death[ct2];
                    state.color_death[ct + 1] = state.color_death[ct2 + 1];
                    state.color_death[ct + 2] = state.color_death[ct2 + 2];
                }
            }
            continue;
        }

        let vt = i * PARTICLE_VELOCITY_STRIDE;
        state.velocities[vt] += gx;
        state.velocities[vt + 1] += gy;
        state.velocities[vt + 2] += gz;
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        data.transforms[tt] += state.velocities[vt] * delta_time;
        data.transforms[tt + 1] += state.velocities[vt + 1] * delta_time;
        data.positions_z[i] += state.velocities[vt + 2] * delta_time;

        let life_fraction = state.lifetimes[lt] / state.lifetimes[lt + 1];

        data.alphas[i] = if has_alpha_curve {
            sample_particle_curve(alpha_curve.unwrap(), life_fraction)
        } else {
            config.alpha_start + (config.alpha_end - config.alpha_start) * life_fraction
        };

        if has_color_work {
            let ct = i * 3;
            if has_color_curve {
                sample_particle_color_curve(&mut data.colors, ct, color_curve.unwrap(), life_fraction);
            } else if has_color_variance {
                data.colors[ct] = state.color_birth[ct]
                    + (state.color_death[ct] - state.color_birth[ct]) * life_fraction;
                data.colors[ct + 1] = state.color_birth[ct + 1]
                    + (state.color_death[ct + 1] - state.color_birth[ct + 1]) * life_fraction;
                data.colors[ct + 2] = state.color_birth[ct + 2]
                    + (state.color_death[ct + 2] - state.color_birth[ct + 2]) * life_fraction;
            } else {
                data.colors[ct] = color_start_r + (color_end_r - color_start_r) * life_fraction;
                data.colors[ct + 1] =
                    color_start_g + (color_end_g - color_start_g) * life_fraction;
                data.colors[ct + 2] =
                    color_start_b + (color_end_b - color_start_b) * life_fraction;
            }
        }

        if has_scale_anim {
            let scale_factor = if has_scale_curve {
                sample_particle_curve(scale_curve.unwrap(), life_fraction)
            } else {
                1.0 + (config.scale_end - 1.0) * life_fraction
            };
            data.transforms[tt + 3] = state.scales[i] * scale_factor;
        }

        if has_rotation_speed {
            data.transforms[tt + 2] += state.rotation_speeds[i] * delta_time;
        }

        if has_flipbook {
            let frame =
                (state.lifetimes[lt] * config.frame_rate).floor() as i32 % config.frame_count as i32;
            data.ids[i] = (config.region_id_min + frame as f32) as u16;
        }

        i += 1;
    }
    data.particle_count = live_count;

    // Phase 2: spawn
    let emitting = is_emitting(config, state.emitter_age);
    if config.duration > 0.0 && !config.looping {
        state.emitter_age += delta_time;
    }

    state.spawn_accumulator += if emitting { config.spawn_rate * delta_time } else { 0.0 };
    let mut to_spawn = state.spawn_accumulator.floor() as i32;
    state.spawn_accumulator -= to_spawn as f32;

    if emitting && config.burst_count > 0.0 {
        state.burst_timer -= delta_time;
        if state.burst_timer <= 0.0 {
            to_spawn += config.burst_count as i32;
            state.burst_timer = if config.burst_interval > 0.0 {
                config.burst_interval
            } else {
                f32::INFINITY
            };
        }
    }

    let max_new = config.max_particles as i32 - live_count as i32;
    if to_spawn > max_new {
        to_spawn = max_new;
    }

    if to_spawn > 0 {
        let to_spawn = to_spawn as usize;
        let new_count = live_count + to_spawn;
        reserve_particle_emitter_3d(data, new_count);
        ensure_particle_emitter_state_capacity(state, new_count, has_color_variance);
        let base_angle = config.direction_y.atan2(config.direction_x);
        let region_range = config.region_id_max - config.region_id_min;
        let region_id_min = config.region_id_min;
        let rot_speed_range = config.rotation_speed_max - config.rotation_speed_min;
        let has_rot_speed = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;

        let dir_len = (config.direction_x * config.direction_x
            + config.direction_y * config.direction_y
            + config.direction_z * config.direction_z)
            .sqrt();
        let dir_nx = if dir_len > 1e-6 { config.direction_x / dir_len } else { 0.0 };
        let dir_ny = if dir_len > 1e-6 { config.direction_y / dir_len } else { -1.0 };
        let dir_nz = if dir_len > 1e-6 { config.direction_z / dir_len } else { 0.0 };

        let do_trail = world_matrix.is_some() && !state.prev_x.is_nan();
        let prev_path_x = if do_trail { state.prev_x } else { track_x };
        let prev_path_y = if do_trail { state.prev_y } else { track_y };
        let prev_path_z = if do_trail { state.prev_z } else { track_z };

        let random = &state.random;
        let mut spawn_offset = [0.0f32; 2];

        for s_idx in 0..to_spawn {
            let idx = live_count + s_idx;

            let lifetime =
                config.lifetime_min + random() * (config.lifetime_max - config.lifetime_min);
            let lt = idx * 2;
            state.lifetimes[lt] = 0.0;
            state.lifetimes[lt + 1] = lifetime;

            let speed = config.speed_min + random() * (config.speed_max - config.speed_min);
            let mut vx: f32;
            let mut vy: f32;
            let mut vz: f32;

            let mut spawn_x = 0.0f32;
            let mut spawn_y = 0.0f32;
            let mut spawn_z = 0.0f32;

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
                    spawn_x = pu * pf * r;
                    spawn_y = pv * pf * r;
                    spawn_z = (1.0 - 2.0 * ps2) * r;
                }
            } else if shape == EmitterShape::Box {
                let angle = base_angle + (random() - 0.5) * 2.0 * config.spread;
                vx = angle.cos() * speed;
                vy = angle.sin() * speed;
                vz = (config.direction_z * speed) / if dir_len > 1e-6 { dir_len } else { 1.0 };
                spawn_x = (random() - 0.5) * config.emitter_width;
                spawn_y = (random() - 0.5) * config.emitter_height;
                spawn_z = (random() - 0.5) * config.emitter_depth;
            } else {
                let angle = base_angle + (random() - 0.5) * 2.0 * config.spread;
                vx = angle.cos() * speed;
                vy = angle.sin() * speed;
                vz = 0.0;

                write_particle_spawn_offset(&mut spawn_offset, 0, config, &**random);
                spawn_x = spawn_offset[0];
                spawn_y = spawn_offset[1];
            }

            if let Some(m) = world_matrix {
                let t = if to_spawn > 1 {
                    s_idx as f32 / (to_spawn as f32 - 1.0)
                } else {
                    1.0
                };
                let origin_x = prev_path_x + (track_x - prev_path_x) * t;
                let origin_y = prev_path_y + (track_y - prev_path_y) * t;
                let origin_z = prev_path_z + (track_z - prev_path_z) * t;
                let px = m[0] * spawn_x + m[4] * spawn_y + m[8] * spawn_z + origin_x;
                let py = m[1] * spawn_x + m[5] * spawn_y + m[9] * spawn_z + origin_y;
                let pz = m[2] * spawn_x + m[6] * spawn_y + m[10] * spawn_z + origin_z;
                let wvx = m[0] * vx + m[4] * vy + m[8] * vz;
                let wvy = m[1] * vx + m[5] * vy + m[9] * vz;
                let wvz = m[2] * vx + m[6] * vy + m[10] * vz;
                spawn_x = px;
                spawn_y = py;
                spawn_z = pz;
                vx = wvx;
                vy = wvy;
                vz = wvz;
            }

            if has_vel_inherit && !state.prev_x.is_nan() {
                vx += emitter_vel_x * config.velocity_inheritance;
                vy += emitter_vel_y * config.velocity_inheritance;
                vz += emitter_vel_z * config.velocity_inheritance;
            }

            let vt = idx * PARTICLE_VELOCITY_STRIDE;
            state.velocities[vt] = vx;
            state.velocities[vt + 1] = vy;
            state.velocities[vt + 2] = vz;

            let spawn_scale =
                config.scale_min + random() * (config.scale_max - config.scale_min);
            state.scales[idx] = spawn_scale;

            let tt = idx * PARTICLE_TRANSFORM_STRIDE;
            data.transforms[tt] = spawn_x;
            data.transforms[tt + 1] = spawn_y;
            data.transforms[tt + 2] = if shape == EmitterShape::Sphere
                || shape == EmitterShape::Cone3D
                || shape == EmitterShape::Box
            {
                vy.atan2(vx)
            } else {
                base_angle + (random() - 0.5) * 2.0 * config.spread
            };
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
                    color_start_r + (random() - 0.5) * 2.0 * config.color_start_variance_r,
                );
                let g0 = clamp01(
                    color_start_g + (random() - 0.5) * 2.0 * config.color_start_variance_g,
                );
                let b0 = clamp01(
                    color_start_b + (random() - 0.5) * 2.0 * config.color_start_variance_b,
                );
                let r1 = clamp01(
                    color_end_r + (random() - 0.5) * 2.0 * config.color_end_variance_r,
                );
                let g1 = clamp01(
                    color_end_g + (random() - 0.5) * 2.0 * config.color_end_variance_g,
                );
                let b1 = clamp01(
                    color_end_b + (random() - 0.5) * 2.0 * config.color_end_variance_b,
                );
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
                data.colors[ct] = color_start_r;
                data.colors[ct + 1] = color_start_g;
                data.colors[ct + 2] = color_start_b;
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

            if collect_spawns {
                spawn_events.push((spawn_x, spawn_y, spawn_z));
            }
        }
        data.particle_count = new_count;
    }

    state.prev_x = track_x;
    state.prev_y = track_y;
    state.prev_z = track_z;

    // Mirror velocities: both are stride-3, direct copy
    let live_velocity_count = data.particle_count * PARTICLE_VELOCITY_STRIDE;
    if data.velocities.len() >= live_velocity_count {
        for vi in 0..live_velocity_count {
            data.velocities[vi] = state.velocities[vi];
        }
    }
    return (death_events, spawn_events);
}
