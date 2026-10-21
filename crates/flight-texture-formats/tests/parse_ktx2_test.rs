use flight_texture_formats::*;

const KTX2_MAGIC: [u8; 12] = [
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
];

#[derive(Clone, Copy)]
struct Ktx2Level {
    byte_offset: usize,
    byte_length: usize,
}

struct Ktx2Options<'a> {
    vk_format: u32,
    width: u32,
    height: u32,
    depth: u32,
    layer_count: u32,
    face_count: u32,
    scheme: u32,
    levels: &'a [Ktx2Level],
}

fn build_ktx2(options: Ktx2Options<'_>) -> Vec<u8> {
    let data_start = 80 + options.levels.len() * 24;
    let total = options
        .levels
        .iter()
        .map(|level| level.byte_offset + level.byte_length)
        .fold(data_start, usize::max);
    let mut bytes = vec![0; total];
    bytes[..12].copy_from_slice(&KTX2_MAGIC);
    set_u32(&mut bytes, 12, options.vk_format);
    set_u32(&mut bytes, 16, 4);
    set_u32(&mut bytes, 20, options.width);
    set_u32(&mut bytes, 24, options.height);
    set_u32(&mut bytes, 28, options.depth);
    set_u32(&mut bytes, 32, options.layer_count);
    set_u32(&mut bytes, 36, options.face_count);
    set_u32(&mut bytes, 40, options.levels.len() as u32);
    set_u32(&mut bytes, 44, options.scheme);
    for (index, level) in options.levels.iter().enumerate() {
        let offset = 80 + index * 24;
        set_u64(&mut bytes, offset, level.byte_offset as u64);
        set_u64(&mut bytes, offset + 8, level.byte_length as u64);
        set_u64(&mut bytes, offset + 16, level.byte_length as u64);
    }
    return bytes;
}

fn options<'a>(
    vk_format: u32,
    width: u32,
    height: u32,
    levels: &'a [Ktx2Level],
) -> Ktx2Options<'a> {
    return Ktx2Options {
        vk_format,
        width,
        height,
        depth: 0,
        layer_count: 0,
        face_count: 1,
        scheme: 0,
        levels,
    };
}

