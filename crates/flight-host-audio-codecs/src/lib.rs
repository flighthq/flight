#![doc = include_str!("../README.md")]

mod audio_codecs_host;
mod decoded_audio;
#[cfg(test)]
#[path = "../tests/generated_media.rs"]
mod generated_media;
#[cfg(feature = "ogg")]
mod ogg_vorbis_decoder;
mod types;
#[cfg(feature = "wav")]
mod wav_decoder;
#[cfg(feature = "wav")]
mod wav_preflight;

pub mod contract;

pub use contract::AudioCodecsHost;
pub use contract::AudioCodecsHostDecodeExplanation;
pub use contract::AudioCodecsHostDecodeExplanationReason;
pub use contract::AudioCodecsHostOptions;
pub use contract::AudioCodecsHostOptionsExplanation;
pub use contract::AudioCodecsHostOptionsExplanationReason;
pub use contract::create_audio_codecs_host;
pub use contract::create_audio_codecs_host_options;
pub use contract::decode_audio_with_audio_codecs_host;
pub use contract::dispose_audio_codecs_host;
pub use contract::explain_audio_codecs_host_decode;
pub use contract::explain_audio_codecs_host_options;
pub use contract::get_audio_codecs_host_codec_capability;
pub use contract::get_audio_codecs_host_decode_capabilities;
pub use contract::get_audio_codecs_host_provider;
pub use contract::is_audio_codecs_host_disposed;
