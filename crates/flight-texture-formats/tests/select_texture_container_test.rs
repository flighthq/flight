use flight_texture_formats::*;

fn container(format: TextureContainerFormat) -> TextureContainer {
    return TextureContainer {
        depth: 1,
        faces: 1,
        format,
        height: 4,
        layers: 1,
        levels: vec![TextureContainerLevel {
            byte_length: 8,
            byte_offset: 0,
            height: 4,
            width: 4,
        }],
        mip_levels: 1,
        supercompression: TextureContainerSupercompression::None,
        width: 4,
    };
}

mod select_texture_container {
    use super::*;

    #[test]
    fn returns_none_for_an_empty_container_set() {
        assert_eq!(
            select_texture_container(&[], &[TextureContainerFormat::Bc3]),
            None
        );
    }

    #[test]
    fn returns_none_when_no_peer_format_is_supported() {
        let peers = [
            container(TextureContainerFormat::Pvrtc4bppRgb),
            container(TextureContainerFormat::Etc1),
        ];
        assert_eq!(
            select_texture_container(
                &peers,
                &[TextureContainerFormat::Bc3, TextureContainerFormat::Astc4x4]
            ),
            None
        );
    }

    #[test]
    fn returns_the_first_container_whose_format_is_supported() {
        let peers = [
            container(TextureContainerFormat::Pvrtc4bppRgb),
            container(TextureContainerFormat::Etc1),
            container(TextureContainerFormat::Bc3),
        ];
        let chosen = select_texture_container(
            &peers,
            &[TextureContainerFormat::Bc3, TextureContainerFormat::Etc1],
        )
        .unwrap();
        assert!(std::ptr::eq(chosen, &peers[1]));
    }
}
