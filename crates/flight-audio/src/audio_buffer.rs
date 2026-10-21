use std::sync::{Arc, RwLock};

use flight_entity::{FlightError, FlightErrorKind, Float32Array, Ref};

use crate::types::AudioBuffer;

/// Allocates the zero-filled PCM storage prescribed by Web Audio's `AudioBuffer` constructor.
/// The portable contract uses the spec-required channel range and sample-rate range rather than a
/// provider-dependent extension.
// flight-lint: allow(conform-extra) Principal-approved Rust mapping for the Web Audio AudioBuffer constructor
pub fn create_audio_buffer(
    length: usize,
    number_of_channels: usize,
    sample_rate: f32,
) -> Ref<AudioBuffer> {
    if !(1..=32).contains(&number_of_channels) {
        throw_not_supported("AudioBuffer: numberOfChannels must be between 1 and 32");
    }
    if length == 0 || length.checked_mul(number_of_channels).is_none() {
        throw_not_supported("AudioBuffer: length must be at least 1");
    }
    if !sample_rate.is_finite() || !(3_000.0..=768_000.0).contains(&sample_rate) {
        throw_not_supported("AudioBuffer: sampleRate must be between 3000 and 768000");
    }
    let channels: Vec<Ref<Box<Float32Array>>> = (0..number_of_channels)
        .map(|_| {
            let samples: Box<Float32Array> = std::iter::repeat_n(0.0, length).collect();
            Arc::new(RwLock::new(samples))
        })
        .collect();
    return Arc::new(RwLock::new(AudioBuffer {
        sample_rate,
        length,
        channels: channels.into_boxed_slice(),
    }));
}

/// Copies samples into one channel from offset zero, matching the source's `copyToChannel` call.
/// Rust accepts a slice for the source while the generated TS signature remains Float32Array; the
/// copy stops at the AudioBuffer length and leaves any remaining destination samples unchanged.
// flight-lint: allow(conform-extra) Principal-approved Rust mapping for AudioBuffer.copyToChannel used by the source
pub fn copy_to_audio_buffer_channel(
    buffer: &Ref<AudioBuffer>,
    source: &Float32Array,
    channel: usize,
) {
    let channel = buffer.read().unwrap().channels[channel].clone();
    let mut destination = channel.write().unwrap();
    let count = destination.len().min(source.len());
    destination[..count].copy_from_slice(&source[..count]);
}

fn throw_not_supported(message: &str) -> ! {
    std::panic::panic_any(FlightError {
        kind: FlightErrorKind::NotSupportedError,
        message: message.to_string(),
    });
}

impl AudioBuffer {
    pub fn new(length: usize, number_of_channels: usize, sample_rate: f32) -> Ref<AudioBuffer> {
        return create_audio_buffer(length, number_of_channels, sample_rate);
    }
}
