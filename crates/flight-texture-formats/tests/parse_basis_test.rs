use flight_texture_formats::*;

#[derive(Clone, Copy)]
struct BasisSlice {
    image_index: u32,
    level_index: u8,
    width: u16,
    height: u16,
    file_offset: u32,
    file_size: u32,
}

fn build_basis(
    slices: &[BasisSlice],
    total_images: u32,
    texture_format: u8,
    texture_type: u8,
) -> Vec<u8> {
    let slice_table_offset = 77usize;
    let data_start = slice_table_offset + slices.len() * 23;
    let total = slices
        .iter()
        .map(|slice| (slice.file_offset + slice.file_size) as usize)
        .fold(data_start, usize::max);
    let mut bytes = vec![0; total];
    bytes[0] = 0x73;
    bytes[1] = 0x42;
    set_u24(&mut bytes, 14, slices.len() as u32);
    set_u24(&mut bytes, 17, total_images);
    bytes[20] = texture_format;
    bytes[23] = texture_type;
    set_u32(&mut bytes, 65, slice_table_offset as u32);
    for (index, slice) in slices.iter().enumerate() {
        let offset = slice_table_offset + index * 23;
        set_u24(&mut bytes, offset, slice.image_index);
        bytes[offset + 3] = slice.level_index;
        set_u16(&mut bytes, offset + 5, slice.width);
        set_u16(&mut bytes, offset + 7, slice.height);
        set_u32(&mut bytes, offset + 13, slice.file_offset);
        set_u32(&mut bytes, offset + 17, slice.file_size);
    }
    return bytes;
}

fn set_u16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn set_u24(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset] = value as u8;
    bytes[offset + 1] = (value >> 8) as u8;
    bytes[offset + 2] = (value >> 16) as u8;
}

fn set_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn slice(
    file_offset: u32,
    file_size: u32,
    width: u16,
    height: u16,
    image_index: u32,
    level_index: u8,
) -> BasisSlice {
    return BasisSlice {
        image_index,
        level_index,
        width,
        height,
        file_offset,
        file_size,
    };
}

mod get_basis_parse_failure_reason {
    use super::*;

    #[test]
    fn reports_a_truncated_detected_header() {
        assert_eq!(
            get_basis_parse_failure_reason(&[0x73, 0x42]),
            Some(TextureContainerParseFailureReason::HeaderTruncated)
        );
    }
}

mod parse_basis {
    use super::*;

    #[test]
    fn continues_to_decline_measured_unsupported_formats() {
        for texture_format in [6, 2, 3, 4, 2] {
            let bytes = build_basis(&[slice(100, 8, 4, 4, 0, 0)], 1, texture_format, 0);
            assert_eq!(parse_basis(&bytes), None);
            assert_eq!(
                get_basis_parse_failure_reason(&bytes),
                Some(TextureContainerParseFailureReason::FormatUnsupported)
            );
        }
    }

    #[test]
    fn maps_the_uastc_texture_format() {
        let bytes = build_basis(&[slice(100, 16, 4, 4, 0, 0)], 1, 1, 0);
        assert_eq!(
            parse_basis(&bytes).unwrap().format,
            TextureContainerFormat::Uastc
        );
    }

    #[test]
    fn matches_the_exact_measured_fixture_semantics() {
        let fixtures: &[(&[BasisSlice], TextureContainerFormat, usize, usize, usize)] = &[
            (
                &[
                    slice(45_273, 62_601, 768, 512, 0, 0),
                    slice(107_874, 40_817, 768, 512, 0, 0),
                ],
                TextureContainerFormat::Etc1s,
                768,
                512,
                1,
            ),
            (
                &[
                    slice(10_417, 48_567, 768, 512, 0, 0),
                    slice(58_984, 12_500, 384, 256, 0, 1),
                    slice(71_484, 3_173, 192, 128, 0, 2),
                    slice(74_657, 827, 96, 64, 0, 3),
                    slice(75_484, 217, 48, 32, 0, 4),
                    slice(75_701, 61, 24, 16, 0, 5),
                    slice(75_762, 14, 12, 8, 0, 6),
                    slice(75_776, 7, 6, 4, 0, 7),
                    slice(75_783, 4, 3, 2, 0, 8),
                    slice(75_787, 4, 1, 1, 0, 9),
                ],
                TextureContainerFormat::Etc1s,
                768,
                512,
                10,
            ),
            (
                &[slice(33_914, 51_390, 768, 512, 0, 0)],
                TextureContainerFormat::Etc1s,
                768,
                512,
                1,
            ),
            (
                &[slice(100, 393_216, 768, 512, 0, 0)],
                TextureContainerFormat::Uastc,
                768,
                512,
                1,
            ),
            (
                &[slice(100, 393_216, 512, 768, 0, 0)],
                TextureContainerFormat::Uastc,
                512,
                768,
                1,
            ),
            (
                &[slice(12_936, 39_560, 768, 512, 0, 0)],
                TextureContainerFormat::Etc1s,
                768,
                512,
                1,
            ),
            (
                &[slice(38_700, 52_083, 1024, 1024, 0, 0)],
                TextureContainerFormat::Etc1s,
                1024,
                1024,
                1,
            ),
            (
                &[slice(100, 1_048_576, 1024, 1024, 0, 0)],
                TextureContainerFormat::Uastc,
                1024,
                1024,
                1,
            ),
            (
                &[slice(223, 1, 8, 8, 0, 0), slice(224, 2, 8, 8, 0, 0)],
                TextureContainerFormat::Etc1s,
                8,
                8,
                1,
            ),
            (
                &[slice(7_361, 64_199, 1024, 1024, 0, 0)],
                TextureContainerFormat::Etc1s,
                1024,
                1024,
                1,
            ),
            (
                &[slice(10_382, 45_303, 512, 768, 0, 0)],
                TextureContainerFormat::Etc1s,
                512,
                768,
                1,
            ),
        ];
        for (slices, format, width, height, mip_levels) in fixtures {
            let texture_format = if *format == TextureContainerFormat::Uastc {
                1
            } else {
                0
            };
            let container = parse_basis(&build_basis(slices, 1, texture_format, 0)).unwrap();
            assert_eq!(container.format, *format);
            assert_eq!(
                (container.width, container.height, container.mip_levels),
                (*width, *height, *mip_levels)
            );
            assert_eq!(container.levels.len(), slices.len());
            for (level, source) in container.levels.iter().zip(slices.iter()) {
                assert_eq!(
                    (level.byte_offset, level.byte_length),
                    (source.file_offset as usize, source.file_size as usize)
                );
                assert_eq!(
                    (level.width, level.height),
                    (source.width as usize, source.height as usize)
                );
            }
        }
    }

