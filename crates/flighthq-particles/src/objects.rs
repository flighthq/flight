//! Object-pool particle path — drives arbitrary user-supplied objects
//! (anything with `x`, `y`, `alpha`, `scale_x`, `scale_y`, `rotation`,
//! `visible`) using the same `ParticleEmitterConfig` as the typed-array path.
//!
//! The caller owns a fixed-capacity slice of objects; the system recycles dead
//! slots for new spawns without allocating.

use flighthq_types::{
    ParticleEmitterConfig, ParticleEmitterShape, ParticleObjectsState,
    ParticleObjectsUpdateOptions,
};

use crate::curve::sample_particle_curve;
use crate::state::{ensure_particle_objects_state_capacity, next_random};

const TWO_PI: f32 = std::f32::consts::PI * 2.0;

/// Trait implemented by anything that can act as a particle object.
///
/// The update pass reads and writes these fields to simulate particle motion.
pub trait ParticleObject {
    fn x(&self) -> f32;
    fn y(&self) -> f32;
    fn alpha(&self) -> f32;
    fn rotation(&self) -> f32;
    fn scale_x(&self) -> f32;
    fn scale_y(&self) -> f32;
    fn visible(&self) -> bool;

    fn set_x(&mut self, v: f32);
    fn set_y(&mut self, v: f32);
    fn set_alpha(&mut self, v: f32);
    fn set_rotation(&mut self, v: f32);
    fn set_scale_x(&mut self, v: f32);
    fn set_scale_y(&mut self, v: f32);
    fn set_visible(&mut self, v: bool);
}

/// Return `true` once a finite, non-looping object emitter has finished
/// spawning **and** all objects are invisible — safe to recycle.
/// Always returns `false` for infinite or looping emitters.
pub fn is_particle_objects_complete<T: ParticleObject>(
    objects: &[T],
    state: &ParticleObjectsState,
    config: &ParticleEmitterConfig,
) -> bool {
    if config.duration <= 0.0 || config.loop_ {
        return false;
    }
    if state.emitter_age < config.duration {
        return false;
    }
    !objects.iter().any(|o| o.visible())
}

