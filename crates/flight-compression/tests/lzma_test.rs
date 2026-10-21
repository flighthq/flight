use flight_compression::*;

fn decode_base64(input: &str) -> Vec<u8> {
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lookup = [0u8; 128];
    for (i, &ch) in alphabet.iter().enumerate() {
        lookup[ch as usize] = i as u8;
    }
    let clean: Vec<u8> = input.bytes().filter(|&b| b != b'=').collect();
    let mut out = vec![0u8; (clean.len() * 3) >> 2];
    let mut accumulator: u32 = 0;
    let mut bits: u32 = 0;
    let mut o: usize = 0;
    for &ch in &clean {
        accumulator = (accumulator << 6) | lookup[ch as usize] as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out[o] = ((accumulator >> bits) & 0xff) as u8;
            o += 1;
        }
    }
    return out;
}

const LOREM: &str = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore. ";

const FIXTURE_EMPTY: &str = "XQAAgAAAAAAAAAAAAACD//v//8AAAAA=";
const FIXTURE_LITERAL: &str = "XQAAgAAWAAAAAAAAAAAzGwlhGvxuQ0djOEOOegx+SF/9GpGR4mriTv//OtQAAA==";
const FIXTURE_REPETITIVE: &str = "XQAAgAAYFQAAAAAAAAAwmIiVWA1cL8CWPd4EwdfDUzb4YxrC89ZwXRCrpoeyUdvTx5o45hzWZ//+5qgA";
const FIXTURE_LOREM: &str = "XQAAgAC8BAAAAAAAAAAmG8pGZ1ryd7h9hthB2wU1zYOlfBKlBduQvS8U03FylqiKfYRWcY1qIpirnj3DVe/MpcPdW46/A4EhQNYmkQJFT5KheLuKAK+QKiaSAiPlXLMt4+hcLPsyIhobwQyDdnLg9O1dkZ1vqP+nSEAA";
const FIXTURE_HIGH_RATIO: &str = "XQAAgAAAAAEAAAAAAAAAAFJQCoT5shSEwNQfjcv62XEVMXFIzslqZUB7WJdNx+nyYL98NdWkQKtgY2m70luPToPtjk2J35Y9+g1XU+rioRtXt20WiAZxVK393ZkH6XV7zoP//30wAAA=";
const FIXTURE_BINARY: &str = "XQAAgAAABAAAAAAAAAAAAFJQCoT5m7KAIalp1ifgPgZaXwSNU9QEujlXBQnBVSTenbhxWTFgoZ/5b0lz8sjqjLoaiylpIYD+M4Nmr0Zt7J6JiguD8DwOiY4/7V/nnpDZHP8y9LLgOVGy0hQVtMVxutsG43man7s4wbAArJMLqgYZAxIIFVubyEjwMi7+LaCHyPCk4NJR641nVpKyTYTF8YYx32piW8J5Ldn3PHO6dHQH2DypViIkoWb4WoRfMGfS9ktJLn8g69v4EA6UeHfHP2vvtM2V4m/2RG4GzwuCGsvbevBXjZj/kMA+5sESQXXuAyiW6xP7pyjMryzes4P///iKnQA=";
const FIXTURE_NON_DEFAULT_PROPS: &str = "EgAAgACEAwAAAAAAAAAqGtnUdETvKUbQpX7kuGSBCVmJ/pkOyXrALgn2sW0227s2SUzMgfoYYCWHaBoAHVQGrWUzhTDeGD//2rVAAA==";
const FIXTURE_EOS_TERMINATED: &str = "XQAAgAD//////////wAzGwlhGvxuQ0djOEOOegx+SF/9GpGR4mriTv//OtQAAA==";
const FIXTURE_REP_SHUFFLE: &str = "XQAQAABYAAAAAAAAAAABAONpl4/4ZVy4Rhy9I1ecQB4qjQSwkD7GlIZGbwxgbka7aCCbU0OngOD6Z9oSV58DkqTY45dVqGmAHVVO7+Q1iTY=";
const FIXTURE_REP_SHUFFLE_EXPECTED: &str = "AgMCBAMFBAEFAgIGAAIEAQYGBQQGBAMDAgICBQABAwAAAQMBAwQBBQEDAQEBAwAAAQMCAQEAAQAGAwAFAAADBAQEBQMDAQABAwUCBgIEBgAEBQABBAYDAg==";
const FIXTURE_REP_BUGFIX: &str = "XQAQAAA/AAAAAAAAAAAAglNJ8CRbC1Bvfw4Bn3KRgimvIEUMESap889L1RxPvXH3baBJ5QGxV6SlI8Mwg8/3Hg==";
const FIXTURE_REP_BUGFIX_EXPECTED: &str = "AQgBAAcAAwIBAAUIAQADAAkGCQYJAAMAAQABBgEGCQAFAAEIAQgJCAcGBwAFCAcCAwQHCAMCBwgHAgMCBwIJ";

