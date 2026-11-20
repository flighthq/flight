use std::io::Cursor;

use flight_audio::AudioBuffer;
use flight_entity::Ref;
use hound::{Error, Sample, SampleFormat, WavReader, WavSamples};

use crate::decoded_audio::{
    DecodeFailure, DecodeWatch, check_decode_watch, create_decode_failure,
    create_decoded_audio_buffer, no_audio_frames, validate_decoded_layout,
    validate_decoded_sample_count,
};
use crate::types::{AudioCodecsHostDecodeExplanationReason, AudioCodecsHostOptions};

/// Decodes a RIFF/WAVE file holding 8-, 16-, 24- or 32-bit integer PCM or 32-bit float samples.
/// Integer samples scale by 2^(bits - 1), so the most negative code is exactly -1.0; float samples
/// pass through unchanged.
pub(crate) fn decode_wav(
    options: &AudioCodecsHostOptions,
    bytes: &[u8],
    watch: &DecodeWatch<'_>,
) -> Result<Ref<AudioBuffer>, DecodeFailure> {
    let mut reader = WavReader::new(Cursor::new(bytes))
        .map_err(|error| return map_wav_open_error(bytes, error))?;
    let spec = reader.spec();
    let channels = usize::from(spec.channels);
    validate_decoded_layout(options, channels, spec.sample_rate)?;
    let frames = reader.duration() as usize;
    if frames == 0 {
        return Err(no_audio_frames());
    }
    validate_decoded_sample_count(options, channels, frames)?;
    // The header's declared length is untrusted: reserve no more frames than the input could hold.
    let bytes_per_frame = usize::from(spec.bits_per_sample).div_ceil(8) * channels;
    let capacity = frames.min(bytes.len() / bytes_per_frame.max(1));
    let mut planar: Vec<Vec<f32>> = (0..channels)
        .map(|_| return Vec::with_capacity(capacity))
        .collect();
    match (spec.sample_format, spec.bits_per_sample) {
        (SampleFormat::Float, 32) => {
            read_wav_samples(reader.samples::<f32>(), &mut planar, watch, |value| value)?;
        }
        (SampleFormat::Int, 8) => {
            read_wav_samples(reader.samples::<i8>(), &mut planar, watch, |value| {
                return f32::from(value) / 128.0;
            })?;
        }
        (SampleFormat::Int, 16) => {
            read_wav_samples(reader.samples::<i16>(), &mut planar, watch, |value| {
                return f32::from(value) / 32_768.0;
            })?;
        }
        (SampleFormat::Int, 24) => {
            read_wav_samples(reader.samples::<i32>(), &mut planar, watch, |value| {
                return value as f32 / 8_388_608.0;
            })?;
        }
        (SampleFormat::Int, 32) => {
            read_wav_samples(reader.samples::<i32>(), &mut planar, watch, |value| {
                return value as f32 / 2_147_483_648.0;
            })?;
        }
        _ => {
            return Err(create_decode_failure(
                AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
                "WAV sample format is not 8/16/24/32-bit integer or 32-bit float",
            ));
        }
    }
    return Ok(create_decoded_audio_buffer(spec.sample_rate, planar));
}

fn is_wav_encoding_supported(format_tag: u16, bits_per_sample: u16) -> bool {
    return match format_tag {
        WAVE_FORMAT_PCM => matches!(bits_per_sample, 8 | 16 | 24 | 32),
        WAVE_FORMAT_IEEE_FLOAT => bits_per_sample == 32,
        _ => false,
    };
}

fn map_wav_error(error: Error) -> DecodeFailure {
    return match error {
        // The reader wraps an in-memory slice, which fails a read only when it runs out of bytes.
        Error::IoError(_) => create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            "WAV input ends before the data its headers declare",
        ),
        Error::UnfinishedSample => create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            "WAV data ends inside a sample frame",
        ),
        Error::TooWide | Error::Unsupported | Error::InvalidSampleFormat => create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
            "WAV sample encoding is not supported",
        ),
        Error::FormatError(_) => create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::MalformedInput,
            "input is not a well-formed WAV file",
        ),
    };
}

/// Header rejections name a well-formed but unsupported encoding (such as 12-bit or 64-bit float
/// samples) whenever the `fmt ` chunk itself is readable; anything else is malformed.
fn map_wav_open_error(bytes: &[u8], error: Error) -> DecodeFailure {
    if let Error::FormatError(_) = error
        && let Some((format_tag, bits_per_sample)) = read_wav_format(bytes)
        && !is_wav_encoding_supported(format_tag, bits_per_sample)
    {
        return create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
            "WAV sample encoding is not supported",
        );
    }
    return map_wav_error(error);
}

/// The format tag (resolved through an extensible header's sub-format) and bits per sample of
/// the first `fmt ` chunk, or `None` when the RIFF chunk walk does not reach one.
fn read_wav_format(bytes: &[u8]) -> Option<(u16, u16)> {
    if bytes.get(0..4)? != b"RIFF" || bytes.get(8..12)? != b"WAVE" {
        return None;
    }
    let read_u16 = |offset: usize| {
        return Some(u16::from_le_bytes(
            bytes.get(offset..offset + 2)?.try_into().ok()?,
        ));
    };
    let mut offset: usize = 12;
    loop {
        let id = bytes.get(offset..offset + 4)?;
        let size = u32::from_le_bytes(bytes.get(offset + 4..offset + 8)?.try_into().ok()?) as usize;
        let body = offset + 8;
        if id == b"fmt " && size >= 16 {
            let mut format_tag = read_u16(body)?;
            let bits_per_sample = read_u16(body + 14)?;
            if format_tag == WAVE_FORMAT_EXTENSIBLE && size >= 40 {
                format_tag = read_u16(body + 24)?;
            }
            return Some((format_tag, bits_per_sample));
        }
        offset = body.checked_add(size)?.checked_add(size & 1)?;
    }
}

fn read_wav_samples<S: Sample>(
    samples: WavSamples<'_, Cursor<&[u8]>, S>,
    planar: &mut [Vec<f32>],
    watch: &DecodeWatch<'_>,
    convert: impl Fn(S) -> f32,
) -> Result<(), DecodeFailure> {
    let channels = planar.len();
    for (index, sample) in samples.enumerate() {
        if index % WAV_SAMPLES_PER_WATCH_CHECK == 0 {
            check_decode_watch(watch)?;
        }
        let value = sample.map_err(map_wav_error)?;
        planar[index % channels].push(convert(value));
    }
    return Ok(());
}

const WAVE_FORMAT_EXTENSIBLE: u16 = 0xfffe;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
const WAVE_FORMAT_PCM: u16 = 1;
const WAV_SAMPLES_PER_WATCH_CHECK: usize = 1 << 16;
