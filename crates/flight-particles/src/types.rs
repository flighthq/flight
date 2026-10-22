use flight_entity::EntityRuntimeSlot;
use flight_math::{RandomSource, create_random_source};
use flight_signals::Signal;

// ---------------------------------------------------------------------------
// Curve types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct CurveKeyframe {
    pub time: f32,
    pub value: f32,
}

#[derive(Clone, Debug, Default)]
pub struct ColorKeyframe {
    pub time: f32,
    pub r: f32,
    pub g: f32,
    pub b: f32,
}

// ---------------------------------------------------------------------------
// Collider types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum ColliderMode {
    Contain = 0,
    Exclude = 1,
}

#[derive(Clone, Debug)]
pub enum ParticleCollider {
    PlaneCollider {
        nx: f32,
        ny: f32,
        nz: f32,
        distance: f32,
        restitution: f32,
        friction: f32,
    },
    CircleCollider {
        x: f32,
        y: f32,
        radius: f32,
        mode: ColliderMode,
        restitution: f32,
        friction: f32,
    },
    RectangleCollider {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        mode: ColliderMode,
        restitution: f32,
        friction: f32,
    },
    SphereCollider {
        x: f32,
        y: f32,
        z: f32,
        radius: f32,
        mode: ColliderMode,
        restitution: f32,
        friction: f32,
    },
}

// ---------------------------------------------------------------------------
// Emitter shape
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum EmitterShape {
    Point = 0,
    Circle = 1,
    Line = 2,
    Rect = 3,
    Ring = 4,
    Sphere = 5,
    Cone3D = 6,
    Box = 7,
}

// ---------------------------------------------------------------------------
// Particle blend mode (TS `ParticleBlendMode`)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ParticleBlendMode {
    Add,
    Multiply,
    Normal,
    Screen,
}

// ---------------------------------------------------------------------------
// Force types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum ForceFalloff {
    Linear = 0,
    InverseSquare = 1,
}

#[derive(Clone, Debug)]
pub enum ParticleForce {
    WindForce {
        x: f32,
        y: f32,
        z: f32,
    },
    DragForce {
        strength: f32,
    },
    AttractorForce {
        x: f32,
        y: f32,
        z: f32,
        strength: f32,
        falloff: Option<ForceFalloff>,
        radius: Option<f32>,
    },
    VortexForce {
        x: f32,
        y: f32,
        z: f32,
        strength: f32,
        falloff: Option<ForceFalloff>,
        radius: Option<f32>,
        axis_x: f32,
        axis_y: f32,
        axis_z: f32,
    },
    TurbulenceForce {
        strength: f32,
        scale: f32,
    },
}

// ---------------------------------------------------------------------------
// Signal payloads (D4: TS `(x, y, z, ...) => void` signal args become named event structs)
// ---------------------------------------------------------------------------

/// Payload of `on_particle_death` (TS `(x, y, z) => void`): last-known particle position.
/// 2D emitters pass `z = 0`.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ParticleDeathEvent {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Payload of `on_particle_spawn` (TS `(x, y, z, vx, vy, vz) => void`): spawn position and
/// initial velocity. 2D emitters pass `z = vz = 0`.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ParticleSpawnEvent {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
}

// ---------------------------------------------------------------------------
// ParticleEmitterSignals (Entity)
// ---------------------------------------------------------------------------

/// Opt-in signals for a particle emitter. A clone shares each signal's slots (flight-signals
/// `Signal` clones share their data), so every handle returned for one state is the same group.
#[derive(Clone, Debug, Default)]
pub struct ParticleEmitterSignals {
    pub on_emitter_complete: Signal<()>,
    pub on_particle_death: Signal<ParticleDeathEvent>,
    pub on_particle_spawn: Signal<ParticleSpawnEvent>,
    runtime: EntityRuntimeSlot,
}

