use flight_media::contract::*;

mod test_support;

use test_support::*;

#[path = "audio_channel_test.rs"]
mod flight_media_audio_channel_test;
#[path = "audio_mixer_test.rs"]
mod flight_media_audio_mixer_test;
#[path = "enable_audio_mixer_guards_test.rs"]
mod flight_media_enable_audio_mixer_guards_test;
#[path = "host_explain_test.rs"]
mod flight_media_host_explain_test;
#[path = "media_channel_signals_test.rs"]
mod flight_media_media_channel_signals_test;
#[path = "types_test.rs"]
mod flight_media_types_test;
#[path = "video_channel_runtime_test.rs"]
mod flight_media_video_channel_runtime_test;
#[path = "video_channel_test.rs"]
mod flight_media_video_channel_test;
