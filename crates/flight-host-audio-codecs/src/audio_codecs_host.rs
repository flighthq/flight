use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(any(feature = "ogg", feature = "wav"))]
use flight_audio::HostAudioDecodeFormatCapability;
use flight_audio::{
    AudioBuffer, HostAudioCodecCapability, HostAudioDecodeCapabilities,
    get_audio_mime_type_essence, get_audio_mime_type_parameter,
};
use flight_entity::Ref;
use flight_host::ProviderRef;
use flight_stream::AbortSignal;

use crate::decoded_audio::{DecodeFailure, DecodeWatch, check_decode_watch, create_decode_failure};
use crate::types::*;

/// Creates a Rust-native audio decode host, or `None` when `options` are out of range
/// (`explain_audio_codecs_host_options` says which). Format features decide which capability
/// slots are filled; construction performs no native or process-global initialization.
pub fn create_audio_codecs_host(
    options: Option<&AudioCodecsHostOptions>,
) -> Option<AudioCodecsHost> {
    let options = options
        .cloned()
        .unwrap_or_else(create_audio_codecs_host_options);
    if validate_options(&options).is_err() {
        return None;
    }
    let provider: ProviderRef = Arc::new(AudioCodecsHostProvider);
    let state = Arc::new(AudioCodecsHostState {
        alive: AtomicBool::new(true),
    });
    let codec = create_codec_capability(&state, &provider);
    let decode = create_decode_capabilities(&state, &options, &provider);
    return Some(AudioCodecsHost {
        codec,
        decode,
        options,
        provider,
        state,
    });
}

/// Default bounded-service limits: 32 channels, 64 Mi decoded samples (256 MiB of f32 storage)
/// and 256 MiB of encoded input.
pub fn create_audio_codecs_host_options() -> AudioCodecsHostOptions {
    return AudioCodecsHostOptions {
        max_channels: 32,
        max_decoded_samples: 64 * 1024 * 1024,
        max_encoded_bytes: 256 * 1024 * 1024,
    };
}

fn create_codec_capability(
    state: &Arc<AudioCodecsHostState>,
    provider: &ProviderRef,
) -> HostAudioCodecCapability {
    let state = state.clone();
    return HostAudioCodecCapability {
        can_play_type: Arc::new(move |mime_type| return can_play_with_parts(&state, mime_type)),
        provider: provider.clone(),
    };
}

fn create_decode_capabilities(
    _state: &Arc<AudioCodecsHostState>,
    _options: &AudioCodecsHostOptions,
    _provider: &ProviderRef,
) -> HostAudioDecodeCapabilities {
    return HostAudioDecodeCapabilities {
        aac: None,
        flac: None,
        mp3: None,
        mp4: None,
        ogg: {
            #[cfg(feature = "ogg")]
            {
                Some(create_decode_slot(
                    _state,
                    _options,
                    _provider,
                    AudioCodecsHostFormat::Ogg,
                ))
            }
            #[cfg(not(feature = "ogg"))]
            {
                None
            }
        },
        wav: {
            #[cfg(feature = "wav")]
            {
                Some(create_decode_slot(
                    _state,
                    _options,
                    _provider,
                    AudioCodecsHostFormat::Wav,
                ))
            }
            #[cfg(not(feature = "wav"))]
            {
                None
            }
        },
        webm: None,
    };
}

#[cfg(any(feature = "ogg", feature = "wav"))]
fn create_decode_slot(
    state: &Arc<AudioCodecsHostState>,
    options: &AudioCodecsHostOptions,
    provider: &ProviderRef,
    format: AudioCodecsHostFormat,
) -> HostAudioDecodeFormatCapability {
    let state = state.clone();
    let options = options.clone();
    return HostAudioDecodeFormatCapability {
        provider: provider.clone(),
        decode: Arc::new(move |bytes, signal| {
            let state = state.clone();
            let options = options.clone();
            return Box::pin(async move {
                // A poisoned byte handle was mid-write when its writer panicked; fail closed.
                let bytes = bytes.read().ok()?;
                return decode_with_parts(&state, &options, &bytes, Some(format), Some(&signal))
                    .ok();
            });
        }),
    };
}