// ---------------------------------------------------------------------------
// ParticleEmitterConfig (plain record)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct ParticleEmitterConfig {
    pub alpha_curve: Option<Vec<f32>>,
    pub alpha_end: f32,
    pub alpha_start: f32,
    pub blend_mode: Option<ParticleBlendMode>,
    pub burst_count: f32,
    pub burst_interval: f32,
    pub color_curve: Option<Vec<f32>>,
    pub color_end_b: f32,
    pub color_end_g: f32,
    pub color_end_r: f32,
    pub color_end_variance_b: f32,
    pub color_end_variance_g: f32,
    pub color_end_variance_r: f32,
    pub color_start_b: f32,
    pub color_start_g: f32,
    pub color_start_r: f32,
    pub color_start_variance_b: f32,
    pub color_start_variance_g: f32,
    pub color_start_variance_r: f32,
    pub direction_x: f32,
    pub direction_y: f32,
    pub direction_z: f32,
    pub duration: f32,
    pub emitter_cone_angle: f32,
    pub emitter_depth: f32,
    pub emitter_height: f32,
    pub emitter_radius: f32,
    pub emitter_shape: EmitterShape,
    pub emitter_width: f32,
    pub frame_count: f32,
    pub frame_rate: f32,
    pub gravity_x: f32,
    pub gravity_y: f32,
    pub gravity_z: f32,
    pub lifetime_max: f32,
    pub lifetime_min: f32,
    pub looping: bool,
    pub max_particles: f32,
    pub region_id_max: f32,
    pub region_id_min: f32,
    pub rotation_speed_max: f32,
    pub rotation_speed_min: f32,
    pub scale_curve: Option<Vec<f32>>,
    pub scale_end: f32,
    pub scale_max: f32,
    pub scale_min: f32,
    pub spawn_rate: f32,
    pub speed_max: f32,
    pub speed_min: f32,
    pub spread: f32,
    pub velocity_inheritance: f32,
    pub world_space: bool,
}

// ---------------------------------------------------------------------------
// ParticleEmitterConfigOptions (partial input for create)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct ParticleEmitterConfigOptions {
    pub alpha_curve: Option<Option<Vec<f32>>>,
    pub alpha_end: Option<f32>,
    pub alpha_start: Option<f32>,
    pub blend_mode: Option<Option<ParticleBlendMode>>,
    pub burst_count: Option<f32>,
    pub burst_interval: Option<f32>,
    pub color_curve: Option<Option<Vec<f32>>>,
    pub color_end_b: Option<f32>,
    pub color_end_g: Option<f32>,
    pub color_end_r: Option<f32>,
    pub color_end_variance_b: Option<f32>,
    pub color_end_variance_g: Option<f32>,
    pub color_end_variance_r: Option<f32>,
    pub color_start_b: Option<f32>,
    pub color_start_g: Option<f32>,
    pub color_start_r: Option<f32>,
    pub color_start_variance_b: Option<f32>,
    pub color_start_variance_g: Option<f32>,
    pub color_start_variance_r: Option<f32>,
    pub direction_x: Option<f32>,
    pub direction_y: Option<f32>,
    pub direction_z: Option<f32>,
    pub duration: Option<f32>,
    pub emitter_cone_angle: Option<f32>,
    pub emitter_depth: Option<f32>,
    pub emitter_height: Option<f32>,
    pub emitter_radius: Option<f32>,
    pub emitter_shape: Option<EmitterShape>,
    pub emitter_width: Option<f32>,
    pub frame_count: Option<f32>,
    pub frame_rate: Option<f32>,
    pub gravity_x: Option<f32>,
    pub gravity_y: Option<f32>,
    pub gravity_z: Option<f32>,
    pub lifetime_max: Option<f32>,
    pub lifetime_min: Option<f32>,
    pub looping: Option<bool>,
    pub max_particles: Option<f32>,
    pub region_id_max: Option<f32>,
    pub region_id_min: Option<f32>,
    pub rotation_speed_max: Option<f32>,
    pub rotation_speed_min: Option<f32>,
    pub scale_curve: Option<Option<Vec<f32>>>,
    pub scale_end: Option<f32>,
    pub scale_max: Option<f32>,
    pub scale_min: Option<f32>,
    pub spawn_rate: Option<f32>,
    pub speed_max: Option<f32>,
    pub speed_min: Option<f32>,
    pub spread: Option<f32>,
    pub velocity_inheritance: Option<f32>,
    pub world_space: Option<bool>,
}

// ---------------------------------------------------------------------------
// ParticleEmitterState (Entity)
// ---------------------------------------------------------------------------

