use flight_compression::*;
use flight_entity::FlightError;
use flight_entity::FlightErrorKind;

mod compress_lzma {
    use super::*;

    #[test]
    fn round_trips_empty_input() {
        let input: Vec<u8> = vec![];
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, 0, CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
    }

    #[test]
    fn round_trips_a_short_literal_string() {
        let input = b"Hello".to_vec();
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
    }

    #[test]
    fn round_trips_repetitive_data() {
        let mut input = vec![0u8; 5400];
        for i in 0..input.len() {
            input[i] = (i % 27) as u8;
        }
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input.clone()));
        assert!(compressed.len() < input.len());
    }

    #[test]
    fn round_trips_prose_text() {
        let text = "The quick brown fox jumps over the lazy dog. \
                     Pack my box with five dozen liquor jugs. \
                     How vexingly quick daft zebras jump. \
                     The five boxing wizards jump quickly. "
            .repeat(5);
        let input = text.as_bytes().to_vec();
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input.clone()));
        assert!(compressed.len() < input.len());
    }

    #[test]
    fn round_trips_all_byte_values() {
        let mut input = vec![0u8; 256];
        for i in 0..256 {
            input[i] = i as u8;
        }
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
    }

    #[test]
    fn round_trips_a_large_repetitive_block() {
        let mut input = vec![0u8; 65536];
        for i in 0..input.len() {
            input[i] = (i % 100) as u8;
        }
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input.clone()));
        assert!(compressed.len() < input.len() / 2);
    }

    #[test]
    fn round_trips_single_byte_input() {
        let input = vec![42u8];
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
    }

    #[test]
    fn round_trips_two_byte_input() {
        let input = vec![0xab, 0xcd];
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
    }

    #[test]
    fn round_trips_data_with_long_repeated_runs() {
        let input = vec![0x55u8; 1000];
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
        assert!(compressed.len() < 100);
    }

    #[test]
    fn writes_a_valid_lzma_alone_header() {
        let input = b"header check".to_vec();
        let compressed = compress_lzma(&input);
        assert!(compressed.len() >= 13);
        let prop_byte = compressed[0];
        assert!(prop_byte <= 224);
        let size = (compressed[5] as u32)
            | ((compressed[6] as u32) << 8)
            | ((compressed[7] as u32) << 16)
            | ((compressed[8] as u32) << 24);
        assert_eq!(size as usize, input.len());
    }

    #[test]
    fn produces_compressed_output_smaller_than_input_for_compressible_data() {
        let mut input = vec![0u8; 4096];
        for i in 0..input.len() {
            input[i] = (i % 10) as u8;
        }
        let compressed = compress_lzma(&input);
        assert!(compressed.len() < input.len());
    }

    #[test]
    fn round_trips_token_shaped_small_alphabet_inputs_across_many_seeds() {
        let tokens = ["ab", "cd", "ef", "gh", "ij", "kl", "mn", "op"];
        for seed in 0..500u32 {
            let mut parts: Vec<&str> = Vec::new();
            let mut s = seed;
            let len = 30 + (seed % 60);
            for _ in 0..len {
                parts.push(tokens[(s % tokens.len() as u32) as usize]);
                s = (s.wrapping_mul(31).wrapping_add(7)) & 0xffff;
            }
            let separator = if seed % 3 == 0 { " " } else { "" };
            let text = parts.join(separator);
            let input = text.as_bytes().to_vec();
            let compressed = compress_lzma(&input);
            let result = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
            assert_eq!(result, Some(input), "seed={}", seed);
        }
    }

    #[test]
    fn round_trips_alternating_match_distances_that_force_rep_shuffles() {
        let a = "ALPHA";
        let b = "BETA_";
        let c = "GAMMA";
        let pattern = format!(
            "{}{}{}",
            format!("{}{}{}", a, b, c).repeat(4),
            format!("{}{}{}", b, a, c).repeat(4),
            format!("{}{}{}", c, b, a).repeat(4),
        );
        let input = pattern.as_bytes().to_vec();
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
    }

    #[test]
    fn decompresses_with_uncompressed_length_zero_reads_size_from_header() {
        let input = b"header size only".to_vec();
        let compressed = compress_lzma(&input);
        let decompressed = decompress_lzma(&compressed, 0, CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
    }
}

mod create_sdk_host_compress_lzma {
    use super::*;

    #[test]
    fn compresses_with_raw_framing() {
        let input = b"capability test".to_vec();
        let slot = create_sdk_host_compress_lzma();
        let compressed = (slot.compress)(&input, CompressionFraming::Raw);
        let decompressed = decompress_lzma(&compressed, input.len(), CompressionFraming::Raw);
        assert_eq!(decompressed, Some(input));
    }

    #[test]
    fn rejects_non_raw_framing() {
        let input = vec![1u8, 2, 3];
        let slot = create_sdk_host_compress_lzma();
        let payload = std::panic::catch_unwind(|| (slot.compress)(&input, CompressionFraming::Rfc1950))
            .expect_err("non-Raw framing must throw");
        let error = payload
            .downcast::<FlightError>()
            .expect("panic payload must be a FlightError");
        assert_eq!(error.kind, FlightErrorKind::Error);
        assert_eq!(error.message, "lzma: only Raw framing is supported");
    }
}
