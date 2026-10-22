//! D18 Rust conveniences for the texture public lane. Every method delegates to a public free
//! function; sampling, source identity and dirty-version behavior remain in the contract layer.

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_entity::allocate_entity;

    use super::*;

    fn source() -> TextureSourceRef {
        let mut value: VoxelGrid = allocate_entity();
        value.kind = "acme.source".to_string();
        value.width = 20;
        value.height = 10;
        return Arc::new(RwLock::new(value));
    }

    fn texture() -> Texture2D {
        let mut texture = create_texture_2d();
        texture.source = Some(source());
        return texture;
    }

    #[test]
    fn alpha_type_parse_matches_free_function() {
        assert_eq!(AlphaType::parse("opaque"), parse_alpha_type("opaque"));
    }

    #[test]
    fn alpha_type_to_str_matches_free_function() {
        assert_eq!(
            AlphaType::Straight.to_str(),
            get_alpha_type_string(AlphaType::Straight)
        );
    }

    #[test]
    fn cube_texture_clone_matches_free_function() {
        let cube = create_cube_texture();
        assert!(equals_cube_texture(
            Some(&cube.clone_cube_texture()),
            Some(&clone_cube_texture(&cube)),
        ));
    }

    #[test]
    fn cube_texture_copy_from_matches_free_function() {
        let source = create_cube_texture();
        let mut method = create_cube_texture();
        let mut free = create_cube_texture();
        method.copy_from(&source);
        copy_cube_texture(&mut free, &source);
        assert!(equals_cube_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn cube_texture_equals_matches_free_function() {
        let a = create_cube_texture();
        let b = create_cube_texture();
        assert_eq!(a.equals(Some(&b)), equals_cube_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn cube_texture_face_size_matches_free_function() {
        let cube = create_cube_texture();
        assert_eq!(cube.face_size(), get_cube_texture_face_size(&cube));
    }

    #[test]
    fn cube_texture_is_complete_matches_free_function() {
        let cube = create_cube_texture();
        assert_eq!(cube.is_complete(), is_cube_texture_complete(&cube));
    }

    #[test]
    fn cube_texture_new_matches_free_function() {
        assert!(equals_cube_texture(
            Some(&CubeTexture::new()),
            Some(&create_cube_texture()),
        ));
    }

    #[test]
    fn cube_texture_set_face_matches_free_function() {
        let mut method = create_cube_texture();
        let mut free = create_cube_texture();
        let source = source();
        method.set_face(CUBE_FACE_POSITIVE_X, Some(source.clone()));
        set_cube_texture_face(&mut free, CUBE_FACE_POSITIVE_X, Some(source));
        assert!(equals_cube_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn pixel_format_parse_matches_free_function() {
        assert_eq!(
            PixelFormat::parse("rgba8unorm"),
            parse_pixel_format("rgba8unorm")
        );
    }

    #[test]
    fn pixel_format_to_str_matches_free_function() {
        assert_eq!(
            PixelFormat::Bgra8Unorm.to_str(),
            get_pixel_format_string(PixelFormat::Bgra8Unorm)
        );
    }

    #[test]
    fn render_target_color_space_parse_matches_free_function() {
        assert_eq!(
            RenderTargetColorSpace::parse("linear"),
            parse_render_target_color_space("linear"),
        );
    }

    #[test]
    fn render_target_color_space_to_str_matches_free_function() {
        assert_eq!(
            RenderTargetColorSpace::Srgb.to_str(),
            get_render_target_color_space_string(RenderTargetColorSpace::Srgb),
        );
    }

    #[test]
    fn sampler_anisotropic_matches_free_function() {
        assert!(equals_sampler(
            Some(&Sampler::anisotropic(8.0)),
            Some(&create_anisotropic_sampler(8.0)),
        ));
    }

    #[test]
    fn sampler_clamp_linear_matches_free_function() {
        assert!(equals_sampler(
            Some(&Sampler::clamp_linear()),
            Some(&create_clamp_linear_sampler()),
        ));
    }

    #[test]
    fn sampler_clone_matches_free_function() {
        let sampler = create_anisotropic_sampler(4.0);
        assert!(equals_sampler(
            Some(&sampler.clone_sampler()),
            Some(&clone_sampler(&sampler)),
        ));
    }

    #[test]
    fn sampler_copy_from_matches_free_function() {
        let source = create_anisotropic_sampler(4.0);
        let mut method = create_sampler();
        let mut free = create_sampler();
        method.copy_from(&source);
        copy_sampler(&mut free, &source);
        assert!(equals_sampler(Some(&method), Some(&free)));
    }

    #[test]
    fn sampler_equals_matches_free_function() {
        let a = create_sampler();
        let b = create_sampler();
        assert_eq!(a.equals(Some(&b)), equals_sampler(Some(&a), Some(&b)));
    }

    #[test]
    fn sampler_new_matches_free_function() {
        assert!(equals_sampler(
            Some(&Sampler::new()),
            Some(&create_sampler())
        ));
    }

    #[test]
    fn sampler_pixel_art_matches_free_function() {
        assert!(equals_sampler(
            Some(&Sampler::pixel_art()),
            Some(&create_pixel_art_sampler()),
        ));
    }

    #[test]
    fn sampler_tiling_matches_free_function() {
        assert!(equals_sampler(
            Some(&Sampler::tiling()),
            Some(&create_tiling_sampler())
        ));
    }

    #[test]
    fn texture_2d_new_matches_free_function() {
        assert!(equals_texture(
            Some(&Texture2D::new()),
            Some(&create_texture_2d()),
        ));
    }

    #[test]
    fn texture_clone_matches_free_function() {
        let texture = texture();
        assert!(equals_texture(
            Some(&texture.clone_texture()),
            Some(&clone_texture(&texture)),
        ));
    }

    #[test]
    fn texture_color_space_parse_matches_free_function() {
        assert_eq!(
            TextureColorSpace::parse("srgb"),
            parse_texture_color_space("srgb")
        );
    }

    #[test]
    fn texture_color_space_to_str_matches_free_function() {
        assert_eq!(
            TextureColorSpace::Linear.to_str(),
            get_texture_color_space_string(TextureColorSpace::Linear),
        );
    }

    #[test]
    fn texture_copy_from_matches_free_function() {
        let source = texture();
        let mut method = create_texture_2d();
        let mut free = create_texture_2d();
        method.copy_from_texture(&source);
        copy_texture(&mut free, &source);
        assert!(equals_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn texture_dimension_parse_matches_free_function() {
        assert_eq!(
            TextureDimension::parse("cube"),
            parse_texture_dimension("cube")
        );
    }

    #[test]
    fn texture_dimension_to_str_matches_free_function() {
        assert_eq!(
            TextureDimension::Texture3D.to_str(),
            get_texture_dimension_string(TextureDimension::Texture3D),
        );
    }

    #[test]
    fn texture_equals_matches_free_function() {
        let a = texture();
        let b = clone_texture(&a);
        assert_eq!(
            a.equals_texture(Some(&b)),
            equals_texture(Some(&a), Some(&b))
        );
    }

    #[test]
    fn texture_filter_parse_matches_free_function() {
        assert_eq!(
            TextureFilter::parse("nearest"),
            parse_texture_filter("nearest")
        );
    }

    #[test]
    fn texture_filter_to_str_matches_free_function() {
        assert_eq!(
            TextureFilter::LinearMipmapLinear.to_str(),
            get_texture_filter_string(TextureFilter::LinearMipmapLinear),
        );
    }

    #[test]
    fn texture_gamut_parse_matches_free_function() {
        assert_eq!(
            TextureGamut::parse("display-p3"),
            parse_texture_gamut("display-p3")
        );
    }

    #[test]
    fn texture_gamut_to_str_matches_free_function() {
        assert_eq!(
            TextureGamut::Srgb.to_str(),
            get_texture_gamut_string(TextureGamut::Srgb)
        );
    }

    #[test]
    fn texture_has_source_matches_free_function() {
        let texture = texture();
        assert_eq!(texture.has_source(), has_texture_source(&texture));
    }

    #[test]
    fn texture_has_uv_transform_matches_free_function() {
        let texture = texture();
        assert_eq!(
            texture.has_uv_transform(),
            has_texture_uv_transform(&texture)
        );
    }

    #[test]
    fn texture_height_matches_free_function() {
        let texture = texture();
        assert_eq!(texture.height(), get_texture_height(&texture));
    }

    #[test]
    fn texture_is_ready_matches_free_function() {
        let texture = texture();
        assert_eq!(texture.is_ready(), is_texture_ready(&texture));
    }

    #[test]
    fn texture_new_matches_free_function() {
        assert!(equals_texture(
            Some(&Texture::new(None)),
            Some(&create_texture(None))
        ));
    }

    #[test]
    fn texture_reset_uv_transform_matches_free_function() {
        let mut method = texture();
        let mut free = clone_texture(&method);
        method.set_uv_scale(2.0, 3.0);
        set_texture_uv_scale(&mut free, 2.0, 3.0);
        method.reset_uv_transform();
        reset_texture_uv_transform(&mut free);
        assert!(equals_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn texture_set_flip_matches_free_function() {
        let mut method = texture();
        let mut free = clone_texture(&method);
        method.set_flip(true, false);
        set_texture_flip(&mut free, true, false);
        assert!(equals_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn texture_set_source_matches_free_function() {
        let mut method = create_texture_2d();
        let mut free = create_texture_2d();
        let source = source();
        method.set_source(Some(source.clone()));
        set_texture_source(&mut free, Some(source));
        assert!(equals_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn texture_set_uv_from_pixel_rect_matches_free_function() {
        let mut method = texture();
        let mut free = clone_texture(&method);
        method.set_uv_from_pixel_rect(2.0, 3.0, 4.0, 5.0);
        set_texture_uv_from_pixel_rect(&mut free, 2.0, 3.0, 4.0, 5.0);
        assert!(equals_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn texture_set_uv_offset_matches_free_function() {
        let mut method = texture();
        let mut free = clone_texture(&method);
        method.set_uv_offset(0.2, 0.3);
        set_texture_uv_offset(&mut free, 0.2, 0.3);
        assert!(equals_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn texture_set_uv_rotation_matches_free_function() {
        let mut method = texture();
        let mut free = clone_texture(&method);
        method.set_uv_rotation(0.4);
        set_texture_uv_rotation(&mut free, 0.4);
        assert!(equals_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn texture_set_uv_scale_matches_free_function() {
        let mut method = texture();
        let mut free = clone_texture(&method);
        method.set_uv_scale(2.0, 3.0);
        set_texture_uv_scale(&mut free, 2.0, 3.0);
        assert!(equals_texture(Some(&method), Some(&free)));
    }

    #[test]
    fn texture_source_kind_matches_free_function() {
        let texture = texture();
        assert_eq!(texture.source_kind(), get_texture_source_kind(&texture));
    }

    #[test]
    fn texture_source_matches_free_function() {
        let texture = texture();
        assert!(Arc::ptr_eq(
            &texture.texture_source().unwrap(),
            &get_texture_source(&texture).unwrap(),
        ));
    }

    #[test]
    fn texture_width_matches_free_function() {
        let texture = texture();
        assert_eq!(texture.width(), get_texture_width(&texture));
    }

    #[test]
    fn texture_wrap_parse_matches_free_function() {
        assert_eq!(TextureWrap::parse("repeat"), parse_texture_wrap("repeat"));
    }

    #[test]
    fn texture_wrap_to_str_matches_free_function() {
        assert_eq!(
            TextureWrap::MirrorRepeat.to_str(),
            get_texture_wrap_string(TextureWrap::MirrorRepeat)
        );
    }

    #[test]
    fn voxel_grid_invalidate_matches_free_function() {
        let mut method: VoxelGrid = allocate_entity();
        let mut free: VoxelGrid = allocate_entity();
        method.invalidate();
        invalidate_voxel_grid(&mut free);
        assert_eq!(method.version, free.version);
    }
}

pub trait TextureExt: TextureVariant + Sized {
    fn clone_texture(&self) -> Texture {
        return clone_texture(self);
    }

    fn copy_from_texture(&mut self, source: &dyn TextureVariant) {
        return copy_texture(self, source);
    }

    fn equals_texture(&self, other: Option<&dyn TextureVariant>) -> bool {
        return equals_texture(Some(self), other);
    }

    fn has_source(&self) -> bool {
        return has_texture_source(self);
    }

    fn has_uv_transform(&self) -> bool {
        return has_texture_uv_transform(self);
    }

    fn height(&self) -> i32 {
        return get_texture_height(self);
    }

    fn is_ready(&self) -> bool {
        return is_texture_ready(self);
    }

    fn reset_uv_transform(&mut self) {
        return reset_texture_uv_transform(self);
    }

    fn set_flip(&mut self, flip_x: bool, flip_y: bool) {
        return set_texture_flip(self, flip_x, flip_y);
    }

    fn set_source(&mut self, source: Option<TextureSourceRef>) {
        return set_texture_source(self, source);
    }

    fn set_uv_from_pixel_rect(&mut self, x: f32, y: f32, width: f32, height: f32) {
        return set_texture_uv_from_pixel_rect(self, x, y, width, height);
    }

    fn set_uv_offset(&mut self, x: f32, y: f32) {
        return set_texture_uv_offset(self, x, y);
    }

    fn set_uv_rotation(&mut self, radians: f32) {
        return set_texture_uv_rotation(self, radians);
    }

    fn set_uv_scale(&mut self, x: f32, y: f32) {
        return set_texture_uv_scale(self, x, y);
    }

    fn source_kind(&self) -> Option<TextureSourceKind> {
        return get_texture_source_kind(self);
    }

    fn texture_source(&self) -> Option<TextureSourceRef> {
        return get_texture_source(self);
    }

    fn width(&self) -> i32 {
        return get_texture_width(self);
    }
}

impl<T: TextureVariant> TextureExt for T {}

impl AlphaType {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_alpha_type(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_alpha_type_string(self);
    }
}

impl CubeTexture {
    pub fn new() -> Self {
        return create_cube_texture();
    }

    pub fn clone_cube_texture(&self) -> Self {
        return clone_cube_texture(self);
    }

    pub fn copy_from(&mut self, source: &Self) {
        return copy_cube_texture(self, source);
    }

    pub fn equals(&self, other: Option<&Self>) -> bool {
        return equals_cube_texture(Some(self), other);
    }

    pub fn face_size(&self) -> i32 {
        return get_cube_texture_face_size(self);
    }

    pub fn is_complete(&self) -> bool {
        return is_cube_texture_complete(self);
    }

    pub fn set_face(&mut self, face_index: usize, source: Option<TextureSourceRef>) {
        return set_cube_texture_face(self, face_index, source);
    }
}

impl PixelFormat {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_pixel_format(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_pixel_format_string(self);
    }
}

impl RenderTargetColorSpace {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_render_target_color_space(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_render_target_color_space_string(self);
    }
}

impl Sampler {
    pub fn new() -> Self {
        return create_sampler();
    }

    pub fn anisotropic(level: f32) -> Self {
        return create_anisotropic_sampler(level);
    }

    pub fn clamp_linear() -> Self {
        return create_clamp_linear_sampler();
    }

    pub fn clone_sampler(&self) -> Self {
        return clone_sampler(self);
    }

    pub fn copy_from(&mut self, source: &Self) {
        return copy_sampler(self, source);
    }

    pub fn equals(&self, other: Option<&Self>) -> bool {
        return equals_sampler(Some(self), other);
    }

    pub fn pixel_art() -> Self {
        return create_pixel_art_sampler();
    }

    pub fn tiling() -> Self {
        return create_tiling_sampler();
    }
}

impl Texture {
    pub fn new(opts: Option<&CreateTextureOptions>) -> Self {
        return create_texture(opts);
    }
}

impl Texture2D {
    pub fn new() -> Self {
        return create_texture_2d();
    }
}

impl TextureColorSpace {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_texture_color_space(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_texture_color_space_string(self);
    }
}

impl TextureDimension {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_texture_dimension(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_texture_dimension_string(self);
    }
}

impl TextureFilter {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_texture_filter(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_texture_filter_string(self);
    }
}

impl TextureGamut {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_texture_gamut(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_texture_gamut_string(self);
    }
}

impl TextureWrap {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_texture_wrap(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_texture_wrap_string(self);
    }
}

impl VoxelGrid {
    pub fn invalidate(&mut self) {
        return invalidate_voxel_grid(self);
    }
}
