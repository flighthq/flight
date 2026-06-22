//! `flighthq-media` — audio and video playback channels.
//!
//! Provides [`AudioChannel`] and [`VideoChannel`] entities (defined in
//! `flighthq-types`) together with the full suite of playback functions:
//! play, pause, resume, stop, seek, gain, and rate control.

pub mod audio_channel;
pub mod video_channel;

// ---------------------------------------------------------------------------
// Re-exports — full public surface at the crate root
// ---------------------------------------------------------------------------

// audio_channel
pub use audio_channel::{
    AudioBackend, complete_audio_channel, get_audio_channel_current_time, pause_audio_channel,
    play_audio_resource, resume_audio_channel, set_audio_backend, set_audio_channel_current_time,
    set_audio_channel_gain, set_audio_channel_playback_rate, stop_audio_channel,
};

// video_channel
pub use video_channel::{
    VideoBackend, complete_video_channel, get_video_channel_current_time, pause_video_channel,
    play_video_resource, resume_video_channel, set_video_backend, set_video_channel_current_time,
    set_video_channel_gain, set_video_channel_playback_rate, stop_video_channel,
};
