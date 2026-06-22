// ---------------------------------------------------------------------------
// ParticleEmitterConfig
// ---------------------------------------------------------------------------

/// Emission shape.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ParticleEmitterShape {
    #[default]
    Point,
    Circle,
    Rect,
}

/// Blend mode stored in config for round-tripping through format parsers.
/// Apply it to the emitter node after parsing if you want it to take effect.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum ParticleBlendMode {
    Add,
    Multiply,
    Normal,
    Screen,
}

/// Particle curve — a flat array of `[time, value, ...]` pairs.
pub type ParticleCurve = Vec<f32>;

/// A keyframe on a particle curve.
#[derive(Copy, Clone, Debug, Default)]
pub struct CurveKeyframe {
    pub time: f32,
    pub value: f32,
}

/// A color keyframe on a particle curve.
#[derive(Copy, Clone, Debug, Default)]
pub struct ColorKeyframe {
    pub time: f32,
    pub r: f32,
    pub g: f32,
    pub b: f32,
}

/// Full configuration for a particle emitter.
#[derive(Clone, Debug)]
pub struct ParticleEmitterConfig {
    pub alpha_end: f32,
    pub alpha_start: f32,
    pub blend_mode: Option<ParticleBlendMode>,
    pub burst_count: u32,
    pub burst_interval: f32,
    pub color_end_r: f32,
    pub color_end_g: f32,
    pub color_end_b: f32,
    pub color_end_variance_r: f32,
    pub color_end_variance_g: f32,
    pub color_end_variance_b: f32,
    pub color_start_r: f32,
    pub color_start_g: f32,
    pub color_start_b: f32,
    pub color_start_variance_r: f32,
    pub color_start_variance_g: f32,
    pub color_start_variance_b: f32,
    pub direction_x: f32,
    pub direction_y: f32,
    pub duration: f32,
    pub emitter_height: f32,
    pub emitter_radius: f32,
    pub emitter_shape: ParticleEmitterShape,
    pub emitter_width: f32,
    pub frame_count: u32,
    pub frame_rate: f32,
    pub gravity_x: f32,
    pub gravity_y: f32,
    pub lifetime_max: f32,
    pub lifetime_min: f32,
    pub loop_: bool,
    pub max_particles: u32,
    pub region_id_max: u32,
    pub region_id_min: u32,
    pub rotation_speed_max: f32,
    pub rotation_speed_min: f32,
    pub scale_end: f32,
    pub scale_max: f32,
    pub scale_min: f32,
    pub spawn_rate: f32,
    pub speed_max: f32,
    pub speed_min: f32,
    pub spread: f32,
    pub velocity_inheritance: f32,
    pub world_space: bool,
    pub alpha_curve: Option<ParticleCurve>,
    pub color_curve: Option<ParticleCurve>,
    pub scale_curve: Option<ParticleCurve>,
}

impl Default for ParticleEmitterConfig {
    fn default() -> Self {
        Self {
            alpha_end: 1.0,
            alpha_start: 1.0,
            blend_mode: None,
            burst_count: 0,
            burst_interval: 0.0,
            color_end_r: 1.0,
            color_end_g: 1.0,
            color_end_b: 1.0,
            color_end_variance_r: 0.0,
            color_end_variance_g: 0.0,
            color_end_variance_b: 0.0,
            color_start_r: 1.0,
            color_start_g: 1.0,
            color_start_b: 1.0,
            color_start_variance_r: 0.0,
            color_start_variance_g: 0.0,
            color_start_variance_b: 0.0,
            direction_x: 0.0,
            direction_y: -1.0,
            duration: -1.0,
            emitter_height: 0.0,
            emitter_radius: 0.0,
            emitter_shape: ParticleEmitterShape::Point,
            emitter_width: 0.0,
            frame_count: 1,
            frame_rate: 0.0,
            gravity_x: 0.0,
            gravity_y: 0.0,
            lifetime_max: 1.0,
            lifetime_min: 1.0,
            loop_: true,
            max_particles: 200,
            region_id_max: 0,
            region_id_min: 0,
            rotation_speed_max: 0.0,
            rotation_speed_min: 0.0,
            scale_end: 1.0,
            scale_max: 1.0,
            scale_min: 1.0,
            spawn_rate: 100.0,
            speed_max: 100.0,
            speed_min: 100.0,
            spread: 0.0,
            velocity_inheritance: 0.0,
            world_space: false,
            alpha_curve: None,
            color_curve: None,
            scale_curve: None,
        }
    }
}