    #[test]
    fn parses_a_single_slice_etc1s_image() {
        let container = parse_basis(&build_basis(&[slice(100, 8, 4, 4, 0, 0)], 1, 0, 0)).unwrap();
        assert_eq!(container.format, TextureContainerFormat::Etc1s);
        assert_eq!(
            (container.width, container.height, container.depth),
            (4, 4, 1)
        );
        assert_eq!(
            (container.layers, container.faces, container.mip_levels),
            (1, 1, 1)
        );
        assert_eq!(
            container.levels,
            [TextureContainerLevel {
                byte_length: 8,
                byte_offset: 100,
                height: 4,
                width: 4
            }]
        );
    }

    #[test]
    fn preserves_cubemap_array_faces_and_layers() {
        let slices: Vec<BasisSlice> = (0..12)
            .map(|image| slice(353 + image * 8, 8, 4, 4, image, 0))
            .collect();
        let container = parse_basis(&build_basis(&slices, 12, 0, 2)).unwrap();
        assert_eq!(
            (container.faces, container.layers, container.depth),
            (6, 2, 1)
        );
        assert_eq!(container.levels.len(), 12);
    }

    #[test]
    fn preserves_volume_depth_and_rejects_temporal_or_malformed_cube_shapes() {
        let slices = [
            slice(146, 8, 4, 4, 0, 0),
            slice(154, 8, 4, 4, 1, 0),
            slice(162, 8, 4, 4, 2, 0),
        ];
        let volume = parse_basis(&build_basis(&slices, 3, 0, 4)).unwrap();
        assert_eq!((volume.depth, volume.faces, volume.layers), (3, 1, 1));
        assert_eq!(parse_basis(&build_basis(&slices, 3, 0, 3)), None);
        assert_eq!(parse_basis(&build_basis(&slices, 3, 0, 2)), None);
    }

    #[test]
    fn reads_twenty_four_bit_image_counts_and_indices() {
        let container = parse_basis(&build_basis(
            &[slice(100, 8, 4, 4, 70_000, 0)],
            70_001,
            0,
            0,
        ))
        .unwrap();
        assert_eq!(container.layers, 70_001);
        assert_eq!(
            container.levels,
            [TextureContainerLevel {
                byte_length: 8,
                byte_offset: 100,
                height: 4,
                width: 4
            }]
        );
    }

    #[test]
    fn reports_each_image_as_an_array_layer() {
        let slices = [slice(123, 8, 4, 4, 0, 0), slice(131, 8, 4, 4, 1, 0)];
        let container = parse_basis(&build_basis(&slices, 2, 0, 0)).unwrap();
        assert_eq!(container.layers, 2);
        assert_eq!(container.levels.len(), 2);
    }

    #[test]
    fn reports_a_mip_chain_from_slice_level_indices() {
        let slices = [slice(123, 8, 4, 4, 0, 0), slice(131, 4, 2, 2, 0, 1)];
        let container = parse_basis(&build_basis(&slices, 1, 0, 0)).unwrap();
        assert_eq!(container.mip_levels, 2);
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.width)
                .collect::<Vec<_>>(),
            [4, 2]
        );
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [123, 131]
        );
    }

    #[test]
    fn returns_none_for_non_basis_truncated_or_unknown_format_data() {
        assert_eq!(parse_basis(b"DDS "), None);
        assert_eq!(parse_basis(&[0x73, 0x42, 0, 0]), None);
        assert_eq!(
            parse_basis(&build_basis(&[slice(100, 8, 4, 4, 0, 0)], 1, 5, 0)),
            None
        );
    }

    #[test]
    fn returns_none_when_the_slice_table_runs_past_the_buffer() {
        let mut bytes = build_basis(&[slice(100, 8, 4, 4, 0, 0)], 1, 0, 0);
        set_u32(&mut bytes, 65, 1_000_000);
        assert_eq!(parse_basis(&bytes), None);
    }
}