fn can_play_with_parts(state: &AudioCodecsHostState, mime_type: &str) -> bool {
    if !state.alive.load(Ordering::Acquire) {
        return false;
    }
    let Some(format) = resolve_audio_codecs_host_format(mime_type) else {
        return false;
    };
    if !is_audio_codecs_host_format_enabled(format) {
        return false;
    }
    let Some(codecs) = get_audio_mime_type_parameter(mime_type, "codecs") else {
        return true;
    };
    return codecs.split(',').all(|codec| {
        let codec = codec.trim().to_lowercase();
        return match format {
            AudioCodecsHostFormat::Ogg => codec == "vorbis",
            // WAVE format tags: 1 is integer PCM, 3 is IEEE float.
            AudioCodecsHostFormat::Wav => codec == "1" || codec == "3",
        };
    });
}

/// Decodes WAV or Ogg Vorbis bytes through this host, routing by the MIME essence the
/// `flight-audio` decode slots use. Returns `None` for an unknown or unavailable format,
/// malformed, truncated or unsupported input, an exceeded limit, an aborted signal or a disposed
/// host; `explain_audio_codecs_host_decode` distinguishes the reason.
pub fn decode_audio_with_audio_codecs_host(
    host: &AudioCodecsHost,
    bytes: &[u8],
    mime_type: &str,
    signal: Option<&AbortSignal>,
) -> Option<Ref<AudioBuffer>> {
    let format = resolve_audio_codecs_host_format(mime_type);
    return decode_with_parts(&host.state, &host.options, bytes, format, signal).ok();
}

#[allow(unused_variables)]
fn decode_format(
    options: &AudioCodecsHostOptions,
    bytes: &[u8],
    format: AudioCodecsHostFormat,
    watch: &DecodeWatch<'_>,
) -> Result<Ref<AudioBuffer>, DecodeFailure> {
    match format {
        AudioCodecsHostFormat::Ogg => {
            #[cfg(feature = "ogg")]
            return crate::ogg_vorbis_decoder::decode_ogg_vorbis(options, bytes, watch);
            #[cfg(not(feature = "ogg"))]
            unreachable!("disabled formats are rejected before decoding");
        }
        AudioCodecsHostFormat::Wav => {
            #[cfg(feature = "wav")]
            return crate::wav_decoder::decode_wav(options, bytes, watch);
            #[cfg(not(feature = "wav"))]
            unreachable!("disabled formats are rejected before decoding");
        }
    }
}

fn decode_with_parts(
    state: &AudioCodecsHostState,
    options: &AudioCodecsHostOptions,
    bytes: &[u8],
    format: Option<AudioCodecsHostFormat>,
    signal: Option<&AbortSignal>,
) -> Result<Ref<AudioBuffer>, DecodeFailure> {
    let watch = DecodeWatch { signal, state };
    check_decode_watch(&watch)?;
    let Some(format) = format else {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::UnsupportedMimeType,
            "audio MIME type names no container this host decodes",
        ));
    };
    if !is_audio_codecs_host_format_enabled(format) {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::FormatUnavailable,
            "audio format support is not enabled in this host build",
        ));
    }
    if bytes.is_empty() {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::EmptyInput,
            "encoded audio input is empty",
        ));
    }
    if bytes.len() > options.max_encoded_bytes {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::InputTooLarge,
            "encoded audio input exceeds the host limit",
        ));
    }
    // The backing decoders are untrusted with hostile input: a panic inside one fails the decode
    // closed instead of unwinding through the caller's executor.
    let decoded = catch_unwind(AssertUnwindSafe(|| {
        return decode_format(options, bytes, format, &watch);
    }));
    return decoded.unwrap_or_else(|_| {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::MalformedInput,
            "the decoder rejected the input",
        ));
    });
}

/// Makes the host and every retained capability callback fail closed: later decodes resolve to
/// `None`, a decode in progress stops at its next packet or sample block, and `can_play_type`
/// answers `false`. The host owns no native resource, so nothing is freed. Disposing twice is a
/// no-op, and dropping the host disposes it.
pub fn dispose_audio_codecs_host(host: &mut AudioCodecsHost) {
    host.state.alive.store(false, Ordering::Release);
}

