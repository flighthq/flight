use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer, create_array_buffer_from_bytes,
    create_array_buffer_view, get_array_buffer_storage,
};
use flight_video::contract::*;

use crate::video_fixture::*;

fn url(value: &str) -> VideoResourceUrl {
    return VideoResourceUrl {
        url: value.to_string(),
        type_: None,
    };
}

fn counting_host(answer: bool) -> (HostVideoCapability, Arc<AtomicUsize>) {
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let host = probing_host(Arc::new(move |_mime| {
        count.fetch_add(1, Ordering::SeqCst);
        return answer;
    }));
    return (host, calls);
}

mod can_play_video_type {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        assert!(can_play_video_type(&empty_video_host(true), "video/mp4"));
    }

    #[test]
    fn returns_false_with_a_non_playing_backend() {
        assert!(!can_play_video_type(&empty_video_host(false), "video/mp4"));
    }

    #[test]
    fn rejects_an_empty_mime_type_without_invoking_the_backend() {
        let (host, calls) = counting_host(true);
        assert!(!can_play_video_type(&host, ""));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn hands_the_backend_the_exact_mime_type() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let record = seen.clone();
        let host = probing_host(Arc::new(move |mime| {
            record.lock().unwrap().push(mime.to_string());
            return true;
        }));
        can_play_video_type(&host, "video/webm; codecs=\"vp9\"");
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["video/webm; codecs=\"vp9\"".to_string()]
        );
    }

    #[test]
    fn normalizes_backend_exceptions_to_false() {
        let host = probing_host(Arc::new(|_mime| panic!("unavailable")));
        assert!(!can_play_video_type(&host, "video/mp4"));
    }
}

mod detect_video_mime_type {
    use super::*;

