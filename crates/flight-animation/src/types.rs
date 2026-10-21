use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref, Unknown};
use flight_signals::Signal;

pub type TargetRef = Unknown;

pub type Payload = usize;

pub type EasingFn = fn(f32) -> f32;

pub type AnimationPlayerRef = Ref<AnimationPlayer>;

pub type AnimationBlendTreeRef = Ref<AnimationBlendTree>;

pub type AnimationStateMachineRef = Ref<AnimationStateMachine>;

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum AnimationInterpolation {
    Cubic,
    Linear,
    Step,
}

pub const ANIMATION_INTERPOLATION_CUBIC: AnimationInterpolation = AnimationInterpolation::Cubic;
pub const ANIMATION_INTERPOLATION_LINEAR: AnimationInterpolation = AnimationInterpolation::Linear;
pub const ANIMATION_INTERPOLATION_STEP: AnimationInterpolation = AnimationInterpolation::Step;

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum AnimationLoopMode {
    PingPong,
    Repeat,
}

pub const ANIMATION_LOOP_MODE_PING_PONG: AnimationLoopMode = AnimationLoopMode::PingPong;
pub const ANIMATION_LOOP_MODE_REPEAT: AnimationLoopMode = AnimationLoopMode::Repeat;

#[derive(Clone, Debug)]
pub enum StateRef {
    Name(String),
    Index(usize),
}

