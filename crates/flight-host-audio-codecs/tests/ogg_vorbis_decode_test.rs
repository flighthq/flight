#![cfg(feature = "ogg")]

use flight_audio::AudioBuffer;
use flight_entity::Ref;
use flight_host_audio_codecs::*;
use flight_stream::{abort_controller, create_abort_controller};

use crate::support::*;

fn decode(host: &AudioCodecsHost, bytes: &[u8]) -> Ref<AudioBuffer> {
    return decode_audio_with_audio_codecs_host(host, bytes, "audio/ogg", None).unwrap_or_else(
        || {
            let explanation = explain_audio_codecs_host_decode(host, bytes, "audio/ogg", None);
            panic!("decode failed: {explanation:?}");
        },
    );
}

fn explain(host: &AudioCodecsHost, bytes: &[u8]) -> AudioCodecsHostDecodeExplanation {
    return explain_audio_codecs_host_decode(host, bytes, "audio/ogg", None);
}

fn get_peak(samples: &[f32]) -> f32 {
    return samples
        .iter()
        .fold(0.0, |peak, value| return peak.max(value.abs()));
}

fn tone(bin: usize) -> VorbisChannelContent {
    return VorbisChannelContent::Tone { bin, level: 230 };
}

mod layout {
    use super::*;

    #[test]
    fn decodes_mono_channel_count_rate_and_frames() {
        let host = create_default_host();
        let mut shape = create_vorbis_stream_shape(vec![tone(4)]);
        shape.sample_rate = 48_000;
        let buffer = decode(&host, &encode_ogg_vorbis(&shape));
        assert_eq!(read_layout(&buffer), (1, 48_000.0, 1_024));
        let samples = read_channel(&buffer, 0);
        assert!(
            samples
                .iter()
                .all(|value| value.is_finite() && (-1.0..=1.0).contains(value))
        );
        assert!(get_peak(&samples) > 0.05);
    }

    #[test]
    fn keeps_stereo_channels_in_stream_order() {
        let host = create_default_host();
        let left_only = create_vorbis_stream_shape(vec![tone(4), VorbisChannelContent::Silent]);
        let buffer = decode(&host, &encode_ogg_vorbis(&left_only));
        assert_eq!(read_layout(&buffer), (2, 22_050.0, 1_024));
        assert!(get_peak(&read_channel(&buffer, 0)) > 0.05);
        assert!(read_channel(&buffer, 1).iter().all(|value| *value == 0.0));
        let right_only = create_vorbis_stream_shape(vec![VorbisChannelContent::Silent, tone(4)]);
        let buffer = decode(&host, &encode_ogg_vorbis(&right_only));
        assert!(read_channel(&buffer, 0).iter().all(|value| *value == 0.0));
        assert!(get_peak(&read_channel(&buffer, 1)) > 0.05);
    }

    #[test]
    fn distinct_spectra_decode_to_distinct_channels() {
        let host = create_default_host();
        let shape = create_vorbis_stream_shape(vec![tone(3), tone(40)]);
        let buffer = decode(&host, &encode_ogg_vorbis(&shape));
        let left = read_channel(&buffer, 0);
        let right = read_channel(&buffer, 1);
        assert_ne!(left, right);
        // A higher spectral line crosses zero more often.
        let crossings = |samples: &[f32]| {
            return samples
                .windows(2)
                .filter(|pair| return (pair[0] < 0.0) != (pair[1] < 0.0))
                .count();
        };
        assert!(crossings(&right) > crossings(&left) * 4);
    }

    #[test]
    fn trims_the_final_packet_to_the_last_granule_position() {
        let host = create_default_host();
        let mut shape = create_vorbis_stream_shape(vec![tone(4)]);
        shape.final_granule = Some(1_000);
        let trimmed = decode(&host, &encode_ogg_vorbis(&shape));
        assert_eq!(read_layout(&trimmed), (1, 22_050.0, 1_000));
        shape.final_granule = None;
        let full = decode(&host, &encode_ogg_vorbis(&shape));
        assert_eq!(
            read_channel(&trimmed, 0)[..],
            read_channel(&full, 0)[..1_000]
        );
    }

