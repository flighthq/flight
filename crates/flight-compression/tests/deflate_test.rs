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

fn decode_hex(input: &str) -> Vec<u8> {
    let mut out = vec![0u8; input.len() / 2];
    for i in 0..out.len() {
        out[i] = u8::from_str_radix(&input[i * 2..i * 2 + 2], 16).unwrap();
    }
    return out;
}

fn pack_deflate_bits(bits: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; (bits.len() + 7) / 8];
    for i in 0..bits.len() {
        out[i >> 3] |= bits[i] << (i & 7);
    }
    return out;
}

fn push_lsb_value(bits: &mut Vec<u8>, value: u32, count: u32) {
    for i in 0..count {
        bits.push(((value >> i) & 1) as u8);
    }
}

fn push_canonical_code(bits: &mut Vec<u8>, code: u32, count: u32) {
    for i in (0..count).rev() {
        bits.push(((code >> i) & 1) as u8);
    }
}

fn push_fixed_literal_code(bits: &mut Vec<u8>, symbol: u32) {
    if symbol <= 143 {
        push_canonical_code(bits, 0x30 + symbol, 8);
    } else if symbol <= 255 {
        push_canonical_code(bits, 0x190 + symbol - 144, 9);
    } else if symbol <= 279 {
        push_canonical_code(bits, symbol - 256, 7);
    } else {
        push_canonical_code(bits, 0xc0 + symbol - 280, 8);
    }
}

fn create_fixed_back_reference_stream(length_symbol: u32, distance_symbol: Option<u32>) -> Vec<u8> {
    let mut bits: Vec<u8> = Vec::new();
    push_lsb_value(&mut bits, 1, 1); // BFINAL
    push_lsb_value(&mut bits, 1, 2); // BTYPE=fixed Huffman
    push_fixed_literal_code(&mut bits, length_symbol);
    if let Some(ds) = distance_symbol {
        push_canonical_code(&mut bits, ds, 5);
    }
    return pack_deflate_bits(&bits);
}

