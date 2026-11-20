#![cfg(feature = "wav")]

use flight_host_audio_codecs::*;
use flight_stream::{abort_controller, create_abort_controller};

use crate::support::*;

fn decode(host: &AudioCodecsHost, bytes: &[u8]) -> flight_entity::Ref<flight_audio::AudioBuffer> {
    return decode_audio_with_audio_codecs_host(host, bytes, "audio/wav", None).unwrap_or_else(
        || {
            let explanation = explain_audio_codecs_host_decode(host, bytes, "audio/wav", None);
            panic!("decode failed: {explanation:?}");
        },
    );
}

fn explain(host: &AudioCodecsHost, bytes: &[u8]) -> AudioCodecsHostDecodeExplanation {
    return explain_audio_codecs_host_decode(host, bytes, "audio/wav", None);
}

fn stereo_pcm16() -> Vec<u8> {
    // Left: -32768, 0, 16384. Right: 32767, -16384, 1.
    return encode_wav(
        1,
        2,
        44_100,
        16,
        &interleave_i16(&[i16::MIN, i16::MAX, 0, -16_384, 16_384, 1]),
        None,
    );
}

mod layout {
    use super::*;

    #[test]
    fn deinterleaves_stereo_pcm16_with_exact_scaling() {
        let host = create_default_host();
        let buffer = decode(&host, &stereo_pcm16());
        assert_eq!(read_layout(&buffer), (2, 44_100.0, 3));
        assert_eq!(read_channel(&buffer, 0), vec![-1.0, 0.0, 0.5]);
        assert_eq!(
            read_channel(&buffer, 1),
            vec![32_767.0 / 32_768.0, -0.5, 1.0 / 32_768.0]
        );
    }

    #[test]
    fn scales_unsigned_8_bit_samples_around_128() {
        let host = create_default_host();
        let bytes = encode_wav(1, 1, 8_000, 8, &[0, 128, 255, 64], None);
        let buffer = decode(&host, &bytes);
        assert_eq!(read_layout(&buffer), (1, 8_000.0, 4));
        assert_eq!(
            read_channel(&buffer, 0),
            vec![-1.0, 0.0, 127.0 / 128.0, -0.5]
        );
    }

    #[test]
    fn scales_24_and_32_bit_integer_samples() {
        let host = create_default_host();
        let mut data = Vec::new();
        for value in [-8_388_608_i32, 8_388_607, 4_194_304] {
            data.extend_from_slice(&value.to_le_bytes()[..3]);
        }
        let buffer = decode(&host, &encode_wav(1, 1, 48_000, 24, &data, None));
        assert_eq!(
            read_channel(&buffer, 0),
            vec![-1.0, 8_388_607.0 / 8_388_608.0, 0.5]
        );
        let data: Vec<u8> = [i32::MIN, 1 << 30, -(1 << 29)]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let buffer = decode(&host, &encode_wav(1, 1, 48_000, 32, &data, None));
        assert_eq!(read_channel(&buffer, 0), vec![-1.0, 0.5, -0.25]);
    }

    #[test]
    fn passes_float_samples_through_unclamped() {
        let host = create_default_host();
        let data: Vec<u8> = [0.25_f32, -0.75, 1.5, -2.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let buffer = decode(&host, &encode_wav(3, 2, 96_000, 32, &data, None));
        assert_eq!(read_layout(&buffer), (2, 96_000.0, 2));
        assert_eq!(read_channel(&buffer, 0), vec![0.25, 1.5]);
        assert_eq!(read_channel(&buffer, 1), vec![-0.75, -2.0]);
    }

    #[test]
    fn decodes_extensible_pcm_with_a_channel_mask() {
        let host = create_default_host();
        let mut data = Vec::new();
        for value in [4_194_304_i32, -4_194_304, 0, 8_388_607] {
            data.extend_from_slice(&value.to_le_bytes()[..3]);
        }
        let bytes = encode_wav_extensible_pcm(2, 32_000, 24, 0b11, &data);
        let buffer = decode(&host, &bytes);
        assert_eq!(read_layout(&buffer), (2, 32_000.0, 2));
        assert_eq!(read_channel(&buffer, 0), vec![0.5, 0.0]);
        assert_eq!(
            read_channel(&buffer, 1),
            vec![-0.5, 8_388_607.0 / 8_388_608.0]
        );
    }

    #[test]
    fn integer_samples_stay_within_the_unit_range() {
        let host = create_default_host();
        let samples: Vec<i16> = (0..4_096)
            .map(|index| return (index * 16 - 32_768) as i16)
            .collect();
        let buffer = decode(
            &host,
            &encode_wav(1, 1, 22_050, 16, &interleave_i16(&samples), None),
        );
        let channel = read_channel(&buffer, 0);
        assert_eq!(channel.len(), 4_096);
        assert!(channel.iter().all(|value| (-1.0..1.0).contains(value)));
        assert_eq!(channel[0], -1.0);
    }
}

mod failures {
    use super::*;

