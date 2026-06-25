//! Core typed-array emitter update, burst emission, and prewarm helpers.
//!
//! All functions operate on `ParticleEmitterData` (owned by the caller) and
//! `ParticleEmitterState` (mutable simulation state kept separate from the
//! config so the config stays `Clone`-able and debug-printable without heavy
//! buffer data).
//!
//! Unlike the TypeScript source, which tracks a `ParticleEmitter` display
//! object with its own `x`/`y` in parent space, the Rust core operates on the
//! data/state pair directly.  Emitter position tracking (for velocity
//! inheritance and world-space trail interpolation) is driven entirely by the
//! optional `world_transform`; without it the emitter is treated as stationary
//! at the origin.

use flighthq_geometry::{reserve_f32, reserve_u16};
use flighthq_types::{
    ParticleEmitterCallbacks, ParticleEmitterConfig, ParticleEmitterData, ParticleEmitterShape,
    ParticleEmitterState, WorldTransform2D,
};

use crate::curve::{sample_particle_color_curve, sample_particle_curve};
use crate::state::{ensure_particle_emitter_state_capacity, next_random};

const PARTICLE_TRANSFORM_STRIDE: usize = 4;
const TWO_PI: f32 = std::f32::consts::PI * 2.0;

/// Emit `count` particles immediately at `(x, y)` in the emitter's simulation
/// space, independent of the emitter's own spawn rate, bursts, or duration.
///
/// Returns the number of particles actually spawned (capped by
/// `config.max_particles`).  Use this as the building block for sub-emitters:
/// call it from an `on_death`/`on_spawn` callback to spawn a child effect at
/// the event position.
pub fn emit_particle_burst(
    data: &mut ParticleEmitterData,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    count: u32,
    x: f32,
    y: f32,
) -> u32 {
    let live_count = data.particle_count as usize;
    let max_new = (config.max_particles as i64 - live_count as i64).max(0) as usize;
    let to_spawn = (count as usize).min(max_new);
    if to_spawn == 0 {
        return 0;
    }

    let has_color_variance = has_color_variance(config);
    let new_count = live_count + to_spawn;
    reserve_emitter(data, new_count);
    ensure_particle_emitter_state_capacity(state, new_count, has_color_variance);

    let has_alpha_curve = curve_len(&config.alpha_curve) > 0;
    let has_color_curve = curve_len(&config.color_curve) >= 3;
    let has_scale_curve = curve_len(&config.scale_curve) > 0;
    let base_angle = config.direction_y.atan2(config.direction_x);
    let region_range = config.region_id_max as i64 - config.region_id_min as i64;
    let rot_speed_range = config.rotation_speed_max - config.rotation_speed_min;
    let has_rot_speed = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;

    for s in 0..to_spawn {
        let idx = live_count + s;
        spawn_particle(
            data,
            state,
            config,
            idx,
            x,
            y,
            base_angle,
            region_range,
            rot_speed_range,
            has_rot_speed,
            has_color_variance,
            has_alpha_curve,
            has_color_curve,
            has_scale_curve,
        );
    }

    data.particle_count = new_count as u32;
    to_spawn as u32
}

/// Return `true` once a finite, non-looping emitter has finished spawning
/// **and** all of its particles have died — i.e. a one-shot effect that is
/// safe to recycle or remove.  Always returns `false` for infinite or looping
/// emitters.
pub fn is_particle_emitter_complete(
    data: &ParticleEmitterData,
    state: &ParticleEmitterState,
    config: &ParticleEmitterConfig,
) -> bool {
    if config.duration <= 0.0 || config.loop_ {
        return false;
    }
    state.emitter_age >= config.duration && data.particle_count == 0
}

/// Simulate the emitter forward by `duration` seconds by repeatedly calling
/// [`update_particle_emitter`] with `step_delta_time`-sized steps.
///
/// Useful for warming up a looping emitter before it is first shown so it
/// appears to have been running for a while already.
pub fn prewarm_particle_emitter(
    data: &mut ParticleEmitterData,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    duration: f32,
    step_delta_time: f32,
    callbacks: Option<&ParticleEmitterCallbacks>,
    world_transform: Option<&WorldTransform2D>,
) {
    // A non-positive step would never advance `elapsed`, spinning forever; fall
    // back to a single step covering the whole duration instead of hanging.
    let step = if step_delta_time > 0.0 {
        step_delta_time
    } else {
        duration
    };
    let mut elapsed = 0.0;
    while elapsed < duration {
        let delta_time = step.min(duration - elapsed);
        update_particle_emitter(data, state, config, delta_time, callbacks, world_transform);
        elapsed += delta_time;
    }
}

