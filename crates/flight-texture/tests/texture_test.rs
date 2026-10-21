use std::sync::Arc;

use flight_geometry::{create_matrix3, create_vector2, inverse_matrix3};
use flight_texture::contract::*;

use crate::{source, voxel_grid};

fn common_options() -> CreateTextureCommonOptions {
    return CreateTextureCommonOptions {
        color_space: None,
        flip_x: None,
        flip_y: None,
        sampler: None,
        uv_offset: None,
        uv_rotation: None,
        uv_scale: None,
        version: None,
    };
}

fn texture_2d(source: Option<TextureSourceRef>) -> Texture2D {
    return create_texture_2d(Some(&CreateTexture2DOptions {
        common: common_options(),
        source,
    }));
}

fn multiply_uv(matrix: &flight_geometry::Matrix3, u: f32, v: f32) -> (f32, f32) {
    return (
        matrix.m[0] * u + matrix.m[3] * v + matrix.m[6],
        matrix.m[1] * u + matrix.m[4] * v + matrix.m[7],
    );
}

mod clone_texture {
    use super::*;

    #[test]
    fn shares_sources_but_deep_clones_sampler_vectors_and_lists() {
        let active = source("image", 32, 64);
        let mut common = common_options();
        common.color_space = Some(TextureColorSpace::Linear);
        common.sampler = Some(create_anisotropic_sampler(8.0));
        common.uv_offset = Some(create_vector2(0.25, 0.5));
        common.uv_scale = Some(create_vector2(2.0, 3.0));
        let source_texture = create_texture(Some(&CreateTextureOptions::Texture2DArray(
            CreateTexture2DArrayOptions {
                common,
                sources: Some(vec![None, Some(active.clone())]),
            },
        )));
        let copy = clone_texture(&source_texture);
        assert!(equals_texture(Some(&source_texture), Some(&copy)));
        assert!(Arc::ptr_eq(&get_texture_source(&copy).unwrap(), &active));
        match (&source_texture, &copy) {
            (Texture::Texture2DArray(a), Texture::Texture2DArray(b)) => {
                assert_eq!(a.sources.len(), b.sources.len());
                assert!(!std::ptr::eq(a.sources.as_ptr(), b.sources.as_ptr()));
                assert!(!std::ptr::eq(&a.sampler, &b.sampler));
                assert!(!std::ptr::eq(&a.uv_offset, &b.uv_offset));
            }
            _ => panic!("expected array textures"),
        }
    }
}

mod copy_texture {
    use super::*;

    #[test]
    fn preserves_out_subentity_storage_and_refuses_dimension_changes() {
        let active = source("image", 32, 64);
        let mut common = common_options();
        common.color_space = Some(TextureColorSpace::Linear);
        common.sampler = Some(create_anisotropic_sampler(8.0));
        common.uv_rotation = Some(0.75);
        common.uv_scale = Some(create_vector2(4.0, 5.0));
        let source_texture = create_texture_2d(Some(&CreateTexture2DOptions {
            common,
            source: Some(active),
        }));
        let mut out = create_texture_2d(None);
        let sampler_address = std::ptr::from_ref(&out.sampler);
        let offset_address = std::ptr::from_ref(&out.uv_offset);
        copy_texture(&mut out, &source_texture);
        assert!(equals_texture(Some(&out), Some(&source_texture)));
        assert_eq!(std::ptr::from_ref(&out.sampler), sampler_address);
        assert_eq!(std::ptr::from_ref(&out.uv_offset), offset_address);

        let cube = create_cube_texture(None);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            copy_texture(&mut out, &cube);
        }));
        assert!(result.is_err());
        assert_eq!(out.dimension(), TextureDimension::Texture2D);
    }
}

mod create_texture {
    use super::*;

    #[test]
    fn creates_exact_closed_variants_with_dimension_specific_sources() {
        let default_texture = create_texture(None);
        match default_texture {
            Texture::Texture2D(texture) => {
                assert!(texture.source.is_none());
                assert_eq!(texture.color_space, TextureColorSpace::Srgb);
                assert_eq!(texture.version, 0);
                assert_eq!(texture.uv_offset, create_vector2(0.0, 0.0));
                assert_eq!(texture.uv_scale, create_vector2(1.0, 1.0));
            }
            _ => panic!("default must be 2d"),
        }

        let grid = voxel_grid(8, 9, 10);
        let texture = create_texture(Some(&CreateTextureOptions::Texture3D(
            CreateTexture3DOptions {
                common: common_options(),
                source: Some(grid.clone()),
            },
        )));
        match texture {
            Texture::Texture3D(texture) => {
                assert!(Arc::ptr_eq(texture.source.as_ref().unwrap(), &grid));
            }
            _ => panic!("expected 3d"),
        }
    }
}