    #[test]
    fn malformed_containers_are_explained() {
        let host = create_default_host();
        let mut not_wave = stereo_pcm16();
        not_wave[8..12].copy_from_slice(b"AVI ");
        for bytes in [b"not a wave file at all".to_vec(), not_wave] {
            assert!(
                decode_audio_with_audio_codecs_host(&host, &bytes, "audio/wav", None).is_none()
            );
            assert_reason(
                &explain(&host, &bytes),
                AudioCodecsHostDecodeExplanationReason::MalformedInput,
            );
        }
    }

    #[test]
    fn truncated_headers_and_data_are_explained() {
        let host = create_default_host();
        let full = stereo_pcm16();
        let header_cut = &full[..20];
        let mid_frame = &full[..full.len() - 3];
        let short_data = encode_wav(1, 1, 8_000, 16, &interleave_i16(&[1, 2, 3]), Some(12));
        for bytes in [header_cut, mid_frame, &short_data[..]] {
            assert!(decode_audio_with_audio_codecs_host(&host, bytes, "audio/wav", None).is_none());
            assert_reason(
                &explain(&host, bytes),
                AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            );
        }
    }

    #[test]
    fn every_prefix_fails_closed_or_decodes_whole_frames() {
        let host = create_default_host();
        let full = stereo_pcm16();
        for length in 1..full.len() {
            let explanation = explain(&host, &full[..length]);
            assert_ne!(
                explanation.reason,
                AudioCodecsHostDecodeExplanationReason::Ready,
                "prefix {length}"
            );
            assert!(
                decode_audio_with_audio_codecs_host(&host, &full[..length], "audio/wav", None)
                    .is_none()
            );
        }
    }

    #[test]
    fn unsupported_sample_encodings_are_explained() {
        let host = create_default_host();
        let a_law = encode_wav(6, 1, 8_000, 8, &[1, 2, 3, 4], None);
        let float64 = encode_wav(3, 1, 8_000, 64, &[0; 16], None);
        let pcm12 = encode_wav(1, 1, 8_000, 12, &[0; 4], None);
        for bytes in [a_law, float64, pcm12] {
            assert!(
                decode_audio_with_audio_codecs_host(&host, &bytes, "audio/wav", None).is_none()
            );
            assert_reason(
                &explain(&host, &bytes),
                AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
            );
        }
    }

    #[test]
    fn sample_rates_outside_the_audio_buffer_range_are_explained() {
        let host = create_default_host();
        for sample_rate in [2_999, 768_001] {
            let bytes = encode_wav(1, 1, sample_rate, 16, &interleave_i16(&[1]), None);
            assert_reason(
                &explain(&host, &bytes),
                AudioCodecsHostDecodeExplanationReason::UnsupportedSampleRate,
            );
        }
        for sample_rate in [3_000, 768_000] {
            let bytes = encode_wav(1, 1, sample_rate, 16, &interleave_i16(&[1]), None);
            assert_reason(
                &explain(&host, &bytes),
                AudioCodecsHostDecodeExplanationReason::Ready,
            );
        }
    }

    #[test]
    fn channel_counts_beyond_an_audio_buffer_are_explained() {
        let host = create_default_host();
        let bytes = encode_wav(1, 33, 8_000, 16, &interleave_i16(&[0; 33]), None);
        assert_reason(
            &explain(&host, &bytes),
            AudioCodecsHostDecodeExplanationReason::UnsupportedChannelCount,
        );
        let bytes = encode_wav(1, 32, 8_000, 16, &interleave_i16(&[0; 32]), None);
        let buffer = decode(&host, &bytes);
        assert_eq!(read_layout(&buffer), (32, 8_000.0, 1));
    }

    #[test]
    fn an_empty_data_chunk_is_explained() {
        let host = create_default_host();
        let bytes = encode_wav(1, 2, 8_000, 16, &[], None);
        assert!(decode_audio_with_audio_codecs_host(&host, &bytes, "audio/wav", None).is_none());
        assert_reason(
            &explain(&host, &bytes),
            AudioCodecsHostDecodeExplanationReason::NoAudioFrames,
        );
    }
}

mod limits {
    use super::*;

    fn host_with(max_channels: usize, max_decoded_samples: usize) -> AudioCodecsHost {
        let options = AudioCodecsHostOptions {
            max_channels,
            max_decoded_samples,
            ..create_audio_codecs_host_options()
        };
        return create_audio_codecs_host(Some(&options)).unwrap();
    }

