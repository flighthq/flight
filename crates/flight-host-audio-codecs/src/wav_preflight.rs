use crate::decoded_audio::{
    DecodeFailure, create_decode_failure, no_audio_frames, validate_decoded_layout,
    validate_decoded_sample_count,
};
use crate::types::{AudioCodecsHostDecodeExplanationReason, AudioCodecsHostOptions};

// The contract file-structure rule requires modules before functions.
#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_codecs_host::create_audio_codecs_host_options;
    use crate::generated_media::{encode_wav, interleave_i16};

    fn options_with_samples(max_decoded_samples: usize) -> AudioCodecsHostOptions {
        return AudioCodecsHostOptions {
            max_decoded_samples,
            ..create_audio_codecs_host_options()
        };
    }

    fn reason_of<T>(result: Result<T, DecodeFailure>) -> AudioCodecsHostDecodeExplanationReason {
        return match result {
            Ok(_) => AudioCodecsHostDecodeExplanationReason::Ready,
            Err(failure) => failure.reason,
        };
    }

    #[test]
    fn frame_count_divides_declared_bytes_by_whole_frames() {
        let options = options_with_samples(usize::MAX);
        assert_eq!(get_wav_frame_count(&options, 2, 2, 12, 12).ok(), Some(3));
        assert_eq!(get_wav_frame_count(&options, 3, 3, 9, 9).ok(), Some(1));
        assert_eq!(
            reason_of(get_wav_frame_count(&options, 2, 2, 0, 0)),
            AudioCodecsHostDecodeExplanationReason::NoAudioFrames
        );
        // A trailing partial frame is malformed, as the backing reader would also judge it.
        for declared in [3, 14] {
            assert_eq!(
                reason_of(get_wav_frame_count(&options, 2, 2, declared, declared)),
                AudioCodecsHostDecodeExplanationReason::MalformedInput
            );
        }
    }

    #[test]
    fn frame_count_arithmetic_never_overflows() {
        let options = options_with_samples(usize::MAX);
        assert_eq!(
            reason_of(get_wav_frame_count(
                &options,
                usize::MAX,
                2,
                usize::MAX,
                usize::MAX
            )),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded
        );
        assert_eq!(
            get_wav_frame_count(&options, 1, usize::MAX, usize::MAX, usize::MAX).ok(),
            Some(1)
        );
        // The largest declaration yields a sample product that still fits.
        assert_eq!(
            get_wav_frame_count(&options, 2, 1, usize::MAX - 1, usize::MAX).ok(),
            Some(usize::MAX / 2)
        );
        assert_eq!(
            reason_of(get_wav_frame_count(&options, 0, 2, 8, 8)),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded
        );
    }

    #[test]
    fn the_sample_cap_applies_to_the_declaration_at_its_boundary() {
        // 1,000 stereo frames of 16-bit samples are 2,000 samples.
        let at_cap = options_with_samples(2_000);
        assert_eq!(
            get_wav_frame_count(&at_cap, 2, 2, 4_000, 4_000).ok(),
            Some(1_000)
        );
        let below_cap = options_with_samples(1_999);
        assert_eq!(
            reason_of(get_wav_frame_count(&below_cap, 2, 2, 4_000, 4_000)),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded
        );
        // The cap wins even when the input could not hold the declaration.
        assert_eq!(
            reason_of(get_wav_frame_count(&below_cap, 2, 2, 4_000, 4)),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded
        );
    }

    #[test]
    fn a_declaration_beyond_the_input_is_rejected_at_its_boundary() {
        let options = options_with_samples(usize::MAX);
        assert_eq!(
            get_wav_frame_count(&options, 2, 2, 400, 400).ok(),
            Some(100)
        );
        assert_eq!(
            reason_of(get_wav_frame_count(&options, 2, 2, 404, 400)),
            AudioCodecsHostDecodeExplanationReason::TruncatedInput
        );
        assert_eq!(
            reason_of(get_wav_frame_count(&options, 2, 2, 0xffff_fff0, 4)),
            AudioCodecsHostDecodeExplanationReason::TruncatedInput
        );
    }

    #[test]
    fn preflight_reads_the_layout_and_bounds_a_huge_declaration_by_the_input() {
        let options = options_with_samples(usize::MAX);
        let bytes = encode_wav(1, 2, 44_100, 16, &interleave_i16(&[1, 2, 3, 4]), None);
        let layout = preflight_wav(&options, &bytes).ok().unwrap();
        assert_eq!(
            (layout.channels, layout.frames, layout.sample_rate),
            (2, 2, 44_100)
        );
        let tiny = encode_wav(
            1,
            2,
            44_100,
            16,
            &interleave_i16(&[1, 2]),
            Some(0xffff_fff0),
        );
        assert_eq!(
            reason_of(preflight_wav(&options, &tiny)),
            AudioCodecsHostDecodeExplanationReason::TruncatedInput
        );
        let capped = options_with_samples(64 * 1024 * 1024);
        assert_eq!(
            reason_of(preflight_wav(&capped, &tiny)),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded
        );
    }

    #[test]
    fn preflight_classifies_containers_and_encodings() {
        let options = create_audio_codecs_host_options();
        let valid = encode_wav(1, 1, 8_000, 16, &interleave_i16(&[1, 2]), None);
        let cases: [(&[u8], AudioCodecsHostDecodeExplanationReason); 7] = [
            (
                &valid[..6],
                AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            ),
            (
                &valid[..30],
                AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            ),
            (
                &valid[..40],
                AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            ),
            (
                b"RIFX\0\0\0\0WAVE",
                AudioCodecsHostDecodeExplanationReason::MalformedInput,
            ),
            (
                b"not a wave file at all",
                AudioCodecsHostDecodeExplanationReason::MalformedInput,
            ),
            (
                &encode_wav(1, 1, 8_000, 12, &[0; 4], None),
                AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
            ),
            (
                &encode_wav(1, 1, 1_000, 16, &[0; 4], None),
                AudioCodecsHostDecodeExplanationReason::UnsupportedSampleRate,
            ),
        ];
        for (bytes, reason) in cases {
            assert_eq!(reason_of(preflight_wav(&options, bytes)), reason);
        }
        let mut data_first = Vec::new();
        data_first.extend_from_slice(b"RIFF\x10\0\0\0WAVEdata\x02\0\0\0\x01\x02");
        assert_eq!(
            reason_of(preflight_wav(&options, &data_first)),
            AudioCodecsHostDecodeExplanationReason::MalformedInput
        );
    }
}