#[derive(Clone, Debug)]
pub struct AnimationBlendTree {
    pub channels: Vec<AnimationBlendTreeChannel>,
    pub inputs: Vec<AnimationBlendTreeInput>,
    pub players: Vec<AnimationPlayerRef>,
    pub sample_scratch: Vec<f32>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationBlendTreeChannel {
    pub accumulator: AnimationSampleAccumulator,
    pub channel: AnimationChannel,
    pub sources: Vec<AnimationBlendTreeChannelSource>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AnimationBlendTreeChannelSource {
    pub channel_index: usize,
    pub input_index: usize,
}

#[derive(Clone, Debug)]
pub struct AnimationBlendTreeInput {
    pub additive: bool,
    pub player: AnimationPlayerRef,
    pub weight: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationChannel {
    pub track: Ref<AnimationTrack>,
    pub target_ref: TargetRef,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationClip {
    pub channels: Vec<AnimationChannel>,
    pub duration: f32,
    pub events: Vec<AnimationClipEvent>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationClipEvent {
    pub name: String,
    pub payload: Payload,
    pub time: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationCrossfade {
    pub channels: Vec<AnimationCrossfadeChannel>,
    pub curve: EasingFn,
    pub duration: f32,
    pub elapsed: f32,
    pub from: AnimationPlayerRef,
    pub from_sample: Vec<f32>,
    pub to: AnimationPlayerRef,
    pub to_sample: Vec<f32>,
    pub weight: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationCrossfadeChannel {
    pub channel: AnimationChannel,
    pub from_index: Option<usize>,
    pub to_index: Option<usize>,
}

#[derive(Clone, Debug, Default)]
pub struct AnimationCrossfadeOptions {
    pub curve: Option<EasingFn>,
}

#[derive(Clone, Debug)]
pub struct AnimationLayer {
    pub additive: bool,
    pub blend_tree: Option<AnimationBlendTreeRef>,
    pub channel_indices: Option<Vec<usize>>,
    pub state_machine: Option<AnimationStateMachineRef>,
    pub weight: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug, Default)]
pub struct AnimationLayerOptions {
    pub additive: Option<bool>,
    pub channel_indices: Option<Vec<usize>>,
    pub weight: Option<f32>,
}

#[derive(Clone, Debug)]
pub struct AnimationLayerStack {
    pub advance_scratch: Vec<AnimationPlayerRef>,
    pub blend_trees: Vec<AnimationBlendTreeRef>,
    pub channels: Vec<AnimationLayerStackChannel>,
    pub layers: Vec<AnimationLayer>,
    pub sample_scratch: Vec<f32>,
    pub state_machines: Vec<AnimationStateMachineRef>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationLayerStackChannel {
    pub channel: AnimationChannel,
    pub sources: Vec<AnimationLayerStackChannelSource>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AnimationLayerStackChannelSource {
    pub channel_index: usize,
    pub layer_index: usize,
}

#[derive(Clone)]
pub struct AnimationPlayer {
    pub clip: Ref<AnimationClip>,
    pub loop_enabled: bool,
    pub loop_mode: AnimationLoopMode,
    pub on_event: Option<Signal<AnimationClipEvent>>,
    pub on_finished: Option<Signal<()>>,
    pub on_looped: Option<Signal<()>>,
    pub playing: bool,
    pub repeat_count: i32,
    pub speed: f32,
    pub time: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug, Default)]
pub struct AnimationPlayerOptions {
    pub loop_enabled: Option<bool>,
    pub loop_mode: Option<AnimationLoopMode>,
    pub playing: Option<bool>,
    pub repeat_count: Option<i32>,
    pub speed: Option<f32>,
    pub time: Option<f32>,
}

#[derive(Clone, Debug)]
pub struct AnimationRootMotionExtractor {
    pub channel: AnimationChannel,
    pub channel_index: usize,
    pub clip: Ref<AnimationClip>,
    pub cycle_delta: Vec<f32>,
    pub from_motion: Vec<f32>,
    pub from_sample: Vec<f32>,
    pub power_scratch: Vec<f32>,
    pub start_sample: Vec<f32>,
    pub to_motion: Vec<f32>,
    pub to_sample: Vec<f32>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationSampleAccumulator {
    pub components: usize,
    pub quaternion: bool,
    pub values: Vec<f32>,
    pub weight: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationStateMachine {
    pub advance_scratch: Vec<AnimationPlayerRef>,
    pub channels: Vec<AnimationStateMachineChannel>,
    pub current_state_index: usize,
    pub from_sample: Vec<f32>,
    pub states: Vec<AnimationStateMachineState>,
    pub to_sample: Vec<f32>,
    pub transition_curve: EasingFn,
    pub transition_duration: f32,
    pub transition_elapsed: f32,
    pub transition_from_state_index: Option<usize>,
    pub transition_to_state_index: Option<usize>,
    pub transition_weight: f32,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationStateMachineChannel {
    pub channel: AnimationChannel,
    pub state_channel_indices: Vec<Option<usize>>,
}

#[derive(Clone, Debug)]
pub struct AnimationStateMachineState {
    pub blend_tree: AnimationBlendTreeRef,
    pub name: String,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationTrack {
    pub interpolation: AnimationInterpolation,
    pub times: Vec<f32>,
    pub values: Vec<f32>,
    pub components: usize,
    pub quaternion: bool,
    pub easing: Option<EasingFn>,
    pub segment_easings: Option<Vec<Option<EasingFn>>>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug)]
pub struct AnimationTrackValidationDiagnostic {
    pub code: String,
    pub index: Option<usize>,
    pub message: String,
}

#[derive(Clone, Debug, Default)]
pub struct CreateAnimationTrackOpts {
    pub times: Vec<f32>,
    pub values: Vec<f32>,
    pub components: Option<usize>,
    pub interpolation: Option<AnimationInterpolation>,
    pub quaternion: Option<bool>,
    pub easing: Option<EasingFn>,
    pub segment_easings: Option<Vec<Option<EasingFn>>>,
}

// flight-lint: allow(conform-extra) Rust sugar-layer free function backing impl From<usize> for StateRef
pub fn create_state_ref_from_index(index: usize) -> StateRef {
    return StateRef::Index(index);
}

// flight-lint: allow(conform-extra) Rust sugar-layer free function backing impl From<&str> for StateRef
pub fn create_state_ref_from_name(name: &str) -> StateRef {
    return StateRef::Name(name.to_string());
}

// flight-lint: allow(conform-extra) internal easing identity used as default curve value
pub fn linear_easing_identity(t: f32) -> f32 {
    return t;
}

impl Default for AnimationBlendTree {
    fn default() -> Self {
        return AnimationBlendTree {
            channels: Vec::new(),
            inputs: Vec::new(),
            players: Vec::new(),
            sample_scratch: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationBlendTreeInput {
    fn default() -> Self {
        return AnimationBlendTreeInput {
            additive: false,
            player: Arc::new(RwLock::new(AnimationPlayer::default())),
            weight: 1.0,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationChannel {
    fn default() -> Self {
        return AnimationChannel {
            track: Arc::new(RwLock::new(AnimationTrack::default())),
            target_ref: None,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationClip {
    fn default() -> Self {
        return AnimationClip {
            channels: Vec::new(),
            duration: 0.0,
            events: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationClipEvent {
    fn default() -> Self {
        return AnimationClipEvent {
            name: String::new(),
            payload: 0,
            time: 0.0,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationCrossfade {
    fn default() -> Self {
        return AnimationCrossfade {
            channels: Vec::new(),
            curve: linear_easing_identity,
            duration: 0.0,
            elapsed: 0.0,
            from: Arc::new(RwLock::new(AnimationPlayer::default())),
            from_sample: Vec::new(),
            to: Arc::new(RwLock::new(AnimationPlayer::default())),
            to_sample: Vec::new(),
            weight: 0.0,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationLayer {
    fn default() -> Self {
        return AnimationLayer {
            additive: false,
            blend_tree: None,
            channel_indices: None,
            state_machine: None,
            weight: 1.0,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationLayerStack {
    fn default() -> Self {
        return AnimationLayerStack {
            advance_scratch: Vec::new(),
            blend_trees: Vec::new(),
            channels: Vec::new(),
            layers: Vec::new(),
            sample_scratch: Vec::new(),
            state_machines: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationPlayer {
    fn default() -> Self {
        return AnimationPlayer {
            clip: Arc::new(RwLock::new(AnimationClip::default())),
            loop_enabled: true,
            loop_mode: AnimationLoopMode::Repeat,
            on_event: None,
            on_finished: None,
            on_looped: None,
            playing: true,
            repeat_count: -1,
            speed: 1.0,
            time: 0.0,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationRootMotionExtractor {
    fn default() -> Self {
        return AnimationRootMotionExtractor {
            channel: AnimationChannel::default(),
            channel_index: 0,
            clip: Arc::new(RwLock::new(AnimationClip::default())),
            cycle_delta: Vec::new(),
            from_motion: Vec::new(),
            from_sample: Vec::new(),
            power_scratch: Vec::new(),
            start_sample: Vec::new(),
            to_motion: Vec::new(),
            to_sample: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationSampleAccumulator {
    fn default() -> Self {
        return AnimationSampleAccumulator {
            components: 0,
            quaternion: false,
            values: Vec::new(),
            weight: 0.0,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationStateMachine {
    fn default() -> Self {
        return AnimationStateMachine {
            advance_scratch: Vec::new(),
            channels: Vec::new(),
            current_state_index: 0,
            from_sample: Vec::new(),
            states: Vec::new(),
            to_sample: Vec::new(),
            transition_curve: linear_easing_identity,
            transition_duration: 0.0,
            transition_elapsed: 0.0,
            transition_from_state_index: None,
            transition_to_state_index: None,
            transition_weight: 0.0,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationStateMachineState {
    fn default() -> Self {
        return AnimationStateMachineState {
            blend_tree: Arc::new(RwLock::new(AnimationBlendTree::default())),
            name: String::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for AnimationTrack {
    fn default() -> Self {
        return AnimationTrack {
            interpolation: AnimationInterpolation::Linear,
            times: Vec::new(),
            values: Vec::new(),
            components: 1,
            quaternion: false,
            easing: None,
            segment_easings: None,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl std::fmt::Debug for AnimationPlayer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return f
            .debug_struct("AnimationPlayer")
            .field("loop_enabled", &self.loop_enabled)
            .field("loop_mode", &self.loop_mode)
            .field("playing", &self.playing)
            .field("repeat_count", &self.repeat_count)
            .field("speed", &self.speed)
            .field("time", &self.time)
            .finish();
    }
}

impl From<&str> for StateRef {
    fn from(s: &str) -> Self {
        return create_state_ref_from_name(s);
    }
}

impl From<usize> for StateRef {
    fn from(i: usize) -> Self {
        return create_state_ref_from_index(i);
    }
}

flight_entity::impl_entity!(AnimationBlendTree);
flight_entity::impl_entity!(AnimationBlendTreeInput);
flight_entity::impl_entity!(AnimationChannel);
flight_entity::impl_entity!(AnimationClip);
flight_entity::impl_entity!(AnimationClipEvent);
flight_entity::impl_entity!(AnimationCrossfade);
flight_entity::impl_entity!(AnimationLayer);
flight_entity::impl_entity!(AnimationLayerStack);
flight_entity::impl_entity!(AnimationPlayer);
flight_entity::impl_entity!(AnimationRootMotionExtractor);
flight_entity::impl_entity!(AnimationSampleAccumulator);
flight_entity::impl_entity!(AnimationStateMachine);
flight_entity::impl_entity!(AnimationStateMachineState);
flight_entity::impl_entity!(AnimationTrack);
