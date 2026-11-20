use std::sync::atomic::Ordering;
#[cfg(any(feature = "ogg", feature = "wav"))]
use std::sync::{Arc, RwLock};

#[cfg(any(feature = "ogg", feature = "wav"))]
use flight_audio::AudioBuffer;
#[cfg(any(feature = "ogg", feature = "wav"))]
use flight_entity::Ref;
use flight_stream::{AbortSignal, is_abort_signal_aborted};

#[cfg(any(feature = "ogg", feature = "wav"))]
use crate::types::AudioCodecsHostOptions;
use crate::types::{AudioCodecsHostDecodeExplanationReason, AudioCodecsHostState};

pub(crate) struct DecodeFailure {
    pub(crate) message: &'static str,
    pub(crate) reason: AudioCodecsHostDecodeExplanationReason,
}

/// What a decode re-reads between bounded units of work, so dispose and abort end it promptly.
pub(crate) struct DecodeWatch<'a> {
    pub(crate) signal: Option<&'a AbortSignal>,
    pub(crate) state: &'a AudioCodecsHostState,
}

pub(crate) fn create_decode_failure(
    reason: AudioCodecsHostDecodeExplanationReason,
    message: &'static str,
) -> DecodeFailure {
    return DecodeFailure { message, reason };
}

/// Moves decoded planar channels into a new AudioBuffer without a zero-filled intermediate copy.
/// Callers have already validated the channel count, sample rate and a nonzero equal length
/// against the AudioBuffer constructor's ranges.
#[cfg(any(feature = "ogg", feature = "wav"))]
pub(crate) fn create_decoded_audio_buffer(
    sample_rate: u32,
    channels: Vec<Vec<f32>>,
) -> Ref<AudioBuffer> {
    let length = channels.first().map_or(0, Vec::len);
    let channels: Vec<Ref<Box<[f32]>>> = channels
        .into_iter()
        .map(|samples| return Arc::new(RwLock::new(samples.into_boxed_slice())))
        .collect();
    return Arc::new(RwLock::new(AudioBuffer {
        sample_rate: sample_rate as f32,
        length,
        channels: channels.into_boxed_slice(),
    }));
}

pub(crate) fn check_decode_watch(watch: &DecodeWatch<'_>) -> Result<(), DecodeFailure> {
    if !watch.state.alive.load(Ordering::Acquire) {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::Disposed,
            "audio-codecs host has been disposed",
        ));
    }
    if watch.signal.is_some_and(is_abort_signal_aborted) {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::Aborted,
            "the abort signal fired before the decode completed",
        ));
    }
    return Ok(());
}

#[cfg(any(feature = "ogg", feature = "wav"))]
pub(crate) fn no_audio_frames() -> DecodeFailure {
    return create_decode_failure(
        AudioCodecsHostDecodeExplanationReason::NoAudioFrames,
        "the stream decodes to zero frames",
    );
}

/// Rejects a channel count or sample rate an AudioBuffer cannot hold, or one beyond the host's
/// channel limit, before any sample storage is allocated.
#[cfg(any(feature = "ogg", feature = "wav"))]
pub(crate) fn validate_decoded_layout(
    options: &AudioCodecsHostOptions,
    channels: usize,
    sample_rate: u32,
) -> Result<(), DecodeFailure> {
    if !(1..=MAX_AUDIO_BUFFER_CHANNELS).contains(&channels) {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::UnsupportedChannelCount,
            "the stream's channel count is outside the AudioBuffer range of 1 to 32",
        ));
    }
    if channels > options.max_channels {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
            "the stream's channel count exceeds the host limit",
        ));
    }
    if !(MIN_AUDIO_BUFFER_SAMPLE_RATE..=MAX_AUDIO_BUFFER_SAMPLE_RATE).contains(&sample_rate) {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::UnsupportedSampleRate,
            "the stream's sample rate is outside the AudioBuffer range of 3000 to 768000 Hz",
        ));
    }
    return Ok(());
}

/// Rejects a frame count whose samples across every channel would exceed the host limit.
#[cfg(any(feature = "ogg", feature = "wav"))]
pub(crate) fn validate_decoded_sample_count(
    options: &AudioCodecsHostOptions,
    channels: usize,
    frames: usize,
) -> Result<(), DecodeFailure> {
    let within = frames
        .checked_mul(channels)
        .is_some_and(|samples| samples <= options.max_decoded_samples);
    if !within {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
            "the decoded sample count exceeds the host limit",
        ));
    }
    return Ok(());
}

#[cfg(any(feature = "ogg", feature = "wav"))]
const MAX_AUDIO_BUFFER_CHANNELS: usize = 32;
#[cfg(any(feature = "ogg", feature = "wav"))]
const MAX_AUDIO_BUFFER_SAMPLE_RATE: u32 = 768_000;
#[cfg(any(feature = "ogg", feature = "wav"))]
const MIN_AUDIO_BUFFER_SAMPLE_RATE: u32 = 3_000;
