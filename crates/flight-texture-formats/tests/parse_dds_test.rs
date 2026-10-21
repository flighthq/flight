use flight_texture_formats::*;

#[derive(Clone, Copy)]
struct Dx10Options {
    dxgi_format: u32,
    misc_flag: u32,
    array_size: u32,
}

struct DdsOptions {
    width: u32,
    height: u32,
    mip_map_count: u32,
    pf_flags: u32,
    four_cc: u32,
    rgb_bit_count: u32,
    masks: [u32; 4],
    caps2: u32,
    dx10: Option<Dx10Options>,
    data_bytes: usize,
}

fn build_dds(options: DdsOptions) -> Vec<u8> {
    let header_end = 128 + if options.dx10.is_some() { 20 } else { 0 };
    let mut bytes = vec![0; header_end + options.data_bytes];
    bytes[..4].copy_from_slice(b"DDS ");
    set_u32(&mut bytes, 4, 124);
    set_u32(&mut bytes, 12, options.height);
    set_u32(&mut bytes, 16, options.width);
    set_u32(&mut bytes, 28, options.mip_map_count);
    set_u32(&mut bytes, 76, 32);
    set_u32(&mut bytes, 80, options.pf_flags);
    set_u32(&mut bytes, 84, options.four_cc);
    set_u32(&mut bytes, 88, options.rgb_bit_count);
    for (index, mask) in options.masks.iter().enumerate() {
        set_u32(&mut bytes, 92 + index * 4, *mask);
    }
    set_u32(&mut bytes, 112, options.caps2);
    if let Some(dx10) = options.dx10 {
        set_u32(&mut bytes, 128, dx10.dxgi_format);
        set_u32(&mut bytes, 132, 3);
        set_u32(&mut bytes, 136, dx10.misc_flag);
        set_u32(&mut bytes, 140, dx10.array_size);
    }
    return bytes;
}

fn compressed_options(width: u32, height: u32, four_cc: u32) -> DdsOptions {
    return DdsOptions {
        width,
        height,
        mip_map_count: 1,
        pf_flags: 0x4,
        four_cc,
        rgb_bit_count: 0,
        masks: [0; 4],
        caps2: 0,
        dx10: None,
        data_bytes: 256,
    };
}

fn four_cc(text: &[u8; 4]) -> u32 {
    return u32::from_le_bytes(*text);
}

fn set_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

mod get_dds_parse_failure_reason {
    use super::*;

    #[test]
    fn reports_a_truncated_detected_header() {
        assert_eq!(
            get_dds_parse_failure_reason(b"DDS "),
            Some(TextureContainerParseFailureReason::HeaderTruncated)
        );
    }
}

mod parse_dds {
    use super::*;

    #[test]
    fn computes_descending_byte_ranges_for_a_multi_mip_bc1_texture() {
        let mut options = compressed_options(8, 8, four_cc(b"DXT1"));
        options.mip_map_count = 4;
        let container = parse_dds(&build_dds(options)).unwrap();
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
                .map(|level| level.byte_length)
                .collect::<Vec<_>>(),
            [32, 8, 8, 8]
        );
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [128, 160, 168, 176]
        );
    }

    #[test]
    fn lays_out_every_dx10_array_layer_as_an_independent_subresource_chain() {
        let mut options = compressed_options(4, 4, four_cc(b"DX10"));
        options.dx10 = Some(Dx10Options {
            dxgi_format: 98,
            misc_flag: 0,
            array_size: 3,
        });
        let container = parse_dds(&build_dds(options)).unwrap();
        assert_eq!(container.layers, 3);
        assert_eq!(
            container.levels,
            [
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: 148,
                    height: 4,
                    width: 4
                },
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: 164,
                    height: 4,
                    width: 4
                },
                TextureContainerLevel {
                    byte_length: 16,
                    byte_offset: 180,
                    height: 4,
                    width: 4
                },
            ]
        );
    }

    #[test]
    fn maps_uncompressed_rgba_channel_masks() {
        for (masks, expected) in [
            (
                [0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000],
                TextureContainerFormat::Bgra8Unorm,
            ),
            (
                [0x000000ff, 0x0000ff00, 0x00ff0000, 0xff000000],
                TextureContainerFormat::Rgba8Unorm,
            ),
        ] {
            let options = DdsOptions {
                width: 2,
                height: 2,
                mip_map_count: 1,
                pf_flags: 0x40,
                four_cc: 0,
                rgb_bit_count: 32,
                masks,
                caps2: 0,
                dx10: None,
                data_bytes: 256,
            };
            let container = parse_dds(&build_dds(options)).unwrap();
            assert_eq!(container.format, expected);
            assert_eq!(container.levels[0].byte_length, 16);
        }
    }

    #[test]
    fn parses_a_single_mip_bc1_texture() {
        let container = parse_dds(&build_dds(compressed_options(4, 4, four_cc(b"DXT1")))).unwrap();
        assert_eq!(container.format, TextureContainerFormat::Bc1);
        assert_eq!(
            (container.width, container.height, container.mip_levels),
            (4, 4, 1)
        );
        assert_eq!((container.faces, container.layers), (1, 1));
        assert_eq!(
            container.supercompression,
            TextureContainerSupercompression::None
        );
        assert_eq!(
            container.levels,
            [TextureContainerLevel {
                byte_length: 8,
                byte_offset: 128,
                height: 4,
                width: 4
            }]
        );
    }

    #[test]
    fn reads_a_dx10_extension_header_and_its_dxgi_format() {
        let mut options = compressed_options(4, 4, four_cc(b"DX10"));
        options.dx10 = Some(Dx10Options {
            dxgi_format: 98,
            misc_flag: 0,
            array_size: 1,
        });
        let container = parse_dds(&build_dds(options)).unwrap();
        assert_eq!(container.format, TextureContainerFormat::Bc7);
        assert_eq!(container.levels[0].byte_offset, 148);
    }

    #[test]
    fn reports_six_faces_for_a_cubemap() {
        let mut options = compressed_options(4, 4, four_cc(b"DXT5"));
        options.caps2 = 0x200;
        options.data_bytes = 96;
        let container = parse_dds(&build_dds(options)).unwrap();
        assert_eq!(container.faces, 6);
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.byte_length)
                .collect::<Vec<_>>(),
            [16; 6]
        );
        assert_eq!(
            container
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [128, 144, 160, 176, 192, 208]
        );
    }

    #[test]
    fn returns_none_for_non_dds_truncated_unknown_or_volume_data() {
        assert_eq!(parse_dds(&[0xab, 0x4b, 0x54, 0x58]), None);
        assert_eq!(parse_dds(b"DDS \0\0\0\0"), None);
        assert_eq!(
            parse_dds(&build_dds(compressed_options(4, 4, four_cc(b"ZZZZ")))),
            None
        );
        let mut volume = compressed_options(4, 4, four_cc(b"DXT1"));
        volume.caps2 = 0x20_0000;
        assert_eq!(parse_dds(&build_dds(volume)), None);
    }
}
