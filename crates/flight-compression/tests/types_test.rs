use flight_compression::contract::get_compression_framing_string;
use flight_compression::contract::parse_compression_framing;
use flight_compression::*;
use flight_compression::{Compression, get_compression_string, parse_compression};

mod decompressor {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn captures_state_and_preserves_input_slice_and_framing() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        let retained = Arc::clone(&observed);
        let callback: Decompressor = Arc::new(move |compressed, length, framing| {
            retained.lock().unwrap().push((
                compressed.as_ptr() as usize,
                compressed.to_vec(),
                length,
                framing,
            ));
            return Some(compressed.to_vec().into_boxed_slice());
        });
        let slot = HostDecompressDeflateCapability {
            decompress: callback,
        };
        let cloned = Clone::clone(&slot);
        assert!(Arc::ptr_eq(&slot.decompress, &cloned.decompress));
        let storage = [90, 91, 7, 8, 9, 92];
        let slice = &storage[2..5];
        assert_eq!(
            (slot.decompress)(slice, 31, CompressionFraming::Rfc1950),
            Some(vec![7, 8, 9].into_boxed_slice())
        );
        assert_eq!(
            (cloned.decompress)(slice, 0, CompressionFraming::Raw),
            Some(vec![7, 8, 9].into_boxed_slice())
        );
        assert_eq!(
            *observed.lock().unwrap(),
            vec![
                (
                    slice.as_ptr() as usize,
                    vec![7, 8, 9],
                    31,
                    CompressionFraming::Rfc1950
                ),
                (
                    slice.as_ptr() as usize,
                    vec![7, 8, 9],
                    0,
                    CompressionFraming::Raw
                ),
            ]
        );
    }

    #[test]
    fn independent_capturing_instances_can_call_each_other_without_shared_state() {
        let inner_calls = Arc::new(Mutex::new(Vec::new()));
        let inner_observed = Arc::clone(&inner_calls);
        let inner: Decompressor = Arc::new(move |compressed, length, framing| {
            inner_observed.lock().unwrap().push((length, framing));
            return Some(compressed.to_vec().into_boxed_slice());
        });
        let outer_calls = Arc::new(Mutex::new(Vec::new()));
        let outer_observed = Arc::clone(&outer_calls);
        let nested = Arc::clone(&inner);
        let outer: Decompressor = Arc::new(move |compressed, length, framing| {
            outer_observed.lock().unwrap().push((length, framing));
            return nested(compressed, length + 1, CompressionFraming::Raw);
        });
        let slot = HostDecompressLzmaCapability { decompress: outer };
        let cloned = Clone::clone(&slot);
        assert!(Arc::ptr_eq(&slot.decompress, &cloned.decompress));
        assert!(!Arc::ptr_eq(&inner, &slot.decompress));
        assert_eq!(
            (cloned.decompress)(&[42], 5, CompressionFraming::Rfc1950),
            Some(vec![42].into_boxed_slice())
        );
        assert_eq!(
            inner(&[43], 9, CompressionFraming::Raw),
            Some(vec![43].into_boxed_slice())
        );
        assert_eq!(
            *outer_calls.lock().unwrap(),
            vec![(5, CompressionFraming::Rfc1950)]
        );
        assert_eq!(
            *inner_calls.lock().unwrap(),
            vec![(6, CompressionFraming::Raw), (9, CompressionFraming::Raw)]
        );
    }

    #[test]
    fn retains_nullable_failure_and_bare_sdk_function_compatibility() {
        let decline: Decompressor = Arc::new(|_, _, _| None);
        assert_eq!(decline(&[1], 0, CompressionFraming::Raw), None);
        let sdk: Decompressor = Arc::new(decompress_deflate);
        assert_eq!(
            sdk(&[], 0, CompressionFraming::Raw),
            decompress_deflate(&[], 0, CompressionFraming::Raw)
        );
    }
}

mod get_compression_framing_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_compression_framing_string(CompressionFraming::Raw),
            "Raw"
        );
        assert_eq!(
            get_compression_framing_string(CompressionFraming::Rfc1950),
            "Rfc1950"
        );
    }
}

mod get_compression_string {
    use super::*;
    #[test]
    fn returns_all_exact_lowercase_algorithm_keys() {
        assert_eq!(get_compression_string(Compression::Brotli), "brotli");
        assert_eq!(get_compression_string(Compression::Deflate), "deflate");
        assert_eq!(get_compression_string(Compression::Lzma), "lzma");
    }
}

mod parse_compression {
    use super::*;
    #[test]
    fn accepts_only_the_complete_exact_algorithm_string_table() {
        assert_eq!(parse_compression("brotli"), Some(Compression::Brotli));
        assert_eq!(parse_compression("deflate"), Some(Compression::Deflate));
        assert_eq!(parse_compression("lzma"), Some(Compression::Lzma));
        for text in ["Brotli", "Deflate", "Lzma", "", "gzip", "raw"] {
            assert_eq!(parse_compression(text), None);
        }
    }
}

mod parse_compression_framing {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_compression_framing("Raw"),
            Some(CompressionFraming::Raw)
        );
        assert_eq!(
            parse_compression_framing("Rfc1950"),
            Some(CompressionFraming::Rfc1950)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_compression_framing("raw"), None);
        assert_eq!(parse_compression_framing("RFC1950"), None);
        assert_eq!(parse_compression_framing(""), None);
    }
}
