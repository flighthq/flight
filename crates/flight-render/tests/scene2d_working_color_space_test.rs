use flight_render::SCENE2D_WORKING_COLOR_SPACE;
use flight_texture::RenderTargetColorSpace;

mod scene2d_working_color_space {
    use super::*;

    #[test]
    fn scene2d_working_color_space_declares_encoded_pipeline() {
        assert_eq!(SCENE2D_WORKING_COLOR_SPACE, RenderTargetColorSpace::Srgb);
    }
}
