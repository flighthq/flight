use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::Rectangle;
pub use flight_particles::ParticleEmitterCallbacks;
use flight_scene2d::Node2DFields;
use flight_scene3d::Node3DFields;
use flight_textureatlas::TextureAtlas;

pub const PARTICLE_TRANSFORM_STRIDE: usize = 4;
pub const PARTICLE_COLOR_STRIDE: usize = 3;
pub const PARTICLE_VELOCITY_STRIDE_2D: usize = 2;
pub const PARTICLE_VELOCITY_STRIDE_3D: usize = 3;
pub const PARTICLE_EMITTER_DELETED_ID: u16 = 0xffff;

pub const PARTICLE_EMITTER_2D_KIND: &str = "ParticleEmitter2D";
pub const PARTICLE_EMITTER_3D_KIND: &str = "ParticleEmitter3D";

#[derive(Clone, Default)]
pub struct ParticleEmitterData {
    runtime: EntityRuntimeSlot,
    pub alphas: Vec<f32>,
    pub atlas: Option<Ref<TextureAtlas>>,
    pub colors: Vec<f32>,
    pub ids: Vec<u16>,
    pub particle_count: usize,
    pub positions_z: Vec<f32>,
    pub transforms: Vec<f32>,
    pub velocities: Vec<f32>,
    pub world_space: bool,
}

pub struct ParticleEmitter2D {
    pub node: Node2DFields,
    pub data: ParticleEmitterData,
    pub particle_emitter_2d_runtime: ParticleEmitter2DRuntime,
}

#[derive(Default)]
pub struct ParticleEmitter2DRuntime {
    pub local_bounds_rectangle: Option<Rectangle>,
}

pub struct ParticleEmitter3D {
    pub node: Node3DFields,
    pub blend_mode: Option<String>,
    pub data: ParticleEmitterData,
}

pub type ParticleEmitter3DRuntime = flight_scene3d::Node3DRuntime;

flight_entity::impl_entity!(ParticleEmitterData);

impl Default for ParticleEmitter2D {
    fn default() -> Self {
        return Self {
            node: Node2DFields::default(),
            data: ParticleEmitterData::default(),
            particle_emitter_2d_runtime: ParticleEmitter2DRuntime::default(),
        };
    }
}

flight_scene2d::impl_node2d!(ParticleEmitter2D);

impl Default for ParticleEmitter3D {
    fn default() -> Self {
        return Self {
            node: Node3DFields::default(),
            blend_mode: Some("normal".to_string()),
            data: ParticleEmitterData::default(),
        };
    }
}

flight_scene3d::impl_node3d!(ParticleEmitter3D);
