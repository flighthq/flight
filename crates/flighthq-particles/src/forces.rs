//! Opt-in force-field pass for both particle paths.
//!
//! Import this module only for emitters that need forces; the core update
//! path is unaware of it.  Call these functions **before**
//! `update_particle_emitter` / `update_particle_objects` so the accumulated
//! acceleration is integrated into position the same frame.

use flighthq_types::{
    ParticleEmitterData, ParticleEmitterState, ParticleForce, ParticleObjectsState,
};

use crate::objects::ParticleObject;

const PARTICLE_TRANSFORM_STRIDE: usize = 4;

/// Apply force fields to a typed-array particle emitter, integrating the
/// resulting acceleration into per-particle velocity.
///
/// The `forces` slice is processed in order; multiple forces accumulate
/// additively.
pub fn apply_particle_forces(
    data: &ParticleEmitterData,
    state: &mut ParticleEmitterState,
    forces: &[ParticleForce],
    delta_time: f32,
) {
    if delta_time <= 0.0 || forces.is_empty() {
        return;
    }
    let count = data.particle_count as usize;
    for i in 0..count {
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        let vt = i * 2;
        let (ax, ay) = accumulate_forces(
            forces,
            data.transforms[tt],
            data.transforms[tt + 1],
            state.velocities[vt],
            state.velocities[vt + 1],
        );
        state.velocities[vt] += ax * delta_time;
        state.velocities[vt + 1] += ay * delta_time;
    }
}

/// Force-field pass for the object-pool path.
pub fn apply_particle_object_forces<T: ParticleObject>(
    objects: &[T],
    state: &mut ParticleObjectsState,
    forces: &[ParticleForce],
    delta_time: f32,
) {
    if delta_time <= 0.0 || forces.is_empty() {
        return;
    }
    for (i, obj) in objects.iter().enumerate() {
        if state.lifetimes[i * 2 + 1] <= 0.0 {
            continue; // dead slot
        }
        let vt = i * 2;
        let (ax, ay) = accumulate_forces(
            forces,
            obj.x(),
            obj.y(),
            state.velocities[vt],
            state.velocities[vt + 1],
        );
        state.velocities[vt] += ax * delta_time;
        state.velocities[vt + 1] += ay * delta_time;
    }
}

fn accumulate_forces(forces: &[ParticleForce], px: f32, py: f32, vx: f32, vy: f32) -> (f32, f32) {
    let mut ax = 0.0;
    let mut ay = 0.0;
    for force in forces {
        match force {
            ParticleForce::Wind(w) => {
                ax += w.x;
                ay += w.y;
            }
            ParticleForce::Drag(d) => {
                ax -= d.strength * vx;
                ay -= d.strength * vy;
            }
            ParticleForce::Attractor(a) => {
                let dx = a.x - px;
                let dy = a.y - py;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist <= 1e-6 {
                    continue;
                }
                let mag = a.strength * falloff_factor(a.falloff, dist, a.radius);
                if mag == 0.0 {
                    continue;
                }
                ax += (dx / dist) * mag;
                ay += (dy / dist) * mag;
            }
            ParticleForce::Vortex(v) => {
                let dx = px - v.x;
                let dy = py - v.y;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist <= 1e-6 {
                    continue;
                }
                let mag = v.strength * falloff_factor(v.falloff, dist, v.radius);
                if mag == 0.0 {
                    continue;
                }
                // Tangent = perpendicular to the radial direction.
                ax += (-dy / dist) * mag;
                ay += (dx / dist) * mag;
            }
            ParticleForce::Turbulence(t) => {
                let s = t.scale;
                ax += (value_noise(px * s, py * s, 0) * 2.0 - 1.0) * t.strength;
                ay += (value_noise(px * s, py * s, 1) * 2.0 - 1.0) * t.strength;
            }
        }
    }
    (ax, ay)
}

fn falloff_factor(falloff: flighthq_types::ForceFalloff, dist: f32, radius: Option<f32>) -> f32 {
    use flighthq_types::ForceFalloff;
    if let Some(r) = radius
        && r > 0.0
        && dist > r
    {
        return 0.0; // hard cutoff
    }
    match falloff {
        ForceFalloff::Linear => match radius {
            Some(r) if r > 0.0 => (1.0 - dist / r).max(0.0),
            _ => 1.0,
        },
        ForceFalloff::InverseSquare => {
            let d = if dist < 1.0 { 1.0 } else { dist }; // clamp near the source
            1.0 / (d * d)
        }
        ForceFalloff::None => 1.0,
    }
}