    #[test]
    fn channel_and_sample_limits_apply_at_their_boundaries() {
        let bytes = stereo_pcm16();
        assert_reason(
            &explain(&host_with(1, 1_000), &bytes),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
        );
        assert_reason(
            &explain(&host_with(2, 5), &bytes),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
        );
        assert_reason(
            &explain(&host_with(2, 6), &bytes),
            AudioCodecsHostDecodeExplanationReason::Ready,
        );
    }

    #[test]
    fn a_huge_declared_length_is_rejected_or_bounded_by_the_input() {
        let bytes = encode_wav(1, 2, 8_000, 16, &interleave_i16(&[1, 2]), Some(0xffff_fff0));
        assert_reason(
            &explain(&create_default_host(), &bytes),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
        );
        // With the sample limit lifted the decoder reserves only what the input holds, then
        // reports the missing data.
        assert_reason(
            &explain(&host_with(2, usize::MAX), &bytes),
            AudioCodecsHostDecodeExplanationReason::TruncatedInput,
        );
    }
}

mod capability {
    use super::*;

    fn long_stereo_wav() -> Vec<u8> {
        let samples: Vec<i16> = (0..8_000_000)
            .map(|index| return (index % 512) as i16)
            .collect();
        return encode_wav(1, 2, 48_000, 16, &interleave_i16(&samples), None);
    }

    #[test]
    fn dispose_and_abort_stop_a_decode_in_progress() {
        let mut host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .wav
            .clone()
            .unwrap();
        let bytes = long_stereo_wav();
        let controller = create_abort_controller();
        let signal = controller.signal.clone();
        let aborting = slot.clone();
        let aborted = interrupt_running_decode(
            create_byte_handle(&bytes),
            move |bytes| return block_on((aborting.decode)(bytes, signal)),
            || abort_controller(&controller, None),
        );
        assert!(aborted.is_none());
        let disposed = interrupt_running_decode(
            create_byte_handle(&bytes),
            move |bytes| return block_on((slot.decode)(bytes, create_abort_controller().signal)),
            || dispose_audio_codecs_host(&mut host),
        );
        assert!(disposed.is_none());
    }

    #[test]
    fn the_wav_slot_matches_the_direct_decode_and_rejects_other_containers() {
        let host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .wav
            .clone()
            .unwrap();
        let signal = create_abort_controller().signal;
        let buffer = block_on((slot.decode)(
            create_byte_handle(&stereo_pcm16()),
            signal.clone(),
        ))
        .unwrap();
        assert_eq!(read_layout(&buffer), (2, 44_100.0, 3));
        assert_eq!(
            read_channel(&buffer, 1),
            vec![32_767.0 / 32_768.0, -0.5, 1.0 / 32_768.0]
        );
        assert!(block_on((slot.decode)(create_byte_handle(b"OggS\0\0\0\0"), signal)).is_none());
    }

    #[test]
    fn an_aborted_signal_resolves_the_slot_to_none() {
        let host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .wav
            .clone()
            .unwrap();
        let controller = create_abort_controller();
        let future = (slot.decode)(
            create_byte_handle(&stereo_pcm16()),
            controller.signal.clone(),
        );
        abort_controller(&controller, None);
        assert!(block_on(future).is_none());
    }

    #[test]
    fn a_future_created_before_dispose_fails_closed_when_polled() {
        let mut host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .wav
            .clone()
            .unwrap();
        let future = (slot.decode)(
            create_byte_handle(&stereo_pcm16()),
            create_abort_controller().signal,
        );
        dispose_audio_codecs_host(&mut host);
        assert!(block_on(future).is_none());
    }

    #[test]
    fn concurrent_decodes_share_one_host() {
        let host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .wav
            .clone()
            .unwrap();
        std::thread::scope(|scope| {
            for thread in 0..8_i16 {
                let slot = slot.clone();
                let host = &host;
                scope.spawn(move || {
                    let samples: Vec<i16> = (0..2_048)
                        .map(|index| return (index % 64) * thread)
                        .collect();
                    let bytes = encode_wav(1, 1, 16_000, 16, &interleave_i16(&samples), None);
                    let direct = decode(host, &bytes);
                    let retained = block_on((slot.decode)(
                        create_byte_handle(&bytes),
                        create_abort_controller().signal,
                    ))
                    .unwrap();
                    let expected: Vec<f32> = samples
                        .iter()
                        .map(|value| return f32::from(*value) / 32_768.0)
                        .collect();
                    assert_eq!(read_channel(&direct, 0), expected);
                    assert_eq!(read_channel(&retained, 0), expected);
                });
            }
        });
    }
}
