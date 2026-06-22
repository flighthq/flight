//! `flighthq-particles` — particle system: emitters, spawn rules, lifetime,
//! forces, colliders, and curve utilities.
//!
//! Two parallel simulation paths are provided:
//! - **Typed-array emitter** (`ParticleEmitterData`) — SoA layout for batch
//!   rendering via the sprite/atlas pipeline.
//! - **Object-pool emitter** (`ParticleObject` trait) — drives arbitrary
//!   user-supplied display objects with per-object visibility, alpha, and scale.
//!
//! Forces and colliders are fully opt-in: import only the modules you need.

pub mod collisions;
pub mod curve;
pub mod emitter;
pub mod forces;
pub mod objects;
pub mod state;
pub mod validate;

// Re-export the particle types defined in the types crate.
pub use flighthq_types::{
    // Particle simulation types
    AttractorForce,
    CircleCollider,
    ColliderMode,
    CollisionResponse,
    ColorKeyframe,
    CurveKeyframe,
    DragForce,
    ForceFalloff,
    ParticleBlendMode,
    ParticleCollider,
    ParticleConfigIssue,
    ParticleConfigIssueSeverity,
    ParticleCurve,
    ParticleEmitterCallbacks,
    ParticleEmitterConfig,
    // Display data
    ParticleEmitterData,
    ParticleEmitterShape,
    ParticleEmitterState,
    ParticleForce,
    ParticleObjectsState,
    ParticleObjectsUpdateOptions,
    PlaneCollider,
    RectangleCollider,
    TurbulenceForce,
    VortexForce,
    WindForce,
    WorldTransform2D,
};

pub use collisions::{apply_particle_collisions, apply_particle_object_collisions};
pub use curve::{
    build_particle_color_curve, build_particle_curve, particle_color_curve_from_keyframes,
    particle_color_curve_to_keyframes, particle_curve_from_keyframes, particle_curve_to_keyframes,
    sample_particle_color_curve, sample_particle_curve,
};
pub use emitter::{
    emit_particle_burst, is_particle_emitter_complete, prewarm_particle_emitter,
    update_particle_emitter,
};
pub use forces::{apply_particle_forces, apply_particle_object_forces};
pub use objects::{ParticleObject, is_particle_objects_complete, update_particle_objects};
pub use state::{
    create_particle_emitter_config, create_particle_emitter_state, create_particle_objects_state,
    ensure_particle_emitter_state_capacity, ensure_particle_objects_state_capacity,
};
pub use validate::{normalize_particle_emitter_config, validate_particle_emitter_config};