mod decompress_lzma {
    use super::*;

    #[test]
    fn round_trips_empty_input() {
        assert_eq!(
            decompress_lzma(&decode_base64(FIXTURE_EMPTY), 0, CompressionFraming::Raw),
            Some(vec![].into_boxed_slice())
        );
    }

    #[test]
    fn round_trips_a_short_literal_run() {
        assert_eq!(
            decompress_lzma(&decode_base64(FIXTURE_LITERAL), 0, CompressionFraming::Raw),
            Some(b"flighthq scene-formats".to_vec().into_boxed_slice())
        );
    }

    #[test]
    fn round_trips_highly_repetitive_data_through_lz_back_references_and_grows_the_output_buffer() {
        assert_eq!(
            decompress_lzma(&decode_base64(FIXTURE_REPETITIVE), 0, CompressionFraming::Raw),
            Some("abcABC123".repeat(600).as_bytes().to_vec().into_boxed_slice())
        );
    }

    #[test]
    fn round_trips_prose_through_genuine_lz_matches() {
        assert_eq!(
            decompress_lzma(&decode_base64(FIXTURE_LOREM), 0, CompressionFraming::Raw),
            Some(LOREM.repeat(12).as_bytes().to_vec().into_boxed_slice())
        );
    }

    #[test]
    fn keeps_decompressing_a_stream_whose_expansion_ratio_is_large_but_bounded() {
        let mut source = vec![0u8; 64 * 1024];
        for i in 0..source.len() {
            source[i] = (i % 7) as u8;
        }
        assert_eq!(
            decompress_lzma(&decode_base64(FIXTURE_HIGH_RATIO), 0, CompressionFraming::Raw),
            Some(source.into_boxed_slice())
        );
    }

    #[test]
    fn round_trips_binary_data_covering_all_byte_values() {
        let mut source = vec![0u8; 1024];
        for i in 0..1024 {
            source[i] = (i % 256) as u8;
        }
        assert_eq!(
            decompress_lzma(&decode_base64(FIXTURE_BINARY), 0, CompressionFraming::Raw),
            Some(source.into_boxed_slice())
        );
    }

    #[test]
    fn round_trips_with_non_default_lzma_properties() {
        assert_eq!(
            decompress_lzma(
                &decode_base64(FIXTURE_NON_DEFAULT_PROPS),
                0,
                CompressionFraming::Raw
            ),
            Some(
                "The quick brown fox jumps over the lazy dog. "
                    .repeat(20)
                    .as_bytes()
                    .to_vec()
                    .into_boxed_slice()
            )
        );
    }

    #[test]
    fn decompresses_an_eos_terminated_stream_when_the_header_declares_unknown_size() {
        assert_eq!(
            decompress_lzma(
                &decode_base64(FIXTURE_EOS_TERMINATED),
                0,
                CompressionFraming::Raw
            ),
            Some(b"flighthq scene-formats".to_vec().into_boxed_slice())
        );
    }