/// Advance the emitter by `delta_time` seconds: age and kill expired
/// particles, integrate gravity and velocity, update per-particle color/alpha/
/// scale/rotation, then spawn new particles according to spawn rate and burst
/// config.
///
/// Call [`apply_particle_forces`](crate::apply_particle_forces) **before** and
/// [`apply_particle_collisions`](crate::apply_particle_collisions) **after**
/// this function when those features are needed.
///
/// `world_transform` is required when `config.world_space` is `true` so that
/// new particles can be placed and oriented in world space.
pub fn update_particle_emitter(
    data: &mut ParticleEmitterData,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    callbacks: Option<&ParticleEmitterCallbacks>,
    world_transform: Option<&WorldTransform2D>,
) {
    // Sync world-space flag to data so renderers can read it.
    data.world_space = config.world_space;

    // Guard against a zero or negative time step: nothing to age, move, or spawn.
    // Also avoids dividing by delta_time when computing emitter velocity.
    if delta_time <= 0.0 {
        return;
    }

    // Emitter position tracking for velocity inheritance and trail interpolation.
    // Local-space tracking is unavailable without an emitter entity, so a missing
    // world transform leaves the emitter stationary at the origin.
    let (track_x, track_y) = match (config.world_space, world_transform) {
        (true, Some(wt)) => (wt.tx, wt.ty),
        _ => (0.0, 0.0),
    };
    let has_vel_inherit = config.velocity_inheritance != 0.0;
    let mut emitter_vel_x = 0.0;
    let mut emitter_vel_y = 0.0;
    if !state.prev_x.is_nan() {
        emitter_vel_x = (track_x - state.prev_x) / delta_time;
        emitter_vel_y = (track_y - state.prev_y) / delta_time;
    }

    let gx = config.gravity_x * delta_time;
    let gy = config.gravity_y * delta_time;
    let color_start_r = config.color_start_r;
    let color_start_g = config.color_start_g;
    let color_start_b = config.color_start_b;
    let color_end_r = config.color_end_r;
    let color_end_g = config.color_end_g;
    let color_end_b = config.color_end_b;
    let has_color_variance = has_color_variance(config);
    let has_color_gradient = has_color_variance
        || color_start_r != color_end_r
        || color_start_g != color_end_g
        || color_start_b != color_end_b;
    let has_alpha_curve = curve_len(&config.alpha_curve) > 0;
    let has_color_curve = curve_len(&config.color_curve) >= 3;
    let has_scale_curve = curve_len(&config.scale_curve) > 0;
    let has_scale_anim = config.scale_end != 1.0 || has_scale_curve;
    let has_color_work = has_color_curve || has_color_gradient;
    let has_rotation_speed = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;
    let has_flipbook = config.frame_count > 1;
    let on_death = callbacks.and_then(|c| c.on_death.as_ref());
    let on_spawn = callbacks.and_then(|c| c.on_spawn.as_ref());

    // ── Phase 1: age live particles, compact dead ones ──────────────────────
    let mut live_count = data.particle_count as usize;
    let mut i = 0;
    while i < live_count {
        let lt = i * 2;
        state.lifetimes[lt] += delta_time;
        if state.lifetimes[lt] >= state.lifetimes[lt + 1] {
            if let Some(cb) = on_death {
                let tt = i * PARTICLE_TRANSFORM_STRIDE;
                cb(data.transforms[tt], data.transforms[tt + 1]);
            }
            live_count -= 1;
            if i < live_count {
                let lt2 = live_count * 2;
                state.lifetimes[lt] = state.lifetimes[lt2];
                state.lifetimes[lt + 1] = state.lifetimes[lt2 + 1];
                let vt = i * 2;
                let vt2 = live_count * 2;
                state.velocities[vt] = state.velocities[vt2];
                state.velocities[vt + 1] = state.velocities[vt2 + 1];
                let tt = i * PARTICLE_TRANSFORM_STRIDE;
                let tt2 = live_count * PARTICLE_TRANSFORM_STRIDE;
                data.transforms[tt] = data.transforms[tt2];
                data.transforms[tt + 1] = data.transforms[tt2 + 1];
                data.transforms[tt + 2] = data.transforms[tt2 + 2];
                data.transforms[tt + 3] = data.transforms[tt2 + 3];
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

        let vt = i * 2;
        state.velocities[vt] += gx;
        state.velocities[vt + 1] += gy;
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        data.transforms[tt] += state.velocities[vt] * delta_time;
        data.transforms[tt + 1] += state.velocities[vt + 1] * delta_time;

        let life_fraction = state.lifetimes[lt] / state.lifetimes[lt + 1];

        data.alphas[i] = if has_alpha_curve {
            sample_particle_curve(config.alpha_curve.as_ref().unwrap(), life_fraction)
        } else {
            config.alpha_start + (config.alpha_end - config.alpha_start) * life_fraction
        };

        if has_color_work {
            let ct = i * 3;
            if has_color_curve {
                sample_particle_color_curve(
                    config.color_curve.as_ref().unwrap(),
                    life_fraction,
                    &mut data.colors,
                    ct,
                );
            } else if has_color_variance {
                data.colors[ct] = state.color_birth[ct]
                    + (state.color_death[ct] - state.color_birth[ct]) * life_fraction;
                data.colors[ct + 1] = state.color_birth[ct + 1]
                    + (state.color_death[ct + 1] - state.color_birth[ct + 1]) * life_fraction;
                data.colors[ct + 2] = state.color_birth[ct + 2]
                    + (state.color_death[ct + 2] - state.color_birth[ct + 2]) * life_fraction;
            } else {
                data.colors[ct] = color_start_r + (color_end_r - color_start_r) * life_fraction;
                data.colors[ct + 1] = color_start_g + (color_end_g - color_start_g) * life_fraction;
                data.colors[ct + 2] = color_start_b + (color_end_b - color_start_b) * life_fraction;
            }
        }

        if has_scale_anim {
            let scale_factor = if has_scale_curve {
                sample_particle_curve(config.scale_curve.as_ref().unwrap(), life_fraction)
            } else {
                1.0 + (config.scale_end - 1.0) * life_fraction
            };
            data.transforms[tt + 3] = state.scales[i] * scale_factor;
        }

        if has_rotation_speed {
            data.transforms[tt + 2] += state.rotation_speeds[i] * delta_time;
        }

        if has_flipbook {
            let frame = (state.lifetimes[lt] * config.frame_rate).floor() as i64
                % config.frame_count as i64;
            data.ids[i] = (config.region_id_min as i64 + frame) as u16;
        }

        i += 1;
    }
    data.particle_count = live_count as u32;

    // ── Phase 2: spawn new particles ─────────────────────────────────────────
    let emitting = is_emitting(config, state.emitter_age);
    if config.duration > 0.0 && !config.loop_ {
        state.emitter_age += delta_time;
    }

    state.spawn_accumulator += if emitting {
        config.spawn_rate * delta_time
    } else {
        0.0
    };
    let mut to_spawn = state.spawn_accumulator.floor() as i64;
    state.spawn_accumulator -= to_spawn as f32;

    if emitting && config.burst_count > 0 {
        state.burst_timer -= delta_time;
        if state.burst_timer <= 0.0 {
            to_spawn += config.burst_count as i64;
            state.burst_timer = if config.burst_interval > 0.0 {
                config.burst_interval
            } else {
                f32::INFINITY
            };
        }
    }

    let max_new = config.max_particles as i64 - live_count as i64;
    if to_spawn > max_new {
        to_spawn = max_new;
    }

    if to_spawn > 0 {
        let to_spawn = to_spawn as usize;
        let new_count = live_count + to_spawn;
        reserve_emitter(data, new_count);
        ensure_particle_emitter_state_capacity(state, new_count, has_color_variance);

        let base_angle = config.direction_y.atan2(config.direction_x);
        let region_range = config.region_id_max as i64 - config.region_id_min as i64;
        let rot_speed_range = config.rotation_speed_max - config.rotation_speed_min;
        let has_rot_speed = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;

        // World-space trail: distribute spawn origins along prev->current path.
        let do_trail = config.world_space && world_transform.is_some() && !state.prev_x.is_nan();
        let prev_path_x = if do_trail { state.prev_x } else { track_x };
        let prev_path_y = if do_trail { state.prev_y } else { track_y };

        for s in 0..to_spawn {
            let idx = live_count + s;

            // Lifetime
            let lifetime = config.lifetime_min
                + next_random(&mut state.random_state)
                    * (config.lifetime_max - config.lifetime_min);
            let lt = idx * 2;
            state.lifetimes[lt] = 0.0;
            state.lifetimes[lt + 1] = lifetime;

            // Velocity direction in local/emitter space
            let angle =
                base_angle + (next_random(&mut state.random_state) - 0.5) * 2.0 * config.spread;
            let speed = config.speed_min
                + next_random(&mut state.random_state) * (config.speed_max - config.speed_min);
            let mut vx = angle.cos() * speed;
            let mut vy = angle.sin() * speed;

            // Spawn position (local to emitter, or shape offset)
            let mut spawn_x = 0.0;
            let mut spawn_y = 0.0;
            match config.emitter_shape {
                ParticleEmitterShape::Circle if config.emitter_radius > 0.0 => {
                    let r = next_random(&mut state.random_state).sqrt() * config.emitter_radius;
                    let a = next_random(&mut state.random_state) * TWO_PI;
                    spawn_x = a.cos() * r;
                    spawn_y = a.sin() * r;
                }
                ParticleEmitterShape::Rect
                    if config.emitter_width > 0.0 || config.emitter_height > 0.0 =>
                {
                    spawn_x = (next_random(&mut state.random_state) - 0.5) * config.emitter_width;
                    spawn_y = (next_random(&mut state.random_state) - 0.5) * config.emitter_height;
                }
                _ => {}
            }

            // World-space: transform spawn position and velocity into world space,
            // and distribute origins along the emitter's movement path.
            if config.world_space
                && let Some(wt) = world_transform
            {
                let t = if to_spawn > 1 {
                    s as f32 / (to_spawn - 1) as f32
                } else {
                    1.0
                };
                let origin_x = prev_path_x + (track_x - prev_path_x) * t;
                let origin_y = prev_path_y + (track_y - prev_path_y) * t;
                let wx = wt.a * spawn_x + wt.c * spawn_y + origin_x;
                let wy = wt.b * spawn_x + wt.d * spawn_y + origin_y;
                spawn_x = wx;
                spawn_y = wy;
                let wvx = wt.a * vx + wt.c * vy;
                let wvy = wt.b * vx + wt.d * vy;
                vx = wvx;
                vy = wvy;
            }

            // Velocity inheritance: blend emitter velocity into new particle velocity.
            if has_vel_inherit && !state.prev_x.is_nan() {
                vx += emitter_vel_x * config.velocity_inheritance;
                vy += emitter_vel_y * config.velocity_inheritance;
            }

            let vt = idx * 2;
            state.velocities[vt] = vx;
            state.velocities[vt + 1] = vy;

            let spawn_scale = config.scale_min
                + next_random(&mut state.random_state) * (config.scale_max - config.scale_min);
            state.scales[idx] = spawn_scale;

            let tt = idx * PARTICLE_TRANSFORM_STRIDE;
            data.transforms[tt] = spawn_x;
            data.transforms[tt + 1] = spawn_y;
            data.transforms[tt + 2] = angle;
            data.transforms[tt + 3] = if has_scale_curve {
                spawn_scale * sample_particle_curve(config.scale_curve.as_ref().unwrap(), 0.0)
            } else {
                spawn_scale
            };
            data.alphas[idx] = if has_alpha_curve {
                sample_particle_curve(config.alpha_curve.as_ref().unwrap(), 0.0)
            } else {
                config.alpha_start
            };

            // Color — curve, then per-particle variance, then constants.
            let ct = idx * 3;
            if has_color_curve {
                sample_particle_color_curve(
                    config.color_curve.as_ref().unwrap(),
                    0.0,
                    &mut data.colors,
                    ct,
                );
            } else if has_color_variance {
                let r0 = clamp01(
                    color_start_r
                        + (next_random(&mut state.random_state) - 0.5)
                            * 2.0
                            * config.color_start_variance_r,
                );
                let g0 = clamp01(
                    color_start_g
                        + (next_random(&mut state.random_state) - 0.5)
                            * 2.0
                            * config.color_start_variance_g,
                );
                let b0 = clamp01(
                    color_start_b
                        + (next_random(&mut state.random_state) - 0.5)
                            * 2.0
                            * config.color_start_variance_b,
                );
                let r1 = clamp01(
                    color_end_r
                        + (next_random(&mut state.random_state) - 0.5)
                            * 2.0
                            * config.color_end_variance_r,
                );
                let g1 = clamp01(
                    color_end_g
                        + (next_random(&mut state.random_state) - 0.5)
                            * 2.0
                            * config.color_end_variance_g,
                );
                let b1 = clamp01(
                    color_end_b
                        + (next_random(&mut state.random_state) - 0.5)
                            * 2.0
                            * config.color_end_variance_b,
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

            let region_id = if config.frame_count > 1 {
                0
            } else if region_range > 0 {
                (next_random(&mut state.random_state) * region_range as f32) as i64
            } else {
                0
            };
            data.ids[idx] = (config.region_id_min as i64 + region_id) as u16;
            state.rotation_speeds[idx] = if has_rot_speed {
                config.rotation_speed_min + next_random(&mut state.random_state) * rot_speed_range
            } else {
                0.0
            };

            if let Some(cb) = on_spawn {
                cb(spawn_x, spawn_y);
            }
        }
        data.particle_count = new_count as u32;
    }

    // Update prev-position tracking for next frame.
    state.prev_x = track_x;
    state.prev_y = track_y;

    // Mirror the live per-particle velocities into the render data so the velocity
    // G-buffer writer can smear each particle by its own vector.
    let live_velocity_count = data.particle_count as usize * 2;
    if data.velocities.len() >= live_velocity_count {
        data.velocities[..live_velocity_count]
            .copy_from_slice(&state.velocities[..live_velocity_count]);
    }
}

fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

fn curve_len(curve: &Option<Vec<f32>>) -> usize {
    curve.as_ref().map(|c| c.len()).unwrap_or(0)
}

fn has_color_variance(config: &ParticleEmitterConfig) -> bool {
    config.color_start_variance_r != 0.0
        || config.color_start_variance_g != 0.0
        || config.color_start_variance_b != 0.0
        || config.color_end_variance_r != 0.0
        || config.color_end_variance_g != 0.0
        || config.color_end_variance_b != 0.0
}

// Whether an emitter with the given config is still spawning, given how long it
// has been emitting. Infinite (duration <= 0) and looping emitters always emit.
fn is_emitting(config: &ParticleEmitterConfig, emitter_age: f32) -> bool {
    config.duration <= 0.0 || config.loop_ || emitter_age < config.duration
}

// Grow every per-particle buffer in `data` to hold at least `capacity` particles.
// Mirrors the sprite package's `reserveParticleEmitter`.
fn reserve_emitter(data: &mut ParticleEmitterData, capacity: usize) {
    data.alphas = reserve_f32(std::mem::take(&mut data.alphas), capacity);
    data.colors = reserve_f32(std::mem::take(&mut data.colors), capacity * 3);
    data.ids = reserve_u16(std::mem::take(&mut data.ids), capacity);
    data.transforms = reserve_f32(
        std::mem::take(&mut data.transforms),
        capacity * PARTICLE_TRANSFORM_STRIDE,
    );
    data.velocities = reserve_f32(std::mem::take(&mut data.velocities), capacity * 2);
}

// Spawn a single particle into slot `idx` at `(x, y)` plus the emitter-shape
// offset. Shared by the burst path; the update path inlines its own variant
// because it also handles world-space transforms and velocity inheritance.
#[allow(clippy::too_many_arguments)]
fn spawn_particle(
    data: &mut ParticleEmitterData,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    idx: usize,
    x: f32,
    y: f32,
    base_angle: f32,
    region_range: i64,
    rot_speed_range: f32,
    has_rot_speed: bool,
    has_color_variance: bool,
    has_alpha_curve: bool,
    has_color_curve: bool,
    has_scale_curve: bool,
) {
    let lifetime = config.lifetime_min
        + next_random(&mut state.random_state) * (config.lifetime_max - config.lifetime_min);
    let lt = idx * 2;
    state.lifetimes[lt] = 0.0;
    state.lifetimes[lt + 1] = lifetime;

    let angle = base_angle + (next_random(&mut state.random_state) - 0.5) * 2.0 * config.spread;
    let speed = config.speed_min
        + next_random(&mut state.random_state) * (config.speed_max - config.speed_min);
    state.velocities[idx * 2] = angle.cos() * speed;
    state.velocities[idx * 2 + 1] = angle.sin() * speed;

    let mut spawn_x = x;
    let mut spawn_y = y;
    match config.emitter_shape {
        ParticleEmitterShape::Circle if config.emitter_radius > 0.0 => {
            let r = next_random(&mut state.random_state).sqrt() * config.emitter_radius;
            let a = next_random(&mut state.random_state) * TWO_PI;
            spawn_x += a.cos() * r;
            spawn_y += a.sin() * r;
        }
        ParticleEmitterShape::Rect if config.emitter_width > 0.0 || config.emitter_height > 0.0 => {
            spawn_x += (next_random(&mut state.random_state) - 0.5) * config.emitter_width;
            spawn_y += (next_random(&mut state.random_state) - 0.5) * config.emitter_height;
        }
        _ => {}
    }

    let spawn_scale = config.scale_min
        + next_random(&mut state.random_state) * (config.scale_max - config.scale_min);
    state.scales[idx] = spawn_scale;

    let tt = idx * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] = spawn_x;
    data.transforms[tt + 1] = spawn_y;
    data.transforms[tt + 2] = angle;
    data.transforms[tt + 3] = if has_scale_curve {
        spawn_scale * sample_particle_curve(config.scale_curve.as_ref().unwrap(), 0.0)
    } else {
        spawn_scale
    };
    data.alphas[idx] = if has_alpha_curve {
        sample_particle_curve(config.alpha_curve.as_ref().unwrap(), 0.0)
    } else {
        config.alpha_start
    };

    let ct = idx * 3;
    if has_color_curve {
        sample_particle_color_curve(
            config.color_curve.as_ref().unwrap(),
            0.0,
            &mut data.colors,
            ct,
        );
    } else if has_color_variance {
        let r0 = clamp01(
            config.color_start_r
                + (next_random(&mut state.random_state) - 0.5)
                    * 2.0
                    * config.color_start_variance_r,
        );
        let g0 = clamp01(
            config.color_start_g
                + (next_random(&mut state.random_state) - 0.5)
                    * 2.0
                    * config.color_start_variance_g,
        );
        let b0 = clamp01(
            config.color_start_b
                + (next_random(&mut state.random_state) - 0.5)
                    * 2.0
                    * config.color_start_variance_b,
        );
        let r1 = clamp01(
            config.color_end_r
                + (next_random(&mut state.random_state) - 0.5) * 2.0 * config.color_end_variance_r,
        );
        let g1 = clamp01(
            config.color_end_g
                + (next_random(&mut state.random_state) - 0.5) * 2.0 * config.color_end_variance_g,
        );
        let b1 = clamp01(
            config.color_end_b
                + (next_random(&mut state.random_state) - 0.5) * 2.0 * config.color_end_variance_b,
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
        data.colors[ct] = config.color_start_r;
        data.colors[ct + 1] = config.color_start_g;
        data.colors[ct + 2] = config.color_start_b;
    }

    let region_id = if config.frame_count > 1 {
        0
    } else if region_range > 0 {
        (next_random(&mut state.random_state) * region_range as f32) as i64
    } else {
        0
    };
    data.ids[idx] = (config.region_id_min as i64 + region_id) as u16;
    state.rotation_speeds[idx] = if has_rot_speed {
        config.rotation_speed_min + next_random(&mut state.random_state) * rot_speed_range
    } else {
        0.0
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{create_particle_emitter_config, create_particle_emitter_state};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn config_with(f: impl FnOnce(&mut ParticleEmitterConfig)) -> ParticleEmitterConfig {
        let mut config = create_particle_emitter_config(None);
        f(&mut config);
        config
    }

    #[test]
    fn emit_particle_burst_respects_max_particles() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.max_particles = 5;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        assert_eq!(
            emit_particle_burst(&mut data, &mut state, &config, 100, 0.0, 0.0),
            5
        );
        assert_eq!(data.particle_count, 5);
    }

    #[test]
    fn emit_particle_burst_at_point() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        let n = emit_particle_burst(&mut data, &mut state, &config, 8, 200.0, 300.0);
        assert_eq!(n, 8);
        assert_eq!(data.particle_count, 8);
        for i in 0..8 {
            assert!((data.transforms[i * 4] - 200.0).abs() < 1e-3);
            assert!((data.transforms[i * 4 + 1] - 300.0).abs() < 1e-3);
        }
    }

    #[test]
    fn emit_particle_burst_adds_to_existing() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.max_particles = 100;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        emit_particle_burst(&mut data, &mut state, &config, 3, 0.0, 0.0);
        emit_particle_burst(&mut data, &mut state, &config, 4, 0.0, 0.0);
        assert_eq!(data.particle_count, 7);
    }

    #[test]
    fn emit_particle_burst_leaves_bookkeeping() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        emit_particle_burst(&mut data, &mut state, &config, 3, 0.0, 0.0);
        assert_eq!(state.spawn_accumulator, 0.0);
        assert_eq!(state.emitter_age, 0.0);
    }

    #[test]
    fn emit_particle_burst_deterministic_with_seed() {
        let run = || {
            let mut data = ParticleEmitterData::default();
            let mut state = create_particle_emitter_state(99);
            let config = config_with(|c| {
                c.speed_min = 10.0;
                c.speed_max = 200.0;
                c.spread = std::f32::consts::PI;
                c.lifetime_min = 1.0;
                c.lifetime_max = 5.0;
            });
            emit_particle_burst(&mut data, &mut state, &config, 10, 0.0, 0.0);
            state.velocities[..20].to_vec()
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn is_particle_emitter_complete_looping_never_true() {
        let data = ParticleEmitterData::default();
        let state = create_particle_emitter_state(1);
        let infinite = config_with(|c| {
            c.spawn_rate = 0.0;
            c.duration = 0.0;
        });
        assert!(!is_particle_emitter_complete(&data, &state, &infinite));
        let looping = config_with(|c| {
            c.spawn_rate = 0.0;
            c.duration = 1.0;
            c.loop_ = true;
        });
        assert!(!is_particle_emitter_complete(&data, &state, &looping));
    }

    #[test]
    fn is_particle_emitter_complete_finite_after_drain() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.max_particles = 1000;
            c.lifetime_min = 0.5;
            c.lifetime_max = 0.5;
            c.duration = 1.0;
            c.loop_ = false;
        });
        assert!(!is_particle_emitter_complete(&data, &state, &config));
        for _ in 0..10 {
            update_particle_emitter(&mut data, &mut state, &config, 0.1, None, None);
        }
        assert!(data.particle_count > 0);
        assert!(!is_particle_emitter_complete(&data, &state, &config));
        for _ in 0..10 {
            update_particle_emitter(&mut data, &mut state, &config, 0.1, None, None);
        }
        assert_eq!(data.particle_count, 0);
        assert!(is_particle_emitter_complete(&data, &state, &config));
    }

    #[test]
    fn prewarm_particle_emitter_advances_age() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 20.0;
            c.lifetime_min = 1.0;
            c.lifetime_max = 1.0;
        });
        prewarm_particle_emitter(&mut data, &mut state, &config, 1.0, 1.0 / 60.0, None, None);
        assert!(data.particle_count > 0);
    }

    #[test]
    fn prewarm_particle_emitter_zero_step_no_hang() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        prewarm_particle_emitter(&mut data, &mut state, &config, 1.0, 0.0, None, None);
        assert!(data.particle_count > 0);
    }

    #[test]
    fn prewarm_particle_emitter_zero_duration_noop() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 100.0;
            c.lifetime_min = 1.0;
            c.lifetime_max = 1.0;
        });
        prewarm_particle_emitter(&mut data, &mut state, &config, 0.0, 1.0 / 60.0, None, None);
        assert_eq!(data.particle_count, 0);
    }

    #[test]
    fn update_particle_emitter_zero_delta_noop() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        let count_before = data.particle_count;
        let acc_before = state.spawn_accumulator;
        update_particle_emitter(&mut data, &mut state, &config, 0.0, None, None);
        assert_eq!(data.particle_count, count_before);
        assert_eq!(state.spawn_accumulator, acc_before);
    }

    #[test]
    fn update_particle_emitter_negative_delta_noop() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        let count_before = data.particle_count;
        let acc_before = state.spawn_accumulator;
        update_particle_emitter(&mut data, &mut state, &config, -1.0, None, None);
        assert_eq!(data.particle_count, count_before);
        assert_eq!(state.spawn_accumulator, acc_before);
    }

    #[test]
    fn update_particle_emitter_spawns_particles() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.max_particles = 100;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.particle_count, 10);
    }

    #[test]
    fn update_particle_emitter_respects_max_particles() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 100.0;
            c.max_particles = 5;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.particle_count, 5);
    }

    #[test]
    fn update_particle_emitter_ages_particles() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.particle_count, 1);
        update_particle_emitter(&mut data, &mut state, &config, 0.1, None, None);
        assert!((state.lifetimes[0] - 0.1).abs() < 1e-4);
    }

    #[test]
    fn update_particle_emitter_removes_expired() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 0.5;
            c.lifetime_max = 0.5;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.particle_count, 1);
        update_particle_emitter(&mut data, &mut state, &config, 0.6, None, None);
        assert_eq!(data.particle_count, 0);
    }

    #[test]
    fn update_particle_emitter_interpolates_alpha() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 1.0;
            c.lifetime_max = 1.0;
            c.alpha_start = 1.0;
            c.alpha_end = 0.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        update_particle_emitter(&mut data, &mut state, &config, 0.5, None, None);
        assert!((data.alphas[0] - 0.5).abs() < 0.1);
    }

    #[test]
    fn update_particle_emitter_interpolates_color() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 1.0;
            c.lifetime_max = 1.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.color_start_r = 1.0;
            c.color_start_g = 0.0;
            c.color_start_b = 0.0;
            c.color_end_r = 0.0;
            c.color_end_g = 0.0;
            c.color_end_b = 1.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        update_particle_emitter(&mut data, &mut state, &config, 0.5, None, None);
        assert!((data.colors[0] - 0.5).abs() < 0.1);
        assert!(data.colors[1].abs() < 0.1);
        assert!((data.colors[2] - 0.5).abs() < 0.1);
    }

    #[test]
    fn update_particle_emitter_animates_scale() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 1.0;
            c.lifetime_max = 1.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.scale_min = 2.0;
            c.scale_max = 2.0;
            c.scale_end = 0.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        update_particle_emitter(&mut data, &mut state, &config, 0.5, None, None);
        assert!((data.transforms[3] - 1.0).abs() < 0.1);
    }

    #[test]
    fn update_particle_emitter_rotates() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.spread = 0.0;
            c.rotation_speed_min = std::f32::consts::PI;
            c.rotation_speed_max = std::f32::consts::PI;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        let rot_before = data.transforms[2];
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        let rot_after = data.transforms[2];
        assert!((rot_after - rot_before - std::f32::consts::PI).abs() < 1e-3);
    }

    #[test]
    fn update_particle_emitter_circle_shape_within_radius() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 50.0;
            c.max_particles = 50;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.emitter_shape = ParticleEmitterShape::Circle;
            c.emitter_radius = 100.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        for i in 0..data.particle_count as usize {
            let x = data.transforms[i * 4];
            let y = data.transforms[i * 4 + 1];
            assert!((x * x + y * y).sqrt() <= 100.0 + 1e-3);
        }
    }

    #[test]
    fn update_particle_emitter_rect_shape_within_bounds() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 50.0;
            c.max_particles = 50;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.emitter_shape = ParticleEmitterShape::Rect;
            c.emitter_width = 200.0;
            c.emitter_height = 100.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        for i in 0..data.particle_count as usize {
            assert!(data.transforms[i * 4].abs() <= 100.0 + 1e-3);
            assert!(data.transforms[i * 4 + 1].abs() <= 50.0 + 1e-3);
        }
    }

    #[test]
    fn update_particle_emitter_one_shot_burst() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 0.0;
            c.burst_count = 20;
            c.burst_interval = 0.0;
            c.max_particles = 100;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0 / 60.0, None, None);
        assert_eq!(data.particle_count, 20);
        update_particle_emitter(&mut data, &mut state, &config, 1.0 / 60.0, None, None);
        assert_eq!(data.particle_count, 20);
    }

    #[test]
    fn update_particle_emitter_repeated_bursts() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 0.0;
            c.burst_count = 5;
            c.burst_interval = 1.0;
            c.max_particles = 100;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 0.01, None, None);
        assert_eq!(data.particle_count, 5);
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.particle_count, 10);
    }

    #[test]
    fn update_particle_emitter_flipbook() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.region_id_min = 0;
            c.frame_count = 3;
            c.frame_rate = 1.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.ids[0], 0);
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.ids[0], 1);
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.ids[0], 2);
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        assert_eq!(data.ids[0], 0);
    }

    #[test]
    fn update_particle_emitter_fires_on_spawn() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 3.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        let count = Arc::new(AtomicU32::new(0));
        let c2 = count.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_spawn: Some(Box::new(move |_, _| {
                c2.fetch_add(1, Ordering::SeqCst);
            })),
            on_death: None,
        };
        update_particle_emitter(&mut data, &mut state, &config, 1.0, Some(&callbacks), None);
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn update_particle_emitter_fires_on_death() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 0.5;
            c.lifetime_max = 0.5;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        let died = Arc::new(AtomicU32::new(0));
        let d2 = died.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_death: Some(Box::new(move |_, _| {
                d2.fetch_add(1, Ordering::SeqCst);
            })),
            on_spawn: None,
        };
        update_particle_emitter(&mut data, &mut state, &config, 0.6, Some(&callbacks), None);
        assert!(died.load(Ordering::SeqCst) > 0);
    }

    #[test]
    fn update_particle_emitter_world_space_flag_synced() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.world_space = true;
            c.spawn_rate = 0.0;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0 / 60.0, None, None);
        assert!(data.world_space);
    }

    #[test]
    fn update_particle_emitter_world_space_position_transformed() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.world_space = true;
        });
        let wt = WorldTransform2D {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 200.0,
            ty: 300.0,
        };
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, Some(&wt));
        assert_eq!(data.particle_count, 1);
        assert!((data.transforms[0] - 200.0).abs() < 1e-2);
        assert!((data.transforms[1] - 300.0).abs() < 1e-2);
    }

    #[test]
    fn update_particle_emitter_velocity_inheritance_world_space() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 0.0;
            c.burst_count = 1;
            c.burst_interval = 0.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.spread = 0.0;
            c.world_space = true;
            c.velocity_inheritance = 1.0;
        });
        let wt0 = WorldTransform2D {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        };
        update_particle_emitter(&mut data, &mut state, &config, 1.0 / 60.0, None, Some(&wt0));
        // Move the emitter and re-arm a burst.
        state.burst_timer = 0.0;
        let wt1 = WorldTransform2D { tx: 100.0, ..wt0 };
        update_particle_emitter(&mut data, &mut state, &config, 1.0 / 60.0, None, Some(&wt1));
        let vx = state.velocities[(data.particle_count as usize - 1) * 2];
        assert!(vx > 100.0);
    }

    #[test]
    fn update_particle_emitter_finite_stops_after_duration() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.max_particles = 1000;
            c.lifetime_min = 100.0;
            c.lifetime_max = 100.0;
            c.duration = 1.0;
            c.loop_ = false;
        });
        for _ in 0..20 {
            update_particle_emitter(&mut data, &mut state, &config, 0.1, None, None);
        }
        let after = data.particle_count;
        assert!(after > 0);
        assert!(after < 15);
        for _ in 0..20 {
            update_particle_emitter(&mut data, &mut state, &config, 0.1, None, None);
        }
        assert_eq!(data.particle_count, after);
    }

    #[test]
    fn update_particle_emitter_looping_keeps_spawning() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.max_particles = 1000;
            c.lifetime_min = 100.0;
            c.lifetime_max = 100.0;
            c.duration = 1.0;
            c.loop_ = true;
        });
        for _ in 0..30 {
            update_particle_emitter(&mut data, &mut state, &config, 0.1, None, None);
        }
        assert!(data.particle_count > 20);
    }

    #[test]
    fn update_particle_emitter_color_variance_in_range() {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let config = config_with(|c| {
            c.spawn_rate = 5.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.color_start_r = 0.5;
            c.color_start_variance_r = 0.5;
            c.color_end_r = 0.5;
            c.color_end_variance_r = 0.5;
        });
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        for i in 0..data.particle_count as usize {
            assert!(state.color_birth[i * 3] >= 0.0);
            assert!(state.color_birth[i * 3] <= 1.0);
        }
    }

    #[test]
    fn emit_particle_burst_sub_emitter_via_on_death() {
        // Parent: short-lived particles. Child: a burst at each parent death.
        let mut parent_data = ParticleEmitterData::default();
        let mut parent_state = create_particle_emitter_state(1);
        let parent_config = config_with(|c| {
            c.spawn_rate = 5.0;
            c.lifetime_min = 0.5;
            c.lifetime_max = 0.5;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
        });

        let child_data = Arc::new(std::sync::Mutex::new(ParticleEmitterData::default()));
        let child_state = Arc::new(std::sync::Mutex::new(create_particle_emitter_state(1)));
        let child_config = config_with(|c| {
            c.max_particles = 1000;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        let child_config = Arc::new(child_config);

        let deaths = Arc::new(AtomicU32::new(0));
        let d2 = deaths.clone();
        let cd = child_data.clone();
        let cs = child_state.clone();
        let cc = child_config.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_death: Some(Box::new(move |x, y| {
                d2.fetch_add(1, Ordering::SeqCst);
                let mut data = cd.lock().unwrap();
                let mut state = cs.lock().unwrap();
                emit_particle_burst(&mut data, &mut state, &cc, 6, x, y);
            })),
            on_spawn: None,
        };

        for _ in 0..30 {
            update_particle_emitter(
                &mut parent_data,
                &mut parent_state,
                &parent_config,
                1.0 / 30.0,
                Some(&callbacks),
                None,
            );
        }

        let total_deaths = deaths.load(Ordering::SeqCst);
        assert!(total_deaths > 0);
        assert_eq!(child_data.lock().unwrap().particle_count, total_deaths * 6);
    }
}