fn set_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn set_u64(bytes: &mut [u8], offset: usize, value: u64) {
    bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

mod get_ktx2_parse_failure_reason {
    use super::*;

    #[test]
    fn reports_a_truncated_detected_header() {
        assert_eq!(
            get_ktx2_parse_failure_reason(&KTX2_MAGIC),
            Some(TextureContainerParseFailureReason::HeaderTruncated)
        );
    }
}

mod parse_ktx2 {
    use super::*;

    #[test]
    fn maps_an_undefined_vk_format_with_no_supercompression_to_uastc() {
        let levels = [Ktx2Level {
            byte_length: 64,
            byte_offset: 104,
        }];
        let container = parse_ktx2(&build_ktx2(options(0, 4, 4, &levels))).unwrap();
        assert_eq!(container.format, TextureContainerFormat::Uastc);
    }

    #[test]
    fn normalizes_a_multi_mip_array_to_layer_major_order() {
        let levels = [
            Ktx2Level {
                byte_length: 512,
                byte_offset: 128,
            },
            Ktx2Level {
                byte_length: 128,
                byte_offset: 640,
            },
        ];
        let mut opts = options(37, 8, 8, &levels);
        opts.layer_count = 2;
        let container = parse_ktx2(&build_ktx2(opts)).unwrap();
        assert_eq!(
            container.levels,
            [
                TextureContainerLevel {
                    byte_length: 256,
                    byte_offset: 128,
                    height: 8,
                    width: 8
                },
                TextureContainerLevel {
                    byte_length: 64,
                    byte_offset: 640,
                    height: 4,
                    width: 4
                },
                TextureContainerLevel {
                    byte_length: 256,
                    byte_offset: 384,
                    height: 8,
                    width: 8
                },
                TextureContainerLevel {
                    byte_length: 64,
                    byte_offset: 704,
                    height: 4,
                    width: 4
                },
            ]
        );
    }

    #[test]
    fn normalizes_a_multi_mip_cubemap_to_face_major_order() {
        let levels = [
            Ktx2Level {
                byte_length: 1536,
                byte_offset: 128,
            },
            Ktx2Level {
                byte_length: 384,
                byte_offset: 1664,
            },
        ];
        let mut opts = options(37, 8, 8, &levels);
        opts.face_count = 6;
        let container = parse_ktx2(&build_ktx2(opts)).unwrap();
        assert_eq!(
            &container.levels[..4],
            [
                TextureContainerLevel {
                    byte_length: 256,
                    byte_offset: 128,
                    height: 8,
                    width: 8
                },
                TextureContainerLevel {
                    byte_length: 64,
                    byte_offset: 1664,
                    height: 4,
                    width: 4
                },
                TextureContainerLevel {
                    byte_length: 256,
                    byte_offset: 384,
                    height: 8,
                    width: 8
                },
                TextureContainerLevel {
                    byte_length: 64,
                    byte_offset: 1728,
                    height: 4,
                    width: 4
                },
            ]
        );
    }

    #[test]
    fn parses_a_single_mip_uncompressed_texture() {
        let levels = [Ktx2Level {
            byte_length: 64,
            byte_offset: 104,
        }];
        let container = parse_ktx2(&build_ktx2(options(37, 4, 4, &levels))).unwrap();
        assert_eq!(container.format, TextureContainerFormat::Rgba8Unorm);
        assert_eq!(
            (container.width, container.height, container.depth),
            (4, 4, 1)
        );
        assert_eq!(
            (container.mip_levels, container.layers, container.faces),
            (1, 1, 1)
        );
        assert_eq!(
            container.supercompression,
            TextureContainerSupercompression::None
        );
        assert_eq!(
            container.levels,
            [TextureContainerLevel {
                byte_length: 64,
                byte_offset: 104,
                height: 4,
                width: 4
            }]
        );
    }

    #[test]
    fn preserves_lossless_supercompressed_levels_as_indivisible_blobs() {
        for (scheme, expected) in [
            (2, TextureContainerSupercompression::Zstd),
            (3, TextureContainerSupercompression::Zlib),
        ] {
            let levels = [Ktx2Level {
                byte_length: 48,
                byte_offset: 104,
            }];
            let mut opts = options(37, 4, 4, &levels);
            opts.layer_count = 2;
            opts.scheme = scheme;
            let container = parse_ktx2(&build_ktx2(opts)).unwrap();
            assert_eq!(container.supercompression, expected);
            assert_eq!(
                container.levels,
                [TextureContainerLevel {
                    byte_length: 48,
                    byte_offset: 104,
                    height: 4,
                    width: 4
                }]
            );
        }
    }

    #[test]
    fn reports_a_basis_lz_level_as_one_etc1s_blob() {
        let levels = [Ktx2Level {
            byte_length: 48,
            byte_offset: 104,
        }];
        let mut opts = options(0, 4, 4, &levels);
        opts.scheme = 1;
        let container = parse_ktx2(&build_ktx2(opts)).unwrap();
        assert_eq!(container.format, TextureContainerFormat::Etc1s);
        assert_eq!(
            container.supercompression,
            TextureContainerSupercompression::BasisLz
        );
        assert_eq!(container.levels.len(), 1);
    }

    #[test]
    fn reports_each_mip_from_the_level_index() {
        let levels = [
            Ktx2Level {
                byte_length: 256,
                byte_offset: 176,
            },
            Ktx2Level {
                byte_length: 64,
                byte_offset: 432,
            },
            Ktx2Level {
                byte_length: 16,
                byte_offset: 496,
            },
            Ktx2Level {
                byte_length: 4,
                byte_offset: 512,
            },
        ];
        let container = parse_ktx2(&build_ktx2(options(37, 8, 8, &levels))).unwrap();
        assert_eq!(container.mip_levels, 4);
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.width)
                .collect::<Vec<_>>(),
            [8, 4, 2, 1]
        );
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [176, 432, 496, 512]
        );
    }

    #[test]
    fn returns_none_for_a_non_ktx2_buffer() {
        assert_eq!(parse_ktx2(b"DDS "), None);
    }

    #[test]
    fn returns_none_for_a_truncated_header() {
        let mut bytes = KTX2_MAGIC.to_vec();
        bytes.extend([0; 4]);
        assert_eq!(parse_ktx2(&bytes), None);
    }

    #[test]
    fn returns_none_for_an_unmapped_vk_format() {
        let levels = [Ktx2Level {
            byte_length: 64,
            byte_offset: 104,
        }];
        assert_eq!(parse_ktx2(&build_ktx2(options(9999, 4, 4, &levels))), None);
    }

    #[test]
    fn returns_none_when_a_level_range_runs_past_the_buffer() {
        let levels = [Ktx2Level {
            byte_length: 64,
            byte_offset: 104,
        }];
        let mut bytes = build_ktx2(options(37, 4, 4, &levels));
        set_u64(&mut bytes, 88, 1_000_000);
        assert_eq!(parse_ktx2(&bytes), None);
    }

    #[test]
    fn splits_an_uncompressed_array_level_into_layers() {
        let levels = [Ktx2Level {
            byte_length: 192,
            byte_offset: 104,
        }];
        let mut opts = options(37, 4, 4, &levels);
        opts.layer_count = 3;
        let container = parse_ktx2(&build_ktx2(opts)).unwrap();
        assert_eq!(container.layers, 3);
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [104, 168, 232]
        );
    }

    #[test]
    fn splits_an_uncompressed_cubemap_level_into_faces() {
        let levels = [Ktx2Level {
            byte_length: 384,
            byte_offset: 104,
        }];
        let mut opts = options(37, 4, 4, &levels);
        opts.face_count = 6;
        let container = parse_ktx2(&build_ktx2(opts)).unwrap();
        assert_eq!(container.faces, 6);
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.byte_length)
                .collect::<Vec<_>>(),
            [64; 6]
        );
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [104, 168, 232, 296, 360, 424]
        );
    }
}