pub struct ParticleEmitterState {
    pub burst_timer: f32,
    pub color_birth: Vec<f32>,
    pub color_death: Vec<f32>,
    pub emitter_age: f32,
    pub lifetimes: Vec<f32>,
    pub prev_x: f32,
    pub prev_y: f32,
    pub prev_z: f32,
    pub random: RandomSource,
    pub rotation_speeds: Vec<f32>,
    pub scales: Vec<f32>,
    pub spawn_accumulator: f32,
    pub velocities: Vec<f32>,
    pub signals: Option<ParticleEmitterSignals>,
    runtime: EntityRuntimeSlot,
}

// ---------------------------------------------------------------------------
// ParticleObjectsState (Entity)
// ---------------------------------------------------------------------------

pub struct ParticleObjectsState {
    pub burst_timer: f32,
    pub emitter_age: f32,
    pub lifetimes: Vec<f32>,
    pub prev_x: f32,
    pub prev_y: f32,
    pub random: RandomSource,
    pub rotation_speeds: Vec<f32>,
    pub scales: Vec<f32>,
    pub spawn_accumulator: f32,
    pub velocities: Vec<f32>,
    runtime: EntityRuntimeSlot,
}

// ---------------------------------------------------------------------------
// ParticleEmitterCallbacks
// ---------------------------------------------------------------------------

// flight-lint: allow(contract-vocabulary) D16: TS callback parameters map to Box<dyn Fn> trait objects
pub struct ParticleEmitterCallbacks {
    pub on_death: Option<Box<dyn Fn(f32, f32, f32) + Send + Sync>>,
    pub on_spawn: Option<Box<dyn Fn(f32, f32, f32) + Send + Sync>>,
}

// ---------------------------------------------------------------------------
// ParticleObject
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct ParticleObject {
    pub alpha: f32,
    pub blend_mode: Option<ParticleBlendMode>,
    pub color_scale_bias: Option<Vec<f32>>,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub visible: bool,
    pub x: f32,
    pub y: f32,
}

// ---------------------------------------------------------------------------
// ParticleConfigIssue (validation output)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct ParticleConfigIssue {
    pub field: String,
    pub message: String,
    pub severity: String,
}

// ---------------------------------------------------------------------------
// ParticleObjectsUpdateOptions / ParticleObjectCallbacks
// ---------------------------------------------------------------------------

pub struct ParticleObjectCallbacks {
    pub on_spawn: Option<fn(f32, f32, f32)>,
    pub on_death: Option<fn(f32, f32, f32)>,
}

pub struct ParticleObjectsUpdateOptions {
    pub emitter_x: f32,
    pub emitter_y: f32,
    pub callbacks: Option<ParticleObjectCallbacks>,
}

// ---------------------------------------------------------------------------
// Free functions
// ---------------------------------------------------------------------------

// flight-lint: allow(conform-extra) Rust-native projection for closed ParticleBlendMode enum; TS uses union literal type
pub fn particle_blend_mode_as_str(mode: ParticleBlendMode) -> &'static str {
    return match mode {
        ParticleBlendMode::Add => "add",
        ParticleBlendMode::Multiply => "multiply",
        ParticleBlendMode::Normal => "normal",
        ParticleBlendMode::Screen => "screen",
    };
}

// ---------------------------------------------------------------------------
// Impl blocks
// ---------------------------------------------------------------------------

impl Default for EmitterShape {
    fn default() -> Self {
        return EmitterShape::Point;
    }
}

// flight-lint: allow(sugar-delegates) delegates to particle_blend_mode_as_str
impl ParticleBlendMode {
    pub fn as_str(&self) -> &'static str {
        return particle_blend_mode_as_str(*self);
    }
}

impl Default for ParticleEmitterCallbacks {
    fn default() -> Self {
        return Self {
            on_death: None,
            on_spawn: None,
        };
    }
}