const CODE_LENGTH_ORDER: [usize; 19] = [
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

fn push_dynamic_header(
    bits: &mut Vec<u8>,
    literal_count: u32,
    distance_count: u32,
    code_lengths: &[(usize, u32)],
) {
    push_lsb_value(bits, 1, 1); // BFINAL
    push_lsb_value(bits, 2, 2); // BTYPE=dynamic Huffman
    push_lsb_value(bits, literal_count - 257, 5);
    push_lsb_value(bits, distance_count - 1, 5);

    let get_cl = |idx: usize| -> u32 {
        for &(k, v) in code_lengths {
            if k == idx {
                return v;
            }
        }
        return 0;
    };

    let mut code_length_count: usize = 4;
    for i in 0..CODE_LENGTH_ORDER.len() {
        if get_cl(CODE_LENGTH_ORDER[i]) != 0 {
            code_length_count = i + 1;
        }
    }
    push_lsb_value(bits, (code_length_count - 4) as u32, 4);
    for i in 0..code_length_count {
        push_lsb_value(bits, get_cl(CODE_LENGTH_ORDER[i]), 3);
    }
}

fn create_dynamic_repeat_overflow_stream(symbol: u32) -> Vec<u8> {
    let mut bits: Vec<u8> = Vec::new();
    push_dynamic_header(
        &mut bits,
        257,
        1,
        &[(0, 1), (1, 2), (symbol as usize, 2)],
    );
    for _ in 0..256 {
        push_canonical_code(&mut bits, 0, 1);
    }
    push_canonical_code(&mut bits, 2, 2); // symbol 1: EOB length
    push_canonical_code(&mut bits, 3, 2); // repeat symbol
    let extra_bits = if symbol == 16 { 2 } else if symbol == 17 { 3 } else { 7 };
    push_lsb_value(&mut bits, 0, extra_bits);
    push_canonical_code(&mut bits, 0, 1); // EOB
    return pack_deflate_bits(&bits);
}

fn create_valid_dynamic_repeat_stream(symbol: u32) -> Vec<u8> {
    let mut bits: Vec<u8> = Vec::new();
    if symbol == 16 {
        push_dynamic_header(&mut bits, 257, 1, &[(0, 1), (2, 2), (16, 2)]);
        for _ in 0..254 {
            push_canonical_code(&mut bits, 0, 1);
        }
        push_canonical_code(&mut bits, 2, 2);
        push_canonical_code(&mut bits, 3, 2);
        push_lsb_value(&mut bits, 0, 2);
        push_canonical_code(&mut bits, 2, 2);
    } else {
        push_dynamic_header(
            &mut bits,
            257,
            1,
            &[(0, 1), (1, 2), (symbol as usize, 2)],
        );
        push_canonical_code(&mut bits, 3, 2);
        let extra_bits = if symbol == 17 { 3 } else { 7 };
        push_lsb_value(&mut bits, 0, extra_bits);
        let repeat = if symbol == 17 { 3 } else { 11 };
        for _ in repeat..256 {
            push_canonical_code(&mut bits, 0, 1);
        }
        push_canonical_code(&mut bits, 2, 2);
        push_canonical_code(&mut bits, 0, 1);
        push_canonical_code(&mut bits, 0, 1); // EOB
    }
    return pack_deflate_bits(&bits);
}

fn create_reserved_dynamic_distance_stream() -> Vec<u8> {
    let mut bits: Vec<u8> = Vec::new();
    push_dynamic_header(&mut bits, 258, 31, &[(0, 1), (1, 1)]);
    for _ in 0..256 {
        push_canonical_code(&mut bits, 0, 1);
    }
    push_canonical_code(&mut bits, 1, 1);
    push_canonical_code(&mut bits, 1, 1);
    for _ in 0..30 {
        push_canonical_code(&mut bits, 0, 1);
    }
    push_canonical_code(&mut bits, 1, 1);
    push_canonical_code(&mut bits, 1, 1); // literal 257
    push_canonical_code(&mut bits, 0, 1); // reserved distance 30
    return pack_deflate_bits(&bits);
}

fn create_raw_stored_stream_starting_with_zlib_header() -> (Vec<u8>, Vec<u8>) {
    let mut payload = vec![0u8; 156];
    for i in 0..payload.len() {
        payload[i] = i as u8;
    }

    let mut stream = vec![0u8; 1 + 4 + payload.len() + 5];
    stream[0] = 0x78;
    stream[1] = 0x9c;
    stream[2] = 0x00;
    stream[3] = 0x63;
    stream[4] = 0xff;
    stream[5..5 + payload.len()].copy_from_slice(&payload);
    let trailer_start = 5 + payload.len();
    stream[trailer_start] = 0x01;
    stream[trailer_start + 1] = 0x00;
    stream[trailer_start + 2] = 0x00;
    stream[trailer_start + 3] = 0xff;
    stream[trailer_start + 4] = 0xff;
    return (payload, stream);
}

const LOREM: &str = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore. ";

const FIXTURE_EMPTY: &str = "eJwDAAAAAAE=";
const FIXTURE_HIGH_RATIO: &str = "eJztxbEBADAEADC0/H+yQyRLIuv9npAkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIk3W4BATsAKQ==";
const FIXTURE_LITERAL: &str = "eJxLy8lMzyjJKFQoTk7NS9VNyy/KTSwpBgBjVQiv";
const FIXTURE_RAW_LITERAL: &str = "S8vJTM8oyShUKE5OzUvVTcsvyk0sKQYA";
const FIXTURE_REPETITIVE: &str = "eJztxjEBACAIALBMYgIxCdC/g0HcrlXPybtil4iIiIiIiIiIiMgfeU6Y4Pw=";
const FIXTURE_LOREM: &str = "eJztzdENQyEMQ9FVPEDVSd4SlESVJUIQSfYvQ/STb+v6PL7VwBVlEB++EUw003yh+wztqVkbTbgYnfMLHTxjqJwAygpzQaqtE3N2CqVmohKjfc79G89FLnKRi/wX+QG1gr9k";
const FIXTURE_STORED_L0: &str = "eAEBKwDU/3RoZSBxdWljayBicm93biBmb3gganVtcHMgb3ZlciB0aGUgbGF6eSBkb2dhPA/6";

mod decompress_deflate {
    use super::*;

    #[test]
    fn accepts_every_dynamic_repeat_form_when_it_ends_inside_the_declared_table() {
        for symbol in [16u32, 17, 18] {
            assert_eq!(
                decompress_deflate(
                    &create_valid_dynamic_repeat_stream(symbol),
                    0,
                    CompressionFraming::Raw
                ),
                Some(vec![])
            );
        }
    }

    #[test]
    fn does_not_mistake_a_valid_raw_stream_beginning_78_9c_for_zlib_framing() {
        let (payload, stream) = create_raw_stored_stream_starting_with_zlib_header();
        assert_eq!(
            decompress_deflate(&stream, payload.len(), CompressionFraming::Raw),
            Some(payload.clone())
        );
        assert!(
            decompress_deflate(&stream, payload.len(), CompressionFraming::Rfc1950).is_none()
        );
    }

    #[test]
    fn keeps_inflating_a_stream_whose_expansion_ratio_is_large_but_bounded() {
        let mut source = vec![0u8; 64 * 1024];
        for i in 0..source.len() {
            source[i] = (i % 7) as u8;
        }
        assert_eq!(
            decompress_deflate(
                &decode_base64(FIXTURE_HIGH_RATIO),
                0,
                CompressionFraming::Rfc1950
            ),
            Some(source)
        );
    }

    #[test]
    fn rejects_a_dynamic_code_length_repeat_that_exceeds_the_declared_table() {
        assert_eq!(
            decompress_deflate(
                &decode_hex("05c0050900000000a0ffaf15"),
                0,
                CompressionFraming::Raw
            ),
            Some(vec![])
        );
        assert!(decompress_deflate(
            &decode_hex("05c0050900000000a0ffaf0d"),
            0,
            CompressionFraming::Raw
        )
        .is_none());
    }

    #[test]
    fn rejects_a_missing_or_corrupt_zlib_adler_32_trailer() {
        let valid = decode_base64(FIXTURE_LITERAL);
        let mut corrupt = valid.clone();
        corrupt[corrupt.len() - 1] ^= 1;
        assert!(decompress_deflate(
            &valid[..valid.len() - 4],
            0,
            CompressionFraming::Rfc1950
        )
        .is_none());
        assert!(
            decompress_deflate(&corrupt, 0, CompressionFraming::Rfc1950).is_none()
        );
    }

    #[test]
    fn rejects_a_previous_length_repeat_before_any_length_has_been_declared() {
        let mut bits: Vec<u8> = Vec::new();
        push_dynamic_header(&mut bits, 257, 1, &[(0, 1), (1, 2), (16, 2)]);
        push_canonical_code(&mut bits, 3, 2);
        assert!(
            decompress_deflate(&pack_deflate_bits(&bits), 0, CompressionFraming::Raw).is_none()
        );
    }

    #[test]
    fn rejects_a_reserved_dynamic_distance_symbol() {
        assert!(decompress_deflate(
            &create_reserved_dynamic_distance_stream(),
            0,
            CompressionFraming::Raw
        )
        .is_none());
    }

    #[test]
    fn rejects_dynamic_repeat_symbol_16_when_it_exceeds_the_declared_table() {
        assert!(decompress_deflate(
            &create_dynamic_repeat_overflow_stream(16),
            0,
            CompressionFraming::Raw
        )
        .is_none());
    }

    #[test]
    fn rejects_dynamic_repeat_symbol_17_when_it_exceeds_the_declared_table() {
        assert!(decompress_deflate(
            &create_dynamic_repeat_overflow_stream(17),
            0,
            CompressionFraming::Raw
        )
        .is_none());
    }

    #[test]
    fn rejects_dynamic_repeat_symbol_18_when_it_exceeds_the_declared_table() {
        assert!(decompress_deflate(
            &create_dynamic_repeat_overflow_stream(18),
            0,
            CompressionFraming::Raw
        )
        .is_none());
    }

    #[test]
    fn rejects_forbidden_dynamic_literal_counts_without_rejecting_the_maximum_valid_count() {
        assert_eq!(
            decompress_deflate(
                &decode_hex("edc0210900000000a0ffaf5d22"),
                0,
                CompressionFraming::Raw
            ),
            Some(vec![])
        );
        assert!(decompress_deflate(
            &decode_hex("f5c0210900000000a0ffaf7d22"),
            0,
            CompressionFraming::Raw
        )
        .is_none());
        assert!(decompress_deflate(
            &decode_hex("fdc0210900000000a0ffaf9d22"),
            0,
            CompressionFraming::Raw
        )
        .is_none());
    }

    #[test]
    fn rejects_illegal_zlib_methods_window_sizes_check_bits_and_preset_dictionaries() {
        let mut illegal_method = decode_base64(FIXTURE_LITERAL);
        illegal_method[0] = 0x77;
        illegal_method[1] = 0x09;
        assert!(
            decompress_deflate(&illegal_method, 0, CompressionFraming::Rfc1950).is_none()
        );

        let mut illegal_window = decode_base64(FIXTURE_LITERAL);
        illegal_window[0] = 0xf8;
        illegal_window[1] = 0x00;
        assert!(
            decompress_deflate(&illegal_window, 0, CompressionFraming::Rfc1950).is_none()
        );

        let mut illegal_check = decode_base64(FIXTURE_LITERAL);
        illegal_check[1] ^= 1;
        assert!(
            decompress_deflate(&illegal_check, 0, CompressionFraming::Rfc1950).is_none()
        );

        let mut preset_dictionary = decode_base64(FIXTURE_LITERAL);
        preset_dictionary[1] = 0xbb;
        assert!(
            decompress_deflate(&preset_dictionary, 0, CompressionFraming::Rfc1950).is_none()
        );
    }

    #[test]
    fn rejects_reserved_fixed_length_symbols_and_back_references_before_the_output() {
        assert!(decompress_deflate(
            &create_fixed_back_reference_stream(286, None),
            0,
            CompressionFraming::Raw
        )
        .is_none());
        assert!(decompress_deflate(
            &create_fixed_back_reference_stream(257, Some(0)),
            0,
            CompressionFraming::Raw
        )
        .is_none());
    }

    #[test]
    fn rejects_truncated_stored_block_headers_and_payloads() {
        assert!(
            decompress_deflate(&[0x01, 0, 0], 0, CompressionFraming::Raw).is_none()
        );
        assert!(decompress_deflate(
            &[0x01, 0x02, 0, 0xfd, 0xff, 0x41],
            0,
            CompressionFraming::Raw
        )
        .is_none());
    }

    #[test]
    fn rejects_undersized_zlib_wrappers() {
        assert!(decompress_deflate(
            &[0x78, 0x9c, 0, 0, 0],
            0,
            CompressionFraming::Rfc1950
        )
        .is_none());
    }

    #[test]
    fn returns_null_on_a_corrupt_invalid_block_type_stream() {
        assert!(decompress_deflate(
            &[0x78, 0x9c, 0xff, 0xff, 0, 0, 0, 0],
            0,
            CompressionFraming::Rfc1950
        )
        .is_none());
    }

    #[test]
    fn returns_null_on_a_truncated_stream_rather_than_throwing() {
        let full = decode_base64(FIXTURE_REPETITIVE);
        assert!(
            decompress_deflate(&full[..6], 0, CompressionFraming::Rfc1950).is_none()
        );
    }

    #[test]
    fn round_trips_a_headerless_raw_deflate_stream_when_explicitly_requested() {
        assert_eq!(
            decompress_deflate(
                &decode_base64(FIXTURE_RAW_LITERAL),
                0,
                CompressionFraming::Raw
            ),
            Some(b"flighthq scene-formats".to_vec())
        );
    }

    #[test]
    fn round_trips_a_short_literal_run_zlib_wrapped() {
        assert_eq!(
            decompress_deflate(
                &decode_base64(FIXTURE_LITERAL),
                0,
                CompressionFraming::Rfc1950
            ),
            Some(b"flighthq scene-formats".to_vec())
        );
    }

    #[test]
    fn round_trips_a_stored_level_0_block() {
        assert_eq!(
            decompress_deflate(
                &decode_base64(FIXTURE_STORED_L0),
                0,
                CompressionFraming::Rfc1950
            ),
            Some(b"the quick brown fox jumps over the lazy dog".to_vec())
        );
    }

    #[test]
    fn round_trips_empty_input() {
        assert_eq!(
            decompress_deflate(&decode_base64(FIXTURE_EMPTY), 0, CompressionFraming::Rfc1950),
            Some(vec![])
        );
    }

    #[test]
    fn round_trips_highly_repetitive_data_through_back_references_and_grows_the_output_buffer() {
        assert_eq!(
            decompress_deflate(
                &decode_base64(FIXTURE_REPETITIVE),
                0,
                CompressionFraming::Rfc1950
            ),
            Some("abcABC123".repeat(600).as_bytes().to_vec())
        );
    }

    #[test]
    fn round_trips_prose_through_a_genuine_dynamic_huffman_block() {
        assert_eq!(
            decompress_deflate(
                &decode_base64(FIXTURE_LOREM),
                0,
                CompressionFraming::Rfc1950
            ),
            Some(LOREM.repeat(12).as_bytes().to_vec())
        );
    }

    #[test]
    fn stops_expansion_at_the_container_declared_output_bound() {
        let compressed = decode_base64(FIXTURE_HIGH_RATIO);
        let result = decompress_deflate(&compressed, 64 * 1024, CompressionFraming::Rfc1950);
        assert!(result.is_some());
        assert_eq!(result.unwrap().len(), 64 * 1024);
        assert!(
            decompress_deflate(&compressed, 64 * 1024 - 1, CompressionFraming::Rfc1950).is_none()
        );
    }
}

mod sdk_host_decompress_deflate {
    use super::*;

    #[test]
    fn inflates_through_the_slot_exactly_as_the_bare_function_does() {
        let slot = create_sdk_host_decompress_deflate();
        assert_eq!(
            (slot.decompress)(
                &decode_base64(FIXTURE_LITERAL),
                0,
                CompressionFraming::Rfc1950
            ),
            Some(b"flighthq scene-formats".to_vec())
        );
    }

    #[test]
    fn is_a_ready_made_deflate_slot_carrying_the_portable_inflater() {
        let slot = create_sdk_host_decompress_deflate();
        assert!(slot.decompress == (decompress_deflate as Decompressor));
    }
}
