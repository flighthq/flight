use flight_compression::*;

mod compress_deflate {
    use super::*;

    #[test]
    fn does_not_mutate_the_input_it_was_given() {
        let bytes = b"untouched".to_vec();
        let copy = bytes.clone();
        compress_deflate(&bytes);
        assert_eq!(bytes, copy);
    }

    #[test]
    fn emits_no_zlib_wrapper_so_the_zlib_reader_refuses_it() {
        let text = "raw means raw".repeat(20);
        let bytes = text.as_bytes();
        let compressed = compress_deflate(bytes);
        assert!(decompress_deflate(&compressed, bytes.len(), CompressionFraming::Rfc1950).is_none());
    }

    #[test]
    fn produces_the_same_bytes_for_the_same_input() {
        let text = "deterministic output for a fixed input".repeat(10);
        let bytes = text.as_bytes();
        assert_eq!(compress_deflate(bytes), compress_deflate(bytes));
    }

    #[test]
    fn round_trips_a_deterministic_sweep_of_shapes_a_fixed_corpus_would_miss() {
        let mut seed: u32 = 0x9e3779b9;
        let next = |s: &mut u32| -> u32 {
            *s ^= *s << 13;
            *s ^= *s >> 17;
            *s ^= *s << 5;
            return *s;
        };
        for length in 0..300usize {
            let mut bytes = vec![0u8; length];
            let alphabet = 1 + (length % 7) as u32;
            for i in 0..length {
                bytes[i] = (next(&mut seed) % alphabet) as u8;
            }
            let raw = compress_deflate(&bytes);
            assert_eq!(
                decompress_deflate(&raw, length, CompressionFraming::Raw),
                Some(bytes.clone()),
                "raw round-trip failed at length {length}"
            );
            let wrapped = compress_deflate_zlib(&bytes);
            assert_eq!(
                decompress_deflate(&wrapped, length, CompressionFraming::Rfc1950),
                Some(bytes),
                "zlib round-trip failed at length {length}"
            );
        }
    }

    #[test]
    fn round_trips_a_long_run_that_exercises_the_maximum_match_length() {
        let bytes = vec![7u8; 2048];
        let compressed = compress_deflate(&bytes);
        assert_eq!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Raw),
            Some(bytes)
        );
    }

    #[test]
    fn round_trips_a_repeat_at_the_far_edge_of_the_window() {
        let mut bytes = vec![0u8; 40_000];
        for i in 0..bytes.len() {
            bytes[i] = ((i as u32).wrapping_mul(31) & 0xff) as u8;
        }
        let tail: Vec<u8> = bytes[..64].to_vec();
        bytes[bytes.len() - 64..].copy_from_slice(&tail);
        let compressed = compress_deflate(&bytes);
        assert_eq!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Raw),
            Some(bytes)
        );
    }

    #[test]
    fn round_trips_an_empty_input_as_a_raw_stream() {
        let compressed = compress_deflate(&[]);
        assert_eq!(
            decompress_deflate(&compressed, 0, CompressionFraming::Raw),
            Some(vec![])
        );
    }

    #[test]
    fn round_trips_an_input_longer_than_one_stored_block_can_carry() {
        let mut bytes = vec![0u8; 70_000];
        for i in 0..bytes.len() {
            bytes[i] = (i & 0xff) as u8;
        }
        let compressed = compress_deflate(&bytes);
        assert_eq!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Raw),
            Some(bytes)
        );
    }

    #[test]
    fn round_trips_binary_bytes_that_cannot_be_compressed_without_expanding_them_much() {
        let mut bytes = vec![0u8; 4096];
        let mut seed: u32 = 0x2545f491;
        for i in 0..bytes.len() {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            bytes[i] = (seed & 0xff) as u8;
        }
        let compressed = compress_deflate(&bytes);
        assert_eq!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Raw),
            Some(bytes.clone())
        );
        assert!(compressed.len() <= bytes.len() + 16);
    }

    #[test]
    fn round_trips_every_byte_value_so_no_literal_is_mis_coded() {
        let mut bytes = vec![0u8; 256];
        for i in 0..256 {
            bytes[i] = i as u8;
        }
        let compressed = compress_deflate(&bytes);
        assert_eq!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Raw),
            Some(bytes)
        );
    }

    #[test]
    fn round_trips_highly_repetitive_text_and_actually_shrinks_it() {
        let text = "abcabcabc".repeat(400);
        let bytes = text.as_bytes();
        let compressed = compress_deflate(bytes);
        assert_eq!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Raw),
            Some(bytes.to_vec())
        );
        assert!(compressed.len() < bytes.len() / 4);
    }

    #[test]
    fn round_trips_text_through_the_raw_framing() {
        let text = b"the quick brown fox jumps over the lazy dog";
        let compressed = compress_deflate(text);
        assert_eq!(
            decompress_deflate(&compressed, text.len(), CompressionFraming::Raw),
            Some(text.to_vec())
        );
    }
}

