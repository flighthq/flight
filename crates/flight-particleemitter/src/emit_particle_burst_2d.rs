use flight_particles::contract::{
    ensure_particle_emitter_state_capacity, write_particle_spawn_offset,
};
use flight_particles::{
    PARTICLE_VELOCITY_STRIDE, ParticleEmitterConfig, ParticleEmitterState,
    sample_particle_color_curve, sample_particle_curve,
};

use crate::particle_emitter::reserve_particle_emitter_2d_impl as reserve_particle_emitter_2d;
use crate::types::{PARTICLE_TRANSFORM_STRIDE, ParticleEmitterData};

fn clamp01(v: f32) -> f32 {
    if v < 0.0 {
        return 0.0;
    }
    if v > 1.0 {
        return 1.0;
    }
    return v;
}

pub(crate) fn emit_particle_burst_2d_impl(
    data: &mut ParticleEmitterData,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    count: f32,
    x: f32,
    y: f32,
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
    reserve_particle_emitter_2d(data, new_count);
    ensure_particle_emitter_state_capacity(state, new_count, has_color_variance);

    let alpha_curve = config.alpha_curve.as_deref();
    let color_curve = config.color_curve.as_deref();
    let scale_curve = config.scale_curve.as_deref();
    let has_alpha_curve = alpha_curve.map_or(false, |c| !c.is_empty());
    let has_color_curve = color_curve.map_or(false, |c| c.len() >= 3);
    let has_scale_curve = scale_curve.map_or(false, |c| !c.is_empty());
    let base_angle = config.direction_y.atan2(config.direction_x);
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

    let mut spawn_offset = [0.0f32, 0.0f32];

    for s_idx in 0..to_spawn {
        let idx = live_count + s_idx;

        let lifetime = config.lifetime_min + random() * (config.lifetime_max - config.lifetime_min);
        let lt = idx * 2;
        state.lifetimes[lt] = 0.0;
        state.lifetimes[lt + 1] = lifetime;

        let angle = base_angle + (random() - 0.5) * 2.0 * config.spread;
        let speed = config.speed_min + random() * (config.speed_max - config.speed_min);
        let vt = idx * PARTICLE_VELOCITY_STRIDE;
        state.velocities[vt] = angle.cos() * speed;
        state.velocities[vt + 1] = angle.sin() * speed;
        state.velocities[vt + 2] = 0.0;

        let mut spawn_x = x;
        let mut spawn_y = y;
        write_particle_spawn_offset(&mut spawn_offset, 0, config, &**random);
        spawn_x += spawn_offset[0];
        spawn_y += spawn_offset[1];

        let spawn_scale = config.scale_min + random() * (config.scale_max - config.scale_min);
        state.scales[idx] = spawn_scale;

        let tt = idx * PARTICLE_TRANSFORM_STRIDE;
        data.transforms[tt] = spawn_x;
        data.transforms[tt + 1] = spawn_y;
        data.transforms[tt + 2] = angle;
        data.transforms[tt + 3] = if has_scale_curve {
            spawn_scale * sample_particle_curve(scale_curve.unwrap(), 0.0)
        } else {
            spawn_scale
        };
        data.positions_z[idx] = 0.0;
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