// ---------------------------------------------------------------------------
// ParticleEmitterState
// ---------------------------------------------------------------------------

/// Runtime mutable state for a particle emitter (separate from config).
#[derive(Clone, Debug, Default)]
pub struct ParticleEmitterState {
    pub burst_timer: f32,
    pub color_birth: Vec<f32>,
    pub color_death: Vec<f32>,
    pub emitter_age: f32,
    pub lifetimes: Vec<f32>,
    pub prev_x: f32,
    pub prev_y: f32,
    /// Internal mulberry32 PRNG state, seeded at construction so a given seed
    /// reproduces the same simulation. Advanced in place during spawning.
    pub random_state: u32,
    pub rotation_speeds: Vec<f32>,
    pub scales: Vec<f32>,
    pub spawn_accumulator: f32,
    pub velocities: Vec<f32>,
}

// ---------------------------------------------------------------------------
// ParticleObjectsState
// ---------------------------------------------------------------------------

/// Runtime state for a particle objects emitter.
#[derive(Clone, Debug, Default)]
pub struct ParticleObjectsState {
    pub burst_timer: f32,
    pub emitter_age: f32,
    pub lifetimes: Vec<f32>,
    pub prev_x: f32,
    pub prev_y: f32,
    /// Internal mulberry32 PRNG state, seeded at construction for reproducible
    /// spawning. Advanced in place during spawning.
    pub random_state: u32,
    pub rotation_speeds: Vec<f32>,
    pub scales: Vec<f32>,
    pub spawn_accumulator: f32,
    pub velocities: Vec<f32>,
}

// ---------------------------------------------------------------------------
// ParticleObjectsUpdateOptions
// ---------------------------------------------------------------------------

/// Options for updating a particle objects emitter.
#[derive(Default)]
pub struct ParticleObjectsUpdateOptions {
    pub on_death: Option<Box<dyn Fn() + Send + Sync>>,
    pub on_spawn: Option<Box<dyn Fn(f32, f32) + Send + Sync>>,
    pub emitter_x: Option<f32>,
    pub emitter_y: Option<f32>,
}

impl std::fmt::Debug for ParticleObjectsUpdateOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ParticleObjectsUpdateOptions")
            .field("on_death", &self.on_death.as_ref().map(|_| "<fn>"))
            .field("on_spawn", &self.on_spawn.as_ref().map(|_| "<fn>"))
            .field("emitter_x", &self.emitter_x)
            .field("emitter_y", &self.emitter_y)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// ParticleForce
// ---------------------------------------------------------------------------

/// How a force field's strength falls off with distance.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ForceFalloff {
    #[default]
    None,
    Linear,
    InverseSquare,
}

/// An attractor/repulsor force field.
#[derive(Clone, Debug)]
pub struct AttractorForce {
    pub x: f32,
    pub y: f32,
    pub strength: f32,
    pub radius: Option<f32>,
    pub falloff: ForceFalloff,
}

/// A vortex force field.
#[derive(Clone, Debug)]
pub struct VortexForce {
    pub x: f32,
    pub y: f32,
    pub strength: f32,
    pub radius: Option<f32>,
    pub falloff: ForceFalloff,
}

/// A drag force applied uniformly to all particles.
#[derive(Clone, Debug)]
pub struct DragForce {
    pub strength: f32,
}

/// A directional wind force.
#[derive(Clone, Debug)]
pub struct WindForce {
    pub x: f32,
    pub y: f32,
}

