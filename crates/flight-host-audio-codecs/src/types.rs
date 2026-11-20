use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use flight_audio::{HostAudioCodecCapability, HostAudioDecodeCapabilities};
use flight_host::ProviderRef;

/// A Rust-native WAV/Ogg Vorbis decode service and the capability records callers borrow from it.
/// Plain host data, not an Entity, with no process-global state. Disposing or dropping it makes
/// every retained capability callback fail closed.
pub struct AudioCodecsHost {
    pub(crate) codec: HostAudioCodecCapability,
    pub(crate) decode: HostAudioDecodeCapabilities,
    pub(crate) options: AudioCodecsHostOptions,
    pub(crate) provider: ProviderRef,
    pub(crate) state: Arc<AudioCodecsHostState>,
}

/// Plain-data limits checked before decoded sample storage is allocated or grown.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioCodecsHostOptions {
    /// Most channels a decoded buffer may carry, from 1 to the AudioBuffer maximum of 32.
    pub max_channels: usize,
    /// Most decoded samples, counted as frames times channels, one decode may produce.
    pub max_decoded_samples: usize,
    /// Most encoded bytes one decode accepts.
    pub max_encoded_bytes: usize,
}

/// Why a decode returned `None`, or `Ready` when the same call produces a buffer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum AudioCodecsHostDecodeExplanationReason {
    Ready = 0,
    /// The host was disposed or dropped before or during the decode.
    Disposed = 1,
    /// The caller's abort signal fired before or during the decode.
    Aborted = 2,
    /// The MIME type names no container this host knows.
    UnsupportedMimeType = 3,
    /// The container is known but its crate feature is not enabled in this build.
    FormatUnavailable = 4,
    /// The encoded input holds no bytes.
    EmptyInput = 5,
    /// The encoded input is longer than `max_encoded_bytes`.
    InputTooLarge = 6,
    /// The input is not a well-formed container or bitstream of the requested format.
    MalformedInput = 7,
    /// The input ends before the data its headers declare.
    TruncatedInput = 8,
    /// The container is well formed but carries a sample encoding this host does not decode.
    UnsupportedEncoding = 9,
    /// The stream declares zero channels or more than an AudioBuffer can hold.
    UnsupportedChannelCount = 10,
    /// The stream's sample rate is outside the AudioBuffer range of 3,000 to 768,000 Hz.
    UnsupportedSampleRate = 11,
    /// The stream decodes to zero frames, which an AudioBuffer cannot represent.
    NoAudioFrames = 12,
    /// The stream exceeds `max_channels`, `max_decoded_samples` or the decoder's table bound.
    ResourceLimitExceeded = 13,
}

/// Plain-data answer to why a decode returned `None`. `message` is empty when `Ready`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioCodecsHostDecodeExplanation {
    pub message: String,
    pub reason: AudioCodecsHostDecodeExplanationReason,
}

/// Why `create_audio_codecs_host` rejects a set of options, or `Valid` when it accepts them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum AudioCodecsHostOptionsExplanationReason {
    Valid = 0,
    /// `max_channels` is zero or above the AudioBuffer maximum of 32.
    MaxChannelsOutOfRange = 1,
    /// `max_decoded_samples` is zero.
    MaxDecodedSamplesZero = 2,
    /// `max_encoded_bytes` is zero.
    MaxEncodedBytesZero = 3,
}

/// Plain-data answer to why options were rejected. `message` is empty when `Valid`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioCodecsHostOptionsExplanation {
    pub message: String,
    pub reason: AudioCodecsHostOptionsExplanationReason,
}

/// The provider value behind an audio-codecs host's capabilities: identity only, no state.
pub(crate) struct AudioCodecsHostProvider;

pub(crate) struct AudioCodecsHostState {
    pub(crate) alive: AtomicBool,
}
