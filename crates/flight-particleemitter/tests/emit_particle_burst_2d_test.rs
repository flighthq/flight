use std::cell::RefCell;
use std::rc::Rc;

use flight_math::create_random_source;
use flight_particles::{ParticleEmitter2D, ParticleEmitterConfig, ParticleEmitterState};
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particleemitter::*;

fn make_config(overrides: ParticleEmitterConfig) -> ParticleEmitterConfig {
    return create_particle_emitter_config(Some(&overrides));
}

mod emit_particle_burst_2d {
    use super::*;

    #[test]
    fn spawns_the_requested_count_at_the_given_point() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            speed_min: 0.0,
            speed_max: 0.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        let n = emit_particle_burst_2d(&mut emitter, &mut state, &config, 8.0, 200.0, 300.0, None);
        assert_eq!(n, 8);
        assert_eq!(emitter.data.particle_count, 8);
        for i in 0..8 {
            assert!((emitter.data.transforms[i * 4] - 200.0).abs() < 0.01);
            assert!((emitter.data.transforms[i * 4 + 1] - 300.0).abs() < 0.01);
        }
    }

    #[test]
    fn respects_max_particles_and_returns_the_actual_spawn_count() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            max_particles: 5.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        assert_eq!(emit_particle_burst_2d(&mut emitter, &mut state, &config, 100.0, 0.0, 0.0, None), 5);
        assert_eq!(emitter.data.particle_count, 5);
    }

    #[test]
    fn adds_to_existing_particles_rather_than_replacing_them() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            max_particles: 100.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_2d(&mut emitter, &mut state, &config, 3.0, 0.0, 0.0, None);
        emit_particle_burst_2d(&mut emitter, &mut state, &config, 4.0, 0.0, 0.0, None);
        assert_eq!(emitter.data.particle_count, 7);
    }

    #[test]
    fn does_not_touch_the_emitters_continuous_emission_bookkeeping() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_2d(&mut emitter, &mut state, &config, 3.0, 0.0, 0.0, None);
        assert_eq!(state.spawn_accumulator, 0.0);
        assert_eq!(state.emitter_age, 0.0);
    }

    #[test]
    fn is_deterministic_with_a_seeded_state() {
        let run = || -> Vec<f32> {
            let mut emitter = create_particle_emitter_2d();
            let mut state = create_particle_emitter_state(Some(create_random_source(99)));
            let config = make_config(ParticleEmitterConfig {
                speed_min: 10.0,
                speed_max: 200.0,
                spread: std::f32::consts::PI,
                lifetime_min: 1.0,
                lifetime_max: 5.0,
                ..create_particle_emitter_config(None)
            });
            emit_particle_burst_2d(&mut emitter, &mut state, &config, 10.0, 0.0, 0.0, None);
            return state.velocities[..20].to_vec();
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn modulates_spawn_color_and_alpha_by_a_packed_tint() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            alpha_start: 1.0,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_2d(&mut emitter, &mut state, &config, 2.0, 0.0, 0.0, Some(0x8040c0ff));
        for i in 0..2 {
            assert!((emitter.data.colors[i * 3] - 0x80 as f32 / 255.0).abs() < 0.01);
            assert!((emitter.data.colors[i * 3 + 1] - 0x40 as f32 / 255.0).abs() < 0.01);
            assert!((emitter.data.colors[i * 3 + 2] - 0xc0 as f32 / 255.0).abs() < 0.01);
            assert!((emitter.data.alphas[i] - 1.0).abs() < 0.01);
        }
    }

    #[test]
    fn multiplies_a_non_white_config_color_by_the_tint() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            color_start_r: 0.5,
            color_start_g: 1.0,
            color_start_b: 0.25,
            alpha_start: 1.0,
            ..create_particle_emitter_config(None)
        });
        // Tint 0xffffff80: white RGB (no color change) with half alpha.
        emit_particle_burst_2d(&mut emitter, &mut state, &config, 1.0, 0.0, 0.0, Some(0xffffff80));
        assert!((emitter.data.colors[0] - 0.5).abs() < 0.01);
        assert!((emitter.data.colors[1] - 1.0).abs() < 0.01);
        assert!((emitter.data.colors[2] - 0.25).abs() < 0.01);
        assert!((emitter.data.alphas[0] - 0x80 as f32 / 255.0).abs() < 0.01);
    }

    #[test]
    fn leaves_color_untinted_when_no_tint_is_passed() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_2d(&mut emitter, &mut state, &config, 1.0, 0.0, 0.0, None);
        assert!((emitter.data.colors[0] - 1.0).abs() < 0.01);
        assert!((emitter.data.colors[1] - 1.0).abs() < 0.01);
        assert!((emitter.data.colors[2] - 1.0).abs() < 0.01);
    }

    #[test]
    fn composes_into_a_death_sub_emitter_via_on_death() {
        let mut parent = create_particle_emitter_2d();
        let mut parent_state = create_particle_emitter_state(None);
        let parent_config = make_config(ParticleEmitterConfig {
            spawn_rate: 5.0,
            lifetime_min: 0.5,
            lifetime_max: 0.5,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });

        let child_emitter = Rc::new(RefCell::new(create_particle_emitter_2d()));
        let child_state_rc = Rc::new(RefCell::new(create_particle_emitter_state(None)));
        let child_config = make_config(ParticleEmitterConfig {
            max_particles: 1000.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        let deaths = Rc::new(RefCell::new(0u32));
        let ce = child_emitter.clone();
        let cs = child_state_rc.clone();
        let cc = child_config.clone();
        let dc = deaths.clone();
        let on_death = move |x: f32, y: f32, _z: f32| {
            *dc.borrow_mut() += 1;
            emit_particle_burst_2d(
                &mut ce.borrow_mut(),
                &mut cs.borrow_mut(),
                &cc,
                6.0,
                x,
                y,
                None,
            );
        };
        let callbacks = ParticleEmitterCallbacks {
            on_death: Some(Box::new(on_death)),
            on_spawn: None,
        };

        for _ in 0..30 {
            update_particle_emitter_2d(
                &mut parent,
                &mut parent_state,
                &parent_config,
                1.0 / 30.0,
                Some(&callbacks),
                None,
            );
        }

        let d = *deaths.borrow();
        assert!(d > 0);
        assert_eq!(child_emitter.borrow().data.particle_count, d as usize * 6);
    }
}
