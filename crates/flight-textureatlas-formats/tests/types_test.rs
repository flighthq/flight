use flight_textureatlas_formats::*;

mod get_texture_atlas_frame_tag_direction_string {
    use super::*;

    #[test]
    fn returns_every_exact_schema_literal() {
        assert_eq!(
            get_texture_atlas_frame_tag_direction_string(TextureAtlasFrameTagDirection::Forward),
            "forward"
        );
        assert_eq!(
            get_texture_atlas_frame_tag_direction_string(TextureAtlasFrameTagDirection::PingPong),
            "pingpong"
        );
        assert_eq!(
            get_texture_atlas_frame_tag_direction_string(
                TextureAtlasFrameTagDirection::PingPongReverse,
            ),
            "pingpong_reverse"
        );
        assert_eq!(
            get_texture_atlas_frame_tag_direction_string(TextureAtlasFrameTagDirection::Reverse),
            "reverse"
        );
    }
}

mod parse_texture_atlas_frame_tag_direction {
    use super::*;

    #[test]
    fn parses_only_the_exact_schema_literals() {
        assert_eq!(
            parse_texture_atlas_frame_tag_direction("forward"),
            Some(TextureAtlasFrameTagDirection::Forward)
        );
        assert_eq!(
            parse_texture_atlas_frame_tag_direction("pingpong"),
            Some(TextureAtlasFrameTagDirection::PingPong)
        );
        assert_eq!(
            parse_texture_atlas_frame_tag_direction("pingpong_reverse"),
            Some(TextureAtlasFrameTagDirection::PingPongReverse)
        );
        assert_eq!(
            parse_texture_atlas_frame_tag_direction("reverse"),
            Some(TextureAtlasFrameTagDirection::Reverse)
        );
        assert_eq!(parse_texture_atlas_frame_tag_direction("Forward"), None);
    }
}