/// Re-runs the bounded decode and reports why the matching direct or capability call returns
/// `None`, or `Ready` when it succeeds. Nothing is retained.
pub fn explain_audio_codecs_host_decode(
    host: &AudioCodecsHost,
    bytes: &[u8],
    mime_type: &str,
    signal: Option<&AbortSignal>,
) -> AudioCodecsHostDecodeExplanation {
    let format = resolve_audio_codecs_host_format(mime_type);
    return match decode_with_parts(&host.state, &host.options, bytes, format, signal) {
        Ok(_) => AudioCodecsHostDecodeExplanation {
            message: String::new(),
            reason: AudioCodecsHostDecodeExplanationReason::Ready,
        },
        Err(failure) => AudioCodecsHostDecodeExplanation {
            message: failure.message.to_string(),
            reason: failure.reason,
        },
    };
}

/// Reports why `create_audio_codecs_host` rejects `options`, or `Valid` when it accepts them.
pub fn explain_audio_codecs_host_options(
    options: &AudioCodecsHostOptions,
) -> AudioCodecsHostOptionsExplanation {
    return match validate_options(options) {
        Ok(()) => AudioCodecsHostOptionsExplanation {
            message: String::new(),
            reason: AudioCodecsHostOptionsExplanationReason::Valid,
        },
        Err((reason, message)) => AudioCodecsHostOptionsExplanation {
            message: message.to_string(),
            reason,
        },
    };
}

/// Borrowed playability query. `can_play_type` is true for a WAV or Ogg MIME type whose feature
/// is enabled and whose `codecs` parameter, when present, names only integer PCM (`1`), IEEE
/// float (`3`) or `vorbis`. A retained callback answers `false` after the host is disposed.
pub fn get_audio_codecs_host_codec_capability(host: &AudioCodecsHost) -> &HostAudioCodecCapability {
    return &host.codec;
}

/// Borrowed decode capabilities. The `wav` and `ogg` slots are filled only when their same-named
/// crate features are enabled; every other slot is empty. Retained callbacks fail closed after
/// the host is disposed or dropped.
pub fn get_audio_codecs_host_decode_capabilities(
    host: &AudioCodecsHost,
) -> &HostAudioDecodeCapabilities {
    return &host.decode;
}

/// The provider identity every capability this host fills carries.
pub fn get_audio_codecs_host_provider(host: &AudioCodecsHost) -> &ProviderRef {
    return &host.provider;
}

/// Whether the host has been disposed, explicitly or by drop of the owner.
pub fn is_audio_codecs_host_disposed(host: &AudioCodecsHost) -> bool {
    return !host.state.alive.load(Ordering::Acquire);
}

fn is_audio_codecs_host_format_enabled(format: AudioCodecsHostFormat) -> bool {
    return match format {
        AudioCodecsHostFormat::Ogg => cfg!(feature = "ogg"),
        AudioCodecsHostFormat::Wav => cfg!(feature = "wav"),
    };
}

/// Maps a MIME type to this host's container by the same essence aliases `flight-audio` uses to
/// pick the `ogg` and `wav` decode slots.
fn resolve_audio_codecs_host_format(mime_type: &str) -> Option<AudioCodecsHostFormat> {
    return match get_audio_mime_type_essence(mime_type).as_str() {
        "audio/ogg" | "audio/vorbis" | "application/ogg" => Some(AudioCodecsHostFormat::Ogg),
        "audio/wav" | "audio/wave" | "audio/x-wav" | "audio/vnd.wave" => {
            Some(AudioCodecsHostFormat::Wav)
        }
        _ => None,
    };
}

fn validate_options(
    options: &AudioCodecsHostOptions,
) -> Result<(), (AudioCodecsHostOptionsExplanationReason, &'static str)> {
    if !(1..=32).contains(&options.max_channels) {
        return Err((
            AudioCodecsHostOptionsExplanationReason::MaxChannelsOutOfRange,
            "max_channels must be between 1 and 32",
        ));
    }
    if options.max_decoded_samples == 0 {
        return Err((
            AudioCodecsHostOptionsExplanationReason::MaxDecodedSamplesZero,
            "max_decoded_samples must be at least 1",
        ));
    }
    if options.max_encoded_bytes == 0 {
        return Err((
            AudioCodecsHostOptionsExplanationReason::MaxEncodedBytesZero,
            "max_encoded_bytes must be at least 1",
        ));
    }
    return Ok(());
}

impl Drop for AudioCodecsHost {
    fn drop(&mut self) {
        dispose_audio_codecs_host(self);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AudioCodecsHostFormat {
    Ogg,
    Wav,
}
