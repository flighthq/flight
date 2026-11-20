use std::sync::Arc;

use flight_audio::{HostAudioDecodeFormatCapability, can_play_audio_type, get_audio_decode_slot};
use flight_host_audio_codecs::*;
use flight_stream::{abort_controller, create_abort_controller};

use crate::support::*;

fn assert_no_unfilled_slots(host: &AudioCodecsHost) {
    let decode = get_audio_codecs_host_decode_capabilities(host);
    assert!(decode.aac.is_none());
    assert!(decode.flac.is_none());
    assert!(decode.mp3.is_none());
    assert!(decode.mp4.is_none());
    assert!(decode.webm.is_none());
}

fn find_slot<'a>(
    host: &'a AudioCodecsHost,
    format: &str,
) -> Option<&'a HostAudioDecodeFormatCapability> {
    let decode = get_audio_codecs_host_decode_capabilities(host);
    return match format {
        "ogg" => decode.ogg.as_ref(),
        _ => decode.wav.as_ref(),
    };
}

mod create_audio_codecs_host {
    use super::*;

    #[test]
    fn accepts_custom_options_and_rejects_out_of_range_ones() {
        let options = AudioCodecsHostOptions {
            max_channels: 1,
            max_decoded_samples: 1,
            max_encoded_bytes: 1,
        };
        assert!(create_audio_codecs_host(Some(&options)).is_some());
        for invalid in [
            AudioCodecsHostOptions {
                max_channels: 0,
                ..options.clone()
            },
            AudioCodecsHostOptions {
                max_channels: 33,
                ..options.clone()
            },
            AudioCodecsHostOptions {
                max_decoded_samples: 0,
                ..options.clone()
            },
            AudioCodecsHostOptions {
                max_encoded_bytes: 0,
                ..options.clone()
            },
        ] {
            assert!(create_audio_codecs_host(Some(&invalid)).is_none());
        }
    }

    #[test]
    fn creates_a_sendable_live_host_with_default_options() {
        fn assert_send_sync<T: Send + Sync>(_: &T) {}
        let host = create_default_host();
        assert_send_sync(&host);
        assert!(!is_audio_codecs_host_disposed(&host));
    }
}

mod create_audio_codecs_host_options {
    use super::*;

    #[test]
    fn returns_documented_resource_bounds() {
        assert_eq!(
            create_audio_codecs_host_options(),
            AudioCodecsHostOptions {
                max_channels: 32,
                max_decoded_samples: 64 * 1024 * 1024,
                max_encoded_bytes: 256 * 1024 * 1024,
            }
        );
    }
}

mod decode_audio_with_audio_codecs_host {
    use super::*;

    #[test]
    fn rejects_unknown_mime_types_and_empty_input_without_decoding() {
        let host = create_default_host();
        for mime_type in ["audio/mpeg", "audio/flac", "", "text/plain"] {
            assert!(decode_audio_with_audio_codecs_host(&host, b"RIFF", mime_type, None).is_none());
        }
        for mime_type in ["audio/wav", "audio/ogg"] {
            assert!(decode_audio_with_audio_codecs_host(&host, &[], mime_type, None).is_none());
        }
    }

    #[test]
    fn rejects_an_already_aborted_signal() {
        let host = create_default_host();
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let bytes = encode_wav(1, 1, 8_000, 16, &interleave_i16(&[1, 2]), None);
        let decoded = decode_audio_with_audio_codecs_host(
            &host,
            &bytes,
            "audio/wav",
            Some(&controller.signal),
        );
        assert!(decoded.is_none());
    }
}

mod dispose_audio_codecs_host {
    use super::*;

    #[test]
    fn is_idempotent_and_fails_direct_and_retained_calls_closed() {
        let mut host = create_default_host();
        let codec = get_audio_codecs_host_codec_capability(&host).clone();
        let slots = get_audio_codecs_host_decode_capabilities(&host).clone();
        dispose_audio_codecs_host(&mut host);
        dispose_audio_codecs_host(&mut host);
        assert!(is_audio_codecs_host_disposed(&host));
        let wav = encode_wav(1, 1, 8_000, 16, &interleave_i16(&[1, 2]), None);
        assert!(decode_audio_with_audio_codecs_host(&host, &wav, "audio/wav", None).is_none());
        assert_reason(
            &explain_audio_codecs_host_decode(&host, &wav, "audio/wav", None),
            AudioCodecsHostDecodeExplanationReason::Disposed,
        );
        assert!(!(codec.can_play_type)("audio/wav"));
        for slot in [slots.wav, slots.ogg].into_iter().flatten() {
            let signal = create_abort_controller().signal;
            assert!(block_on((slot.decode)(create_byte_handle(&wav), signal)).is_none());
        }
    }