    fn view(bytes: &[u8]) -> Option<&'static str> {
        return detect_video_mime_type(VideoMimeTypeData::Uint8Array(VideoMimeTypeUint8Array {
            data: bytes,
        }));
    }

    #[test]
    fn returns_null_for_a_buffer_that_is_too_small() {
        let buffer = create_array_buffer(2);
        assert_eq!(
            detect_video_mime_type(VideoMimeTypeData::ArrayBuffer(VideoMimeTypeArrayBuffer {
                data: &buffer
            })),
            None
        );
    }

    #[test]
    fn returns_null_for_an_unrecognised_header() {
        assert_eq!(view(&[0x00, 0x01, 0x02, 0x03]), None);
    }

    #[test]
    fn detects_an_mp4_ftyp_box() {
        assert_eq!(
            view(&[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
            Some("video/mp4")
        );
    }

    #[test]
    fn detects_a_matroska_webm_ebml_header() {
        assert_eq!(view(&[0x1a, 0x45, 0xdf, 0xa3]), Some("video/webm"));
    }

    #[test]
    fn detects_an_ogg_stream() {
        assert_eq!(view(&[0x4f, 0x67, 0x67, 0x53]), Some("video/ogg"));
    }

    #[test]
    fn accepts_an_array_buffer_as_well_as_a_uint8_array() {
        // The source writes the header through a Uint8Array view over a fresh 8-byte ArrayBuffer.
        let buffer = create_array_buffer(8);
        get_array_buffer_storage(&buffer)
            .write()
            .unwrap()
            .copy_from_slice(&[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
        assert_eq!(
            detect_video_mime_type(VideoMimeTypeData::ArrayBuffer(VideoMimeTypeArrayBuffer {
                data: &buffer
            })),
            Some("video/mp4")
        );
        assert_eq!(get_array_buffer_storage(&buffer).read().unwrap().len(), 8);
    }

    #[test]
    fn reads_a_uint8_array_view_from_its_byte_offset_and_length() {
        // [junk x4][EBML header][junk]: the whole buffer is unrecognised, the offset view is WebM.
        let buffer = create_array_buffer_from_bytes(Box::new([
            0xaa, 0xbb, 0xcc, 0xdd, 0x1a, 0x45, 0xdf, 0xa3, 0xee,
        ]));
        let whole = VideoMimeTypeArrayBuffer { data: &buffer };
        assert_eq!(
            detect_video_mime_type(VideoMimeTypeData::ArrayBuffer(whole)),
            None
        );
        let aliased =
            create_array_buffer_view(&buffer, 4, 4, ArrayBufferViewKind::Uint8Array).unwrap();
        let storage = get_array_buffer_storage(&aliased.buffer);
        let bytes = storage.read().unwrap();
        let window = &bytes[aliased.byte_offset..aliased.byte_offset + aliased.byte_length];
        assert_eq!(view(window), Some("video/webm"));
        // A view shorter than the header is too small even though its buffer is not.
        assert_eq!(view(&bytes[4..7]), None);
    }

    #[test]
    fn needs_all_eight_bytes_for_the_ftyp_box() {
        assert_eq!(view(&[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79]), None);
    }
}

mod infer_video_mime_type {
    use super::*;

    #[test]
    fn maps_every_known_extension() {
        for (path, mime) in [
            ("clip.mp4", "video/mp4"),
            ("clip.m4v", "video/mp4"),
            ("clip.webm", "video/webm"),
            ("clip.mkv", "video/x-matroska"),
            ("clip.ogv", "video/ogg"),
            ("clip.ogg", "video/ogg"),
            ("clip.mov", "video/quicktime"),
            ("clip.3gp", "video/3gpp"),
            ("stream.m3u8", "application/vnd.apple.mpegurl"),
            ("stream.mpd", "application/dash+xml"),
        ] {
            assert_eq!(infer_video_mime_type(path), Some(mime), "{path}");
        }
    }

    #[test]
    fn returns_null_for_unrecognized_extensions() {
        assert_eq!(infer_video_mime_type("clip.avi"), None);
    }

    #[test]
    fn strips_query_parameters_before_matching() {
        assert_eq!(infer_video_mime_type("clip.mp4?t=0"), Some("video/mp4"));
    }

    #[test]
    fn returns_null_for_a_url_with_no_extension() {
        assert_eq!(infer_video_mime_type("video"), None);
    }

    #[test]
    fn matches_the_extension_case_insensitively() {
        assert_eq!(infer_video_mime_type("CLIP.WebM"), Some("video/webm"));
    }
}

mod select_video_resource_url {
    use super::*;

    #[test]
    fn returns_null_when_no_source_is_playable() {
        assert!(select_video_resource_url(&empty_video_host(false), &[url("clip.mp4")]).is_none());
    }

    #[test]
    fn returns_null_for_an_empty_source_list() {
        assert!(select_video_resource_url(&empty_video_host(false), &[]).is_none());
    }

    #[test]
    fn picks_the_first_source_whose_inferred_type_is_playable() {
        let host = probing_host(Arc::new(|mime| mime == "video/webm"));
        let sources = [url("clip.mp4"), url("clip.webm")];
        let selected = select_video_resource_url(&host, &sources).unwrap();
        assert!(std::ptr::eq(selected, &sources[1]));
    }

    #[test]
    fn honours_an_explicit_type_over_the_url_extension() {
        let host = probing_host(Arc::new(|mime| mime == "video/mp4"));
        let sources = [VideoResourceUrl {
            url: "stream".to_string(),
            type_: Some("video/mp4".to_string()),
        }];
        assert_eq!(
            select_video_resource_url(&host, &sources).unwrap().url,
            "stream"
        );
    }

    #[test]
    fn treats_an_explicit_empty_type_as_authoritative() {
        let (host, calls) = counting_host(true);
        let sources = [VideoResourceUrl {
            url: "clip.mp4".to_string(),
            type_: Some(String::new()),
        }];
        assert!(select_video_resource_url(&host, &sources).is_none());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn skips_unknown_inferred_types_without_invoking_the_backend() {
        let (host, calls) = counting_host(true);
        assert!(select_video_resource_url(&host, &[url("clip.avi")]).is_none());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn continues_after_false_results_and_backend_exceptions() {
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let host = probing_host(Arc::new(move |_mime| {
            match count.fetch_add(1, Ordering::SeqCst) {
                0 => false,
                1 => panic!("unavailable"),
                _ => true,
            }
        }));
        let sources = [url("first.mp4"), url("second.webm"), url("third.ogv")];
        assert_eq!(
            select_video_resource_url(&host, &sources).unwrap().url,
            "third.ogv"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 3);
    }
}
