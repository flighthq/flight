mod emit_particle_burst_2d;
mod emit_particle_burst_3d;
mod particle_emitter;
mod particle_emitter_2d;
mod particle_emitter_3d;
mod prewarm_particle_emitter_2d;
mod prewarm_particle_emitter_3d;
mod step_particle_emitter_2d;
mod step_particle_emitter_3d;
mod types;
mod update_particle_emitter_2d;
mod update_particle_emitter_3d;

pub mod contract;

// types
pub use contract::PARTICLE_COLOR_STRIDE;
pub use contract::PARTICLE_EMITTER_2D_KIND;
pub use contract::PARTICLE_EMITTER_3D_KIND;
pub use contract::PARTICLE_EMITTER_DELETED_ID;
pub use contract::PARTICLE_TRANSFORM_STRIDE;
pub use contract::PARTICLE_VELOCITY_STRIDE_2D;
pub use contract::PARTICLE_VELOCITY_STRIDE_3D;
pub use contract::ParticleEmitter2D;
pub use contract::ParticleEmitter2DRuntime;
pub use contract::ParticleEmitter3D;
pub use contract::ParticleEmitter3DRuntime;
pub use contract::ParticleEmitterCallbacks;
pub use contract::ParticleEmitterData;
pub use contract::create_particle_emitter_data;
pub use contract::initialize_particle_emitter_data;

// particleEmitter — 2D public API (wrappers take Ref<ParticleEmitter2D>)
pub use contract::append_particle_emitter_2d_particle;
pub use contract::clear_particle_emitter_2d;
pub use contract::clone_particle_emitter_2d;
pub use contract::clone_particle_emitter_3d;
pub use contract::compact_particle_emitter_2d;
pub use contract::compute_particle_emitter_2d_local_bounds_rectangle;
pub use contract::create_particle_emitter_2d;
pub use contract::create_particle_emitter_2d_runtime;
pub use contract::get_particle_emitter_2d_capacity;
pub use contract::get_particle_emitter_2d_particle_alpha;
pub use contract::get_particle_emitter_2d_particle_id;
pub use contract::get_particle_emitter_2d_particle_velocity;
pub use contract::get_particle_emitter_2d_runtime;
pub use contract::is_particle_emitter_3d;
pub use contract::remove_particle_emitter_2d_particle;
pub use contract::reserve_particle_emitter_2d;
pub use contract::set_particle_emitter_2d_local_bounds_rectangle;
pub use contract::set_particle_emitter_2d_particle;
pub use contract::set_particle_emitter_2d_particle_alpha;
pub use contract::set_particle_emitter_2d_particle_color;
pub use contract::set_particle_emitter_2d_particle_velocity;

// particleEmitter3D — 3D public API (wrappers take Ref<ParticleEmitter3D>)
pub use contract::append_particle_emitter_3d_particle;
pub use contract::clear_particle_emitter_3d;
pub use contract::compact_particle_emitter_3d;
pub use contract::compute_particle_emitter_3d_local_bounds_aabb;
pub use contract::create_particle_emitter_3d;
pub use contract::get_particle_emitter_3d_capacity;
pub use contract::get_particle_emitter_3d_particle_alpha;
pub use contract::get_particle_emitter_3d_particle_id;
pub use contract::get_particle_emitter_3d_particle_velocity;
pub use contract::get_particle_emitter_3d_runtime;
pub use contract::remove_particle_emitter_3d_particle;
pub use contract::reserve_particle_emitter_3d;
pub use contract::set_particle_emitter_3d_particle;
pub use contract::set_particle_emitter_3d_particle_alpha;
pub use contract::set_particle_emitter_3d_particle_color;
pub use contract::set_particle_emitter_3d_particle_velocity;
pub use contract::sort_particle_emitter_3d_by_view_depth;
pub use contract::sort_particle_emitter_3d_indices_by_view_depth;

// emitParticleBurst (wrappers take Ref<ParticleEmitter2D/3D>)
pub use contract::emit_particle_burst_2d;
pub use contract::emit_particle_burst_3d;

// updateParticleEmitter
pub use contract::is_particle_emitter_2d_complete;
pub use contract::is_particle_emitter_3d_complete;
pub use contract::update_particle_emitter_2d;
pub use contract::update_particle_emitter_3d;

// stepParticleEmitter
pub use contract::step_particle_emitter_2d;
pub use contract::step_particle_emitter_3d;

// prewarmParticleEmitter
pub use contract::prewarm_particle_emitter_2d;
pub use contract::prewarm_particle_emitter_3d;