    #[test]
    fn dropping_the_host_disposes_retained_callbacks() {
        let host = create_default_host();
        let codec = get_audio_codecs_host_codec_capability(&host).clone();
        let slots = get_audio_codecs_host_decode_capabilities(&host).clone();
        drop(host);
        assert!(!(codec.can_play_type)("audio/ogg"));
        let wav = encode_wav(1, 1, 8_000, 16, &interleave_i16(&[1, 2]), None);
        for slot in [slots.wav, slots.ogg].into_iter().flatten() {
            let signal = create_abort_controller().signal;
            assert!(block_on((slot.decode)(create_byte_handle(&wav), signal)).is_none());
        }
    }
}

mod explain_audio_codecs_host_decode {
    use super::*;

    #[test]
    fn distinguishes_unknown_unavailable_empty_oversized_and_aborted_input() {
        let host = create_default_host();
        assert_reason(
            &explain_audio_codecs_host_decode(&host, b"ID3", "audio/mpeg", None),
            AudioCodecsHostDecodeExplanationReason::UnsupportedMimeType,
        );
        let wav_reason = if cfg!(feature = "wav") {
            AudioCodecsHostDecodeExplanationReason::EmptyInput
        } else {
            AudioCodecsHostDecodeExplanationReason::FormatUnavailable
        };
        assert_reason(
            &explain_audio_codecs_host_decode(&host, &[], "audio/x-wav", None),
            wav_reason,
        );
        let ogg_reason = if cfg!(feature = "ogg") {
            AudioCodecsHostDecodeExplanationReason::EmptyInput
        } else {
            AudioCodecsHostDecodeExplanationReason::FormatUnavailable
        };
        assert_reason(
            &explain_audio_codecs_host_decode(&host, &[], "application/ogg", None),
            ogg_reason,
        );
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        assert_reason(
            &explain_audio_codecs_host_decode(&host, b"x", "audio/wav", Some(&controller.signal)),
            AudioCodecsHostDecodeExplanationReason::Aborted,
        );
    }

    #[test]
    fn reports_input_beyond_the_encoded_byte_limit() {
        let options = AudioCodecsHostOptions {
            max_encoded_bytes: 4,
            ..create_audio_codecs_host_options()
        };
        let host = create_audio_codecs_host(Some(&options)).unwrap();
        for mime_type in ["audio/wav", "audio/ogg"] {
            let explanation = explain_audio_codecs_host_decode(&host, b"12345", mime_type, None);
            if explanation.reason != AudioCodecsHostDecodeExplanationReason::FormatUnavailable {
                assert_reason(
                    &explanation,
                    AudioCodecsHostDecodeExplanationReason::InputTooLarge,
                );
            }
            let at_limit = explain_audio_codecs_host_decode(&host, b"1234", mime_type, None);
            assert_ne!(
                at_limit.reason,
                AudioCodecsHostDecodeExplanationReason::InputTooLarge
            );
        }
    }
}

mod explain_audio_codecs_host_options {
    use super::*;

    #[test]
    fn names_each_rejected_option() {
        let valid = create_audio_codecs_host_options();
        assert_eq!(
            explain_audio_codecs_host_options(&valid),
            AudioCodecsHostOptionsExplanation {
                message: String::new(),
                reason: AudioCodecsHostOptionsExplanationReason::Valid,
            }
        );
        let cases = [
            (
                AudioCodecsHostOptions {
                    max_channels: 0,
                    ..valid.clone()
                },
                AudioCodecsHostOptionsExplanationReason::MaxChannelsOutOfRange,
            ),
            (
                AudioCodecsHostOptions {
                    max_channels: 33,
                    ..valid.clone()
                },
                AudioCodecsHostOptionsExplanationReason::MaxChannelsOutOfRange,
            ),
            (
                AudioCodecsHostOptions {
                    max_decoded_samples: 0,
                    ..valid.clone()
                },
                AudioCodecsHostOptionsExplanationReason::MaxDecodedSamplesZero,
            ),
            (
                AudioCodecsHostOptions {
                    max_encoded_bytes: 0,
                    ..valid.clone()
                },
                AudioCodecsHostOptionsExplanationReason::MaxEncodedBytesZero,
            ),
        ];
        for (options, reason) in cases {
            let explanation = explain_audio_codecs_host_options(&options);
            assert_eq!(explanation.reason, reason);
            assert!(!explanation.message.is_empty());
        }
        let edge = AudioCodecsHostOptions {
            max_channels: 32,
            ..valid
        };
        assert_eq!(
            explain_audio_codecs_host_options(&edge).reason,
            AudioCodecsHostOptionsExplanationReason::Valid
        );
    }
}