// Cheap deterministic 2-D value noise in [0, 1): hash the integer lattice and
// smoothstep-interpolate. Good enough for VFX turbulence, and fully reproducible.
fn value_noise(x: f32, y: f32, seed: i32) -> f32 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let fx = x - x0 as f32;
    let fy = y - y0 as f32;
    let ux = fx * fx * (3.0 - 2.0 * fx);
    let uy = fy * fy * (3.0 - 2.0 * fy);
    let n00 = hash2(x0, y0, seed);
    let n10 = hash2(x0 + 1, y0, seed);
    let n01 = hash2(x0, y0 + 1, seed);
    let n11 = hash2(x0 + 1, y0 + 1, seed);
    let nx0 = n00 + (n10 - n00) * ux;
    let nx1 = n01 + (n11 - n01) * ux;
    nx0 + (nx1 - nx0) * uy
}

fn hash2(x: i32, y: i32, seed: i32) -> f32 {
    // Mirrors the TS `Math.imul`-based hash, operating on wrapping i32 arithmetic.
    let mut h = (x.wrapping_mul(0x27d4eb2d))
        ^ (y.wrapping_mul(0x165667b1))
        ^ (seed.wrapping_add(1).wrapping_mul(0x9e3779b1u32 as i32));
    h = (h ^ ((h as u32 >> 15) as i32)).wrapping_mul(0x85ebca6bu32 as i32);
    h = (h ^ ((h as u32 >> 13) as i32)).wrapping_mul(0xc2b2ae35u32 as i32);
    let u = (h ^ ((h as u32 >> 16) as i32)) as u32;
    u as f32 / 4_294_967_296.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::emitter::update_particle_emitter;
    use crate::objects::update_particle_objects;
    use crate::state::{
        create_particle_emitter_config, create_particle_emitter_state,
        create_particle_objects_state,
    };
    use flighthq_types::{
        AttractorForce, DragForce, ForceFalloff, ParticleEmitterData, TurbulenceForce, VortexForce,
        WindForce,
    };

    #[derive(Default)]
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

    // Spawn a single stationary particle at the origin.
    fn one_particle() -> (ParticleEmitterData, ParticleEmitterState) {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 100.0;
        config.lifetime_max = 100.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        (data, state)
    }

    #[test]
    fn apply_particle_forces_attractor_pulls_toward_point() {
        let (mut data, mut state) = one_particle();
        data.transforms[0] = 0.0;
        data.transforms[1] = 0.0;
        let forces = vec![ParticleForce::Attractor(AttractorForce {
            x: 100.0,
            y: 0.0,
            strength: 50.0,
            radius: None,
            falloff: ForceFalloff::None,
        })];
        apply_particle_forces(&data, &mut state, &forces, 1.0);
        assert!((state.velocities[0] - 50.0).abs() < 1e-3);
        assert!(state.velocities[1].abs() < 1e-3);
    }

    #[test]
    fn apply_particle_forces_radius_hard_cutoff() {
        let (mut data, mut state) = one_particle();
        data.transforms[0] = 0.0;
        data.transforms[1] = 0.0;
        state.velocities[0] = 42.0;
        state.velocities[1] = 7.0;
        let forces = vec![ParticleForce::Attractor(AttractorForce {
            x: 1000.0,
            y: 0.0,
            strength: 50.0,
            radius: Some(50.0),
            falloff: ForceFalloff::None,
        })];
        apply_particle_forces(&data, &mut state, &forces, 1.0);
        assert_eq!(state.velocities[0], 42.0);
        assert_eq!(state.velocities[1], 7.0);
    }

    #[test]
    fn apply_particle_forces_vortex_applies_tangential() {
        let (mut data, mut state) = one_particle();
        data.transforms[0] = 10.0;
        data.transforms[1] = 0.0;
        let forces = vec![ParticleForce::Vortex(VortexForce {
            x: 0.0,
            y: 0.0,
            strength: 20.0,
            radius: None,
            falloff: ForceFalloff::None,
        })];
        apply_particle_forces(&data, &mut state, &forces, 1.0);
        assert!(state.velocities[0].abs() < 1e-3);
        assert!((state.velocities[1] - 20.0).abs() < 1e-3);
    }

    #[test]
    fn apply_particle_forces_drag_reduces_speed() {
        let (data, mut state) = one_particle();
        state.velocities[0] = 100.0;
        state.velocities[1] = 0.0;
        let forces = vec![ParticleForce::Drag(DragForce { strength: 0.5 })];
        apply_particle_forces(&data, &mut state, &forces, 1.0);
        assert!((state.velocities[0] - 50.0).abs() < 1e-3);
    }

    #[test]
    fn apply_particle_forces_wind_accumulates() {
        let (data, mut state) = one_particle();
        let forces = vec![ParticleForce::Wind(WindForce { x: 5.0, y: -3.0 })];
        apply_particle_forces(&data, &mut state, &forces, 2.0);
        assert!((state.velocities[0] - 10.0).abs() < 1e-3);
        assert!((state.velocities[1] - (-6.0)).abs() < 1e-3);
    }

    #[test]
    fn apply_particle_forces_turbulence_finite_and_deterministic() {
        let (mut a_data, mut a_state) = one_particle();
        a_data.transforms[0] = 12.5;
        a_data.transforms[1] = -7.5;
        let forces = vec![ParticleForce::Turbulence(TurbulenceForce {
            strength: 100.0,
            scale: 0.1,
        })];
        apply_particle_forces(&a_data, &mut a_state, &forces, 1.0);
        let (mut b_data, mut b_state) = one_particle();
        b_data.transforms[0] = 12.5;
        b_data.transforms[1] = -7.5;
        apply_particle_forces(&b_data, &mut b_state, &forces, 1.0);
        assert!(a_state.velocities[0].is_finite());
        assert_eq!(a_state.velocities[0], b_state.velocities[0]);
        assert_eq!(a_state.velocities[1], b_state.velocities[1]);
    }

    #[test]
    fn apply_particle_forces_composes_additively() {
        let (data, mut state) = one_particle();
        let forces = vec![
            ParticleForce::Wind(WindForce { x: 10.0, y: 0.0 }),
            ParticleForce::Wind(WindForce { x: 5.0, y: 0.0 }),
        ];
        apply_particle_forces(&data, &mut state, &forces, 1.0);
        assert!((state.velocities[0] - 15.0).abs() < 1e-3);
    }

    #[test]
    fn apply_particle_forces_empty_forces_noop() {
        let (data, mut state) = one_particle();
        state.velocities[0] = 42.0;
        apply_particle_forces(&data, &mut state, &[], 1.0);
        assert_eq!(state.velocities[0], 42.0);
    }

    #[test]
    fn apply_particle_forces_zero_delta_noop() {
        let (data, mut state) = one_particle();
        state.velocities[0] = 42.0;
        let forces = vec![ParticleForce::Wind(WindForce { x: 5.0, y: 0.0 })];
        apply_particle_forces(&data, &mut state, &forces, 0.0);
        assert_eq!(state.velocities[0], 42.0);
    }

    #[test]
    fn apply_particle_object_forces_empty_forces_noop() {
        let objects: Vec<TestObject> = vec![TestObject::default()];
        let mut state = create_particle_objects_state(1, 1);
        apply_particle_object_forces(&objects, &mut state, &[], 1.0);
        assert_eq!(state.velocities[0], 0.0);
    }

    #[test]
    fn apply_particle_object_forces_only_live_objects() {
        let mut objects: Vec<TestObject> = vec![TestObject::default(), TestObject::default()];
        let mut state = create_particle_objects_state(2, 1);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 100.0;
        config.lifetime_max = 100.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        let live_index = objects.iter().position(|o| o.visible).unwrap();
        let dead_index = if live_index == 0 { 1 } else { 0 };
        objects[live_index].x = 0.0;
        objects[live_index].y = 0.0;
        let forces = vec![ParticleForce::Wind(WindForce { x: 7.0, y: 0.0 })];
        apply_particle_object_forces(&objects, &mut state, &forces, 1.0);
        assert!((state.velocities[live_index * 2] - 7.0).abs() < 1e-3);
        assert_eq!(state.velocities[dead_index * 2], 0.0);
    }
}