mod create_texture_2d {
    use super::*;

    #[test]
    fn clones_supplied_sampling_state_and_uv_vectors() {
        let sampler = create_anisotropic_sampler(8.0);
        let offset = create_vector2(2.0, 3.0);
        let mut common = common_options();
        common.sampler = Some(sampler.clone());
        common.uv_offset = Some(offset.clone());
        common.version = Some(3);
        let texture = create_texture_2d(Some(&CreateTexture2DOptions {
            common,
            source: None,
        }));
        assert!(equals_sampler(Some(&texture.sampler), Some(&sampler)));
        assert!(!std::ptr::eq(&texture.sampler, &sampler));
        assert_eq!(texture.uv_offset, offset);
        assert!(!std::ptr::eq(&texture.uv_offset, &offset));
        assert_eq!(texture.version, 3);
    }
}

mod equals_texture {
    use super::*;

    #[test]
    fn compares_values_but_requires_exact_source_identity() {
        let active = source("image", 32, 64);
        let a = texture_2d(Some(active.clone()));
        let b = texture_2d(Some(active));
        assert!(equals_texture(Some(&a), Some(&b)));
        let same_values_different_identity = texture_2d(Some(source("image", 32, 64)));
        assert!(!equals_texture(
            Some(&a),
            Some(&same_values_different_identity)
        ));
        assert!(!equals_texture(Some(&a), None));
        assert!(!equals_texture(None, None));
    }
}

mod get_texture_height {
    use super::*;

    #[test]
    fn returns_source_height_or_negative_one() {
        assert_eq!(
            get_texture_height(&texture_2d(Some(source("image", 32, 64)))),
            64
        );
        assert_eq!(get_texture_height(&texture_2d(None)), -1);
    }
}

mod get_texture_inverse_uv_matrix {
    use super::*;

    #[test]
    fn matches_geometry_inversion_of_the_forward_matrix() {
        let mut texture = texture_2d(None);
        set_texture_uv_offset(&mut texture, 0.1, 0.2);
        set_texture_uv_rotation(&mut texture, std::f32::consts::PI / 6.0);
        set_texture_uv_scale(&mut texture, 2.0, 3.0);
        let mut expected = create_matrix3();
        get_texture_uv_matrix(&mut expected, &texture);
        let forward = expected.clone();
        inverse_matrix3(&mut expected, &forward);
        let mut out = create_matrix3();
        get_texture_inverse_uv_matrix(&mut out, &texture);
        assert_eq!(out.m, expected.m);
    }
}

mod get_texture_source {
    use super::*;

    #[test]
    fn returns_direct_or_first_bound_layer_and_preserves_identity() {
        let active = source("image", 32, 64);
        assert!(Arc::ptr_eq(
            &get_texture_source(&texture_2d(Some(active.clone()))).unwrap(),
            &active,
        ));
        let layered = create_texture(Some(&CreateTextureOptions::Texture2DArray(
            CreateTexture2DArrayOptions {
                common: common_options(),
                sources: Some(vec![None, Some(active.clone())]),
            },
        )));
        assert!(Arc::ptr_eq(&get_texture_source(&layered).unwrap(), &active));
        assert!(get_texture_source(&texture_2d(None)).is_none());
    }
}

mod get_texture_source_kind {
    use super::*;

    #[test]
    fn returns_the_open_registry_key_without_flattening_it() {
        let custom_kind = "acme.camera";
        let texture = texture_2d(Some(source(custom_kind, 1, 1)));
        assert_eq!(
            get_texture_source_kind(&texture).as_deref(),
            Some(custom_kind)
        );
        assert_eq!(get_texture_source_kind(&texture_2d(None)), None);
    }
}

mod get_texture_uv_matrix {
    use super::*;