    #[test]
    fn decodes_packets_that_share_one_page() {
        let host = create_default_host();
        let mut shape = create_vorbis_stream_shape(vec![tone(4), tone(9)]);
        shape.single_audio_page = true;
        let buffer = decode(&host, &encode_ogg_vorbis(&shape));
        assert_eq!(read_layout(&buffer), (2, 22_050.0, 1_024));
    }
}

mod failures {
    use super::*;

    fn stream() -> Vec<u8> {
        return encode_ogg_vorbis(&create_vorbis_stream_shape(vec![tone(4)]));
    }

    #[test]
    fn non_ogg_input_and_corrupt_pages_are_malformed() {
        let host = create_default_host();
        let mut corrupt = stream();
        let last_page = *find_ogg_page_offsets(&corrupt).last().unwrap();
        let index = corrupt.len() - 2;
        assert!(index > last_page + 27);
        corrupt[index] ^= 0x40;
        let wav = encode_wav(1, 1, 8_000, 16, &interleave_i16(&[1, 2]), None);
        for bytes in [wav, b"definitely not an ogg stream".to_vec(), corrupt] {
            assert!(
                decode_audio_with_audio_codecs_host(&host, &bytes, "audio/ogg", None).is_none()
            );
            assert_reason(
                &explain(&host, &bytes),
                AudioCodecsHostDecodeExplanationReason::MalformedInput,
            );
        }
    }

    #[test]
    fn input_cut_inside_a_page_or_before_the_headers_is_truncated() {
        let host = create_default_host();
        let full = stream();
        let pages = find_ogg_page_offsets(&full);
        let cases = [
            &full[..full.len() - 5],
            &full[..pages[1] + 10],
            &full[..pages[1]],
            &full[..10],
        ];
        for bytes in cases {
            assert!(decode_audio_with_audio_codecs_host(&host, bytes, "audio/ogg", None).is_none());
            assert_reason(
                &explain(&host, bytes),
                AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            );
        }
    }

    #[test]
    fn every_prefix_and_byte_flip_fails_closed_without_panicking() {
        let host = create_default_host();
        let full = stream();
        let check = |bytes: &[u8]| {
            let explanation = explain(&host, bytes);
            assert_ne!(explanation.message, "the decoder rejected the input");
            if let Some(buffer) =
                decode_audio_with_audio_codecs_host(&host, bytes, "audio/ogg", None)
            {
                let (channels, _, length) = read_layout(&buffer);
                assert_eq!(channels, 1);
                assert!(length > 0);
            } else {
                assert_ne!(
                    explanation.reason,
                    AudioCodecsHostDecodeExplanationReason::Ready
                );
            }
        };
        for length in 1..full.len() {
            check(&full[..length]);
        }
        let mut state: u32 = 0x2545_f491;
        for _ in 0..2_000 {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            let mut bytes = full.clone();
            let index = state as usize % bytes.len();
            bytes[index] ^= 1 << (state >> 29);
            check(&bytes);
        }
    }

    #[test]
    fn another_codec_in_ogg_is_unsupported() {
        let host = create_default_host();
        let bytes = encode_ogg_with_foreign_codec();
        assert!(decode_audio_with_audio_codecs_host(&host, &bytes, "audio/ogg", None).is_none());
        assert_reason(
            &explain(&host, &bytes),
            AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
        );
    }

    #[test]
    fn a_stream_without_audio_frames_is_explained() {
        let host = create_default_host();
        let mut shape = create_vorbis_stream_shape(vec![tone(4)]);
        shape.audio_packets = 1;
        assert_reason(
            &explain(&host, &encode_ogg_vorbis(&shape)),
            AudioCodecsHostDecodeExplanationReason::NoAudioFrames,
        );
    }

    #[test]
    fn sample_rates_outside_the_audio_buffer_range_are_explained() {
        let host = create_default_host();
        let mut shape = create_vorbis_stream_shape(vec![tone(4)]);
        shape.sample_rate = 2_000;
        assert_reason(
            &explain(&host, &encode_ogg_vorbis(&shape)),
            AudioCodecsHostDecodeExplanationReason::UnsupportedSampleRate,
        );
    }