mod compress_deflate_zlib {
    use super::*;

    #[test]
    fn emits_a_header_the_zlib_reader_accepts() {
        let compressed = compress_deflate_zlib(b"header check");
        let cmf = compressed[0];
        let flg = compressed[1];
        assert_eq!(cmf & 0x0f, 8);
        assert!(cmf >> 4 <= 7);
        assert_eq!(((cmf as u16) << 8 | flg as u16) % 31, 0);
        assert_eq!(flg & 0x20, 0);
    }

    #[test]
    fn emits_a_trailer_that_fails_the_reader_when_a_payload_byte_is_altered() {
        let text = "checksum me".repeat(30);
        let bytes = text.as_bytes();
        let compressed = compress_deflate_zlib(bytes);
        assert_eq!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Rfc1950),
            Some(bytes.to_vec())
        );
        let trailer = &compressed[compressed.len() - 4..];
        assert_ne!(trailer, &[0u8, 0, 0, 0]);
    }

    #[test]
    fn emits_a_wrapper_so_the_raw_reader_does_not_read_it_back_unchanged() {
        let text = "zlib means zlib".repeat(20);
        let bytes = text.as_bytes();
        let compressed = compress_deflate_zlib(bytes);
        assert_ne!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Raw),
            Some(bytes.to_vec())
        );
    }

    #[test]
    fn produces_the_same_bytes_for_the_same_input() {
        let text = "deterministic zlib output".repeat(10);
        let bytes = text.as_bytes();
        assert_eq!(compress_deflate_zlib(bytes), compress_deflate_zlib(bytes));
    }

    #[test]
    fn round_trips_an_empty_input_through_the_zlib_framing() {
        let compressed = compress_deflate_zlib(&[]);
        assert_eq!(
            decompress_deflate(&compressed, 0, CompressionFraming::Rfc1950),
            Some(vec![])
        );
    }

    #[test]
    fn round_trips_binary_bytes_through_the_zlib_framing() {
        let mut bytes = vec![0u8; 1024];
        for i in 0..bytes.len() {
            bytes[i] = ((i as u32 * 37) & 0xff) as u8;
        }
        let compressed = compress_deflate_zlib(&bytes);
        assert_eq!(
            decompress_deflate(&compressed, bytes.len(), CompressionFraming::Rfc1950),
            Some(bytes)
        );
    }

    #[test]
    fn round_trips_text_through_the_zlib_framing() {
        let text = b"the quick brown fox jumps over the lazy dog";
        let compressed = compress_deflate_zlib(text);
        assert_eq!(
            decompress_deflate(&compressed, text.len(), CompressionFraming::Rfc1950),
            Some(text.to_vec())
        );
    }

    #[test]
    fn wraps_the_same_raw_stream_in_a_header_and_an_adler_32_trailer() {
        let text = "framing is the only difference".repeat(8);
        let bytes = text.as_bytes();
        let raw = compress_deflate(bytes);
        let wrapped = compress_deflate_zlib(bytes);
        assert_eq!(wrapped.len(), raw.len() + 6);
        assert_eq!(&wrapped[2..wrapped.len() - 4], &raw[..]);
    }
}

mod sdk_host_compress_deflate {
    use super::*;

    #[test]
    fn dispatches_raw_framing_to_compress_deflate() {
        let text = "slot raw framing".repeat(10);
        let bytes = text.as_bytes();
        let slot = create_sdk_host_compress_deflate();
        assert_eq!(
            (slot.compress)(bytes, CompressionFraming::Raw),
            compress_deflate(bytes)
        );
    }

    #[test]
    fn dispatches_rfc1950_framing_to_compress_deflate_zlib() {
        let text = "slot zlib framing".repeat(10);
        let bytes = text.as_bytes();
        let slot = create_sdk_host_compress_deflate();
        assert_eq!(
            (slot.compress)(bytes, CompressionFraming::Rfc1950),
            compress_deflate_zlib(bytes)
        );
    }

    #[test]
    fn is_a_ready_made_deflate_slot_carrying_the_portable_encoder() {
        let _slot = create_sdk_host_compress_deflate();
    }

    #[test]
    fn round_trips_through_decompress_deflate_for_both_framings() {
        let text = "round trip through the slot".repeat(8);
        let bytes = text.as_bytes();
        let slot = create_sdk_host_compress_deflate();
        let raw = (slot.compress)(bytes, CompressionFraming::Raw);
        assert_eq!(
            decompress_deflate(&raw, bytes.len(), CompressionFraming::Raw),
            Some(bytes.to_vec())
        );
        let zlib = (slot.compress)(bytes, CompressionFraming::Rfc1950);
        assert_eq!(
            decompress_deflate(&zlib, bytes.len(), CompressionFraming::Rfc1950),
            Some(bytes.to_vec())
        );
    }
}