    #[test]
    fn matches_inline_transform_for_flip_scale_rotation_and_offset() {
        let mut common = common_options();
        common.flip_x = Some(true);
        common.flip_y = Some(true);
        common.uv_offset = Some(create_vector2(0.1, 0.2));
        common.uv_rotation = Some(0.5);
        common.uv_scale = Some(create_vector2(2.0, 3.0));
        let texture = create_texture_2d(Some(&CreateTexture2DOptions {
            common,
            source: None,
        }));
        let mut matrix = create_matrix3();
        get_texture_uv_matrix(&mut matrix, &texture);
        let via_matrix = multiply_uv(&matrix, 0.35, 0.6);
        let mut via_inline = create_vector2(0.0, 0.0);
        transform_texture_uv(&mut via_inline, &texture, 0.35, 0.6);
        assert!((via_matrix.0 - via_inline.x).abs() < 1e-6);
        assert!((via_matrix.1 - via_inline.y).abs() < 1e-6);
    }
}

mod get_texture_view_size {
    use super::*;

    #[test]
    fn measures_rotated_scaled_axes_and_handles_unbound_sources() {
        let mut texture = texture_2d(Some(source("image", 100, 50)));
        set_texture_uv_scale(&mut texture, 0.3, 0.2);
        set_texture_uv_rotation(&mut texture, -std::f32::consts::FRAC_PI_2);
        let mut out = create_vector2(0.0, 0.0);
        get_texture_view_size(&mut out, &texture);
        assert!((out.x - 15.0).abs() < 1e-6);
        assert!((out.y - 20.0).abs() < 1e-6);
        get_texture_view_size(&mut out, &texture_2d(None));
        assert_eq!(out, create_vector2(0.0, 0.0));
    }
}

mod get_texture_width {
    use super::*;

    #[test]
    fn returns_source_width_or_negative_one() {
        assert_eq!(
            get_texture_width(&texture_2d(Some(source("image", 32, 64)))),
            32
        );
        assert_eq!(get_texture_width(&texture_2d(None)), -1);
    }
}

mod has_texture_source {
    use super::*;

    #[test]
    fn detects_open_sources_through_the_common_base() {
        assert!(has_texture_source(&texture_2d(Some(source(
            "custom", 1, 1
        )))));
        assert!(!has_texture_source(&texture_2d(None)));
    }
}

mod has_texture_uv_transform {
    use super::*;

    #[test]
    fn detects_every_non_identity_axis_and_returns_to_false_after_reset() {
        let mut texture = texture_2d(None);
        assert!(!has_texture_uv_transform(&texture));
        set_texture_flip(&mut texture, true, false);
        assert!(has_texture_uv_transform(&texture));
        reset_texture_uv_transform(&mut texture);
        set_texture_uv_offset(&mut texture, 0.25, 0.0);
        assert!(has_texture_uv_transform(&texture));
        reset_texture_uv_transform(&mut texture);
        set_texture_uv_rotation(&mut texture, 0.5);
        assert!(has_texture_uv_transform(&texture));
    }
}

mod initialize_texture_2d {
    use super::*;

    #[test]
    fn reinitializes_all_fields_and_fresh_sampling_state() {
        let active = source("image", 4, 8);
        let mut texture = texture_2d(None);
        let old_sampler_address = std::ptr::from_ref(&texture.sampler);
        let mut common = common_options();
        common.color_space = Some(TextureColorSpace::Linear);
        common.version = Some(9);
        initialize_texture_2d(
            &mut texture,
            Some(&CreateTexture2DOptions {
                common,
                source: Some(active.clone()),
            }),
        );
        assert_eq!(texture.color_space, TextureColorSpace::Linear);
        assert_eq!(texture.version, 9);
        assert!(Arc::ptr_eq(texture.source.as_ref().unwrap(), &active));
        assert_eq!(std::ptr::from_ref(&texture.sampler), old_sampler_address);
    }
}

mod is_texture_ready {
    use super::*;

    #[test]
    fn follows_source_binding() {
        let mut texture = texture_2d(None);
        assert!(!is_texture_ready(&texture));
        set_texture_source(&mut texture, Some(source("image", 1, 1)));
        assert!(is_texture_ready(&texture));
    }
}

mod reset_texture_uv_transform {
    use super::*;

