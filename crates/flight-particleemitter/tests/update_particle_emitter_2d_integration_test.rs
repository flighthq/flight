use flight_math::create_random_source;
use flight_particles::{
    EmitterShape, ParticleCollider, ParticleEmitter2D, ParticleEmitterConfig,
    ParticleEmitterState, ParticleForce, apply_particle_collisions, apply_particle_forces,
    normalize_particle_emitter_config,
};
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particleemitter::contract::{create_particle_emitter_2d, update_particle_emitter_2d};

fn default_emitter() -> ParticleEmitter2D {
    return create_particle_emitter_2d();
}

fn default_state() -> ParticleEmitterState {
    return create_particle_emitter_state(None);
}

fn seeded_state(seed: u32) -> ParticleEmitterState {
    return create_particle_emitter_state(Some(create_random_source(seed)));
}

// ── attractor forces via updateParticleEmitter2D ─────────────────────────────

#[test]
fn attractor_curves_trajectory() {
    let mut emitter = default_emitter();
    let mut state = default_state();
    let spawn_config = ParticleEmitterConfig {
        spawn_rate: 1.0,
        lifetime_min: 100.0,
        lifetime_max: 100.0,
        speed_min: 0.0,
        speed_max: 0.0,
        ..create_particle_emitter_config(None)
    };
    update_particle_emitter_2d(&mut emitter, &mut state, &spawn_config, 1.0, None, None);

    let config = ParticleEmitterConfig {
        spawn_rate: 0.0,
        speed_min: 0.0,
        speed_max: 0.0,
        lifetime_min: 100.0,
        lifetime_max: 100.0,
        ..create_particle_emitter_config(None)
    };
    let forces = [ParticleForce::AttractorForce {
        x: 100.0,
        y: 0.0,
        z: 0.0,
        strength: 200.0,
        falloff: None,
        radius: None,
    }];
    let start_x = emitter.data.transforms[0];
    for _ in 0..10 {
        apply_particle_forces(&emitter, &mut state, &forces, 1.0 / 60.0);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);
    }
    assert!(emitter.data.transforms[0] > start_x);
}

// ── collision settling ───────────────────────────────────────────────────────

#[test]
fn settling_particle_onto_floor() {
    let mut emitter = default_emitter();
    let mut state = default_state();
    let spawn_config = ParticleEmitterConfig {
        spawn_rate: 1.0,
        lifetime_min: 100.0,
        lifetime_max: 100.0,
        speed_min: 0.0,
        speed_max: 0.0,
        ..create_particle_emitter_config(None)
    };
    update_particle_emitter_2d(&mut emitter, &mut state, &spawn_config, 1.0, None, None);
    emitter.data.transforms[0] = 0.0;
    emitter.data.transforms[1] = 480.0;
    state.velocities[0] = 0.0;
    state.velocities[1] = 0.0;

    let config = ParticleEmitterConfig {
        spawn_rate: 0.0,
        lifetime_min: 100.0,
        lifetime_max: 100.0,
        gravity_y: 2000.0,
        ..create_particle_emitter_config(None)
    };
    let floor = [ParticleCollider::PlaneCollider {
        nx: 0.0,
        ny: -1.0,
        nz: 0.0,
        distance: -500.0,
        restitution: 0.0,
        friction: 0.0,
    }];
    for _ in 0..60 {
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);
        apply_particle_collisions(&mut emitter, &mut state, &floor);
    }
    assert!(emitter.data.transforms[1] <= 500.0 + 1e-3);
    assert!((emitter.data.transforms[1] - 500.0).abs() < 5.0); // resting on floor, digit 0
}

// ── lifetime curves ─────────────────────────────────────────────────────────

fn spawn_one(overrides: ParticleEmitterConfig) -> (ParticleEmitter2D, ParticleEmitterState, ParticleEmitterConfig) {
    let mut emitter = default_emitter();
    let mut state = default_state();
    let config = ParticleEmitterConfig {
        spawn_rate: 1.0,
        lifetime_min: 1.0,
        lifetime_max: 1.0,
        speed_min: 0.0,
        speed_max: 0.0,
        ..overrides
    };
    update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
    return (emitter, state, config);
}

