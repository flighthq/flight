mod apply_particle_collisions;
mod apply_particle_forces;
mod curve;
mod particle_emitter_config;
mod particle_emitter_signals;
mod particle_emitter_state;
mod particle_objects_state;
mod particle_spawn_offset;
mod step_particle_objects;
mod sugar;
mod types;
mod update_particle_objects;
mod validate_particle_emitter_config;

pub mod contract;

// Public lane: the names exported by the pinned TS `index.ts`, plus the Rust types and their
// constructors that the public signatures require. Contract-only seams (initialize_*,
// ensure_*_capacity, write_particle_spawn_offset, internal helpers) stay in `contract`.

// types
pub use contract::ColliderMode;
pub use contract::ColorKeyframe;
pub use contract::CurveKeyframe;
pub use contract::EmitterShape;
pub use contract::ForceFalloff;
pub use contract::ParticleCollider;
pub use contract::ParticleConfigIssue;
pub use contract::ParticleEmitterCallbacks;
pub use contract::ParticleEmitterConfig;
pub use contract::ParticleEmitterConfigOptions;
pub use contract::ParticleEmitterSignals;
pub use contract::ParticleEmitterState;
pub use contract::ParticleForce;
pub use contract::ParticleObject;
pub use contract::ParticleObjectCallbacks;
pub use contract::ParticleObjectsState;
pub use contract::ParticleObjectsUpdateOptions;
pub use contract::Signal;
pub use contract::create_signal;

// applyParticleCollisions — export *
pub use contract::apply_particle_collisions;
pub use contract::apply_particle_object_collisions;

// applyParticleForces — export *
pub use contract::apply_particle_forces;
pub use contract::apply_particle_object_forces;

// curve — export *
pub use contract::build_particle_color_curve;
pub use contract::build_particle_curve;
pub use contract::lerp_hsv_direct;
pub use contract::lerp_hsv_in_place;
pub use contract::particle_color_curve_from_keyframes;
pub use contract::particle_color_curve_to_keyframes;
pub use contract::particle_curve_from_keyframes;
pub use contract::particle_curve_to_keyframes;
pub use contract::sample_particle_color_curve;
pub use contract::sample_particle_curve;

// particleEmitterConfig — export *
pub use contract::create_particle_emitter_config;
pub use contract::create_particle_emitter_config_options;

// particleEmitterSignals — selective (index.ts exports only enable + get)
pub use contract::enable_particle_emitter_signals;
pub use contract::get_particle_emitter_signals;

// particleEmitterState — selective (index.ts exports only create)
pub use contract::create_particle_emitter_state;
pub use contract::PARTICLE_VELOCITY_STRIDE;

// particleObjectsState — selective (index.ts exports only create)
pub use contract::create_particle_objects_state;

// stepParticleObjects — export *
pub use contract::step_particle_objects;

// updateParticleObjects — export *
pub use contract::is_particle_objects_complete;
pub use contract::update_particle_objects;

// validateParticleEmitterConfig — export *
pub use contract::normalize_particle_emitter_config;
pub use contract::validate_particle_emitter_config;