/// Advance the object-pool emitter by `delta_time` seconds: age and kill
/// expired objects, integrate gravity and velocity, update per-object
/// alpha/scale/rotation, then spawn new objects into dead slots.
///
/// Call [`apply_particle_object_forces`](crate::apply_particle_object_forces)
/// **before** and
/// [`apply_particle_object_collisions`](crate::apply_particle_object_collisions)
/// **after** this function when those features are needed.
pub fn update_particle_objects<T: ParticleObject>(
    objects: &mut [T],
    state: &mut ParticleObjectsState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    options: Option<&ParticleObjectsUpdateOptions>,
) {
    let n = objects.len();
    if n == 0 {
        return;
    }
    // Skip zero/negative time steps: nothing to simulate, and it avoids dividing
    // by delta_time for velocity inheritance.
    if delta_time <= 0.0 {
        return;
    }
    ensure_particle_objects_state_capacity(state, n);

    let gx = config.gravity_x * delta_time;
    let gy = config.gravity_y * delta_time;
    let has_alpha_curve = config.alpha_curve.as_ref().map(|c| c.len()).unwrap_or(0) > 0;
    let has_scale_curve = config.scale_curve.as_ref().map(|c| c.len()).unwrap_or(0) > 0;
    let has_scale_anim = config.scale_end != 1.0 || has_scale_curve;
    let has_rot_speed = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;

    // Emitter velocity for inheritance.
    let emitter_x = options.and_then(|o| o.emitter_x).unwrap_or(f32::NAN);
    let emitter_y = options.and_then(|o| o.emitter_y).unwrap_or(f32::NAN);
    let mut emitter_vel_x = 0.0;
    let mut emitter_vel_y = 0.0;
    if config.velocity_inheritance != 0.0 && !emitter_x.is_nan() && !state.prev_x.is_nan() {
        emitter_vel_x = (emitter_x - state.prev_x) / delta_time;
        emitter_vel_y = (emitter_y - state.prev_y) / delta_time;
    }

    let on_death = options.and_then(|o| o.on_death.as_ref());
    let on_spawn = options.and_then(|o| o.on_spawn.as_ref());

    // Phase 1: update live objects, kill expired ones.
    for (i, obj) in objects.iter_mut().enumerate() {
        let lt = i * 2;
        if state.lifetimes[lt + 1] <= 0.0 {
            continue;
        }
        state.lifetimes[lt] += delta_time;
        if state.lifetimes[lt] >= state.lifetimes[lt + 1] {
            state.lifetimes[lt + 1] = 0.0;
            obj.set_visible(false);
            if let Some(cb) = on_death {
                cb();
            }
            continue;
        }
        let vt = i * 2;
        state.velocities[vt] += gx;
        state.velocities[vt + 1] += gy;
        obj.set_x(obj.x() + state.velocities[vt] * delta_time);
        obj.set_y(obj.y() + state.velocities[vt + 1] * delta_time);
        let life_fraction = state.lifetimes[lt] / state.lifetimes[lt + 1];
        obj.set_alpha(if has_alpha_curve {
            sample_particle_curve(config.alpha_curve.as_ref().unwrap(), life_fraction)
        } else {
            config.alpha_start + (config.alpha_end - config.alpha_start) * life_fraction
        });
        if has_scale_anim {
            let factor = if has_scale_curve {
                sample_particle_curve(config.scale_curve.as_ref().unwrap(), life_fraction)
            } else {
                1.0 + (config.scale_end - 1.0) * life_fraction
            };
            let s = state.scales[i] * factor;
            obj.set_scale_x(s);
            obj.set_scale_y(s);
        }
        if has_rot_speed {
            obj.set_rotation(obj.rotation() + state.rotation_speeds[i] * delta_time);
        }
    }

    // Phase 2: emission.
    let emitting = config.duration <= 0.0 || config.loop_ || state.emitter_age < config.duration;
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

    // Phase 3: spawn into dead slots.
    if to_spawn > 0 {
        let base_angle = config.direction_y.atan2(config.direction_x);
        let rot_speed_range = config.rotation_speed_max - config.rotation_speed_min;

        for (i, obj) in objects.iter_mut().enumerate() {
            if to_spawn <= 0 {
                break;
            }
            let lt = i * 2;
            if state.lifetimes[lt + 1] > 0.0 {
                continue;
            }

            let lifetime = config.lifetime_min
                + next_random(&mut state.random_state)
                    * (config.lifetime_max - config.lifetime_min);
            state.lifetimes[lt] = 0.0;
            state.lifetimes[lt + 1] = lifetime;

            let angle = base_angle
                + (next_random(&mut state.random_state) - 0.5) * 2.0 * config.spread;
            let speed = config.speed_min
                + next_random(&mut state.random_state) * (config.speed_max - config.speed_min);
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

            // Spawn position offset from emitter shape.
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

            let spawn_scale = config.scale_min
                + next_random(&mut state.random_state) * (config.scale_max - config.scale_min);
            state.scales[i] = spawn_scale;
            state.rotation_speeds[i] = if has_rot_speed {
                config.rotation_speed_min + next_random(&mut state.random_state) * rot_speed_range
            } else {
                0.0
            };

            obj.set_x(spawn_x);
            obj.set_y(spawn_y);
            obj.set_rotation(angle);
            let spawn_factor = if has_scale_curve {
                spawn_scale * sample_particle_curve(config.scale_curve.as_ref().unwrap(), 0.0)
            } else {
                spawn_scale
            };
            obj.set_scale_x(spawn_factor);
            obj.set_scale_y(spawn_factor);
            obj.set_alpha(if has_alpha_curve {
                sample_particle_curve(config.alpha_curve.as_ref().unwrap(), 0.0)
            } else {
                config.alpha_start
            });
            obj.set_visible(true);
            to_spawn -= 1;
            if let Some(cb) = on_spawn {
                cb(spawn_x, spawn_y);
            }
        }
    }

    // Track emitter position for next frame's velocity inheritance.
    if !emitter_x.is_nan() {
        state.prev_x = emitter_x;
        state.prev_y = emitter_y;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{create_particle_emitter_config, create_particle_objects_state};
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[derive(Default, Clone)]
    struct TestObject {
        x: f32,
        y: f32,
        alpha: f32,
        rotation: f32,
        scale_x: f32,
        scale_y: f32,
        visible: bool,
    }

    impl ParticleObject for TestObject {
        fn x(&self) -> f32 {
            self.x
        }
        fn y(&self) -> f32 {
            self.y
        }
        fn alpha(&self) -> f32 {
            self.alpha
        }
        fn rotation(&self) -> f32 {
            self.rotation
        }
        fn scale_x(&self) -> f32 {
            self.scale_x
        }
        fn scale_y(&self) -> f32 {
            self.scale_y
        }
        fn visible(&self) -> bool {
            self.visible
        }
        fn set_x(&mut self, v: f32) {
            self.x = v;
        }
        fn set_y(&mut self, v: f32) {
            self.y = v;
        }
        fn set_alpha(&mut self, v: f32) {
            self.alpha = v;
        }
        fn set_rotation(&mut self, v: f32) {
            self.rotation = v;
        }
        fn set_scale_x(&mut self, v: f32) {
            self.scale_x = v;
        }
        fn set_scale_y(&mut self, v: f32) {
            self.scale_y = v;
        }
        fn set_visible(&mut self, v: bool) {
            self.visible = v;
        }
    }

    fn objects(n: usize) -> Vec<TestObject> {
        vec![TestObject::default(); n]
    }

    fn config_with(f: impl FnOnce(&mut ParticleEmitterConfig)) -> ParticleEmitterConfig {
        let mut config = create_particle_emitter_config(None);
        f(&mut config);
        config
    }

    fn live_count(objects: &[TestObject]) -> usize {
        objects.iter().filter(|o| o.visible).count()
    }

    #[test]
    fn is_particle_objects_complete_looping_never_true() {
        let objs = objects(1);
        let state = create_particle_objects_state(1, 1);
        let infinite = config_with(|c| c.duration = 0.0);
        assert!(!is_particle_objects_complete(&objs, &state, &infinite));
        let looping = config_with(|c| {
            c.duration = 1.0;
            c.loop_ = true;
        });
        assert!(!is_particle_objects_complete(&objs, &state, &looping));
    }

    #[test]
    fn is_particle_objects_complete_after_drain() {
        let mut objs = objects(50);
        let mut state = create_particle_objects_state(50, 1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.lifetime_min = 0.5;
            c.lifetime_max = 0.5;
            c.duration = 1.0;
            c.loop_ = false;
        });
        assert!(!is_particle_objects_complete(&objs, &state, &config));
        for _ in 0..10 {
            update_particle_objects(&mut objs, &mut state, &config, 0.1, None);
        }
        assert!(!is_particle_objects_complete(&objs, &state, &config));
        for _ in 0..10 {
            update_particle_objects(&mut objs, &mut state, &config, 0.1, None);
        }
        assert!(!objs.iter().any(|o| o.visible));
        assert!(is_particle_objects_complete(&objs, &state, &config));
    }

    #[test]
    fn update_particle_objects_empty_noop() {
        let mut objs: Vec<TestObject> = Vec::new();
        let mut state = create_particle_objects_state(0, 1);
        let config = create_particle_emitter_config(None);
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
    }

    #[test]
    fn update_particle_objects_zero_delta_noop() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
        let config = config_with(|c| {
            c.spawn_rate = 0.0;
            c.burst_count = 1;
            c.burst_interval = 0.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.spread = 0.0;
            c.velocity_inheritance = 1.0;
        });
        let opt0 = ParticleObjectsUpdateOptions {
            emitter_x: Some(0.0),
            emitter_y: Some(0.0),
            ..Default::default()
        };
        update_particle_objects(&mut objs, &mut state, &config, 1.0 / 60.0, Some(&opt0));
        let live_before = live_count(&objs);
        state.burst_timer = 0.0;
        let opt1 = ParticleObjectsUpdateOptions {
            emitter_x: Some(100.0),
            emitter_y: Some(0.0),
            ..Default::default()
        };
        update_particle_objects(&mut objs, &mut state, &config, 0.0, Some(&opt1));
        assert_eq!(live_count(&objs), live_before);
        assert!(state.velocities[0].is_finite());
        assert!(state.velocities[1].is_finite());
    }

    #[test]
    fn update_particle_objects_negative_delta_noop() {
        let mut objs = objects(2);
        let mut state = create_particle_objects_state(2, 1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        let live_before = live_count(&objs);
        update_particle_objects(&mut objs, &mut state, &config, -1.0, None);
        assert_eq!(live_count(&objs), live_before);
    }

    #[test]
    fn update_particle_objects_spawns_into_dead_slots() {
        let mut objs = objects(3);
        let mut state = create_particle_objects_state(3, 1);
        let config = config_with(|c| {
            c.spawn_rate = 2.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        assert_eq!(live_count(&objs), 2);
    }

    #[test]
    fn update_particle_objects_spawns_at_origin_visible() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        assert!(objs[0].visible);
        assert_eq!(objs[0].x, 0.0);
        assert_eq!(objs[0].y, 0.0);
    }

    #[test]
    fn update_particle_objects_kills_expired() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 0.5;
            c.lifetime_max = 0.5;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        assert!(objs[0].visible);
        update_particle_objects(&mut objs, &mut state, &config, 0.6, None);
        assert!(!objs[0].visible);
    }

    #[test]
    fn update_particle_objects_moves_with_gravity() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.gravity_x = 100.0;
            c.gravity_y = 0.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        assert!(objs[0].x > 0.0);
    }

    #[test]
    fn update_particle_objects_fades_alpha() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 1.0;
            c.lifetime_max = 1.0;
            c.alpha_start = 1.0;
            c.alpha_end = 0.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objs, &mut state, &config, 0.5, None);
        assert!((objs[0].alpha - 0.5).abs() < 0.1);
    }

    #[test]
    fn update_particle_objects_reuses_dead_slots() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
        let config = config_with(|c| {
            c.spawn_rate = 2.0;
            c.lifetime_min = 0.1;
            c.lifetime_max = 0.1;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        assert!(objs[0].visible);
    }

    #[test]
    fn update_particle_objects_animates_scale() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
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
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objs, &mut state, &config, 0.5, None);
        assert!((objs[0].scale_x - 1.0).abs() < 0.1);
    }

    #[test]
    fn update_particle_objects_rotates() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
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
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        let rot_before = objs[0].rotation;
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        assert!((objs[0].rotation - rot_before - std::f32::consts::PI).abs() < 1e-3);
    }

    #[test]
    fn update_particle_objects_circle_shape() {
        let mut objs = objects(20);
        let mut state = create_particle_objects_state(20, 1);
        let config = config_with(|c| {
            c.spawn_rate = 20.0;
            c.max_particles = 20;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.emitter_shape = ParticleEmitterShape::Circle;
            c.emitter_radius = 50.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        for o in objs.iter().filter(|o| o.visible) {
            assert!((o.x * o.x + o.y * o.y).sqrt() <= 50.0 + 1e-3);
        }
    }

    #[test]
    fn update_particle_objects_one_shot_burst() {
        let mut objs = objects(30);
        let mut state = create_particle_objects_state(30, 1);
        let config = config_with(|c| {
            c.spawn_rate = 0.0;
            c.burst_count = 10;
            c.burst_interval = 0.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0 / 60.0, None);
        assert_eq!(live_count(&objs), 10);
        update_particle_objects(&mut objs, &mut state, &config, 1.0 / 60.0, None);
        assert_eq!(live_count(&objs), 10);
    }

    #[test]
    fn update_particle_objects_fires_on_spawn() {
        let mut objs = objects(2);
        let mut state = create_particle_objects_state(2, 1);
        let config = config_with(|c| {
            c.spawn_rate = 2.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
        });
        let count = Arc::new(AtomicU32::new(0));
        let c2 = count.clone();
        let options = ParticleObjectsUpdateOptions {
            on_spawn: Some(Box::new(move |_, _| {
                c2.fetch_add(1, Ordering::SeqCst);
            })),
            ..Default::default()
        };
        update_particle_objects(&mut objs, &mut state, &config, 1.0, Some(&options));
        assert_eq!(count.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn update_particle_objects_finite_stops_after_duration() {
        let mut objs = objects(50);
        let mut state = create_particle_objects_state(50, 1);
        let config = config_with(|c| {
            c.spawn_rate = 10.0;
            c.lifetime_min = 100.0;
            c.lifetime_max = 100.0;
            c.duration = 1.0;
            c.loop_ = false;
        });
        for _ in 0..20 {
            update_particle_objects(&mut objs, &mut state, &config, 0.1, None);
        }
        let after = live_count(&objs);
        assert!(after > 0);
        for _ in 0..20 {
            update_particle_objects(&mut objs, &mut state, &config, 0.1, None);
        }
        assert_eq!(live_count(&objs), after);
    }

    #[test]
    fn update_particle_objects_curves() {
        let mut objs = objects(1);
        let mut state = create_particle_objects_state(1, 1);
        let config = config_with(|c| {
            c.spawn_rate = 1.0;
            c.lifetime_min = 1.0;
            c.lifetime_max = 1.0;
            c.speed_min = 0.0;
            c.speed_max = 0.0;
            c.scale_min = 4.0;
            c.scale_max = 4.0;
            c.alpha_curve = Some(vec![1.0, 0.0, 1.0]);
            c.scale_curve = Some(vec![1.0, 0.5, 0.0]);
        });
        update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objs, &mut state, &config, 0.5, None);
        assert!(objs[0].alpha.abs() < 0.05);
        assert!((objs[0].scale_x - 2.0).abs() < 0.05);
    }

    #[test]
    fn update_particle_objects_deterministic_rng() {
        let config = config_with(|c| {
            c.spawn_rate = 5.0;
            c.lifetime_min = 10.0;
            c.lifetime_max = 10.0;
            c.speed_min = 10.0;
            c.speed_max = 200.0;
            c.spread = std::f32::consts::PI;
        });
        let run = || {
            let mut objs = objects(20);
            let mut state = create_particle_objects_state(20, 12345);
            update_particle_objects(&mut objs, &mut state, &config, 1.0, None);
            objs.iter().map(|o| o.rotation).collect::<Vec<f32>>()
        };
        assert_eq!(run(), run());
    }
}