impl Default for ParticleEmitterConfig {
    fn default() -> Self {
        return Self {
            alpha_curve: None,
            alpha_end: 0.0,
            alpha_start: 1.0,
            blend_mode: None,
            burst_count: 0.0,
            burst_interval: 0.0,
            color_curve: None,
            color_end_b: 1.0,
            color_end_g: 1.0,
            color_end_r: 1.0,
            color_end_variance_b: 0.0,
            color_end_variance_g: 0.0,
            color_end_variance_r: 0.0,
            color_start_b: 1.0,
            color_start_g: 1.0,
            color_start_r: 1.0,
            color_start_variance_b: 0.0,
            color_start_variance_g: 0.0,
            color_start_variance_r: 0.0,
            direction_x: 0.0,
            direction_y: -1.0,
            direction_z: 0.0,
            duration: 0.0,
            emitter_cone_angle: 0.0,
            emitter_depth: 0.0,
            emitter_height: 0.0,
            emitter_radius: 0.0,
            emitter_shape: EmitterShape::Point,
            emitter_width: 0.0,
            frame_count: 1.0,
            frame_rate: 12.0,
            gravity_x: 0.0,
            gravity_y: 0.0,
            gravity_z: 0.0,
            lifetime_max: 1.0,
            lifetime_min: 0.5,
            looping: true,
            max_particles: 1000.0,
            region_id_max: 1.0,
            region_id_min: 0.0,
            rotation_speed_max: 0.0,
            rotation_speed_min: 0.0,
            scale_curve: None,
            scale_end: 1.0,
            scale_max: 1.0,
            scale_min: 1.0,
            spawn_rate: 10.0,
            speed_max: 100.0,
            speed_min: 50.0,
            spread: std::f32::consts::PI,
            velocity_inheritance: 0.0,
            world_space: false,
        };
    }
}

impl std::fmt::Debug for ParticleEmitterState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return formatter
            .debug_struct("ParticleEmitterState")
            .field("burst_timer", &self.burst_timer)
            .field("color_birth", &self.color_birth)
            .field("color_death", &self.color_death)
            .field("emitter_age", &self.emitter_age)
            .field("lifetimes", &self.lifetimes)
            .field("prev_x", &self.prev_x)
            .field("prev_y", &self.prev_y)
            .field("prev_z", &self.prev_z)
            .field("random", &"<RandomSource>")
            .field("rotation_speeds", &self.rotation_speeds)
            .field("scales", &self.scales)
            .field("spawn_accumulator", &self.spawn_accumulator)
            .field("velocities", &self.velocities)
            .field("signals", &self.signals)
            .finish();
    }
}

impl Default for ParticleEmitterState {
    fn default() -> Self {
        return Self {
            burst_timer: 0.0,
            color_birth: Vec::new(),
            color_death: Vec::new(),
            emitter_age: 0.0,
            lifetimes: Vec::new(),
            prev_x: f32::NAN,
            prev_y: f32::NAN,
            prev_z: f32::NAN,
            random: create_random_source(0),
            rotation_speeds: Vec::new(),
            scales: Vec::new(),
            spawn_accumulator: 0.0,
            velocities: Vec::new(),
            signals: None,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl std::fmt::Debug for ParticleObjectsState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return formatter
            .debug_struct("ParticleObjectsState")
            .field("burst_timer", &self.burst_timer)
            .field("emitter_age", &self.emitter_age)
            .field("lifetimes", &self.lifetimes)
            .field("prev_x", &self.prev_x)
            .field("prev_y", &self.prev_y)
            .field("random", &"<RandomSource>")
            .field("rotation_speeds", &self.rotation_speeds)
            .field("scales", &self.scales)
            .field("spawn_accumulator", &self.spawn_accumulator)
            .field("velocities", &self.velocities)
            .finish();
    }
}

impl Default for ParticleObjectsState {
    fn default() -> Self {
        return Self {
            burst_timer: 0.0,
            emitter_age: 0.0,
            lifetimes: Vec::new(),
            prev_x: f32::NAN,
            prev_y: f32::NAN,
            random: create_random_source(0),
            rotation_speeds: Vec::new(),
            scales: Vec::new(),
            spawn_accumulator: 0.0,
            velocities: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for ParticleObject {
    fn default() -> Self {
        return Self {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        };
    }
}

impl Default for ParticleObjectsUpdateOptions {
    fn default() -> Self {
        return Self {
            emitter_x: f32::NAN,
            emitter_y: f32::NAN,
            callbacks: None,
        };
    }
}

// ---------------------------------------------------------------------------
// Entity impls
// ---------------------------------------------------------------------------

flight_entity::impl_entity!(ParticleEmitterSignals);
flight_entity::impl_entity!(ParticleEmitterState);
flight_entity::impl_entity!(ParticleObjectsState);
