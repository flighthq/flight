use flight_texture_formats::*;

fn build_atf(
    version: u8,
    format_code: u8,
    cube: bool,
    log2_width: u8,
    log2_height: u8,
    mip_count: u8,
    block_lengths: &[usize],
) -> (Vec<u8>, Vec<usize>) {
    let versioned = version != 0;
    let header_offset = if versioned { 12 } else { 6 };
    let length_width = if versioned { 4 } else { 3 };
    let body_size: usize = block_lengths
        .iter()
        .map(|length| length_width + length)
        .sum();
    let mut bytes = vec![0; header_offset + 4 + body_size];
    bytes[..3].copy_from_slice(b"ATF");
    let payload_length = bytes.len() - header_offset;
    if versioned {
        bytes[6] = 0xff;
        bytes[7] = version;
        write_uint_big_endian(&mut bytes, 8, payload_length, 4);
    } else {
        write_uint_big_endian(&mut bytes, 3, payload_length, 3);
    }
    bytes[header_offset] = if cube { 0x80 } else { 0 } | format_code;
    bytes[header_offset + 1] = log2_width;
    bytes[header_offset + 2] = log2_height;
    bytes[header_offset + 3] = mip_count;
    let mut offsets = Vec::new();
    let mut offset = header_offset + 4;
    for length in block_lengths {
        write_uint_big_endian(&mut bytes, offset, *length, length_width);
        offset += length_width;
        offsets.push(offset);
        for index in 0..*length {
            bytes[offset + index] = (offset + index) as u8;
        }
        offset += length;
    }
    return (bytes, offsets);
}

fn write_uint_big_endian(bytes: &mut [u8], offset: usize, value: usize, width: usize) {
    for index in 0..width {
        bytes[offset + index] = (value >> ((width - 1 - index) * 8)) as u8;
    }
}

mod get_atf_parse_failure_reason {
    use super::*;

    #[test]
    fn reports_a_truncated_detected_header() {
        assert_eq!(
            get_atf_parse_failure_reason(b"ATF"),
            Some(TextureContainerParseFailureReason::HeaderTruncated)
        );
    }
}

mod parse_atf {
    use super::*;

    #[test]
    fn drops_all_zero_slots() {
        let (bytes, offsets) = build_atf(
            3,
            5,
            false,
            3,
            3,
            3,
            &[64, 0, 0, 0, 16, 0, 0, 0, 16, 0, 0, 0],
        );
        let containers = parse_atf(&bytes).unwrap();
        assert_eq!(containers.len(), 1);
        assert_eq!(containers[0].format, TextureContainerFormat::Bc3);
        assert_eq!(
            containers[0]
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [offsets[0], offsets[4], offsets[8]]
        );
    }

    #[test]
    fn exposes_only_three_slots_before_version_three() {
        let (bytes, _) = build_atf(2, 3, false, 2, 2, 1, &[8, 8, 8]);
        let containers = parse_atf(&bytes).unwrap();
        assert_eq!(
            containers
                .iter()
                .map(|container| container.format)
                .collect::<Vec<_>>(),
            [
                TextureContainerFormat::Bc1,
                TextureContainerFormat::Etc1,
                TextureContainerFormat::Pvrtc4bppRgb,
            ]
        );
    }