    #[test]
    fn stops_expansion_at_the_container_declared_output_bound() {
        let compressed = decode_base64(FIXTURE_LITERAL);
        let text = b"flighthq scene-formats";
        assert_eq!(
            decompress_lzma(&compressed, text.len(), CompressionFraming::Raw),
            Some(text.to_vec().into_boxed_slice())
        );
        assert!(
            decompress_lzma(&compressed, text.len() - 1, CompressionFraming::Raw).is_none()
        );
    }

    #[test]
    fn uses_the_caller_uncompressed_length_even_when_the_header_declares_unknown_size() {
        let compressed = decode_base64(FIXTURE_EOS_TERMINATED);
        let text = b"flighthq scene-formats";
        assert_eq!(
            decompress_lzma(&compressed, text.len(), CompressionFraming::Raw),
            Some(text.to_vec().into_boxed_slice())
        );
    }

    #[test]
    fn returns_none_on_a_truncated_stream() {
        let full = decode_base64(FIXTURE_LITERAL);
        assert!(
            decompress_lzma(&full[..15], 0, CompressionFraming::Raw).is_none()
        );
    }

    #[test]
    fn returns_none_on_a_corrupt_stream() {
        let mut corrupted = decode_base64(FIXTURE_LITERAL);
        corrupted[20] ^= 0xff;
        assert!(
            decompress_lzma(&corrupted, 0, CompressionFraming::Raw).is_none()
        );
    }

    #[test]
    fn returns_none_when_the_header_is_too_short() {
        assert!(
            decompress_lzma(&[0u8; 12], 0, CompressionFraming::Raw).is_none()
        );
    }

    #[test]
    fn returns_none_for_an_invalid_properties_byte() {
        let mut bad = decode_base64(FIXTURE_LITERAL);
        bad[0] = 225;
        assert!(
            decompress_lzma(&bad, 0, CompressionFraming::Raw).is_none()
        );
    }

    #[test]
    fn returns_none_for_unsupported_framing_values() {
        assert!(
            decompress_lzma(
                &decode_base64(FIXTURE_LITERAL),
                0,
                CompressionFraming::Rfc1950
            )
            .is_none()
        );
    }

    #[test]
    fn returns_none_when_the_range_coder_start_byte_is_not_zero() {
        let mut bad = decode_base64(FIXTURE_LITERAL);
        bad[13] = 0x01;
        assert!(
            decompress_lzma(&bad, 0, CompressionFraming::Raw).is_none()
        );
    }

    #[test]
    fn decodes_a_stream_whose_rep1_match_must_not_clobber_rep2() {
        let compressed = decode_base64(FIXTURE_REP_SHUFFLE);
        let expected = decode_base64(FIXTURE_REP_SHUFFLE_EXPECTED);
        assert_eq!(
            decompress_lzma(&compressed, expected.len(), CompressionFraming::Raw),
            Some(expected.into_boxed_slice())
        );
    }

    #[test]
    fn decodes_a_rep_shuffle_stream_where_the_buggy_decoder_returned_null() {
        let compressed = decode_base64(FIXTURE_REP_BUGFIX);
        let expected = decode_base64(FIXTURE_REP_BUGFIX_EXPECTED);
        assert_eq!(
            decompress_lzma(&compressed, expected.len(), CompressionFraming::Raw),
            Some(expected.into_boxed_slice())
        );
    }
}

mod sdk_host_decompress_lzma {
    use super::*;

    #[test]
    fn is_a_ready_made_lzma_slot_carrying_the_portable_decoder() {
        let slot = &SDK_HOST_DECOMPRESS_LZMA;
        assert!(slot.decompress == (decompress_lzma as Decompressor));
    }

    #[test]
    fn decompresses_through_the_slot_exactly_as_the_bare_function_does() {
        let slot = &SDK_HOST_DECOMPRESS_LZMA;
        assert_eq!(
            (slot.decompress)(
                &decode_base64(FIXTURE_LITERAL),
                0,
                CompressionFraming::Raw
            ),
            Some(b"flighthq scene-formats".to_vec().into_boxed_slice())
        );
    }
}
