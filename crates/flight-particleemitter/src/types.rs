pub const PARTICLE_TRANSFORM_STRIDE: usize = 4;
pub const PARTICLE_COLOR_STRIDE: usize = 3;
pub const PARTICLE_VELOCITY_STRIDE_2D: usize = 2;
pub const PARTICLE_VELOCITY_STRIDE_3D: usize = 3;
pub const PARTICLE_EMITTER_DELETED_ID: u16 = 0xffff;

/// Simple 3D emitter struct: extends ParticleEmitterData with a blend mode.
/// Matches the TS `ParticleEmitter3D` data-only surface (not the full Node3D).
#[derive(Clone, Debug, Default)]
pub struct ParticleEmitter3D {
    pub blend_mode: Option<String>,
    pub data: flight_particles::ParticleEmitterData,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

// flight-lint: allow(contract-vocabulary) D16: TS callback parameters map to Box<dyn Fn> trait objects
pub struct ParticleEmitterCallbacks {
    pub on_death: Option<Box<dyn Fn(f32, f32, f32)>>,
    pub on_spawn: Option<Box<dyn Fn(f32, f32, f32)>>,
}

impl Default for ParticleEmitterCallbacks {
    fn default() -> Self {
        return Self {
            on_death: None,
            on_spawn: None,
        };
    }
}
