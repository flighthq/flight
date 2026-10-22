mod animation_advance;
mod animation_blend;
mod animation_blend_tree;
mod animation_clip;
mod animation_crossfade;
mod animation_layer_stack;
mod animation_player;
mod animation_root_motion;
mod animation_state_machine;
mod animation_state_machine_advance;
mod animation_track;
mod types;

pub mod contract;
mod sugar;

// Public lane: the names exported by the pinned TS `index.ts`, plus the Rust types and their
// constructors that the public signatures require. Contract-only seams (initialize_*, the _ref
// constructors, the D18 sugar backing functions, the advance controllers) stay in `contract`.

// types — all public types are part of the public lane
pub use contract::AnimationBlendTree;
pub use contract::AnimationBlendTreeChannel;
pub use contract::AnimationBlendTreeChannelSource;
pub use contract::AnimationBlendTreeInput;
pub use contract::AnimationBlendTreeRef;
pub use contract::AnimationChannel;
pub use contract::AnimationClip;
pub use contract::AnimationClipEvent;
pub use contract::AnimationCrossfade;
pub use contract::AnimationCrossfadeChannel;
pub use contract::AnimationCrossfadeOptions;
pub use contract::AnimationInterpolation;
pub use contract::AnimationLayer;
pub use contract::AnimationLayerOptions;
pub use contract::AnimationLayerStack;
pub use contract::AnimationLayerStackChannel;
pub use contract::AnimationLayerStackChannelSource;
pub use contract::AnimationLoopMode;
pub use contract::AnimationPlayer;
pub use contract::AnimationPlayerRef;
pub use contract::AnimationRootMotionExtractor;
pub use contract::AnimationSampleAccumulator;
pub use contract::AnimationStateMachine;
pub use contract::AnimationStateMachineChannel;
pub use contract::AnimationStateMachineRef;
pub use contract::AnimationStateMachineState;
pub use contract::AnimationTrack;
pub use contract::AnimationTrackValidationDiagnostic;
pub use contract::EasingFn;
pub use contract::Payload;
pub use contract::StateRef;
pub use contract::TargetRef;
pub use contract::ANIMATION_INTERPOLATION_CUBIC;
pub use contract::ANIMATION_INTERPOLATION_LINEAR;
pub use contract::ANIMATION_INTERPOLATION_STEP;
pub use contract::ANIMATION_LOOP_MODE_PING_PONG;
pub use contract::ANIMATION_LOOP_MODE_REPEAT;

// animation_blend
pub use contract::accumulate_animation_sample;
pub use contract::add_animation_sample;
pub use contract::blend_animation_samples;
pub use contract::create_animation_sample_accumulator;
pub use contract::finish_animation_sample;
pub use contract::reset_animation_sample_accumulator;

// animation_blend_tree
pub use contract::advance_animation_blend_tree;
pub use contract::create_animation_blend_tree;
pub use contract::create_animation_blend_tree_input;
pub use contract::sample_animation_blend_tree;
pub use contract::sample_animation_blend_tree_channel;
pub use contract::set_animation_blend_tree_input_weight;

// animation_clip
pub use contract::clone_animation_clip;
pub use contract::create_animation_channel;
pub use contract::create_animation_clip;
pub use contract::create_animation_clip_event;
pub use contract::get_animation_clip_duration;
pub use contract::sample_animation_clip;

// animation_crossfade
pub use contract::advance_animation_crossfade;
pub use contract::create_animation_crossfade;
pub use contract::is_animation_crossfade_complete;
pub use contract::sample_animation_crossfade;

// animation_layer_stack
pub use contract::advance_animation_layer_stack;
pub use contract::create_animation_blend_tree_layer;
pub use contract::create_animation_layer_stack;
pub use contract::create_animation_state_machine_layer;
pub use contract::sample_animation_layer_stack;
pub use contract::sample_animation_layer_stack_channel;
pub use contract::set_animation_layer_weight;

// animation_player
pub use contract::advance_animation_player;
pub use contract::clone_animation_player;
pub use contract::create_animation_player;
pub use contract::enable_animation_player_signals;
pub use contract::get_animation_player_normalized_time;
pub use contract::play_animation_player;
pub use contract::seek_animation_player;
pub use contract::stop_animation_player;

// animation_root_motion
pub use contract::create_animation_root_motion_extractor;
pub use contract::extract_animation_root_motion;

// animation_state_machine
pub use contract::advance_animation_state_machine;
pub use contract::create_animation_state_machine;
pub use contract::create_animation_state_machine_state;
pub use contract::get_animation_state_machine_current_state;
pub use contract::is_animation_state_machine_transitioning;
pub use contract::sample_animation_state_machine;
pub use contract::sample_animation_state_machine_channel;
pub use contract::transition_animation_state_machine;

// animation_track
pub use contract::clone_animation_track;
pub use contract::create_animation_track;
pub use contract::sample_animation_track;
pub use contract::trim_animation_track;
pub use contract::validate_animation_track;