    #[test]
    fn parses_a_cross_platform_atf_as_peer_containers() {
        let lengths = [64, 32, 24, 64, 16, 8, 6, 16, 16, 8, 6, 16];
        let (bytes, offsets) = build_atf(3, 5, false, 3, 3, 3, &lengths);
        let containers = parse_atf(&bytes).unwrap();
        assert_eq!(
            containers
                .iter()
                .map(|container| container.format)
                .collect::<Vec<_>>(),
            [
                TextureContainerFormat::Bc3,
                TextureContainerFormat::Etc1,
                TextureContainerFormat::Pvrtc4bppRgba,
                TextureContainerFormat::Etc2Rgba,
            ]
        );
        for container in &containers {
            assert_eq!(
                (
                    container.width,
                    container.height,
                    container.mip_levels,
                    container.faces
                ),
                (8, 8, 3, 1)
            );
            assert_eq!(container.levels.len(), 3);
        }
        assert_eq!(
            containers[0].levels,
            [
                TextureContainerLevel {
                    byte_length: 64,
                    byte_offset: offsets[0],
                    height: 8,
                    width: 8
                },
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: offsets[4],
                    height: 4,
                    width: 4
                },
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: offsets[8],
                    height: 2,
                    width: 2
                },
            ]
        );
        assert_eq!(
            containers[3].levels,
            [
                TextureContainerLevel {
                    byte_length: 64,
                    byte_offset: offsets[3],
                    height: 8,
                    width: 8
                },
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: offsets[7],
                    height: 4,
                    width: 4
                },
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: offsets[11],
                    height: 2,
                    width: 2
                },
            ]
        );
        let mut ranges: Vec<(usize, usize)> = containers
            .iter()
            .flat_map(|container| container.levels.iter())
            .map(|level| (level.byte_offset, level.byte_offset + level.byte_length))
            .collect();
        ranges.sort();
        let mut previous_end = 0;
        for (start, end) in ranges {
            assert!(start >= previous_end);
            assert!(end <= bytes.len());
            previous_end = end;
        }
        assert!(std::ptr::eq(
            select_texture_container(&containers, &[TextureContainerFormat::Bc3]).unwrap(),
            &containers[0]
        ));
    }

    #[test]
    fn reads_the_legacy_header_and_twenty_four_bit_block_lengths() {
        let (bytes, offsets) = build_atf(0, 5, false, 2, 2, 2, &[16, 0, 0, 16, 0, 0]);
        let containers = parse_atf(&bytes).unwrap();
        assert_eq!(containers.len(), 1);
        assert_eq!(containers[0].format, TextureContainerFormat::Bc3);
        assert_eq!((containers[0].width, containers[0].height), (4, 4));
        assert_eq!(
            containers[0].levels,
            [
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: offsets[0],
                    height: 4,
                    width: 4
                },
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: offsets[3],
                    height: 2,
                    width: 2
                },
            ]
        );
    }

    #[test]
    fn reports_mip_levels_as_the_populated_count() {
        let (bytes, offsets) =
            build_atf(3, 5, false, 3, 3, 3, &[64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let containers = parse_atf(&bytes).unwrap();
        assert_eq!(containers[0].mip_levels, 1);
        assert_eq!(
            containers[0].levels,
            [TextureContainerLevel {
                byte_length: 64,
                byte_offset: offsets[0],
                height: 8,
                width: 8
            }]
        );
    }

    #[test]
    fn reports_six_faces_for_a_cube_atf() {
        let (bytes, _) = build_atf(3, 3, true, 1, 1, 1, &[8; 24]);
        let containers = parse_atf(&bytes).unwrap();
        assert_eq!(containers.len(), 4);
        for container in containers {
            assert_eq!(container.faces, 6);
            assert_eq!(container.levels.len(), 6);
        }
    }

    #[test]
    fn returns_none_for_non_atf_or_too_short_bytes() {
        assert_eq!(parse_atf(b"DDS \0\0\0"), None);
        assert_eq!(parse_atf(b"AT"), None);
    }

    #[test]
    fn returns_none_for_unsupported_format_codes() {
        for format_code in [0, 1] {
            let (bytes, _) = build_atf(3, format_code, false, 2, 2, 1, &[0; 4]);
            assert_eq!(parse_atf(&bytes), None);
        }
    }

    #[test]
    fn returns_none_when_a_block_length_overruns_the_buffer() {
        let lengths = [64, 32, 24, 64, 16, 8, 6, 16, 16, 8, 6, 16];
        let (bytes, _) = build_atf(3, 5, false, 3, 3, 3, &lengths);
        assert_eq!(parse_atf(&bytes[..bytes.len() - 8]), None);

        let (mut patched, _) = build_atf(
            3,
            5,
            false,
            3,
            3,
            3,
            &[64, 0, 0, 0, 16, 0, 0, 0, 16, 0, 0, 0],
        );
        write_uint_big_endian(&mut patched, 16, 0xff_ffff, 4);
        assert_eq!(parse_atf(&patched), None);
    }
}
