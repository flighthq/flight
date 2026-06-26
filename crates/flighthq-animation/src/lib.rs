//! `flighthq-animation` — animation tracks, clips, and player.
//!
//! Provides sampling of keyframe animation tracks with Step, Linear, and Cubic
//! interpolation (including quaternion slerp), clip bundling, and a time-driven
//! player. Easing functions plug in via `flighthq-types`'s `EasingFunction` type.

pub mod animation_clip;
pub mod animation_player;
pub mod animation_track;

// animation_clip
pub use animation_clip::{
    create_animation_channel, create_animation_clip, get_animation_clip_duration,
};

// animation_player
pub use animation_player::{
    AnimationPlayerOpts, advance_animation_player, create_animation_player, seek_animation_player,
};

// animation_track
pub use animation_track::{AnimationTrackOpts, create_animation_track, sample_animation_track};
