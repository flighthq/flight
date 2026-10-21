use std::sync::Arc;

use flight_audio::*;
use flight_buffer::create_array_buffer_from_bytes;
use flight_hostcapability::ProviderRef;

fn host_with(can_play: impl Fn(&str) -> bool + Send + Sync + 'static) -> HostAudioCodecCapability {
    return HostAudioCodecCapability {
        can_play_type: Arc::new(can_play),
        provider: Arc::new(()) as ProviderRef,
    };
}

mod can_play_audio_type {
    use super::*;

    #[test]
    fn returns_false_for_the_empty_string_without_probing() {
        let calls = Arc::new(std::sync::Mutex::new(0));
        let seen = calls.clone();
        let host = host_with(move |_| {
            *seen.lock().unwrap() += 1;
            true
        });
        assert!(!can_play_audio_type(&host, ""));
        assert_eq!(*calls.lock().unwrap(), 0);
    }

    #[test]
    fn returns_false_for_a_type_the_backend_cannot_play() {
        let host = host_with(|mime_type| mime_type == "audio/mpeg");
        assert!(!can_play_audio_type(&host, "audio/x-unknown"));
    }

    #[test]
    fn returns_true_for_a_type_the_backend_reports_as_playable() {
        let host = host_with(|mime_type| mime_type == "audio/mpeg");
        assert!(can_play_audio_type(&host, "audio/mpeg"));
    }
}

mod detect_audio_mime_type {
    use super::*;

    #[test]
    fn accepts_an_array_buffer_as_well_as_a_uint8_array() {
        let buffer = create_array_buffer_from_bytes(Box::new([0x66, 0x4c, 0x61, 0x43]));
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::ArrayBuffer(AudioMimeTypeArrayBuffer {
                data: &buffer,
            })),
            Some("audio/flac".to_string())
        );
    }

    #[test]
    fn detects_aac_via_an_adts_sync_with_the_layer_bits_clear() {
        let bytes = [0xff, 0xf1, 0x50, 0x80];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            Some("audio/aac".to_string())
        );
    }

    #[test]
    fn detects_flac() {
        let bytes = [0x66, 0x4c, 0x61, 0x43];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            Some("audio/flac".to_string())
        );
    }

    #[test]
    fn detects_m4a_or_aac_via_an_ftyp_box() {
        let bytes = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            Some("audio/mp4".to_string())
        );
    }

    #[test]
    fn detects_mp3_via_an_id3_tag() {
        let bytes = [0x49, 0x44, 0x33, 0x04];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            Some("audio/mpeg".to_string())
        );
    }

    #[test]
    fn detects_mp3_via_an_mpeg_frame_sync() {
        let bytes = [0xff, 0xfb, 0x90, 0x00];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            Some("audio/mpeg".to_string())
        );
    }

    #[test]
    fn detects_ogg() {
        let bytes = [0x4f, 0x67, 0x67, 0x53];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            Some("audio/ogg".to_string())
        );
    }

    #[test]
    fn detects_wav() {
        let bytes = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            Some("audio/wav".to_string())
        );
    }

    #[test]
    fn detects_webm() {
        let bytes = [0x1a, 0x45, 0xdf, 0xa3];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            Some("audio/webm".to_string())
        );
    }

    #[test]
    fn returns_none_for_a_buffer_that_is_too_small() {
        let bytes = [0, 1, 2];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            None
        );
    }

    #[test]
    fn returns_none_for_an_unrecognised_header() {
        let bytes = [0, 1, 2, 3];
        assert_eq!(
            detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
                data: &bytes,
            })),
            None
        );
    }
}

mod get_audio_mime_type_essence {
    use super::*;

    #[test]
    fn returns_a_parameterless_type_unchanged() {
        assert_eq!(get_audio_mime_type_essence("audio/mpeg"), "audio/mpeg");
        assert_eq!(get_audio_mime_type_essence(""), "");
    }

    #[test]
    fn strips_parameters_and_lowercases_the_type() {
        assert_eq!(
            get_audio_mime_type_essence("audio/vnd.adobe.swf-adpcm; rate=22050; channels=1"),
            "audio/vnd.adobe.swf-adpcm"
        );
        assert_eq!(get_audio_mime_type_essence("  AUDIO/MPEG  "), "audio/mpeg");
    }
}

mod get_audio_mime_type_parameter {
    use super::*;

    #[test]
    fn never_reads_the_type_itself_as_a_parameter() {
        assert_eq!(
            get_audio_mime_type_parameter("audio/mpeg", "audio/mpeg"),
            None
        );
    }

    #[test]
    fn reads_a_parameter_a_containerless_format_needs_to_decode() {
        let mime_type = "audio/vnd.adobe.swf-pcm; rate=22050; channels=2; bits=16";
        assert_eq!(
            get_audio_mime_type_parameter(mime_type, "rate"),
            Some("22050".to_string())
        );
        assert_eq!(
            get_audio_mime_type_parameter(mime_type, "channels"),
            Some("2".to_string())
        );
        assert_eq!(
            get_audio_mime_type_parameter(mime_type, "BITS"),
            Some("16".to_string())
        );
    }

    #[test]
    fn returns_none_for_a_parameter_the_type_does_not_carry() {
        assert_eq!(get_audio_mime_type_parameter("audio/mpeg", "rate"), None);
        assert_eq!(
            get_audio_mime_type_parameter("audio/mpeg; rate=1", "channels"),
            None
        );
    }

    #[test]
    fn unwraps_a_quoted_value() {
        assert_eq!(
            get_audio_mime_type_parameter("audio/x-thing; codec=\"a;b\"", "codec"),
            Some("a;b".to_string())
        );
    }
}

mod infer_audio_mime_type {
    use super::*;

    #[test]
    fn returns_audio_aac_for_aac_files() {
        assert_eq!(
            infer_audio_mime_type("track.aac"),
            Some("audio/aac".to_string())
        );
    }

    #[test]
    fn returns_audio_flac_for_flac_files() {
        assert_eq!(
            infer_audio_mime_type("track.flac"),
            Some("audio/flac".to_string())
        );
    }

    #[test]
    fn returns_audio_mp4_for_m4a_files() {
        assert_eq!(
            infer_audio_mime_type("track.m4a"),
            Some("audio/mp4".to_string())
        );
    }

    #[test]
    fn returns_audio_mpeg_for_mp3_files() {
        assert_eq!(
            infer_audio_mime_type("track.mp3"),
            Some("audio/mpeg".to_string())
        );
    }

    #[test]
    fn returns_audio_ogg_for_ogg_files() {
        assert_eq!(
            infer_audio_mime_type("track.ogg"),
            Some("audio/ogg".to_string())
        );
    }

    #[test]
    fn returns_audio_wav_for_wav_files() {
        assert_eq!(
            infer_audio_mime_type("track.wav"),
            Some("audio/wav".to_string())
        );
    }

    #[test]
    fn returns_audio_webm_for_webm_files() {
        assert_eq!(
            infer_audio_mime_type("track.webm"),
            Some("audio/webm".to_string())
        );
    }

    #[test]
    fn returns_none_for_a_url_with_no_extension() {
        assert_eq!(infer_audio_mime_type("audio"), None);
    }

    #[test]
    fn returns_none_for_unrecognized_extensions() {
        assert_eq!(infer_audio_mime_type("track.mid"), None);
    }

    #[test]
    fn strips_query_parameters_before_matching() {
        assert_eq!(
            infer_audio_mime_type("track.mp3?cb=1"),
            Some("audio/mpeg".to_string())
        );
    }
}