/// A Perlin-noise turbulence force.
#[derive(Clone, Debug)]
pub struct TurbulenceForce {
    pub strength: f32,
    pub scale: f32,
}

/// Any particle force variant.
#[derive(Clone, Debug)]
pub enum ParticleForce {
    Attractor(AttractorForce),
    Vortex(VortexForce),
    Drag(DragForce),
    Wind(WindForce),
    Turbulence(TurbulenceForce),
}

// ---------------------------------------------------------------------------
// ParticleCollider
// ---------------------------------------------------------------------------

/// Collision response parameters.
#[derive(Clone, Debug, Default)]
pub struct CollisionResponse {
    pub restitution: Option<f32>,
    pub friction: Option<f32>,
}

/// How the collider constrains particles.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ColliderMode {
    #[default]
    Exclude,
    Contain,
}

/// A half-plane collider.
#[derive(Clone, Debug)]
pub struct PlaneCollider {
    pub nx: f32,
    pub ny: f32,
    pub distance: f32,
    pub response: CollisionResponse,
}

/// A circular collider.
#[derive(Clone, Debug)]
pub struct CircleCollider {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub mode: ColliderMode,
    pub response: CollisionResponse,
}

/// A rectangular collider.
#[derive(Clone, Debug)]
pub struct RectangleCollider {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub mode: ColliderMode,
    pub response: CollisionResponse,
}

/// Any particle collider variant.
#[derive(Clone, Debug)]
pub enum ParticleCollider {
    Plane(PlaneCollider),
    Circle(CircleCollider),
    Rectangle(RectangleCollider),
}

// ---------------------------------------------------------------------------
// ParticleEmitterCallbacks
// ---------------------------------------------------------------------------

/// Callbacks fired on particle spawn and death.
#[derive(Default)]
pub struct ParticleEmitterCallbacks {
    pub on_death: Option<Box<dyn Fn(f32, f32) + Send + Sync>>,
    pub on_spawn: Option<Box<dyn Fn(f32, f32) + Send + Sync>>,
}

impl std::fmt::Debug for ParticleEmitterCallbacks {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ParticleEmitterCallbacks")
            .field("on_death", &self.on_death.as_ref().map(|_| "<fn>"))
            .field("on_spawn", &self.on_spawn.as_ref().map(|_| "<fn>"))
            .finish()
    }
}

/// World-space 2D transform (column-major 2×3 compatible with a Matrix).
#[derive(Copy, Clone, Debug, Default)]
pub struct WorldTransform2D {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub tx: f32,
    pub ty: f32,
}

// ---------------------------------------------------------------------------
// ParticleConfigIssue
// ---------------------------------------------------------------------------

/// Severity of a particle config validation issue.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum ParticleConfigIssueSeverity {
    Error,
    Warning,
}

/// A validation issue found in a `ParticleEmitterConfig`.
#[derive(Clone, Debug)]
pub struct ParticleConfigIssue {
    /// Name of the field that has the issue.
    pub field: String,
    pub message: String,
    pub severity: ParticleConfigIssueSeverity,
}

// ---------------------------------------------------------------------------
// ParticleEmitterData (display object data)
// ---------------------------------------------------------------------------

/// Data payload for a `ParticleEmitter` display object.
#[derive(Clone, Debug, Default)]
pub struct ParticleEmitterData {
    /// Per-particle alpha, length == capacity.
    pub alphas: Vec<f32>,
    pub atlas: Option<crate::resource::TextureAtlas>,
    /// Per-particle colors: `[r, g, b] × capacity`.
    pub colors: Vec<f32>,
    pub ids: Vec<u16>,
    pub particle_count: u32,
    /// Per-particle transforms: `[x, y, rotation, scale] × capacity`.
    pub transforms: Vec<f32>,
    /// Per-particle velocities: `[vx, vy] × capacity`.
    pub velocities: Vec<f32>,
    pub world_space: bool,
}
