use flight_texture_formats::*;

mod compute_texture_container_levels {
    use super::*;

    #[test]
    fn builds_a_contiguous_mip_chain_with_descending_dimensions_and_offsets() {
        let result =
            compute_texture_container_levels(TextureContainerFormat::Bc1, 8, 8, 4, 1, 1, 100)
                .unwrap();
        assert_eq!(
            result
                .levels
                .iter()
                .map(|level| level.width)
                .collect::<Vec<_>>(),
            [8, 4, 2, 1]
        );
        assert_eq!(
            result
                .levels
                .iter()
                .map(|level| level.byte_length)
                .collect::<Vec<_>>(),
            [32, 8, 8, 8]
        );
        assert_eq!(
            result
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [100, 132, 140, 148]
        );
        assert_eq!(result.end_offset, 156);
    }

    #[test]
    fn nests_layer_face_mip_so_each_face_holds_a_full_mip_chain() {
        let result =
            compute_texture_container_levels(TextureContainerFormat::Bc3, 4, 4, 1, 1, 6, 0)
                .unwrap();
        assert_eq!(result.levels.len(), 6);
        assert_eq!(
            result
                .levels
                .iter()
                .map(|level| level.byte_offset)
                .collect::<Vec<_>>(),
            [0, 16, 32, 48, 64, 80]
        );
    }

    #[test]
    fn returns_none_for_a_format_without_a_fixed_block_size() {
        assert_eq!(
            compute_texture_container_levels(TextureContainerFormat::Etc1s, 4, 4, 1, 1, 1, 0),
            None
        );
    }
}

mod get_texture_container_level_byte_length {
    use super::*;

    #[test]
    fn multiplies_bytes_per_pixel_for_uncompressed_formats() {
        assert_eq!(
            get_texture_container_level_byte_length(TextureContainerFormat::Rgba8Unorm, 4, 4),
            64
        );
        assert_eq!(
            get_texture_container_level_byte_length(TextureContainerFormat::R8Unorm, 4, 4),
            16
        );
    }

    #[test]
    fn returns_minus_one_for_a_variable_rate_format() {
        assert_eq!(
            get_texture_container_level_byte_length(TextureContainerFormat::Etc1s, 4, 4),
            -1
        );
    }

    #[test]
    fn rounds_up_to_whole_blocks_for_block_compressed_formats() {
        assert_eq!(
            get_texture_container_level_byte_length(TextureContainerFormat::Bc1, 4, 4),
            8
        );
        assert_eq!(
            get_texture_container_level_byte_length(TextureContainerFormat::Bc7, 5, 5),
            64
        );
        assert_eq!(
            get_texture_container_level_byte_length(TextureContainerFormat::Astc6x6, 6, 6),
            16
        );
    }
}