    #[test]
    fn channel_counts_beyond_an_audio_buffer_are_explained() {
        let host = create_default_host();
        let shape = create_vorbis_stream_shape(vec![VorbisChannelContent::Silent; 33]);
        assert_reason(
            &explain(&host, &encode_ogg_vorbis(&shape)),
            AudioCodecsHostDecodeExplanationReason::UnsupportedChannelCount,
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
        let stereo = encode_ogg_vorbis(&create_vorbis_stream_shape(vec![tone(4), tone(5)]));
        assert_reason(
            &explain(&host_with(1, usize::MAX), &stereo),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
        );
        assert_reason(
            &explain(&host_with(2, 2_047), &stereo),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
        );
        assert_reason(
            &explain(&host_with(2, 2_048), &stereo),
            AudioCodecsHostDecodeExplanationReason::Ready,
        );
    }

    #[test]
    fn oversized_codebook_tables_are_rejected_before_allocation() {
        let host = create_default_host();
        let bytes = encode_ogg_vorbis_with_oversized_codebook();
        assert!(bytes.len() < 200);
        assert_reason(
            &explain(&host, &bytes),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
        );
    }
}

mod capability {
    use super::*;

    fn long_stream() -> Vec<u8> {
        let mut shape = create_vorbis_stream_shape(vec![tone(4)]);
        shape.audio_packets = 20_000;
        return encode_ogg_vorbis(&shape);
    }

    #[test]
    fn dispose_and_abort_stop_a_decode_in_progress() {
        let mut host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .ogg
            .clone()
            .unwrap();
        let bytes = long_stream();
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
    fn the_ogg_slot_matches_the_direct_decode_and_rejects_other_containers() {
        let host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .ogg
            .clone()
            .unwrap();
        let bytes = encode_ogg_vorbis(&create_vorbis_stream_shape(vec![tone(4), tone(9)]));
        let signal = create_abort_controller().signal;
        let retained = block_on((slot.decode)(create_byte_handle(&bytes), signal.clone())).unwrap();
        let direct = decode(&host, &bytes);
        assert_eq!(read_layout(&retained), read_layout(&direct));
        assert_eq!(read_channel(&retained, 1), read_channel(&direct, 1));
        let wav = encode_wav(1, 1, 8_000, 16, &interleave_i16(&[1, 2]), None);
        assert!(block_on((slot.decode)(create_byte_handle(&wav), signal)).is_none());
    }

    #[test]
    fn abort_and_dispose_before_polling_fail_closed() {
        let mut host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .ogg
            .clone()
            .unwrap();
        let bytes = encode_ogg_vorbis(&create_vorbis_stream_shape(vec![tone(4)]));
        let controller = create_abort_controller();
        let aborted = (slot.decode)(create_byte_handle(&bytes), controller.signal.clone());
        abort_controller(&controller, None);
        assert!(block_on(aborted).is_none());
        let pending = (slot.decode)(create_byte_handle(&bytes), create_abort_controller().signal);
        dispose_audio_codecs_host(&mut host);
        assert!(block_on(pending).is_none());
    }

    #[test]
    fn concurrent_decodes_share_one_host() {
        let host = create_default_host();
        let slot = get_audio_codecs_host_decode_capabilities(&host)
            .ogg
            .clone()
            .unwrap();
        let reference = decode(
            &host,
            &encode_ogg_vorbis(&create_vorbis_stream_shape(vec![tone(7)])),
        );
        let expected = read_channel(&reference, 0);
        std::thread::scope(|scope| {
            for _ in 0..8 {
                let slot = slot.clone();
                let expected = &expected;
                scope.spawn(move || {
                    let bytes = encode_ogg_vorbis(&create_vorbis_stream_shape(vec![tone(7)]));
                    let buffer = block_on((slot.decode)(
                        create_byte_handle(&bytes),
                        create_abort_controller().signal,
                    ))
                    .unwrap();
                    assert_eq!(&read_channel(&buffer, 0), expected);
                });
            }
        });
    }
}