    #[test]
    fn restores_identity_without_touching_source_sampler_or_version() {
        let active = source("image", 8, 8);
        let mut texture = texture_2d(Some(active.clone()));
        texture.version = 42;
        let sampler_address = std::ptr::from_ref(&texture.sampler);
        set_texture_flip(&mut texture, true, true);
        set_texture_uv_offset(&mut texture, 0.4, 0.6);
        set_texture_uv_rotation(&mut texture, std::f32::consts::PI);
        set_texture_uv_scale(&mut texture, 5.0, 7.0);
        reset_texture_uv_transform(&mut texture);
        assert!(!has_texture_uv_transform(&texture));
        assert_eq!(texture.version, 42);
        assert_eq!(std::ptr::from_ref(&texture.sampler), sampler_address);
        assert!(Arc::ptr_eq(texture.source.as_ref().unwrap(), &active));
    }
}

mod set_texture_flip {
    use super::*;

    #[test]
    fn changes_both_flags_in_place() {
        let mut texture = texture_2d(None);
        set_texture_flip(&mut texture, true, false);
        assert!(texture.flip_x);
        assert!(!texture.flip_y);
    }
}

mod set_texture_source {
    use super::*;

    #[test]
    fn binds_by_identity_skips_same_reference_and_wraps_u32_version() {
        let active = source("image", 32, 64);
        let mut texture = texture_2d(None);
        texture.version = u32::MAX;
        set_texture_source(&mut texture, Some(active.clone()));
        assert_eq!(texture.version, 0);
        set_texture_source(&mut texture, Some(active.clone()));
        assert_eq!(texture.version, 0);
        assert!(Arc::ptr_eq(texture.source.as_ref().unwrap(), &active));
        set_texture_source(&mut texture, None);
        assert_eq!(texture.version, 1);
    }
}

mod set_texture_uv_from_pixel_rect {
    use super::*;

    #[test]
    fn normalizes_pixels_and_uses_an_empty_window_without_dimensions() {
        let mut texture = texture_2d(Some(source("image", 200, 100)));
        set_texture_uv_from_pixel_rect(&mut texture, 20.0, 10.0, 50.0, 25.0);
        assert_eq!(texture.uv_offset, create_vector2(0.1, 0.1));
        assert_eq!(texture.uv_scale, create_vector2(0.25, 0.25));
        let mut empty = texture_2d(None);
        set_texture_uv_from_pixel_rect(&mut empty, 20.0, 10.0, 50.0, 25.0);
        assert_eq!(empty.uv_offset, create_vector2(0.0, 0.0));
        assert_eq!(empty.uv_scale, create_vector2(0.0, 0.0));
    }
}

mod set_texture_uv_offset {
    use super::*;

    #[test]
    fn updates_the_existing_vector_in_place() {
        let mut texture = texture_2d(None);
        let address = std::ptr::from_ref(&texture.uv_offset);
        set_texture_uv_offset(&mut texture, 0.3, 0.7);
        assert_eq!(texture.uv_offset, create_vector2(0.3, 0.7));
        assert_eq!(std::ptr::from_ref(&texture.uv_offset), address);
    }
}

mod set_texture_uv_rotation {
    use super::*;

    #[test]
    fn updates_rotation_in_place() {
        let mut texture = texture_2d(None);
        set_texture_uv_rotation(&mut texture, std::f32::consts::PI);
        assert_eq!(texture.uv_rotation, std::f32::consts::PI);
    }
}

mod set_texture_uv_scale {
    use super::*;

    #[test]
    fn updates_the_existing_vector_in_place() {
        let mut texture = texture_2d(None);
        let address = std::ptr::from_ref(&texture.uv_scale);
        set_texture_uv_scale(&mut texture, 4.0, 8.0);
        assert_eq!(texture.uv_scale, create_vector2(4.0, 8.0));
        assert_eq!(std::ptr::from_ref(&texture.uv_scale), address);
    }
}

mod transform_texture_uv {
    use super::*;

    #[test]
    fn applies_flip_then_scale_rotate_and_translate() {
        let mut texture = texture_2d(None);
        set_texture_flip(&mut texture, true, false);
        set_texture_uv_scale(&mut texture, 2.0, 3.0);
        set_texture_uv_offset(&mut texture, 0.1, 0.2);
        let mut out = create_vector2(0.0, 0.0);
        transform_texture_uv(&mut out, &texture, 0.25, 0.5);
        assert!((out.x - 1.6).abs() < 1e-6);
        assert!((out.y - 1.7).abs() < 1e-6);
    }
}
