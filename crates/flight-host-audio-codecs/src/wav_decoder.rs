use std::io::Cursor;

use flight_audio::AudioBuffer;
use flight_entity::Ref;
use hound::{Error, Sample, SampleFormat, WavReader, WavSamples};

use crate::decoded_audio::{
    DecodeFailure, DecodeWatch, check_decode_watch, create_decode_failure,
    create_decoded_audio_buffer,
};
use crate::types::{AudioCodecsHostDecodeExplanationReason, AudioCodecsHostOptions};
use crate::wav_preflight::preflight_wav;

// The contract file-structure rule requires modules before functions.
#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicBool;

    use super::*;
    use crate::audio_codecs_host::create_audio_codecs_host_options;
    use crate::generated_media::{encode_wav, interleave_i16};
    use crate::types::AudioCodecsHostState;

    fn decode_counting_backing(
        options: &AudioCodecsHostOptions,
        bytes: &[u8],
    ) -> (AudioCodecsHostDecodeExplanationReason, usize) {
        let state = AudioCodecsHostState {
            alive: AtomicBool::new(true),
        };
        let watch = DecodeWatch {
            signal: None,
            state: &state,
        };
        WAV_BACKING_OPENS.with(|count| count.set(0));
        let reason = match decode_wav(options, bytes, &watch) {
            Ok(_) => AudioCodecsHostDecodeExplanationReason::Ready,
            Err(failure) => failure.reason,
        };
        return (reason, WAV_BACKING_OPENS.with(|count| return count.get()));
    }

    #[test]
    fn accepted_declarations_open_the_backing_reader_once() {
        let at_cap = AudioCodecsHostOptions {
            max_decoded_samples: 4,
            ..create_audio_codecs_host_options()
        };
        let four_samples = encode_wav(1, 2, 8_000, 16, &interleave_i16(&[1, 2, 3, 4]), None);
        assert_eq!(
            decode_counting_backing(&at_cap, &four_samples),
            (AudioCodecsHostDecodeExplanationReason::Ready, 1)
        );
    }

    #[test]
    fn declarations_beyond_the_input_or_cap_never_reach_the_backing_reader() {
        let lifted = AudioCodecsHostOptions {
            max_decoded_samples: usize::MAX,
            ..create_audio_codecs_host_options()
        };
        let tiny = encode_wav(1, 2, 8_000, 16, &interleave_i16(&[1, 2]), Some(0xffff_fff0));
        assert_eq!(
            decode_counting_backing(&lifted, &tiny),
            (AudioCodecsHostDecodeExplanationReason::TruncatedInput, 0)
        );
        assert_eq!(
            decode_counting_backing(&create_audio_codecs_host_options(), &tiny),
            (
                AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
                0
            )
        );
        let below_cap = AudioCodecsHostOptions {
            max_decoded_samples: 3,
            ..create_audio_codecs_host_options()
        };
        let four_samples = encode_wav(1, 2, 8_000, 16, &interleave_i16(&[1, 2, 3, 4]), None);
        assert_eq!(
            decode_counting_backing(&below_cap, &four_samples),
            (
                AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
                0
            )
        );
        let a_law = encode_wav(6, 1, 8_000, 8, &[1, 2], None);
        assert_eq!(
            decode_counting_backing(&lifted, &a_law),
            (
                AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
                0
            )
        );
    }
}

/// Decodes a RIFF/WAVE file holding 8-, 16-, 24- or 32-bit integer PCM or 32-bit float samples.
/// Integer samples scale by 2^(bits - 1), so the most negative code is exactly -1.0; float samples
/// pass through unchanged. `preflight_wav` settles the layout and frame count first, so the
/// backing reader never sees a declaration beyond the input or the host limits, and storage is
/// reserved for exactly the preflighted frames.
pub(crate) fn decode_wav(
    options: &AudioCodecsHostOptions,
    bytes: &[u8],
    watch: &DecodeWatch<'_>,
) -> Result<Ref<AudioBuffer>, DecodeFailure> {
    let layout = preflight_wav(options, bytes)?;
    let mut reader = open_wav_backing(bytes).map_err(map_wav_error)?;
    let spec = reader.spec();
    if usize::from(spec.channels) != layout.channels || spec.sample_rate != layout.sample_rate {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::MalformedInput,
            "the WAV header is read inconsistently",
        ));
    }
    let mut planar: Vec<Vec<f32>> = (0..layout.channels)
        .map(|_| return Vec::with_capacity(layout.frames))
        .collect();
    match (spec.sample_format, spec.bits_per_sample) {
        (SampleFormat::Float, 32) => {
            read_wav_samples(reader.samples::<f32>(), &mut planar, watch, |value| {
                return value;
            })?;
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
    return Ok(create_decoded_audio_buffer(layout.sample_rate, planar));
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

/// Opens the backing reader. Unit tests count these entries to prove that a preflight rejection
/// never reaches the backing parser.
fn open_wav_backing(bytes: &[u8]) -> Result<WavReader<Cursor<&[u8]>>, Error> {
    #[cfg(test)]
    WAV_BACKING_OPENS.with(|count| count.set(count.get() + 1));
    return WavReader::new(Cursor::new(bytes));
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

const WAV_SAMPLES_PER_WATCH_CHECK: usize = 1 << 16;

// flight-lint: allow(hidden-state) test-only probe counting backing-parser entries; compiled out of the library
#[cfg(test)]
thread_local! {
    /// How many times this thread has opened the backing reader.
    static WAV_BACKING_OPENS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}