#[test]
fn alpha_curve_drives_alpha_nonlinearly() {
    let (mut emitter, mut state, config) = spawn_one(ParticleEmitterConfig {
        alpha_curve: Some(vec![1.0, 0.0, 1.0]),
        ..create_particle_emitter_config(None)
    });
    update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.5, None, None);
    assert!((emitter.data.alphas[0] - 0.0).abs() < 0.05);
}

#[test]
fn color_curve_overrides_gradient() {
    let (mut emitter, mut state, config) = spawn_one(ParticleEmitterConfig {
        color_curve: Some(vec![0.0, 1.0, 0.0, 1.0, 0.0, 0.0]),
        color_start_r: 0.123,
        ..create_particle_emitter_config(None)
    });
    update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.5, None, None);
    assert!((emitter.data.colors[0] - 0.5).abs() < 0.05);
    assert!((emitter.data.colors[1] - 0.5).abs() < 0.05);
}

#[test]
fn scale_curve_multiplies_spawn_scale() {
    let (mut emitter, mut state, config) = spawn_one(ParticleEmitterConfig {
        scale_min: 2.0,
        scale_max: 2.0,
        scale_curve: Some(vec![1.0, 0.5, 0.0]),
        ..create_particle_emitter_config(None)
    });
    update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.5, None, None);
    assert!((emitter.data.transforms[3] - 1.0).abs() < 0.05);
}

#[test]
fn curve_driven_values_at_spawn() {
    let (emitter, _, _) = spawn_one(ParticleEmitterConfig {
        alpha_curve: Some(vec![0.25, 1.0]),
        ..create_particle_emitter_config(None)
    });
    assert!((emitter.data.alphas[0] - 0.25).abs() < 0.05);
}

// ── normalized config simulates ─────────────────────────────────────────────

#[test]
fn normalized_config_no_nan_poisoning() {
    let corrupt = ParticleEmitterConfig {
        spawn_rate: f32::NAN,
        lifetime_min: f32::NAN,
        lifetime_max: f32::NAN,
        gravity_y: f32::INFINITY,
        speed_min: f32::NAN,
        speed_max: f32::NAN,
        ..create_particle_emitter_config(None)
    };
    let safe = normalize_particle_emitter_config(Some(&corrupt));
    let mut emitter = default_emitter();
    let mut state = default_state();
    for _ in 0..30 {
        update_particle_emitter_2d(&mut emitter, &mut state, &safe, 1.0 / 60.0, None, None);
    }
    assert!(emitter.data.particle_count > 0);
    for i in 0..(emitter.data.particle_count * 4) {
        assert!(emitter.data.transforms[i].is_finite());
    }
}

// ── signals: skipped (Signal is a placeholder in Rust IR) ────────────────────
// onEmitterComplete, onParticleDeath, onParticleSpawn tests require a working
// Signal emit/subscribe mechanism. The Rust IR has an empty Signal struct.

// ── seeded determinism ──────────────────────────────────────────────────────

fn simulate(seed: u32) -> Vec<f32> {
    let mut emitter = default_emitter();
    let mut state = seeded_state(seed);
    let config = ParticleEmitterConfig {
        spawn_rate: 20.0,
        max_particles: 100.0,
        lifetime_min: 0.5,
        lifetime_max: 1.5,
        speed_min: 10.0,
        speed_max: 200.0,
        spread: std::f32::consts::PI,
        emitter_shape: EmitterShape::Circle,
        emitter_radius: 25.0,
        color_start_variance_r: 0.5,
        ..create_particle_emitter_config(None)
    };
    for _ in 0..30 {
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);
    }
    let n = emitter.data.particle_count * 4;
    return emitter.data.transforms[..n].to_vec();
}

#[test]
fn seeded_identical_produces_identical() {
    assert_eq!(simulate(42), simulate(42));
}

#[test]
fn different_seeds_diverge() {
    assert_ne!(simulate(42), simulate(43));
}