/// Sizes and layout a WAV file declares, settled before any backing parser sees the input.
pub(crate) struct WavPreflight {
    pub(crate) channels: usize,
    pub(crate) frames: usize,
    pub(crate) sample_rate: u32,
}

struct WavFormat {
    bytes_per_sample: usize,
    channels: usize,
    sample_rate: u32,
}

const WAVE_FORMAT_EXTENSIBLE: u16 = 0xfffe;

const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;

const WAVE_FORMAT_PCM: u16 = 1;

/// Frames a WAV data chunk declares, accepted only when the samples they hold fit the host's
/// sample limit and the declared bytes fit the input actually supplied. A data chunk that is not
/// a whole number of frames is malformed. All arithmetic is checked, so no declaration can overflow into a small size.
pub(crate) fn get_wav_frame_count(
    options: &AudioCodecsHostOptions,
    channels: usize,
    bytes_per_sample: usize,
    declared_data_bytes: usize,
    available_data_bytes: usize,
) -> Result<usize, DecodeFailure> {
    let Some(frame_bytes) = channels
        .checked_mul(bytes_per_sample)
        .filter(|bytes| return *bytes > 0)
    else {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
            "the WAV frame size is zero or overflows",
        ));
    };
    if !declared_data_bytes.is_multiple_of(frame_bytes) {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::MalformedInput,
            "the WAV data chunk is not a whole number of frames",
        ));
    }
    let frames = declared_data_bytes / frame_bytes;
    if frames == 0 {
        return Err(no_audio_frames());
    }
    validate_decoded_sample_count(options, channels, frames)?;
    if declared_data_bytes > available_data_bytes {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            "the WAV data chunk declares more bytes than the input holds",
        ));
    }
    return Ok(frames);
}