mod get_audio_codecs_host_codec_capability {
    use super::*;

    #[test]
    fn answers_only_for_enabled_formats_and_supported_codecs() {
        let host = create_default_host();
        let codec = get_audio_codecs_host_codec_capability(&host);
        let wav = cfg!(feature = "wav");
        let ogg = cfg!(feature = "ogg");
        let cases = [
            ("audio/wav", wav),
            ("audio/x-wav", wav),
            ("audio/vnd.wave", wav),
            ("Audio/WAVE", wav),
            ("audio/wav; codecs=\"1\"", wav),
            ("audio/wav; codecs=3", wav),
            ("audio/wav; codecs=\"6\"", false),
            ("audio/ogg", ogg),
            ("application/ogg", ogg),
            ("audio/ogg; codecs=\"vorbis\"", ogg),
            ("audio/ogg; codecs=\"opus\"", false),
            ("audio/ogg; codecs=\"vorbis, opus\"", false),
            ("audio/mpeg", false),
            ("audio/flac", false),
            ("", false),
        ];
        for (mime_type, expected) in cases {
            assert_eq!(
                can_play_audio_type(codec, mime_type),
                expected,
                "{mime_type}"
            );
        }
    }
}

mod get_audio_codecs_host_decode_capabilities {
    use super::*;

    #[test]
    fn fills_only_enabled_wav_and_ogg_slots() {
        let host = create_default_host();
        let decode = get_audio_codecs_host_decode_capabilities(&host);
        assert_eq!(decode.wav.is_some(), cfg!(feature = "wav"));
        assert_eq!(decode.ogg.is_some(), cfg!(feature = "ogg"));
        assert_no_unfilled_slots(&host);
    }

    #[test]
    fn direct_routing_agrees_with_the_flight_audio_slot_aliases() {
        let host = create_default_host();
        let decode = get_audio_codecs_host_decode_capabilities(&host);
        let aliases = [
            ("audio/wav", "wav"),
            ("audio/wave", "wav"),
            ("audio/x-wav", "wav"),
            ("audio/vnd.wave", "wav"),
            ("AUDIO/WAV; charset=binary", "wav"),
            ("audio/ogg", "ogg"),
            ("audio/vorbis", "ogg"),
            ("application/ogg", "ogg"),
        ];
        for (mime_type, format) in aliases {
            let routed = get_audio_decode_slot(decode, mime_type);
            let expected = find_slot(&host, format);
            assert_eq!(routed.is_some(), expected.is_some(), "{mime_type}");
            if let (Some(routed), Some(expected)) = (routed, expected) {
                assert!(std::ptr::eq(routed, expected), "{mime_type}");
            }
            let explanation = explain_audio_codecs_host_decode(&host, &[], mime_type, None);
            assert_ne!(
                explanation.reason,
                AudioCodecsHostDecodeExplanationReason::UnsupportedMimeType,
                "{mime_type}"
            );
        }
    }
}

mod get_audio_codecs_host_provider {
    use super::*;

    #[test]
    fn every_capability_carries_one_identity_per_host() {
        let host = create_default_host();
        let other = create_default_host();
        let provider = get_audio_codecs_host_provider(&host);
        assert!(Arc::ptr_eq(
            provider,
            &get_audio_codecs_host_codec_capability(&host).provider
        ));
        let decode = get_audio_codecs_host_decode_capabilities(&host);
        for slot in [decode.wav.as_ref(), decode.ogg.as_ref()]
            .into_iter()
            .flatten()
        {
            assert!(Arc::ptr_eq(provider, &slot.provider));
        }
        assert!(!Arc::ptr_eq(
            provider,
            get_audio_codecs_host_provider(&other)
        ));
    }
}

mod is_audio_codecs_host_disposed {
    use super::*;

    #[test]
    fn changes_only_after_dispose() {
        let mut host = create_default_host();
        assert!(!is_audio_codecs_host_disposed(&host));
        let _ = decode_audio_with_audio_codecs_host(&host, b"RIFF", "audio/wav", None);
        assert!(!is_audio_codecs_host_disposed(&host));
        dispose_audio_codecs_host(&mut host);
        assert!(is_audio_codecs_host_disposed(&host));
    }
}
