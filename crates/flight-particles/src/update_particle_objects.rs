use crate::contract::{
    ParticleEmitterConfig, ParticleObject, ParticleObjectsState, ParticleObjectsUpdateOptions,
    ensure_particle_objects_state_capacity, sample_particle_curve, write_particle_spawn_offset,
};

/// True once a finite, non-looping object emitter has finished emitting AND all of
/// its objects are dead -- a one-shot effect that is safe to recycle.
pub fn is_particle_objects_complete(
    objects: &[ParticleObject],
    state: &ParticleObjectsState,
    config: &ParticleEmitterConfig,
) -> bool {
    if config.duration <= 0.0 || config.looping {
        return false;
    }
    if state.emitter_age < config.duration {
        return false;
    }
    for i in 0..objects.len() {
        if objects[i].visible {
            return false;
        }
    }
    return true;
}

pub fn update_particle_objects(
    objects: &mut [ParticleObject],
    state: &mut ParticleObjectsState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    options: Option<&ParticleObjectsUpdateOptions>,
) {
    let n = objects.len();
    if n == 0 {
        return;
    }
    if delta_time <= 0.0 {
        return;
    }
    ensure_particle_objects_state_capacity(state, n);

    let gx = config.gravity_x * delta_time;
    let gy = config.gravity_y * delta_time;

    let alpha_curve = config.alpha_curve.as_deref();
    let scale_curve = config.scale_curve.as_deref();
    let has_alpha_curve = alpha_curve.map_or(false, |c| !c.is_empty());
    let has_scale_curve = scale_curve.map_or(false, |c| !c.is_empty());
    let has_scale_anim = config.scale_end != 1.0 || has_scale_curve;
    let has_rot_speed = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;

    // Emitter velocity for inheritance
    let emitter_x = options.map_or(f32::NAN, |o| o.emitter_x);
    let emitter_y = options.map_or(f32::NAN, |o| o.emitter_y);
    let mut emitter_vel_x = 0.0f32;
    let mut emitter_vel_y = 0.0f32;
    if config.velocity_inheritance != 0.0 && !emitter_x.is_nan() && !state.prev_x.is_nan() {
        emitter_vel_x = (emitter_x - state.prev_x) / delta_time;
        emitter_vel_y = (emitter_y - state.prev_y) / delta_time;
    }

    // Extract callback function pointers
    let on_death: Option<fn(f32, f32, f32)> = options
        .and_then(|o| o.callbacks.as_ref())
        .and_then(|c| c.on_death);
    let on_spawn: Option<fn(f32, f32, f32)> = options
        .and_then(|o| o.callbacks.as_ref())
        .and_then(|c| c.on_spawn);

    // Phase 1: update live objects, kill expired ones.
    for i in 0..n {
        let lt = i * 2;
        if state.lifetimes[lt + 1] <= 0.0 {
            continue;
        }
        state.lifetimes[lt] += delta_time;
        if state.lifetimes[lt] >= state.lifetimes[lt + 1] {
            state.lifetimes[lt + 1] = 0.0;
            let death_x = objects[i].x;
            let death_y = objects[i].y;
            objects[i].visible = false;
            if let Some(callback) = on_death {
                callback(death_x, death_y, 0.0);
            }
            continue;
        }
        let vt = i * 2;
        state.velocities[vt] += gx;
        state.velocities[vt + 1] += gy;
        objects[i].x += state.velocities[vt] * delta_time;
        objects[i].y += state.velocities[vt + 1] * delta_time;
        let life_fraction = state.lifetimes[lt] / state.lifetimes[lt + 1];
        objects[i].alpha = if has_alpha_curve {
            sample_particle_curve(alpha_curve.unwrap(), life_fraction)
        } else {
            config.alpha_start + (config.alpha_end - config.alpha_start) * life_fraction
        };
        if has_scale_anim {
            let factor = if has_scale_curve {
                sample_particle_curve(scale_curve.unwrap(), life_fraction)
            } else {
                1.0 + (config.scale_end - 1.0) * life_fraction
            };
            let s = state.scales[i] * factor;
            objects[i].scale_x = s;
            objects[i].scale_y = s;
        }
        if has_rot_speed {
            objects[i].rotation += state.rotation_speeds[i] * delta_time;
        }
    }

    // Phase 2: emission
    let emitting = config.duration <= 0.0 || config.looping || state.emitter_age < config.duration;
    if config.duration > 0.0 && !config.looping {
        state.emitter_age += delta_time;
    }

    state.spawn_accumulator += if emitting {
        config.spawn_rate * delta_time
    } else {
        0.0
    };
    let mut to_spawn = state.spawn_accumulator as i32;
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

    // Phase 3: spawn into dead slots.
    if to_spawn > 0 {
        let base_angle = config.direction_y.atan2(config.direction_x);
        let rot_speed_range = config.rotation_speed_max - config.rotation_speed_min;
        let mut spawn_offset = [0.0f32; 2];

        for i in 0..n {
            if to_spawn <= 0 {
                break;
            }
            let lt = i * 2;
            if state.lifetimes[lt + 1] > 0.0 {
                continue;
            }

            let lifetime = config.lifetime_min
                + (state.random)() * (config.lifetime_max - config.lifetime_min);
            state.lifetimes[lt] = 0.0;
            state.lifetimes[lt + 1] = lifetime;

            let angle = base_angle + ((state.random)() - 0.5) * 2.0 * config.spread;
            let speed = config.speed_min + (state.random)() * (config.speed_max - config.speed_min);
            let vt = i * 2;
            state.velocities[vt] = angle.cos() * speed
                + if config.velocity_inheritance != 0.0 {
                    emitter_vel_x * config.velocity_inheritance
                } else {
                    0.0
                };
            state.velocities[vt + 1] = angle.sin() * speed
                + if config.velocity_inheritance != 0.0 {
                    emitter_vel_y * config.velocity_inheritance
                } else {
                    0.0
                };

            write_particle_spawn_offset(&mut spawn_offset, 0, config, state.random.as_ref());
            let spawn_x = spawn_offset[0];
            let spawn_y = spawn_offset[1];

            let spawn_scale =
                config.scale_min + (state.random)() * (config.scale_max - config.scale_min);
            state.scales[i] = spawn_scale;
            state.rotation_speeds[i] = if has_rot_speed {
                config.rotation_speed_min + (state.random)() * rot_speed_range
            } else {
                0.0
            };

            let obj = &mut objects[i];
            obj.x = spawn_x;
            obj.y = spawn_y;
            obj.rotation = angle;
            let spawn_factor = if has_scale_curve {
                spawn_scale * sample_particle_curve(scale_curve.unwrap(), 0.0)
            } else {
                spawn_scale
            };
            obj.scale_x = spawn_factor;
            obj.scale_y = spawn_factor;
            obj.alpha = if has_alpha_curve {
                sample_particle_curve(alpha_curve.unwrap(), 0.0)
            } else {
                config.alpha_start
            };
            obj.visible = true;
            to_spawn -= 1;
            if let Some(callback) = on_spawn {
                callback(spawn_x, spawn_y, 0.0);
            }
        }
    }

    // Track emitter position for next frame's velocity inheritance.
    if !emitter_x.is_nan() {
        state.prev_x = emitter_x;
        state.prev_y = emitter_y;
    }
}