fn is_wav_encoding_supported(format_tag: u16, bits_per_sample: u16) -> bool {
    return match format_tag {
        WAVE_FORMAT_PCM => matches!(bits_per_sample, 8 | 16 | 24 | 32),
        WAVE_FORMAT_IEEE_FLOAT => bits_per_sample == 32,
        _ => false,
    };
}

fn malformed() -> DecodeFailure {
    return create_decode_failure(
        AudioCodecsHostDecodeExplanationReason::MalformedInput,
        "input is not a well-formed WAV file",
    );
}

/// Walks the RIFF/WAVE chunks up to the data chunk header and settles the layout and frame count
/// before any backing parser runs: the encoding must be one this host decodes, the layout must fit
/// an AudioBuffer and the host limits, and the declared data must fit both the sample limit and
/// the input. Nothing is allocated.
pub(crate) fn preflight_wav(
    options: &AudioCodecsHostOptions,
    bytes: &[u8],
) -> Result<WavPreflight, DecodeFailure> {
    let Some(header) = bytes.get(..12) else {
        let prefix = &bytes[..bytes.len().min(4)];
        if b"RIFF".starts_with(prefix) {
            return Err(truncated_header());
        }
        return Err(malformed());
    };
    if &header[..4] != b"RIFF" || &header[8..12] != b"WAVE" {
        return Err(malformed());
    }
    let mut format: Option<WavFormat> = None;
    let mut offset: usize = 12;
    loop {
        let Some(chunk) = bytes.get(offset..offset + 8) else {
            return Err(truncated_header());
        };
        let size = u32::from_le_bytes([chunk[4], chunk[5], chunk[6], chunk[7]]) as usize;
        let body = offset + 8;
        match &chunk[..4] {
            b"fmt " => {
                format = Some(read_wav_format(options, bytes, body, size)?);
            }
            b"data" => {
                let Some(format) = format else {
                    return Err(malformed());
                };
                let frames = get_wav_frame_count(
                    options,
                    format.channels,
                    format.bytes_per_sample,
                    size,
                    bytes.len() - body,
                )?;
                return Ok(WavPreflight {
                    channels: format.channels,
                    frames,
                    sample_rate: format.sample_rate,
                });
            }
            _ => {}
        }
        let Some(next) = body
            .checked_add(size)
            .and_then(|end| return end.checked_add(size & 1))
        else {
            return Err(malformed());
        };
        offset = next;
    }
}

/// Reads one `fmt ` chunk body, resolving an extensible header's sub-format, and checks that it
/// names an encoding and layout this host decodes.
fn read_wav_format(
    options: &AudioCodecsHostOptions,
    bytes: &[u8],
    body: usize,
    size: usize,
) -> Result<WavFormat, DecodeFailure> {
    if size < 16 {
        return Err(malformed());
    }
    let read_u16 = |at: usize| {
        return bytes
            .get(body + at..body + at + 2)
            .map(|pair| return u16::from_le_bytes([pair[0], pair[1]]))
            .ok_or_else(truncated_header);
    };
    let mut format_tag = read_u16(0)?;
    let channels = read_u16(2)?;
    let rate = bytes
        .get(body + 4..body + 8)
        .map(|quad| return u32::from_le_bytes([quad[0], quad[1], quad[2], quad[3]]))
        .ok_or_else(truncated_header)?;
    let bits_per_sample = read_u16(14)?;
    if format_tag == WAVE_FORMAT_EXTENSIBLE && size >= 40 {
        format_tag = read_u16(24)?;
    }
    if !is_wav_encoding_supported(format_tag, bits_per_sample) {
        return Err(create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
            "WAV sample encoding is not 8/16/24/32-bit integer PCM or 32-bit float",
        ));
    }
    validate_decoded_layout(options, usize::from(channels), rate)?;
    return Ok(WavFormat {
        bytes_per_sample: usize::from(bits_per_sample / 8),
        channels: usize::from(channels),
        sample_rate: rate,
    });
}

fn truncated_header() -> DecodeFailure {
    return create_decode_failure(
        AudioCodecsHostDecodeExplanationReason::TruncatedInput,
        "WAV input ends before its data chunk header",
    );
}
